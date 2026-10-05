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
            Sign out
          </button>
        </div>
      ) : (
        <div>
          <button
            className="secondary"
            style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
            onClick={() => setIsOpen(true)}
          >
            {isConfigured ? 'Sign in / Sync' : 'Local Mode'}
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
                <div className="eyebrow">StudyFlow Sync</div>
                <h3 style={{ margin: '8px 0 12px' }}>
                  {isConfigured ? 'Sign in with Magic Link' : 'Local Mode Active'}
                </h3>
                {isConfigured ? (
                  status === 'sent' ? (
                    <div>
                      <p>✨ Magic link sent to <strong>{email}</strong>! Check your inbox to sign in.</p>
                      <button className="primary" onClick={() => setIsOpen(false)}>Done</button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
                      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                        Enter your email to sync your reading progress, notes, and B-Side rewards across devices. PDF files remain stored locally on each device.
                      </p>
                      <input
                        type="email"
                        placeholder="your@email.com"
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
                        <button type="button" className="secondary" onClick={() => setIsOpen(false)}>Cancel</button>
                        <button type="submit" className="primary" disabled={status === 'sending'}>
                          {status === 'sending' ? 'Sending…' : 'Send Magic Link'}
                        </button>
                      </div>
                    </form>
                  )
                ) : (
                  <div>
                    <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                      StudyFlow is currently running in <strong>Local-First Mode</strong>. All your documents, highlights, notes, questions, and B-Side gifts are safely stored in your browser (OPFS & IndexedDB) and work 100% offline.
                    </p>
                    <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      To enable multi-device sync, configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in your environment.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <button className="primary" onClick={() => setIsOpen(false)}>Got it</button>
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
