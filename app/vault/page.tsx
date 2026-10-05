'use client';

import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalUnlockedReward } from '@/lib/db/local';
import { playRewardSound } from '@/lib/rewards/audio-synth';
import { formatRelativeTime } from '@/lib/utils/time';

export default function VaultPage() {
  const [unlockedRewards, setUnlockedRewards] = useState<LocalUnlockedReward[]>([]);
  const [activeModalReward, setActiveModalReward] = useState<LocalUnlockedReward | null>(null);

  useEffect(() => {
    const db = localDB;
    if (!db) return;
    const subscription = liveQuery(() => db.unlockedRewards.orderBy('unlockedAt').reverse().toArray())
      .subscribe({ next: setUnlockedRewards, error: console.error });
    return () => subscription.unsubscribe();
  }, []);

  const activePayload = activeModalReward?.payload as Record<string, unknown> | undefined;

  return (
    <AppShell>
      <div className="eyebrow">B-Side Vault</div>
      <h1>Discovered: {unlockedRewards.length} / ???</h1>
      <p className="muted" style={{ maxWidth: 640, marginTop: -14, marginBottom: 28, lineHeight: 1.5 }}>
        Mỗi khi hoàn thành một cuộn băng tài liệu (Finish Tape), một món quà ngẫu nhiên từ thế giới B-Side sẽ được mở khóa và lưu giữ vĩnh viễn tại đây.
      </p>

      {/* Rewards Grid */}
      <div className="vaultGrid">
        {unlockedRewards.map((reward) => {
          const payload = reward.payload as Record<string, unknown>;
          const icon = (payload.icon as string) || '🎁';

          return (
            <div
              key={reward.id}
              className="card reward"
              style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
              onClick={() => {
                setActiveModalReward(reward);
                if (reward.rewardType === 'audio') {
                  playRewardSound((payload.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare');
                }
              }}
            >
              <div>{icon}</div>
              <small style={{ fontWeight: 600, color: 'var(--ink)' }}>{reward.rewardTitle}</small>
            </div>
          );
        })}

        {/* Mysterious locked placeholders */}
        {Array.from({ length: Math.max(4, 8 - unlockedRewards.length) }).map((_, i) => (
          <div
            key={`placeholder-${i}`}
            className="card reward"
            style={{ opacity: 0.35, background: 'rgba(0,0,0,0.02)', borderStyle: 'dashed' }}
          >
            <div style={{ fontSize: 32 }}>📼</div>
            <small>B-Side Track {unlockedRewards.length + i + 1}</small>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {activeModalReward && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16
          }}
          onClick={() => setActiveModalReward(null)}
        >
          <div
            className="card"
            style={{ width: 'min(460px, 100%)', padding: 28, textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="eyebrow" style={{ color: 'var(--terracotta)' }}>B-Side Relic</div>
            <div style={{ fontSize: 64, margin: '14px 0' }}>
              {(activePayload?.icon as string) || '🎁'}
            </div>
            <h2 style={{ margin: '6px 0' }}>{activeModalReward.rewardTitle}</h2>

            {Boolean(activePayload?.subtitle) && (
              <div className="muted" style={{ fontStyle: 'italic', fontSize: 13, marginBottom: 14 }}>
                {activePayload?.subtitle as string}
              </div>
            )}

            {/* Certificate display */}
            {activeModalReward.rewardType === 'certificate' && (
              <div
                style={{
                  background: '#f9f6ef',
                  border: '2px dashed var(--olive-cream)',
                  borderRadius: 12,
                  padding: 16,
                  margin: '12px 0',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                  Chứng nhận
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0', color: 'var(--ink)' }}>
                  {activePayload?.certificateRecipientTitle as string}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {activePayload?.certificateReason as string}
                </div>
              </div>
            )}

            {/* Collectible display */}
            {activeModalReward.rewardType === 'collectible' && (
              <div style={{ background: '#f5f0e6', borderRadius: 12, padding: 14, margin: '12px 0', fontSize: 13 }}>
                <span className="verifyBadge pass" style={{ display: 'inline-block', marginBottom: 6 }}>
                  Rarity: {(activePayload?.collectibleRarity as string) || 'Rare'}
                </span>
                <p style={{ margin: 0, color: 'var(--muted)', fontStyle: 'italic' }}>
                  “{activePayload?.lore as string}”
                </p>
              </div>
            )}

            {/* Meme display */}
            {activeModalReward.rewardType === 'meme' && (
              <div
                style={{
                  background: 'var(--ink)',
                  color: 'white',
                  borderRadius: 12,
                  padding: 16,
                  margin: '12px 0',
                  fontFamily: 'Impact, ui-sans-serif, sans-serif'
                }}
              >
                <div style={{ fontSize: 16, letterSpacing: 1 }}>{activePayload?.memeHeader as string}</div>
                <div style={{ fontSize: 14, marginTop: 10, whiteSpace: 'pre-line', color: 'var(--apricot)' }}>
                  {activePayload?.memeFooter as string}
                </div>
              </div>
            )}

            {/* Audio action */}
            {activeModalReward.rewardType === 'audio' && (
              <div style={{ margin: '14px 0' }}>
                <button
                  className="secondary"
                  onClick={() => playRewardSound((activePayload?.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  🔊 Phát lại âm thanh B-Side
                </button>
              </div>
            )}

            {/* Easter egg */}
            {activeModalReward.rewardType === 'easter_egg' && (
              <div style={{ background: '#f5f0e6', borderRadius: 12, padding: 14, margin: '12px 0', fontSize: 13 }}>
                <p style={{ margin: '0 0 6px' }}>{activePayload?.surpriseText as string}</p>
                <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>{activePayload?.postCreditText as string}</p>
              </div>
            )}

            {/* Provenance snapshot */}
            <div className="muted" style={{ fontSize: 12, marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              Mở khóa từ tài liệu: <strong>{activeModalReward.documentTitle || 'Tài liệu đã đọc'}</strong>
              <div style={{ fontSize: 11, marginTop: 2 }}>{formatRelativeTime(activeModalReward.unlockedAt)}</div>
            </div>

            <div style={{ marginTop: 20 }}>
              <button className="primary" onClick={() => setActiveModalReward(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
