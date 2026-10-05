import { localDB, type LocalUnlockedReward } from '../db/local.ts';
import { chooseReward } from './engine.ts';
import { SEED_REWARDS, type RewardDefinition } from './seed.ts';
import { enqueueSync } from '../sync/sync-service.ts';

export async function getDocumentReward(documentId: string): Promise<LocalUnlockedReward | null> {
  if (!localDB) return null;
  const existing = await localDB.unlockedRewards.where('documentId').equals(documentId).first();
  return existing ?? null;
}

export async function unlockDocumentReward(
  documentId: string,
  documentTitle: string
): Promise<{ reward: LocalUnlockedReward; isNew: boolean } | null> {
  if (!localDB) return null;

  // Rule 20: Persist immediately. Reload/F5 does not reroll!
  const existing = await localDB.unlockedRewards.where('documentId').equals(documentId).first();
  if (existing) {
    return { reward: existing, isNew: false };
  }

  // Fetch all unlocked rewards to determine owned one-time items and recent rewards for cooldown
  const allUnlocked = await localDB.unlockedRewards.orderBy('unlockedAt').toArray();
  const ownedIds = allUnlocked.map(u => u.rewardId);
  const recentIds = allUnlocked.slice(-5).map(u => u.rewardId);

  // Map SEED_REWARDS to engine format
  const pool = SEED_REWARDS.map(r => ({
    id: r.id,
    type: r.type,
    weight: r.weight,
    cooldownUnlocks: r.cooldownUnlocks,
    oneTime: r.oneTime
  }));

  const chosenEngineReward = chooseReward(pool, recentIds, ownedIds);
  const definition = SEED_REWARDS.find(r => r.id === chosenEngineReward?.id) ?? SEED_REWARDS[0];

  const now = new Date().toISOString();
  const newReward: LocalUnlockedReward = {
    id: crypto.randomUUID(),
    documentId,
    documentTitle,
    rewardId: definition.id,
    rewardCode: definition.code,
    rewardType: definition.type,
    rewardTitle: definition.title,
    assetPath: definition.assetPath,
    payload: {
      ...definition.payload,
      description: definition.description,
      icon: definition.icon
    },
    unlockedAt: now
  };

  await localDB.unlockedRewards.add(newReward);
  await enqueueSync('reward', newReward.id, 'upsert', newReward);

  return { reward: newReward, isNew: true };
}

export async function getAllUnlockedRewards(): Promise<LocalUnlockedReward[]> {
  if (!localDB) return [];
  return localDB.unlockedRewards.orderBy('unlockedAt').reverse().toArray();
}
