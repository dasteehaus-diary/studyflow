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
import { clearSyncQueueOnly } from '@/lib/sync/sync-service';
import { AuthButton } from '@/components/AuthButton';

type SettingsTab = 'all' | 'appearance' | 'sync' | 'reminder' | 'data';

export default function SettingsPage() {
  const { settings, updateSettings, isLoaded } = useSettings();
  const { user, isConfigured: isSupabaseConfigured, syncState, triggerReconciliation } = useAuth();

  // Active Navigation Tab (Section 14)
  const [activeTab, setActiveTab] = useState<SettingsTab>('all');

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

  // System Diagnostics state (Section 15)
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

  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const handleClearSyncQueue = async () => {
    try {
      const cleared = await clearSyncQueueOnly();
      setPendingSyncCount(0);
      alert(`✓ Đã dọn dẹp ${cleared} tác vụ trong hàng đợi đồng bộ. Dữ liệu học tập trên máy vẫn được bảo toàn an toàn.`);
    } catch (err) {
      console.error('Failed to clear sync queue:', err);
    }
  };

  const handleTriggerSync = async () => {
    try {
      setSyncStatusMsg('Đang đồng bộ dữ liệu...');
      await triggerReconciliation();
      if (localDB) {
        const count = await localDB.syncQueue.count();
        setPendingSyncCount(count);
      }
      setSyncStatusMsg('✓ Đồng bộ hoàn tất thành công!');
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err) {
      setSyncStatusMsg(`Lỗi đồng bộ: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Telegram: Save Configuration & Sync Cloud Data
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
      {/* Top Breadcrumb & Editorial Header (Section 5) */}
      <div className="eyebrow" style={{ marginBottom: 6 }}>Cài đặt</div>
      <h1 style={{ margin: '0 0 8px' }}>Nhẹ nhàng &amp; Tinh gọn.</h1>
      <p className="muted" style={{ margin: '0 0 24px', fontSize: 15, maxWidth: 640 }}>
        Không gian tĩnh tại để tùy chỉnh giao diện đọc sách, thiết lập lịch nhắc nhở và quản lý dữ liệu an toàn trên thiết bị của bạn.
      </p>

      {/* Horizontal Segmented Tabs (Section 14) */}
      <nav className="settingsTabs" aria-label="Bộ lọc cài đặt">
        <button
          className={`settingsTabBtn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Tổng quan
        </button>
        <button
          className={`settingsTabBtn ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Giao diện
        </button>
        <button
          className={`settingsTabBtn ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Đồng bộ &amp; Tài khoản
        </button>
        <button
          className={`settingsTabBtn ${activeTab === 'reminder' ? 'active' : ''}`}
          onClick={() => setActiveTab('reminder')}
        >
          Nhắc nhở
        </button>
        <button
          className={`settingsTabBtn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Dữ liệu &amp; Sao lưu
        </button>
      </nav>

      {/* 2-Column Responsive Layout (Section 13 & 15) */}
      <div className="settingsLayout">
        {/* Left Column: Settings Groups */}
        <div style={{ display: 'grid', gap: 24 }}>
          {/* GROUP A: Giao diện & Trải nghiệm đọc */}
          {(activeTab === 'all' || activeTab === 'appearance') && (
            <section
              className="card"
              style={{
                padding: '24px 26px',
                background: 'var(--sf-surface)',
                border: '1px solid var(--sf-line)',
                borderRadius: 'var(--sf-radius-lg)',
                boxShadow: 'var(--sf-shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--sf-mint-soft)',
                    color: 'var(--sf-mint-strong)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18
                  }}
                >
                  🎨
                </div>
                <h3 style={{ margin: 0 }}>Giao diện &amp; Trải nghiệm đọc</h3>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
                Tùy biến bảng màu êm dịu, chế độ hiển thị trang và sắc thái highlight chống chói mắt.
              </p>

              <div className="setting">
                <div>
                  <strong>Giao diện ứng dụng</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Tông màu chủ đạo của StudyFlow</div>
                </div>
                <select
                  value={settings.appTheme}
                  onChange={(e) => updateSettings({ appTheme: e.target.value as 'warm' | 'light' | 'dark' })}
                  style={{ minWidth: 200 }}
                >
                  <option value="warm">Warm Off-white (Mặc định)</option>
                  <option value="light">Crisp Light (Sáng tinh gọn)</option>
                  <option value="dark">Cozy Dark (Tối dịu mắt)</option>
                </select>
              </div>

              <div className="setting">
                <div>
                  <strong>Nền xung quanh Reader</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Không làm biến dạng màu sắc trang PDF gốc</div>
                </div>
                <select
                  value={settings.readerBg}
                  onChange={(e) => updateSettings({ readerBg: e.target.value as 'warm' | 'white' | 'dark' })}
                  style={{ minWidth: 200 }}
                >
                  <option value="warm">☕ Warm / Sepia</option>
                  <option value="white">⚪ Trắng tinh</option>
                  <option value="dark">🌙 Tối êm dịu</option>
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
                  style={{ minWidth: 200 }}
                >
                  <option value="fit-width">Vừa chiều ngang (Fit Width)</option>
                  <option value="fit-page">Toàn trang (Fit Page)</option>
                </select>
              </div>

              <div className="setting" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <div>
                  <strong>Màu Highlight mặc định</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Bảng màu 4 sắc thái dịu nhẹ chuẩn editorial</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {(['apricot', 'rose', 'olive', 'blue'] as HighlightColor[]).map((c) => {
                    const colorMap = {
                      apricot: { bg: '#F2DFA6', border: '#D0BA76', label: 'Cam mơ ấm' },
                      rose: { bg: '#E89A8D', border: '#C77567', label: 'Hồng san hô' },
                      olive: { bg: '#A9BDA5', border: '#849B7F', label: 'Cốm sage' },
                      blue: { bg: '#AFC4D4', border: '#8AA2B4', label: 'Xanh lam bụi' }
                    };
                    const item = colorMap[c];
                    return (
                      <button
                        key={c}
                        type="button"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: item.bg,
                          border: settings.defaultHlColor === c ? '3px solid var(--ink)' : '2px solid white',
                          boxShadow: settings.defaultHlColor === c ? '0 0 0 2px var(--sf-sage)' : '0 2px 6px rgba(0,0,0,0.1)',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease'
                        }}
                        onClick={() => updateSettings({ defaultHlColor: c })}
                        title={item.label}
                      />
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* GROUP B1: Đồng bộ đám mây & Tài khoản */}
          {(activeTab === 'all' || activeTab === 'sync') && (
            <section
              className="card"
              style={{
                padding: '24px 26px',
                background: 'var(--sf-surface)',
                border: '1px solid var(--sf-line)',
                borderRadius: 'var(--sf-radius-lg)',
                boxShadow: 'var(--sf-shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--sf-mint-soft)',
                    color: 'var(--sf-mint-strong)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18
                  }}
                >
                  ☁️
                </div>
                <h3 style={{ margin: 0 }}>Đồng bộ đám mây &amp; Tài khoản</h3>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
                StudyFlow hoạt động theo triết lý <strong>Local-First</strong>: File PDF nằm riêng tư 100% trong máy bạn (OPFS). Tài khoản Supabase chỉ đồng bộ dữ liệu cấu trúc nhẹ (ghi chú, trích dẫn, tiến độ) để truy cập xuyên suốt.
              </p>

              <div className="setting">
                <div>
                  <strong>Tài khoản đăng nhập</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {user ? `Đang đăng nhập với: ${user.email}` : 'Chưa đăng nhập (dữ liệu lưu trên máy này)'}
                  </div>
                </div>
                <div>
                  <AuthButton />
                </div>
              </div>

              <div className="setting" style={{ borderBottom: 0, paddingBottom: 4 }}>
                <div>
                  <strong>Trạng thái kết nối Cloud</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Đồng bộ tự động qua Supabase Database &amp; Auth</div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 12px',
                    borderRadius: 8,
                    background: isSupabaseConfigured ? 'rgba(94, 132, 106, 0.2)' : 'rgba(175, 196, 212, 0.3)',
                    color: isSupabaseConfigured ? 'var(--sf-success)' : 'var(--muted)',
                    border: `1px solid ${isSupabaseConfigured ? 'rgba(94, 132, 106, 0.4)' : 'var(--line)'}`
                  }}
                >
                  {isSupabaseConfigured ? '● Đã kết nối Cloud' : '○ Chỉ lưu trên máy'}
                </span>
              </div>

              {isSupabaseConfigured && (
                <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(169, 189, 165, 0.35)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {user && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 12, padding: '7px 14px' }}
                      disabled={syncState === 'reconciling'}
                      onClick={handleTriggerSync}
                    >
                      {syncState === 'reconciling' ? '⏳ Đang đồng bộ…' : '🔄 Đồng bộ ngay với Cloud'}
                    </button>
                  )}
                  {pendingSyncCount > 0 && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 12, padding: '7px 14px', color: 'var(--sf-coral)' }}
                      onClick={handleClearSyncQueue}
                    >
                      🧹 Dọn hàng đợi ({pendingSyncCount} tác vụ)
                    </button>
                  )}
                </div>
              )}

              {syncStatusMsg && (
                <div style={{ fontSize: 12, marginTop: 8, color: 'var(--sf-success)', fontWeight: 600 }}>
                  {syncStatusMsg}
                </div>
              )}
            </section>
          )}

          {/* GROUP B2: Nhắc quay lại qua Telegram */}
          {(activeTab === 'all' || activeTab === 'reminder') && (
            <section
              className="card"
              style={{
                padding: '24px 26px',
                background: 'var(--sf-surface)',
                border: '1px solid var(--sf-line)',
                borderRadius: 'var(--sf-radius-lg)',
                boxShadow: 'var(--sf-shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--sf-coral-soft)',
                    color: 'var(--sf-coral)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18
                  }}
                >
                  💌
                </div>
                <h3 style={{ margin: 0 }}>Nhắc nhở quay lại qua Telegram</h3>
              </div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
                Khi bạn bỏ dở tài liệu, StudyFlow gửi tin nhắn nhắc nhở kèm theo đúng dòng suy nghĩ (Parking Note) và mốc trang đọc chính xác để bạn dễ dàng mở lại học mà không bị ngắt quãng.
              </p>

              <div className="setting">
                <div>
                  <strong>Tần suất nhắc nhở khi không đọc</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Tính từ lần tương tác ý nghĩa gần nhất</div>
                </div>
                <select
                  value={localInactivityDays}
                  onChange={(e) => setLocalInactivityDays(parseInt(e.target.value, 10))}
                  style={{ minWidth: 200 }}
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
                  style={{ width: 20, height: 20, cursor: 'pointer', minHeight: 'auto' }}
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
                  style={{ width: 180 }}
                />
              </div>

              {/* Action Buttons: Primary Sage + Secondary */}
              <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="primary"
                  style={{ fontSize: 13, padding: '9px 18px' }}
                  onClick={handleSaveTelegramConfig}
                >
                  💾 Lưu cấu hình nhắc nhở
                </button>

                <button
                  type="button"
                  className="secondary"
                  style={{ fontSize: 13, padding: '9px 18px' }}
                  disabled={testSending}
                  onClick={handleTestReminder}
                >
                  {testSending ? 'Đang gửi thử…' : '📨 Gửi tin nhắn thử (Test)'}
                </button>
              </div>

              {saveStatusMsg && (
                <div style={{ fontSize: 13, marginTop: 12, color: 'var(--sf-success)', fontWeight: 600 }}>
                  {saveStatusMsg}
                </div>
              )}

              {testResult && (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 12,
                    padding: '9px 14px',
                    borderRadius: 10,
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
          )}

          {/* GROUP C: Lưu trữ & Sao lưu dữ liệu */}
          {(activeTab === 'all' || activeTab === 'data') && (
            <section
              className="card"
              style={{
                padding: '24px 26px',
                background: 'var(--sf-surface)',
                border: '1px solid var(--sf-line)',
                borderRadius: 'var(--sf-radius-lg)',
                boxShadow: 'var(--sf-shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--sf-mint-soft)',
                    color: 'var(--sf-mint-strong)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18
                  }}
                >
                  📦
                </div>
                <h3 style={{ margin: 0 }}>Lưu trữ &amp; Sao lưu dữ liệu</h3>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
                Đảm bảo an toàn cho toàn bộ sách, ghi chú và quà tặng B-Side. Bạn có thể xuất và nhập dữ liệu bất kỳ lúc nào.
              </p>

              <div className="setting">
                <div>
                  <strong>Bộ nhớ máy cục bộ (OPFS)</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Hệ thống tệp riêng tư, tải PDF siêu tốc trong trình duyệt</div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 8,
                    background: opfsOk ? 'rgba(94, 132, 106, 0.2)' : 'rgba(217, 104, 90, 0.2)',
                    color: opfsOk ? 'var(--sf-success)' : 'var(--sf-danger)',
                    border: `1px solid ${opfsOk ? 'rgba(94, 132, 106, 0.4)' : 'rgba(217, 104, 90, 0.4)'}`
                  }}
                >
                  {opfsOk ? '● Khả dụng (Available)' : '○ Không hỗ trợ'}
                </span>
              </div>

              <div className="setting">
                <div>
                  <strong>Quyền lưu trữ vĩnh viễn (Persistent Storage)</strong>
                  <div className="muted" style={{ fontSize: 13 }}>Ngăn trình duyệt tự ý giải phóng bộ nhớ khi ổ đĩa đầy</div>
                </div>
                <div>
                  {persistent ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(94, 132, 106, 0.2)',
                        color: 'var(--sf-success)',
                        border: '1px solid rgba(94, 132, 106, 0.4)'
                      }}
                    >
                      ● Đã cấp phép (Granted)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={handleRequestPersistent}
                    >
                      Yêu cầu cấp phép
                    </button>
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(169, 189, 165, 0.35)', paddingTop: 18, marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 15 }}>Sao lưu &amp; Phục hồi dữ liệu</h4>

                {backupEstimate && (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
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
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontSize: 12,
                      color: 'var(--banner-warn-text)',
                      marginBottom: 14,
                      lineHeight: 1.5
                    }}
                  >
                    🚫 <strong>Đã chặn xuất PDF bundle ({backupEstimate.pdfTotalMB} MB):</strong> Dung lượng PDF vượt quá giới hạn an toàn 50MB. Vui lòng chọn <strong>&quot;Xuất dữ liệu học&quot;</strong> (nhẹ, nhanh và an toàn) để lưu trữ toàn bộ ghi chú và tiến độ mà không sợ tràn RAM.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Option A: Lightweight notes & progress */}
                  <button
                    type="button"
                    className="primary"
                    style={{ fontSize: 13, padding: '9px 18px' }}
                    disabled={backupBusy}
                    onClick={() => handleExportBackup(false)}
                    title="Xuất ghi chú, trích dẫn, tiến độ và phần thưởng (không kèm file PDF)"
                  >
                    {backupBusy ? 'Đang xử lý…' : '📥 Xuất dữ liệu học (.json)'}
                  </button>

                  {/* Option B: Full Bundle with PDF */}
                  <button
                    type="button"
                    className="secondary"
                    style={{
                      fontSize: 13,
                      padding: '9px 18px',
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
                      padding: '9px 18px',
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
                      borderRadius: 10,
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
          )}

          {/* GROUP D: Vùng nguy hiểm / Danger Zone */}
          {(activeTab === 'all' || activeTab === 'data') && (
            <section
              className="card"
              style={{
                padding: '22px 26px',
                background: 'var(--sf-surface)',
                border: '1px solid rgba(230, 154, 141, 0.4)',
                borderRadius: 'var(--sf-radius-lg)',
                boxShadow: 'var(--sf-shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--sf-coral-soft)',
                    color: 'var(--sf-coral)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18
                  }}
                >
                  ⚠️
                </div>
                <h3 style={{ margin: 0, color: 'var(--sf-coral)' }}>Vùng nguy hiểm</h3>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
                Dọn dẹp sạch sẽ toàn bộ file PDF, tiến độ cuộn băng, ghi chú, highlight và kho B-Side thử nghiệm khỏi máy này.
              </p>

              <button
                type="button"
                className="secondary danger"
                style={{ fontSize: 13, padding: '9px 18px', cursor: backupBusy ? 'not-allowed' : 'pointer' }}
                disabled={backupBusy}
                onClick={() => handleClearAllData(false)}
              >
                🗑️ Xóa toàn bộ dữ liệu thử nghiệm
              </button>
            </section>
          )}
        </div>

        {/* Right Column: Sticky System Status Panel */}
        <aside className="settingsStickyStatus">
          <section
            className="card"
            style={{
              padding: '24px 22px',
              borderRadius: 'var(--sf-radius-lg)',
              background: 'var(--sf-surface)',
              border: '1px solid var(--sf-line)',
              boxShadow: 'var(--sf-shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--sf-mint-soft)',
                  color: 'var(--sf-mint-strong)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18
                }}
              >
                📊
              </div>
              <h3 style={{ margin: 0, fontSize: 17 }}>Trạng thái StudyFlow</h3>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 18px' }}>
              Kiểm tra nhanh tình trạng hoạt động và đồng bộ của ứng dụng.
            </p>

            {/* Human-Readable Status Rows (Section 15) */}
            <div style={{ display: 'grid', gap: 12 }}>
              {/* Row 1: Lưu trên máy */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Lưu trên máy</span>
                <span style={{ fontWeight: 600, color: opfsOk ? 'var(--sf-success)' : 'var(--sf-danger)' }}>
                  {opfsOk ? '● Sẵn sàng' : '○ Không hỗ trợ'}
                </span>
              </div>

              {/* Row 2: Đồng bộ đám mây */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Đồng bộ đám mây</span>
                <span style={{ fontWeight: 600, color: isSupabaseConfigured ? 'var(--sf-success)' : '#4F6F88' }}>
                  {isSupabaseConfigured ? '● Đã kết nối' : '○ Chỉ cục bộ'}
                </span>
              </div>

              {/* Row 3: Tài khoản */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Tài khoản</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: user ? 'var(--sf-success)' : 'var(--muted)',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={user?.email || 'Chưa đăng nhập'}
                >
                  {user ? `● ${user.email?.split('@')[0]}` : '○ Chưa đăng nhập'}
                </span>
              </div>

              {/* Row 4: Nhắc Telegram */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Nhắc Telegram</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: (telegramServerConfigured && settings.telegramChatId.trim()) ? 'var(--sf-success)' : '#4F6F88'
                  }}
                >
                  {(telegramServerConfigured && settings.telegramChatId.trim()) ? '● Đã kết nối' : '○ Cần cấu hình'}
                </span>
              </div>

              {/* Row 5: Dùng khi ngoại tuyến */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Dùng khi ngoại tuyến</span>
                <span style={{ fontWeight: 600, color: swActive ? 'var(--sf-success)' : 'var(--muted)' }}>
                  {swActive ? '● Sẵn sàng (PWA)' : '○ Chưa kích hoạt'}
                </span>
              </div>

              {/* Row 6: Lưu trữ bền vững */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Lưu trữ bền vững</span>
                <span style={{ fontWeight: 600, color: persistent ? 'var(--sf-success)' : '#4F6F88' }}>
                  {persistent ? '● Đã cấp phép' : '○ Chưa cấp phép'}
                </span>
              </div>
            </div>

            {/* Collapsible Technical Details (Section 15) */}
            <details style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  userSelect: 'none',
                  outline: 'none'
                }}
              >
                Chi tiết kỹ thuật ▾
              </summary>

              <div style={{ display: 'grid', gap: 10, marginTop: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Tầng OPFS</span>
                  <span style={{ color: 'var(--ink)' }}>{opfsOk ? 'Active' : 'N/A'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Service Worker</span>
                  <span style={{ color: 'var(--ink)' }}>{swActive ? 'Controlling' : 'None'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted)' }}>
                  <span>Hàng đợi Sync</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: pendingSyncCount > 0 ? 'var(--sf-coral)' : 'var(--sf-success)' }}>
                      {pendingSyncCount} tác vụ
                    </span>
                    {pendingSyncCount > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSyncQueue}
                        title="Dọn hàng đợi đồng bộ an toàn (không ảnh hưởng dữ liệu)"
                        style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(232, 154, 141, 0.2)',
                          color: 'var(--sf-coral)',
                          border: '1px solid rgba(232, 154, 141, 0.4)',
                          cursor: 'pointer'
                        }}
                      >
                        Dọn
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Lịch trình Cron</span>
                  <span style={{ color: 'var(--ink)' }}>Mỗi giờ (0 * * * *)</span>
                </div>

                {nextReminderDue && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                    <span>Mốc nhắc tới</span>
                    <span style={{ color: 'var(--ink)' }}>
                      {new Date(nextReminderDue).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                )}

                {lastReminderSent && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                    <span>Đã gửi gần nhất</span>
                    <span style={{ color: 'var(--ink)' }}>
                      {new Date(lastReminderSent).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                  <span>Phiên bản</span>
                  <span style={{ color: 'var(--ink)', fontFamily: 'monospace' }}>
                    v0.2.4 ({process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'latest'})
                  </span>
                </div>
              </div>
            </details>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
