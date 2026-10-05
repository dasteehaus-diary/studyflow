import Dexie, { type EntityTable } from 'dexie';

export type HighlightColor = 'apricot' | 'rose' | 'olive' | 'blue';

export type LocalDocument = {
  id: string;
  title: string;
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
  }
}

export const localDB = typeof window === 'undefined' ? null : new StudyFlowDB();
