'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';
import {
  IconCassetteLogo,
  IconBookshelf,
  IconNotebook,
  IconBSide,
  IconSettings
} from '@/components/icons/BrandIcons';

const navItems = [
  { label: 'Kệ sách', href: '/', Icon: IconBookshelf },
  { label: 'Ghi chép', href: '/notebook', Icon: IconNotebook },
  { label: 'Kho B-Side', href: '/vault', Icon: IconBSide },
  { label: 'Cài đặt', href: '/settings', Icon: IconSettings }
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--ink)'
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'var(--sf-mint-strong)',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 2px 8px rgba(120, 153, 142, 0.25)'
                }}
              >
                <IconCassetteLogo size={20} />
              </div>
              <span style={{ letterSpacing: '-0.02em', fontWeight: 700, fontSize: 18 }}>StudyFlow</span>
            </Link>
          </div>

          <nav className="nav">
            {navItems.map(({ label, href, Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={isActive ? 'navActive' : ''}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer with Clean Minimal Auth */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="sidebar-auth">
            <AuthButton />
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
