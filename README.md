# Aegis — Sovereign On-Premise Agentic AI Workbench

SIH 2026 prototype for Problem Statement 26117. Aegis processes confidential industrial documents locally, routes each task to an appropriate open-weight model, grounds answers in local evidence, and records an audit trail.

## Tech stack

- React 19 + TypeScript frontend
- Vite production build pipeline
- ESLint + Vitest quality checks
- Python standard-library demo server for judge environments
- FastAPI + Uvicorn backend for the full local inference path
- SQLite metadata and audit store
- Local filesystem document vault
- Ollama-ready open-weight model routing with deterministic fallback

## Instant judge demo

```bash
python run_demo.py
```

Open `http://127.0.0.1:8000`. This presentation server serves the built React app and provides working upload, routing, answers, citations and audit logging using only Python's standard library.

On Windows, you can simply double-click `start_demo.bat`.

## Frontend development

```bash
npm install
npm run dev
```

Keep `python run_demo.py` running in another terminal. Vite proxies `/api` to `http://127.0.0.1:8000`.

Before a demo or deployment:

```bash
npm run build
npm run lint
npm test
```

The production frontend is emitted to `dist/`, which is also the static directory used by Sites hosting.

## Full Ollama demo

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000`.

For real local inference:

```bash
ollama pull qwen2.5:7b
ollama serve
```

Then restart the backend. Upload `sample_docs/compressor_safety_review.txt` and ask: **Identify critical safety risks and recommend whether startup should be approved.**

## What the prototype proves

- Files remain in `runtime_data/uploads` on the local machine.
- SQLite stores metadata and tamper-evident audit hashes locally.
- The router selects text, vision, or code models based on task type.
- Answers include document/section citations.
- No cloud AI key is needed; Ollama runs on localhost.
- A deterministic fallback keeps the SIH demonstration reliable if Ollama is unavailable.

## Environment variables

| Variable | Default |
| --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api/generate` |
| `AEGIS_TEXT_MODEL` | `qwen2.5:7b` |
| `AEGIS_VISION_MODEL` | `qwen2.5vl:7b` |
| `AEGIS_CODE_MODEL` | `deepseek-coder:6.7b` |

## Prototype note

For production, add authenticated RBAC, OS-level outbound firewall rules, encrypted disk volumes, malware scanning, OCR/vision extraction, a production vector database, signed model registry manifests, and append-only external audit storage.
