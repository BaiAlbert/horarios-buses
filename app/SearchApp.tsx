'use client';

import { useEffect, useState } from 'react';
import type { Direction, SearchResult } from '../lib/samar.ts';
import { MAX_DAYS_AHEAD, addDays, todayMadrid } from '../lib/rules.ts';
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

const longDate = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export default function SearchApp() {
  const [dir, setDir] = useState<Direction>('ida');
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [hideItinerary, setHideItinerary] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    // la página se genera en el build: «hoy» se calcula en el navegador
    const t = todayMadrid();
    setToday(t);
    setDate(t);
    try { setHideItinerary(localStorage.getItem(HIDE_KEY) === '1'); } catch {}
  }, []);

  const toggleHide = (v: boolean) => {
    setHideItinerary(v);
    try { localStorage.setItem(HIDE_KEY, v ? '1' : '0'); } catch {}
  };

  async function search() {
    if (!date) return;
    const searched = { dir, date };
    setState({ status: 'loading' });
    try {
      const res = await fetch(`/api/trips?dir=${searched.dir}&date=${searched.date}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: 'done', ...searched, data: await res.json() });
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <main className="page">
      <h1>Buses Madrid ↔ Talavera</h1>

      <form className="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <fieldset className="routes">
          <legend>Trayecto</legend>
          {(Object.keys(ROUTE_LABEL) as Direction[]).map((d) => (
            <button key={d} type="button" className="route" aria-pressed={dir === d} onClick={() => setDir(d)}>
              {ROUTE_LABEL[d]}
            </button>
          ))}
        </fieldset>

        <label htmlFor="date">Día del viaje</label>
        <input
          id="date" type="date" required value={date}
          min={today || undefined} max={today ? addDays(today, MAX_DAYS_AHEAD) : undefined}
          onChange={(e) => setDate(e.target.value)}
        />

        <button type="submit" className="primary" disabled={!date || state.status === 'loading'}>
          {state.status === 'loading' ? 'Buscando…' : 'Buscar buses'}
        </button>
      </form>

      <section aria-live="polite" className="results">
        {state.status === 'error' && (
          <p className="error">No se pudo consultar Samar. <button type="button" onClick={search}>Reintentar</button></p>
        )}
        {state.status === 'done' && (
          <>
            <div className="results-head">
              <h2>{ROUTE_LABEL[state.dir]} · <span className="date">{longDate(state.date)}</span></h2>
              {state.data.trips.length > 0 && (
                <label className="toggle">
                  <input type="checkbox" checked={hideItinerary} onChange={(e) => toggleHide(e.target.checked)} />
                  Ocultar itinerarios
                </label>
              )}
            </div>
            {state.data.notices.length > 0 && (
              <div className="notices" role="note">
                <strong>Avisos de Samar</strong>
                {state.data.notices.map((n, i) => <p key={i}>{n}</p>)}
              </div>
            )}
            {state.data.trips.length === 0 ? (
              <p className="empty">No hay buses para este día.</p>
            ) : (
              <>
                <p className="count">{state.data.trips.length} buses</p>
                <ul className="trips">
                  {state.data.trips.map((t) => (
                    <li key={t.expedition}>
                      <TripCard trip={t} dir={state.dir} date={state.date} hideItinerary={hideItinerary} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
