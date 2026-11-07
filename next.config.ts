// Configuración de Next.js (el framework con el que está hecha la web).
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false, // no anunciar en las respuestas que la web usa Next.js
  // Solo en desarrollo: sin esto, abrir `next dev` desde el móvil por la IP local (192.168.x.x) deja la página sin hidratar
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  // Cabeceras HTTP que se añaden a TODAS las respuestas, por privacidad y seguridad:
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' }, // que Google y compañía no la indexen
        { key: 'X-Content-Type-Options', value: 'nosniff' }, // el navegador no "adivina" tipos de archivo
        { key: 'Referrer-Policy', value: 'no-referrer' }, // al pulsar un enlace externo no se dice de dónde vienes
        // CSP: limita qué puede hacer la página (p. ej. que otra web no la meta dentro de un <iframe>)
        // sin script-src: exigiría nonces y haría dinámicas las páginas estáticas
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
      ],
    }];
  },
};

export default nextConfig;
