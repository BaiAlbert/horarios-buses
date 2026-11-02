import { unstable_cache } from 'next/cache';
import { fetchTrips, type Direction, type Trip } from './samar.ts';
import { fetchSeats } from './autobusing.ts';

export const TRIPS_TTL_S = 3600;
export const SEATS_TTL_S = 300;

// unstable_cache sirve datos caducados mientras renueva en segundo plano; meter la franja horaria
// en la clave garantiza que nunca se muestran datos más viejos que el TTL.
export const bucket = (ttlSeconds: number, now = Date.now()) => Math.floor(now / (ttlSeconds * 1000));

const tripsCached = unstable_cache(
  (dir: Direction, date: string, _bucket: number) => fetchTrips(dir, date),
  ['trips-v1'],
  { revalidate: TRIPS_TTL_S },
);

const seatsCached = unstable_cache(
  (trip: Trip, date: string, allowDepartureOnly: boolean, _bucket: number) => fetchSeats(trip, date, { allowDepartureOnly }),
  ['seats-v3'],
  { revalidate: SEATS_TTL_S },
);

export const getTrips = (dir: Direction, date: string) => tripsCached(dir, date, bucket(TRIPS_TTL_S));
export const getSeats = (trip: Trip, date: string, allowDepartureOnly: boolean) =>
  seatsCached(trip, date, allowDepartureOnly, bucket(SEATS_TTL_S));
