# Web de horarios Samar: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** una web protegida por contraseña que, al buscar, muestra los buses de samar.es de Madrid Estación Sur ↔ Talavera para una fecha. Cada bus lleva su itinerario, número de paradas, etiquetas «Directo» y «Santa Olalla», y un botón para ver sus plazas en autobusing.

**Arquitectura:**
- Next.js App Router.
- Dos rutas de servidor:
  - `/api/trips`: descarga y analiza el HTML de samar.es, con caché de 1 h.
  - `/api/seats`: hace 5 peticiones con sesión a autobusing, con caché de 5 min.
- Una página cliente que las consume.
- Lógica pura en `lib/`, probada con `node --test` contra fixtures HTML reales.
- Acceso con una cookie HMAC que valida `proxy.ts`.

**Stack:** Next.js 16.4.x, React 19.3.x, TypeScript, CSS propio. Tests con el runner nativo de Node 26 (`node --test`, ejecuta `.ts` sin compilar). No se añaden más dependencias.

**Spec:** `docs/superpowers/specs/2026-11-02-web-horarios-design.md`. La base técnica está en `docs/investigacion-samar.md`.

## Restricciones globales

- **Dependencias:** solo `next`, `react`, `react-dom`, `typescript`, `@types/react`, `@types/react-dom` y `@types/node`. Sin Tailwind, sin librería de componentes, sin Vitest ni Jest y sin parser HTML: se usan expresiones regulares, como en `scripts/parse_resultados.py`.
- **Importaciones:** los imports relativos entre ficheros `.ts` de `lib/` llevan la extensión `.ts`, porque `node --test` no resuelve sin ella. `tsconfig.json` lleva `"allowImportingTsExtensions": true`.
- **Textos:** la interfaz, en español. Los identificadores de código, en inglés.
- **Zona horaria:** «hoy» se calcula en `Europe/Madrid`.
- **Fechas permitidas:** desde hoy hasta hoy + 60 días, en formato `YYYY-MM-DD`.
- **Cachés:** horarios con `revalidate: 3600` y plazas con `revalidate: 300`. Los errores lanzados no se cachean.
- **Peticiones salientes:**
  - `User-Agent` = `Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0`.
  - Timeout por petición de 10 000 ms (`AbortSignal.timeout`).
  - `maxDuration = 30` en las dos rutas de API.
- **Peticiones reales durante el desarrollo:** como máximo unas 50 a samar.es y unas 50 a autobusing, con al menos 2 s entre cada una. Hay que llevar la cuenta en el informe de cada tarea. Los tests nunca hacen peticiones reales.
- **autobusing:** nunca enviar `POST /venta/plazas` ni ningún paso posterior.
- **Plazas:** si no se puede asegurar el bus, el resultado es `{ ok: false, reason }`. Nunca se muestra un número sin validar.
- **Acceso:**
  - contraseña en la variable de entorno `APP_PASSWORD`;
  - cookie `hb_session` con `httpOnly`, `secure` en producción, `sameSite: 'lax'` y 30 días de vida;
  - si `APP_PASSWORD` no está definida, se deniega todo.
- **Indexación:** `noindex` por tres vías: metadata, cabecera `X-Robots-Tag: noindex, nofollow` y `robots.txt` con `Disallow: /`.
- **Región de Vercel:** `cdg1`, en `vercel.json`.
- **Commits:** terminan con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Puntos a vigilar en la revisión

1. **Cambio de día en España.** Entre las 00:00 y la 01:00 o las 02:00 en España, el servidor (en UTC) sigue en el día anterior. `todayMadrid(new Date('2026-11-02T23:30:00Z'))` debe dar `'2026-11-03'`. Test en la Tarea 3.
2. **Samar cambia el HTML.** Si el número de tarjetas no coincide con «N resultados», hay que lanzar un error y no mostrar una lista incompleta ni cachearla. Test en la Tarea 2.
3. **Bus de samar.es que no existe en autobusing** (por ejemplo la 910 de las 20:15 → 22:00 del 03/11, cuando autobusing tiene la de las 20:15 → 22:10): tiene que dar `ok: false`, no las plazas del otro bus. Test en la Tarea 4.
4. **Contraseña cambiada.** Una cookie generada con la contraseña antigua tiene que dejar de valer. Test en la Tarea 5.
5. **Buses que pasan de medianoche** (por ejemplo 23:45 → 01:40). Se emparejan bien en autobusing y en la página de plazas se valida la fecha de la búsqueda. Test en la Tarea 4.

---

## Estructura de ficheros

