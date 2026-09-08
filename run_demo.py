"""Zero-dependency presentation server for Aegis.

Use this when package installation or Ollama is unavailable:
    python run_demo.py
"""
from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
import hashlib
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
    return db


def audit_hash(stamp, action, resource, result):
    previous = ""
    with connection() as db:
        row = db.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
        if row:
            previous = row["hash"]
    return hashlib.sha256(f"{previous}|{stamp}|{action}|{resource}|{result}".encode()).hexdigest()


def write_audit(action, resource, result):
    stamp = datetime.now(timezone.utc).isoformat()
    digest = audit_hash(stamp, action, resource, result)
    with connection() as db:
        db.execute("INSERT INTO audit(timestamp,action,resource,result,hash) VALUES(?,?,?,?,?)", (stamp, action, resource, result, digest))


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


def list_documents():
    with connection() as db:
        rows = db.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()
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
            "INSERT INTO documents VALUES(?,?,?,?,?,?)",
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


def select_model(question):
    lowered = question.lower()
    if any(word in lowered for word in ("drawing", "diagram", "scan", "image", "p&id")):
        return "qwen2.5vl:7b", "Visual inspection"
    if any(word in lowered for word in ("code", "script", "function", "bug")):
        return "deepseek-coder:6.7b", "Code analysis"
    if any(word in lowered for word in ("draft", "approval", "memo", "note")):
        return "qwen2.5:7b", "Controlled drafting"
    return "qwen2.5:7b", "Document risk analysis"


def relevant_context(question, document_ids):
    terms = set(re.findall(r"[a-zA-Z0-9-]{3,}", question.lower()))
    with connection() as db:
        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            rows = db.execute(f"SELECT * FROM documents WHERE id IN ({placeholders})", document_ids).fetchall()
        else:
            rows = db.execute("SELECT * FROM documents ORDER BY created_at DESC LIMIT 5").fetchall()

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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_security_headers(self):
        for header, value in SECURITY_HEADERS.items():
            self.send_header(header, value)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_security_headers()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            with connection() as db:
                documents = db.execute("SELECT COUNT(*) AS total FROM documents").fetchone()["total"]
                audit_events = db.execute("SELECT COUNT(*) AS total FROM audit").fetchone()["total"]
            return self.send_json({
                "status": "secure",
                "ollama": False,
                "network_egress": "blocked-by-design",
                "mode": "presentation",
                "documents": documents,
                "audit_events": audit_events,
            })
        if path == "/api/documents":
            return self.send_json(list_documents())
        if path == "/api/audit":
            with connection() as db:
                return self.send_json([dict(row) for row in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 100")])
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
        if path == "/api/documents/upload":
            return self.upload()
        if path == "/api/chat":
            return self.chat()
        self.send_error(404)

    def upload(self):
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
            db.execute("INSERT INTO documents VALUES(?,?,?,?,?,?)", (doc_id, name, title, content, chunks, datetime.now(timezone.utc).isoformat()))
        write_audit("DOCUMENT_INDEXED", name, "SUCCESS")
        self.send_json({"id": doc_id, "filename": name, "title": title, "pages": 1, "chunks": chunks, "status": "indexed", "size_bytes": len(raw), "type": extension.lstrip(".").upper()})

    def chat(self):
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.send_json({"detail": "Invalid JSON"}, 400)
        question = str(body.get("question", "")).strip()
        if not question:
            return self.send_json({"detail": "Question required"}, 400)
        started = time.perf_counter()
        model, route = select_model(question)
        document_ids = body.get("document_ids") if isinstance(body.get("document_ids"), list) else []
        context, citations = relevant_context(question, [str(item) for item in document_ids])
        answer = deterministic_answer(question, context)
        time.sleep(.45)
        write_audit("AGENT_QUERY", route, "ALLOWED")
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
