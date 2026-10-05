export type Reward = {
  id: string;
  type: 'meme' | 'audio' | 'collectible' | 'certificate' | 'ambient' | 'easter_egg';
  weight: number;
  cooldownUnlocks: number;
  oneTime: boolean;
};

export function chooseReward(pool: Reward[], recentIds: string[], ownedIds: string[], random = Math.random) {
  const eligible = pool.filter(r => !recentIds.slice(-r.cooldownUnlocks).includes(r.id) && !(r.oneTime && ownedIds.includes(r.id)));
  const candidates = eligible.length ? eligible : pool.filter(r => !(r.oneTime && ownedIds.includes(r.id)));
  const total = candidates.reduce((s, r) => s + r.weight, 0);
  let needle = random() * total;
  for (const reward of candidates) {
    needle -= reward.weight;
    if (needle <= 0) return reward;
  }
  return candidates.at(-1) ?? null;
}
