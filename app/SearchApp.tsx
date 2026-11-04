'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Direction, SearchResult } from '../lib/samar.ts';
import { KIND_LABEL, MAX_DAYS_AHEAD, addDays, searchDate, todayMadrid, tripKind, type TripKind } from '../lib/rules.ts';
import DatePicker from './DatePicker.tsx';
import TripCard from './TripCard.tsx';

const ROUTE_LABEL: Record<Direction, string> = {
  ida: 'Madrid Estación Sur → Talavera',
  vuelta: 'Talavera → Madrid Estación Sur',
};

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; dir: Direction; date: string; data: SearchResult };

const HIDE_KEY = 'ocultar-itinerarios';
const KINDS_KEY = 'tipos-visibles';
const ALL_KINDS = Object.keys(KIND_LABEL) as TripKind[];
const STAGGER_MAX = 8; // solo las primeras tarjetas entran escalonadas; el resto aparece ya colocado

const longDate = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export default function SearchApp() {
  const [dir, setDir] = useState<Direction>('ida');
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [hideItinerary, setHideItinerary] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [kinds, setKinds] = useState<TripKind[]>(ALL_KINDS);
  const [moved, setMoved] = useState(false); // la caja del selector solo reacciona tras la primera pulsación
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    // la página se genera en el build: «hoy» se calcula en el navegador
    const t = todayMadrid();
    setToday(t);
    setDate(t);
    try {
      setHideItinerary(localStorage.getItem(HIDE_KEY) === '1');
      const saved = JSON.parse(localStorage.getItem(KINDS_KEY) ?? 'null');
      if (Array.isArray(saved)) setKinds(ALL_KINDS.filter((k) => saved.includes(k)));
    } catch {}
    return () => inflight.current?.abort();
  }, []);

  const toggleHide = (v: boolean) => {
    setHideItinerary(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch {}
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
    const ctrl = (inflight.current = new AbortController());
    try {
      const res = await fetch(`/api/trips?dir=${searched.dir}&date=${searched.date}`, { signal: ctrl.signal });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: 'done', ...searched, data: await res.json() });
    } catch {
      if (!ctrl.signal.aborted) setState({ status: 'error' });
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

  return (
    <div className="layout">
      <form className="panel glass" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <div className="routes glass" role="radiogroup" aria-label="Trayecto" data-dir={dir} data-moved={moved || undefined}>
          {(Object.keys(ROUTE_LABEL) as Direction[]).map((d) => (
            <label key={d} className="route">
              <input type="radio" name="dir" value={d} checked={dir === d} onChange={() => { setDir(d); setMoved(true); }} className="sr" />
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

      <section aria-live="polite" className="results">
        {state.status === 'idle' && <p className="idle glass">Elige el trayecto y el día, y pulsa «Buscar buses».</p>}
        {loading && (
          <>
            <span className="sr">Buscando buses…</span>
            <ul className="trips" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="skeleton glass" style={{ '--i': i } as CSSProperties}>
                  <i style={{ '--w': '62%' } as CSSProperties} /><i style={{ '--w': '38%' } as CSSProperties} /><i />
                </li>
              ))}
            </ul>
          </>
        )}
        {state.status === 'error' && (
          <p className="error glass empty">No se pudo consultar Samar. <button type="button" onClick={search}>Reintentar</button></p>
        )}
        {done && (
          <>
            <div className="results-head">
              <h2>{ROUTE_LABEL[done.dir]}</h2>
              {total > 0 && <p className="count">{visible.length === total ? `${total} buses` : `${visible.length} de ${total} buses`}</p>}
              <p className="date">{longDate(done.date)}</p>
              {total > 0 && (
                <label className="switch">
                  <input type="checkbox" role="switch" checked={hideItinerary} onChange={(e) => toggleHide(e.target.checked)} />
                  Ocultar paradas
                  <span className="switch-track" aria-hidden="true" />
                </label>
              )}
            </div>
            {done.data.notices.length > 0 && (
              <div className="notices" role="note">
                <strong>Avisos de Samar</strong>
                {done.data.notices.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
            {total === 0 ? (
              <p className="empty glass">No hay buses para este día. Prueba con otra fecha.</p>
            ) : (
              <>
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
                  </div>
                </div>
                {visible.length === 0 && <p className="empty glass">Ningún bus con los tipos seleccionados.</p>}
                <ul className="trips">
                  {visible.map((t, i) => (
                    <li key={t.expedition} style={{ '--i': Math.min(i, STAGGER_MAX) } as CSSProperties}>
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
