'use client';

import { useEffect, useState } from 'react';
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

const longDate = (date: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

export default function SearchApp() {
  const [dir, setDir] = useState<Direction>('ida');
  const [today, setToday] = useState('');
  const [date, setDate] = useState('');
  const [hideItinerary, setHideItinerary] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [kinds, setKinds] = useState<TripKind[]>(ALL_KINDS);

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
        {today && <DatePicker id="date" value={date} min={today} max={addDays(today, MAX_DAYS_AHEAD)} onChange={setDate} />}

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
                <label className="chip chip-toggle">
                  <input type="checkbox" checked={hideItinerary} onChange={(e) => toggleHide(e.target.checked)} />
                  Ocultar paradas
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
                <fieldset className="filters">
                  <legend>Mostrar</legend>
                  {ALL_KINDS.map((k) => (
                    <label key={k} className={`chip kind-${k}`}>
                      <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggleKind(k)} />
                      {KIND_LABEL[k]} <span className="chip-count">{state.data.trips.filter((t) => tripKind(t) === k).length}</span>
                    </label>
                  ))}
                </fieldset>
                {(() => {
                  const visible = state.data.trips.filter((t) => kinds.includes(tripKind(t)));
                  return (
                    <>
                      <p className="count">
                        {visible.length === state.data.trips.length ? `${visible.length} buses` : `Mostrando ${visible.length} de ${state.data.trips.length} buses`}
                      </p>
                      {visible.length === 0 && <p className="empty">Ningún bus con los tipos seleccionados.</p>}
                      <ul className="trips">
                        {visible.map((t) => (
                          <li key={t.expedition}>
                            <TripCard trip={t} dir={state.dir} date={state.date} hideItinerary={hideItinerary} />
                          </li>
                        ))}
                      </ul>
                    </>
                  );
                })()}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
