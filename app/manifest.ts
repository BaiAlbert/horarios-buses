import type { MetadataRoute } from 'next';

// Con display «standalone», «Añadir a pantalla de inicio» abre la web como una app (sin la barra del navegador)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Buses Madrid ↔ Talavera',
    short_name: 'Buses Talavera',
    description: 'Horarios y plazas libres de los buses de Samar entre Madrid Estación Sur y Talavera.',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    background_color: '#e9eefb',
    theme_color: '#e9eefb',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
