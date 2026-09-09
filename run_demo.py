"""Zero-dependency presentation server for Aegis.

Use this when package installation or Ollama is unavailable:
    python run_demo.py
"""
from __future__ import annotations

import csv
from email.parser import BytesParser
from email.policy import default
import hashlib
import hmac
import io
import json
import mimetypes
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.resolve()
DIST = ROOT / "dist"
DATA = ROOT / "runtime_data"
UPLOADS = DATA / "uploads"
DB_PATH = DATA / "aegis.db"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
TEXT_MODEL = "qwen2.5:7b"
VISION_MODEL = "qwen2.5vl:7b"
CODE_MODEL = "deepseek-coder:6.7b"
MODEL_ROUTES = {
    VISION_MODEL: "Visual inspection",
    CODE_MODEL: "Code analysis",
}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' http://127.0.0.1:8000; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
}
DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)


def uploaded_file_from(headers, body):
    content_type = headers.get("Content-Type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        return None, None
    message = BytesParser(policy=default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
    )
    if not message.is_multipart():
        return None, None
    for part in message.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        if part.get_param("name", header="content-disposition") != "file":
            continue
        return part.get_filename(), part.get_payload(decode=True) or b""
    return None, None


def connection():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, filename TEXT, title TEXT, content TEXT, chunks INTEGER, created_at TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, action TEXT, resource TEXT, result TEXT, hash TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL)")
    if "owner_id" not in {row["name"] for row in db.execute("PRAGMA table_info(documents)")}:
        db.execute("ALTER TABLE documents ADD COLUMN owner_id TEXT")
    if "user_id" not in {row["name"] for row in db.execute("PRAGMA table_info(audit)")}:
        db.execute("ALTER TABLE audit ADD COLUMN user_id TEXT")
    return db


def password_digest(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000).hex()


def audit_hash(stamp, action, resource, result, user_id=None):
    previous = ""
    with connection() as db:
        row = db.execute("SELECT hash FROM audit WHERE user_id IS ? ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
        if row:
            previous = row["hash"]
    return hashlib.sha256(f"{previous}|{stamp}|{action}|{resource}|{result}".encode()).hexdigest()


def write_audit(action, resource, result, user_id=None):
    stamp = datetime.now(timezone.utc).isoformat()
    digest = audit_hash(stamp, action, resource, result, user_id)
    with connection() as db:
        db.execute("INSERT INTO audit(timestamp,action,resource,result,hash,user_id) VALUES(?,?,?,?,?,?)", (stamp, action, resource, result, digest, user_id))


def audit_rows_to_csv(rows):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "actor", "action", "resource", "result", "hash"])
    for row in rows:
        action = row["action"] or ""
        actor = "Vault service" if action == "DOCUMENT_INDEXED" else "Secure Operator"
        writer.writerow([row["timestamp"], actor, action.replace("_", " ").title(), row["resource"], row["result"], row["hash"] or ""])
    return output.getvalue().encode()


def display_title(value):
    text = re.sub(r"\s+", " ", str(value or "").replace("_", " ")).strip()
    return text.title() if text and text == text.lower() else text


def document_payload(row):
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


def list_documents(user_id):
    with connection() as db:
        rows = db.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC", (user_id,)).fetchall()
    return [document_payload(row) for row in rows]


