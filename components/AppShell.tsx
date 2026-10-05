'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';

const nav = [
  ['▣', 'Bookshelf', '/'],
  ['✎', 'Notebook', '/notebook'],
  ['▤', 'B-Side Vault', '/vault'],
  ['⚙', 'Settings', '/settings']
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand">
          <Link href="/">StudyFlow</Link>
        </div>
        <nav className="nav">
          {nav.map(([icon, label, href]) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={isActive ? 'navActive' : ''}
                style={isActive ? { background: '#eee8dc', color: 'var(--ink)', fontWeight: 600 } : undefined}
              >
                {icon} &nbsp; {label}
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
