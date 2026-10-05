'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';

export function AuthButton() {
  const { user, isConfigured, signInWithOtp, signOut, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (loading) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setErrorMsg('');
    const { error } = await signInWithOtp(email);
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div style={{ marginTop: 'auto', paddingTop: 16 }}>
      {user ? (
        <div style={{ fontSize: 12, display: 'grid', gap: 6 }}>
          <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ☁️ {user.email}
          </div>
          <button
            className="secondary"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => signOut()}
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <div>
          <button
            className="secondary"
            style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
            onClick={() => setIsOpen(true)}
          >
            {isConfigured ? 'Đăng nhập / Đồng bộ' : 'Chế độ Cục bộ'}
          </button>

          {isOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 9999,
                padding: 16
              }}
              onClick={() => setIsOpen(false)}
            >
              <div
                className="card"
                style={{ width: 'min(400px, 100%)', padding: 24 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="eyebrow">Đồng bộ đám mây</div>
                <h3 style={{ margin: '8px 0 12px' }}>
                  {isConfigured ? 'Đăng nhập với Magic Link' : 'Chế độ Cục bộ đang hoạt động'}
                </h3>
                {isConfigured ? (
                  status === 'sent' ? (
                    <div>
                      <p>✨ Đã gửi liên kết đăng nhập tới <strong>{email}</strong>! Vui lòng kiểm tra hộp thư của bạn.</p>
                      <button className="primary" onClick={() => setIsOpen(false)}>Xong</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
                      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                        Nhập email để đồng bộ tiến độ đọc, ghi chú và kho B-Side giữa các thiết bị. File PDF vẫn luôn được lưu riêng tư trên máy của bạn (Local-First).
                      </p>
                      <input
                        type="email"
                        placeholder="email@vidu.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--line)'
                        }}
                      />
                      {status === 'error' && (
                        <div style={{ color: 'var(--terracotta)', fontSize: 12 }}>{errorMsg}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className="secondary" onClick={() => setIsOpen(false)}>Hủy</button>
                        <button type="submit" className="primary" disabled={status === 'sending'}>
                          {status === 'sending' ? 'Đang gửi…' : 'Gửi liên kết đăng nhập'}
                        </button>
                      </div>
                    </form>
                  )
                ) : (
                  <div>
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                      StudyFlow đang chạy ở <strong>Chế độ Cục bộ (Local-First)</strong>. Mọi tài liệu, highlight, ghi chú và phần thưởng B-Side được lưu an toàn trong trình duyệt của bạn (OPFS & IndexedDB) và hoạt động 100% khi không có mạng.
                    </p>
                    <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      Để kích hoạt đồng bộ nhiều thiết bị, hãy thiết lập <code>NEXT_PUBLIC_SUPABASE_URL</code> và <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> trong môi trường.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <button className="primary" onClick={() => setIsOpen(false)}>Đã hiểu</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
