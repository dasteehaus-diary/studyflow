'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import { AppShell } from '@/components/AppShell';
import { localDB, type HighlightColor } from '@/lib/db/local';
import { supportsOPFS, isPersistentStorageGranted, requestPersistentStorage, clearAllPdfFromOPFS } from '@/lib/storage/opfs';
import {
  exportStudyFlowBackup,
  restoreStudyFlowBackup,
  getBackupEstimate,
  type BackupEstimate
} from '@/lib/data/backup';
import { useSettings } from '@/lib/settings/settings-context';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';

export default function SettingsPage() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const { user, isConfigured: isSupabaseConfigured } = useAuth();

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

  // System Diagnostics state (Requirement 12 & 22)
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [telegramServerConfigured, setTelegramServerConfigured] = useState<boolean | null>(null);
  const [swActive, setSwActive] = useState<boolean>(false);
  const [lastReminderSent, setLastReminderSent] = useState<string | null>(null);
  const [nextReminderDue, setNextReminderDue] = useState<string | null>(null);

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

    // Check sync queue
    if (localDB) {
      localDB.syncQueue.count().then(setPendingSyncCount).catch(() => setPendingSyncCount(0));
    }

    // Check server telegram token
    fetch('/api/telegram/test')
      .then(res => res.json())
      .then(data => setTelegramServerConfigured(Boolean(data?.configured)))
      .catch(() => setTelegramServerConfigured(false));

    // Check Service Worker status
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      setSwActive(Boolean(navigator.serviceWorker.controller));
    }

    // Support direct 1-click reset via link: /settings?reset=now
    if (typeof window !== 'undefined' && (window.location.search.includes('reset=now') || window.location.search.includes('reset=all'))) {
      handleClearAllData(true);
    }

    // Fetch reminder diagnostics from Supabase if authenticated
    if (user && isSupabaseConfigured && supabase) {
      (async () => {
        try {
          const { data: logData } = await supabase
            .from('reminder_logs')
            .select('sent_at')
            .eq('user_id', user.id)
            .eq('status', 'sent')
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (logData?.sent_at) setLastReminderSent(logData.sent_at);

          const { data: prefData } = await supabase
            .from('reminder_preferences')
            .select('next_reminder_at')
            .eq('user_id', user.id)
            .eq('enabled', true)
            .order('next_reminder_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (prefData?.next_reminder_at) setNextReminderDue(prefData.next_reminder_at);
        } catch {
          // Ignore network or permission error in diagnostics query
        }
      })();
    }
  }, [user, isSupabaseConfigured]);

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

  // Telegram: Save Configuration & Sync Cloud Data (Requirement 13)
  const handleSaveTelegramConfig = async () => {
    await updateSettings({
      telegramChatId: localChatId.trim(),
      inactivityDays: localInactivityDays,
      showContext: localShowContext
    });

    if (user && isSupabaseConfigured && supabase) {
      try {
        const docs = localDB ? await localDB.documents.toArray() : [];
        const now = new Date().toISOString();

        for (const d of docs) {
          const isEnabled = localInactivityDays > 0 && d.status === 'in_progress';
          const prog = localDB ? await localDB.progress.get(d.id) : null;
          const lastAct = prog?.lastMeaningfulActivityAt || d.updatedAt || now;
          const nextDate = new Date(new Date(lastAct).getTime() + (localInactivityDays || 3) * 86400000).toISOString();

          await supabase.from('reminder_preferences').upsert({
            document_id: d.id,
            user_id: user.id,
            inactivity_days: localInactivityDays || 3,
            enabled: isEnabled,
            show_context: localShowContext,
            telegram_chat_id: localChatId.trim() || null,
            next_reminder_at: nextDate,
            updated_at: now
          }, { onConflict: 'document_id' });
        }
        setSaveStatusMsg('✓ Đã lưu cấu hình và đồng bộ lên Cloud thành công.');
      } catch (cloudErr) {
        console.error('Failed to sync reminder_preferences to cloud:', cloudErr);
        setSaveStatusMsg('⚠️ Đã lưu cục bộ nhưng lỗi khi đồng bộ lên Cloud.');
      }
    } else {
      setSaveStatusMsg('⚠️ Đã lưu cục bộ. Nhắc Telegram cần đăng nhập và kết nối Cloud để tự động chạy lịch gửi.');
    }
    setTimeout(() => setSaveStatusMsg(''), 5000);
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
      setBackupMessage({
        type: 'error',
        text: `Đã chặn xuất PDF bundle: Tổng dung lượng (${backupEstimate.pdfTotalMB} MB) vượt ngưỡng an toàn 50MB. Vui lòng chọn "Xuất dữ liệu học" (ghi chú, trích dẫn, tiến độ) để tránh làm sập trình duyệt.`
      });
      return;
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

  // One-click Clear All Test Data & Reset (OPFS, IndexedDB, Cloud, Cache)
  const handleClearAllData = async (force: boolean = false) => {
    if (!force) {
      const ok = window.confirm(
        '⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA TOÀN BỘ DỮ LIỆU THỬ NGHIỆM?\n\n' +
        'Thao tác này sẽ dọn dẹp sạch sẽ:\n' +
        '• Tất cả file PDF lưu trong bộ nhớ máy (OPFS)\n' +
        '• Toàn bộ Kệ sách, lịch sử trang đọc, tiến độ cuộn băng\n' +
        '• Toàn bộ ghi chú, câu hỏi, Parking Notes, Highlight\n' +
        '• Kho phần thưởng B-Side Vault\n\n' +
        'Ứng dụng sẽ trở về trạng thái sạch ban đầu.'
      );
      if (!ok) return;
    }

    setBackupBusy(true);
    try {
      // 1. Clear OPFS storage
      await clearAllPdfFromOPFS();

      // 2. Clear IndexedDB
      if (localDB) {
        await localDB.documents.clear();
        await localDB.progress.clear();
        await localDB.highlights.clear();
        await localDB.notes.clear();
        await localDB.readingSessions.clear();
        await localDB.unlockedRewards.clear();
        await localDB.syncQueue.clear();
      }

      // 3. Clear cloud tables if user is logged in
      if (user && isSupabaseConfigured && supabase) {
        try {
          await supabase.from('notes').delete().eq('user_id', user.id);
          await supabase.from('highlights').delete().eq('user_id', user.id);
          await supabase.from('document_progress').delete().eq('user_id', user.id);
          await supabase.from('documents').delete().eq('user_id', user.id);
          await supabase.from('reading_sessions').delete().eq('user_id', user.id);
          await supabase.from('unlocked_rewards').delete().eq('user_id', user.id);
          await supabase.from('reminder_preferences').delete().eq('user_id', user.id);
        } catch (cloudErr) {
          console.warn('Could not clear cloud tables:', cloudErr);
        }
      }

      // 4. Clear localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('studyflow_theme');
      }

      // 5. Notify & Redirect to Library
      alert('✓ Đã dọn dẹp sạch toàn bộ dữ liệu học tập thử nghiệm!');
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to clear data:', err);
      alert('Lỗi khi xóa dữ liệu: ' + (err instanceof Error ? err.message : String(err)));
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
            StudyFlow gửi tin nhắn nhắc nhở kèm theo đúng dòng suy nghĩ (Parking Note) và vị trí trang đọc chính xác khi bạn bỏ dở tài liệu để giảm ma sát quay lại học.
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
                background: testResult.type === 'success' ? 'var(--banner-success-bg)' : 'var(--banner-error-bg)',
                color: testResult.type === 'success' ? 'var(--banner-success-text)' : 'var(--banner-error-text)',
                border: `1px solid ${testResult.type === 'success' ? 'var(--banner-success-border)' : 'var(--banner-error-border)'}`
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
                  background: 'var(--banner-warn-bg)',
                  border: '1px solid var(--banner-warn-border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  color: 'var(--banner-warn-text)',
                  marginBottom: 14,
                  lineHeight: 1.5
                }}
              >
                🚫 <strong>Đã chặn xuất PDF bundle ({backupEstimate.pdfTotalMB} MB):</strong> Dung lượng PDF vượt quá giới hạn an toàn 50MB cho phương thức Base64 JSON. Vui lòng chọn <strong>&quot;Xuất dữ liệu học&quot;</strong> (nhẹ, nhanh và an toàn) để lưu trữ toàn bộ ghi chú và tiến độ mà không sợ tràn RAM.
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
                style={{
                  fontSize: 13,
                  padding: '8px 16px',
                  opacity: backupEstimate?.isLarge ? 0.5 : 1,
                  cursor: backupEstimate?.isLarge ? 'not-allowed' : 'pointer'
                }}
                disabled={backupBusy || Boolean(backupEstimate?.isLarge)}
                onClick={() => handleExportBackup(true)}
                title={backupEstimate?.isLarge ? 'Đã chặn xuất vì dung lượng PDF vượt quá 50MB an toàn' : 'Xuất toàn bộ bao gồm cả các file PDF'}
              >
                {backupBusy
                  ? 'Đang xử lý…'
                  : backupEstimate?.isLarge
                  ? `🚫 Đã chặn PDF (${backupEstimate.pdfTotalMB} MB > 50MB)`
                  : `📦 Xuất toàn bộ kèm PDF (${backupEstimate ? `${backupEstimate.pdfTotalMB} MB` : 'Full'})`}
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

              {/* Clear All Test Data */}
              <button
                className="secondary"
                style={{
                  fontSize: 13,
                  padding: '8px 16px',
                  color: 'var(--terracotta)',
                  borderColor: 'var(--terracotta)',
                  cursor: backupBusy ? 'not-allowed' : 'pointer'
                }}
                disabled={backupBusy}
                onClick={() => handleClearAllData(false)}
                title="Dọn dẹp sạch sẽ toàn bộ file PDF, tiến độ đọc, ghi chú và kho B-Side thử nghiệm"
              >
                🗑️ Xóa toàn bộ dữ liệu thử nghiệm
              </button>
            </div>

            {backupMessage && (
              <div
                style={{
                  marginTop: 14,
                  fontSize: 13,
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: backupMessage.type === 'success' ? 'var(--banner-success-bg)' : 'var(--banner-error-bg)',
                  color: backupMessage.type === 'success' ? 'var(--banner-success-text)' : 'var(--banner-error-text)',
                  border: `1px solid ${backupMessage.type === 'success' ? 'var(--banner-success-border)' : 'var(--banner-error-border)'}`
                }}
              >
                {backupMessage.text}
              </div>
            )}
          </div>
        </section>

        {/* System Diagnostics / Functional Status Panel (Requirement 12) */}
        <section className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 8px' }}>Trạng thái hệ thống</h3>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
            Thông tin chẩn đoán hoạt động thực tế của các dịch vụ và tầng lưu trữ.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Bộ nhớ cục bộ (OPFS)</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: opfsOk ? 'var(--sf-sage)' : 'var(--sf-rose)' }}>
                {opfsOk ? '● Sẵn sàng (Ready)' : '○ Không hỗ trợ (Unsupported)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Lưu trữ vĩnh viễn</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: persistent ? 'var(--sf-sage)' : 'var(--sf-blue)' }}>
                {persistent ? '● Đã cấp phép (Granted)' : '○ Chưa cấp phép (Not granted)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Supabase Cloud</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: isSupabaseConfigured ? 'var(--sf-sage)' : 'var(--sf-blue)' }}>
                {isSupabaseConfigured ? '● Đã kết nối (Connected)' : '○ Chỉ cục bộ (Local-only)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Tài khoản (Auth)</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: user ? 'var(--sf-sage)' : 'var(--muted)' }}>
                {user ? `● Đã đăng nhập (${user.email})` : '○ Chưa đăng nhập (Signed out)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Hàng đợi đồng bộ</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: pendingSyncCount > 0 ? 'var(--sf-apricot)' : 'var(--sf-sage)' }}>
                {pendingSyncCount} tác vụ đang chờ
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Bot Telegram</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: (telegramServerConfigured && settings.telegramChatId.trim()) ? 'var(--sf-sage)' : 'var(--sf-terracotta)' }}>
                {(telegramServerConfigured && settings.telegramChatId.trim())
                  ? '● Đã kết nối (Connected)'
                  : '○ Cần cấu hình (Configuration required)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Đồng bộ nhắc nhở (Reminder Sync)</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: (settings.inactivityDays === 0) ? 'var(--muted)' : (user && isSupabaseConfigured) ? 'var(--sf-sage)' : 'var(--sf-blue)' }}>
                {settings.inactivityDays === 0
                  ? '○ Đang tắt (Off)'
                  : (user && isSupabaseConfigured)
                  ? '● Đã đồng bộ Cloud (Synced)'
                  : '○ Chỉ lưu cục bộ (Local only)'}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {nextReminderDue
                  ? `Mốc tới: ${new Date(nextReminderDue).toLocaleDateString('vi-VN')} ${new Date(nextReminderDue).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                  : lastReminderSent
                  ? `Đã gửi: ${new Date(lastReminderSent).toLocaleDateString('vi-VN')}`
                  : 'Chưa có mốc nhắc đến hạn'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Lịch trình gửi (Hourly Cron)</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: isSupabaseConfigured ? 'var(--sf-sage)' : 'var(--sf-blue)' }}>
                {isSupabaseConfigured ? '● Sẵn sàng (0 * * * *)' : '○ Cần Cloud Supabase'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>PWA / Service Worker</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: swActive ? 'var(--sf-sage)' : 'var(--muted)' }}>
                {swActive ? '● Đang hoạt động (Active)' : '○ Chưa kích hoạt (Inactive)'}
              </div>
            </div>

            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card-subtle)', border: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Phiên bản ứng dụng</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4, color: 'var(--ink)' }}>
                StudyFlow v0.2.3 ({process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'c82e0b7'})
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
