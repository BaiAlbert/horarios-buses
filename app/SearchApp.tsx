'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Direction, TripsResponse } from '../lib/samar.ts';
import { madridTime } from '../lib/calendar.ts';
import { KIND_LABEL, MAX_DAYS_AHEAD, addDays, searchDate, todayMadrid, tripKind, type TripKind } from '../lib/rules.ts';
import AlertIcon from './AlertIcon.tsx';
import DatePicker from './DatePicker.tsx';
import TripCard from './TripCard.tsx';

const ROUTE_LABEL: Record<Direction, string> = {
  ida: 'Madrid Estación Sur → Talavera',
  vuelta: 'Talavera → Madrid Estación Sur',
};

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

function FetchedLine({ fetchedAt }: { fetchedAt: string }) {
  const age = ageMinutes(fetchedAt);
  if (age === null || age < CACHED_AFTER_MIN) return <p className="fetched">Consultado a las {madridTime(fetchedAt)}</p>;
  return (
    <p className="fetched fetched--cached">
      <AlertIcon /> Resultados guardados, consultados a las {madridTime(fetchedAt)} (hace {age} min). Pueden no estar al día.
    </p>
  );
}

const HIDE_KEY = 'ocultar-itinerarios';
const NOTICES_KEY = 'ocultar-avisos';
const KINDS_KEY = 'tipos-visibles';
const ALL_KINDS = Object.keys(KIND_LABEL) as TripKind[];
const STAGGER_MAX = 8; // solo las primeras tarjetas entran escalonadas; el resto aparece ya colocado

const longDateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = (date: string) => longDateFmt.format(new Date(`${date}T00:00:00Z`));

// el título solo existe mientras hay resultados: cada búsqueda lo monta de nuevo y recibe el foco. Función estable: si cambiara en cada render, enfocaría al filtrar
const focusOnMount = (el: HTMLElement | null) => el?.focus();

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

export default function SearchApp() {
  const [dir, setDir] = useState<Direction>('ida');
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [hideItinerary, setHideItinerary] = useState(false);
  const [hideNotices, setHideNotices] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [kinds, setKinds] = useState<TripKind[]>(ALL_KINDS);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    // la página se genera en el build: «hoy» se calcula en el navegador
    const t = todayMadrid();
    setToday(t);
    setDate(t);
    try {
      setHideItinerary(localStorage.getItem(HIDE_KEY) === '1');
      setHideNotices(localStorage.getItem(NOTICES_KEY) === '1');
      const saved = JSON.parse(localStorage.getItem(KINDS_KEY) ?? 'null');
      if (Array.isArray(saved)) setKinds(ALL_KINDS.filter((k) => saved.includes(k)));
    } catch {}
    return () => inflight.current?.abort();
  }, []);

  const toggleHide = (v: boolean) => {
    setHideItinerary(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch {}
  };

  const toggleNotices = () => {
    setHideNotices(!hideNotices);
    try { localStorage.setItem(NOTICES_KEY, hideNotices ? '0' : '1'); } catch {}
  };

  const toggleKind = (k: TripKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : ALL_KINDS.filter((x) => x === k || kinds.includes(x));
    setKinds(next);
    try { localStorage.setItem(KINDS_KEY, JSON.stringify(next)); } catch {}
  };

  async function search() {
    const searched = { dir, date: searchDate(date) };
    const t = todayMadrid();
    if (t !== today) setToday(t);
    if (searched.date !== date) setDate(searched.date);
    setState({ status: 'loading' });
    inflight.current?.abort(); // una búsqueda nueva anula la anterior para que no pise el resultado
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      const res = await fetch(`/api/trips?dir=${searched.dir}&date=${searched.date}`, { signal: ctrl.signal });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(String(res.status));
      const data: TripsResponse = await res.json();
      if (!Array.isArray(data?.trips) || Number.isNaN(Date.parse(data.fetchedAt))) throw new Error('respuesta inesperada'); // sin esto, un 200 raro dejaría la página en blanco
      setState({ status: 'done', ...searched, data });
    } catch {
      if (!ctrl.signal.aborted) setState({ status: 'error', offline: !navigator.onLine });
    }
  }

  const loading = state.status === 'loading';
  const done = state.status === 'done' ? state : null;

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

  // lo único que se anuncia: una línea de estado, no las tarjetas
  const status = loading ? 'Buscando buses…'
    : state.status === 'error' ? (state.offline ? 'Sin conexión a internet.' : 'No se pudo consultar Samar.')
    : done ? (total === 0 ? 'No hay buses para este día.' : `${visible.length === total ? total : `${visible.length} de ${total}`} buses, ${longDate(done.date)}`)
    : '';

  return (
    <div className="layout">
      <div className="side">
        <form className="panel glass" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <div className="routes glass" role="radiogroup" aria-label="Trayecto">
            {(Object.keys(ROUTE_LABEL) as Direction[]).map((d) => (
              <label key={d} className="route">
                <input type="radio" name="dir" value={d} checked={dir === d} onChange={() => setDir(d)} className="sr" />
                <span>{ROUTE_LABEL[d]}</span>
              </label>
            ))}
          </div>

          <label htmlFor="date">Día del viaje</label>
          <DatePicker id="date" value={date} min={today} max={today && addDays(today, MAX_DAYS_AHEAD)} onChange={setDate} />

          <button type="submit" className="primary press" disabled={!date || loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? 'Buscando…' : 'Buscar buses'}
          </button>
        </form>
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

      <section id="resultados" tabIndex={-1} className="results">
        <p className="sr" role="status">{status}</p>
        {state.status === 'idle' && <p className="idle glass">Elige el trayecto y el día, y pulsa «Buscar buses».</p>}
        {loading && (
          <ul className="trips" aria-hidden="true">
            {[0, 1, 2].map((i) => (
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
          <>
            <div className="results-head">
              <h2 ref={focusOnMount} tabIndex={-1}>{ROUTE_LABEL[done.dir]}</h2>
              {total > 0 && <p className="count">{visible.length === total ? `${total} buses` : `${visible.length} de ${total} buses`}</p>}
              <p className="date">{longDate(done.date)}</p>
            </div>
            <FetchedLine fetchedAt={done.data.fetchedAt} />
            {done.data.notices.length > 0 && (
              <div className="notices" role="note">
                <button type="button" className="notices-toggle" aria-expanded={!hideNotices} aria-controls="avisos" onClick={toggleNotices}>
                  <strong><AlertIcon /> Avisos de Samar</strong>
                  <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div id="avisos" className="collapse" data-open={!hideNotices} inert={hideNotices}>
                  <div>{done.data.notices.map((n) => <p key={n}>{n}</p>)}</div>
                </div>
              </div>
            )}
            {total === 0 ? (
              <p className="empty glass">No hay buses para este día. Prueba con otra fecha.</p>
            ) : (
              <>
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
                <ul className="trips">
                  {visible.map((t, i) => (
                    <li key={t.expedition} style={{ '--i': Math.min(i, STAGGER_MAX) }}>
                      <TripCard trip={t} dir={done.dir} date={done.date} hideItinerary={hideItinerary} />
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
