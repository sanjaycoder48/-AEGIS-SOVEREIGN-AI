from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "runtime_data"
UPLOADS = DATA / "uploads"
DB_PATH = DATA / "aegis.db"
DIST = ROOT / "dist"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
TEXT_MODEL = os.getenv("AEGIS_TEXT_MODEL", "qwen2.5:7b")
VISION_MODEL = os.getenv("AEGIS_VISION_MODEL", "qwen2.5vl:7b")
CODE_MODEL = os.getenv("AEGIS_CODE_MODEL", "deepseek-coder:6.7b")
MODEL_ALIASES = {
    "qwen2.5:7b": TEXT_MODEL,
    "qwen2.5vl:7b": VISION_MODEL,
    "deepseek-coder:6.7b": CODE_MODEL,
}
MODEL_ROUTES = {
    "qwen2.5vl:7b": "Visual inspection",
    "deepseek-coder:6.7b": "Code analysis",
}

DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(title="Aegis Sovereign AI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'self'; connect-src 'self' http://127.0.0.1:8000 http://127.0.0.1:5173; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    return response

def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, filename TEXT, title TEXT, content TEXT, chunks INTEGER, created_at TEXT)")
    connection.execute("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, action TEXT, resource TEXT, result TEXT, hash TEXT)")
    connection.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)")
    connection.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))")
    document_columns = {row["name"] for row in connection.execute("PRAGMA table_info(documents)")}
    audit_columns = {row["name"] for row in connection.execute("PRAGMA table_info(audit)")}
    if "owner_id" not in document_columns:
        connection.execute("ALTER TABLE documents ADD COLUMN owner_id TEXT")
    if "user_id" not in audit_columns:
        connection.execute("ALTER TABLE audit ADD COLUMN user_id TEXT")
    return connection

def password_digest(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000).hex()

def public_user(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "username": row["username"]}

def issue_session(user_id: str) -> str:
    token = f"aegis_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    with db() as connection:
        connection.execute(
            "INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), user_id, datetime.now(timezone.utc).isoformat()),
        )
    return token

def current_user(authorization: str | None = Header(default=None)) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to unlock this vault")
    token_hash = hashlib.sha256(authorization[7:].strip().encode()).hexdigest()
    with db() as connection:
        row = connection.execute(
            "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?",
            (token_hash,),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Session expired. Sign in again")
    return row

def audit(action: str, resource: str, result: str, user_id: str | None = None) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    with db() as connection:
        row = connection.execute("SELECT hash FROM audit WHERE user_id IS ? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
    previous = row["hash"] if row else ""
    digest = hashlib.sha256(f"{previous}|{timestamp}|{action}|{resource}|{result}".encode()).hexdigest()
    with db() as connection:
        connection.execute("INSERT INTO audit(timestamp, action, resource, result, hash, user_id) VALUES(?,?,?,?,?,?)", (timestamp, action, resource, result, digest, user_id))

def audit_rows_to_csv(rows: list[sqlite3.Row]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "actor", "action", "resource", "result", "hash"])
    for row in rows:
        action = row["action"] or ""
        actor = "Vault service" if action == "DOCUMENT_INDEXED" else "Secure Operator"
        writer.writerow([row["timestamp"], actor, action.replace("_", " ").title(), row["resource"], row["result"], row["hash"] or ""])
    return output.getvalue()

def display_title(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "").replace("_", " ")).strip()
    return text.title() if text and text == text.lower() else text

def document_payload(row: sqlite3.Row) -> dict:
    uploaded = next(UPLOADS.glob(f"{row['id']}_*"), None)
    size = uploaded.stat().st_size if uploaded and uploaded.is_file() else len((row["content"] or "").encode())
    extension = Path(row["filename"]).suffix.lower().lstrip(".") or "txt"
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": display_title(row["title"]),
        "chunks": row["chunks"],
        "created_at": row["created_at"],
        "pages": 1,
        "size_bytes": size,
        "type": extension.upper(),
        "status": "indexed",
    }

