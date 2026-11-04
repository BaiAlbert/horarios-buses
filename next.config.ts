import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Solo en desarrollo: sin esto, abrir `next dev` desde el móvil por la IP local (192.168.x.x) deja la página sin hidratar
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default nextConfig;
