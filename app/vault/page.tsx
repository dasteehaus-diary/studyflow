'use client';

import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { AppShell } from '@/components/AppShell';
import { localDB, type LocalUnlockedReward, type LocalDocument } from '@/lib/db/local';
import { playRewardSound } from '@/lib/rewards/audio-synth';
import { formatRelativeTime } from '@/lib/utils/time';
import { IconBSide, IconCassetteLogo, IconClose } from '@/components/icons/BrandIcons';

type VaultFilter = 'all' | 'unlocked' | 'mystery';

export function VaultPage() {
  const [unlockedRewards, setUnlockedRewards] = useState<LocalUnlockedReward[]>([]);
  const [documentsMap, setDocumentsMap] = useState<Record<string, LocalDocument>>({});
  const [activeModalReward, setActiveModalReward] = useState<LocalUnlockedReward | null>(null);
  const [filter, setFilter] = useState<VaultFilter>('all');

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

  // Mystery placeholder count (3-5 slots, Section 12)
  const mysterySlots = useMemo(() => {
    return Array.from({ length: 4 });
  }, []);

  return (
    <AppShell>
      {/* Top Breadcrumb */}
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Kho báu B-Side
      </div>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 10px' }}>
          Kho B-Side · Đã khám phá: {unlockedRewards.length} / ???
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15, maxWidth: 620, lineHeight: 1.55 }}>
          Mỗi khi bạn hoàn thành một cuộn băng (Finish Tape), một món quà bất ngờ từ mặt B sẽ được mở khóa và cất giữ vĩnh viễn trong bộ sưu tập này.
        </p>
      </div>

      {/* Filter Row: Tất cả, Đã khám phá, Chưa khám phá */}
      <div className="filterRow" style={{ marginBottom: 26 }}>
        {[
          ['all', `Tất cả`],
          ['unlocked', `Đã khám phá (${unlockedRewards.length})`],
          ['mystery', `Chưa khám phá (???)`]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`pill ${filter === key ? 'activePill' : ''}`}
            onClick={() => setFilter(key as VaultFilter)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Rewards Grid */}
      {unlockedRewards.length === 0 && filter === 'unlocked' ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          Bạn chưa mở khóa món quà B-Side nào. Hãy đọc xong một tài liệu và bấm Finish Tape!
        </div>
      ) : (
        <div className="vaultGrid">
          {/* Unlocked Cards with Clean White Base and Soft Pastel Artwork */}
          {(filter === 'all' || filter === 'unlocked') &&
            unlockedRewards.map((reward, idx) => {
              const payload = reward.payload as Record<string, unknown>;
              const icon = (payload.icon as string) || '🎁';
              const ARTWORK_TINTS = [
                'var(--sf-orange-soft)',
                'var(--sf-mint-soft)',
                'var(--sf-coral-soft)',
                'var(--sf-blue-soft)',
                'var(--sf-butter-soft)',
                'var(--sf-lavender-soft)'
              ];
              const tint = ARTWORK_TINTS[idx % ARTWORK_TINTS.length];

              return (
                <div
                  key={reward.id}
                  className="card"
                  style={{
                    padding: 16,
                    borderRadius: 'var(--sf-radius-lg)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    background: 'var(--sf-surface)',
                    border: '1px solid var(--sf-line)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: 'var(--sf-shadow-sm)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--sf-shadow-sm)';
                  }}
                  onClick={() => {
                    setActiveModalReward(reward);
                    if (reward.rewardType === 'audio') {
                      playRewardSound((payload.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare');
                    }
                  }}
                >
                  {/* Card Artwork / Stamp Area */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 14,
                      background: tint,
                      border: '1px solid var(--sf-line)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 48,
                      marginBottom: 12
                    }}
                  >
                    {icon}
                  </div>

                  {/* Card Title & Type */}
                  <strong style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>
                    {reward.rewardTitle}
                  </strong>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {formatRelativeTime(reward.unlockedAt)}
                  </span>
                </div>
              );
            })}

          {/* Mysterious unnumbered locked placeholders (Section 12: neutral paper + lavender accent) */}
          {(filter === 'all' || filter === 'mystery') &&
            mysterySlots.map((_, i) => (
              <div
                key={`placeholder-${i}`}
                className="card"
                style={{
                  padding: 16,
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  background: 'var(--card-subtle)',
                  border: '1.5px dashed var(--line)',
                  opacity: 0.85,
                  cursor: 'default',
                  userSelect: 'none'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 12,
                    background: 'var(--sf-surface)',
                    border: '1px dashed var(--line)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--sf-lavender)',
                    opacity: 0.9,
                    marginBottom: 12
                  }}
                >
                  <IconCassetteLogo size={32} />
                </div>
                <strong style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>???</strong>
                <span className="muted" style={{ fontSize: 11 }}>Bí mật mặt B</span>
              </div>
            ))}
        </div>
      )}

      {/* Footer subtle quote */}
      <p className="muted" style={{ fontStyle: 'italic', fontSize: 13, marginTop: 40, textAlign: 'center' }}>
        “Còn những điều thú vị khác đang nằm ẩn giấu trong mặt B…”
      </p>

      {/* Detail Modal / Postcard View */}
      {activeModalReward && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setActiveModalReward(null)}
        >
          <div
            className="card"
            style={{
              width: 'min(460px, 100%)',
              padding: 28,
              textAlign: 'center',
              position: 'relative',
              borderRadius: 20
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModalReward(null)}
              className="secondary"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                padding: '4px 8px',
                borderRadius: '50%',
                border: 'none',
                background: 'var(--card-subtle)'
              }}
              aria-label="Đóng"
            >
              <IconClose size={16} />
            </button>

            {/* Postcard Stamp Artwork */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 20,
                background: 'var(--card-subtle)',
                border: '2px dashed var(--line)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 54,
                margin: '0 auto 16px'
              }}
            >
              {(activePayload?.icon as string) || '🎁'}
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: 22, fontFamily: 'var(--font-serif)' }}>
              {activeModalReward.rewardTitle}
            </h3>

            <div className="eyebrow" style={{ marginBottom: 16, color: 'var(--sf-mint-strong)' }}>
              {activeModalReward.rewardType === 'audio' ? 'Âm thanh kỷ niệm' : 'Bưu thiếp kỷ niệm'}
            </div>

            <p style={{ lineHeight: 1.6, margin: '0 0 20px', color: 'var(--ink)', fontSize: 14 }}>
              {(activePayload?.description as string) || (activePayload?.message as string) || 'Một phần thưởng ngẫu nhiên từ kho B-Side của bạn.'}
            </p>

            {/* Provenance info (Section 12: Source document + unlocked date) */}
            <div
              style={{
                background: 'var(--card-subtle)',
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 12,
                textAlign: 'left',
                border: '1px solid var(--line)',
                marginBottom: 20
              }}
            >
              <div style={{ color: 'var(--muted)', marginBottom: 2 }}>Nguồn gốc kỷ niệm:</div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {activeModalReward.documentTitle || (activeModalReward.documentId ? documentsMap[activeModalReward.documentId]?.title : undefined) || 'Tài liệu đã hoàn thành'}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Mở khóa {formatRelativeTime(activeModalReward.unlockedAt)}
              </div>
            </div>

            {/* Audio Replay CTA if audio reward */}
            {activeModalReward.rewardType === 'audio' && (
              <button
                className="secondary"
                style={{ width: '100%', marginBottom: 10, padding: '10px', fontWeight: 600 }}
                onClick={() => {
                  playRewardSound((activePayload?.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare');
                }}
              >
                🔊 Phát lại âm thanh
              </button>
            )}

            <button
              className="primary"
              style={{ width: '100%', padding: '10px 14px' }}
              onClick={() => setActiveModalReward(null)}
            >
              Cất vào kho B-Side
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default VaultPage;
