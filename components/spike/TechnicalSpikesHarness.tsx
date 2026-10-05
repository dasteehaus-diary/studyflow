'use client';

import { useState, useEffect } from 'react';
import { LocalPdfSpike } from './LocalPdfSpike';
import { localDB, type LocalDocument, type LocalProgress, type LocalNote } from '@/lib/db/local';
import { unlockDocumentReward, getDocumentReward } from '@/lib/rewards/reward-service';
import { enqueueSync } from '@/lib/sync/sync-service';
import Link from 'next/link';

export function TechnicalSpikesHarness() {
  const [activeTab, setActiveTab] = useState<'a' | 'b' | 'c' | 'd' | 'e'>('a');
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    if (!localDB) return;
    localDB.documents.toArray().then(setDocuments).catch(console.error);
  }, []);

  // Spike C: Test locator save and verification
  const runSpikeCTest = async () => {
    if (!localDB) return;
    if (documents.length === 0) {
      setTestResult('Cần có ít nhất 1 tài liệu trong OPFS để chạy Spike C. Hãy import tài liệu ở Spike A trước.');
      return;
    }
    const doc = documents[0];
    const testPage = 47;
    const testY = 0.63;
    const now = new Date().toISOString();

    await localDB.progress.put({
      documentId: doc.id,
      currentPage: testPage,
      y: testY,
      visitedRanges: [[1, testPage]],
      completed: false,
      lastMeaningfulActivityAt: now,
      updatedAt: now
    });

    const retrieved = await localDB.progress.get(doc.id);
    if (retrieved && retrieved.currentPage === 47 && retrieved.y === 0.63) {
      setTestResult(`PASS: Đã lưu locator {page: 47, y: 0.63} cho "${doc.title}". Khi mở reader, app sẽ tự cuộn đến đúng vị trí này.`);
    } else {
      setTestResult('FAIL: Không đọc lại được locator chính xác từ IndexedDB.');
    }
  };

  // Spike D: Test offline note creation and sync queue preservation
  const runSpikeDTest = async () => {
    if (!localDB) return;
    const testDocId = documents[0]?.id || 'offline-test-doc';
    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    const note: LocalNote = {
      id: noteId,
      documentId: testDocId,
      type: 'quick',
      noteText: `Offline test note created at ${new Date().toLocaleTimeString()}`,
      page: 12,
      y: 0.45,
      locator: { page: 12, y: 0.45 },
      createdAt: now,
      updatedAt: now
    };

    await localDB.notes.add(note);
    await enqueueSync('note', noteId, 'upsert', note);

    const queued = await localDB.syncQueue.where('entityId').equals(noteId).first();
    const stored = await localDB.notes.get(noteId);

    if (stored && queued) {
      setTestResult(`PASS: Note "${note.noteText}" được ghi ngay vào Dexie và xếp hàng trong Sync Queue (queue id: ${queued.id}). Note an toàn khi offline.`);
    } else {
      setTestResult('FAIL: Không lưu được note hoặc không enqueue vào syncQueue.');
    }
  };

  // Spike E: Test reward persistence and no-reroll
  const runSpikeETest = async () => {
    if (!localDB) return;
    const testDocId = documents[0]?.id || 'spike-e-demo-tape';
    const testTitle = documents[0]?.title || 'Demo Cassette Tape';

    // Call 1
    const res1 = await unlockDocumentReward(testDocId, testTitle);
    // Call 2 (simulating reload or repeated finish action)
    const res2 = await unlockDocumentReward(testDocId, testTitle);
    // Call 3
    const res3 = await getDocumentReward(testDocId);

    if (res1 && res2 && res3 && res1.reward.rewardId === res2.reward.rewardId && res2.isNew === false && res3.rewardId === res1.reward.rewardId) {
      setTestResult(`PASS: Reward "${res1.reward.rewardTitle}" (${res1.reward.rewardCode}) được cấp 1 lần duy nhất. Các lần gọi sau đều trả về chính xác reward cũ (isNew=false, no reroll).`);
    } else {
      setTestResult('FAIL: Reroll xảy ra hoặc không lưu được reward vào unlockedRewards.');
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="filterRow" style={{ marginBottom: 20 }}>
        {[
          ['a', 'Spike A — OPFS Persistence'],
          ['b', 'Spike B — React-PDF 11'],
          ['c', 'Spike C — Resume Precision'],
          ['d', 'Spike D — Offline Notes'],
          ['e', 'Spike E — Reward Persistence']
        ].map(([key, label]) => (
          <button
            key={key}
            className={`pill ${activeTab === key ? 'activePill' : ''}`}
            style={activeTab === key ? { background: 'var(--deep)', color: 'white', borderColor: 'var(--deep)' } : undefined}
            onClick={() => {
              setActiveTab(key as typeof activeTab);
              setTestResult('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'a' && <LocalPdfSpike />}

      {activeTab === 'b' && (
        <section className="card spikeCard">
          <div className="eyebrow">Phase 0 · Spike B</div>
          <h2 style={{ margin: '8px 0 12px' }}>React-PDF 11 & Virtualized Large Document Rendering</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Xác minh khả năng đọc tài liệu 50–100MB / 300+ trang mà không mount toàn bộ các trang cùng lúc.
            Reader của StudyFlow chỉ mount cửa sổ hiển thị <code>[trang_hiện_tại - 1, trang_hiện_tại, trang_hiện_tại + 1]</code> và giữ các trang khác dạng placeholder nhẹ.
          </p>

          <div style={{ marginTop: 20 }}>
            {documents.length > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {documents.map((d) => (
                  <div key={d.id} className="card spikeDoc">
                    <div>
                      <strong>{d.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{d.opfsPath}</div>
                    </div>
                    <Link className="primary" href={`/reader/${d.id}`}>
                      Mở trong Virtualized Reader →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="emptyState">Chưa có tài liệu nào. Hãy import ở Spike A trước.</div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'c' && (
        <section className="card spikeCard">
          <div className="eyebrow">Phase 0 · Spike C</div>
          <h2 style={{ margin: '8px 0 12px' }}>Resume Precision ({'{page, y}'})</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Xác minh độ chính xác khi phục hồi vị trí đọc: lưu locator dạng <code>{`{"page": 47, "y": 0.63}`}</code> vào Dexie và tải lại tài liệu.
          </p>
          <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
            <button className="primary" onClick={runSpikeCTest}>
              Chạy kiểm tra Spike C
            </button>
            {documents[0] && (
              <Link className="secondary" href={`/reader/${documents[0].id}?page=47&y=0.63`}>
                Kiểm tra trực tiếp trên Reader (Trang 47, y=0.63) →
              </Link>
            )}
          </div>
          {testResult && <div className="spikeMessage" style={{ marginTop: 16 }}>{testResult}</div>}
        </section>
      )}

      {activeTab === 'd' && (
        <section className="card spikeCard">
          <div className="eyebrow">Phase 0 · Spike D</div>
          <h2 style={{ margin: '8px 0 12px' }}>Offline Notes & Sync Queue</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Xác minh ghi chú và câu hỏi tạo khi mất mạng (offline) không bao giờ bị mất: ghi vào Dexie trước, đẩy vào Sync Queue, và giữ lại cho đến khi server xác nhận.
          </p>
          <div style={{ marginTop: 18 }}>
            <button className="primary" onClick={runSpikeDTest}>
              Chạy kiểm tra Spike D
            </button>
          </div>
          {testResult && <div className="spikeMessage" style={{ marginTop: 16 }}>{testResult}</div>}
        </section>
      )}

      {activeTab === 'e' && (
        <section className="card spikeCard">
          <div className="eyebrow">Phase 0 · Spike E</div>
          <h2 style={{ margin: '8px 0 12px' }}>Finish Tape & Reward Persistence (No Reroll)</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Xác minh cơ chế mở quà B-Side: khi cuộn băng hoàn thành lần đầu, chọn một phần quà từ Seed Pool và lưu vào <code>unlocked_rewards</code>. Reload hoặc bấm hoàn thành lại tuyệt đối không reroll phần quà khác.
          </p>
          <div style={{ marginTop: 18 }}>
            <button className="primary" onClick={runSpikeETest}>
              Chạy kiểm tra Spike E
            </button>
          </div>
          {testResult && <div className="spikeMessage" style={{ marginTop: 16 }}>{testResult}</div>}
        </section>
      )}
    </div>
  );
}
