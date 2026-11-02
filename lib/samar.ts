// Horarios e itinerarios desde la página de resultados de samar.es (HTML generado en servidor).

export type Direction = 'ida' | 'vuelta';
export type Stop = { name: string; time: string };
export type Trip = {
  expedition: string;
  line: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: Stop[];
  originCode: string;
  destinationCode: string;
  alerts: string[];
};
export type SearchResult = { trips: Trip[]; notices: string[] };

export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
export const TIMEOUT_MS = 10_000;

const ROUTES: Record<Direction, string> = {
  ida: 'madrid-estacion-sur/talavera-de-la-reina/341/261',
  vuelta: 'talavera-de-la-reina/madrid-estacion-sur/261/341',
};

export function resultsUrl(dir: Direction, date: string): string {
  return `https://www.samar.es/horarios/autobuses/${ROUTES[dir]}?IsOneWay=true&OutboundDate=${date}`;
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function parseResults(html: string): SearchResult {
  const count = html.match(/<span class="badge[^"]*">\s*(\d+) resultados\s*<\/span>/);
  if (!count) throw new Error('Página de samar.es sin contador de resultados');

  // incluye "journey-card journey-card--disabled" (bus sin venta online), excluye "journey-card-list"
  const chunks = html.split(/<div class="journey-card(?=[" ])/).slice(1);
  if (chunks.length !== Number(count[1])) {
    throw new Error(`samar.es anuncia ${count[1]} resultados pero hay ${chunks.length} tarjetas`);
  }

  // avisos de parada: botón en la tarjeta (data-bs-target) → modal en cualquier parte de la página
  const alertText = new Map(
    [...html.matchAll(/<div class="modal fade" id="(stopAlertModal-[\w-]+)"[\s\S]*?<div class="modal-body[^"]*">([\s\S]*?)<\/div>/g)]
      .map((m) => [m[1], text(m[2])]),
  );

  const trips = chunks.map((chunk): Trip => {
    const attrs = Object.fromEntries([...chunk.slice(0, chunk.indexOf('>')).matchAll(/data-([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const stops = [...chunk.matchAll(/itinerary-stop-name[^"]*">([^<]+)<\/span>[\s\S]*?itinerary-stop-time[^"]*">([^<]+)<\/div>/g)]
      .map((m) => ({ name: decodeEntities(m[1]).trim(), time: m[2].trim().replace(/h$/, '') }));
    if (!attrs.expedition || stops.length < 2) throw new Error('Tarjeta de samar.es incompleta (revisar resultados)');
    return {
      expedition: attrs.expedition,
      line: (chunk.match(/<div class="small text-muted mb-2">([^<]+)<\/div>/)?.[1] ?? '').split(' - ')[0].trim(),
      departure: attrs['departure-time'],
      arrival: attrs['arrival-time'],
      duration: (chunk.match(/time-duration">([^<]+)<\/div>/)?.[1] ?? '').trim().replace(/h$/, ''),
      stops,
      originCode: attrs['origin-purchase-code'] ?? '',
      destinationCode: attrs['destination-purchase-code'] ?? '',
      alerts: [...new Set(
        [...chunk.matchAll(/class="btn-stop-alert"[^>]*data-bs-target="#(stopAlertModal-[\w-]+)"/g)]
          .map((m) => alertText.get(m[1]))
          .filter((t): t is string => !!t),
      )],
    };
  });

  const section = html.match(/<section class="trips-notices[\s\S]*?<\/section>/)?.[0] ?? '';
  const notices = [...section.matchAll(/<div class="alert[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => text(m[1])).filter(Boolean);

  return { trips, notices };
}

export async function fetchTrips(dir: Direction, date: string, fetchImpl: typeof fetch = fetch): Promise<SearchResult> {
  const res = await fetchImpl(resultsUrl(dir, date), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 200) throw new Error(`samar.es respondió ${res.status}`);
  return parseResults(await res.text());
}
