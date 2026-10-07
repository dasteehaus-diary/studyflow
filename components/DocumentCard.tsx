'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CassetteProgress } from './CassetteProgress';
import { localDB, renameDocument, deleteDocumentLocalCascade, type LocalDocument, type LocalProgress } from '@/lib/db/local';
import { readingPositionPercent } from '@/lib/progress/cassette';
import { pdfExistsInOPFS, removePdfFromOPFS } from '@/lib/storage/opfs';
import { enqueueSync } from '@/lib/sync/sync-service';
import { formatRelativeTime } from '@/lib/utils/time';
import {
  IconMore,
  IconPencil,
  IconTag,
  IconRotate,
  IconArchive,
  IconTrash
} from '@/components/icons/BrandIcons';

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
  const pct = progress ? readingPositionPercent(totalPages, currentPage, progress.y ?? 0) : 0;
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

    await deleteDocumentLocalCascade(document.id);
    setMenuOpen(false);
    onChanged?.();
  };

  return (
    <div className="card docCard" style={{ position: 'relative' }}>
      {/* Top action menu */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        <button
          className="secondary"
          style={{
            padding: '4px 7px',
            borderRadius: 8,
            fontSize: 12,
            background: 'var(--panel)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="Tùy chọn tài liệu"
        >
          <IconMore size={16} />
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
              boxShadow: 'var(--shadow-hover)',
              padding: 6,
              display: 'grid',
              gap: 2,
              minWidth: 170,
              zIndex: 30
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 13, padding: '7px 10px', justifyContent: 'flex-start' }}
              onClick={() => { setMenuOpen(false); setIsRenaming(true); }}
            >
              <IconPencil size={15} />
              <span>Đổi tên</span>
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 13, padding: '7px 10px', justifyContent: 'flex-start' }}
              onClick={() => { setMenuOpen(false); setIsManagingTags(true); }}
            >
              <IconTag size={15} />
              <span>Quản lý tags</span>
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 13, padding: '7px 10px', justifyContent: 'flex-start' }}
              onClick={handleRestart}
            >
              <IconRotate size={15} />
              <span>Khởi động lại</span>
            </button>
            <button
              className="secondary"
              style={{ textAlign: 'left', border: 0, fontSize: 13, padding: '7px 10px', justifyContent: 'flex-start' }}
              onClick={handleToggleArchive}
            >
              <IconArchive size={15} />
              <span>{document.status === 'archived' ? 'Mở lưu trữ' : 'Lưu trữ (Archive)'}</span>
            </button>
            <button
              className="secondary danger"
              style={{ textAlign: 'left', border: 0, fontSize: 13, padding: '7px 10px', justifyContent: 'flex-start' }}
              onClick={handleDelete}
            >
              <IconTrash size={15} />
              <span>Xóa tài liệu</span>
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
        {/* Cover thumbnail */}
        <div
          className="docThumb"
          style={{
            background: document.thumbnail ? '#2c2a26' : (document.status === 'completed'
              ? 'linear-gradient(135deg, var(--sage), #3c5443)'
              : 'linear-gradient(135deg, var(--dusty-blue), #697a8c)'),
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'inset 2px 0 5px rgba(0,0,0,0.15), 0 3px 10px rgba(0,0,0,0.06)'
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
              lineHeight: 1.35,
              position: 'relative',
              zIndex: 2,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontWeight: 700
            }}>
              {document.title}
            </span>
          )}

          {/* Format badge: PDF in rose-soft */}
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'var(--sf-rose-soft)',
              color: 'var(--sf-rose)',
              border: '1px solid rgba(217, 131, 131, 0.35)',
              padding: '2px 6px',
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 700,
              zIndex: 2,
              letterSpacing: '0.04em'
            }}
          >
            PDF
          </span>

          {document.status === 'completed' && (
            <span
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'var(--sf-sage-soft)',
                color: 'var(--sf-sage)',
                border: '1px solid rgba(111, 141, 119, 0.4)',
                padding: '3px 8px',
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 700,
                zIndex: 2,
                backdropFilter: 'blur(4px)'
              }}
            >
              ✓ Đã xong
            </span>
          )}

          {document.status === 'archived' && (
            <span
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'var(--card-subtle)',
                color: 'var(--muted)',
                border: '1px solid var(--line)',
                padding: '3px 8px',
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
                zIndex: 2
              }}
            >
              📁 Đã lưu trữ
            </span>
          )}
        </div>

        {/* Metadata */}
        <div className="docMeta">
          <strong
            style={{
              fontSize: 14,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
              marginTop: 10
            }}
            title={document.title}
          >
            {document.title}
          </strong>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, minHeight: 20 }}>
            {document.tags.slice(0, 3).map(t => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--sf-apricot-soft)',
                  color: 'var(--sf-terracotta)',
                  border: '1px solid rgba(233, 161, 122, 0.35)',
                  fontWeight: 500
                }}
              >
                {t}
              </span>
            ))}
            {document.tags.length > 3 && (
              <span className="muted" style={{ fontSize: 11 }}>+{document.tags.length - 3}</span>
            )}
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

          <div style={{ marginTop: 10 }}>
            <CassetteProgress value={pct} variant="mini" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
              <span>Trang {currentPage} / {totalPages || '—'}</span>
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
            background: 'rgba(0,0,0,0.45)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
          onClick={() => setIsRenaming(false)}
        >
          <div className="card" style={{ padding: 22, width: 'min(380px, 100%)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 10px' }}>Đổi tên tài liệu</h4>
            <form onSubmit={handleRename} style={{ display: 'grid', gap: 12 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                placeholder="Nhập tên hiển thị mới"
                autoFocus
                style={{ padding: '9px 12px', borderRadius: 10 }}
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
            background: 'rgba(0,0,0,0.45)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
          onClick={() => setIsManagingTags(false)}
        >
          <div className="card" style={{ padding: 22, width: 'min(380px, 100%)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 6px' }}>Quản lý tags</h4>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>Nhập các tag cách nhau bởi dấu phẩy (vd: Khoa học, Triết học, Tâm lý)</p>
            <form onSubmit={handleSaveTags} style={{ display: 'grid', gap: 12 }}>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="Khoa học, Tâm lý học, Lập trình"
                autoFocus
                style={{ padding: '9px 12px', borderRadius: 10 }}
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
