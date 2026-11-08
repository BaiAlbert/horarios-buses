// TARJETA DE UN BUS: hora de salida y llegada, duración, tipo, línea, avisos, paradas y el botón
// «Ver plazas libres». SearchApp pinta una por cada bus de los resultados.
// Al pulsar el botón, esta tarjeta (ella sola) pide las plazas a /api/seats y muestra el resultado.
'use client';

import { memo, useState } from 'react';
import type { Direction, Trip } from '../lib/samar.ts';
import type { BusSeats, SeatsResult } from '../lib/autobusing.ts';
import { KIND_LABEL, buyUrl, tripKind } from '../lib/rules.ts';
import { formatDuration, madridTime } from '../lib/calendar.ts';
import AlertIcon from './AlertIcon.tsx';

// Situación de la consulta de plazas de esta tarjeta: sin pedir, pidiendo, error, o con resultado.
type SeatsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; result: SeatsResult & { passThrough: boolean } };

// Una línea de la lista del refuerzo: «1.º: 3 libres de 65», «2.º: completo»...
function busLine(b: BusSeats, i: number) {
  const n = `${i + 1}.º`;
  switch (b.kind) {
    case 'count': return `${n}: ${b.free} libres de ${b.total}`;
    case 'full': return `${n}: completo`;
    case 'available': return `${n}: quedan plazas (sin elección de asiento)`;
  }
}

// ¿No queda ningún sitio? (para pintar el resultado con el color de «Completo»)
const allFull = (r: Extract<SeatsResult, { ok: true }>) =>
  r.kind === 'full' || (r.kind === 'several' && r.buses.every((b) => b.kind === 'full'));

// Texto con el resultado de plazas cuando se pudo averiguar (ok: true). Hay cuatro casos según `kind`.
// `Extract<SeatsResult, { ok: true }>` = de todas las formas de SeatsResult, solo las que tienen ok: true.
function SeatsLine({ r }: { r: Extract<SeatsResult, { ok: true }> }) {
  const checked = <small>(consultado {madridTime(r.checkedAt)})</small>;
  switch (r.kind) {
    case 'count':
      return <p><strong>{r.free} libres</strong> · {r.occupied} ocupadas · {r.total} totales {checked}</p>;
    case 'full':
      return <p><strong>Completo:</strong> no quedan plazas {checked}</p>;
    case 'available':
      return (
        <p><strong>Quedan plazas</strong> {checked}<br />
          <small>Este bus no tiene elección de asiento en la venta online, así que no se puede saber cuántas.</small></p>
      );
    // REFUERZO: ese horario lleva varios autobuses (varias filas iguales en autobusing). Se listan en el orden
    // de la tabla de autobusing, para saber qué fila elegir al comprar si se quiere el que tiene más sitio.
    // (<> </> es un "fragmento": agrupa varios elementos sin añadir ninguna etiqueta al HTML.)
    case 'several':
      return (
        <>
          <p><strong>{r.buses.length} autobuses a esta hora</strong> {checked}</p>
          <ol className="buses">
            {/* cada línea empieza por su número («1.º»...), así que sirve de key única */}
            {r.buses.map(busLine).map((line) => <li key={line}>{line}</li>)}
          </ol>
        </>
      );
  }
}

// Pista de qué fila elegir en la tabla Horarios de autobusing al comprar. Antes de consultar las plazas usa
// las horas de samar.es; después, lo que se sabe de autobusing: su hora de llegada si es otra, o cuántas filas
// iguales tiene si el horario lleva refuerzo.
function buyHint(trip: Trip, seats: SeatsState): string {
  const r = seats.status === 'done' && seats.result.ok ? seats.result : null;
  if (r?.kind === 'several') {
    const n = r.buses.length;
    return `En autobusing hay ${n} filas ${trip.departure} → ${trip.arrival}; ${n === 2 ? 'las dos' : 'todas'} son este horario.`;
  }
  // `?.` y `??`: si no hay resultado (r es null) o no trae matchedArrival, se usa la llegada de samar.es
  const arrival = r?.matchedArrival ?? trip.arrival;
  return `En autobusing, elige la fila ${trip.departure} → ${arrival}. Si no aparece, este bus no se vende ahí.`;
}

// Props que recibe la tarjeta desde SearchApp: el bus, el sentido y la fecha buscados (para pedir las
// plazas), y si hay que ocultar las paradas.
type Props = { trip: Trip; dir: Direction; date: string; hideItinerary: boolean };

