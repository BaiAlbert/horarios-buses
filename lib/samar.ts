// Horarios e itinerarios desde la página de resultados de samar.es (HTML generado en servidor).
//
// QUÉ HACE ESTE ARCHIVO
// samar.es no tiene una API pública: para saber qué buses hay un día, se descarga la misma página web
// que vería una persona al buscar en samar.es y se "lee" su HTML con expresiones regulares (regex).
// A esto se le llama "scraping". El resultado es una lista de objetos `Trip` (un bus cada uno).
//
// NOTA SOBRE TYPESCRIPT
// TypeScript es JavaScript con "tipos": anotaciones que dicen qué forma tiene cada dato.
// Los tipos solo sirven para que el editor y el compilador avisen de errores; al ejecutarse desaparecen.
//   - `type X = ...` define un tipo (una "plantilla" de cómo es un dato), no crea ningún valor.
//   - `nombre: string` significa "nombre es un texto".
//   - `'ida' | 'vuelta'` significa "solo puede valer exactamente 'ida' o 'vuelta'".
//   - `Stop[]` significa "una lista (array) de Stop".
//   - `export` hace que otros archivos puedan importar ese valor o tipo.

// Sentido del viaje: 'ida' = Madrid → Talavera, 'vuelta' = Talavera → Madrid.
export type Direction = 'ida' | 'vuelta';
// Una parada del itinerario: su nombre y la hora a la que pasa el bus (p. ej. "08:30").
export type Stop = { name: string; time: string };
// Un bus concreto (en samar.es se llama "expedición").
export type Trip = {
  expedition: string; // identificador único del bus en samar.es (p. ej. "910047")
  line: string; // número de línea (p. ej. "901")
  departure: string; // hora de salida "HH:MM"
  arrival: string; // hora de llegada "HH:MM"
  duration: string; // duración "HH:MM" (p. ej. "01:35")
  stops: Stop[]; // todas las paradas, de la primera a la última
  originCode: string; // código de la parada de origen que usa el sistema de venta (autobusing)
  destinationCode: string; // código de la parada de destino en el sistema de venta
  alerts: string[]; // avisos de alguna parada de este bus (obras, cambios de ubicación...)
};
// Lo que se saca de una página de resultados: los buses y los avisos generales de Samar.
export type SearchResult = { trips: Trip[]; notices: string[] };
// fetchedAt: cuándo se descargó de samar.es (ISO); con datos de la caché es anterior a la petición
// `&` une dos tipos: TripsResponse tiene todo lo de SearchResult y además `fetchedAt`.
// Es exactamente lo que la API /api/trips devuelve al navegador.
export type TripsResponse = SearchResult & { fetchedAt: string };
// Subir al cambiar la forma de Trip/TripsResponse o de SeatsResult (lib/autobusing.ts): la caché de datos de
// Next sobrevive a despliegues y reinicios. 5: plazas de refuerzo (kind 'several').
export const SCHEMA_VERSION = 5;

// Nos presentamos como un navegador Firefox normal: algunas webs rechazan peticiones de "robots".
export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
// Si samar.es tarda más de 10 segundos (10_000 ms; el `_` solo ayuda a leer el número), se abandona.
export const TIMEOUT_MS = 10_000;

// Trozo de la URL de samar.es para cada sentido. 341 y 261 son los identificadores internos de
// "Madrid Estación Sur" y "Talavera de la Reina" en samar.es.
// `Record<Direction, string>` = un objeto con una clave por cada Direction ('ida' y 'vuelta') y valor texto.
const ROUTES: Record<Direction, string> = {
  ida: 'madrid-estacion-sur/talavera-de-la-reina/341/261',
  vuelta: 'talavera-de-la-reina/madrid-estacion-sur/261/341',
};

// Construye la URL de la página de resultados de samar.es para un sentido y una fecha ("2026-11-03").
// Las comillas invertidas `...${x}...` son "template strings": meten el valor de x dentro del texto.
export function resultsUrl(dir: Direction, date: string): string {
  return `https://www.samar.es/horarios/autobuses/${ROUTES[dir]}?IsOneWay=true&OutboundDate=${date}`;
}

// En HTML algunos caracteres se escriben como "entidades": &amp; es "&", &quot; es '"', &#233; es "é"...
const NAMED: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'", nbsp: ' ' };

