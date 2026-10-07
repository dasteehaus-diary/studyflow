import { localDB, type LocalUnlockedReward, type LocalNote } from '../db/local.ts';
import { chooseReward } from './engine.ts';
import { SEED_REWARDS, type RewardDefinition } from './seed.ts';
import { enqueueSync } from '../sync/sync-service.ts';

export async function getDocumentReward(documentId: string): Promise<LocalUnlockedReward | null> {
  if (!localDB) return null;
  const existing = await localDB.unlockedRewards.where('documentId').equals(documentId).first();
  return existing ?? null;
}

export function evaluateContextualReward(
  documentId: string,
  docNotes: LocalNote[]
): RewardDefinition | null {
  const firstNote = docNotes
    .filter((n) => n.type === 'quick')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const firstParking = docNotes
    .filter((n) => n.type === 'parking')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const resolvedQuestion = docNotes.filter((n) => n.type === 'question' && n.status === 'resolved')[0];

  if (firstNote && firstNote.noteText.length > 5) {
    return {
      id: 'flashback-note',
      code: 'FIRST_NOTE_FLASHBACK',
      type: 'collectible',
      title: 'First Note Flashback',
      description: `Ghi chú đầu tiên bạn từng ghi ở trang ${firstNote.page}: "${firstNote.noteText.slice(0, 80)}${firstNote.noteText.length > 80 ? '…' : ''}" — Nhiều trang sau, bạn đã thật sự hoàn thành cuốn sách!`,
      icon: '🕰️',
      weight: 15,
      cooldownUnlocks: 2,
      oneTime: false,
      active: true,
      payload: {
        subtitle: 'Ký ức trang đầu tiên',
        lore: 'Mỗi cuốn sách bắt đầu từ một dòng ghi chú đầu tiên đầy tò mò.'
      }
    };
  }

  if (resolvedQuestion) {
    return {
      id: 'flashback-question',
      code: 'RESOLVED_QUESTION_FLASHBACK',
      type: 'certificate',
      title: 'Khoảnh khắc Khai Sáng',
      description: `Bạn từng thắc mắc: "${resolvedQuestion.noteText.slice(0, 70)}" và sau đó đã tự mình tìm ra lời giải: "${resolvedQuestion.resolutionText || 'Đã hiểu'}".`,
      icon: '💡',
      weight: 15,
      cooldownUnlocks: 2,
      oneTime: false,
      active: true,
      payload: {
        certificateRecipientTitle: 'Người đi tìm câu trả lời',
        certificateReason: 'Không để câu hỏi dang dở trôi vào quên lãng.'
      }
    };
  }

  if (firstParking && firstParking.noteText.length > 5) {
    return {
      id: 'flashback-parking',
      code: 'PAST_YOU_PARKING',
      type: 'collectible',
      title: 'Dấu chân quá khứ',
      description: `Lời nhắn từ quá khứ: "${firstParking.noteText.slice(0, 80)}". Bạn của hiện tại đã tiếp nối trọn vẹn.`,
      icon: '🧠',
      weight: 15,
      cooldownUnlocks: 2,
      oneTime: false,
      active: true,
      payload: {
        subtitle: 'Hành trình Resume > Track',
        lore: 'Không cần cố gắng đọc hết trong một lần, quan trọng là biết quay lại.'
      }
    };
  }

  return null;
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

  // Check for contextual reward candidates from local data (Requirement 19 - NO AI, 100% Local)
  const docNotes = await localDB.notes.where('documentId').equals(documentId).toArray();
  const allowContextual = Math.random() < 0.35;
  const contextualDefinition = allowContextual ? evaluateContextualReward(documentId, docNotes) : null;

  // Fetch all unlocked rewards to determine owned one-time items and recent rewards for cooldown
  const allUnlocked = await localDB.unlockedRewards.orderBy('unlockedAt').toArray();
  const ownedIds = allUnlocked.map((u) => u.rewardId);
  const recentIds = allUnlocked.slice(-5).map((u) => u.rewardId);

  // Map SEED_REWARDS to engine format
  const pool = SEED_REWARDS.map((r) => ({
    id: r.id,
    type: r.type,
    weight: r.weight,
    cooldownUnlocks: r.cooldownUnlocks,
    oneTime: r.oneTime
  }));

  const chosenEngineReward = chooseReward(pool, recentIds, ownedIds);
  const definition =
    contextualDefinition || SEED_REWARDS.find((r) => r.id === chosenEngineReward?.id) || SEED_REWARDS[0];

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
