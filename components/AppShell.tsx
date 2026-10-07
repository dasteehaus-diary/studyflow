'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthButton } from './AuthButton';
import {
  IconCassetteLogo,
  IconBookshelf,
  IconNotebook,
  IconBSide,
  IconSettings,
  DecoCatOnBooks
} from '@/components/icons/BrandIcons';

const navItems = [
  { label: 'Kệ sách', href: '/', Icon: IconBookshelf, activeClass: 'navBookshelf' },
  { label: 'Ghi chép', href: '/notebook', Icon: IconNotebook, activeClass: 'navNotebook' },
  { label: 'Kho B-Side', href: '/vault', Icon: IconBSide, activeClass: 'navVault' },
  { label: 'Cài đặt', href: '/settings', Icon: IconSettings, activeClass: 'navSettings' }
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
                  background: 'var(--terracotta)',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 2px 8px rgba(189, 87, 56, 0.25)'
                }}
              >
                <IconCassetteLogo size={20} />
              </div>
              <span style={{ letterSpacing: '-0.02em', fontWeight: 700 }}>StudyFlow</span>
            </Link>
          </div>

          <nav className="nav">
            {navItems.map(({ label, href, Icon, activeClass }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={isActive ? `navActive ${activeClass}` : ''}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer with Deco & Auth */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="sidebar-deco" style={{ display: 'flex', justifyContent: 'center', opacity: 0.85 }}>
            <DecoCatOnBooks />
          </div>
          <div className="sidebar-auth">
            <AuthButton />
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
