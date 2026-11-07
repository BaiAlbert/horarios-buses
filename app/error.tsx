// PÁGINA DE ERROR: Next.js la muestra en lugar de una página cuando esta falla al pintarse
// (un error inesperado en el código). Ofrece reintentar.
'use client';

// Next 16: retry() vuelve a pedir y pintar el contenido; reset() solo limpia el error
export default function ErrorPage({ retry }: { error: Error; retry: () => void }) {
  return (
    <main className="login-page">
      <div className="login-card glass" role="alert">
        <h1>Algo ha fallado</h1>
        <p>No se pudo mostrar esta página.</p>
        <button type="button" className="primary press" onClick={() => retry()}>Reintentar</button>
      </div>
    </main>
  );
}
