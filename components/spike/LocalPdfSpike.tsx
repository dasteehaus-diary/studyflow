'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import type { LocalDocument } from '@/lib/db/local';
import { localDB } from '@/lib/db/local';
import { sha256FileInWorker } from '@/lib/storage/file-hash-client';
import {
  isPersistentStorageGranted,
  pdfExistsInOPFS,
  readPdfFromOPFS,
  removePdfFromOPFS,
  requestPersistentStorage,
  savePdfToOPFS,
  supportsOPFS
} from '@/lib/storage/opfs';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

type VerifyState = Record<string, 'idle' | 'checking' | 'pass' | 'fail'>;

export function LocalPdfSpike() {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [hashProgress, setHashProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>({});

  const opfsSupported = useMemo(() => supportsOPFS(), []);

  useEffect(() => {
    const db = localDB;
    if (!db) return;
    const subscription = liveQuery(() => db.documents.orderBy('updatedAt').reverse().toArray())
      .subscribe({ next: setDocuments, error: (error) => setMessage(String(error)) });

    if (opfsSupported) {
      isPersistentStorageGranted().then(setPersistent).catch(() => setPersistent(false));
    }

    return () => subscription.unsubscribe();
  }, [opfsSupported]);

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !localDB) return;

    if (!opfsSupported) {
      setMessage('OPFS is not available in this browser. Try current Chrome/Edge/Safari/Firefox.');
      return;
    }

    const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      setMessage('Please choose a PDF file.');
      return;
    }

    setBusy(true);
    setMessage(`Hashing ${file.name}…`);
    setHashProgress(0);

    try {
      const fileHash = await sha256FileInWorker(file, setHashProgress);
      const duplicate = await localDB.documents.where('fileHash').equals(fileHash).first();

      if (duplicate) {
        const exists = await pdfExistsInOPFS(duplicate.id);
        if (!exists) {
          await savePdfToOPFS(duplicate.id, file);
          await localDB.documents.update(duplicate.id, {
            opfsPath: `documents/${duplicate.id}.pdf`,
            updatedAt: new Date().toISOString()
          });
          setMessage(`Relinked ${duplicate.title} to this device. Hash matched the existing document.`);
        } else {
          setMessage(`Already imported: ${duplicate.title}. The SHA-256 hash matches.`);
        }
        return;
      }

      const id = crypto.randomUUID();
      const opfsPath = await savePdfToOPFS(id, file);
      const now = new Date().toISOString();
      await localDB.documents.add({
        id,
        title: file.name.replace(/\.pdf$/i, ''),
        fileHash,
        opfsPath,
        tags: [],
        status: 'in_progress',
        createdAt: now,
        updatedAt: now
      });

      setMessage(`Saved ${file.name} locally in OPFS. Reload this page to confirm it survives navigation/reload.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setHashProgress(0);
    }
  }

  async function verifyDocument(document: LocalDocument) {
    setVerifyState((current) => ({ ...current, [document.id]: 'checking' }));
    setMessage(`Verifying ${document.title}…`);

    try {
      const storedFile = await readPdfFromOPFS(document.id);
      const storedHash = await sha256FileInWorker(storedFile, setHashProgress);
      const pass = storedHash === document.fileHash;
      setVerifyState((current) => ({ ...current, [document.id]: pass ? 'pass' : 'fail' }));
      setMessage(pass
        ? `PASS: ${document.title} reopened from OPFS and its SHA-256 hash is unchanged.`
        : `FAIL: ${document.title} reopened, but the SHA-256 hash changed.`);
    } catch (error) {
      setVerifyState((current) => ({ ...current, [document.id]: 'fail' }));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setHashProgress(0);
    }
  }

  async function openStoredPdf(document: LocalDocument) {
    try {
      const file = await readPdfFromOPFS(document.id);
      const url = URL.createObjectURL(file);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteDocument(document: LocalDocument) {
    if (!localDB) return;
    await removePdfFromOPFS(document.id);
    await localDB.documents.delete(document.id);
    setVerifyState((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setMessage(`Deleted ${document.title} from this browser.`);
  }

  async function makePersistent() {
    try {
      const granted = await requestPersistentStorage();
      setPersistent(granted);
      setMessage(granted
        ? 'Persistent storage granted by the browser.'
        : 'The browser did not grant persistent storage. OPFS can still work, but browser storage policies may evict data.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="spikeStack">
      <section className="card spikeCard">
        <div>
          <div className="eyebrow">Phase 0 · Spike A</div>
          <h1 style={{ marginBottom: 10 }}>Local PDF persistence</h1>
          <p className="muted" style={{ maxWidth: 760, lineHeight: 1.6 }}>
            Import a real PDF, hash it in a Web Worker, store its bytes in OPFS, then reload or restart the browser and verify that the same bytes are still there. No PDF bytes are uploaded to Supabase in this spike.
          </p>
        </div>

        <div className="spikeStatusGrid">
          <div className="spikeStatus"><strong>OPFS</strong><span>{opfsSupported ? 'Available' : 'Unavailable'}</span></div>
          <div className="spikeStatus"><strong>Persistent storage</strong><span>{persistent === null ? 'Checking…' : persistent ? 'Granted' : 'Not granted'}</span></div>
          <div className="spikeStatus"><strong>Stored PDFs</strong><span>{documents.length}</span></div>
        </div>

        <div className="spikeActions">
          <label className={`primary fileButton ${busy ? 'disabled' : ''}`}>
            {busy ? 'Working…' : 'Import PDF'}
            <input type="file" accept="application/pdf,.pdf" onChange={importPdf} disabled={busy} hidden />
          </label>
          <button className="secondary" onClick={makePersistent} disabled={!opfsSupported || persistent === true}>Request persistent storage</button>
          <button className="secondary" onClick={() => location.reload()}>Reload page</button>
        </div>

        {hashProgress > 0 && hashProgress < 1 && (
          <div className="hashProgress" aria-label="Hashing progress">
            <span style={{ width: `${Math.round(hashProgress * 100)}%` }} />
          </div>
        )}
        {message && <div className="spikeMessage">{message}</div>}
      </section>

      <section className="card spikeCard">
        <div className="eyebrow">Persistence checklist</div>
        <h2 style={{ marginTop: 8 }}>Manual acceptance test</h2>
        <ol className="spikeChecklist">
          <li>Import a 50–100 MB PDF.</li>
          <li>Wait for hashing + OPFS save to finish.</li>
          <li>Click <strong>Verify bytes</strong>; it should show PASS.</li>
          <li>Reload the page; the PDF should still appear below.</li>
          <li>Close the browser, reopen StudyFlow, and click <strong>Verify bytes</strong> again.</li>
        </ol>
        <p className="muted">Spike A passes only after step 5 works on the real target browser/device.</p>
      </section>

      <section>
        <h2>Local documents</h2>
        {documents.length === 0 ? (
          <div className="card emptyState">No local PDFs yet.</div>
        ) : (
          <div className="spikeDocList">
            {documents.map((document) => {
              const state = verifyState[document.id] ?? 'idle';
              return (
                <article className="card spikeDoc" key={document.id}>
                  <div>
                    <strong>{document.title}</strong>
                    <div className="muted mono" title={document.fileHash}>{document.fileHash.slice(0, 16)}…</div>
                    <div className="muted" style={{ fontSize: 12 }}>{document.opfsPath}</div>
                  </div>
                  <div className={`verifyBadge ${state}`}>{state === 'idle' ? 'Not verified' : state === 'checking' ? 'Checking…' : state === 'pass' ? 'PASS' : 'FAIL'}</div>
                  <div className="spikeActions compact">
                    <button className="secondary" onClick={() => openStoredPdf(document)}>Open stored PDF</button>
                    <button className="secondary" onClick={() => verifyDocument(document)} disabled={state === 'checking'}>Verify bytes</button>
                    <button className="secondary danger" onClick={() => deleteDocument(document)}>Delete local copy</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
