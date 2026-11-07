// PÁGINA 404: Next.js la muestra cuando se visita una dirección que no existe.
// `Link` es el enlace de Next.js: cambia de página sin recargar la web entera.
import Link from 'next/link';

export const metadata = { title: 'Página no encontrada · Buses Madrid ↔ Talavera' };

export default function NotFound() {
  return (
    <main className="login-page">
      <div className="login-card glass">
        <h1>Página no encontrada</h1>
        <p>Esta dirección no existe.</p>
        <Link href="/" className="primary press">Volver a la búsqueda</Link>
      </div>
    </main>
  );
}
