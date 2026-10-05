'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { LocalDocument, LocalUnlockedReward } from '@/lib/db/local';
import { localDB } from '@/lib/db/local';
import { unlockDocumentReward, getDocumentReward } from '@/lib/rewards/reward-service';
import { playRewardSound } from '@/lib/rewards/audio-synth';
import { enqueueSync } from '@/lib/sync/sync-service';

interface FinishTapeModalProps {
  document: LocalDocument;
  isOpen: boolean;
  onClose: () => void;
  onFinishTapeCompleted: () => void;
}

export function FinishTapeModal({ document, isOpen, onClose, onFinishTapeCompleted }: FinishTapeModalProps) {
  const [step, setStep] = useState<'prompt' | 'winding' | 'revealed'>('prompt');
  const [unlockedReward, setUnlockedReward] = useState<LocalUnlockedReward | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Check if already completed and rewarded
      getDocumentReward(document.id).then((reward) => {
        if (reward) {
          setUnlockedReward(reward);
          setStep('revealed');
        } else {
          setStep('prompt');
        }
      });
    }
  }, [isOpen, document.id]);

  if (!isOpen) return null;

  const handleFinishTape = async () => {
    setStep('winding');

    // 1. Mark document completed in Dexie and update progress
    const now = new Date().toISOString();
    if (localDB) {
      await localDB.documents.update(document.id, {
        status: 'completed',
        updatedAt: now
      });
      await localDB.progress.update(document.id, {
        completed: true,
        completedAt: now,
        lastMeaningfulActivityAt: now,
        updatedAt: now
      });
      await enqueueSync('document', document.id, 'upsert', {
        ...document,
        status: 'completed',
        updatedAt: now
      });
      await enqueueSync('progress', document.id, 'upsert', {
        documentId: document.id,
        completed: true,
        completedAt: now,
        lastMeaningfulActivityAt: now,
        updatedAt: now
      });
    }

    // 2. Assign reward
    const result = await unlockDocumentReward(document.id, document.title);
    const reward = result?.reward ?? null;
    setUnlockedReward(reward);

    // 3. Play sound effect after 1.8 seconds of cassette winding
    setTimeout(() => {
      const soundType = (reward?.payload?.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare';
      playRewardSound(soundType);
      setStep('revealed');
      onFinishTapeCompleted();
    }, 2200);
  };

  const payload = unlockedReward?.payload as Record<string, unknown> | undefined;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'grid',
        placeItems: 'center',
        padding: 16
      }}
      onClick={step === 'revealed' ? onClose : undefined}
    >
      <div
        className="card"
        style={{
          width: 'min(500px, 100%)',
          padding: 28,
          textAlign: 'center',
          position: 'relative',
          animation: 'fadeIn 0.25s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'prompt' && (
          <div>
            <div className="eyebrow" style={{ color: 'var(--terracotta)' }}>End of Tape</div>
            <h2 style={{ margin: '12px 0 8px' }}>Bạn đã đọc tới cuối tài liệu!</h2>
            <p className="muted" style={{ lineHeight: 1.6, marginBottom: 24 }}>
              Hoàn thành cuộn băng này để đánh dấu tài liệu là <strong>Completed</strong> và khám phá món quà bí ẩn trong <strong>B-Side Mystery Gift</strong>!
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="secondary" onClick={onClose}>
                Đọc tiếp
              </button>
              <button
                className="primary"
                style={{ padding: '10px 24px', fontSize: 15 }}
                onClick={handleFinishTape}
              >
                📼 Finish Tape
              </button>
            </div>
          </div>
        )}

        {step === 'winding' && (
          <div style={{ padding: '24px 0' }}>
            <div style={{ fontSize: 48, animation: 'spin 1.2s infinite linear', display: 'inline-block' }}>
              📼
            </div>
            <h3 style={{ marginTop: 16, marginBottom: 6 }}>Đang cuộn nốt băng Cassette…</h3>
            <p className="muted" style={{ fontSize: 13 }}>Khám phá B-Side Mystery Gift đang được chuẩn bị…</p>
            <style jsx>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {step === 'revealed' && unlockedReward && (
          <div>
            <div className="eyebrow" style={{ color: 'var(--terracotta)' }}>✨ B-Side Found! ✨</div>
            <div style={{ fontSize: 64, margin: '12px 0' }}>
              {(payload?.icon as string) || '🎁'}
            </div>
            <h2 style={{ margin: '6px 0' }}>{unlockedReward.rewardTitle}</h2>

            {Boolean(payload?.subtitle) && (
              <div className="muted" style={{ fontStyle: 'italic', fontSize: 13, marginBottom: 12 }}>
                {payload?.subtitle as string}
              </div>
            )}

            {/* Special displays per reward type */}
            {unlockedReward.rewardType === 'certificate' && (
              <div
                style={{
                  background: '#f9f6ef',
                  border: '2px dashed var(--olive-cream)',
                  borderRadius: 12,
                  padding: 14,
                  margin: '12px 0',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                  Chứng nhận hoàn thành
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, margin: '4px 0', color: 'var(--ink)' }}>
                  {payload?.certificateRecipientTitle as string}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {payload?.certificateReason as string}
                </div>
              </div>
            )}

            {unlockedReward.rewardType === 'collectible' && (
              <div style={{ background: '#f5f0e6', borderRadius: 12, padding: 12, margin: '12px 0', fontSize: 13 }}>
                <p style={{ margin: 0, color: 'var(--muted)', fontStyle: 'italic' }}>
                  “{payload?.lore as string}”
                </p>
              </div>
            )}

            {unlockedReward.rewardType === 'meme' && (
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
                <div style={{ fontSize: 16, letterSpacing: 1 }}>{payload?.memeHeader as string}</div>
                <div style={{ fontSize: 14, marginTop: 10, whiteSpace: 'pre-line', color: 'var(--apricot)' }}>
                  {payload?.memeFooter as string}
                </div>
              </div>
            )}

            {unlockedReward.rewardType === 'audio' && (
              <div style={{ margin: '14px 0' }}>
                <button
                  className="secondary"
                  onClick={() => playRewardSound((payload?.soundType as 'fanfare' | 'retro-chime' | 'lofi-rain' | 'mystery-chord') || 'fanfare')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  🔊 Nghe lại âm thanh B-Side
                </button>
              </div>
            )}

            <p className="muted" style={{ fontSize: 12, margin: '16px 0' }}>
              Món quà này đã được lưu vĩnh viễn vào <strong>B-Side Vault</strong> của bạn.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link className="primary" href="/vault" onClick={onClose}>
                Mở B-Side Vault
              </Link>
              <button className="secondary" onClick={onClose}>
                Xong
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