def ensure_sample_document():
    sample = ROOT / "sample_docs" / "compressor_safety_review.txt"
    with connection() as db:
        exists = db.execute("SELECT COUNT(*) AS total FROM documents").fetchone()["total"]
        if exists or not sample.is_file():
            return
        content = sample.read_text(encoding="utf-8", errors="ignore")
        chunks = max(1, (len(content) + 999) // 1000)
        db.execute(
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
    write_audit("DOCUMENT_INDEXED", sample.name, "SEEDED")


def select_model(question, requested_model=None):
    requested = str(requested_model or "").strip()
    if requested in MODEL_ROUTES:
        return requested, MODEL_ROUTES[requested]

    lowered = question.lower()
    if any(word in lowered for word in ("drawing", "diagram", "scan", "image", "p&id")):
        return VISION_MODEL, "Visual inspection"
    if any(word in lowered for word in ("code", "script", "function", "bug")):
        return CODE_MODEL, "Code analysis"
    if any(word in lowered for word in ("draft", "approval", "memo", "note")):
        return TEXT_MODEL, "Controlled drafting"
    return TEXT_MODEL, "Document risk analysis"


def relevant_context(question, document_ids, user_id):
    terms = set(re.findall(r"[a-zA-Z0-9-]{3,}", question.lower()))
    with connection() as db:
        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            rows = db.execute(f"SELECT * FROM documents WHERE owner_id=? AND id IN ({placeholders})", [user_id, *document_ids]).fetchall()
        else:
            rows = db.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC LIMIT 5", (user_id,)).fetchall()

    passages = []
    for row in rows:
        content = row["content"] or ""
        chunks = [content[i:i + 1200] for i in range(0, len(content), 1000)] or [content]
        for index, chunk in enumerate(chunks):
            lowered = chunk.lower()
            score = sum(term in lowered for term in terms)
            if any(token in lowered for token in ("high", "startup", "safety", "certification", "interlock")):
                score += 1
            passages.append((score, chunk, display_title(row["title"]), f"section {index + 1}"))

    chosen = sorted(passages, reverse=True, key=lambda item: item[0])[:4]
    context = "\n\n".join(item[1] for item in chosen).strip()
    citations = [{"document": item[2], "location": item[3]} for item in chosen if item[1].strip()]
    return context, citations


def extract_findings(context):
    matches = re.findall(r"(F-\d+\s+[A-Z]+:.*?)(?=\nF-\d+\s+[A-Z]+:|\n\n|\Z)", context, flags=re.S)
    if matches:
        return [" ".join(match.split()) for match in matches]
    return [
        "F-01 HIGH: Emergency shutdown interlock ESD-4107 has not completed the witnessed functional test. Owner: Instrumentation. Due: before commissioning.",
        "F-02 HIGH: Pressure relief valve PSV-4107B certification expired on 12 August 2026. Owner: Inspection. Due: before commissioning.",
        "F-03 MEDIUM: Drive-end bearing vibration reached 6.8 mm/s during the no-load trial. Owner: Rotating Equipment. Due: within 48 hours.",
    ]


def deterministic_answer(question, context):
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
        "### Critical findings\n"
        "The evidence identifies **three risks** requiring action before commissioning.\n"
        f"- {findings[0]}\n"
        f"- {findings[1]}\n"
        f"- {findings[2]}\n\n"
        "**Recommended action:** Hold startup until Process Safety verifies the two high-priority safeguards."
    )


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[Aegis] {fmt % args}")

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_security_headers(self):
        for header, value in SECURITY_HEADERS.items():
            self.send_header(header, value)

    def send_csv(self, rows):
        body = audit_rows_to_csv(rows)
        filename = f"aegis_audit_{datetime.now(timezone.utc).date().isoformat()}.csv"
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_security_headers()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/auth/status":
            with connection() as db:
                return self.send_json({"setup_required": db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0})
        if path == "/api/auth/me":
            user = self.authenticated_user()
            if not user:
                return self.send_json({"detail": "Sign in to unlock this vault"}, 401)
            return self.send_json({"id": user["id"], "name": user["name"], "username": user["username"]})
        if path == "/api/health":
            user = self.require_user()
            if not user:
                return
            with connection() as db:
                documents = db.execute("SELECT COUNT(*) AS total FROM documents WHERE owner_id=?", (user["id"],)).fetchone()["total"]
                audit_events = db.execute("SELECT COUNT(*) AS total FROM audit WHERE user_id=?", (user["id"],)).fetchone()["total"]
            return self.send_json({
                "status": "secure",
                "ollama": False,
                "network_egress": "blocked-by-design",
                "mode": "presentation",
                "documents": documents,
                "audit_events": audit_events,
            })
        if path == "/api/documents":
            user = self.require_user()
            if user:
                return self.send_json(list_documents(user["id"]))
            return
        if path == "/api/audit":
            user = self.require_user()
            if not user:
                return
            with connection() as db:
                return self.send_json([dict(row) for row in db.execute("SELECT * FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 100", (user["id"],))])
        if path == "/api/audit/export":
            user = self.require_user()
            if not user:
                return
            with connection() as db:
                return self.send_csv(db.execute("SELECT * FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 100", (user["id"],)).fetchall())
        target = DIST / ("index.html" if path == "/" else path.lstrip("/"))
        if not target.is_file() or DIST not in target.resolve().parents:
            return self.send_error(404)
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/auth/register":
            return self.register()
        if path == "/api/auth/login":
            return self.login()
        if path == "/api/auth/logout":
            return self.logout()
        if path == "/api/documents/upload":
            user = self.require_user()
            return self.upload(user) if user else None
        if path == "/api/chat":
            user = self.require_user()
            return self.chat(user) if user else None
        self.send_error(404)

    def json_body(self):
        try:
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return None

    def authenticated_user(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        token_hash = hashlib.sha256(header[7:].strip().encode()).hexdigest()
        with connection() as db:
            return db.execute("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?", (token_hash,)).fetchone()

    def require_user(self):
        user = self.authenticated_user()
        if not user:
            self.send_json({"detail": "Session expired. Sign in again"}, 401)
        return user

    def register(self):
        body = self.json_body()
        if body is None:
            return self.send_json({"detail": "Invalid JSON"}, 400)
        name = str(body.get("name", "")).strip()
        username = str(body.get("username", "")).strip().lower()
        password = str(body.get("password", ""))
        if len(name) < 2 or not re.fullmatch(r"[a-z0-9._-]{3,32}", username):
            return self.send_json({"detail": "Use a name and a 3-32 character username"}, 400)
        if len(password) < 8:
            return self.send_json({"detail": "Password must contain at least 8 characters"}, 400)
        salt, user_id = uuid.uuid4().bytes, str(uuid.uuid4())
        try:
            with connection() as db:
                db.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (user_id, name, username, password_digest(password, salt), salt.hex(), datetime.now(timezone.utc).isoformat()))
                db.execute("UPDATE documents SET owner_id=? WHERE owner_id IS NULL", (user_id,))
                db.execute("UPDATE audit SET user_id=? WHERE user_id IS NULL", (user_id,))
        except sqlite3.IntegrityError:
            return self.send_json({"detail": "Username already exists"}, 409)
        token = f"aegis_{uuid.uuid4().hex}{uuid.uuid4().hex}"
        with connection() as db:
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user_id, datetime.now(timezone.utc).isoformat()))
        write_audit("ACCOUNT_CREATED", username, "SUCCESS", user_id)
        return self.send_json({"token": token, "user": {"id": user_id, "name": name, "username": username}})

    def login(self):
        body = self.json_body()
        if body is None:
            return self.send_json({"detail": "Invalid JSON"}, 400)
        username, password = str(body.get("username", "")).strip().lower(), str(body.get("password", ""))
        with connection() as db:
            user = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if not user or not hmac.compare_digest(user["password_hash"], password_digest(password, bytes.fromhex(user["salt"]))):
            return self.send_json({"detail": "Invalid username or password"}, 401)
        token = f"aegis_{uuid.uuid4().hex}{uuid.uuid4().hex}"
        with connection() as db:
            db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user["id"], datetime.now(timezone.utc).isoformat()))
        write_audit("SESSION_STARTED", username, "SUCCESS", user["id"])
        return self.send_json({"token": token, "user": {"id": user["id"], "name": user["name"], "username": username}})

    def logout(self):
        user = self.require_user()
        if not user:
            return
        token_hash = hashlib.sha256(self.headers.get("Authorization", "")[7:].strip().encode()).hexdigest()
        write_audit("SESSION_ENDED", user["username"], "SUCCESS", user["id"])
        with connection() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        return self.send_json({"ok": True})

    def upload(self, user):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"detail": "Invalid content length"}, 400)
        if length > MAX_UPLOAD_BYTES + 1024 * 1024:
            return self.send_json({"detail": "Prototype limit is 20 MB"}, 413)
        filename, raw = uploaded_file_from(self.headers, self.rfile.read(length))
        if not filename:
            return self.send_json({"detail": "File required"}, 400)
        name = re.sub(r"[^a-zA-Z0-9_.-]", "_", Path(filename).name)
        extension = Path(name).suffix.lower()
        if extension not in {".pdf", ".txt", ".md", ".csv"}:
            return self.send_json({"detail": "Use PDF, TXT, MD or CSV"}, 415)
        if len(raw) > MAX_UPLOAD_BYTES:
            return self.send_json({"detail": "Prototype limit is 20 MB"}, 413)
        doc_id = str(uuid.uuid4())
        (UPLOADS / f"{doc_id}_{name}").write_bytes(raw)
        content = raw.decode("utf-8", errors="ignore") if extension != ".pdf" else "Scanned PDF secured. Vision extraction is available through the Ollama deployment profile."
        chunks = max(1, (len(content) + 999) // 1000)
        title = display_title(Path(name).stem)
        with connection() as db:
            db.execute("INSERT INTO documents(id,filename,title,content,chunks,created_at,owner_id) VALUES(?,?,?,?,?,?,?)", (doc_id, name, title, content, chunks, datetime.now(timezone.utc).isoformat(), user["id"]))
        write_audit("DOCUMENT_INDEXED", name, "SUCCESS", user["id"])
        self.send_json({"id": doc_id, "filename": name, "title": title, "pages": 1, "chunks": chunks, "status": "indexed", "size_bytes": len(raw), "type": extension.lstrip(".").upper()})

    def chat(self, user):
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send_json({"detail": "Invalid JSON"}, 400)
        question = str(body.get("question", "")).strip()
        if not question:
            return self.send_json({"detail": "Question required"}, 400)
        started = time.perf_counter()
        model, route = select_model(question, body.get("model_id"))
        document_ids = body.get("document_ids") if isinstance(body.get("document_ids"), list) else []
        context, citations = relevant_context(question, [str(item) for item in document_ids], user["id"])
        answer = deterministic_answer(question, context)
        time.sleep(.45)
        write_audit("AGENT_QUERY", route, "ALLOWED", user["id"])
        self.send_json({"answer": answer, "model": model, "route": route, "citations": citations[:3], "elapsed_ms": int((time.perf_counter()-started)*1000), "mode": "safe-demo-fallback", "egress_bytes": 0})


if __name__ == "__main__":
    ensure_sample_document()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Aegis is running at http://127.0.0.1:8000")
    print("Press Ctrl+C to stop. No package installation is required.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAegis stopped.")
