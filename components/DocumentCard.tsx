'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CassetteProgress } from './CassetteProgress';
import { localDB, renameDocument, type LocalDocument, type LocalProgress } from '@/lib/db/local';
import { meaningfulCoveragePercent } from '@/lib/progress/cassette';
import { pdfExistsInOPFS, removePdfFromOPFS } from '@/lib/storage/opfs';
import { enqueueSync } from '@/lib/sync/sync-service';
import { formatRelativeTime } from '@/lib/utils/time';

interface DocumentCardProps {
  document: LocalDocument;
  progress?: LocalProgress | null;
  onRelinkRequest?: (doc: LocalDocument) => void;
  onChanged?: () => void;
}

export function DocumentCard({ document, progress, onRelinkRequest, onChanged }: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(document.title);
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState(document.tags.join(', '));

  useEffect(() => {
    setNewTitle(document.title);
  }, [document.title]);

  useEffect(() => {
    let active = true;
    pdfExistsInOPFS(document.id).then((exists) => {
      if (active) setFileExists(exists);
    }).catch(() => {
      if (active) setFileExists(false);
    });
    return () => { active = false; };
  }, [document.id]);

  const currentPage = progress?.currentPage ?? 1;
  const totalPages = document.totalPages ?? 0;
  const pct = progress ? meaningfulCoveragePercent(totalPages || currentPage, progress.visitedRanges) : 0;
  const lastActive = formatRelativeTime(progress?.lastMeaningfulActivityAt || document.updatedAt);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    await renameDocument(document.id, trimmed);
    setIsRenaming(false);
    onChanged?.();
  };

  const handleSaveTags = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localDB) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    const now = new Date().toISOString();
    await localDB.documents.update(document.id, { tags, updatedAt: now });
    await enqueueSync('document', document.id, 'upsert', { ...document, tags, updatedAt: now });
    setIsManagingTags(false);
    onChanged?.();
  };

  const handleToggleArchive = async () => {
    if (!localDB) return;
    const nextStatus = document.status === 'archived' ? 'in_progress' : 'archived';
    const now = new Date().toISOString();
    await localDB.documents.update(document.id, { status: nextStatus, updatedAt: now });
    await enqueueSync('document', document.id, 'upsert', { ...document, status: nextStatus, updatedAt: now });
    setMenuOpen(false);
    onChanged?.();
  };

  const handleRestart = async () => {
    if (!localDB) return;
    const ok = window.confirm(
      `Khởi động lại tiến độ của "${document.title}"?\n\nTiến độ cuộn băng và trang hiện tại sẽ về 1, nhưng tất cả ghi chú, highlight và quà B-Side đã mở sẽ được giữ nguyên.`
    );
    if (!ok) return;

    const now = new Date().toISOString();
    await localDB.progress.put({
      documentId: document.id,
      currentPage: 1,
      y: 0,
      visitedRanges: [],
      completed: false,
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });
    await localDB.documents.update(document.id, { status: 'in_progress', updatedAt: now });
    await enqueueSync('progress', document.id, 'upsert', {
      documentId: document.id,
      currentPage: 1,
      y: 0,
      visitedRanges: [],
      completed: false,
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });
    setMenuOpen(false);
    onChanged?.();
  };

  const handleDelete = async () => {
    if (!localDB) return;
    const ok = window.confirm(
      `Xóa vĩnh viễn "${document.title}" khỏi thiết bị này?\n\nFile PDF cục bộ và tiến độ sẽ bị xóa. Quà B-Side trong Vault sẽ không bị ảnh hưởng.`
    );
    if (!ok) return;

    await removePdfFromOPFS(document.id);
    await localDB.documents.delete(document.id);
    await localDB.progress.delete(document.id);
    await localDB.highlights.where('documentId').equals(document.id).delete();
    await localDB.notes.where('documentId').equals(document.id).delete();
    await enqueueSync('document', document.id, 'delete', { id: document.id });
    setMenuOpen(false);
    onChanged?.();
  };

  return (
    <div className="card docCard" style={{ position: 'relative' }}>
      {/* Top action menu */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <button
          className="secondary"
          style={{ padding: '2px 8px', borderRadius: 8, fontSize: 13 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="Tùy chọn tài liệu"
        >
          •••
        </button>

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              boxShadow: 'var(--shadow)',
              padding: 6,
              display: 'grid',
              gap: 4,
              minWidth: 160,
              zIndex: 30
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 12, padding: '6px 10px' }}
              onClick={() => { setMenuOpen(false); setIsRenaming(true); }}
            >
              ✏️ Đổi tên
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 12, padding: '6px 10px' }}
              onClick={() => { setMenuOpen(false); setIsManagingTags(true); }}
            >
              🏷️ Quản lý tags
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 12, padding: '6px 10px' }}
              onClick={handleRestart}
            >
              🔄 Khởi động lại
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 12, padding: '6px 10px' }}
              onClick={handleToggleArchive}
            >
              {document.status === 'archived' ? '📂 Mở lưu trữ' : '📦 Lưu trữ (Archive)'}
            </button>
            <button
              className="secondary danger"
              style={{ textAlign: 'left', border: 0, fontSize: 12, padding: '6px 10px' }}
              onClick={handleDelete}
            >
              🗑️ Xóa tài liệu
            </button>
          </div>
        )}
      </div>

      <Link
        href={fileExists === false ? '#' : `/reader/${document.id}`}
        onClick={(e) => {
          if (fileExists === false) {
            e.preventDefault();
            onRelinkRequest?.(document);
          }
        }}
        style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flex: 1 }}
      >
        <div
          className="docThumb"
          style={{
            background: document.thumbnail ? '#2c2a26' : (document.status === 'completed'
              ? 'linear-gradient(135deg, var(--olive-cream), #9e965f)'
              : 'linear-gradient(135deg, var(--dusty-blue), #697a8c)'),
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {document.thumbnail ? (
            <img
              src={document.thumbnail}
              alt={document.title}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          ) : (
            <span style={{
              fontSize: 13,
              color: 'white',
              lineHeight: 1.3,
              position: 'relative',
              zIndex: 2,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {document.title}
            </span>
          )}
          {document.status === 'completed' && (
            <span
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgba(0,0,0,0.6)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                zIndex: 2
              }}
            >
              ✓ Đã xong
            </span>
          )}
        </div>

        <div className="docMeta">
          <strong
            style={{
              fontSize: 14,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
              marginTop: 8
            }}
            title={document.title}
          >
            {document.title}
          </strong>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {document.tags.map(t => (
              <span key={t} className="pill" style={{ fontSize: 10, padding: '2px 6px' }}>{t}</span>
            ))}
          </div>

          {fileExists === false && (
            <div style={{ marginTop: 8 }}>
              <span style={{ color: 'var(--terracotta)', fontSize: 12, fontWeight: 600 }}>
                ⚠️ File PDF thiếu trên thiết bị
              </span>
              <button
                className="secondary"
                style={{ fontSize: 11, padding: '3px 8px', marginTop: 4, display: 'block' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRelinkRequest?.(document);
                }}
              >
                Relink PDF
              </button>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <CassetteProgress value={pct} variant="mini" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>Trang {currentPage}</span>
              <span>{lastActive}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Rename modal */}
      {isRenaming && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
          onClick={() => setIsRenaming(false)}
        >
          <div className="card" style={{ padding: 20, width: 'min(360px, 100%)' }} onClick={e => e.stopPropagation()}>
            <h4>Đổi tên tài liệu</h4>
            <form onSubmit={handleRename} style={{ display: 'grid', gap: 10 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                placeholder="Nhập tên hiển thị mới"
                autoFocus
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="secondary" onClick={() => setIsRenaming(false)}>Hủy (Esc)</button>
                <button type="submit" className="primary" disabled={!newTitle.trim()}>Lưu (Enter)</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tags modal */}
      {isManagingTags && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
          onClick={() => setIsManagingTags(false)}
        >
          <div className="card" style={{ padding: 20, width: 'min(360px, 100%)' }} onClick={e => e.stopPropagation()}>
            <h4>Quản lý tags</h4>
            <p className="muted" style={{ fontSize: 12 }}>Nhập các tag cách nhau bởi dấu phẩy (vd: Deutsch, Psychology)</p>
            <form onSubmit={handleSaveTags} style={{ display: 'grid', gap: 10 }}>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="Deutsch, Work, Science"
                autoFocus
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="secondary" onClick={() => setIsManagingTags(false)}>Hủy</button>
                <button type="submit" className="primary">Lưu tags</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