// memo: elegir otra fecha o trayecto en el buscador no vuelve a pintar las tarjetas ya en pantalla
// (memo hace que el componente solo se repinte si cambian sus props.)
export default memo(function TripCard({ trip, dir, date, hideItinerary }: Props) {
  // Cada tarjeta tiene su propio estado de plazas, independiente de las demás.
  const [seats, setSeats] = useState<SeatsState>({ status: 'idle' });
  const kind = tripKind(trip);
  const dur = formatDuration(trip.duration);

  // Pide las plazas de este bus a nuestra API. Solo manda el identificador; el servidor saca el resto.
  async function loadSeats() {
    setSeats({ status: 'loading' });
    try {
      const res = await fetch(`/api/seats?dir=${dir}&date=${date}&exp=${trip.expedition}`);
      if (res.status === 401) { window.location.href = '/login'; return; } // sesión caducada
      if (!res.ok) throw new Error(String(res.status));
      const result: SeatsResult & { passThrough: boolean } = await res.json();
      if (typeof result?.ok !== 'boolean') throw new Error('respuesta inesperada');
      setSeats({ status: 'done', result });
    } catch {
      setSeats({ status: 'error' });
    }
  }

  return (
    <article className="card glass">
      {/* Cabecera: 08:00 —— 1 h 35 min —— 09:35. La duración tiene versión corta (visible) y larga (para lectores de pantalla) */}
      <header className="journey">
        <time className="times">{trip.departure}</time>
        <span className="track"><span className="sr"> a </span><span aria-hidden="true">{dur.short}</span><span className="sr">{dur.long}</span></span>
        <time className="times">{trip.arrival}</time>
      </header>
      <p className="meta">
        <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>
        <span>Línea {trip.line}</span>
        <span>{trip.stops.length} paradas</span>
      </p>

      {/* Avisos de paradas de este bus, si los hay */}
      {trip.alerts.length > 0 && (
        <div className="trip-alerts" role="note">
          {trip.alerts.map((a) => (
            <p key={a}><AlertIcon /> {a}</p>
          ))}
        </div>
      )}

      {/* Lista de paradas (itinerario). Se pliega con el interruptor «Ocultar paradas» */}
      {/* siempre en el DOM para poder animar el cierre; inert lo saca del foco y de los lectores de pantalla */}
      <div className="collapse" data-open={!hideItinerary} inert={hideItinerary}>
        <div>
          <ol className="stops">
            {trip.stops.map((s) => (
              <li key={`${s.time} ${s.name}`}><time>{s.time}</time> {s.name}</li>
            ))}
          </ol>
        </div>
      </div>

      {/* Zona de plazas. aria-live="polite": los lectores de pantalla anuncian el resultado cuando aparece */}
      <div className="seats" aria-live="polite">
        {/* Aún sin consultar o consultando: el botón */}
        {(seats.status === 'idle' || seats.status === 'loading') && (
          <button type="button" className="secondary press" onClick={loadSeats} disabled={seats.status === 'loading'}>
            {seats.status === 'loading' && <span className="spinner" aria-hidden="true" />}
            {seats.status === 'loading' ? 'Consultando…' : 'Ver plazas libres'}
          </button>
        )}
        {/* La petición falló (sin internet, servidor caído...) */}
        {seats.status === 'error' && (
          <p className="error">No se pudo consultar. <button type="button" onClick={loadSeats}>Reintentar</button></p>
        )}
        {/* Hay respuesta: o bien plazas (ok: true) o bien el motivo por el que no se pudieron saber (ok: false) */}
        {seats.status === 'done' && (seats.result.ok ? (
          <div className={allFull(seats.result) ? 'seats-full' : 'seats-ok'}>
            <SeatsLine r={seats.result} />
            {/* El bus se emparejó en autobusing solo por la hora de salida (ver pickRow en lib/autobusing.ts) */}
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

      {/* Comprar: enlace a autobusing en otra pestaña. Va fuera de la zona aria-live de plazas para que los
          lectores de pantalla no lo repitan al cambiar las plazas. La compra (pago y datos) es toda de
          autobusing: esta web solo lleva hasta allí y dice qué fila de su tabla corresponde a este bus.
          rel="noopener noreferrer": la otra pestaña no puede controlar esta ni sabe de dónde viene. */}
      <div className="buy">
        <a className="secondary press" href={buyUrl(trip, date)} target="_blank" rel="noopener noreferrer">
          Comprar en autobusing<span className="sr"> (se abre en otra pestaña)</span>
        </a>
        <p className="note">{buyHint(trip, seats)}</p>
      </div>
    </article>
  );
});
