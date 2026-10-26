import type { Metadata, Viewport } from 'next';
import '@fontsource/carlito/400.css';
import '@fontsource/carlito/400-italic.css';
import '@fontsource/carlito/700.css';
import '@fontsource/carlito/700-italic.css';
import '@fontsource/caladea/400.css';
import '@fontsource/caladea/400-italic.css';
import '@fontsource/caladea/700.css';
import '@fontsource/caladea/700-italic.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/400-italic.css';
import '@fontsource/arimo/700.css';
import '@fontsource/arimo/700-italic.css';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource/tinos/700.css';
import '@fontsource/tinos/700-italic.css';
import '@fontsource/cousine/400.css';
import '@fontsource/cousine/400-italic.css';
import '@fontsource/cousine/700.css';
import '@fontsource/cousine/700-italic.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyWord',
  description: 'A local-first word processor',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
