// Genera el icono que usa el iPhone al añadir la web a la pantalla de inicio. Next.js convierte este
// dibujo SVG en una imagen PNG de 180×180 (ImageResponse).
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Mismo dibujo que icon.svg, con el fondo a sangre: iOS redondea las esquinas y las transparentes saldrían negras
export default function AppleIcon() {
  return new ImageResponse(
    (
      // biome-ignore lint/a11y/noSvgWithoutTitle: se convierte en PNG, no llega al DOM
      <svg width="180" height="180" viewBox="0 0 32 32">
        <rect width="32" height="32" fill="#1d4ed8" />
        <rect x="7" y="6" width="18" height="17" rx="3" fill="#fff" />
        <rect x="9" y="9" width="14" height="6" rx="1" fill="#1d4ed8" />
        <circle cx="11" cy="19" r="1.6" fill="#1d4ed8" />
        <circle cx="21" cy="19" r="1.6" fill="#1d4ed8" />
        <rect x="9" y="23" width="3" height="3" rx="1" fill="#fff" />
        <rect x="20" y="23" width="3" height="3" rx="1" fill="#fff" />
      </svg>
    ),
    size,
  );
}
