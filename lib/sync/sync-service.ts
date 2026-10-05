import { localDB, type SyncQueueItem } from '../db/local.ts';
import { supabase } from '../supabase/client.ts';
import { resolveConflict } from './conflict.ts';

let isSyncing = false;

export async function enqueueSync(
  entity: SyncQueueItem['entity'],
  entityId: string,
  operation: SyncQueueItem['operation'],
  payload: unknown
) {
  if (!localDB) return;
  try {
    await localDB.syncQueue.add({
      entity,
      entityId,
      operation,
      payload,
      queuedAt: new Date().toISOString(),
      retryCount: 0
    });
    // Trigger sync attempt asynchronously if browser is online
    if (typeof window !== 'undefined' && navigator.onLine) {
      setTimeout(() => processSyncQueue().catch(() => {}), 100);
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
      // User is not logged into Supabase; queue remains safely preserved for when they log in
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
    const { error } = await supabase.from('unlocked_rewards').upsert({
      id: data.id,
      user_id: userId,
      document_id: data.documentId ?? null,
      reward_id: data.rewardId,
      unlocked_at: data.unlockedAt
    }, { onConflict: 'user_id, document_id' });
    if (error) throw error;
  }
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
