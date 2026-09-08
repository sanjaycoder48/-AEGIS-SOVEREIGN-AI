# AEGIS Sovereign AI

Production-style local AI workbench for secure document review. AEGIS indexes confidential files on the device, answers with citations, and records a local audit trail.

## Stack

- React 19, TypeScript, Vite
- Python demo server and FastAPI backend
- SQLite audit and document metadata
- Ollama-ready local model routing
- ESLint, Vitest, GitHub Actions CI

## Run

```bash
npm install
npm run build
python run_demo.py
```

Open `http://127.0.0.1:8000`.

On first launch, create the local vault owner. AEGIS hashes the password on-device and assigns the existing sample document to that private vault. Later launches require the same username and password. Use the lock button beside the operator profile to end the session.

For frontend development:

```bash
npm run dev
```

## Check

```bash
npm run check
python -m py_compile run_demo.py backend/main.py
```

## Demo Prompt

Upload `sample_docs/compressor_safety_review.txt`, then ask:

`Identify critical safety risks and recommend whether startup should be approved.`
