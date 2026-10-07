import Dexie, { type EntityTable } from 'dexie';

export type HighlightColor = 'apricot' | 'rose' | 'olive' | 'blue';

export type LocalDocument = {
  id: string;
  title: string;
  originalFileName?: string;
  fileHash: string;
  opfsPath: string;
  totalPages?: number;
  fileSizeBytes?: number;
  tags: string[];
  status: 'in_progress' | 'completed' | 'archived';
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalProgress = {
  documentId: string;
  currentPage: number;
  y: number;
  visitedRanges: Array<[number, number]>;
  completed: boolean;
  completedAt?: string;
  lastMeaningfulActivityAt?: string;
  updatedAt: string;
};

export type LocalHighlight = {
  id: string;
  documentId: string;
  page: number;
  locator: { page: number; y: number };
  quoteText: string;
  color: HighlightColor;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  createdAt: string;
  updatedAt: string;
};

export type LocalNote = {
  id: string;
  documentId: string;
  highlightId?: string;
  type: 'quick' | 'question' | 'parking';
  quoteText?: string;
  noteText: string;
  page: number;
  y: number;
  locator: { page: number; y: number };
  status?: 'open' | 'resolved' | 'reopened';
  resolutionText?: string;
  isActiveParking?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LocalReadingSession = {
  id: string;
  documentId: string;
  startedAt: string;
  endedAt?: string;
  activeSeconds: number;
  startLocator?: { page: number; y: number };
  endLocator?: { page: number; y: number };
  updatedAt: string;
};

export type LocalUnlockedReward = {
  id: string;
  documentId?: string;
  documentTitle?: string;
  rewardId: string;
  rewardCode: string;
  rewardType: 'meme' | 'audio' | 'collectible' | 'certificate' | 'ambient' | 'easter_egg';
  rewardTitle: string;
  assetPath?: string;
  payload: Record<string, unknown>;
  unlockedAt: string;
};

export type LocalSetting = {
  key: string;
  value: unknown;
};

export type SyncQueueItem = {
  id?: number;
  entity: 'document' | 'progress' | 'highlight' | 'note' | 'session' | 'reward' | 'reminder_pref';
  entityId: string;
  operation: 'upsert' | 'delete';
  payload: unknown;
  queuedAt: string;
  retryCount?: number;
  lastError?: string;
};

export class StudyFlowDB extends Dexie {
  documents!: EntityTable<LocalDocument, 'id'>;
  progress!: EntityTable<LocalProgress, 'documentId'>;
  highlights!: EntityTable<LocalHighlight, 'id'>;
  notes!: EntityTable<LocalNote, 'id'>;
  readingSessions!: EntityTable<LocalReadingSession, 'id'>;
  unlockedRewards!: EntityTable<LocalUnlockedReward, 'id'>;
  settings!: EntityTable<LocalSetting, 'key'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('studyflow');

    // Version 1 (baseline)
    this.version(1).stores({
      documents: 'id, fileHash, updatedAt',
      progress: 'documentId, updatedAt, lastMeaningfulActivityAt',
      highlights: 'id, documentId, page, updatedAt',
      notes: 'id, documentId, highlightId, type, status, isActiveParking, updatedAt',
      syncQueue: '++id, entity, entityId, queuedAt'
    });

    // Version 2 (Full MVP v0.1 schema)
    this.version(2).stores({
      documents: 'id, fileHash, status, updatedAt',
      progress: 'documentId, updatedAt, lastMeaningfulActivityAt',
      highlights: 'id, documentId, page, updatedAt',
      notes: 'id, documentId, highlightId, type, status, isActiveParking, updatedAt',
      readingSessions: 'id, documentId, startedAt, updatedAt',
      unlockedRewards: 'id, documentId, rewardId, unlockedAt',
      settings: 'key',
      syncQueue: '++id, entity, entityId, queuedAt'
    }).upgrade(tx => {
      // Add default tags and status to existing documents if any
      return tx.table('documents').toCollection().modify(doc => {
        if (!doc.tags) doc.tags = [];
        if (!doc.status) doc.status = 'in_progress';
        if (!doc.createdAt) doc.createdAt = doc.updatedAt || new Date().toISOString();
      });
    });

    // Version 3 (Support explicit originalFileName vs display title)
    this.version(3).stores({
      documents: 'id, fileHash, status, updatedAt',
      progress: 'documentId, updatedAt, lastMeaningfulActivityAt',
      highlights: 'id, documentId, page, updatedAt',
      notes: 'id, documentId, highlightId, type, status, isActiveParking, updatedAt',
      readingSessions: 'id, documentId, startedAt, updatedAt',
      unlockedRewards: 'id, documentId, rewardId, unlockedAt',
      settings: 'key',
      syncQueue: '++id, entity, entityId, queuedAt'
    }).upgrade(tx => {
      return tx.table('documents').toCollection().modify(doc => {
        if (!doc.originalFileName) {
          doc.originalFileName = doc.title || 'document.pdf';
        }
      });
    });
  }
}

export const localDB = typeof window === 'undefined' ? null : new StudyFlowDB();

/**
 * Renames a document safely without altering file hash, PDF bytes, or OPFS mapping.
 * Updates local document, synchronizes reward provenance, and enqueues sync.
 */
export async function renameDocument(documentId: string, newTitle: string): Promise<boolean> {
  if (!localDB) return false;
  const trimmed = newTitle.trim();
  if (!trimmed) return false;

  const doc = await localDB.documents.get(documentId);
  if (!doc) return false;

  const now = new Date().toISOString();
  await localDB.documents.update(documentId, { title: trimmed, updatedAt: now });

  // Keep provenance in unlockedRewards synchronized
  await localDB.unlockedRewards.where('documentId').equals(documentId).modify({ documentTitle: trimmed });

  // Enqueue sync for document upsert
  const { enqueueSync } = await import('../sync/sync-service');
  await enqueueSync('document', documentId, 'upsert', {
    ...doc,
    title: trimmed,
    updatedAt: now
  });

  return true;
}

/**
 * Deletes a document with complete local cascade cleanup (Section 8).
 * Cleans OPFS PDF, progress, highlights, notes, reading sessions, related syncQueue items,
 * while preserving unlocked rewards (with documentTitle snapshot).
 * Enqueues document delete sync.
 */
export async function deleteDocumentLocalCascade(
  documentId: string,
  options?: { preservePdfBytes?: boolean }
): Promise<{
  deletedHighlights: number;
  deletedNotes: number;
  deletedSessions: number;
}> {
  if (!localDB) {
    return { deletedHighlights: 0, deletedNotes: 0, deletedSessions: 0 };
  }

  // 1. Remove PDF from OPFS unless explicitly asked to preserve
  if (!options?.preservePdfBytes) {
    const { removePdfFromOPFS } = await import('../storage/opfs');
    await removePdfFromOPFS(documentId).catch(console.warn);
  }

  // 2. Count before delete for return telemetry / testing
  const deletedHighlights = await localDB.highlights.where('documentId').equals(documentId).count();
  const deletedNotes = await localDB.notes.where('documentId').equals(documentId).count();
  const deletedSessions = await localDB.readingSessions.where('documentId').equals(documentId).count();

  // 3. Cascade delete child entities
  await localDB.progress.delete(documentId);
  await localDB.highlights.where('documentId').equals(documentId).delete();
  await localDB.notes.where('documentId').equals(documentId).delete();
  await localDB.readingSessions.where('documentId').equals(documentId).delete();

  // 4. Delete the document record itself
  await localDB.documents.delete(documentId);

  // 5. Clean any syncQueue items related to this documentId
  await localDB.syncQueue.where('entityId').equals(documentId).delete();

  // 6. Enqueue document delete sync
  const { enqueueSync } = await import('../sync/sync-service');
  await enqueueSync('document', documentId, 'delete', { id: documentId });

  return { deletedHighlights, deletedNotes, deletedSessions };
}
