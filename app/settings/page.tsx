'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { type HighlightColor } from '@/lib/db/local';
import { supportsOPFS, isPersistentStorageGranted, requestPersistentStorage } from '@/lib/storage/opfs';
import {
  exportStudyFlowBackup,
  restoreStudyFlowBackup,
  getBackupEstimate,
  type BackupEstimate
} from '@/lib/data/backup';
import { useSettings } from '@/lib/settings/settings-context';

export default function SettingsPage() {
  const { settings, updateSettings, isLoaded } = useSettings();

  // Telegram local state for inputs & actions
  const [localChatId, setLocalChatId] = useState('');
  const [localInactivityDays, setLocalInactivityDays] = useState(3);
  const [localShowContext, setLocalShowContext] = useState(true);

  const [saveStatusMsg, setSaveStatusMsg] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Storage & Backup state
  const [opfsOk, setOpfsOk] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [backupEstimate, setBackupEstimate] = useState<BackupEstimate | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync initial settings to local state once loaded
  useEffect(() => {
    if (isLoaded) {
      setLocalChatId(settings.telegramChatId || '');
      setLocalInactivityDays(settings.inactivityDays ?? 3);
      setLocalShowContext(settings.showContext ?? true);
    }
  }, [isLoaded, settings]);

  useEffect(() => {
    setOpfsOk(supportsOPFS());
    isPersistentStorageGranted().then(setPersistent).catch(() => setPersistent(false));
    refreshBackupEstimate();
  }, []);

  const refreshBackupEstimate = async () => {
    try {
      const est = await getBackupEstimate();
      setBackupEstimate(est);
    } catch (err) {
      console.warn('Could not calculate backup estimate:', err);
    }
  };

  const handleRequestPersistent = async () => {
    const granted = await requestPersistentStorage();
    setPersistent(granted);
  };

  // Telegram: Save Configuration Only
  const handleSaveTelegramConfig = async () => {
    await updateSettings({
      telegramChatId: localChatId.trim(),
      inactivityDays: localInactivityDays,
      showContext: localShowContext
    });
    setSaveStatusMsg('✓ Đã lưu cấu hình nhắc nhở thành công.');
    setTimeout(() => setSaveStatusMsg(''), 4000);
  };

  // Telegram: Test Reminder with Honest Status
  const handleTestReminder = async () => {
    const targetChatId = localChatId.trim() || settings.telegramChatId.trim();
    if (!targetChatId) {
      setTestResult({
        type: 'error',
        message: 'Vui lòng nhập Chat ID Telegram trước khi gửi tin nhắn thử.'
      });
      return;
    }

    setTestSending(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: targetChatId })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setTestResult({
          type: 'error',
          message: data.error || 'Telegram chưa được kết nối hoặc cấu hình bot trên server bị thiếu.'
        });
      } else {
        setTestResult({
          type: 'success',
          message: data.message || 'Gửi tin nhắn thử thành công! Vui lòng kiểm tra ứng dụng Telegram.'
        });
      }
    } catch (err) {
      setTestResult({
        type: 'error',
        message: `Lỗi kết nối: ${err instanceof Error ? err.message : 'Không thể gửi yêu cầu tới server.'}`
      });
    } finally {
      setTestSending(false);
    }
  };

  // Backup Export
  const handleExportBackup = async (includePdfBytes: boolean) => {
    if (includePdfBytes && backupEstimate?.isLarge) {
      const confirmed = window.confirm(
        `Tổng dung lượng file PDF hiện tại là ${backupEstimate.pdfTotalMB} MB (lớn hơn 50MB).\n\nViệc đóng gói toàn bộ PDF vào JSON có thể gây lag hoặc tràn bộ nhớ trình duyệt.\n\nBạn có chắc chắn muốn tiếp tục xuất toàn bộ PDF không?`
      );
      if (!confirmed) return;
    }

    setBackupBusy(true);
    setBackupMessage(null);

    try {
      const data = await exportStudyFlowBackup(includePdfBytes);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const typeLabel = includePdfBytes ? 'full-bundle' : 'notes-progress';
      a.download = `studyflow-${typeLabel}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupMessage({
        type: 'success',
        text: `✓ Đã xuất backup thành công (${data.documents.length} tài liệu, ${data.notes.length} ghi chú${includePdfBytes ? ', kèm file PDF' : ''}).`
      });
      refreshBackupEstimate();
    } catch (err) {
      setBackupMessage({
        type: 'error',
        text: `Lỗi xuất backup: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setBackupBusy(false);
    }
  };

  // Backup Restore
  const handleRestoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBackupBusy(true);
    setBackupMessage(null);

    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Tệp không đúng định dạng JSON hợp lệ.');
      }

      const res = await restoreStudyFlowBackup(data);
      setBackupMessage({
        type: 'success',
        text: `✓ Phục hồi thành công: ${res.documentsCount} tài liệu, ${res.notesCount} ghi chú, ${res.highlightsCount} highlight, ${res.pdfsRestored} file PDF.`
      });
      refreshBackupEstimate();
    } catch (err) {
      setBackupMessage({
        type: 'error',
        text: `Lỗi phục hồi: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="eyebrow">Cài đặt</div>
      <h1>Nhẹ nhàng &amp; Tinh gọn.</h1>

      <div style={{ display: 'grid', gap: 24, maxWidth: 760 }}>
        {/* Appearance Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 16px' }}>Giao diện &amp; Trải nghiệm đọc</h3>

          <div className="setting">
            <div>
              <strong>Giao diện ứng dụng</strong>
              <div className="muted" style={{ fontSize: 13 }}>Tông màu chủ đạo của StudyFlow</div>
            </div>
            <select
              value={settings.appTheme}
              onChange={(e) => updateSettings({ appTheme: e.target.value as 'warm' | 'light' | 'dark' })}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)' }}
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
              value={settings.readerBg}
              onChange={(e) => updateSettings({ readerBg: e.target.value as 'warm' | 'white' | 'dark' })}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)' }}
            >
              <option value="warm">☕ Warm / Sepia</option>
              <option value="white">⚪ Trắng</option>
              <option value="dark">🌙 Tối dịu mắt</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Chế độ xem mặc định</strong>
              <div className="muted" style={{ fontSize: 13 }}>Độ rộng trang khi mở tài liệu mới</div>
            </div>
            <select
              value={settings.fitMode}
              onChange={(e) => updateSettings({ fitMode: e.target.value as 'fit-width' | 'fit-page' | 'free' })}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)' }}
            >
              <option value="fit-width">Vừa chiều ngang (Fit Width)</option>
              <option value="fit-page">Toàn trang (Fit Page)</option>
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
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c === 'apricot' ? '#f6a56e' : c === 'rose' ? '#ea9090' : c === 'olive' ? '#dace8d' : '#97a8bc',
                    border: settings.defaultHlColor === c ? '3px solid var(--ink)' : '2px solid white',
                    boxShadow: settings.defaultHlColor === c ? '0 0 0 1px var(--olive)' : 'none',
                    cursor: 'pointer'
                  }}
                  onClick={() => updateSettings({ defaultHlColor: c })}
                  title={c}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Telegram Reminder Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 8px' }}>Nhắc nhở qua Telegram</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
            StudyFlow gửi tin nhắn nhắc nhở kèm theo đúng dòng suy nghĩ (Parking Note) và % cuộn băng khi bạn bỏ dở tài liệu để giảm ma sát quay lại học.
          </p>

          <div className="setting">
            <div>
              <strong>Tần suất nhắc nhở khi không hoạt động</strong>
              <div className="muted" style={{ fontSize: 13 }}>Tính từ lần tương tác ý nghĩa gần nhất</div>
            </div>
            <select
              value={localInactivityDays}
              onChange={(e) => setLocalInactivityDays(parseInt(e.target.value, 10))}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-bg)', color: 'var(--ink)' }}
            >
              <option value={1}>1 ngày</option>
              <option value={3}>3 ngày (Khuyên dùng)</option>
              <option value={7}>7 ngày</option>
              <option value={0}>Tắt nhắc nhở (Tạm ngừng)</option>
            </select>
          </div>

          <div className="setting">
            <div>
              <strong>Hiển thị ngữ cảnh dòng suy nghĩ</strong>
              <div className="muted" style={{ fontSize: 13 }}>Đính kèm ghi chú Parking Note lần trước trong tin nhắn Telegram</div>
            </div>
            <input
              type="checkbox"
              checked={localShowContext}
              onChange={(e) => setLocalShowContext(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          <div className="setting">
            <div>
              <strong>Telegram Chat ID</strong>
              <div className="muted" style={{ fontSize: 13 }}>Nhận tin từ StudyFlow Bot qua chat ID riêng của bạn</div>
            </div>
            <input
              type="text"
              placeholder="VD: 123456789"
              value={localChatId}
              onChange={(e) => setLocalChatId(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', width: 160 }}
            />
          </div>

          {/* Explicit Separate Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="primary"
              style={{ fontSize: 13, padding: '7px 16px' }}
              onClick={handleSaveTelegramConfig}
            >
              💾 Lưu cấu hình nhắc nhở
            </button>

            <button
              className="secondary"
              style={{ fontSize: 13, padding: '7px 16px' }}
              disabled={testSending}
              onClick={handleTestReminder}
            >
              {testSending ? 'Đang gửi thử…' : '📨 Gửi tin nhắn thử (Test)'}
            </button>
          </div>

          {saveStatusMsg && (
            <div style={{ fontSize: 12, marginTop: 10, color: 'var(--olive)', fontWeight: 500 }}>
              {saveStatusMsg}
            </div>
          )}

          {testResult && (
            <div
              style={{
                fontSize: 12,
                marginTop: 10,
                padding: '8px 12px',
                borderRadius: 6,
                background: testResult.type === 'success' ? '#eaf4eb' : '#fdf0ee',
                color: testResult.type === 'success' ? '#2e6930' : '#a83232',
                border: `1px solid ${testResult.type === 'success' ? '#b8e0bc' : '#f5c2bc'}`
              }}
            >
              {testResult.type === 'success' ? '✓ ' : '❌ '}
              {testResult.message}
            </div>
          )}
        </section>

        {/* Storage & Backup Group */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 16px' }}>Lưu trữ &amp; Sao lưu dữ liệu</h3>

          <div className="setting">
            <div>
              <strong>Bộ nhớ cục bộ OPFS</strong>
              <div className="muted" style={{ fontSize: 13 }}>Lưu file PDF riêng tư ngay trong trình duyệt (Local-First)</div>
            </div>
            <span className={`verifyBadge ${opfsOk ? 'pass' : 'fail'}`}>
              {opfsOk ? 'Khả dụng (Available)' : 'Không hỗ trợ'}
            </span>
          </div>

          <div className="setting">
            <div>
              <strong>Quyền lưu trữ vĩnh viễn (Persistent Storage)</strong>
              <div className="muted" style={{ fontSize: 13 }}>Ngăn trình duyệt tự động xóa bộ nhớ đệm khi thiếu dung lượng</div>
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
            <h4 style={{ margin: '0 0 8px' }}>Sao lưu &amp; Phục hồi dữ liệu</h4>

            {backupEstimate && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
                Hiện có: <strong>{backupEstimate.documentsCount}</strong> tài liệu,{' '}
                <strong>{backupEstimate.notesCount}</strong> ghi chú,{' '}
                <strong>{backupEstimate.highlightsCount}</strong> highlight · Dung lượng PDF: <strong>{backupEstimate.pdfTotalMB} MB</strong>.
              </div>
            )}

            {backupEstimate?.isLarge && (
              <div
                style={{
                  background: '#fff9ea',
                  border: '1px solid #fae19c',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  color: '#7c5800',
                  marginBottom: 14,
                  lineHeight: 1.5
                }}
              >
                ⚠️ <strong>Lưu ý dung lượng lớn ({backupEstimate.pdfTotalMB} MB):</strong> Tổng dung lượng PDF trên máy vượt quá 50MB. Để tránh lag hoặc tràn bộ nhớ trình duyệt, khuyên bạn nên chọn <strong>&quot;Xuất dữ liệu học&quot;</strong> (nhẹ, nhanh và an toàn).
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Option A: Lightweight notes & progress */}
              <button
                className="primary"
                style={{ fontSize: 13, padding: '8px 16px' }}
                disabled={backupBusy}
                onClick={() => handleExportBackup(false)}
                title="Xuất ghi chú, trích dẫn, tiến độ và phần thưởng (không kèm file PDF)"
              >
                {backupBusy ? 'Đang xử lý…' : '📥 Xuất dữ liệu học (.json)'}
              </button>

              {/* Option B: Full Bundle with PDF */}
              <button
                className="secondary"
                style={{ fontSize: 13, padding: '8px 16px' }}
                disabled={backupBusy}
                onClick={() => handleExportBackup(true)}
                title="Xuất toàn bộ bao gồm cả các file PDF lưu trữ trong OPFS"
              >
                {backupBusy ? 'Đang đóng gói…' : `📦 Xuất toàn bộ kèm PDF (${backupEstimate ? `${backupEstimate.pdfTotalMB} MB` : 'Full'})`}
              </button>

              {/* Restore Button */}
              <label
                className="secondary"
                style={{
                  fontSize: 13,
                  padding: '8px 16px',
                  cursor: backupBusy ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                <span>📤 Phục hồi từ file (.json)</span>
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
              <div
                style={{
                  marginTop: 14,
                  fontSize: 13,
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: backupMessage.type === 'success' ? '#eaf4eb' : '#fdf0ee',
                  color: backupMessage.type === 'success' ? '#2e6930' : '#a83232',
                  border: `1px solid ${backupMessage.type === 'success' ? '#b8e0bc' : '#f5c2bc'}`
                }}
              >
                {backupMessage.text}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
