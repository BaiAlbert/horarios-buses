// PORTADA DE LA WEB ("/"). EMPIEZA A LEER AQUÍ.
//
// QUÉ HACE LA WEB
// Muestra los horarios de los buses de Samar entre Madrid Estación Sur y Talavera de la Reina para un día,
// y, para cada bus, cuántas plazas libres quedan. Es privada: pide una contraseña.
//
// CÓMO ESTÁ ORGANIZADO EL CÓDIGO (Next.js: la carpeta `app/` define las páginas y la API)
//   proxy.ts               → se ejecuta antes de cada petición; sin sesión válida, manda a /login
//   app/login/             → página de login (page.tsx) y comprobación de la contraseña (actions.ts)
//   app/page.tsx           → esta portada; solo monta el título y SearchApp
//   app/SearchApp.tsx      → buscador (trayecto + día), filtros y lista de resultados
//   app/TripCard.tsx       → tarjeta de cada bus y su botón «Ver plazas libres»
//   app/DatePicker.tsx     → el calendario
//   app/api/trips/         → API de horarios: el navegador la llama al buscar
//   app/api/seats/         → API de plazas: el navegador la llama al pulsar «Ver plazas libres»
//   lib/samar.ts           → descarga y lee la página de horarios de samar.es
//   lib/autobusing.ts      → recorre la web de venta de autobusing para contar asientos libres
//   lib/cache.ts           → guarda esas consultas un rato para no repetirlas
//   lib/rules.ts           → reglas: tipos de bus, fechas válidas, cuándo no se pueden saber las plazas
//   lib/calendar.ts        → utilidades de fechas y horas
//   lib/auth.ts            → cookie de sesión
//
// RECORRIDO DE UNA BÚSQUEDA
//   1. El usuario elige trayecto y día en SearchApp y pulsa «Buscar buses».
//   2. SearchApp (navegador) pide /api/trips?dir=ida&date=2026-11-03.
//   3. La API (servidor) comprueba la sesión y llama a getTrips → fetchTrips, que descarga la página de
//      samar.es y la convierte en una lista de buses (o la saca de la caché si se pidió hace poco).
//   4. SearchApp recibe la lista y pinta una TripCard por bus.
//   5. Al pulsar «Ver plazas libres», la TripCard pide /api/seats?...&exp=<id del bus>; el servidor busca ese
//      bus en autobusing y cuenta los asientos libres del mapa de asientos.
//
// Los archivos .tsx son componentes de React escritos en TypeScript; los .ts, TypeScript sin interfaz.
import SearchApp from './SearchApp.tsx';

// Cabecera en el servidor: solo el buscador y los resultados viajan como JavaScript al navegador
// (Este componente no lleva 'use client', así que se convierte en HTML en el servidor; SearchApp sí lo lleva.)
export default function Page() {
  return (
    <>
      {/* Enlace oculto que aparece al pulsar Tab: deja a quien usa teclado saltar directamente a los resultados */}
      <a href="#resultados" className="skip-link">Saltar a los resultados</a>
      <main className="shell">
        <h1>Buses Madrid ↔ Talavera</h1>
        <SearchApp />
      </main>
    </>
  );
}