```
package.json, tsconfig.json, next.config.ts, vercel.json, .gitignore, .env.example, README.md
proxy.ts                      # control de acceso (Next 16: proxy, no middleware)
lib/samar.ts                  # tipos Trip/Stop, URL, parser y fetch de samar.es
lib/rules.ts                  # reglas puras: directo, Santa Olalla, ambigüedad, paso, fechas
lib/autobusing.ts             # parsers y flujo de 5 peticiones para las plazas
lib/auth.ts                   # token HMAC y validación de sesión
lib/cache.ts                  # getTrips / getSeats con unstable_cache
app/layout.tsx, app/globals.css, app/robots.ts
app/page.tsx                  # monta <SearchApp/>
app/SearchApp.tsx             # cliente: trayecto, fecha, buscar, avisos, interruptor y lista
app/TripCard.tsx              # cliente: tarjeta y botón de plazas
app/login/page.tsx, app/login/actions.ts
app/api/trips/route.ts, app/api/seats/route.ts
tests/*.test.ts, tests/fixtures/*.html
```

---

### Tarea 1: Proyecto Next.js, configuración y fixtures

**Ficheros:**
- Crear: `package.json`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx` (provisional), `app/globals.css` (vacío), `app/robots.ts`.
- Crear: `tests/fixtures/` (copias de las respuestas de la investigación).

**Interfaces:**
- Produce:
  - `npm run dev`, `npm run build` y `npm test` (= `node --test tests/*.test.ts`).
  - Fixtures en `tests/fixtures/`:
    - `samar-ida-2026-11-03.html` (46 resultados)
    - `samar-vuelta-2026-11-06.html` (48 resultados)
    - `samar-vacio.html` (0 resultados)
    - `ab-inicio.html`
    - `ab-horarios-ida-2026-11-03.html`
    - `ab-plazas-1000.html` (36 libres, 14 ocupadas)
    - `ab-plazas-0730.html` (31 libres, 19 ocupadas)

- [ ] **Paso 1: `git init` y `.gitignore`**

```bash
cd /home/baialbert/Coding/horarios-buses && git init
printf 'node_modules/\n.next/\n.env*\n!.env.example\n.superpowers/\n.playwright-mcp/\n.vercel/\nnext-env.d.ts\n*.tsbuildinfo\n' > .gitignore
```

- [ ] **Paso 2: escribir `package.json` e instalar dependencias**

`package.json`:
- `"private": true`
- `"type": "module"`
- scripts:
  - `"dev": "next dev"`
  - `"build": "next build"`
  - `"start": "next start"`
  - `"test": "node --test tests/*.test.ts"`
  - `"typecheck": "tsc --noEmit"`

Después:

```bash
npm install next@16.4 react@19.3 react-dom@19.3
npm install -D typescript @types/react @types/react-dom @types/node
```

- [ ] **Paso 3: configuración**

- `tsconfig.json`: el estándar de Next (`strict`, `noEmit`, `moduleResolution: "bundler"`, `jsx: "preserve"`, plugin `next`, `paths` `@/*`) más `"allowImportingTsExtensions": true`.
- `next.config.ts`: `headers()` que devuelve `[{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]`.
- `vercel.json`: `{"regions":["cdg1"]}`.
- `.env.example`: `APP_PASSWORD=cambia-esto`.
- `app/layout.tsx`: `<html lang="es">` y `export const metadata = { title: 'Buses Madrid ↔ Talavera', robots: { index: false, follow: false } }`. Importa `./globals.css`.
- `app/robots.ts`: devuelve `{ rules: { userAgent: '*', disallow: '/' } }`.
- `app/page.tsx` provisional: `<main>Horarios</main>`.

- [ ] **Paso 4: copiar las fixtures y tapar los tokens**

```bash
S=/tmp/claude-1000/-home-baialbert-Coding-horarios-buses/f54626e2-3442-472d-a85b-b271d69abf72/scratchpad
mkdir -p tests/fixtures
cp $S/samar/r1.html tests/fixtures/samar-ida-2026-11-03.html
cp $S/samar/r2.html tests/fixtures/samar-vuelta-2026-11-06.html
cp $S/samar/r3.html tests/fixtures/samar-vacio.html
cp $S/autobusing/inicio.html tests/fixtures/ab-inicio.html
cp $S/autobusing/horarios.html tests/fixtures/ab-horarios-ida-2026-11-03.html
cp $S/autobusing/plazas.html tests/fixtures/ab-plazas-1000.html
cp $S/autobusing/plazas2.html tests/fixtures/ab-plazas-0730.html
sed -i -E 's/(name="__RequestVerificationToken" type="hidden" value=")[^"]*/\1REDACTED/' tests/fixtures/samar-*.html
grep -c 'CfDJ8' tests/fixtures/*.html   # todas deben dar 0
```

Si el directorio temporal ya no existe, se vuelven a descargar con los comandos curl de `docs/investigacion-samar.md`, y esas peticiones cuentan para el límite.

- [ ] **Paso 5: comprobar**

- `npm run build`: compila sin errores.
- `node -e "import('next/cache').then(m=>console.log(typeof m.unstable_cache))"`: imprime `function`. Si no, se avisa: la Tarea 6 usaría `'use cache'` + `cacheLife`.
- `curl -sI localhost:3000` con `npm run dev` arrancado: incluye `x-robots-tag: noindex, nofollow`.

- [ ] **Paso 6: commit**

```bash
git add -A && git commit -m "chore: proyecto Next.js con noindex, región cdg1 y fixtures"
```

---

### Tarea 2: Parser y descarga de samar.es

**Ficheros:**
- Crear: `lib/samar.ts`
- Test: `tests/samar.test.ts`

**Interfaces:**
- Produce:
  - `export type Direction = 'ida' | 'vuelta'`
  - `export type Stop = { name: string; time: string }`. `time` es `HH:MM`, sin la `h`.
  - `export type Trip = { expedition: string; line: string; departure: string; arrival: string; duration: string; stops: Stop[]; originCode: string; destinationCode: string }`. `duration` es `"01:20"`, sin la `h`. `originCode` y `destinationCode` vienen de `data-origin-purchase-code` y `data-destination-purchase-code`.
  - `export type SearchResult = { trips: Trip[]; notices: string[] }`
  - `export const USER_AGENT: string` y `export const TIMEOUT_MS = 10_000`
  - `export function resultsUrl(dir: Direction, date: string): string`
  - `export function parseResults(html: string): SearchResult`. Lanza `Error` si el número de tarjetas no coincide con `<span class="badge …">N resultados</span>`, si falta ese contador, si una tarjeta no tiene `data-expedition` o si tiene menos de 2 paradas.
  - `export async function fetchTrips(dir: Direction, date: string, fetchImpl: typeof fetch = fetch): Promise<SearchResult>`. Lanza un error si el estado HTTP no es 200.

- [ ] **Paso 1: tests que fallan**

```ts
import { test } from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { parseResults, resultsUrl, fetchTrips } from '../lib/samar.ts';
const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('resultsUrl ida y vuelta', () => {
  assert.equal(resultsUrl('ida', '2026-11-03'), 'https://www.samar.es/horarios/autobuses/madrid-estacion-sur/talavera-de-la-reina/341/261?IsOneWay=true&OutboundDate=2026-11-03');
  assert.equal(resultsUrl('vuelta', '2026-11-06'), 'https://www.samar.es/horarios/autobuses/talavera-de-la-reina/madrid-estacion-sur/261/341?IsOneWay=true&OutboundDate=2026-11-06');
});
test('parseResults ida 03/11: 46 buses con itinerario', () => {
  const { trips, notices } = parseResults(fx('samar-ida-2026-11-03.html'));
  assert.equal(trips.length, 46);
  assert.deepEqual(trips[0], { expedition: '910047', line: '910', departure: '00:30', arrival: '02:05', duration: '01:35',
    originCode: '0108', destinationCode: '0831',
    stops: [{ name: 'Madrid-Estacion Sur', time: '00:30' }, { name: 'Valmojado', time: '01:15' }, { name: 'Santa Cruz del Retamar', time: '01:25' }, { name: 'Santa Olalla', time: '01:35' }, { name: 'Talavera de La Reina', time: '02:05' }] });
  assert.equal(notices.length, 2);
  assert.match(notices[1], /^LOS DÍAS 1 Y 2 DE NOVIEMBRE/);   // entidades HTML decodificadas (&#xCD; → Í)
});
test('parseResults vuelta 06/11: 48 buses', () => assert.equal(parseResults(fx('samar-vuelta-2026-11-06.html')).trips.length, 48));
test('parseResults sin servicio: 0 buses, sin error', () => assert.equal(parseResults(fx('samar-vacio.html')).trips.length, 0));
test('parseResults lanza error si falta una tarjeta', () => {
  const html = fx('samar-ida-2026-11-03.html').replace('<div class="journey-card"', '<div class="xjourney"');
  assert.throws(() => parseResults(html), /resultados/);
});
test('fetchTrips manda User-Agent y lanza error si no es 200', async () => {
  let ua = '';
  const ok = (async (_u: string, init: RequestInit) => { ua = new Headers(init.headers).get('user-agent')!; return new Response(fx('samar-vacio.html')); }) as typeof fetch;
  assert.equal((await fetchTrips('ida', '2026-11-03', ok)).trips.length, 0);
  assert.match(ua, /Firefox/);
  const bad = (async () => new Response('x', { status: 503 })) as typeof fetch;
  await assert.rejects(fetchTrips('ida', '2026-11-03', bad));
});
```

- [ ] **Paso 2:** `npm test`. Debe FALLAR (`lib/samar.ts` no existe).
- [ ] **Paso 3: implementar `lib/samar.ts`**

Se replica la lógica de `scripts/parse_resultados.py`:
- **Tarjetas:** se separan por `<div class="journey-card"`. Los atributos se leen solo de la etiqueta de apertura.
- **Línea:** `<div class="small text-muted mb-2">909 - 909</div>`; se toma lo que hay antes de ` - `.
- **Paradas:** `itinerary-stop-name` + `itinerary-stop-time`.
- **Avisos:** los `div class="alert …"` dentro de `<section class="trips-notices`. Se quitan las etiquetas, se decodifican las entidades `&#xNN;`, `&#NN;`, `&amp;`, `&quot;`, `&lt;` y `&gt;`, y se recortan los espacios.
- **Entidades:** los nombres de parada también se decodifican.

- [ ] **Paso 4:** `npm test`. Deben PASAR los 6 tests.
- [ ] **Paso 5: commit:** `feat: parser y fetch de resultados de samar.es`

---

### Tarea 3: Reglas de negocio y fechas

**Ficheros:**
- Crear: `lib/rules.ts`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Usa: `Trip` y `Direction` de `lib/samar.ts`.
- Produce:
  - `export const PASS_THROUGH_LINES: readonly string[] = ['901','902','903','904','905']`. Con un comentario de una línea: «quitar para fiarse de que autobusing da las plazas del tramo».
  - `export function isDirect(t: Trip): boolean`: `stops.length === 2`.
  - `export type TripKind = 'directo' | 'ruta-santa-olalla' | 'ruta'`
  - `export function tripKind(t: Trip): TripKind`. Indicación del usuario: hay tres tipos, directo (2 paradas), ruta que pasa por Santa Olalla y ruta que no pasa (por ejemplo Talavera > Móstoles > Alcorcón > Madrid).
  - `export const KIND_LABEL: Record<TripKind, string> = { directo: 'Directo', 'ruta-santa-olalla': 'Ruta · Santa Olalla', ruta: 'Ruta · sin Santa Olalla' }`
  - `export function stopsAtSantaOlalla(t: Trip): boolean`: compara sin tildes ni mayúsculas con `'santa olalla'`.
  - `export function passesThrough(t: Trip): boolean`
  - `export function isAmbiguous(t: Trip, all: Trip[]): boolean`: otro bus con la misma `departure` **y** `arrival`.
  - `export function todayMadrid(now?: Date): string`: `YYYY-MM-DD` con `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })`.
  - `export function isAllowedDate(date: string, now?: Date): boolean`
  - `export function parseDirection(v: string | null): Direction | null`

- [ ] **Paso 1: tests que fallan**

```ts
// usa parseResults(fixture ida) para obtener trips reales
test('isDirect y Santa Olalla', () => {
  const t = (exp: string) => trips.find(x => x.expedition === exp)!;
  assert.equal(isDirect(t('909003')), true);  assert.equal(stopsAtSantaOlalla(t('909003')), false);  // 10:00 directo
  assert.equal(isDirect(t('909001')), false); assert.equal(stopsAtSantaOlalla(t('909001')), true);   // 07:00 Quismondo, Santa Olalla
  assert.equal(stopsAtSantaOlalla({ ...t('909003'), stops: [{ name: 'SANTA OLALLA', time: '00:00' }] }), true);
});
test('tripKind: tres tipos', () => {
  const t = (exp: string) => trips.find(x => x.expedition === exp)!;
  assert.equal(tripKind(t('909003')), 'directo');            // 10:00 Estación Sur > Talavera
  assert.equal(tripKind(t('910001')), 'ruta-santa-olalla');  // 07:30, 13 paradas con Santa Olalla
  assert.equal(tripKind(t('901001')), 'ruta');               // 08:00 Alcorcón, Móstoles
  assert.equal(tripKind(t('907001')), 'ruta');               // 07:15 por Torrijos
});
test('isAmbiguous: 901/902/903 de las 08:00 sí; 909 de las 10:00 no', () => {
  assert.equal(isAmbiguous(trips.find(x => x.expedition === '901001')!, trips), true);
  assert.equal(isAmbiguous(trips.find(x => x.expedition === '909003')!, trips), false);
});
test('passesThrough solo para 901-905', () => {
  assert.equal(passesThrough(trips.find(x => x.line === '904')!), true);
  assert.equal(passesThrough(trips.find(x => x.line === '909')!), false);
});
test('todayMadrid usa la hora de España', () => {
  assert.equal(todayMadrid(new Date('2026-11-02T23:30:00Z')), '2026-11-03');
  assert.equal(todayMadrid(new Date('2026-11-02T22:30:00Z')), '2026-11-02');
});
test('isAllowedDate: de hoy a hoy+60', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(isAllowedDate('2026-11-02', now), true);
  assert.equal(isAllowedDate('2027-01-01', now), true);    // +60
  assert.equal(isAllowedDate('2027-01-02', now), false);   // +61
  assert.equal(isAllowedDate('2026-11-01', now), false);
  for (const bad of ['2026-13-01', '2026-11-3', 'mañana', '']) assert.equal(isAllowedDate(bad, now), false);
});
test('parseDirection', () => { assert.equal(parseDirection('ida'), 'ida'); assert.equal(parseDirection('x'), null); assert.equal(parseDirection(null), null); });
```

- [ ] **Paso 2:** `npm test`. Debe FALLAR.
- [ ] **Paso 3: implementar `lib/rules.ts`** con las firmas de arriba. `isAllowedDate` compara cadenas `YYYY-MM-DD`: el límite superior se calcula sumando 60 días a la fecha de hoy en Madrid, en UTC, para evitar líos con el cambio de hora. También rechaza fechas que no existen haciendo el viaje de ida y vuelta con `Date`.
- [ ] **Paso 4:** `npm test`. Deben PASAR.
- [ ] **Paso 5: commit:** `feat: reglas de etiquetas, ambigüedad y fechas`

---

### Tarea 4: Plazas en autobusing

**Ficheros:**
- Crear: `lib/autobusing.ts`
- Test: `tests/autobusing.test.ts`

**Interfaces:**
- Usa: `Trip`, `USER_AGENT` y `TIMEOUT_MS` de `lib/samar.ts`.
- Produce:
  - `export type Seats = { free: number; occupied: number; total: number; checkedAt: string }`. `checkedAt` es un ISO.
  - `export type SeatsResult = { ok: true; seats: Seats } | { ok: false; reason: string }`
  - `export function parseOrigenId(html: string): string | null`: `input#venta_origen_id`, `value`.
  - `export function parseSchedule(html: string): { departure: string; arrival: string; nromov: string }[]`. Cada fila es `<tr><td class="radio"><input … value="NROMOV"/></td><td><strong>HH:MM</strong></td><td><strong>HH:MM</strong></td>…`.
  - `export function parseSeatMap(html: string): { when: string | null; free: number; occupied: number; total: number }`. `when` viene de `<p class="campo">Ida</p><p class="valor">03/11/2026 10:00</p>`. Los asientos son `<span id="asiento_N" class="asiento … ESTADO">`; `free` cuenta `libre` y `occupied` el resto.
  - `export async function fetchSeats(trip: Trip, date: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<SeatsResult>`

**Flujo de `fetchSeats`.** Base: `https://regular.autobusing.es`. La cookie se lleva a mano: se guarda `name=value` de `res.headers.getSetCookie()` y se reenvía en `Cookie` en cada petición. Todas las peticiones llevan `User-Agent` y el timeout.

1. `GET /venta/inicio_info?empresa=samar&origen_codigo={originCode}&destino_codigo={destinationCode}&hora_ida={departure}&fecha_ida={date}`. Si no se obtiene `origen_id`, se devuelve `ok:false` con «autobusing no reconoce el trayecto».
2. `POST /venta/inicio` con `redirect: 'manual'` y un cuerpo `URLSearchParams` con los campos del spec. Las fechas van en `DD/MM/AAAA`.
3. `GET /venta/horarios`, y se filtran las filas con `departure` y `arrival` iguales a las del bus. Si no hay exactamente una, `ok:false` con «No encontrado en autobusing».
4. `POST /venta/horarios` con `redirect: 'manual'` y el cuerpo `venta[elegir_plazas_ida]=t&venta[nromov_ida]={nromov}`.
5. `GET /venta/plazas`. Si `when !== 'DD/MM/AAAA HH:MM'` del bus, o `total === 0`, `ok:false` con «La respuesta no corresponde al bus».

Si `ok:true`, se devuelve `checkedAt = now().toISOString()`. Los errores de red o de estado HTTP (distinto de 200 en los GET y de 200/302 en los POST) se **lanzan** para que no se cacheen.

- [ ] **Paso 1: tests que fallan**

```ts
test('parsers sobre fixtures reales', () => {
  assert.equal(parseOrigenId(fx('ab-inicio.html')), '287');
  const rows = parseSchedule(fx('ab-horarios-ida-2026-11-03.html'));
  assert.equal(rows.length, 41);
  assert.deepEqual(rows[0], { departure: '00:30', arrival: '02:05', nromov: '4184920' });
  assert.ok(rows.some(r => r.departure === '23:45' && r.arrival === '01:40'));
  assert.deepEqual(parseSeatMap(fx('ab-plazas-1000.html')), { when: '03/11/2026 10:00', free: 36, occupied: 14, total: 50 });
  assert.deepEqual(parseSeatMap(fx('ab-plazas-0730.html')), { when: '03/11/2026 07:30', free: 31, occupied: 19, total: 50 });
});
// fakeFetch(map): según método + ruta devuelve una fixture; registra las llamadas; pone set-cookie 'rack.session=abc; path=/; HttpOnly' en inicio_info
test('fetchSeats 07:30 (910001): 5 peticiones, nromov correcto y cookie reenviada', async () => {
  const r = await fetchSeats(trip0730, '2026-11-03', fake, () => new Date('2026-11-02T21:00:00Z'));
  assert.deepEqual(r, { ok: true, seats: { free: 31, occupied: 19, total: 50, checkedAt: '2026-11-02T21:00:00.000Z' } });
  assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), ['GET /venta/inicio_info', 'POST /venta/inicio', 'GET /venta/horarios', 'POST /venta/horarios', 'GET /venta/plazas']);
  assert.match(calls[3].body, /venta%5Bnromov_ida%5D=4119481/);
  assert.ok(calls.slice(1).every(c => c.cookie === 'rack.session=abc'));
  assert.ok(!calls.some(c => c.method === 'POST' && c.path === '/venta/plazas'));
});
test('fetchSeats: bus de samar.es sin pareja en autobusing (910 20:15→22:00) → ok:false', async () => {
  const r = await fetchSeats({ ...trip0730, departure: '20:15', arrival: '22:00' }, '2026-11-03', fake);
  assert.equal(r.ok, false);
});
test('fetchSeats: la página de plazas es de otra hora → ok:false', async () => {
  // fake que devuelve ab-plazas-1000.html (10:00) para el bus de las 07:30
  assert.equal((await fetchSeats(trip0730, '2026-11-03', fakeWrongPlazas)).ok, false);
});
test('fetchSeats lanza error si autobusing devuelve 500', async () => { await assert.rejects(fetchSeats(trip0730, '2026-11-03', fake500)); });
```

`trip0730` se saca de `parseResults(fixture ida)` por `expedition === '910001'`: salida 07:30, llegada 09:25 y códigos `0108`/`0831`.

- [ ] **Paso 2:** `npm test`. Debe FALLAR.
- [ ] **Paso 3: implementar `lib/autobusing.ts`** según las interfaces y el flujo de arriba.
- [ ] **Paso 4:** `npm test`. Deben PASAR.
- [ ] **Paso 5: comprobación real**, en un script desechable del directorio temporal, **no** en el repo. Como máximo 15 peticiones a autobusing, con 2 s entre cada una.
  - **(a)** `fetchSeats` de la 909 de las 10:00 del día de mañana. Debe dar `ok:true` y `total` mayor que 0.
  - **(b)** Un bus de samar.es cuya hora no esté en autobusing. Debe dar `ok:false` sin lanzar error, y hay que anotar qué responde `POST /venta/inicio` (`302` → ¿adónde?).
  - Si (b) lanza un error porque el POST no devuelve 200/302, se ajusta el flujo para que dé `ok:false` y se añade un test con esa respuesta guardada como fixture.
- [ ] **Paso 6: commit:** `feat: consulta de plazas en autobusing con validación de salida/llegada`

---

### Tarea 5: Acceso con contraseña

**Ficheros:**
- Crear: `lib/auth.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produce:
  - `export const SESSION_COOKIE = 'hb_session'`
  - `export async function sessionToken(password: string): Promise<string>`: HMAC-SHA256 en hexadecimal con `crypto.subtle`, clave = `password` y mensaje = `'horarios-buses-session-v1'`.
  - `export async function isValidSession(cookie: string | undefined, password: string | undefined): Promise<boolean>`: `false` si alguno de los dos falta. Compara en tiempo constante.
  - `proxy.ts` exporta `async function proxy(request: NextRequest)` y `config.matcher = ['/((?!_next/static|_next/image|favicon.ico|robots.txt|login).*)']`.
    - Sin sesión válida, las rutas `/api/*` devuelven `401` con JSON `{error:'No autorizado'}`.
    - El resto redirige a `/login`.
  - Server action `login(formData)`:
    - Si la contraseña coincide con `APP_PASSWORD`, pone la cookie y redirige a `/`.
    - Si no, devuelve `{ error: 'Contraseña incorrecta' }`.
    - Si `APP_PASSWORD` no está definida: `{ error: 'Falta configurar APP_PASSWORD' }`.

- [ ] **Paso 1: tests que fallan**

```ts
test('la sesión vale con la contraseña actual y deja de valer al cambiarla', async () => {
  const tok = await sessionToken('vieja');
  assert.equal(await isValidSession(tok, 'vieja'), true);
  assert.equal(await isValidSession(tok, 'nueva'), false);
});
test('sin cookie o sin APP_PASSWORD → false', async () => {
  assert.equal(await isValidSession(undefined, 'x'), false);
  assert.equal(await isValidSession(await sessionToken('x'), undefined), false);
  assert.equal(await isValidSession('basura', 'x'), false);
});
```

- [ ] **Paso 2:** `npm test`. Debe FALLAR.
- [ ] **Paso 3: implementar `lib/auth.ts`, `proxy.ts` y la página de login.** La página tiene un formulario con `<label>Contraseña</label>`, un `input type="password"` y el botón «Entrar», y usa `useActionState`. La cookie: `httpOnly`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `maxAge: 60*60*24*30` y `path: '/'`.
- [ ] **Paso 4:** `npm test`. Deben PASAR.
- [ ] **Paso 5: comprobación manual** con `APP_PASSWORD=prueba npm run dev`:
  - `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' localhost:3000/` → `307 …/login`.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/trips` → `401`.
  - Entrando con «prueba» desde el navegador se llega a `/`.
- [ ] **Paso 6: commit:** `feat: acceso con contraseña compartida (APP_PASSWORD)`

---

### Tarea 6: Rutas de API con caché

**Ficheros:**
- Crear: `lib/cache.ts`, `app/api/trips/route.ts`, `app/api/seats/route.ts`

**Interfaces:**
- Usa: `fetchTrips` (Tarea 2), `fetchSeats` (Tarea 4), y `isAllowedDate`, `parseDirection`, `isAmbiguous` y `passesThrough` (Tarea 3).
- Produce:
  - `lib/cache.ts`:
    - `export const getTrips = unstable_cache((dir: Direction, date: string) => fetchTrips(dir, date), ['trips-v1'], { revalidate: 3600 })`
    - `export const getSeats` con la clave `['seats-v1']` y `revalidate: 300`. Recibe `(dir, date, expedition)`, vuelve a obtener el bus con `getTrips` y llama a `fetchSeats`.
  - `GET /api/trips?dir=ida|vuelta&date=YYYY-MM-DD`:
    - `200 SearchResult`;
    - `400 {error:'Parámetros no válidos'}`;
    - `502 {error:'No se pudo consultar Samar'}`.
  - `GET /api/seats?dir=…&date=…&exp=…`:
    - `200 SeatsResult & { passThrough: boolean }`;
    - `400` con parámetros no válidos;
    - `404 {error:'Bus no encontrado'}` si `exp` no está en los horarios de ese día;
    - `200 {ok:false, reason:'Varios buses salen y llegan a la misma hora', passThrough}` si el bus es ambiguo, sin consultar autobusing;
    - `502 {error:'No se pudo consultar autobusing'}` si se lanza un error.
  - Las dos rutas: `export const maxDuration = 30`. Los códigos y horas de autobusing **salen siempre** de `getTrips`, nunca de la query.

- [ ] **Paso 1: implementar** `lib/cache.ts` y las dos rutas.
- [ ] **Paso 2: comprobación real** con `APP_PASSWORD=prueba npm run dev` y la cookie del navegador (copiada en `-b`). Como máximo 4 peticiones a samar.es y 10 a autobusing.
  - `curl /api/trips?dir=ida&date=<mañana>` dos veces seguidas. La segunda responde en menos de 100 ms (caché) y en el log del servidor no sale una segunda petición a samar.es.
  - `curl '/api/trips?dir=ida&date=2020-01-01'` → `400`.
  - `curl '/api/seats?dir=ida&date=<mañana>&exp=999999'` → `404`.
  - `curl '/api/seats?dir=ida&date=<mañana>&exp=901001'` (si existe ese día) → `ok:false`, ambiguo, y sin peticiones a autobusing en el log.
  - `curl '/api/seats?…&exp=<una 909 directa>'` → `ok:true`.
- [ ] **Paso 3:** `npm run build` y `npm test` sin errores.
- [ ] **Paso 4: commit:** `feat: API de horarios y plazas con caché`

---

### Tarea 7: Interfaz (tarjetas B), README y comprobación final

**Ficheros:**
- Crear: `app/SearchApp.tsx`, `app/TripCard.tsx`, `README.md`
- Modificar: `app/page.tsx` (monta `<SearchApp />`), `app/globals.css`

**Interfaces:**
- Usa: `GET /api/trips` y `GET /api/seats` (Tarea 6), y `isDirect`, `stopsAtSantaOlalla` y `todayMadrid` de `lib/rules.ts`, que se pueden importar en el cliente porque son puros.
- Produce: la página final.

**Textos fijos:**
- **Botones de trayecto:** «Madrid Estación Sur → Talavera» (`ida`) y «Talavera → Madrid Estación Sur» (`vuelta`), con `aria-pressed`.
- **Fecha:** `<input type="date">`, con `min` = hoy, `max` = hoy + 60 y hoy por defecto.
- **Botón de búsqueda:** «Buscar buses».
- **Interruptor:** «Ocultar itinerarios», un checkbox recordado en `localStorage` dentro de `try/catch`.
- **Tarjeta:** `HH:MM → HH:MM` en grande, «Línea 909», la duración en formato «1h20» y «N paradas».
  - Una etiqueta de tipo con `KIND_LABEL[tripKind(t)]`: «Directo», «Ruta · Santa Olalla» o «Ruta · sin Santa Olalla». Cada tipo con un estilo distinto, pero el texto basta por sí solo.
  - Itinerario como `<ol>` con «HH:MM Nombre».
- **Plazas:**
  - botón «Ver plazas libres» (deshabilitado mientras carga, con el texto «Consultando…»);
  - resultado: «**31 libres** · 19 ocupadas · 50 totales (consultado HH:MM)», con la hora de `checkedAt` en hora de Madrid;
  - si `passThrough`, añadir: «Este bus continúa más allá de tu trayecto; las plazas podrían referirse a todo el recorrido.»;
  - si `ok:false`: «Plazas no disponibles», con `reason` en el `title`;
  - si hay error: «No se pudo consultar» y el botón «Reintentar».
- **Estados de la búsqueda:**
  - «Buscando…»;
  - «No hay buses para este día»;
  - «No se pudo consultar Samar» con «Reintentar».
- **Avisos:** los de `notices`, encima de la lista, en un bloque de aviso.

- [ ] **Paso 1: implementar** `SearchApp`, `TripCard` y el CSS.
  - Diseño para el móvil, con una columna de un máximo de unos 640 px.
  - Foco visible y contraste AA.
  - Las etiquetas no dependen solo del color: llevan texto.
- [ ] **Paso 2: `README.md`**
  - Qué hace la web.
  - Desarrollo: `npm install`, `.env.local` con `APP_PASSWORD`, `npm run dev`, `npm test`.
  - Despliegue en Vercel: importar el repositorio, definir `APP_PASSWORD` en *Settings → Environment Variables* y desplegar.
  - Cambiar la contraseña: editar la variable y hacer *Redeploy*. Todas las sesiones caducan.
  - Para fiarse de las plazas de las líneas 901–905: vaciar `PASS_THROUGH_LINES` en `lib/rules.ts`.
- [ ] **Paso 3: comprobación final en el navegador** (Playwright MCP) con `APP_PASSWORD=prueba npm run dev`. Como máximo 4 peticiones a samar.es y 6 a autobusing.
  - Login.
  - Buscar «ida» para mañana: aparece una lista con tarjetas. Las tres etiquetas aparecen donde toca: «Directo» en una 909, «Ruta · Santa Olalla» en una 910 y «Ruta · sin Santa Olalla» en una 901.
  - El interruptor pliega los itinerarios.
  - «Ver plazas» en una 909 directa: aparecen las cifras.
  - «Ver plazas» en la 901 de las 08:00 (si existe ese día): «Plazas no disponibles».
  - Cambiar a «vuelta» y buscar.
  - Captura con anchura de móvil (390 px).
- [ ] **Paso 4:** `npm test`, `npm run typecheck` y `npm run build` sin errores.
- [ ] **Paso 5: commit:** `feat: interfaz de búsqueda con tarjetas, itinerario y plazas bajo demanda`
