'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { localDB, type HighlightColor } from '@/lib/db/local';
import { supportsOPFS, isPersistentStorageGranted, requestPersistentStorage } from '@/lib/storage/opfs';
import { exportStudyFlowBackup, restoreStudyFlowBackup, type StudyFlowBackupData } from '@/lib/data/backup';

export default function SettingsPage() {
  // Appearance & Reader settings
  const [appTheme, setAppTheme] = useState('warm');
  const [readerBg, setReaderBg] = useState('warm');
  const [fitMode, setFitMode] = useState('fit-width');
  const [defaultHlColor, setDefaultHlColor] = useState<HighlightColor>('apricot');

  // Telegram settings
  const [inactivityDays, setInactivityDays] = useState<number>(3);
  const [showContext, setShowContext] = useState<boolean>(true);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramStatusMsg, setTelegramStatusMsg] = useState('');

  // Storage state
  const [opfsOk, setOpfsOk] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);

  // Backup state
  const [includePdfs, setIncludePdfs] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');

  useEffect(() => {
    setOpfsOk(supportsOPFS());
    isPersistentStorageGranted().then(setPersistent).catch(() => setPersistent(false));

    // Load saved settings from localDB
    if (localDB) {
      localDB.settings.get('app_settings').then((item) => {
        if (item?.value && typeof item.value === 'object') {
          const v = item.value as Record<string, unknown>;
          if (v.appTheme) setAppTheme(v.appTheme as string);
          if (v.readerBg) setReaderBg(v.readerBg as string);
          if (v.fitMode) setFitMode(v.fitMode as string);
          if (v.defaultHlColor) setDefaultHlColor(v.defaultHlColor as HighlightColor);
          if (v.inactivityDays !== undefined) setInactivityDays(v.inactivityDays as number);
          if (v.showContext !== undefined) setShowContext(v.showContext as boolean);
          if (v.telegramChatId) setTelegramChatId(v.telegramChatId as string);
        }
      }).catch(console.error);
    }
  }, []);

  const saveSettings = async (updates: Record<string, unknown>) => {
    if (!localDB) return;
    const current = (await localDB.settings.get('app_settings'))?.value as Record<string, unknown> || {};
    const next = { ...current, ...updates };
    await localDB.settings.put({ key: 'app_settings', value: next });
  };

  const handleRequestPersistent = async () => {
    const granted = await requestPersistentStorage();
    setPersistent(granted);
  };

  const handleExportBackup = async () => {
    setBackupBusy(true);
    setBackupMessage('Đang chuẩn bị file backup…');
    try {
      const data = await exportStudyFlowBackup(includePdfs);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMessage(`✓ Đã xuất backup thành công (${data.documents.length} tài liệu, ${data.notes.length} ghi chú${includePdfs ? ', kèm PDF' : ''}).`);
    } catch (err) {
      setBackupMessage(`Lỗi xuất backup: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBackupBusy(true);
    setBackupMessage('Đang phục hồi dữ liệu từ file backup…');
    try {
      const text = await file.text();
      const data = JSON.parse(text) as StudyFlowBackupData;
      const res = await restoreStudyFlowBackup(data);
      setBackupMessage(`✓ Phục hồi thành công: ${res.documentsCount} tài liệu, ${res.notesCount} ghi chú, ${res.pdfsRestored} file PDF.`);
    } catch (err) {
      setBackupMessage(`Lỗi phục hồi: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const handleTestReminder = () => {
    if (!telegramChatId.trim()) {
      setTelegramStatusMsg('Vui lòng nhập Chat ID Telegram trước khi test.');
      return;
    }
    setTelegramStatusMsg('✓ Đã lưu cấu hình. Edge Function sẽ gửi tin nhắc khi đến hạn inactivity.');
  };

  return (
    <AppShell>
      <div className="eyebrow">Settings</div>
      <h1>Keep it small.</h1>

      <div style={{ display: 'grid', gap: 24, maxWidth: 760 }}>
        {/* Appearance Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 16px' }}>Giao diện & Trải nghiệm đọc</h3>

          <div className="setting">
            <div>
              <strong>Giao diện ứng dụng</strong>
              <div className="muted" style={{ fontSize: 13 }}>Tông màu chủ đạo của StudyFlow</div>
            </div>
            <select
              value={appTheme}
              onChange={(e) => {
                setAppTheme(e.target.value);
                saveSettings({ appTheme: e.target.value });
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
            >
              <option value="warm">Warm Off-white (Mặc định)</option>
              <option value="light">Crisp Light</option>
              <option value="dark">Cozy Dark</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Nền xung quanh Reader</strong>
              <div className="muted" style={{ fontSize: 13 }}>Không làm biến dạng màu sắc trang PDF</div>
            </div>
            <select
              value={readerBg}
              onChange={(e) => {
                setReaderBg(e.target.value);
                saveSettings({ readerBg: e.target.value });
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
            >
              <option value="warm">☕ Warm / Sepia</option>
              <option value="white">⚪ Trắng</option>
              <option value="dark">🌙 Dark surrounding</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Chế độ xem mặc định</strong>
              <div className="muted" style={{ fontSize: 13 }}>Độ rộng trang khi mở tài liệu mới</div>
            </div>
            <select
              value={fitMode}
              onChange={(e) => {
                setFitMode(e.target.value);
                saveSettings({ fitMode: e.target.value });
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
            >
              <option value="fit-width">Fit Width (Vừa chiều ngang)</option>
              <option value="fit-page">Fit Page (Toàn trang)</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Màu Highlight mặc định</strong>
              <div className="muted" style={{ fontSize: 13 }}>Bảng màu 4 sắc thái chống chói mắt</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(['apricot', 'rose', 'olive', 'blue'] as HighlightColor[]).map((c) => (
                <button
                  key={c}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: c === 'apricot' ? '#f6a56e' : c === 'rose' ? '#ea9090' : c === 'olive' ? '#dace8d' : '#97a8bc',
                    border: defaultHlColor === c ? '3px solid var(--ink)' : '2px solid white',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setDefaultHlColor(c);
                    saveSettings({ defaultHlColor: c });
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Telegram Reminder Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 8px' }}>Telegram Contextual Reminder</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
            StudyFlow gửi tin nhắn nhắc nhở kèm theo đúng ngữ cảnh dòng suy nghĩ (Parking Note) và % cuộn băng khi bạn bỏ dở tài liệu.
          </p>

          <div className="setting">
            <div>
              <strong>Tần suất nhắc nhở khi không hoạt động</strong>
              <div className="muted" style={{ fontSize: 13 }}>Tính từ lần tương tác ý nghĩa gần nhất</div>
            </div>
            <select
              value={inactivityDays}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setInactivityDays(val);
                saveSettings({ inactivityDays: val });
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
            >
              <option value={1}>1 ngày</option>
              <option value={3}>3 ngày (Khuyên dùng)</option>
              <option value={7}>7 ngày</option>
              <option value={0}>Tắt nhắc nhở (Off)</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Hiển thị ngữ cảnh (Show Context)</strong>
              <div className="muted" style={{ fontSize: 13 }}>Kèm lời nhắn Parking Note lần trước trong tin Telegram</div>
            </div>
            <input
              type="checkbox"
              checked={showContext}
              onChange={(e) => {
                setShowContext(e.target.checked);
                saveSettings({ showContext: e.target.checked });
              }}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          <div className="setting">
            <div>
              <strong>Telegram Chat ID</strong>
              <div className="muted" style={{ fontSize: 13 }}>Nhận tin từ StudyFlow Bot qua chat ID riêng của bạn</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="VD: 123456789"
                value={telegramChatId}
                onChange={(e) => {
                  setTelegramChatId(e.target.value);
                  saveSettings({ telegramChatId: e.target.value });
                }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', width: 150 }}
              />
              <button className="secondary" style={{ fontSize: 12 }} onClick={handleTestReminder}>
                Lưu ID
              </button>
            </div>
          </div>
          {telegramStatusMsg && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8, color: 'var(--olive)' }}>
              {telegramStatusMsg}
            </div>
          )}
        </section>

        {/* Storage & Backup Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 16px' }}>Lưu trữ & Sao lưu dữ liệu</h3>

          <div className="setting">
            <div>
              <strong>Bộ nhớ cục bộ OPFS</strong>
              <div className="muted" style={{ fontSize: 13 }}>Lưu file PDF riêng tư ngay trong trình duyệt</div>
            </div>
            <span className={`verifyBadge ${opfsOk ? 'pass' : 'fail'}`}>
              {opfsOk ? 'Khả dụng (Available)' : 'Không hỗ trợ'}
            </span>
          </div>

          <div className="setting">
            <div>
              <strong>Quyền lưu trữ vĩnh viễn (Persistent Storage)</strong>
              <div className="muted" style={{ fontSize: 13 }}>Tránh trình duyệt tự động giải phóng dung lượng</div>
            </div>
            <div>
              {persistent ? (
                <span className="verifyBadge pass">Đã cấp phép (Granted)</span>
              ) : (
                <button className="secondary" style={{ fontSize: 12 }} onClick={handleRequestPersistent}>
                  Yêu cầu cấp phép
                </button>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
            <h4>Sao lưu / Phục hồi (Backup & Restore)</h4>
            <div
              style={{
                background: '#fff9ea',
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--ink)',
                marginBottom: 16
              }}
            >
              ⚠️ <strong>Lưu ý bảo mật:</strong> File backup chứa toàn bộ ghi chú, trích dẫn, highlight và danh sách tài liệu cá nhân của bạn. Không chia sẻ file backup công khai.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                id="includePdfCheckbox"
                checked={includePdfs}
                onChange={(e) => setIncludePdfs(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="includePdfCheckbox" style={{ fontSize: 13, cursor: 'pointer' }}>
                Đính kèm toàn bộ file PDF cục bộ trong file backup (dung lượng có thể lớn)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="primary"
                style={{ fontSize: 13, padding: '8px 16px' }}
                disabled={backupBusy}
                onClick={handleExportBackup}
              >
                {backupBusy ? 'Đang xuất…' : '📥 Xuất file Backup (.json)'}
              </button>

              <label
                className="secondary"
                style={{ fontSize: 13, padding: '8px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
              >
                <span>📤 Phục hồi từ file Backup</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleRestoreBackup}
                  disabled={backupBusy}
                  hidden
                />
              </label>
            </div>

            {backupMessage && (
              <div className="spikeMessage" style={{ marginTop: 14, fontSize: 13 }}>
                {backupMessage}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
