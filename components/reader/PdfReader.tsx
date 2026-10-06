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
import { useSettings } from '@/lib/settings/settings-context';
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
  const { settings, updateSettings } = useSettings();

  const [doc, setDoc] = useState<LocalDocument | null>(null);
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(initialPage || 1);
  const [currentY, setCurrentY] = useState<number>(initialY || 0);

  // UI modes & Reader view state
  const [notesOpen, setNotesOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<'warm' | 'white' | 'dark'>(settings.readerBg || 'warm');
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-page' | 'free'>(settings.fitMode || 'fit-width');
  const [scale, setScale] = useState<number>(1.15);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [pageInputVal, setPageInputVal] = useState<string>(String(initialPage || 1));
  const [finishTapeOpen, setFinishTapeOpen] = useState(false);
  const [relinkModalOpen, setRelinkModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Quick Parking Note dock (Requirement 7)
  const [quickParkOpen, setQuickParkOpen] = useState(false);
  const [quickParkText, setQuickParkText] = useState('');
  const [quickParkNotification, setQuickParkNotification] = useState<string | null>(null);

  // Selection & Highlight toolbar state
  const [selectionToolbarPos, setSelectionToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedRects, setSelectedRects] = useState<LocalHighlight['rects']>([]);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [lastHighlightColor, setLastHighlightColor] = useState<HighlightColor>(settings.defaultHlColor || 'apricot');

  // Highlight click popup state
  const [activeHighlightPopup, setActiveHighlightPopup] = useState<{ highlight: LocalHighlight; pos: { x: number; y: number } } | null>(null);

  // External composer trigger for notes panel (Requirement 4)
  const [initialComposerQuote, setInitialComposerQuote] = useState<string | null>(null);
  const [initialComposerType, setInitialComposerType] = useState<'quick' | 'question' | 'parking'>('quick');
  const [initialComposerPage, setInitialComposerPage] = useState<number | undefined>(undefined);
  const [initialComposerY, setInitialComposerY] = useState<number | undefined>(undefined);
  const [initialComposerHighlightId, setInitialComposerHighlightId] = useState<string | undefined>(undefined);

  // Visited pages set for cassette coverage
  const visitedPagesRef = useRef<Set<number>>(new Set());

  // Stage scrolling ref
  const stageRef = useRef<HTMLDivElement>(null);
  const hasRestoredInitialScroll = useRef(false);

  // Throttled progress persistence refs (Requirement 3)
  const pendingProgressRef = useRef<{ page: number; y: number } | null>(null);
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPersistedLocatorRef = useRef<{ page: number; y: number }>({ page: initialPage || 1, y: initialY || 0 });

  // Reading session tracking refs (Requirement 2 - prevents duplicate writes on scroll)
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const activeSecondsRef = useRef<number>(0);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const sessionSavedRef = useRef<boolean>(false);
  const startLocatorRef = useRef<{ page: number; y: number }>({ page: initialPage || 1, y: initialY || 0 });
  const currentLocatorRef = useRef<{ page: number; y: number }>({ page: initialPage || 1, y: initialY || 0 });

  // Stable refs for progress & current page to decouple session lifecycle from scroll updates
  const progressRef = useRef<LocalProgress | null>(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const currentPageRef = useRef<number>(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
    setPageInputVal(String(currentPage));
  }, [currentPage]);

  // Page elements map to eliminate O(N) DOM query loops on scroll
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map());

  // Real Fit Scale Calculation (Fit Width / Fit Page based on real viewport and PDF geometry)
  const recalculateFitScale = useCallback(() => {
    if (fitMode === 'free' || !stageRef.current || !pageDimensions) return;
    const stage = stageRef.current;
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    if (stageWidth <= 0 || pageDimensions.width <= 0) return;

    // Available stage width and height excluding comfortable padding
    const availableWidth = Math.max(260, stageWidth - 48);
    const availableHeight = Math.max(280, stageHeight - 56);

    if (fitMode === 'fit-width') {
      const calculatedScale = Number((availableWidth / pageDimensions.width).toFixed(3));
      const clampedScale = Math.max(0.4, Math.min(3.0, calculatedScale));
      setScale(clampedScale);
    } else if (fitMode === 'fit-page') {
      const scaleX = availableWidth / pageDimensions.width;
      const scaleY = availableHeight / pageDimensions.height;
      const calculatedScale = Number((Math.min(scaleX, scaleY)).toFixed(3));
      const clampedScale = Math.max(0.4, Math.min(3.0, calculatedScale));
      setScale(clampedScale);
    }
  }, [fitMode, pageDimensions]);

  useEffect(() => {
    recalculateFitScale();
  }, [recalculateFitScale]);

  // Stage resize observer & window resize listener
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || fitMode === 'free') return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        recalculateFitScale();
      });
      ro.observe(stage);
    } else {
      const handleResize = () => recalculateFitScale();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    return () => {
      ro?.disconnect();
    };
  }, [fitMode, recalculateFitScale]);

  // Apply default settings from context and live updates
  useEffect(() => {
    if (settings.readerBg) {
      setTheme(settings.readerBg);
    }
    if (settings.defaultHlColor) {
      setLastHighlightColor(settings.defaultHlColor);
    }
    if (settings.fitMode && settings.fitMode !== 'free') {
      setFitMode(settings.fitMode);
    }
  }, [settings]);

  // Theme change with persistence
  const handleSetReaderTheme = (t: 'warm' | 'white' | 'dark') => {
    setTheme(t);
    updateSettings({ readerBg: t }).catch(console.error);
  };

  // Fit mode change with persistence
  const handleSetFitMode = (mode: 'fit-width' | 'fit-page') => {
    setFitMode(mode);
    updateSettings({ fitMode: mode }).catch(console.error);
  };

  // Manual zoom controls (switch to free mode)
  const handleZoomIn = () => {
    setFitMode('free');
    setScale(s => Math.min(2.5, Number((s + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setFitMode('free');
    setScale(s => Math.max(0.4, Number((s - 0.15).toFixed(2))));
  };

  const handlePageDimensions = useCallback((width: number, height: number) => {
    setPageDimensions(prev => {
      if (!prev || Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
        return { width, height };
      }
      return prev;
    });
  }, []);

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
        currentLocatorRef.current.page = progressData.currentPage;
      }
      if (initialY === undefined && progressData.y !== undefined) {
        setCurrentY(progressData.y);
        currentLocatorRef.current.y = progressData.y;
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

  // Flush pending progress helper (stable callback depending only on documentId)
  const flushProgressNow = useCallback(() => {
    if (!localDB || !pendingProgressRef.current) return;
    const { page, y } = pendingProgressRef.current;
    visitedPagesRef.current.add(page);
    const pagesArray = Array.from(visitedPagesRef.current);
    const updatedRanges = mergePagesIntoRanges(pagesArray);
    const now = new Date().toISOString();

    const isMeaningfulMovement =
      Math.abs(page - lastPersistedLocatorRef.current.page) >= 1 ||
      Math.abs(y - lastPersistedLocatorRef.current.y) > 0.12;

    const currentProg = progressRef.current;
    const updatedProg: LocalProgress = {
      documentId,
      currentPage: page,
      y: Number(y.toFixed(4)),
      visitedRanges: updatedRanges,
      completed: currentProg?.completed ?? false,
      lastMeaningfulActivityAt: isMeaningfulMovement ? now : (currentProg?.lastMeaningfulActivityAt || now),
      updatedAt: now
    };

    lastPersistedLocatorRef.current = { page, y };
    pendingProgressRef.current = null;
    setProgress(updatedProg);
    localDB.progress.put(updatedProg).catch(console.error);
    enqueueSync('progress', documentId, 'upsert', updatedProg).catch(console.error);
  }, [documentId]);

  const flushProgressRef = useRef(flushProgressNow);
  useEffect(() => {
    flushProgressRef.current = flushProgressNow;
  }, [flushProgressNow]);

  // Stable session persistence callback
  const persistSession = useCallback(() => {
    if (sessionSavedRef.current || activeSecondsRef.current < 5 || !localDB) return;
    sessionSavedRef.current = true;
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const sessionRecord = {
      id: sessionId,
      documentId,
      startedAt: sessionStartRef.current,
      endedAt: now,
      activeSeconds: activeSecondsRef.current,
      startLocator: startLocatorRef.current,
      endLocator: currentLocatorRef.current,
      updatedAt: now
    };
    localDB.readingSessions.add(sessionRecord).catch(console.error);
    enqueueSync('session', sessionId, 'upsert', sessionRecord).catch(console.error);
  }, [documentId]);

  const persistSessionRef = useRef(persistSession);
  useEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  // Requirement 1 & 2: Reading session tracking lifecycle
  // Effect initializes strictly ONCE per documentId, completely isolated from progress/scroll updates
  useEffect(() => {
    sessionSavedRef.current = false;
    sessionStartRef.current = new Date().toISOString();
    activeSecondsRef.current = 0;

    const interval = setInterval(() => {
      const now = Date.now();
      // Idle timeout: 120 seconds
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushProgressRef.current();
        persistSessionRef.current();
      }
    };

    const handlePageHide = () => {
      flushProgressRef.current();
      persistSessionRef.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);

      flushProgressRef.current();
      persistSessionRef.current();
    };
  }, [documentId]);

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

  // Requirement 3: Debounced progress persistence (750ms throttle)
  const scheduleProgressPersistence = useCallback((page: number, y: number) => {
    pendingProgressRef.current = { page, y };

    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

    progressSaveTimerRef.current = setTimeout(() => {
      flushProgressNow();
    }, 750);
  }, [flushProgressNow]);

  // Requirement 5: Optimized scroll listener with O(1) fast-path and O(log N) binary search
  // Eliminates O(N) looping and document.getElementById DOM tree traversal on every scroll event
  const handleScroll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || totalPages <= 0) return;

    lastInteractionTimeRef.current = Date.now();
    const scrollTop = stage.scrollTop;
    const stageOffsetTop = stage.offsetTop;

    const checkPage = (p: number) => {
      let pageEl = pageElementsRef.current.get(p);
      if (!pageEl) {
        const el = document.getElementById(`page-container-${p}`);
        if (el) {
          pageElementsRef.current.set(p, el);
          pageEl = el;
        }
      }
      if (!pageEl) return null;

      const pageTop = pageEl.offsetTop - stageOffsetTop;
      const pageHeight = pageEl.offsetHeight || 1;
      const inView = scrollTop >= pageTop - 100 && scrollTop < pageTop + pageHeight - 50;
      const relY = Math.max(0, Math.min(1, (scrollTop - pageTop) / pageHeight));

      return { inView, relY, pageTop, pageHeight, page: p };
    };

    let matched: { page: number; relY: number } | null = null;
    const curr = currentPageRef.current;

    // 1. Fast Path (O(1)): check current page and immediate neighbors
    const fastCandidates = [curr, curr + 1, curr - 1, curr + 2, curr - 2];
    for (const p of fastCandidates) {
      if (p >= 1 && p <= totalPages) {
        const res = checkPage(p);
        if (res?.inView) {
          matched = { page: res.page, relY: res.relY };
          break;
        }
      }
    }

    // 2. Binary search fallback for rapid scrubbing / scroll jumps (O(log N))
    if (!matched) {
      let low = 1;
      let high = totalPages;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const res = checkPage(mid);
        if (!res) {
          low++;
          continue;
        }
        if (res.inView) {
          matched = { page: res.page, relY: res.relY };
          break;
        }
        if (scrollTop < res.pageTop - 100) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
    }

    if (matched) {
      const { page, relY } = matched;
      if (page !== currentPageRef.current) {
        setCurrentPage(page);
      }
      setCurrentY(relY);
      currentLocatorRef.current = { page, y: relY };
      scheduleProgressPersistence(page, relY);
    }
  }, [totalPages, scheduleProgressPersistence]);

  // Jump to exact page and vertical position (Note <-> Source)
  const jumpToPageAndY = (page: number, y: number, highlightId?: string) => {
    const stage = stageRef.current;
    let pageEl = pageElementsRef.current.get(page);
    if (!pageEl) {
      const el = document.getElementById(`page-container-${page}`);
      if (el) {
        pageElementsRef.current.set(page, el);
        pageEl = el;
      }
    }
    if (!stage || !pageEl) return;

    const pageTop = pageEl.offsetTop - stage.offsetTop;
    const pageHeight = pageEl.offsetHeight;
    const targetScroll = pageTop + (y * pageHeight);

    stage.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    setCurrentPage(page);
    setCurrentY(y);
    currentLocatorRef.current = { page, y };
    scheduleProgressPersistence(page, y);

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
    const yVal = selectedRects.length > 0 ? selectedRects[0].y : currentY;

    const newHl: LocalHighlight = {
      id,
      documentId,
      page: selectedPageNum,
      locator: { page: selectedPageNum, y: yVal },
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
    return id;
  };

  // Requirement 4: Selection -> Note Source Accuracy (Links highlight and passes exact page/locator)
  const handleAddNoteFromSelection = async (quote: string) => {
    const hlId = await handleCreateHighlight(lastHighlightColor);
    const yVal = selectedRects.length > 0 ? selectedRects[0].y : currentY;

    setInitialComposerQuote(quote);
    setInitialComposerType('quick');
    setInitialComposerPage(selectedPageNum);
    setInitialComposerY(yVal);
    setInitialComposerHighlightId(hlId);
    setNotesOpen(true);
    setSelectionToolbarPos(null);
  };

  // Requirement 4: Selection -> Question Source Accuracy
  const handleAddQuestionFromSelection = async (quote: string) => {
    const hlId = await handleCreateHighlight(lastHighlightColor);
    const yVal = selectedRects.length > 0 ? selectedRects[0].y : currentY;

    setInitialComposerQuote(quote);
    setInitialComposerType('question');
    setInitialComposerPage(selectedPageNum);
    setInitialComposerY(yVal);
    setInitialComposerHighlightId(hlId);
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

  // Requirement 7: Quick Parking Note submit handler
  const handleSaveQuickPark = async () => {
    if (!localDB || !quickParkText.trim()) return;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Deactivate previous active parking notes
    const existing = await localDB.notes
      .where('documentId')
      .equals(documentId)
      .filter(n => n.type === 'parking' && !!n.isActiveParking)
      .toArray();

    for (const p of existing) {
      await localDB.notes.update(p.id, { isActiveParking: false, updatedAt: now });
      await enqueueSync('note', p.id, 'upsert', { ...p, isActiveParking: false, updatedAt: now });
    }

    const newNote: LocalNote = {
      id,
      documentId,
      type: 'parking',
      noteText: quickParkText.trim(),
      page: currentPage,
      y: currentY,
      locator: { page: currentPage, y: currentY },
      isActiveParking: true,
      createdAt: now,
      updatedAt: now
    };

    await localDB.notes.add(newNote);
    await enqueueSync('note', id, 'upsert', newNote);
    setNotes(prev => [...prev.map(n => n.type === 'parking' ? { ...n, isActiveParking: false } : n), newNote]);

    await localDB.progress.update(documentId, {
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });

    setQuickParkText('');
    setQuickParkOpen(false);
    setQuickParkNotification('📌 Đã lưu Parking Note cho lần đọc tới.');
    setTimeout(() => setQuickParkNotification(null), 3000);
  };

  // Requirement 8: Desktop Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput = activeEl && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
        activeEl.isContentEditable
      );

      // ESC closes open modals / panels / toolbars
      if (e.key === 'Escape') {
        if (shortcutsModalOpen) { setShortcutsModalOpen(false); return; }
        if (quickParkOpen) { setQuickParkOpen(false); return; }
        if (mobileMenuOpen) { setMobileMenuOpen(false); return; }
        if (selectionToolbarPos) { setSelectionToolbarPos(null); return; }
        if (activeHighlightPopup) { setActiveHighlightPopup(null); return; }
        if (notesOpen) { setNotesOpen(false); return; }
        if (focusMode) { setFocusMode(false); return; }
        return;
      }

      if (isInput) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFocusMode(prev => !prev);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setInitialComposerType('quick');
        setInitialComposerQuote(null);
        setInitialComposerPage(currentPage);
        setInitialComposerY(currentY);
        setNotesOpen(true);
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        setInitialComposerType('question');
        setInitialComposerQuote(null);
        setInitialComposerPage(currentPage);
        setInitialComposerY(currentY);
        setNotesOpen(true);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setQuickParkOpen(prev => !prev);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, currentY, focusMode, notesOpen, quickParkOpen, shortcutsModalOpen, mobileMenuOpen, selectionToolbarPos, activeHighlightPopup]);

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
    <div className={`readerShell ${focusMode ? 'focusMode' : ''}`} style={{ background: getThemeBg() }}>
      {/* Top Header */}
      {!focusMode && (
        <header className="readerTop">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" className="secondary" style={{ fontSize: 13, padding: '5px 10px' }} title="Về thư viện sách">
              ← Thư viện
            </Link>
            <strong
              style={{
                fontSize: 14,
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={doc?.title}
            >
              {doc?.title || 'Tài liệu'}
            </strong>
          </div>

          {/* Desktop Controls */}
          <div className="desktopOnly" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Page navigation */}
            <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Trang</span>
              <input
                type="text"
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt(pageInputVal, 10);
                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                      jumpToPageAndY(val, 0);
                    } else {
                      setPageInputVal(String(currentPage));
                    }
                  }
                }}
                onBlur={() => {
                  const val = parseInt(pageInputVal, 10);
                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    jumpToPageAndY(val, 0);
                  } else {
                    setPageInputVal(String(currentPage));
                  }
                }}
                style={{
                  width: 44,
                  padding: '3px 4px',
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  textAlign: 'center',
                  fontSize: 13
                }}
                title="Nhập số trang và nhấn Enter"
              />
              <span>/ {totalPages}</span>
            </div>

            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 6 }}>
              <button
                className="secondary"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={handleZoomOut}
                title="Thu nhỏ (-)"
              >
                －
              </button>
              <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center', color: 'var(--muted)' }}>
                {Math.round(scale * 100)}%
              </span>
              <button
                className="secondary"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={handleZoomIn}
                title="Phóng to (+)"
              >
                ＋
              </button>
            </div>

            {/* Fit Mode Toggles */}
            <div style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
              <button
                className={`secondary ${fitMode === 'fit-width' ? 'activePill' : ''}`}
                style={{ fontSize: 11, padding: '3px 7px', ...(fitMode === 'fit-width' ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : {}) }}
                onClick={() => handleSetFitMode('fit-width')}
                title="Vừa chiều ngang (Fit Width)"
              >
                ↔ Vừa ngang
              </button>
              <button
                className={`secondary ${fitMode === 'fit-page' ? 'activePill' : ''}`}
                style={{ fontSize: 11, padding: '3px 7px', ...(fitMode === 'fit-page' ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : {}) }}
                onClick={() => handleSetFitMode('fit-page')}
                title="Toàn trang (Fit Page)"
              >
                ↕ Vừa trang
              </button>
            </div>

            {/* Reading Background Toggles */}
            <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
              <button
                className={`secondary ${theme === 'warm' ? 'activePill' : ''}`}
                style={{ fontSize: 11, padding: '3px 7px', ...(theme === 'warm' ? { background: '#ded6c5', borderColor: '#bbb' } : {}) }}
                onClick={() => handleSetReaderTheme('warm')}
                title="Nền sách giấy ấm"
              >
                Ấm
              </button>
              <button
                className={`secondary ${theme === 'white' ? 'activePill' : ''}`}
                style={{ fontSize: 11, padding: '3px 7px', ...(theme === 'white' ? { background: '#ffffff', borderColor: '#bbb' } : {}) }}
                onClick={() => handleSetReaderTheme('white')}
                title="Nền trắng sáng"
              >
                Sáng
              </button>
              <button
                className={`secondary ${theme === 'dark' ? 'activePill' : ''}`}
                style={{ fontSize: 11, padding: '3px 7px', ...(theme === 'dark' ? { background: '#252925', color: '#fff', borderColor: '#555' } : {}) }}
                onClick={() => handleSetReaderTheme('dark')}
                title="Nền tối"
              >
                Tối
              </button>
            </div>

            {/* Notes Toggle Button */}
            <button
              className="secondary"
              style={{
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                marginLeft: 8,
                ...(notesOpen ? { background: 'var(--deep)', color: 'white' } : {})
              }}
              onClick={() => setNotesOpen(!notesOpen)}
              title="Mở ghi chú (N)"
            >
              <span>✎ Ghi chú</span>
              {notes.length > 0 && (
                <span
                  style={{
                    background: notesOpen ? 'white' : 'var(--deep)',
                    color: notesOpen ? 'var(--deep)' : 'white',
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
              style={{ fontSize: 13, padding: '6px 10px' }}
              onClick={() => setFocusMode(true)}
              title="Chế độ tập trung (F)"
            >
              ⛶ Focus
            </button>

            {/* Shortcuts help button */}
            <button
              className="secondary"
              style={{ fontSize: 12, padding: '6px 8px' }}
              onClick={() => setShortcutsModalOpen(true)}
              title="Phím tắt (?)"
            >
              ?
            </button>
          </div>

          {/* Mobile compact menu button */}
          <div className="mobileOnly" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="secondary"
              style={{ fontSize: 13, padding: '4px 8px' }}
              onClick={() => setNotesOpen(!notesOpen)}
            >
              ✎ ({notes.length})
            </button>
            <button
              className="secondary"
              style={{ fontSize: 14, padding: '4px 8px' }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Tùy chọn"
            >
              ⋯
            </button>
          </div>
        </header>
      )}

      {/* Mobile Options Dropdown Menu */}
      {mobileMenuOpen && !focusMode && (
        <div
          style={{
            position: 'fixed',
            top: 54,
            right: 12,
            zIndex: 1000,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            padding: 12,
            display: 'grid',
            gap: 10,
            minWidth: 200
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Thu phóng</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="secondary" style={{ padding: '2px 8px' }} onClick={handleZoomOut}>－</button>
              <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
              <button className="secondary" style={{ padding: '2px 8px' }} onClick={handleZoomIn}>＋</button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Chế độ xem</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`secondary ${fitMode === 'fit-width' ? 'activePill' : ''}`}
                style={{ fontSize: 10, padding: '3px 6px', ...(fitMode === 'fit-width' ? { background: 'var(--deep)', color: 'white' } : {}) }}
                onClick={() => { handleSetFitMode('fit-width'); setMobileMenuOpen(false); }}
              >
                ↔ Vừa ngang
              </button>
              <button
                className={`secondary ${fitMode === 'fit-page' ? 'activePill' : ''}`}
                style={{ fontSize: 10, padding: '3px 6px', ...(fitMode === 'fit-page' ? { background: 'var(--deep)', color: 'white' } : {}) }}
                onClick={() => { handleSetFitMode('fit-page'); setMobileMenuOpen(false); }}
              >
                ↕ Vừa trang
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Nền đọc</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="secondary" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => handleSetReaderTheme('warm')}>Ấm</button>
              <button className="secondary" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => handleSetReaderTheme('white')}>Sáng</button>
              <button className="secondary" style={{ fontSize: 10, padding: '3px 6px' }} onClick={() => handleSetReaderTheme('dark')}>Tối</button>
            </div>
          </div>

          <button
            className="secondary"
            style={{ width: '100%', fontSize: 12, padding: '6px' }}
            onClick={() => { setFocusMode(true); setMobileMenuOpen(false); }}
          >
            ⛶ Chế độ tập trung (Focus)
          </button>
          <button
            className="secondary"
            style={{ width: '100%', fontSize: 12, padding: '6px' }}
            onClick={() => { setShortcutsModalOpen(true); setMobileMenuOpen(false); }}
          >
            ? Xem phím tắt
          </button>
        </div>
      )}

      {/* Focus Mode Exit Floating Button (Requirement 1) */}
      {focusMode && (
        <button
          className="secondary"
          style={{
            position: 'fixed',
            top: 14,
            right: 14,
            zIndex: 1000,
            background: 'var(--panel)',
            color: 'var(--ink)',
            boxShadow: 'var(--shadow)',
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700
          }}
          onClick={() => setFocusMode(false)}
          title="Thoát Focus (Esc hoặc F)"
        >
          ✕ Thoát Focus (F)
        </button>
      )}

      {/* Main Reader Stage + Slide-over Notes Panel */}
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
                StudyFlow lưu file PDF hoàn toàn trên trình duyệt (OPFS) của bạn để đảm bảo quyền riêng tư. Vui lòng chọn lại file PDF gốc trên máy bạn để tiếp tục đọc.
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
                    onRegisterElement={(p, el) => {
                      if (el) pageElementsRef.current.set(p, el);
                      else pageElementsRef.current.delete(p);
                    }}
                    onPageDimensions={handlePageDimensions}
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
            initialComposerPage={initialComposerPage}
            initialComposerY={initialComposerY}
            initialComposerHighlightId={initialComposerHighlightId}
            onClearInitialComposer={() => {
              setInitialComposerQuote(null);
              setInitialComposerHighlightId(undefined);
            }}
          />
        )}
      </div>

      {/* Quick Parking Note Dock Popover (Requirement 7) */}
      {quickParkOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            width: 'min(480px, 92vw)',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
            padding: 16,
            animation: 'slideUp 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--terracotta)' }}>📌 Ghim suy nghĩ (Parking Note)</strong>
            <button className="secondary" style={{ border: 0, padding: '2px 6px' }} onClick={() => setQuickParkOpen(false)}>✕</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            Tránh xao nhãng mạch đọc: ghi nhanh điều bạn đang nghĩ để lần sau mở sách có thể bắt lại ngay.
          </p>
          <textarea
            value={quickParkText}
            onChange={(e) => setQuickParkText(e.target.value)}
            placeholder="Lần sau mình cần tiếp tục từ đâu? (Parking Note)"
            rows={2}
            autoFocus
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--line)',
              padding: 8,
              fontSize: 13,
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveQuickPark();
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span className="muted" style={{ fontSize: 11 }}>Trang {currentPage}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setQuickParkOpen(false)}>Hủy</button>
              <button className="primary" style={{ fontSize: 12, padding: '4px 14px' }} onClick={handleSaveQuickPark}>Lưu (Enter)</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick parking notification toast */}
      {quickParkNotification && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--deep)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            zIndex: 1100,
            boxShadow: 'var(--shadow)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {quickParkNotification}
        </div>
      )}

      {/* Bottom bar with Cassette Progress, Quick Parking, and Finish Tape CTA */}
      {!focusMode && (
        <footer className="readerBottom" style={{ justifyContent: 'space-between', gap: 10 }}>
          {/* Quick Park button (Requirement 7) */}
          <button
            className="secondary"
            style={{
              fontSize: 12,
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap'
            }}
            onClick={() => setQuickParkOpen(prev => !prev)}
            title="Ghim suy nghĩ nhanh (P)"
          >
            📌 Park
          </button>

          {/* Cassette Progress Center */}
          <div style={{ flex: 1, maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
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

      {/* Dismissible Resume Toast (Requirement 15) */}
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

      {/* Keyboard Shortcuts Help Modal (Requirement 8) */}
      {shortcutsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1200,
            display: 'grid',
            placeItems: 'center'
          }}
          onClick={() => setShortcutsModalOpen(false)}
        >
          <div
            className="card"
            style={{ width: 'min(420px, 92vw)', padding: 24, display: 'grid', gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>⌨️ Phím tắt nhanh</h3>
              <button className="secondary" style={{ border: 0 }} onClick={() => setShortcutsModalOpen(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tạo Quick Note</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>N</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Đặt câu hỏi (Question)</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>Q</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ghim suy nghĩ (Parking Note)</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>P</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bật / Thoát Focus Mode</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>F</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Phóng to / Thu nhỏ</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>+ / -</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Đóng popup / modal</span>
                <kbd style={{ background: 'var(--kbd-bg)', color: 'var(--ink)', padding: '2px 8px', borderRadius: 4 }}>Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
