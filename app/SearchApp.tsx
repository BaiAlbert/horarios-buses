// BUSCADOR Y RESULTADOS: el componente principal de la web.
//
// Qué se ve: a la izquierda (o arriba en el móvil) el formulario para elegir trayecto y día; a la derecha
// la lista de buses encontrados, con filtros por tipo y un interruptor para ocultar las paradas.
// Al pulsar «Buscar buses» pide los datos a /api/trips (app/api/trips/route.ts) y pinta una TripCard por bus.
//
// CONCEPTOS DE REACT QUE APARECEN AQUÍ
//   - Estado (useState): datos que, al cambiar, hacen que React vuelva a "pintar" (renderizar) el componente.
//     `const [x, setX] = useState(inicial)` → x es el valor actual y setX(nuevo) lo cambia y repinta.
//     Nunca se modifica x directamente: siempre con setX.
//   - Renderizar: React llama a la función del componente cada vez que cambia su estado y compara el
//     resultado con lo que había para tocar en la página solo lo que ha cambiado.
//   - Props: los "parámetros" que un componente padre pasa a un hijo, como atributos: <TripCard trip={t} />.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Direction, TripsResponse } from '../lib/samar.ts';
import { madridTime } from '../lib/calendar.ts';
import { KIND_LABEL, MAX_DAYS_AHEAD, addDays, alcorconTwin, searchDate, shares909Row, todayMadrid, tripKind, type TripKind } from '../lib/rules.ts';
import AlertIcon from './AlertIcon.tsx';
import DatePicker from './DatePicker.tsx';
import TripCard from './TripCard.tsx';

// Texto de cada trayecto en los botones y en el título de resultados.
const ROUTE_LABEL: Record<Direction, string> = {
  ida: 'Madrid Estación Sur → Talavera',
  vuelta: 'Talavera → Madrid Estación Sur',
};

// Las cuatro situaciones posibles de la búsqueda:
//   idle    → aún no se ha buscado nada
//   loading → esperando la respuesta de /api/trips
//   error   → falló (offline: true si el móvil no tiene internet)
//   done    → hay resultados; guarda también el trayecto y la fecha buscados
// Tenerlo en un solo estado evita combinaciones imposibles (p. ej. "cargando" y "error" a la vez).
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; offline: boolean }
  | { status: 'done'; dir: Direction; date: string; data: TripsResponse };

const CACHED_AFTER_MIN = 1; // con menos edad se da por recién descargado (la caché de datos dura hasta 1 h)

// Minutos desde que se descargó de samar.es; null si el reloj del móvil va por detrás (no se puede saber)
const ageMinutes = (fetchedAt: string) => {
  const m = Math.floor((Date.now() - Date.parse(fetchedAt)) / 60_000);
  return m >= 0 ? m : null;
};

// Línea "Consultado a las 10:32". Si los datos vienen de la caché del servidor (tienen 1 minuto o más),
// avisa de que pueden no estar al día.
// `{ fetchedAt }: { fetchedAt: string }` = recibe un prop llamado fetchedAt que es un texto.
function FetchedLine({ fetchedAt }: { fetchedAt: string }) {
  const age = ageMinutes(fetchedAt);
  if (age === null || age < CACHED_AFTER_MIN) return <p className="fetched">Consultado a las {madridTime(fetchedAt)}</p>;
  return (
    <p className="fetched fetched--cached">
      <AlertIcon /> Resultados guardados, consultados a las {madridTime(fetchedAt)} (hace {age} min). Pueden no estar al día.
    </p>
  );
}

// Nombres con los que se guardan las preferencias del usuario en localStorage (un pequeño almacén del
// navegador que se conserva entre visitas). Así se recuerdan los filtros al volver a entrar.
const HIDE_KEY = 'ocultar-itinerarios';
const NOTICES_KEY = 'ocultar-avisos';
const KINDS_KEY = 'tipos-visibles';
const ALL_KINDS = Object.keys(KIND_LABEL) as TripKind[]; // ['directo', 'ruta-santa-olalla', 'ruta']
const STAGGER_MAX = 8; // solo las primeras tarjetas entran escalonadas; el resto aparece ya colocado

// Fecha larga en español: "2026-11-03" → "martes, 3 de noviembre".
const longDateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = (date: string) => longDateFmt.format(new Date(`${date}T00:00:00Z`));

