import type { Metadata, Viewport } from 'next';
import './globals.css';
import ScrollbarFade from './ScrollbarFade.tsx';

export const metadata: Metadata = {
  title: 'Buses Madrid ↔ Talavera',
  description: 'Horarios y plazas libres de los buses de Samar entre Madrid Estación Sur y Talavera.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Buses Talavera', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // el fondo llega bajo la barra del móvil; los márgenes usan env(safe-area-inset-*)
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eefb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1121' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <ScrollbarFade />
      </body>
    </html>
  );
}
