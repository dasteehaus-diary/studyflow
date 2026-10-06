'use client';

import { useState, ChangeEvent } from 'react';
import { localDB, type LocalDocument } from '@/lib/db/local';
import { sha256FileInWorker } from '@/lib/storage/file-hash-client';
import { savePdfToOPFS, pdfExistsInOPFS, supportsOPFS } from '@/lib/storage/opfs';
import { enqueueSync } from '@/lib/sync/sync-service';
import { pdfjs } from 'react-pdf';

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

type ImportStatus = 'idle' | 'hashing' | 'saving' | 'success' | 'duplicate' | 'relink_success' | 'error';

interface ImportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  relinkTarget?: LocalDocument | null;
  onImportComplete?: (documentId: string) => void;
}

export function ImportPdfModal({ isOpen, onClose, relinkTarget, onImportComplete }: ImportPdfModalProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [hashProgress, setHashProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [duplicateDoc, setDuplicateDoc] = useState<LocalDocument | null>(null);
  const [importedDocId, setImportedDocId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [originalFileName, setOriginalFileName] = useState('');

  if (!isOpen) return null;

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!supportsOPFS()) {
      setStatus('error');
      setErrorMessage('Trình duyệt này không hỗ trợ OPFS. Vui lòng dùng Chrome, Edge, Safari hoặc Firefox.');
      return;
    }

    const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      setStatus('error');
      setErrorMessage('Vui lòng chọn một file PDF hợp lệ (.pdf).');
      return;
    }

    setStatus('hashing');
    setHashProgress(0);
    setErrorMessage('');
    setOriginalFileName(file.name);

    try {
      const fileHash = await sha256FileInWorker(file, (p) => setHashProgress(p));
      setStatus('saving');

      if (!localDB) throw new Error('Local database is not initialized');

      // Check if relinking a specific document
      if (relinkTarget) {
        if (relinkTarget.fileHash !== fileHash) {
          setStatus('error');
          setErrorMessage(`File đã chọn không khớp với bản gốc. Hash mong đợi: ${relinkTarget.fileHash.slice(0, 8)}…, hash file: ${fileHash.slice(0, 8)}…`);
          return;
        }
        await savePdfToOPFS(relinkTarget.id, file);
        await localDB.documents.update(relinkTarget.id, {
          opfsPath: `documents/${relinkTarget.id}.pdf`,
          originalFileName: file.name,
          updatedAt: new Date().toISOString()
        });
        setStatus('relink_success');
        onImportComplete?.(relinkTarget.id);
        return;
      }

      // Check duplicate by fileHash
      const existing = await localDB.documents.where('fileHash').equals(fileHash).first();
      if (existing) {
        const fileInOpfs = await pdfExistsInOPFS(existing.id);
        if (!fileInOpfs) {
          // Relink to existing document record
          await savePdfToOPFS(existing.id, file);
          await localDB.documents.update(existing.id, {
            opfsPath: `documents/${existing.id}.pdf`,
            originalFileName: file.name,
            updatedAt: new Date().toISOString()
          });
          setStatus('relink_success');
          onImportComplete?.(existing.id);
          return;
        }

        setDuplicateDoc(existing);
        setStatus('duplicate');
        return;
      }

      // New Document
      const id = crypto.randomUUID();
      const opfsPath = await savePdfToOPFS(id, file);
      const now = new Date().toISOString();
      const title = file.name.replace(/\.pdf$/i, '');
      setCustomTitle(title);
      setImportedDocId(id);

      // Generate local thumbnail and totalPages using lightweight Blob URL
      let thumbnail: string | undefined;
      let totalPages: number | undefined;
      let blobUrl: string | null = null;
      try {
        blobUrl = URL.createObjectURL(file);
        const loadingTask = pdfjs.getDocument({ url: blobUrl });
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await firstPage.render({ canvasContext: ctx, viewport, canvas }).promise;
          thumbnail = canvas.toDataURL('image/jpeg', 0.75);
        }
      } catch (err) {
        console.warn('Could not generate PDF thumbnail, falling back to gradient:', err);
      } finally {
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      }

      const newDoc: LocalDocument = {
        id,
        title,
        originalFileName: file.name,
        fileHash,
        opfsPath,
        totalPages,
        fileSizeBytes: file.size,
        thumbnail,
        tags: [],
        status: 'in_progress',
        createdAt: now,
        updatedAt: now
      };

      await localDB.documents.add(newDoc);

      // Initialize progress entry
      const initialProgress = {
        documentId: id,
        currentPage: 1,
        y: 0,
        visitedRanges: [[1, 1]] as Array<[number, number]>,
        completed: false,
        lastMeaningfulActivityAt: now,
        updatedAt: now
      };
      await localDB.progress.add(initialProgress);

      // Sync queue
      await enqueueSync('document', id, 'upsert', newDoc);
      await enqueueSync('progress', id, 'upsert', initialProgress);

      setStatus('success');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleFinishImport(shouldOpenReader = true) {
    if (importedDocId && customTitle.trim() && localDB) {
      const trimmed = customTitle.trim();
      const doc = await localDB.documents.get(importedDocId);
      if (doc && doc.title !== trimmed) {
        const now = new Date().toISOString();
        await localDB.documents.update(importedDocId, { title: trimmed, updatedAt: now });
        await enqueueSync('document', importedDocId, 'upsert', { ...doc, title: trimmed, updatedAt: now });
      }
    }
    onClose();
    if (shouldOpenReader && importedDocId) {
      onImportComplete?.(importedDocId);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 'min(480px, 100%)', padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">
          {relinkTarget ? 'Relink PDF' : 'Import Document'}
        </div>
        <h2 style={{ margin: '8px 0 16px' }}>
          {relinkTarget ? `Relink: ${relinkTarget.title}` : 'Thêm tài liệu PDF'}
        </h2>

        {status === 'idle' && (
          <div>
            <p className="muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>
              {relinkTarget
                ? 'Chọn đúng file PDF gốc để nối lại dữ liệu ghi chú, vị trí và cassette progress.'
                : 'Tài liệu PDF được lưu trữ cục bộ trên máy bạn qua OPFS và không tải lên máy chủ. Ghi chú và tiến độ đọc sẽ được đồng bộ an toàn.'}
            </p>
            <label
              className="primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer'
              }}
            >
              <span>📂 Chọn file PDF</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileSelect}
                hidden
              />
            </label>
          </div>
        )}

        {status === 'hashing' && (
          <div>
            <p>Đang tính mã SHA-256 (Web Worker)…</p>
            <div className="hashProgress" style={{ marginTop: 8 }}>
              <span style={{ width: `${Math.round(hashProgress * 100)}%` }} />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {Math.round(hashProgress * 100)}% hoàn thành
            </div>
          </div>
        )}

        {status === 'saving' && (
          <div>
            <p>Đang lưu file vào bộ nhớ OPFS an toàn…</p>
          </div>
        )}

        {status === 'duplicate' && (
          <div>
            <p style={{ color: 'var(--terracotta)', fontWeight: 600 }}>
              Tài liệu này đã có trong thư viện!
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Mã hash SHA-256 trùng khớp với: <strong>{duplicateDoc?.title}</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                className="primary"
                onClick={() => {
                  onClose();
                  if (duplicateDoc) onImportComplete?.(duplicateDoc.id);
                }}
              >
                Mở tài liệu hiện có
              </button>
              <button className="secondary" onClick={onClose}>Đóng</button>
            </div>
          </div>
        )}

        {status === 'relink_success' && (
          <div>
            <p style={{ color: 'var(--olive)', fontWeight: 600 }}>
              ✓ Đã nối lại file PDF thành công!
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Tất cả ghi chú, highlight và vị trí đọc đã sẵn sàng.
            </p>
            <button className="primary" onClick={onClose} style={{ marginTop: 16 }}>
              Tiếp tục
            </button>
          </div>
        )}

        {status === 'success' && (
          <div>
            <p style={{ color: 'var(--olive)', fontWeight: 600, margin: '0 0 14px' }}>
              ✓ Đã thêm tài liệu thành công!
            </p>
            <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                Tên hiển thị trong StudyFlow (tùy chọn chỉnh sửa):
              </label>
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Nhập tên hiển thị…"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  fontSize: 14
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFinishImport(true);
                  }
                }}
              />
              <span className="muted" style={{ fontSize: 11 }}>
                File gốc: {originalFileName}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="primary" onClick={() => handleFinishImport(true)}>
                Mở sách →
              </button>
              <button className="secondary" onClick={() => handleFinishImport(false)}>
                Lưu &amp; Đóng
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p style={{ color: 'var(--terracotta)', fontWeight: 600 }}>Đã xảy ra lỗi</p>
            <p className="muted" style={{ fontSize: 13 }}>{errorMessage}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="secondary" onClick={() => setStatus('idle')}>Thử lại</button>
              <button className="secondary" onClick={onClose}>Đóng</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
