import { localDB, type LocalDocument, type LocalProgress, type LocalHighlight, type LocalNote, type LocalUnlockedReward, type LocalSetting } from '../db/local.ts';
import { readPdfFromOPFS, savePdfToOPFS, pdfExistsInOPFS } from '../storage/opfs.ts';

export interface StudyFlowBackupData {
  version: 1;
  exportedAt: string;
  documents: LocalDocument[];
  progress: LocalProgress[];
  highlights: LocalHighlight[];
  notes: LocalNote[];
  unlockedRewards: LocalUnlockedReward[];
  settings: LocalSetting[];
  pdfFiles?: Record<string, string>; // documentId -> base64 string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function exportStudyFlowBackup(includePdfBytes = false): Promise<StudyFlowBackupData> {
  if (!localDB) throw new Error('Local database is not initialized');

  const documents = await localDB.documents.toArray();
  const progress = await localDB.progress.toArray();
  const highlights = await localDB.highlights.toArray();
  const notes = await localDB.notes.toArray();
  const unlockedRewards = await localDB.unlockedRewards.toArray();
  const settings = await localDB.settings.toArray();

  const pdfFiles: Record<string, string> = {};

  if (includePdfBytes) {
    for (const doc of documents) {
      try {
        const exists = await pdfExistsInOPFS(doc.id);
        if (exists) {
          const file = await readPdfFromOPFS(doc.id);
          const buffer = await file.arrayBuffer();
          pdfFiles[doc.id] = arrayBufferToBase64(buffer);
        }
      } catch (err) {
        console.warn(`Could not read OPFS file for ${doc.id}:`, err);
      }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    documents,
    progress,
    highlights,
    notes,
    unlockedRewards,
    settings,
    ...(includePdfBytes ? { pdfFiles } : {})
  };
}

export async function restoreStudyFlowBackup(backup: StudyFlowBackupData): Promise<{
  documentsCount: number;
  notesCount: number;
  pdfsRestored: number;
}> {
  if (!localDB) throw new Error('Local database is not initialized');
  if (backup.version !== 1) throw new Error('Định dạng backup không hợp lệ hoặc không tương thích.');

  let pdfsRestored = 0;

  // Restore documents
  for (const doc of backup.documents || []) {
    await localDB.documents.put(doc);
  }

  // Restore progress
  for (const prog of backup.progress || []) {
    await localDB.progress.put(prog);
  }

  // Restore highlights
  for (const hl of backup.highlights || []) {
    await localDB.highlights.put(hl);
  }

  // Restore notes
  for (const note of backup.notes || []) {
    await localDB.notes.put(note);
  }

  // Restore unlocked rewards
  for (const reward of backup.unlockedRewards || []) {
    await localDB.unlockedRewards.put(reward);
  }

  // Restore settings
  for (const s of backup.settings || []) {
    await localDB.settings.put(s);
  }

  // Restore PDF files if provided in backup
  if (backup.pdfFiles) {
    for (const [docId, base64] of Object.entries(backup.pdfFiles)) {
      try {
        const buffer = base64ToArrayBuffer(base64);
        const doc = backup.documents.find(d => d.id === docId);
        const file = new File([buffer], `${doc?.title || docId}.pdf`, { type: 'application/pdf' });
        await savePdfToOPFS(docId, file);
        pdfsRestored++;
      } catch (err) {
        console.warn(`Could not restore PDF for ${docId}:`, err);
      }
    }
  }

  return {
    documentsCount: backup.documents?.length || 0,
    notesCount: backup.notes?.length || 0,
    pdfsRestored
  };
}