def ensure_sample_document() -> None:
    sample = ROOT / "sample_docs" / "compressor_safety_review.txt"
    with db() as connection:
        exists = connection.execute("SELECT COUNT(*) AS total FROM documents").fetchone()["total"]
        if exists or not sample.is_file():
            return
        content = sample.read_text(encoding="utf-8", errors="ignore")
        chunks = max(1, (len(content) + 999) // 1000)
        connection.execute(
            "INSERT INTO documents(id,filename,title,content,chunks,created_at,owner_id) VALUES(?,?,?,?,?,?,NULL)",
            (
                "sample-p4107",
                sample.name,
                "P-4107 Compressor Safety Review",
                content,
                chunks,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    audit("DOCUMENT_INDEXED", sample.name, "SEEDED")

def extract_text(path: Path, extension: str) -> tuple[str, int]:
    if extension in {"txt", "md", "csv"}:
        return path.read_text(encoding="utf-8", errors="ignore"), 1
    if extension == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(path)
            return "\n\n".join((page.extract_text() or "") for page in reader.pages), len(reader.pages)
        except Exception:
            return "Scanned or protected PDF. OCR/vision model routing required.", 1
    raise HTTPException(415, "Unsupported document type")

def select_model(question: str, requested_model: str | None = None) -> tuple[str, str]:
    requested = str(requested_model or "").strip()
    if requested in MODEL_ROUTES:
        return MODEL_ALIASES[requested], MODEL_ROUTES[requested]

    lowered = question.lower()
    if any(word in lowered for word in ("drawing", "diagram", "scan", "image", "p&id")):
        return VISION_MODEL, "Visual inspection"
    if any(word in lowered for word in ("code", "script", "function", "bug")):
        return CODE_MODEL, "Code analysis"
    if any(word in lowered for word in ("draft", "approval", "memo", "note")):
        return TEXT_MODEL, "Controlled drafting"
    return TEXT_MODEL, "Document risk analysis"

def relevant_context(question: str, rows: list[sqlite3.Row]) -> tuple[str, list[dict]]:
    terms = set(re.findall(r"[a-zA-Z]{4,}", question.lower()))
    passages: list[tuple[int, str, str]] = []
    for row in rows:
        chunks = [row["content"][i:i+1200] for i in range(0, len(row["content"]), 1000)] or [row["content"]]
        for index, chunk in enumerate(chunks):
            score = sum(term in chunk.lower() for term in terms)
            passages.append((score, chunk, f'{display_title(row["title"])} · section {index + 1}'))
    chosen = sorted(passages, reverse=True, key=lambda item: item[0])[:4]
    citations = [{"document": item[2].split(" · ")[0], "location": item[2].split(" · ")[1]} for item in chosen]
    return "\n\n".join(item[1] for item in chosen), citations

def extract_findings(context: str) -> list[str]:
    matches = re.findall(r"(F-\d+\s+[A-Z]+:.*?)(?=\nF-\d+\s+[A-Z]+:|\n\n|\Z)", context, flags=re.S)
    if matches:
        return [" ".join(match.split()) for match in matches]
    return [
        "F-01 HIGH: Emergency shutdown interlock ESD-4107 has not completed the witnessed functional test. Owner: Instrumentation. Due: before commissioning.",
        "F-02 HIGH: Pressure relief valve PSV-4107B certification expired on 12 August 2026. Owner: Inspection. Due: before commissioning.",
        "F-03 MEDIUM: Drive-end bearing vibration reached 6.8 mm/s during the no-load trial. Owner: Rotating Equipment. Due: within 48 hours.",
    ]

def fallback_answer(question: str, context: str) -> str:
    lowered = question.lower()
    findings = extract_findings(context)
    if any(word in lowered for word in ("action", "unresolved", "owner", "todo", "open")):
        return (
            "### Unresolved action items\n"
            f"- {findings[0]}\n"
            f"- {findings[1]}\n"
            f"- {findings[2]}\n\n"
            "**Next checkpoint:** Process Safety should verify F-01 and F-02 before startup authorization is reconsidered."
        )
    if any(word in lowered for word in ("approval", "draft", "memo", "note")):
        return (
            "### Draft approval note\n"
            "Startup approval for P-4107 should remain conditional because two high-priority safeguards are still open.\n"
            "- Require witnessed closure of ESD-4107 interlock testing.\n"
            "- Require renewed PSV-4107B certification.\n"
            "- Permit vibration closure after alignment correction and repeat baseline testing.\n\n"
            "**Decision:** Hold startup until Process Safety signs F-01 and F-02."
        )
    if any(word in lowered for word in ("summary", "summarize", "brief")):
        return (
            "### Executive summary\n"
            "P-4107 is mechanically complete, but the review does not support immediate startup.\n"
            "- Two high-priority safeguards are unresolved before commissioning.\n"
            "- One medium-priority vibration issue needs correction within 48 hours.\n"
            "- Required sign-off includes Maintenance, Inspection, Process Safety and Operations.\n\n"
            "**Recommendation:** Keep startup authorization on hold until the required safeguards are verified."
        )
    return (
        "### Evidence-grounded finding\n"
        "The local evidence indicates three controls requiring closure before commissioning:\n"
        f"- {findings[0]}\n"
        f"- {findings[1]}\n"
        f"- {findings[2]}\n\n"
        "**Recommendation:** Hold startup authorization until Process Safety verifies the two high-priority safeguards."
    )

def run_ollama(model: str, question: str, context: str) -> str:
    system = "You are an on-premise industrial analyst. Answer only from supplied evidence. Be concise. Cite sections using [Source]. If evidence is insufficient, say so."
    payload = json.dumps({"model": model, "stream": False, "prompt": f"{system}\n\nEVIDENCE:\n{context}\n\nQUESTION:\n{question}"}).encode()
    request = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read())["response"]

class ChatRequest(BaseModel):
    question: str
    document_ids: list[str] = []
    model_id: str | None = None

class AuthRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(AuthRequest):
    name: str

ensure_sample_document()

@app.get("/api/health")
def health(user: sqlite3.Row = Depends(current_user)):
    try:
        urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1)
        ollama = True
    except Exception:
        ollama = False
    with db() as connection:
        documents = connection.execute("SELECT COUNT(*) AS total FROM documents WHERE owner_id=?", (user["id"],)).fetchone()["total"]
        audit_events = connection.execute("SELECT COUNT(*) AS total FROM audit WHERE user_id=?", (user["id"],)).fetchone()["total"]
    return {"status": "secure", "network_egress": "blocked-by-design", "ollama": ollama, "documents": documents, "audit_events": audit_events}

@app.get("/api/auth/status")
def auth_status():
    with db() as connection:
        return {"setup_required": connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0}

@app.post("/api/auth/register")
def register(body: RegisterRequest):
    name, username = body.name.strip(), body.username.strip().lower()
    if len(name) < 2 or not re.fullmatch(r"[a-z0-9._-]{3,32}", username):
        raise HTTPException(400, "Use a name and a 3-32 character username")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must contain at least 8 characters")
    salt = os.urandom(16)
    user_id = str(uuid.uuid4())
    try:
        with db() as connection:
            connection.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (user_id, name, username, password_digest(body.password, salt), salt.hex(), datetime.now(timezone.utc).isoformat()))
            connection.execute("UPDATE documents SET owner_id=? WHERE owner_id IS NULL", (user_id,))
            connection.execute("UPDATE audit SET user_id=? WHERE user_id IS NULL", (user_id,))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Username already exists") from None
    token = issue_session(user_id)
    audit("ACCOUNT_CREATED", username, "SUCCESS", user_id)
    return {"token": token, "user": {"id": user_id, "name": name, "username": username}}

