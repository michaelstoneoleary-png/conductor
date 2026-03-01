'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Executive' },
  { href: '/activity', label: 'Activity' },
  { href: '/directives', label: 'Directives' },
  { href: '/agents', label: 'Agents' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: '#111',
        borderBottom: '1px solid #2a2a2a',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
        height: '48px',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: '#f4f4f5' }}>
        CONDUCTOR
      </span>
      <div style={{ display: 'flex', gap: '4px' }}>
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#f4f4f5' : '#888',
                background: active ? '#1a1a1a' : 'transparent',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
