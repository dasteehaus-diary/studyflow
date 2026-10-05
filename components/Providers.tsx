'use client';

import { useEffect, ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import { SettingsProvider } from '@/lib/settings/settings-context';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  return (
    <SettingsProvider>
      <AuthProvider>{children}</AuthProvider>
    </SettingsProvider>
  );
}
