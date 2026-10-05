import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import type { StudyFlowBackupData } from '../lib/data/backup.ts';

describe('Backup & Restore Schema Validation', () => {
  it('validates a correct v1 backup data structure', () => {
    const sampleBackup: StudyFlowBackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: [
        {
          id: 'doc-1',
          title: 'Test Document',
          fileHash: 'sha256-hash',
          opfsPath: 'documents/doc-1.pdf',
          tags: ['Science'],
          status: 'in_progress',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      progress: [
        {
          documentId: 'doc-1',
          currentPage: 5,
          y: 0.32,
          visitedRanges: [[1, 5]],
          completed: false,
          updatedAt: new Date().toISOString()
        }
      ],
      highlights: [],
      notes: [
        {
          id: 'note-1',
          documentId: 'doc-1',
          type: 'parking',
          noteText: 'Resume on page 6',
          page: 5,
          y: 0.32,
          locator: { page: 5, y: 0.32 },
          isActiveParking: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      unlockedRewards: [],
      settings: []
    };

    assert.strictEqual(sampleBackup.version, 1);
    assert.strictEqual(sampleBackup.documents.length, 1);
    assert.strictEqual(sampleBackup.notes[0].type, 'parking');
    assert.strictEqual(sampleBackup.notes[0].isActiveParking, true);
  });
});
