import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveConflict } from '../lib/sync/conflict.ts';

describe('Sync Conflict Resolver (Latest updated_at wins)', () => {
  it('chooses local when local is newer', () => {
    const local = { id: 'doc1', title: 'Local newer', updatedAt: '2026-10-05T12:00:00.000Z' };
    const remote = { id: 'doc1', title: 'Remote older', updatedAt: '2026-10-05T10:00:00.000Z' };
    const res = resolveConflict(local, remote, false);
    assert.strictEqual(res.winner, 'local');
    assert.strictEqual(res.result.title, 'Local newer');
  });

  it('chooses remote when remote is strictly newer and no pending local changes', () => {
    const local = { id: 'doc1', title: 'Local older', updatedAt: '2026-10-05T08:00:00.000Z' };
    const remote = { id: 'doc1', title: 'Remote newer', updatedAt: '2026-10-05T10:00:00.000Z' };
    const res = resolveConflict(local, remote, false);
    assert.strictEqual(res.winner, 'remote');
    assert.strictEqual(res.result.title, 'Remote newer');
  });

  it('preserves local changes if uncommitted in sync queue', () => {
    const local = { id: 'doc1', title: 'Local uncommitted offline edit', updatedAt: '2026-10-05T08:00:00.000Z' };
    const remote = { id: 'doc1', title: 'Remote server copy', updatedAt: '2026-10-05T10:00:00.000Z' };
    const res = resolveConflict(local, remote, true);
    assert.strictEqual(res.winner, 'local');
    assert.strictEqual(res.result.title, 'Local uncommitted offline edit');
  });

  it('handles invalid timestamps safely', () => {
    const local = { id: 'doc1', title: 'Valid local', updatedAt: '2026-10-05T08:00:00.000Z' };
    const remote = { id: 'doc1', title: 'Invalid remote', updatedAt: 'invalid-date' };
    const res = resolveConflict(local, remote, false);
    assert.strictEqual(res.winner, 'local');
  });
});