// Se pasa como `ref` al título de resultados: React la llama con el elemento HTML cuando aparece en
// pantalla, y lo enfoca (útil para teclado y lectores de pantalla: saltan directamente a los resultados).
// el título solo existe mientras hay resultados: cada búsqueda lo monta de nuevo y recibe el foco. Función estable: si cambiara en cada render, enfocaría al filtrar
const focusOnMount = (el: HTMLElement | null) => el?.focus();

// Interruptor «Ocultar paradas». Aparece en dos sitios (lateral y barra de filtros) con distinto estilo
// (`className`), pero los dos controlan el mismo valor: lo reciben (`checked`) y avisan del cambio (`onChange`).
function HideSwitch({ className, checked, onChange }: { className: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`switch ${className}`}>
      {/* biome-ignore lint/a11y/useAriaPropsForRole: el checkbox nativo ya expone su estado; aria-checked sobraría */}
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Ocultar paradas
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

// `export default`: lo que se importa cuando otro archivo hace `import SearchApp from './SearchApp.tsx'`.
export default function SearchApp() {
  // ---- ESTADO ----
  const [dir, setDir] = useState<Direction>('ida'); // trayecto elegido en el formulario
  const [today, setToday] = useState(''); // fecha de hoy en Madrid ('' hasta que carga en el navegador)
  const [date, setDate] = useState(''); // día elegido en el calendario
  const [hideItinerary, setHideItinerary] = useState(false); // ¿ocultar las paradas de las tarjetas?
  const [hideNotices, setHideNotices] = useState(false); // ¿plegar los avisos de Samar?
  const [state, setState] = useState<State>({ status: 'idle' }); // situación de la búsqueda (ver tipo State)
  const [kinds, setKinds] = useState<TripKind[]>(ALL_KINDS); // tipos de bus visibles según los filtros
  // useRef guarda un valor que NO provoca repintado al cambiar. Aquí, el "mando" para cancelar la
  // búsqueda en curso (AbortController) si se lanza otra.
  const inflight = useRef<AbortController | null>(null);

  // useEffect ejecuta código DESPUÉS de pintar. Con la lista vacía `[]` al final, solo se ejecuta una vez,
  // al aparecer el componente. Se usa para lo que solo existe en el navegador: la fecha real y localStorage.
  useEffect(() => {
    // la página se genera en el build: «hoy» se calcula en el navegador
    const t = todayMadrid();
    setToday(t);
    setDate(t);
    // Recupera las preferencias guardadas. try/catch porque localStorage puede fallar (modo privado, bloqueado...).
    try {
      setHideItinerary(localStorage.getItem(HIDE_KEY) === '1');
      setHideNotices(localStorage.getItem(NOTICES_KEY) === '1');
      const saved = JSON.parse(localStorage.getItem(KINDS_KEY) ?? 'null');
      if (Array.isArray(saved)) setKinds(ALL_KINDS.filter((k) => saved.includes(k)));
    } catch {}
    // La función que devuelve un useEffect se ejecuta cuando el componente desaparece: cancela la búsqueda pendiente.
    return () => inflight.current?.abort();
  }, []);

  // ---- ACCIONES DEL USUARIO ----
  // Cada una cambia el estado y guarda la preferencia en localStorage.
  const toggleHide = (v: boolean) => {
    setHideItinerary(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch {}
  };

  const toggleNotices = () => {
    setHideNotices(!hideNotices);
    // Ojo: aquí hideNotices todavía tiene el valor ANTERIOR (setHideNotices no lo cambia hasta el siguiente
    // renderizado), por eso se guarda al revés: si estaba oculto ('1'), ahora pasa a visible ('0').
    try { localStorage.setItem(NOTICES_KEY, hideNotices ? '0' : '1'); } catch {}
  };

  // Activa o desactiva un tipo en los filtros. Si se añade, se reconstruye la lista desde ALL_KINDS
  // para que mantenga siempre el mismo orden.
  const toggleKind = (k: TripKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : ALL_KINDS.filter((x) => x === k || kinds.includes(x));
    setKinds(next);
    try { localStorage.setItem(KINDS_KEY, JSON.stringify(next)); } catch {}
  };

  // BÚSQUEDA: se ejecuta al enviar el formulario o al pulsar «Reintentar».
  async function search() {
    // Se guarda qué se buscó: si el usuario cambia el formulario mientras carga, los resultados siguen
    // correspondiendo a esta búsqueda. searchDate corrige la fecha si se ha quedado en el pasado.
    const searched = { dir, date: searchDate(date) };
    const t = todayMadrid();
    if (t !== today) setToday(t); // la pestaña puede llevar abierta desde ayer
    if (searched.date !== date) setDate(searched.date);
    setState({ status: 'loading' });
    inflight.current?.abort(); // una búsqueda nueva anula la anterior para que no pise el resultado
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      // fetch pide datos a una URL. Aquí, a nuestra propia API (que se ejecuta en el servidor).
      const res = await fetch(`/api/trips?dir=${searched.dir}&date=${searched.date}`, { signal: ctrl.signal });
      if (res.status === 401) { window.location.href = '/login'; return; } // la sesión caducó: al login
      if (!res.ok) throw new Error(String(res.status));
      const data: TripsResponse = await res.json(); // convierte el texto JSON de la respuesta en un objeto
      if (!Array.isArray(data?.trips) || Number.isNaN(Date.parse(data.fetchedAt))) throw new Error('respuesta inesperada'); // sin esto, un 200 raro dejaría la página en blanco
      setState({ status: 'done', ...searched, data });
    } catch {
      // Si se canceló a propósito (porque empezó otra búsqueda), no es un error que mostrar.
      if (!ctrl.signal.aborted) setState({ status: 'error', offline: !navigator.onLine });
    }
  }

  // ---- DATOS DERIVADOS (se calculan a partir del estado en cada renderizado) ----
  const loading = state.status === 'loading';
  const done = state.status === 'done' ? state : null; // atajo: el estado si hay resultados, o null

  // useMemo guarda el resultado del cálculo y solo lo repite si cambian los valores de la lista final
  // ([done?.data, kinds]): los resultados o los filtros.
  // counts: cuántos buses hay de cada tipo (el número de cada filtro). visible: los buses que pasan los filtros.
  // Una sola pasada por los buses: al cambiar la fecha o el trayecto no se recalcula nada de esto
  const { counts, visible } = useMemo(() => {
    const counts: Record<TripKind, number> = { directo: 0, 'ruta-santa-olalla': 0, ruta: 0 };
    const visible = [];
    for (const t of done?.data.trips ?? []) {
      const k = tripKind(t);
      counts[k]++;
      if (kinds.includes(k)) visible.push(t);
    }
    return { counts, visible };
  }, [done?.data, kinds]);
  const total = done?.data.trips.length ?? 0;

  // Texto oculto que leen los lectores de pantalla (role="status") para anunciar qué ha pasado.
  // Son ternarios encadenados: "si loading → ..., si no, si error → ..., si no, si done → ..., si no ''".
  // lo único que se anuncia: una línea de estado, no las tarjetas
  const status = loading ? 'Buscando buses…'
    : state.status === 'error' ? (state.offline ? 'Sin conexión a internet.' : 'No se pudo consultar Samar.')
    : done ? (total === 0 ? 'No hay buses para este día.' : `${visible.length === total ? total : `${visible.length} de ${total}`} buses, ${longDate(done.date)}`)
    : '';

  // ---- LO QUE SE PINTA ----
  // Las clases CSS (className) están definidas en app/globals.css.
  // "sr" = "screen reader": elementos invisibles en pantalla pero que los lectores de pantalla sí leen.
  return (
    <div className="layout">
      {/* COLUMNA LATERAL: formulario de búsqueda y pie de página */}
      <div className="side">
        {/* onSubmit: al enviar el formulario. e.preventDefault() evita que el navegador recargue la página (lo normal en HTML). */}
        <form className="panel glass" onSubmit={(e) => { e.preventDefault(); search(); }}>
          {/* Selector de trayecto: dos "radio buttons" con aspecto de botones. Se genera uno por cada clave de ROUTE_LABEL con .map */}
          <div className="routes glass" role="radiogroup" aria-label="Trayecto">
            {(Object.keys(ROUTE_LABEL) as Direction[]).map((d) => (
              // `key`: React necesita una clave única en cada elemento de una lista para seguirles la pista.
              <label key={d} className="route">
                <input type="radio" name="dir" value={d} checked={dir === d} onChange={() => setDir(d)} className="sr" />
                <span>{ROUTE_LABEL[d]}</span>
              </label>
            ))}
          </div>

          <label htmlFor="date">Día del viaje</label>
          {/* Calendario propio (app/DatePicker.tsx). Solo deja elegir entre hoy y hoy + MAX_DAYS_AHEAD días. */}
          <DatePicker id="date" value={date} min={today} max={today && addDays(today, MAX_DAYS_AHEAD)} onChange={setDate} />

          <button type="submit" className="primary press" disabled={!date || loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? 'Buscando…' : 'Buscar buses'}
          </button>
        </form>
        {/* En pantallas anchas el interruptor está en el lateral; en el móvil, el CSS muestra el de la barra de filtros */}
        {total > 0 && <HideSwitch className="switch--side glass" checked={hideItinerary} onChange={toggleHide} />}
        <footer className="site-footer">
          <p>
            Web personal y no oficial, sin relación con Autocares Samar ni con autobusing. Los horarios y las plazas se
            leen de samar.es y regular.autobusing.es y pueden no estar al día: compruébalos en{' '}
            <a href="https://www.samar.es">samar.es</a> antes de viajar.
          </p>
          <p>Solo se usa una cookie técnica para mantener la sesión iniciada.</p>
        </footer>
      </div>

      {/* COLUMNA DE RESULTADOS: según state.status se muestra una cosa u otra */}
      <section id="resultados" tabIndex={-1} className="results">
        <p className="sr" role="status">{status}</p>
        {state.status === 'idle' && <p className="idle glass">Elige el trayecto y el día, y pulsa «Buscar buses».</p>}
        {/* Mientras carga: 3 tarjetas grises animadas ("skeleton") que imitan la forma de los resultados */}
        {loading && (
          <ul className="trips" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              // style={{ '--i': i }} pasa una variable CSS: el CSS la usa para que cada tarjeta aparezca con un poco de retraso
              <li key={i} className="skeleton glass" style={{ '--i': i }}>
                <i style={{ '--w': '62%' }} /><i style={{ '--w': '38%' }} /><i />
              </li>
            ))}
          </ul>
        )}
        {state.status === 'error' && (
          <p className="error glass empty">
            {state.offline ? 'Sin conexión a internet.' : 'No se pudo consultar Samar.'} <button type="button" onClick={search}>Reintentar</button></p>
        )}
        {done && (
          // <> ... </> es un "fragmento": agrupa varios elementos sin añadir ninguna etiqueta extra a la página
          <>
            <div className="results-head">
              <h2 ref={focusOnMount} tabIndex={-1}>{ROUTE_LABEL[done.dir]}</h2>
              {total > 0 && <p className="count">{visible.length === total ? `${total} buses` : `${visible.length} de ${total} buses`}</p>}
              <p className="date">{longDate(done.date)}</p>
            </div>
            <FetchedLine fetchedAt={done.data.fetchedAt} />
            {/* Avisos generales de Samar, plegables. Se pliegan con CSS (data-open) para poder animarlo */}
            {done.data.notices.length > 0 && (
              <div className="notices" role="note">
                <button type="button" className="notices-toggle" aria-expanded={!hideNotices} aria-controls="avisos" onClick={toggleNotices}>
                  <strong><AlertIcon /> Avisos de Samar</strong>
                  <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {/* inert: mientras está plegado, su contenido no se puede enfocar ni lo leen los lectores de pantalla */}
                <div id="avisos" className="collapse" data-open={!hideNotices} inert={hideNotices}>
                  <div>{done.data.notices.map((n) => <p key={n}>{n}</p>)}</div>
                </div>
              </div>
            )}
            {total === 0 ? (
              <p className="empty glass">No hay buses para este día. Prueba con otra fecha.</p>
            ) : (
              <>
                {/* Barra de filtros: una casilla por tipo de bus, con cuántos hay de cada uno */}
                {/* biome-ignore lint/a11y/useSemanticElements: un fieldset no admite bien position: sticky ni el estilo de cristal */}
                <div className="toolbar glass blur" role="group" aria-label="Filtros">
                  <div className="toolbar-inner">
                    <span className="toolbar-label">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3-1.5V8.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                      <span className="toolbar-label-text">Filtrar</span>
                    </span>
                    {ALL_KINDS.map((k) => (
                      <label key={k} className={`chip kind-${k}`}>
                        <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggleKind(k)} />
                        {KIND_LABEL[k]} <span className="chip-count">{counts[k]}</span>
                      </label>
                    ))}
                    <HideSwitch className="switch--bar" checked={hideItinerary} onChange={toggleHide} />
                  </div>
                </div>
                {visible.length === 0 && <p className="empty glass">Ningún bus con los tipos seleccionados.</p>}
                {/* La lista de buses: una TripCard (app/TripCard.tsx) por cada bus visible */}
                <ul className="trips">
                  {visible.map((t, i) => (
                    <li key={t.expedition} style={{ '--i': Math.min(i, STAGGER_MAX) }}>
                      <TripCard trip={t} dir={done.dir} date={done.date} hideItinerary={hideItinerary} alcorconTwin={alcorconTwin(t, done.data.trips)} shares909Row={shares909Row(t, done.data.trips)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
