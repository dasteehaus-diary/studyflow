export interface TimestampedEntity {
  updatedAt: string;
  [key: string]: unknown;
}

export type ConflictResolution<T> = {
  winner: 'local' | 'remote';
  result: T;
};

/**
 * Resolves conflict between local and remote state using "latest updated_at wins".
 * If local item has uncommitted changes pending in sync queue, local takes precedence
 * until sync completes or server timestamp is strictly newer than local edit.
 */
export function resolveConflict<T extends TimestampedEntity>(
  local: T,
  remote: T,
  hasPendingLocalQueue = false
): ConflictResolution<T> {
  if (hasPendingLocalQueue) {
    return { winner: 'local', result: local };
  }

  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();

  if (isNaN(remoteTime)) return { winner: 'local', result: local };
  if (isNaN(localTime)) return { winner: 'remote', result: remote };

  if (remoteTime > localTime) {
    return { winner: 'remote', result: remote };
  }

  return { winner: 'local', result: local };
}
