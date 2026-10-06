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

export interface BackupEstimate {
  documentsCount: number;
  notesCount: number;
  highlightsCount: number;
  pdfTotalBytes: number;
  pdfTotalMB: number;
  isLarge: boolean; // > 50MB
}

export async function getBackupEstimate(): Promise<BackupEstimate> {
  if (!localDB) {
    return {
      documentsCount: 0,
      notesCount: 0,
      highlightsCount: 0,
      pdfTotalBytes: 0,
      pdfTotalMB: 0,
      isLarge: false
    };
  }

  const documents = await localDB.documents.toArray();
  const notes = await localDB.notes.toArray();
  const highlights = await localDB.highlights.toArray();

  let pdfTotalBytes = 0;
  for (const doc of documents) {
    if (typeof doc.fileSizeBytes === 'number' && doc.fileSizeBytes > 0) {
      pdfTotalBytes += doc.fileSizeBytes;
    } else {
      try {
        const file = await readPdfFromOPFS(doc.id);
        pdfTotalBytes += file.size;
      } catch {
        // File may not exist in OPFS
      }
    }
  }

  const pdfTotalMB = Math.round((pdfTotalBytes / (1024 * 1024)) * 10) / 10;
  return {
    documentsCount: documents.length,
    notesCount: notes.length,
    highlightsCount: highlights.length,
    pdfTotalBytes,
    pdfTotalMB,
    isLarge: pdfTotalBytes > 50 * 1024 * 1024
  };
}

export const MAX_SAFE_PDF_BUNDLE_BYTES = 50 * 1024 * 1024; // 50MB safe memory threshold

export async function exportStudyFlowBackup(includePdfBytes = false): Promise<StudyFlowBackupData> {
  if (!localDB) throw new Error('Cơ sở dữ liệu cục bộ chưa được khởi tạo.');

  const documents = await localDB.documents.toArray();
  const progress = await localDB.progress.toArray();
  const highlights = await localDB.highlights.toArray();
  const notes = await localDB.notes.toArray();
  const unlockedRewards = await localDB.unlockedRewards.toArray();
  const settings = await localDB.settings.toArray();

  const pdfFiles: Record<string, string> = {};

  if (includePdfBytes) {
    const estimate = await getBackupEstimate();
    if (estimate.pdfTotalBytes > MAX_SAFE_PDF_BUNDLE_BYTES) {
      throw new Error(
        `Không thể xuất toàn bộ PDF vì tổng dung lượng (${estimate.pdfTotalMB} MB) vượt quá giới hạn an toàn 50MB cho phương thức Base64 JSON. Vui lòng chọn "Xuất dữ liệu học" (chứa toàn bộ ghi chú, highlight và tiến độ) để đảm bảo trình duyệt không bị treo hoặc tràn bộ nhớ.`
      );
    }

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

export async function restoreStudyFlowBackup(backup: unknown): Promise<{
  documentsCount: number;
  notesCount: number;
  highlightsCount: number;
  pdfsRestored: number;
}> {
  if (!localDB) throw new Error('Cơ sở dữ liệu cục bộ chưa được khởi tạo.');

  if (!backup || typeof backup !== 'object') {
    throw new Error('Dữ liệu sao lưu không hợp lệ: Không tìm thấy nội dung JSON.');
  }

  const data = backup as Partial<StudyFlowBackupData>;

  if (data.version !== 1) {
    throw new Error(
      `Phiên bản sao lưu không tương thích (phát hiện: ${data.version ?? 'không xác định'}). StudyFlow chỉ hỗ trợ phiên bản 1.`
    );
  }

  if (!Array.isArray(data.documents)) {
    throw new Error('Tệp sao lưu bị lỗi cấu trúc: Mục "documents" không hợp lệ.');
  }

  let pdfsRestored = 0;

  // Restore documents
  for (const doc of data.documents || []) {
    await localDB.documents.put(doc);
  }

  // Restore progress
  for (const prog of data.progress || []) {
    await localDB.progress.put(prog);
  }

  // Restore highlights
  for (const hl of data.highlights || []) {
    await localDB.highlights.put(hl);
  }

  // Restore notes
  for (const note of data.notes || []) {
    await localDB.notes.put(note);
  }

  // Restore unlocked rewards
  for (const reward of data.unlockedRewards || []) {
    await localDB.unlockedRewards.put(reward);
  }

  // Restore settings
  for (const s of data.settings || []) {
    await localDB.settings.put(s);
  }

  // Restore PDF files if provided in backup
  if (data.pdfFiles && typeof data.pdfFiles === 'object') {
    for (const [docId, base64] of Object.entries(data.pdfFiles)) {
      try {
        const buffer = base64ToArrayBuffer(base64);
        const doc = data.documents.find((d) => d.id === docId);
        const file = new File([buffer], `${doc?.title || docId}.pdf`, { type: 'application/pdf' });
        await savePdfToOPFS(docId, file);
        pdfsRestored++;
      } catch (err) {
        console.warn(`Could not restore PDF for ${docId}:`, err);
      }
    }
  }

  return {
    documentsCount: data.documents?.length || 0,
    notesCount: data.notes?.length || 0,
    highlightsCount: data.highlights?.length || 0,
    pdfsRestored
  };
}
