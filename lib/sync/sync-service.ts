import { localDB, type SyncQueueItem } from '../db/local.ts';
import { supabase } from '../supabase/client.ts';
import { resolveConflict } from './conflict.ts';

let isSyncing = false;

/**
 * Checks if Supabase client is properly configured with environment credentials.
 */
export function isSupabaseConfigured(): boolean {
  if (!supabase) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && url.startsWith('http'));
}

/**
 * Safe action: Clears only the pending syncQueue records.
 * Strictly preserves all canonical documents, notes, highlights, progress, and rewards (Section 1).
 */
export async function clearSyncQueueOnly(): Promise<number> {
  if (!localDB) return 0;
  const count = await localDB.syncQueue.count();
  await localDB.syncQueue.clear();
  return count;
}

/**
 * Enqueues or immediately executes a cloud synchronization operation following Rules A, B, C, D:
 * - A: If Supabase not configured -> DO NOT enqueue. Local Dexie remains canonical.
 * - B: If Supabase configured but user is signed out -> DO NOT accumulate deltas.
 * - C: If Supabase configured + signed in + online -> Direct sync immediately, clear queue on ACK.
 * - D: If Supabase configured + signed in + offline -> Enqueue WITH COALESCING by (entity, entityId).
 */
export async function enqueueSync(
  entity: SyncQueueItem['entity'],
  entityId: string,
  operation: SyncQueueItem['operation'],
  payload: unknown
) {
  if (!localDB) return;

  // Rule A: Supabase not configured -> Never accumulate queue
  if (!isSupabaseConfigured() || !supabase) {
    return;
  }

  try {
    // Rule B: Check authentication status
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // User is signed out: do not accumulate hundreds of delta operations.
      // Full reconciliation will run when signing in.
      return;
    }

    const userId = session.user.id;

    // Rule C: If user is signed in and online -> attempt immediate direct sync
    if (typeof window !== 'undefined' && navigator.onLine) {
      try {
        await syncSingleItem({ entity, entityId, operation, payload, queuedAt: new Date().toISOString() }, userId);
        return; // Direct sync ACK received, zero queue growth!
      } catch (directErr) {
        console.warn(`Direct sync failed for ${entity} ${entityId}, queuing offline item:`, directErr);
      }
    }

    // Rule D: If offline or direct sync failed -> queue with coalescing by (entity, entityId)
    const existing = await localDB.syncQueue
      .where('entity').equals(entity)
      .filter(item => item.entityId === entityId)
      .first();

    const now = new Date().toISOString();

    if (existing && existing.id !== undefined) {
      if (operation === 'delete') {
        // Upgrade existing upsert to delete
        await localDB.syncQueue.update(existing.id, {
          operation: 'delete',
          payload,
          queuedAt: now,
          retryCount: 0
        });
      } else {
        // Existing upsert -> coalesce payload in place
        await localDB.syncQueue.update(existing.id, {
          payload,
          queuedAt: now,
          retryCount: 0
        });
      }
    } else {
      await localDB.syncQueue.add({
        entity,
        entityId,
        operation,
        payload,
        queuedAt: now,
        retryCount: 0
      });
    }
  } catch (err) {
    console.error('Failed to enqueue sync item:', err);
  }
}

export async function processSyncQueue() {
  if (isSyncing || !localDB || !supabase) return;
  if (typeof window !== 'undefined' && !navigator.onLine) return;

  isSyncing = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // User is not logged into Supabase
      isSyncing = false;
      return;
    }

    const userId = session.user.id;
    const items = await localDB.syncQueue.orderBy('queuedAt').toArray();

    for (const item of items) {
      try {
        await syncSingleItem(item, userId);
        if (item.id !== undefined) {
          await localDB.syncQueue.delete(item.id);
        }
      } catch (err) {
        console.error(`Sync error on entity ${item.entity} (id: ${item.entityId}):`, err);
        if (item.id !== undefined) {
          await localDB.syncQueue.update(item.id, {
            retryCount: (item.retryCount || 0) + 1,
            lastError: err instanceof Error ? err.message : String(err)
          });
        }
        // Stop batch on network/server error to preserve ordering
        break;
      }
    }
  } catch (err) {
    console.error('Error during processSyncQueue:', err);
  } finally {
    isSyncing = false;
  }
}

