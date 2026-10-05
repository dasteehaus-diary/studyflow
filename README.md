# StudyFlow v0.1 Starter

A deliberately small starter for the locked StudyFlow MVP.

## Stack
- Next.js 16.3.8 / React 19
- React-PDF 11 / PDF.js 6
- Dexie / IndexedDB
- OPFS for local PDF bytes
- Supabase for auth + structured sync + reminders + rewards

## Run
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/spike/local-pdf` first and run **Technical Spike A** before visual polish.

## Phase 0 status
- Spike A implementation harness: included.
- Spike A real-browser PASS: not yet claimed; it requires the manual browser restart test in `docs/TECHNICAL_SPIKE.md`.
- Spikes B–E: next.

## Important
Do not add EPUB, OCR, AI, social, analytics, cloud PDF upload or extra reward mechanics until the v0.1 vertical slice is complete.
