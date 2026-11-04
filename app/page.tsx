import SearchApp from './SearchApp.tsx';

// Cabecera en el servidor: solo el buscador y los resultados viajan como JavaScript al navegador
export default function Page() {
  return (
    <>
      <a href="#resultados" className="skip-link">Saltar a los resultados</a>
      <main className="shell">
        <h1>Buses Madrid ↔ Talavera</h1>
        <SearchApp />
        <footer className="site-footer">
          <p>
            Web personal y no oficial, sin relación con Autocares Samar ni con autobusing. Los horarios y las plazas se
            leen de samar.es y regular.autobusing.es y pueden no estar al día: compruébalos en{' '}
            <a href="https://www.samar.es">samar.es</a> antes de viajar.
          </p>
          <p>Solo se usa una cookie técnica para mantener la sesión iniciada.</p>
        </footer>
      </main>
    </>
  );
}
