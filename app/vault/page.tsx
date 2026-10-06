'use client';

import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalUnlockedReward, type LocalDocument } from '@/lib/db/local';
import { playRewardSound } from '@/lib/rewards/audio-synth';
import { formatRelativeTime } from '@/lib/utils/time';

export default function VaultPage() {
  const [unlockedRewards, setUnlockedRewards] = useState<LocalUnlockedReward[]>([]);
  const [documentsMap, setDocumentsMap] = useState<Record<string, LocalDocument>>({});
  const [activeModalReward, setActiveModalReward] = useState<LocalUnlockedReward | null>(null);

  useEffect(() => {
    const db = localDB;
    if (!db) return;

    const subRewards = liveQuery(() => db.unlockedRewards.orderBy('unlockedAt').reverse().toArray())
      .subscribe({ next: setUnlockedRewards, error: console.error });

    const subDocs = liveQuery(() => db.documents.toArray())
      .subscribe({
        next: (docs) => {
          const map: Record<string, LocalDocument> = {};
          docs.forEach(d => { map[d.id] = d; });
          setDocumentsMap(map);
        },
        error: console.error
      });

    return () => {
      subRewards.unsubscribe();
      subDocs.unsubscribe();
    };
  }, []);

  const activePayload = activeModalReward?.payload as Record<string, unknown> | undefined;

  return (
    <AppShell>
      <div className="eyebrow">Kho báu B-Side</div>
      {/* Requirement 17: Discovered X / ??? without revealing total count */}
      <h1>Đã khám phá: {unlockedRewards.length} / ???</h1>
      <p className="muted" style={{ maxWidth: 640, marginTop: -14, marginBottom: 28, lineHeight: 1.5 }}>
        Mỗi khi hoàn thành một cuộn băng tài liệu (Finish Tape), một món quà ngẫu nhiên từ thế giới B-Side sẽ được mở khóa và lưu giữ vĩnh viễn tại đây.
      </p>

      {/* Rewards Grid */}
      {unlockedRewards.length === 0 ? (
        <div className="card emptyState" style={{ marginTop: 20, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📼</div>
          <h3 style={{ margin: '0 0 8px' }}>Chưa tìm thấy B-Side nào.</h3>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto', lineHeight: 1.5 }}>
            Hoàn thành cuộn băng đầu tiên rồi xem StudyFlow giấu gì ở mặt B.
          </p>
        </div>
      ) : (
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

          {/* Mysterious unnumbered locked placeholders */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`placeholder-${i}`}
              className="card reward"
              style={{
                opacity: 0.45,
                background: 'var(--card-subtle)',
                borderStyle: 'dashed',
                transition: 'transform 0.2s ease',
                cursor: 'default'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'rotate(-1deg) translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ fontSize: 32 }}>📼</div>
              <small>???</small>
            </div>
          ))}
        </div>
      )}

      {unlockedRewards.length > 0 && (
        <p className="muted" style={{ fontStyle: 'italic', fontSize: 13, marginTop: 32, textAlign: 'center' }}>
          “Còn những thứ khác đang nằm đâu đó trong B-Side…”
        </p>
      )}

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
                  background: 'var(--card-subtle)',
                  border: '2px dashed var(--olive-cream)',
                  borderRadius: 12,
                  padding: 16,
                  margin: '12px 0',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                  Chứng nhận hoàn thành
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0', color: 'var(--ink)' }}>
                  {activePayload?.certificateRecipientTitle as string}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {activePayload?.certificateReason as string}
                </div>
              </div>
            )}

            {/* Collectible display (Requirement 16 - No rarity label) */}
            {activeModalReward.rewardType === 'collectible' && (
              <div style={{ background: 'var(--card-subtle)', borderRadius: 12, padding: 14, margin: '12px 0', fontSize: 13 }}>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  🔊 Phát âm thanh B-Side
                </button>
              </div>
            )}

            <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Mở khóa từ tài liệu: <strong>{(activeModalReward.documentId && documentsMap[activeModalReward.documentId]?.title) || activeModalReward.documentTitle || 'Cuộn băng StudyFlow'}</strong>
              <br />
              <span style={{ fontSize: 11 }}>({formatRelativeTime(activeModalReward.unlockedAt)})</span>
            </div>

            <div style={{ marginTop: 20 }}>
              <button className="primary" style={{ padding: '8px 24px' }} onClick={() => setActiveModalReward(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
