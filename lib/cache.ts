// CACHÉ: guarda las respuestas de samar.es y autobusing durante un rato para no consultarles en cada visita.
// Así la web va más rápida y no se "bombardea" a esas webs. Horarios: 1 hora. Plazas: 5 minutos
// (cambian más a menudo). Las rutas de la API (app/api/...) llaman a getTrips/getSeats, nunca directamente
// a fetchTrips/fetchSeats.
import { unstable_cache } from 'next/cache';
import { SCHEMA_VERSION, fetchTrips, type Direction, type Trip } from './samar.ts';
import { fetchSeats } from './autobusing.ts';

// TTL ("time to live") = cuántos segundos vale un dato guardado.
export const TRIPS_TTL_S = 3600;
export const SEATS_TTL_S = 300;

// unstable_cache sirve datos caducados mientras renueva en segundo plano; meter la franja horaria
// en la clave garantiza que nunca se muestran datos más viejos que el TTL.
// Ejemplo con TTL de 1 h: de 10:00 a 10:59 bucket vale lo mismo; a las 11:00 cambia, la clave es otra y
// se descarga de nuevo. `now = Date.now()` es un parámetro con valor por defecto (los tests pasan otro).
export const bucket = (ttlSeconds: number, now = Date.now()) => Math.floor(now / (ttlSeconds * 1000));

// unstable_cache (de Next.js) "envuelve" una función: si se llama otra vez con los mismos argumentos,
// devuelve el resultado guardado en vez de ejecutarla. Los argumentos forman la clave de la caché.
// `_bucket` no se usa dentro (el `_` lo indica); solo está para que forme parte de la clave.
const tripsCached = unstable_cache(
  (dir: Direction, date: string, _bucket: number) => fetchTrips(dir, date),
  ['trips', `v${SCHEMA_VERSION}`],
  { revalidate: TRIPS_TTL_S },
);

const seatsCached = unstable_cache(
  (trip: Trip, date: string, siblings: string[], _bucket: number) => fetchSeats(trip, date, { siblingArrivals: siblings }),
  ['seats', `v${SCHEMA_VERSION}`],
  { revalidate: SEATS_TTL_S },
);

// Lo que usa el resto del código: horarios de un sentido y día, y plazas de un bus.
export const getTrips = (dir: Direction, date: string) => tripsCached(dir, date, bucket(TRIPS_TTL_S));
export const getSeats = (trip: Trip, date: string, siblings: string[]) =>
  seatsCached(trip, date, siblings, bucket(SEATS_TTL_S));
