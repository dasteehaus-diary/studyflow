import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StudyFlow',
  description: 'A personal anti-abandonment reader.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg'
  }
};

import { Providers } from '@/components/Providers';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=p||localStorage.getItem('studyflow_theme')||'warm';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