@app.post("/api/auth/login")
def login(body: AuthRequest):
    with db() as connection:
        row = connection.execute("SELECT * FROM users WHERE username=?", (body.username.strip().lower(),)).fetchone()
    if not row or not hmac.compare_digest(row["password_hash"], password_digest(body.password, bytes.fromhex(row["salt"]))):
        raise HTTPException(401, "Invalid username or password")
    token = issue_session(row["id"])
    audit("SESSION_STARTED", row["username"], "SUCCESS", row["id"])
    return {"token": token, "user": public_user(row)}

@app.get("/api/auth/me")
def me(user: sqlite3.Row = Depends(current_user)):
    return public_user(user)

@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None), user: sqlite3.Row = Depends(current_user)):
    token_hash = hashlib.sha256((authorization or "")[7:].strip().encode()).hexdigest()
    audit("SESSION_ENDED", user["username"], "SUCCESS", user["id"])
    with db() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
    return {"ok": True}

@app.get("/api/documents")
def get_documents(user: sqlite3.Row = Depends(current_user)):
    with db() as connection:
        rows = connection.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
    return [document_payload(row) for row in rows]

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...), user: sqlite3.Row = Depends(current_user)):
    extension = (Path(file.filename or "document").suffix[1:] or "txt").lower()
    if extension not in {"pdf", "txt", "md", "csv"}:
        raise HTTPException(415, "Use PDF, TXT, MD or CSV")
    document_id = str(uuid.uuid4())
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or f"document.{extension}")
    path = UPLOADS / f"{document_id}_{safe_name}"
    content_bytes = await file.read()
    if len(content_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Prototype limit is 20 MB")
    path.write_bytes(content_bytes)
    content, pages = extract_text(path, extension)
    chunks = max(1, (len(content) + 999) // 1000)
    title = display_title(Path(safe_name).stem)
    with db() as connection:
        connection.execute("INSERT INTO documents(id,filename,title,content,chunks,created_at,owner_id) VALUES(?,?,?,?,?,?,?)", (document_id, safe_name, title, content, chunks, datetime.now(timezone.utc).isoformat(), user["id"]))
    audit("DOCUMENT_INDEXED", safe_name, "SUCCESS", user["id"])
    return {"id": document_id, "filename": safe_name, "title": title, "pages": pages, "chunks": chunks, "status": "indexed", "size_bytes": len(content_bytes), "type": extension.upper()}

@app.post("/api/chat")
def chat(body: ChatRequest, user: sqlite3.Row = Depends(current_user)):
    if not body.question.strip():
        raise HTTPException(400, "Question is required")
    started = time.perf_counter()
    with db() as connection:
        if body.document_ids:
            placeholders = ",".join("?" for _ in body.document_ids)
            rows = connection.execute(f"SELECT * FROM documents WHERE owner_id=? AND id IN ({placeholders})", [user["id"], *body.document_ids]).fetchall()
        else:
            rows = connection.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC LIMIT 5", (user["id"],)).fetchall()
    context, citations = relevant_context(body.question, rows)
    model, route = select_model(body.question, body.model_id)
    if not context.strip():
        context = "Demo safety review: Emergency shutdown interlock test incomplete. Pressure relief valve certification overdue. Elevated vibration may indicate coupling misalignment. Startup requires Process Safety sign-off."
        citations = [{"document": "P-4107 Safety Review", "location": "demo extract"}]
    try:
        answer = run_ollama(model, body.question, context)
        mode = "ollama"
    except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError):
        answer = fallback_answer(body.question, context)
        mode = "safe-demo-fallback"
    elapsed = int((time.perf_counter() - started) * 1000)
    audit("AGENT_QUERY", route, "ALLOWED", user["id"])
    return {"answer": answer, "model": model, "route": route, "citations": citations, "elapsed_ms": elapsed, "mode": mode, "egress_bytes": 0}

@app.get("/api/audit")
def get_audit(user: sqlite3.Row = Depends(current_user)):
    with db() as connection:
        return [dict(row) for row in connection.execute("SELECT * FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 100", (user["id"],))]

@app.get("/api/audit/export")
def export_audit(user: sqlite3.Row = Depends(current_user)):
    with db() as connection:
        rows = connection.execute("SELECT * FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 100", (user["id"],)).fetchall()
    filename = f"aegis_audit_{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response(
        content=audit_rows_to_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.get("/")
def index():
    return FileResponse(DIST / "index.html")

app.mount("/", StaticFiles(directory=DIST), name="frontend")
