// Genera /robots.txt: le dice a los buscadores (Google...) que no recorran ninguna página de la web.
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
