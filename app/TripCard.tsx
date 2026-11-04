'use client';

import { memo, useState } from 'react';
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

type Props = { trip: Trip; dir: Direction; date: string; hideItinerary: boolean };

// memo: elegir otra fecha o trayecto en el buscador no vuelve a pintar las tarjetas ya en pantalla
export default memo(function TripCard({ trip, dir, date, hideItinerary }: Props) {
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
    <article className="card glass">
      <header className="journey">
        <time className="times">{trip.departure}</time>
        <span className="track"><span className="sr"> a </span>{hm(trip.duration)}</span>
        <time className="times">{trip.arrival}</time>
      </header>
      <p className="meta">
        <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>
        <span>Línea {trip.line}</span>
        <span>{trip.stops.length} paradas</span>
      </p>

      {trip.alerts.length > 0 && (
        <div className="trip-alerts" role="note">
          {trip.alerts.map((a) => <p key={a}><span aria-hidden="true">⚠</span> {a}</p>)}
        </div>
      )}

      {/* siempre en el DOM para poder animar el cierre; inert lo saca del foco y de los lectores de pantalla */}
      <div className="collapse" data-open={!hideItinerary} inert={hideItinerary}>
        <div>
          <ol className="stops">
            {trip.stops.map((s, i) => (
              <li key={i}><time>{s.time}</time> {s.name}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="seats" aria-live="polite">
        {(seats.status === 'idle' || seats.status === 'loading') && (
          <button type="button" className="secondary press" onClick={loadSeats} disabled={seats.status === 'loading'}>
            {seats.status === 'loading' && <span className="spinner" aria-hidden="true" />}
            {seats.status === 'loading' ? 'Consultando…' : 'Ver plazas libres'}
          </button>
        )}
        {seats.status === 'error' && (
          <p className="error">No se pudo consultar. <button type="button" onClick={loadSeats}>Reintentar</button></p>
        )}
        {seats.status === 'done' && (seats.result.ok ? (
          <div className={'full' in seats.result ? 'seats-full' : 'seats-ok'}>
            {'full' in seats.result ? (
              <p><strong>Completo:</strong> no quedan plazas <small>(consultado {madridTime(seats.result.checkedAt)})</small></p>
            ) : 'available' in seats.result ? (
              <p><strong>Quedan plazas</strong> <small>(consultado {madridTime(seats.result.checkedAt)})</small><br />
                <small>Este bus no tiene elección de asiento en la venta online, así que no se puede saber cuántas.</small></p>
            ) : (
              <p><strong>{seats.result.seats.free} libres</strong> · {seats.result.seats.occupied} ocupadas · {seats.result.seats.total} totales{' '}
                <small>(consultado {madridTime(seats.result.seats.checkedAt)})</small></p>
            )}
            {seats.result.matchedArrival && (
              <p className="note">
                Aviso: en el sistema de venta este bus llega a las {seats.result.matchedArrival} (en Samar, a las {trip.arrival}).
                Se ha emparejado solo por la hora de salida.
              </p>
            )}
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
});
