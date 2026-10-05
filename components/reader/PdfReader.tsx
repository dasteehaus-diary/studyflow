'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { localDB, type LocalDocument, type LocalProgress, type LocalHighlight, type LocalNote, type HighlightColor } from '@/lib/db/local';
import { readPdfFromOPFS, pdfExistsInOPFS } from '@/lib/storage/opfs';
import { mergePagesIntoRanges, cassetteProgress } from '@/lib/progress/cassette';
import { enqueueSync } from '@/lib/sync/sync-service';
import { CassetteProgress } from '@/components/CassetteProgress';
import { PdfPageItem } from './PdfPageItem';
import { HighlightToolbar } from './HighlightToolbar';
import { NotesPanel } from './NotesPanel';
import { ResumeToast } from './ResumeToast';
import { FinishTapeModal } from './FinishTapeModal';
import { ImportPdfModal } from '@/components/ImportPdfModal';

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PdfReaderProps {
  documentId: string;
  initialPage?: number;
  initialY?: number;
  initialHighlightId?: string;
}

export function PdfReader({ documentId, initialPage, initialY, initialHighlightId }: PdfReaderProps) {
  const [doc, setDoc] = useState<LocalDocument | null>(null);
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [currentY, setCurrentY] = useState<number>(initialY || 0);

  // UI modes
  const [notesOpen, setNotesOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<'warm' | 'white' | 'dark'>('warm');
  const [scale, setScale] = useState<number>(1.15);
  const [finishTapeOpen, setFinishTapeOpen] = useState(false);
  const [relinkModalOpen, setRelinkModalOpen] = useState(false);

  // Selection & Highlight toolbar state
  const [selectionToolbarPos, setSelectionToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedRects, setSelectedRects] = useState<LocalHighlight['rects']>([]);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [lastHighlightColor, setLastHighlightColor] = useState<HighlightColor>('apricot');

  // Highlight click popup state
  const [activeHighlightPopup, setActiveHighlightPopup] = useState<{ highlight: LocalHighlight; pos: { x: number; y: number } } | null>(null);

  // External composer trigger for notes panel
  const [initialComposerQuote, setInitialComposerQuote] = useState<string | null>(null);
  const [initialComposerType, setInitialComposerType] = useState<'quick' | 'question' | 'parking'>('quick');

  // Visited pages set for cassette coverage
  const visitedPagesRef = useRef<Set<number>>(new Set());

  // Stage scrolling ref
  const stageRef = useRef<HTMLDivElement>(null);
  const hasRestoredInitialScroll = useRef(false);

  // Reading session timer
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const activeSecondsRef = useRef<number>(0);
  const lastInteractionTimeRef = useRef<number>(Date.now());

  // Load document, progress, highlights, and notes from Dexie
  const loadData = useCallback(async () => {
    if (!localDB) return;

    const documentData = await localDB.documents.get(documentId);
    if (!documentData) return;
    setDoc(documentData);

    const progressData = await localDB.progress.get(documentId);
    if (progressData) {
      setProgress(progressData);
      if (!initialPage && progressData.currentPage) {
        setCurrentPage(progressData.currentPage);
      }
      if (initialY === undefined && progressData.y !== undefined) {
        setCurrentY(progressData.y);
      }
      // Populate visited pages from existing visitedRanges
      progressData.visitedRanges.forEach(([start, end]) => {
        for (let p = start; p <= end; p++) {
          visitedPagesRef.current.add(p);
        }
      });
    }

    const hlData = await localDB.highlights.where('documentId').equals(documentId).toArray();
    setHighlights(hlData);

    const noteData = await localDB.notes.where('documentId').equals(documentId).toArray();
    setNotes(noteData);

    // Read PDF file from OPFS
    const exists = await pdfExistsInOPFS(documentId);
    if (!exists) {
      setFileMissing(true);
    } else {
      setFileMissing(false);
      try {
        const file = await readPdfFromOPFS(documentId);
        setPdfFile(file);
      } catch (err) {
        console.error('Failed to read PDF from OPFS:', err);
        setFileMissing(true);
      }
    }
  }, [documentId, initialPage, initialY]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Session timer tracking (idle timeout: 2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      // If user interacted within the last 120 seconds, increment activeSeconds
      if (now - lastInteractionTimeRef.current < 120_000) {
        activeSecondsRef.current += 1;
      }
    }, 1000);

    const handleUserActivity = () => {
      lastInteractionTimeRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('scroll', handleUserActivity, { passive: true });

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);

      // Save reading session on unmount
      if (activeSecondsRef.current > 5 && localDB) {
        const now = new Date().toISOString();
        const sessionId = crypto.randomUUID();
        const sessionRecord = {
          id: sessionId,
          documentId,
          startedAt: sessionStartRef.current,
          endedAt: now,
          activeSeconds: activeSecondsRef.current,
          startLocator: { page: initialPage || 1, y: 0 },
          endLocator: { page: currentPage, y: currentY },
          updatedAt: now
        };
        localDB.readingSessions.add(sessionRecord).catch(console.error);
        enqueueSync('session', sessionId, 'upsert', sessionRecord).catch(console.error);
      }
    };
  }, [documentId, currentPage, currentY, initialPage]);

  // Handle PDF loaded document metadata
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    if (localDB && doc && doc.totalPages !== numPages) {
      localDB.documents.update(documentId, { totalPages: numPages });
      enqueueSync('document', documentId, 'upsert', { ...doc, totalPages: numPages });
    }
  };

  // Restore initial scroll position once PDF is rendered
  useEffect(() => {
    if (hasRestoredInitialScroll.current || totalPages <= 0) return;

    const targetPage = initialPage || progress?.currentPage || 1;
    const targetY = initialY !== undefined ? initialY : (progress?.y || 0);

    const timer = setTimeout(() => {
      jumpToPageAndY(targetPage, targetY);
      hasRestoredInitialScroll.current = true;
    }, 400);

    return () => clearTimeout(timer);
  }, [totalPages, initialPage, initialY, progress]);

  // Debounced progress saver
  const saveProgressDebounced = useCallback((page: number, y: number) => {
    if (!localDB) return;

    visitedPagesRef.current.add(page);
    const pagesArray = Array.from(visitedPagesRef.current);
    const updatedRanges = mergePagesIntoRanges(pagesArray);
    const now = new Date().toISOString();

    const updatedProg: LocalProgress = {
      documentId,
      currentPage: page,
      y: Number(y.toFixed(4)),
      visitedRanges: updatedRanges,
      completed: progress?.completed ?? false,
      lastMeaningfulActivityAt: now,
      updatedAt: now
    };

    setProgress(updatedProg);
    localDB.progress.put(updatedProg).catch(console.error);
    enqueueSync('progress', documentId, 'upsert', updatedProg).catch(console.error);
  }, [documentId, progress?.completed]);

  // Scroll listener to update visible page and y offset
  const handleScroll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    lastInteractionTimeRef.current = Date.now();

    const stageRect = stage.getBoundingClientRect();
    const scrollTop = stage.scrollTop;

    // Detect which page container is currently in view
    for (let p = 1; p <= totalPages; p++) {
      const pageEl = document.getElementById(`page-container-${p}`);
      if (!pageEl) continue;

      const pageTop = pageEl.offsetTop - stage.offsetTop;
      const pageHeight = pageEl.offsetHeight;

      if (scrollTop >= pageTop - 100 && scrollTop < pageTop + pageHeight - 50) {
        if (p !== currentPage) {
          setCurrentPage(p);
        }
        const relY = Math.max(0, Math.min(1, (scrollTop - pageTop) / (pageHeight || 1)));
        setCurrentY(relY);
        saveProgressDebounced(p, relY);
        break;
      }
    }
  }, [totalPages, currentPage, saveProgressDebounced]);

  // Jump to exact page and vertical position (Note <-> Source)
  const jumpToPageAndY = (page: number, y: number, highlightId?: string) => {
    const stage = stageRef.current;
    const pageEl = document.getElementById(`page-container-${page}`);
    if (!stage || !pageEl) return;

    const pageTop = pageEl.offsetTop - stage.offsetTop;
    const pageHeight = pageEl.offsetHeight;
    const targetScroll = pageTop + (y * pageHeight);

    stage.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    setCurrentPage(page);
    setCurrentY(y);
    saveProgressDebounced(page, y);

    // If highlight specified, temporarily flash it
    if (highlightId) {
      setTimeout(() => {
        const hl = highlights.find(h => h.id === highlightId);
        if (hl) {
          setActiveHighlightPopup({ highlight: hl, pos: { x: window.innerWidth / 2, y: 150 } });
        }
      }, 500);
    }
  };

  // Text selection handler
  const handleTextSelected = (
    pageNum: number,
    text: string,
    rects: LocalHighlight['rects'],
    clientPos: { x: number; y: number }
  ) => {
    setSelectedPageNum(pageNum);
    setSelectedText(text);
    setSelectedRects(rects);
    setSelectionToolbarPos(clientPos);
  };

  // Create highlight
  const handleCreateHighlight = async (color: HighlightColor) => {
    if (!localDB || !selectedText) return;

    setLastHighlightColor(color);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const newHl: LocalHighlight = {
      id,
      documentId,
      page: selectedPageNum,
      locator: { page: selectedPageNum, y: currentY },
      quoteText: selectedText,
      color,
      rects: selectedRects,
      createdAt: now,
      updatedAt: now
    };

    await localDB.highlights.add(newHl);
    setHighlights(prev => [...prev, newHl]);
    await enqueueSync('highlight', id, 'upsert', newHl);

    // Meaningful activity
    await localDB.progress.update(documentId, {
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });

    setSelectionToolbarPos(null);
    setSelectedText('');
  };

  // Trigger quick note from selection toolbar
  const handleAddNoteFromSelection = (quote: string) => {
    setInitialComposerQuote(quote);
    setInitialComposerType('quick');
    setNotesOpen(true);
    setSelectionToolbarPos(null);
  };

  // Trigger question from selection toolbar
  const handleAddQuestionFromSelection = (quote: string) => {
    setInitialComposerQuote(quote);
    setInitialComposerType('question');
    setNotesOpen(true);
    setSelectionToolbarPos(null);
  };

  // Delete highlight
  const handleDeleteHighlight = async (highlightId: string) => {
    if (!localDB) return;
    await localDB.highlights.delete(highlightId);
    setHighlights(prev => prev.filter(h => h.id !== highlightId));
    await enqueueSync('highlight', highlightId, 'delete', { id: highlightId });
    setActiveHighlightPopup(null);
  };

  // Change highlight color
  const handleChangeHighlightColor = async (highlightId: string, color: HighlightColor) => {
    if (!localDB) return;
    const now = new Date().toISOString();
    await localDB.highlights.update(highlightId, { color, updatedAt: now });
    setHighlights(prev => prev.map(h => h.id === highlightId ? { ...h, color, updatedAt: now } : h));
    const hl = highlights.find(h => h.id === highlightId);
    if (hl) {
      await enqueueSync('highlight', highlightId, 'upsert', { ...hl, color, updatedAt: now });
    }
    setActiveHighlightPopup(null);
  };

  // Active parking note and open question for Resume Toast
  const activeParkingNote = useMemo(() => {
    return notes.find(n => n.type === 'parking' && !!n.isActiveParking) ?? null;
  }, [notes]);

  const openQuestion = useMemo(() => {
    return notes.find(n => n.type === 'question' && n.status !== 'resolved') ?? null;
  }, [notes]);

  // Cassette coverage percentage
  const coveragePct = useMemo(() => {
    if (!progress) return 0;
    return cassetteProgress(totalPages, progress.visitedRanges);
  }, [progress, totalPages]);

  // Background style based on surrounding theme
  const getThemeBg = () => {
    if (theme === 'white') return '#ffffff';
    if (theme === 'dark') return '#1e211e';
    return '#ebe7df'; // warm default
  };

  return (
    <div className="readerShell" style={{ background: getThemeBg() }}>
      {/* Top Header */}
      {!focusMode && (
        <header className="readerTop">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/" className="secondary" style={{ fontSize: 13, padding: '6px 12px' }}>
              ← Library
            </Link>
            <strong style={{ fontSize: 15, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc?.title || 'Tài liệu'}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Page navigation */}
            <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Trang</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const p = parseInt(e.target.value, 10);
                  if (!isNaN(p) && p >= 1 && p <= totalPages) {
                    jumpToPageAndY(p, 0);
                  }
                }}
                style={{ width: 44, textAlign: 'center', padding: '2px 4px', borderRadius: 6, border: '1px solid var(--line)' }}
              />
              <span>/ {totalPages}</span>
            </div>

            {/* Zoom controls */}
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={() => setScale(s => Math.max(0.7, s - 0.15))}
                title="Thu nhỏ"
              >
                －
              </button>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={() => setScale(1.15)}
                title="Fit Width chuẩn"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12 }}
                onClick={() => setScale(s => Math.min(2.5, s + 0.15))}
                title="Phóng to"
              >
                ＋
              </button>
            </div>

            {/* Theme surrounding selector */}
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12, ...(theme === 'warm' ? { background: '#ded9ce' } : {}) }}
                onClick={() => setTheme('warm')}
                title="Surrounding: Ấm áp"
              >
                ☕
              </button>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12, ...(theme === 'white' ? { background: '#ded9ce' } : {}) }}
                onClick={() => setTheme('white')}
                title="Surrounding: Trắng"
              >
                ⚪
              </button>
              <button
                className="secondary"
                style={{ padding: '4px 8px', fontSize: 12, ...(theme === 'dark' ? { background: '#ded9ce' } : {}) }}
                onClick={() => setTheme('dark')}
                title="Surrounding: Tối"
              >
                🌙
              </button>
            </div>

            {/* Notes Panel toggle */}
            <button
              className="secondary"
              style={{
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                ...(notesOpen ? { background: '#eee8dc' } : {})
              }}
              onClick={() => setNotesOpen(!notesOpen)}
            >
              <span>✎ Notes</span>
              {notes.length > 0 && (
                <span
                  style={{
                    background: 'var(--terracotta)',
                    color: 'white',
                    borderRadius: 999,
                    fontSize: 10,
                    padding: '1px 6px',
                    fontWeight: 700
                  }}
                >
                  {notes.length}
                </span>
              )}
            </button>

            {/* Focus Mode button */}
            <button
              className="secondary"
              style={{ fontSize: 13 }}
              onClick={() => setFocusMode(true)}
              title="Chế độ tập trung"
            >
              ⛶ Focus
            </button>
          </div>
        </header>
      )}

      {/* Focus mode exit button */}
      {focusMode && (
        <button
          className="secondary"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 100,
            opacity: 0.6,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
          onClick={() => setFocusMode(false)}
        >
          ✕ Exit Focus
        </button>
      )}

      {/* Main Reader Stage + Notes Panel */}
      <div className={`readerBody ${notesOpen ? 'notesOpen' : ''}`}>
        <main
          className="pdfStage"
          ref={stageRef}
          onScroll={handleScroll}
          style={{ position: 'relative' }}
        >
          {fileMissing ? (
            <div className="card" style={{ maxWidth: 480, padding: 32, textAlign: 'center', margin: '60px auto' }}>
              <h3>⚠️ File PDF chưa có trên thiết bị này</h3>
              <p className="muted" style={{ lineHeight: 1.5, margin: '12px 0 20px' }}>
                StudyFlow không tải file PDF lên cloud nhằm bảo vệ sự riêng tư. Vui lòng chọn lại file PDF gốc trên máy bạn để tiếp tục.
              </p>
              <button className="primary" onClick={() => setRelinkModalOpen(true)}>
                📂 Relink PDF ngay
              </button>
            </div>
          ) : !pdfFile ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
              Đang tải tài liệu từ bộ nhớ OPFS…
            </div>
          ) : (
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div style={{ padding: 40, color: 'var(--muted)' }}>Đang chuẩn bị trang PDF…</div>}
              error={<div style={{ padding: 40, color: 'var(--terracotta)' }}>Lỗi khi hiển thị file PDF.</div>}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                // Windowing / virtualization: render pages in active window [currentPage - 1, currentPage, currentPage + 1]
                const isMounted = Math.abs(pageNum - currentPage) <= 1;
                const pageHighlights = highlights.filter(h => h.page === pageNum);

                return (
                  <PdfPageItem
                    key={pageNum}
                    pageNumber={pageNum}
                    scale={scale}
                    isMounted={isMounted}
                    estimatedHeight={1050 * (scale / 1.15)}
                    highlights={pageHighlights}
                    onTextSelected={handleTextSelected}
                    onHighlightClick={(hl, pos) => setActiveHighlightPopup({ highlight: hl, pos })}
                  />
                );
              })}
            </Document>
          )}
        </main>

        {/* Slide-over Notes Panel */}
        {notesOpen && (
          <NotesPanel
            documentId={documentId}
            currentPage={currentPage}
            currentY={currentY}
            notes={notes}
            highlights={highlights}
            isOpen={notesOpen}
            onClose={() => setNotesOpen(false)}
            onJumpToSource={jumpToPageAndY}
            initialComposerQuote={initialComposerQuote}
            initialComposerType={initialComposerType}
            onClearInitialComposer={() => {
              setInitialComposerQuote(null);
            }}
          />
        )}
      </div>

      {/* Bottom bar with Cassette Progress and Finish Tape CTA */}
      {!focusMode && (
        <footer className="readerBottom" style={{ justifyContent: 'space-between' }}>
          <div style={{ flex: 1, maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <CassetteProgress value={coveragePct} />
            </div>

            {/* Finish Tape Button */}
            {(currentPage >= totalPages - 1 || coveragePct >= 85 || doc?.status === 'completed') && (
              <button
                className="primary"
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  background: doc?.status === 'completed' ? 'var(--olive)' : 'var(--terracotta)'
                }}
                onClick={() => setFinishTapeOpen(true)}
              >
                {doc?.status === 'completed' ? '✨ B-Side Mystery' : '📼 Finish Tape'}
              </button>
            )}
          </div>
        </footer>
      )}

      {/* Floating Selection Toolbar */}
      <HighlightToolbar
        position={selectionToolbarPos}
        selectedText={selectedText}
        defaultColor={lastHighlightColor}
        onHighlight={handleCreateHighlight}
        onAddNote={handleAddNoteFromSelection}
        onAddQuestion={handleAddQuestionFromSelection}
        onClose={() => {
          setSelectionToolbarPos(null);
          setSelectedText('');
        }}
      />

      {/* Highlight click popup */}
      {activeHighlightPopup && (
        <div
          style={{
            position: 'fixed',
            left: activeHighlightPopup.pos.x,
            top: activeHighlightPopup.pos.y - 48,
            transform: 'translateX(-50%)',
            zIndex: 1001,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          {(['apricot', 'rose', 'olive', 'blue'] as HighlightColor[]).map((c) => (
            <button
              key={c}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: c === 'apricot' ? '#f6a56e' : c === 'rose' ? '#ea9090' : c === 'olive' ? '#dace8d' : '#97a8bc',
                border: '1px solid #fff',
                cursor: 'pointer'
              }}
              onClick={() => handleChangeHighlightColor(activeHighlightPopup.highlight.id, c)}
              title={`Đổi màu sang ${c}`}
            />
          ))}
          <button
            className="secondary danger"
            style={{ fontSize: 11, padding: '2px 6px', border: 0 }}
            onClick={() => handleDeleteHighlight(activeHighlightPopup.highlight.id)}
          >
            🗑️ Xóa
          </button>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '2px 6px', border: 0 }}
            onClick={() => setActiveHighlightPopup(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dismissible Resume Toast */}
      <ResumeToast
        page={currentPage}
        activeParkingNote={activeParkingNote}
        openQuestion={openQuestion}
        onDismiss={() => {}}
      />

      {/* Finish Tape & Mystery Gift Modal */}
      {doc && (
        <FinishTapeModal
          document={doc}
          isOpen={finishTapeOpen}
          onClose={() => setFinishTapeOpen(false)}
          onFinishTapeCompleted={loadData}
        />
      )}

      {/* Relink PDF Modal */}
      {doc && (
        <ImportPdfModal
          isOpen={relinkModalOpen}
          onClose={() => setRelinkModalOpen(false)}
          relinkTarget={doc}
          onImportComplete={() => {
            setRelinkModalOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