// Convierte las entidades HTML de un texto en los caracteres reales ("Talavera &amp; Co" → "Talavera & Co").
// Entiende tres formas: &#x41; (número hexadecimal), &#65; (número decimal) y &amp; (nombre).
export function decodeEntities(s: string): string {
  // `replace` con una regex /.../g busca TODAS las coincidencias y llama a la función para cada una.
  // `m` es el texto completo encontrado (p. ej. "&amp;") y `e` lo que hay entre & y ; (p. ej. "amp").
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    // `??` significa "si lo de la izquierda no existe (null/undefined), usa lo de la derecha":
    // si la entidad no está en NAMED, se deja tal cual.
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// Saca el texto "limpio" de un trozo de HTML: quita las etiquetas (<b>, <p>...), decodifica entidades
// y junta los espacios repetidos en uno solo.
const text = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// FUNCIÓN PRINCIPAL DEL SCRAPING: recibe el HTML completo de la página de resultados de samar.es
// y devuelve la lista de buses y los avisos. Si la página no tiene la forma esperada lanza un error
// (`throw`) en vez de devolver datos incompletos: es preferible mostrar "no se pudo consultar"
// que enseñar horarios equivocados.
export function parseResults(html: string): SearchResult {
  // 1) Contador "N resultados" que muestra samar.es. Sirve para comprobar después que no se escapa ningún bus.
  //    `match` devuelve null si no encuentra nada; si encuentra, count[1] es lo que capturó el primer paréntesis.
  const count = html.match(/<span class="badge[^"]*">\s*(\d+) resultados\s*<\/span>/);
  if (!count) throw new Error('Página de samar.es sin contador de resultados');

  // 2) Cada bus es una "tarjeta" <div class="journey-card ...">. Se corta el HTML en trozos por ese
  //    texto; el primer trozo (lo que va antes de la primera tarjeta) se descarta con slice(1).
  // incluye "journey-card journey-card--disabled" (bus sin venta online), excluye "journey-card-list"
  const chunks = html.split(/<div class="journey-card(?=[" ])/).slice(1);
  if (chunks.length !== Number(count[1])) {
    throw new Error(`samar.es anuncia ${count[1]} resultados pero hay ${chunks.length} tarjetas`);
  }

  // 3) Los textos de los avisos de parada no están dentro de la tarjeta sino en ventanas emergentes
  //    ("modales") al final de la página. Se guardan en un Map: id del modal → texto del aviso.
  //    Un Map es como un diccionario: se le pide un valor por su clave con .get(clave).
  // avisos de parada: botón en la tarjeta (data-bs-target) → modal en cualquier parte de la página
  const alertText = new Map(
    // `[...x]` convierte el resultado de matchAll (todas las coincidencias) en un array normal.
    // `.map(fn)` transforma cada elemento del array; aquí cada coincidencia en un par [id, texto].
    [...html.matchAll(/<div class="modal fade" id="(stopAlertModal-[\w-]+)"[\s\S]*?<div class="modal-body[^"]*">([\s\S]*?)<\/div>/g)]
      .map((m) => [m[1], text(m[2])]),
  );

  // 4) Cada trozo de tarjeta se convierte en un objeto Trip.
  const trips = chunks.map((chunk): Trip => {
    // La etiqueta de apertura de la tarjeta lleva datos en atributos data-xxx="..."
    // (data-expedition, data-departure-time...). Se meten en un objeto: { expedition: '910047', ... }.
    const attrs = Object.fromEntries([...chunk.slice(0, chunk.indexOf('>')).matchAll(/data-([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    // Paradas del itinerario: cada una tiene un nombre y una hora ("08:30h"; se le quita la "h" final).
    const stops = [...chunk.matchAll(/itinerary-stop-name[^"]*">([^<]+)<\/span>[\s\S]*?itinerary-stop-time[^"]*">([^<]+)<\/div>/g)]
      .map((m) => ({ name: decodeEntities(m[1]).trim(), time: m[2].trim().replace(/h$/, '') }));
    // Un bus sin identificador o con menos de 2 paradas (origen y destino) significa que samar.es cambió su HTML.
    if (!attrs.expedition || stops.length < 2) throw new Error('Tarjeta de samar.es incompleta (revisar resultados)');
    return {
      expedition: attrs.expedition,
      // El texto es tipo "901 - Madrid - Talavera": nos quedamos con lo de antes del primer " - ".
      // `?.` (encadenamiento opcional): si match devuelve null, no falla y da undefined; luego `??` pone ''.
      line: (chunk.match(/<div class="small text-muted mb-2">([^<]+)<\/div>/)?.[1] ?? '').split(' - ')[0].trim(),
      departure: attrs['departure-time'],
      arrival: attrs['arrival-time'],
      duration: (chunk.match(/time-duration">([^<]+)<\/div>/)?.[1] ?? '').trim().replace(/h$/, ''),
      stops,
      originCode: attrs['origin-purchase-code'] ?? '',
      destinationCode: attrs['destination-purchase-code'] ?? '',
      // Botones de aviso de la tarjeta → se busca su texto en el Map del paso 3.
      // `new Set(...)` elimina duplicados (dos paradas pueden apuntar al mismo aviso) y `[...]` lo vuelve array.
      alerts: [...new Set(
        [...chunk.matchAll(/class="btn-stop-alert"[^>]*data-bs-target="#(stopAlertModal-[\w-]+)"/g)]
          .map((m) => alertText.get(m[1]))
          // `.filter` se queda solo con los elementos que cumplen la condición (aquí: los que tienen texto).
          // `(t): t is string` es solo para TypeScript: le dice que tras el filtro ya no hay undefined.
          .filter((t): t is string => !!t),
      )],
    };
  });

  // 5) Avisos generales de Samar (no de un bus concreto), en la sección "trips-notices" de la página.
  const section = html.match(/<section class="trips-notices[\s\S]*?<\/section>/)?.[0] ?? '';
  const notices = [...section.matchAll(/<div class="alert[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => text(m[1])).filter(Boolean);

  return { trips, notices };
}

// Descarga la página de samar.es y la convierte en datos con parseResults.
// `async` marca una función asíncrona: tarda (va por internet) y devuelve una Promise ("promesa"
// de un valor futuro). Dentro, `await` espera a que llegue la respuesta antes de seguir.
// `fetchImpl` permite que los tests pasen un `fetch` falso y no dependan de internet; por defecto es el real.
export async function fetchTrips(dir: Direction, date: string, fetchImpl: typeof fetch = fetch): Promise<TripsResponse> {
  const res = await fetchImpl(resultsUrl(dir, date), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS), // cancela la petición si pasa el tiempo máximo
  });
  // 200 = "OK" en HTTP. Cualquier otro código (404, 500...) se trata como fallo.
  if (res.status !== 200) throw new Error(`samar.es respondió ${res.status}`);
  // `...obj` ("spread") copia todas las propiedades de obj en el objeto nuevo: { trips, notices, fetchedAt }.
  return { ...parseResults(await res.text()), fetchedAt: new Date().toISOString() };
}
