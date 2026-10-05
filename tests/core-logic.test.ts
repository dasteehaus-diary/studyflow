import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { mergePagesIntoRanges, cassetteProgress } from '../lib/progress/cassette.ts';
import { chooseReward, type Reward } from '../lib/rewards/engine.ts';

describe('Progress & Cassette Coverage', () => {
  it('merges contiguous and non-contiguous pages correctly', () => {
    const pages = [1, 2, 3, 5, 7, 8, 9, 10, 15];
    const ranges = mergePagesIntoRanges(pages);
    assert.deepStrictEqual(ranges, [
      [1, 3],
      [5, 5],
      [7, 10],
      [15, 15]
    ]);
  });

  it('handles empty and single page lists', () => {
    assert.deepStrictEqual(mergePagesIntoRanges([]), []);
    assert.deepStrictEqual(mergePagesIntoRanges([42]), [[42, 42]]);
    assert.deepStrictEqual(mergePagesIntoRanges([4, 4, 4]), [[4, 4]]);
  });

  it('handles unordered and duplicate pages', () => {
    const pages = [10, 2, 3, 1, 2, 11, 4];
    assert.deepStrictEqual(mergePagesIntoRanges(pages), [
      [1, 4],
      [10, 11]
    ]);
  });

  it('calculates coverage percentage accurately', () => {
    assert.strictEqual(cassetteProgress(100, [[1, 50]]), 50);
    assert.strictEqual(cassetteProgress(10, [[1, 2], [5, 6], [9, 10]]), 60);
    assert.strictEqual(cassetteProgress(0, [[1, 10]]), 0);
    assert.strictEqual(cassetteProgress(10, [[1, 15]]), 100);
  });
});

describe('Reward Selection Engine', () => {
  const pool: Reward[] = [
    { id: 'potato', type: 'collectible', weight: 10, cooldownUnlocks: 3, oneTime: true },
    { id: 'duck', type: 'collectible', weight: 10, cooldownUnlocks: 3, oneTime: true },
    { id: 'meme_1', type: 'meme', weight: 20, cooldownUnlocks: 2, oneTime: false },
    { id: 'audio_1', type: 'audio', weight: 15, cooldownUnlocks: 2, oneTime: false }
  ];

  it('never awards a one-time reward if already owned', () => {
    // owned: potato and duck
    const owned = ['potato', 'duck'];
    const recent: string[] = [];

    // Run 50 selections with varying random values
    for (let r = 0; r < 1; r += 0.05) {
      const selected = chooseReward(pool, recent, owned, () => r);
      assert.ok(selected);
      assert.notStrictEqual(selected.id, 'potato');
      assert.notStrictEqual(selected.id, 'duck');
      assert.ok(['meme_1', 'audio_1'].includes(selected.id));
    }
  });

  it('respects cooldown for repeatable rewards', () => {
    // recent was meme_1, cooldown is 2
    const recent = ['meme_1'];
    const owned: string[] = ['potato', 'duck'];
    // eligible pool only has audio_1
    const selected = chooseReward(pool, recent, owned, () => 0.5);
    assert.ok(selected);
    assert.strictEqual(selected.id, 'audio_1');
  });

  it('falls back gracefully when all eligible rewards are exhausted', () => {
    const owned = ['potato', 'duck'];
    // both repeatable are in recent
    const recent = ['meme_1', 'audio_1'];
    const selected = chooseReward(pool, recent, owned, () => 0.5);
    assert.ok(selected);
    // Should fall back to repeatable candidate rather than null/crash
    assert.ok(['meme_1', 'audio_1'].includes(selected.id));
  });

  it('returns deterministic reward for deterministic random seed', () => {
    const pick1 = chooseReward(pool, [], [], () => 0.1);
    const pick2 = chooseReward(pool, [], [], () => 0.1);
    assert.deepStrictEqual(pick1, pick2);
  });
});
