# Emparejamiento v2 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emparejar cada bus de samar.es con sus filas de autobusing también por la marca «solo llega hasta Alcorcón», asignar por descarte todas las filas sobrantes, quitar la compra a los buses sin precio y ajustar motivos y pistas.

**Architecture:**
- `lib/rules.ts` gana la marca de Alcorcón (`onlyToAlcorcon`), y `siblingArrivals` e `isAmbiguous` solo cuentan buses con la misma marca.
- `lib/autobusing.ts`:
  - lee la nota de cada fila (`ScheduleRow.alcorcon`);
  - `pickRow` solo mira filas con la marca del bus y, por descarte, devuelve todas las filas sobrantes;
  - cada autobús de `several` lleva su `arrival`.
- `lib/samar.ts` gana `Trip.onlineSale`, y la ruta `/api/seats` corta antes de consultar.
- La tarjeta pinta las nuevas pistas y la lista con llegadas.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (type stripping de Node), `node --test`, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-11-08-emparejamiento-v2-design.md`. Lee también su apartado «Cómo queda cada caso».

## Global Constraints

- Tests sin red: fixtures reales en `tests/fixtures/` (ADR-015).
- Comentarios didácticos en español en el código nuevo, como los del resto del archivo (ADR-016).
- Commits sin «Co-Authored-By» ni «Generated with Claude Code».
- Nunca pasar del paso «Plazas» de autobusing.
- `MAX_ROWS` = 3 y `SEATS_BUDGET_MS` = 18 s, sin cambios.
- `SCHEMA_VERSION` = 6.
- Expresión de la marca, igual en las dos webs: `/s[oó]lo llega hasta alcorc[oó]n/i`.
- Textos exactos:
  - motivo sin fila: `No aparece en la venta online`;
  - motivo sin venta: `No se vende online`;
  - tarjeta sin venta: `Este bus no se vende online.`
- El sentido Madrid → Talavera no cambia de comportamiento: los tests actuales de `ida` siguen pasando sin tocarlos (salvo que nombren el motivo antiguo).

## Review Focus

1. **Mayúsculas y tildes en la marca.** samar.es escribe «SÓLO … ALCORCÓN» y autobusing «solo … Alcorcón»: las dos tienen que detectarse. Se fija en la Tarea 1, con un test de `onlyToAlcorcon` en mayúsculas y con tilde, y otro de `parseSchedule` con la nota real.
2. **Un grupo entero lleno.** Si se llena todo un grupo, autobusing deja una sola fila «Completo», y esa fila conserva la nota. El 05:00 de Alcorcón tiene que dar `full`, no «No aparece». Se fija en la Tarea 2, con la tabla de llenos.
3. **Más de 3 filas sobrantes por descarte.** Tiene que dar «Demasiadas filas iguales en autobusing» sin seleccionar ninguna. Se fija en la Tarea 2.
4. **`data-price` vacío, ausente o raro.** `onlineSale` tiene que ser `true`: solo un 0 explícito quita la compra. Se fija en la Tarea 3.
5. **La caché con la forma vieja.** `several` sin `arrival` y `Trip` sin `onlineSale` no pueden llegar al cliente nuevo. Hay que subir `SCHEMA_VERSION`, y lo vigila el test de la Tarea 3.

---

### Task 1: marca de Alcorcón en reglas y en la tabla de autobusing, y fixtures del 16/11

**Files:**
- Create:
  - `tests/fixtures/samar-vuelta-2026-11-16.html`, copia de `.superpowers/investigacion-16nov/samar.html`;
  - `tests/fixtures/ab-horarios-vuelta-2026-11-17.html`, copia de `.superpowers/investigacion-16nov/ab-2026-11-17.html`;
  - `tests/fixtures/ab-horarios-vuelta-2026-11-16-llenos.html`, copia de `.superpowers/investigacion-16nov/ab16-b.html`.
- Modify: `lib/rules.ts` (`isAmbiguous`, `siblingArrivals`, nueva `onlyToAlcorcon`) y `lib/autobusing.ts` (`ScheduleRow`, `parseSchedule`).
- Test: `tests/rules.test.ts` y `tests/autobusing.test.ts`.

**Interfaces:**
- Produces:
  - `export function onlyToAlcorcon(t: Pick<Trip, 'alerts'>): boolean` en `lib/rules.ts`;
  - `ScheduleRow = { departure; arrival; nromov; full; alcorcon: boolean }`.
  - `isAmbiguous(t, all)` y `siblingArrivals(t, all)` mantienen su firma, pero solo cuentan los buses con el mismo `onlyToAlcorcon` que `t`.

- [ ] **Paso 1: copiar las tres capturas** a `tests/fixtures/` con esos nombres (`cp`).
- [ ] **Paso 2: tests que fallan.**
  - En `tests/rules.test.ts`:
    - `onlyToAlcorcon({ alerts: ['ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN, NO TIENE PARADA EN LA ESTACIÓN SUR'] })` da `true`;
    - con `'solo llega hasta alcorcon'` da `true`;
    - con `[]` y con un aviso de dársenas da `false`.
  - Sobre `samar-vuelta-2026-11-16.html`:
    - con el 05:45 → 07:05 normal (`n`) y el 05:45 → 06:50 de Alcorcón (`a`), `siblingArrivals(n, trips)` da `[]` y `siblingArrivals(a, trips)` da `[]`;
    - con el 06:00 → 07:20, `siblingArrivals` da `['07:50']` (misma marca);
    - un `isAmbiguous` con dos buses inventados de horas iguales y distinta marca da `false`.
  - En `tests/autobusing.test.ts`:
    - en el test «parsers sobre fixtures reales», el `deepEqual` de `rows[0]` gana `alcorcon: false`;
    - test nuevo con `parseSchedule(fx('ab-horarios-vuelta-2026-11-17.html'))`: 43 filas; las dos 05:00 → 06:20 y la segunda 05:45 → 07:05 (`nromov` 4128378) tienen `alcorcon: true`; la 05:45 → 07:05 `nromov` 4128377 y todas las demás tienen `alcorcon: false`;
    - en la tabla de llenos (40 filas), la fila 05:00 tiene `full: true, nromov: null, alcorcon: true`.
- [ ] **Paso 3: ejecutar** `npm test` y comprobar que **FALLA**: `onlyToAlcorcon` no existe y falta `alcorcon`.
- [ ] **Paso 4: implementar.**
  - `onlyToAlcorcon`: `t.alerts.some((a) => ALCORCON.test(a))` con la expresión de Global Constraints, exportada como `ALCORCON` para que la use `autobusing.ts`.
  - `isAmbiguous` y `siblingArrivals` añaden `&& onlyToAlcorcon(o) === onlyToAlcorcon(t)`.
  - `parseSchedule`: la nota va justo después de la celda del precio, así: `…<td class="numeric">11,33€</td><tr><td colspan="4">NOTA</td></tr></tr>`. Hay que ampliar la expresión para capturar de forma opcional `<td[^>]*>[\s\S]*?</td>(?:<tr><td colspan="4">([\s\S]*?)</td></tr>)?` tras la llegada, y poner `alcorcon: ALCORCON.test(nota ?? '')`.
  - Comprobar que el test de más de 3 filas (filas sin nota) sigue leyendo 4 filas.
- [ ] **Paso 5: ejecutar** `npm test`. Se espera que pasen todos, salvo los de `pickRow`/`fetchSeats` que dependen del flujo viejo de 05:00. Si alguno falla, se arregla en la Tarea 2 y aquí se apunta cuál es.
- [ ] **Paso 6: commit** con `feat: marca «solo llega hasta Alcorcón» en samar.es y en la tabla de autobusing`.

### Task 2: `pickRow` por marca, descarte con varias filas y llegada en cada autobús

**Files:**
- Modify: `lib/autobusing.ts` (`pickRow`, `fetchSeats`, tipo `SeatsResult`).
- Test: `tests/autobusing.test.ts`.

**Interfaces:**
- Consumes: `onlyToAlcorcon` y `ScheduleRow.alcorcon` (Tarea 1).
- Produces:
  - `pickRow(trip: Pick<Trip, 'departure' | 'arrival' | 'alerts'>, siblingArrivals: string[], rows: ScheduleRow[]): { rows: ScheduleRow[]; exact: boolean } | null`;
  - `export type SeveralBus = BusSeats & { arrival: string }`;
  - `SeatsResult` con la forma `(Found & { kind: 'several'; buses: SeveralBus[] })`;
  - el motivo `'No encontrado en autobusing'` pasa a `'No aparece en la venta online'`.

- [ ] **Paso 1: tests que fallan.**
  - **Barrido del 16/11.** `nov16 = parseResults(fx('samar-vuelta-2026-11-16.html')).trips`, `full17 = parseSchedule(fx('ab-horarios-vuelta-2026-11-17.html'))`, `llenos16 = parseSchedule(fx('ab-horarios-vuelta-2026-11-16-llenos.html'))`.
    - Helper: `pick(rows, dep, arr)` busca el bus por salida y llegada y llama a `pickRow(t, siblingArrivals(t, nov16), rows)`.
    - Helper: `shape(p)` da `p && [p.exact, p.rows.map((r) => r.nromov ?? 'Completo')]`.
  - Con `full17`:
    - `pick('05:45','07:05')` da `[true, ['4128377']]`;
    - `pick('05:45','06:50')` da `[false, ['4128378']]`;
    - `pick('05:00','06:05')` da `[false, ['4128373','4128374']]`;
    - `pick('05:15','07:05')` da `[false, ['4128418','4128419']]`;
    - `pick('05:15','06:35')` da `[true, ['4128375','4128376']]`;
    - `pick('06:00','07:50')` da `[false, ['4128422','4128423']]`;
    - `pick('10:30','12:00')` da `null`.
  - Con `llenos16`:
    - `pick('05:45','07:05')` da `null`;
    - `pick('05:45','06:50')` da `[false, ['4127601']]`;
    - `pick('05:00','06:05')` da `[false, ['Completo']]`.
  - Los dos 07:00 → 09:00 siguen ambiguos: `isAmbiguous` da `true` para los dos.
  - **Barrido.** Todo bus de `nov16` que no sea ambiguo, ni 907, ni de las salidas 10:30 (905), 11:15 o 18:15/18:30, recibe en `full17` al menos una fila (`pick(...) !== null`).
  - `fetchSeats` del 905 de las 10:30, con `siblingArrivals: ['11:50','12:30']`, da `{ ok: false, reason: 'No aparece en la venta online' }`. Sustituye al test de «No encontrado».
  - El test de 20:15 → 22:00 sin hermanos usa el motivo nuevo.
  - **Refuerzo por descarte.** El test de «910 05:15→07:05 … Varias filas posibles» pasa a ser este.
    - `fetchSeats` del 05:15 → 07:05 sobre `ab-horarios-vuelta-2026-11-09.html`, con `siblingArrivals: ['06:35']` y `plazasByNromov` que da `ab-plazas-0515-a.html` para las dos filas sobrantes de esa tabla (sus `nromov` de 07:10 y 07:15; se leen con `parseSchedule`).
    - El `when` de ese fixture es 05:15 del 09/11, así que vale.
    - Se espera `kind: 'several'` y `buses.map((b) => b.arrival)` igual a `['07:10','07:15']`.
  - Los tests de refuerzo exacto existentes añaden `arrival: '06:35'` a cada bus esperado.
  - El test «más de 3 filas» gana un caso por descarte: 4 filas 05:15 → 07:10…07:40 para el bus 05:15 → 07:05 sin hermanos da `'Demasiadas filas iguales en autobusing'`, con 0 selecciones.
  - Hay tres tests antiguos de las 05:00 sobre el 06/11, cuya fila es «Completo» y de Alcorcón. En todos, el bus de prueba lleva `alerts: ['sólo llega hasta Alcorcón']`:
    - `pickRow` «solo coincide la salida…»: el helper `at()` gana un tercer parámetro opcional, `alerts: string[] = []`;
    - `fetchSeats` «el bus está completo»;
    - el `deepEqual` de `rows[0]` en «parseSchedule incluye las salidas «Completo»» gana `alcorcon: true`.
  - Caso límite conocido, sin test: si todo un grupo mixto se llena (06/11: queda una sola 05:45 «Completo» sin nota), el bus de Alcorcón da «No aparece en la venta online». Es aceptable, porque la pista dice «puede estar completo».
- [ ] **Paso 2: ejecutar** `npm test` y comprobar que **FALLAN** los nuevos casos (05:45 mezcla filas, el descarte da `null`, falta `arrival`).
- [ ] **Paso 3: implementar.**
  - `pickRow`: `sameDeparture` filtra también por `r.alcorcon === onlyToAlcorcon(trip)`. El descarte devuelve `{ rows: free, exact: false }` cuando `free.length >= 1 && unmatchedSiblings.length === 0`. Hay que actualizar el comentario de la función con los casos 05:15 → 07:05 y 05:45.
  - `fetchSeats`:
    - el motivo sin fila es el nuevo;
    - `candidates` filtra también por la marca (si no, la fila de Alcorcón de las 05:45 haría decir «Varias filas posibles» al bus normal lleno);
    - en el refuerzo, cada resultado lleva `{ ...result, arrival: row.arrival }`.
- [ ] **Paso 4: ejecutar** `npm test` y `npm run typecheck`. Se espera que todo pase, salvo los errores de tipos de `app/TripCard.tsx` y de los e2e por `SeveralBus`, que se arreglan en la Tarea 4. Si hay errores, se listan.
- [ ] **Paso 5: commit** con `fix: no mezclar buses de Alcorcón y normales; por descarte se asignan todas las filas sobrantes`.

### Task 3: `Trip.onlineSale` y la ruta `/api/seats`

**Files:**
- Modify:
  - `lib/samar.ts`: `Trip`, `parseResults` y `SCHEMA_VERSION` = 6, con un comentario «6: onlineSale y llegada en cada autobús de `several`»;
  - `app/api/seats/route.ts`.
- Test: `tests/samar.test.ts` y `tests/rules.test.ts`.

**Interfaces:**
- Produces: `Trip.onlineSale: boolean`.

- [ ] **Paso 1: tests que fallan** en `tests/samar.test.ts`.
  - En `samar-vuelta-2026-11-16.html`, los buses con `onlineSale: false` son exactamente los tres 907 (09:15, 11:45, 17:00), y el resto da `true`.
  - El mismo HTML con `data-price="0.00"` cambiado por `data-price=""`, o sin el atributo, da todos `true`.
  - El test de `SCHEMA_VERSION` espera `{ version: 6, keys: [..., 'onlineSale', ...] }`.
  - La ruta no tiene tests unitarios: se cubre en el e2e de la Tarea 4 con un mock, y el corte se comprueba a mano en el Paso 4.
- [ ] **Paso 2: ejecutar** `npm test` y comprobar que **FALLA**.
- [ ] **Paso 3: implementar.**
  - En `parseResults`: `onlineSale: !(attrs.price && Number(attrs.price) === 0)`.
  - En la ruta: justo después de encontrar `trip`, `if (!trip.onlineSale) return Response.json({ ok: false, reason: 'No se vende online', passThrough })`, antes de `isAmbiguous` y sin llamar a `getSeats`.
  - Los `Trip` literales de tests y helpers que no compilen ganan `onlineSale: true`.
- [ ] **Paso 4: ejecutar** `npm test`. Se espera que pase. Revisar con `grep -n "onlineSale" app/api/seats/route.ts` que el corte va antes de `getSeats`.
- [ ] **Paso 5: commit** con `feat: los buses sin precio en samar.es no se venden online`.

### Task 4: tarjeta — sin venta online, lista con llegadas, avisos y pistas

**Files:**
- Modify:
  - `app/TripCard.tsx`;
  - `app/SearchApp.tsx` (línea ~311, la nueva prop);
  - `lib/rules.ts` (nueva `alcorconTwin`).
- Test: `tests/rules.test.ts`, `tests/e2e/tarjeta.spec.ts` y `tests/e2e/helpers.ts` (si `SeatsBody` necesita `SeveralBus`).

**Interfaces:**
- Consumes:
  - `onlyToAlcorcon` (Tarea 1);
  - `SeveralBus` y el motivo `'No aparece en la venta online'` (Tarea 2);
  - `Trip.onlineSale` (Tarea 3).
- Produces:
  - `export function alcorconTwin(t: Trip, all: Trip[]): boolean`: `t` no es de Alcorcón y otro bus con la misma salida sí lo es;
  - la prop `alcorconTwin: boolean` de `TripCard`.

Textos exactos (`{s}` = salida de samar.es, `{l}` = llegada de samar.es):

- **Sufijo.** Para un bus de Alcorcón: ` (la que dice «solo llega hasta Alcorcón»)`, y en plural ` (las que dicen «solo llega hasta Alcorcón»)`. Si `alcorconTwin`: ` (la que no dice «solo llega hasta Alcorcón»)`, y en plural ` (las que no dicen «solo llega hasta Alcorcón»)`. En cualquier otro caso, nada.
- **Antes de consultar, bus de Alcorcón:** `En autobusing, elige la fila de las {s} que dice «solo llega hasta Alcorcón» (allí puede poner otra hora de llegada).`
- **Antes de consultar, otro bus:** `En autobusing, busca la fila de las {s} que llega a las {l}{sufijo}. Si no está, «Ver plazas libres» te dice cuál es.`
- **Una fila:** `En autobusing, elige la fila {s} → {matchedArrival ?? l}{sufijo}.`
- **Refuerzo con todas las llegadas iguales a `{l}`:** `En autobusing hay {n} filas {s} → {l}{sufijo plural}; las dos|todas son este horario.`
- **Refuerzo por descarte (alguna llegada distinta):** `En autobusing, elige una de las filas de las {s} que llegan a las {lista}{sufijo plural}.`
  - `{lista}`: llegadas sin repetir, en el orden de la tabla, unidas con `new Intl.ListFormat('es', { type: 'conjunction' })`, que da «07:10 y 07:15».
- **Motivo `No aparece en la venta online`:** `Ahora mismo no aparece en la venta online: puede estar completo o no venderse online.`
- **Motivo `Varias filas posibles en autobusing`:** el texto de ahora.
- **Cualquier otro fallo:** la pista de antes de consultar sin la frase `Si no está, «Ver plazas libres» te dice cuál es.` A un bus de Alcorcón no le cambia nada.
- **Lista del refuerzo por descarte:** `1.º (llega 07:10 según autobusing): 3 libres de 55`. En el refuerzo exacto queda como ahora (`1.º: 3 libres de 65`).
- **Aviso del refuerzo por descarte** (`.seats .note`): `Aviso: en el sistema de venta estos autobuses llegan a las {lista} (en Samar, a las {l}). Se han emparejado por descarte: puede que no hagan exactamente el mismo recorrido.`
- **Tarjeta sin venta online:** en lugar de la zona `.seats` y de `.buy`, un único `<p className="note">Este bus no se vende online.</p>`. No tiene botón ni enlace.

- [ ] **Paso 1: tests que fallan.**
  - `tests/rules.test.ts`: `alcorconTwin` sobre el 16/11 da `true` para el 05:45 → 07:05 normal, y `false` para el 05:45 de Alcorcón y para el 06:00 → 07:20.
  - `tests/e2e/tarjeta.spec.ts`:
    - la pista inicial de la primera tarjeta pasa a `En autobusing, busca la fila de las ${first.departure} que llega a las ${first.arrival}. Si no está, «Ver plazas libres» te dice cuál es.`;
    - en `hintCases`:
      - «llegada distinta» da `En autobusing, elige la fila ${first.departure} → 09:58.`;
      - «refuerzo de 2/3» lleva `arrival: first.arrival` en cada bus, con el mismo texto;
      - «plazas no disponibles» usa el motivo nuevo y la pista `Ahora mismo no aparece…`;
      - caso nuevo, refuerzo por descarte con `buses: [{ kind: 'full', arrival: '07:10' }, { kind: 'count', free: 3, occupied: 52, total: 55, arrival: '07:15' }]`, da `En autobusing, elige una de las filas de las ${first.departure} que llegan a las 07:10 y 07:15.`;
    - en `cases`:
      - los refuerzos ganan `arrival: first.arrival` en cada bus;
      - caso nuevo de descarte con esos dos buses: `li` vale `['1.º (llega 07:10 según autobusing): completo', '2.º (llega 07:15 según autobusing): 3 libres de 55']`, y `.seats .note` el aviso con `07:10 y 07:15` y `${first.arrival}`;
    - **Bus de Alcorcón**, test nuevo:
      - mock de trips con `tripsFixture('samar-vuelta-2026-11-16.html')`;
      - la tarjeta del 05:45 de Alcorcón dice la pista de Alcorcón;
      - la del 05:45 normal termina en `(la que no dice «solo llega hasta Alcorcón»). Si no está, «Ver plazas libres» te dice cuál es.`;
      - la tarjeta se localiza con `page.getByRole('article').filter({ hasText: '06:50' })`;
      - **ojo:** `openLoggedIn` fija el reloj en el 03/11, así que hay que mirar si la búsqueda del mock depende de la fecha; si depende, se busca el día que dé el selector, porque el mock ignora la fecha.
    - **Sin venta online**, test nuevo: con el fixture del 16/11, la tarjeta del 907 de las 09:15 dice `Este bus no se vende online.` y tiene 0 botones `Ver plazas libres` y 0 enlaces `Comprar en autobusing`.
    - El test «un enlace por tarjeta» cuenta las tarjetas con venta online. En el fixture de `ida` hay dos 907, así que pasa a `count() - 2`, o mejor, a contar los artículos que no tienen el texto «no se vende online».
- [ ] **Paso 2: ejecutar** `npm run test:e2e -- tarjeta` y comprobar que **FALLAN** los casos nuevos.
- [ ] **Paso 3: implementar** en `TripCard.tsx`.
  - `busLine(b, i, showArrival)`.
  - El aviso de descarte se pinta en `SeatsLine` o donde ya se pinta el de `matchedArrival`, con la condición `r.kind === 'several' && r.buses.some((b) => b.arrival !== trip.arrival)`.
  - `buyHint(trip, seats, alcorconTwin)` con los textos de arriba.
  - La rama `!trip.onlineSale` va en el JSX.
  - `SearchApp` pasa `alcorconTwin={alcorconTwin(t, done.trips)}`; hay que comprobar el nombre real de la lista de buses en `SearchApp`. `memo` se mantiene, porque la prop es un booleano.
- [ ] **Paso 4: ejecutar** `npm test`, `npm run typecheck`, `npm run lint` y `npm run test:e2e`. Se espera que todo pase en los tres proyectos (escritorio, iPhone SE y Pixel 7).
- [ ] **Paso 5: commit** con `feat: pistas de compra por marca de Alcorcón, refuerzo por descarte y buses sin venta online`.

### Task 5: documentación y comprobación final

**Files:**
- Modify:
  - `README.md`: el punto de Refuerzos (líneas ~91), para añadir el descarte con llegadas distintas y la marca de Alcorcón, y la sección «### Comprar», para añadir los buses sin precio;
  - `docs/superpowers/specs/2026-11-08-emparejamiento-v2-design.md`: el estado pasa a «implementado».

- [ ] **Paso 1: editar** los dos archivos.
- [ ] **Paso 2: ejecutar** `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`. Se espera que todo pase.
- [ ] **Paso 3: comprobación real**, con la red y sin tests: `npm run dev` y la sesión.
  - Pedir `/api/seats` de Talavera → Madrid del 16/11 o de un día próximo para el 05:45 normal, el 05:45 de Alcorcón, el 05:15 → 07:05 y un 907.
  - Comprobar que:
    - el normal no trae plazas del de Alcorcón;
    - el 05:15 → 07:05 trae dos autobuses con 07:10 y 07:15;
    - el 907 da «No se vende online».
- [ ] **Paso 4: commit** con `docs: emparejamiento v2 (marca de Alcorcón, descarte, buses sin venta online)`.
