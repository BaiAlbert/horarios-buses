'use client';

import { useState } from 'react';
import type { Direction, Trip } from '../lib/samar.ts';
import type { SeatsResult } from '../lib/autobusing.ts';
import { KIND_LABEL, tripKind } from '../lib/rules.ts';

type SeatsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; result: SeatsResult & { passThrough: boolean } };

const hm = (d: string) => d.replace(/^0?(\d+):(\d\d)$/, '$1h$2'); // 01:20 → 1h20
const madridTime = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));

export default function TripCard({ trip, dir, date, hideItinerary }: { trip: Trip; dir: Direction; date: string; hideItinerary: boolean }) {
  const [seats, setSeats] = useState<SeatsState>({ status: 'idle' });
  const kind = tripKind(trip);

  async function loadSeats() {
    setSeats({ status: 'loading' });
    try {
      const res = await fetch(`/api/seats?dir=${dir}&date=${date}&exp=${trip.expedition}`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(String(res.status));
      setSeats({ status: 'done', result: await res.json() });
    } catch {
      setSeats({ status: 'error' });
    }
  }

  return (
    <article className="card">
      <header className="card-head">
        <p className="times">{trip.departure} → {trip.arrival}</p>
        <p className="line">Línea {trip.line}</p>
      </header>
      <p className="meta">
        <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>
        <span>{trip.stops.length} paradas</span>
        <span>{hm(trip.duration)}</span>
      </p>

      {!hideItinerary && (
        <ol className="itinerary">
          {trip.stops.map((s, i) => (
            <li key={i}><time>{s.time}</time> {s.name}</li>
          ))}
        </ol>
      )}

      <div className="seats" aria-live="polite">
        {(seats.status === 'idle' || seats.status === 'loading') && (
          <button type="button" className="secondary" onClick={loadSeats} disabled={seats.status === 'loading'}>
            {seats.status === 'loading' ? 'Consultando…' : 'Ver plazas libres'}
          </button>
        )}
        {seats.status === 'error' && (
          <p className="error">No se pudo consultar. <button type="button" onClick={loadSeats}>Reintentar</button></p>
        )}
        {seats.status === 'done' && (seats.result.ok ? (
          <div className="seats-ok">
            <p><strong>{seats.result.seats.free} libres</strong> · {seats.result.seats.occupied} ocupadas · {seats.result.seats.total} totales{' '}
              <small>(consultado {madridTime(seats.result.seats.checkedAt)})</small></p>
            {seats.result.passThrough && (
              <p className="note">Este bus continúa más allá de tu trayecto; las plazas podrían referirse a todo el recorrido.</p>
            )}
          </div>
        ) : (
          <p className="unavailable" title={seats.result.reason}>Plazas no disponibles <small>({seats.result.reason})</small></p>
        ))}
      </div>
    </article>
  );
}
