// LAYOUT RAÍZ: el "marco" común a todas las páginas. Next.js mete cada página (page.tsx) dentro de
// `children`. Aquí se define el <html> y el <body>, se cargan los estilos globales y los metadatos
// (título de la pestaña, colores del móvil...).
import type { Metadata, Viewport } from 'next';
import './globals.css';
import ScrollbarFade from './ScrollbarFade.tsx';

// Metadatos: Next.js los convierte en etiquetas <title> y <meta> dentro del <head> de la página.
export const metadata: Metadata = {
  title: 'Buses Madrid ↔ Talavera',
  description: 'Horarios y plazas libres de los buses de Samar entre Madrid Estación Sur y Talavera.',
  robots: { index: false, follow: false }, // que los buscadores no la indexen
  appleWebApp: { capable: true, title: 'Buses Talavera', statusBarStyle: 'default' }, // al añadirla a la pantalla de inicio del iPhone
};

// Cómo se ve en el móvil: ancho del dispositivo, modo claro/oscuro y color de la barra del navegador.
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

// `children` es la página que toque (la portada, el login...). `React.ReactNode` = "cualquier cosa que React sepa pintar".
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
