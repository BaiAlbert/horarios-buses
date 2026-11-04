import SearchApp from './SearchApp.tsx';

// Cabecera en el servidor: solo el buscador y los resultados viajan como JavaScript al navegador
export default function Page() {
  return (
    <>
      <a href="#resultados" className="skip-link">Saltar a los resultados</a>
      <main className="shell">
        <h1>Buses Madrid ↔ Talavera</h1>
        <SearchApp />
      </main>
    </>
  );
}