async function syncSingleItem(item: SyncQueueItem, userId: string) {
  if (!supabase) return;
  const { entity, entityId, operation, payload } = item;

  if (operation === 'delete') {
    if (entity === 'document') {
      await supabase.from('documents').delete().eq('id', entityId).eq('user_id', userId);
    } else if (entity === 'highlight') {
      await supabase.from('highlights').delete().eq('id', entityId).eq('user_id', userId);
    } else if (entity === 'note') {
      await supabase.from('notes').delete().eq('id', entityId).eq('user_id', userId);
    }
    return;
  }

  // Operation is upsert
  const data = payload as Record<string, unknown>;

  if (entity === 'document') {
    const { error } = await supabase.from('documents').upsert({
      id: data.id,
      user_id: userId,
      title: data.title,
      file_hash: data.fileHash,
      file_type: 'pdf',
      total_pages: data.totalPages ?? null,
      tags: data.tags ?? [],
      status: data.status ?? 'in_progress',
      created_at: data.createdAt ?? data.updatedAt,
      updated_at: data.updatedAt
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (entity === 'progress') {
    const { error } = await supabase.from('document_progress').upsert({
      document_id: data.documentId,
      user_id: userId,
      current_locator: { page: data.currentPage, y: data.y },
      visited_ranges: data.visitedRanges,
      completed_at: data.completedAt ?? (data.completed ? new Date().toISOString() : null),
      last_meaningful_activity_at: data.lastMeaningfulActivityAt ?? new Date().toISOString(),
      updated_at: data.updatedAt
    }, { onConflict: 'document_id' });
    if (error) throw error;

    // Reset next_reminder_at from last_meaningful_activity_at if reminder preference exists
    try {
      const { data: pref } = await supabase
        .from('reminder_preferences')
        .select('inactivity_days, enabled')
        .eq('document_id', data.documentId)
        .maybeSingle();

      if (pref && pref.enabled) {
        const days = pref.inactivity_days || 3;
        const actTime = data.lastMeaningfulActivityAt ? new Date(String(data.lastMeaningfulActivityAt)).getTime() : Date.now();
        const nextDate = new Date(actTime + days * 86400000).toISOString();
        await supabase
          .from('reminder_preferences')
          .update({ next_reminder_at: nextDate, updated_at: new Date().toISOString() })
          .eq('document_id', data.documentId);
      }
    } catch (prefErr) {
      console.warn('Could not update reminder_preferences next_reminder_at:', prefErr);
    }
  } else if (entity === 'highlight') {
    const { error } = await supabase.from('highlights').upsert({
      id: data.id,
      user_id: userId,
      document_id: data.documentId,
      locator: data.locator ?? { page: data.page, y: 0 },
      quote_text: data.quoteText,
      color: data.color,
      rects: data.rects,
      created_at: data.createdAt,
      updated_at: data.updatedAt
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (entity === 'note') {
    const { error } = await supabase.from('notes').upsert({
      id: data.id,
      user_id: userId,
      document_id: data.documentId,
      highlight_id: data.highlightId ?? null,
      type: data.type,
      locator: data.locator ?? { page: data.page, y: data.y },
      quote_text: data.quoteText ?? null,
      note_text: data.noteText,
      status: data.status ?? null,
      resolution_text: data.resolutionText ?? null,
      is_active_parking: data.isActiveParking ?? false,
      created_at: data.createdAt,
      updated_at: data.updatedAt
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (entity === 'session') {
    const { error } = await supabase.from('reading_sessions').upsert({
      id: data.id,
      user_id: userId,
      document_id: data.documentId,
      started_at: data.startedAt,
      ended_at: data.endedAt ?? null,
      active_seconds: data.activeSeconds ?? 0,
      start_locator: data.startLocator ?? null,
      end_locator: data.endLocator ?? null,
      updated_at: data.updatedAt
    }, { onConflict: 'id' });
    if (error) throw error;
  } else if (entity === 'reward') {
    // Map contextual reward ID to canonical reward definition to strictly satisfy FK constraint
    const rawRewardId = String(data.rewardId || '');
    const canonicalRewardId = rawRewardId.startsWith('flashback-note')
      ? 'flashback-note'
      : rawRewardId.startsWith('flashback-question')
      ? 'flashback-question'
      : rawRewardId.startsWith('flashback-parking')
      ? 'flashback-parking'
      : rawRewardId;

    const { error } = await supabase.from('unlocked_rewards').upsert({
      id: data.id,
      user_id: userId,
      document_id: data.documentId ?? null,
      reward_id: canonicalRewardId,
      unlocked_at: data.unlockedAt
    }, { onConflict: 'user_id, document_id' });
    if (error) {
      console.warn('Reward sync warning:', error);
    }
  }
}

/**
 * Pulls remote data from Supabase and hydrates local Dexie storage.
 * Strictly adheres to Local-First principles:
 * - If remote is empty, NEVER deletes or overwrites existing local data.
 * - Uses resolveConflict() with timestamp checking. Local pending queue edits take precedence.
 * - Restores document metadata (with OPFS relink requirement preserved).
 */
export async function pullAndHydrateFromRemote(userId: string): Promise<{
  documentsPulled: number;
  notesPulled: number;
  highlightsPulled: number;
  progressPulled: number;
  rewardsPulled: number;
}> {
  if (!localDB || !supabase) {
    return { documentsPulled: 0, notesPulled: 0, highlightsPulled: 0, progressPulled: 0, rewardsPulled: 0 };
  }

  let documentsPulled = 0;
  let notesPulled = 0;
  let highlightsPulled = 0;
  let progressPulled = 0;
  let rewardsPulled = 0;

  try {
    // 1. Fetch remote documents
    const { data: remoteDocs, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId);

    if (!docErr && remoteDocs && remoteDocs.length > 0) {
      for (const rDoc of remoteDocs) {
        const localDoc = await localDB.documents.get(rDoc.id);
        const hasPending = (await localDB.syncQueue
          .where('entity').equals('document')
          .filter(q => q.entityId === rDoc.id)
          .count()) > 0;

        const remoteFormatted = {
          id: rDoc.id,
          title: rDoc.title,
          originalFileName: rDoc.title,
          fileHash: rDoc.file_hash,
          opfsPath: `documents/${rDoc.id}.pdf`,
          totalPages: rDoc.total_pages ?? undefined,
          tags: rDoc.tags || [],
          status: rDoc.status || 'in_progress',
          createdAt: rDoc.created_at,
          updatedAt: rDoc.updated_at
        };

        if (!localDoc) {
          await localDB.documents.add(remoteFormatted);
          documentsPulled++;
        } else {
          const resolution = resolveConflict(localDoc, remoteFormatted, hasPending);
          if (resolution.winner === 'remote') {
            await localDB.documents.update(rDoc.id, remoteFormatted);
            documentsPulled++;
          }
        }
      }
    }

    // 2. Fetch remote progress
    const { data: remoteProg, error: progErr } = await supabase
      .from('document_progress')
      .select('*')
      .eq('user_id', userId);

    if (!progErr && remoteProg && remoteProg.length > 0) {
      for (const rProg of remoteProg) {
        const localProg = await localDB.progress.get(rProg.document_id);
        const hasPending = (await localDB.syncQueue
          .where('entity').equals('progress')
          .filter(q => q.entityId === rProg.document_id)
          .count()) > 0;

        const loc = (rProg.current_locator as { page?: number; y?: number }) || { page: 1, y: 0 };
        const remoteFormatted = {
          documentId: rProg.document_id,
          currentPage: loc.page || 1,
          y: loc.y || 0,
          visitedRanges: (rProg.visited_ranges as Array<[number, number]>) || [[1, loc.page || 1]],
          completed: Boolean(rProg.completed_at),
          completedAt: rProg.completed_at || undefined,
          lastMeaningfulActivityAt: rProg.last_meaningful_activity_at || rProg.updated_at,
          updatedAt: rProg.updated_at
        };

        if (!localProg) {
          await localDB.progress.add(remoteFormatted);
          progressPulled++;
        } else {
          const resolution = resolveConflict(localProg, remoteFormatted, hasPending);
          if (resolution.winner === 'remote') {
            await localDB.progress.put(remoteFormatted);
            progressPulled++;
          }
        }
      }
    }

    // 3. Fetch remote highlights
    const { data: remoteHls, error: hlErr } = await supabase
      .from('highlights')
      .select('*')
      .eq('user_id', userId);

    if (!hlErr && remoteHls && remoteHls.length > 0) {
      for (const rHl of remoteHls) {
        const localHl = await localDB.highlights.get(rHl.id);
        const hasPending = (await localDB.syncQueue
          .where('entity').equals('highlight')
          .filter(q => q.entityId === rHl.id)
          .count()) > 0;

        const loc = (rHl.locator as { page?: number; y?: number }) || { page: 1, y: 0 };
        const remoteFormatted = {
          id: rHl.id,
          documentId: rHl.document_id,
          page: loc.page || 1,
          locator: loc as { page: number; y: number },
          quoteText: rHl.quote_text || '',
          color: rHl.color || 'apricot',
          rects: (rHl.rects as Array<{ x: number; y: number; width: number; height: number }>) || [],
          createdAt: rHl.created_at,
          updatedAt: rHl.updated_at
        };

        if (!localHl) {
          await localDB.highlights.add(remoteFormatted);
          highlightsPulled++;
        } else {
          const resolution = resolveConflict(localHl, remoteFormatted, hasPending);
          if (resolution.winner === 'remote') {
            await localDB.highlights.put(remoteFormatted);
            highlightsPulled++;
          }
        }
      }
    }

    // 4. Fetch remote notes
    const { data: remoteNotes, error: noteErr } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId);

    if (!noteErr && remoteNotes && remoteNotes.length > 0) {
      for (const rNote of remoteNotes) {
        const localNote = await localDB.notes.get(rNote.id);
        const hasPending = (await localDB.syncQueue
          .where('entity').equals('note')
          .filter(q => q.entityId === rNote.id)
          .count()) > 0;

        const loc = (rNote.locator as { page?: number; y?: number }) || { page: 1, y: 0 };
        const remoteFormatted = {
          id: rNote.id,
          documentId: rNote.document_id,
          highlightId: rNote.highlight_id || undefined,
          type: rNote.type || 'quick',
          quoteText: rNote.quote_text || undefined,
          noteText: rNote.note_text || '',
          page: loc.page || 1,
          y: loc.y || 0,
          locator: loc as { page: number; y: number },
          status: rNote.status || undefined,
          resolutionText: rNote.resolution_text || undefined,
          isActiveParking: Boolean(rNote.is_active_parking),
          createdAt: rNote.created_at,
          updatedAt: rNote.updated_at
        };

        if (!localNote) {
          await localDB.notes.add(remoteFormatted);
          notesPulled++;
        } else {
          const resolution = resolveConflict(localNote, remoteFormatted, hasPending);
          if (resolution.winner === 'remote') {
            await localDB.notes.put(remoteFormatted);
            notesPulled++;
          }
        }
      }
    }

    // 5. Fetch remote unlocked_rewards
    let rewardsPulled = 0;
    const { data: remoteRewards, error: rewErr } = await supabase
      .from('unlocked_rewards')
      .select('*, rewards(*)')
      .eq('user_id', userId);

    if (!rewErr && remoteRewards && remoteRewards.length > 0) {
      for (const rRew of remoteRewards) {
        const localRew = await localDB.unlockedRewards.get(rRew.id);
        const rewDef = rRew.rewards;
        if (!localRew) {
          await localDB.unlockedRewards.add({
            id: rRew.id,
            documentId: rRew.document_id || undefined,
            documentTitle: undefined,
            rewardId: rRew.reward_id,
            rewardCode: rewDef?.code || 'UNKNOWN',
            rewardType: rewDef?.type || 'collectible',
            rewardTitle: rewDef?.title || 'Phần thưởng',
            assetPath: rewDef?.asset_path || undefined,
            payload: rewDef?.payload || {},
            unlockedAt: rRew.unlocked_at
          });
          rewardsPulled++;
        }
      }
    }
  } catch (err) {
    console.error('Error during pullAndHydrateFromRemote:', err);
  }

  return { documentsPulled, notesPulled, highlightsPulled, progressPulled, rewardsPulled };
}

/**
 * Full reconciliation on user sign in or reconnection (Section 2).
 * 1. Reads all local canonical data and pushes idempotent upserts to Supabase.
 * 2. Pulls structured data from Supabase and merges using resolveConflict (latest wins).
 * 3. Clears syncQueue on completion.
 */
export async function reconcileOnSignIn(userId: string): Promise<{
  pushed: { documents: number; notes: number; highlights: number; progress: number; rewards: number };
  pulled: { documentsPulled: number; notesPulled: number; highlightsPulled: number; progressPulled: number; rewardsPulled: number };
}> {
  if (!localDB || !supabase) {
    return {
      pushed: { documents: 0, notes: 0, highlights: 0, progress: 0, rewards: 0 },
      pulled: { documentsPulled: 0, notesPulled: 0, highlightsPulled: 0, progressPulled: 0, rewardsPulled: 0 }
    };
  }

  // Phase 1: Push all local canonical data to Supabase
  const localDocs = await localDB.documents.toArray();
  const localProg = await localDB.progress.toArray();
  const localHls = await localDB.highlights.toArray();
  const localNotes = await localDB.notes.toArray();
  const localRewards = await localDB.unlockedRewards.toArray();
  const localSessions = await localDB.readingSessions.toArray();

  let pushedDocs = 0;
  for (const doc of localDocs) {
    try {
      await syncSingleItem({ entity: 'document', entityId: doc.id, operation: 'upsert', payload: doc, queuedAt: doc.updatedAt }, userId);
      pushedDocs++;
    } catch (e) {
      console.warn('Reconciliation push doc error:', doc.id, e);
    }
  }

  let pushedProg = 0;
  for (const prog of localProg) {
    try {
      await syncSingleItem({ entity: 'progress', entityId: prog.documentId, operation: 'upsert', payload: prog, queuedAt: prog.updatedAt }, userId);
      pushedProg++;
    } catch (e) {
      console.warn('Reconciliation push progress error:', prog.documentId, e);
    }
  }

  let pushedHls = 0;
  for (const hl of localHls) {
    try {
      await syncSingleItem({ entity: 'highlight', entityId: hl.id, operation: 'upsert', payload: hl, queuedAt: hl.updatedAt }, userId);
      pushedHls++;
    } catch (e) {
      console.warn('Reconciliation push highlight error:', hl.id, e);
    }
  }

  let pushedNotes = 0;
  for (const note of localNotes) {
    try {
      await syncSingleItem({ entity: 'note', entityId: note.id, operation: 'upsert', payload: note, queuedAt: note.updatedAt }, userId);
      pushedNotes++;
    } catch (e) {
      console.warn('Reconciliation push note error:', note.id, e);
    }
  }

  let pushedRewards = 0;
  for (const rew of localRewards) {
    try {
      await syncSingleItem({ entity: 'reward', entityId: rew.id, operation: 'upsert', payload: rew, queuedAt: rew.unlockedAt }, userId);
      pushedRewards++;
    } catch (e) {
      console.warn('Reconciliation push reward error:', rew.id, e);
    }
  }

  for (const ses of localSessions) {
    try {
      await syncSingleItem({ entity: 'session', entityId: ses.id, operation: 'upsert', payload: ses, queuedAt: ses.updatedAt }, userId);
    } catch {
      // non-critical
    }
  }

  // Phase 2: Pull & Hydrate from remote (merges latest wins)
  const pulled = await pullAndHydrateFromRemote(userId);

  // Phase 3: Clear queue on ACK
  await localDB.syncQueue.clear();

  return {
    pushed: {
      documents: pushedDocs,
      notes: pushedNotes,
      highlights: pushedHls,
      progress: pushedProg,
      rewards: pushedRewards
    },
    pulled
  };
}

/**
 * Initializes automatic sync listeners on app startup.
 */
export function initSyncListeners() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    processSyncQueue().catch(() => {});
  });
  // Also attempt sync on initial load
  setTimeout(() => {
    processSyncQueue().catch(() => {});
  }, 1000);
}
