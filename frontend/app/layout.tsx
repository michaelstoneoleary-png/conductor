import type { Metadata } from 'next';
import './globals.css';
import Nav from '../components/Nav';

export const metadata: Metadata = {
  title: 'Conductor',
  description: 'Autonomous AI company operating system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen" style={{ background: '#0a0a0a' }}>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
