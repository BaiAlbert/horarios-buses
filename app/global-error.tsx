// ERROR GRAVE: como error.tsx, pero para cuando falla incluso el layout raíz (layout.tsx).
// Por eso tiene que incluir su propio <html> y <body>.
'use client';

import './globals.css'; // global-error sustituye al layout raíz, así que no hereda sus estilos

export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="es">
      <body>
        <main className="login-page">
          <div className="login-card glass" role="alert">
            <h1>Algo ha fallado</h1>
            <p>No se pudo cargar la aplicación.</p>
            <button type="button" className="primary press" onClick={() => retry()}>Reintentar</button>
          </div>
        </main>
      </body>
    </html>
  );
}
