# Phase 0 — Technical Spike

Do not polish UI before these pass.

## Spike A — local PDF persistence
Implementation harness: `/spike/local-pdf`

### What is implemented
- PDF import from browser file picker.
- SHA-256 hashing in a dedicated Web Worker using 4 MB chunks.
- Duplicate detection by `fileHash`.
- PDF bytes saved to OPFS under `documents/<documentId>.pdf`.
- Metadata saved in Dexie / IndexedDB.
- Optional request for persistent browser storage.
- Reopen the stored PDF directly from OPFS.
- Re-hash the OPFS copy and compare with the original SHA-256.
- Delete local copy.

### Manual acceptance test
1. Start StudyFlow and open `/spike/local-pdf`.
2. Import a real 50–100 MB PDF.
3. Wait for hashing + OPFS save to finish.
4. Click **Verify bytes**. PASS means the reopened OPFS file has the same SHA-256.
5. Reload the page. The document must still be listed.
6. Close the target browser completely and reopen StudyFlow.
7. Click **Verify bytes** again.

**PASS:** steps 4–7 succeed on the real target device/browser with no cloud PDF upload.

> This repository contains the test harness, but browser persistence cannot be truthfully marked PASS until the manual restart test is run on the target device.

## Spike B — React-PDF 11
- Render a text PDF with React-PDF 11 / PDF.js 6.
- Render only the visible page plus a small buffer; do not mount every page for large files.
- Validate text selection and coordinate mapping.
- PASS: smooth navigation on target laptop for a 100 MB / 300+ page file.

## Spike C — resume precision
- Save `{page,y}` while reading.
- Reload app.
- Return to the same visual reading position.
- PASS: reader lands within a small visual tolerance without manual scrolling.

## Spike D — offline-first note
- Create highlight + Quick Note offline.
- Reload offline and verify persistence.
- Restore connection and enqueue sync.
- PASS: note never disappears during network transitions.

## Spike E — finish tape / reward
- Mark demo document completed.
- Assign one reward.
- Reload repeatedly.
- PASS: same reward remains assigned; no reroll.

Only after A–E pass should the team build the full v0.1 UI.
