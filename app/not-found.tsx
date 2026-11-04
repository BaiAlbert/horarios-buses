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
