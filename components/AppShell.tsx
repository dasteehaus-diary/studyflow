'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';

const nav = [
  ['◫', 'Kệ sách', '/'],
  ['✎', 'Ghi chép', '/notebook'],
  ['▤', 'Kho B-Side', '/vault'],
  ['⚙', 'Cài đặt', '/settings']
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand">
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span>📼</span>
            <span>StudyFlow</span>
          </Link>
        </div>
        <nav className="nav">
          {nav.map(([icon, label, href]) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={isActive ? 'navActive' : ''}
              >
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <AuthButton />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
