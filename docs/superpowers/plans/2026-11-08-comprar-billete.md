# Comprar billete y plazas de refuerzos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada tarjeta lleve a comprar el billete en la tabla Horarios de autobusing, con una pista de qué fila elegir, y que los horarios con refuerzo (varias filas idénticas en autobusing) muestren las plazas de cada autobús por separado.

**Architecture:**
- El enlace de compra es un simple `<a>` hacia `inicio_info` sin `hora_ida`, construido en el cliente con una función pura de `lib/rules.ts`. No hay ninguna petición desde el servidor.
- El refuerzo se resuelve en `lib/autobusing.ts`. `pickRow` pasa a devolver todas las filas exactas. `fetchSeats` lee cada fila con su propia sesión, en paralelo, y devuelve una variante nueva de `SeatsResult`: `kind: 'several'`. La ruta `/api/seats` no cambia.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `node --test` para `lib/` y Playwright para la interfaz.

**Spec:** `docs/superpowers/specs/2026-11-08-comprar-billete-design.md`

## Global Constraints

- Los tests nunca consultan samar.es ni autobusing (ADR-015): fixtures + `fetchImpl` simulado en `lib/`, `page.route` en e2e.
- Comentarios didácticos en español en todo el código nuevo o cambiado de `app/` y `lib/` (ADR-016), con el estilo de los que ya hay.
- Commits en español, con el estilo `feat:`, `fix:` o `test:`, y **sin** líneas `Co-Authored-By` ni «Generated with».
- Nunca pasar del paso «Plazas» de autobusing ni enviar datos del viajero.
- Presupuesto de todo el recorrido a autobusing: `SEATS_BUDGET_MS` (18 s), compartido por todas las sesiones de un mismo bus.
- Como mucho 3 filas idénticas; si hay más: `ok: false`, `reason: 'Demasiadas filas iguales en autobusing'`.
- Controles táctiles: 44 px de alto (34 px en pantallas bajas), según comprueba `tests/e2e/movil.spec.ts`.
- Al terminar cada tarea: `npm test`, `npm run typecheck` y `npm run lint` en verde.

## Review Focus

1. **Refuerzo con una fila «Completo» y otra con plazas.** Hay que mostrar «Completo» en esa fila y las plazas en la otra, sin seleccionar la fila completa. Test en la Tarea 2.
2. **Refuerzo cuando una sesión devuelve la página de plazas de otra hora.** Todo el resultado debe ser `ok: false`, nunca resultados parciales. Test en la Tarea 2.
3. **El bus de la línea 905, que no está en autobusing pero comparte salida con buses que sí están.** El motivo debe seguir siendo «No encontrado en autobusing», no «Varias filas posibles». Test en la Tarea 1.
4. **Bus de Madrid a Talavera.** El enlace usa los códigos del propio bus (`originCode` → `destinationCode`) y no unos fijos. Test en la Tarea 4, con una tarjeta del fixture de ida.
5. **Respuesta `several` con un bus «Completo» en medio.** La tarjeta muestra la lista entera en el color de «hay plazas» y solo se pone en el de «completo» si todos lo están. Test en la Tarea 3.

---

### Task 1: el emparejamiento devuelve todas las filas exactas y da un motivo honesto

**Files:**
- Modify: `lib/autobusing.ts` (`pickRow` y la parte de `fetchSeats` que usa su resultado)
- Test: `tests/autobusing.test.ts`
- Fixture (ya copiado, sin commit): `tests/fixtures/ab-horarios-vuelta-2026-11-09.html`: la tabla real de Talavera a Madrid del 09/11, con dos filas 05:15 → 06:35 (`nromov` 4123139 y 4123140), filas 05:15 → 07:10 y 05:15 → 07:15, y dos filas 10:30 (llegadas 11:50 y 12:30).

**Interfaces:**
- Produces: `pickRow(trip, siblingArrivals, rows): { rows: ScheduleRow[]; exact: boolean } | null`. Con coincidencia exacta, `rows` contiene **todas** las filas exactas, en el orden de la tabla. Por descarte, una sola fila con `exact: false`. Antes devolvía `{ row, exact }`.
- Produces: estos dos textos de `reason` cuando `pickRow` da `null`:
  - `'No encontrado en autobusing'`: no queda ninguna fila a esa salida que no sea de otro bus de samar.es.
  - `'Varias filas posibles en autobusing'`: queda al menos una, pero el descarte no es seguro.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
const nov09 = parseSchedule(fx('ab-horarios-vuelta-2026-11-09.html'));

test('pickRow: refuerzo, dos filas idénticas 05:15→06:35 → devuelve las dos en orden', () => {
  const r = pickRow(at('05:15', '06:35'), ['07:05'], nov09)!;
  assert.deepEqual([r.exact, r.rows.map((x) => x.nromov)], [true, ['4123139', '4123140']]);
});

test('fetchSeats: 905 de las 10:30 (12:00), sin fila propia → «No encontrado en autobusing»', async () => {
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-09.html' });
  const r = await fetchSeats({ ...trip0730, departure: '10:30', arrival: '12:00' }, '2026-11-09', { fetchImpl, siblingArrivals: ['11:50', '12:30'] });
  assert.deepEqual(r, { ok: false, reason: 'No encontrado en autobusing' });
});

test('fetchSeats: 910 05:15→07:05 con dos filas libres (07:10 y 07:15) → «Varias filas posibles en autobusing»', async () => {
  const { fetchImpl } = fakeAutobusing({ horarios: 'ab-horarios-vuelta-2026-11-09.html' });
  const r = await fetchSeats({ ...trip0730, departure: '05:15', arrival: '07:05' }, '2026-11-09', { fetchImpl, siblingArrivals: ['06:35'] });
  assert.deepEqual(r, { ok: false, reason: 'Varias filas posibles en autobusing' });
});
```

Además, hay que adaptar los tests de `pickRow` que ya existen al nuevo formato (`r.row` → `r.rows[0]`). En `pickRow: dudas → null`, el primer caso (dos filas idénticas 07:00 → 08:20) **deja de ser una duda**. Se saca a su propio test: espera `rows.length === 2` y `exact === true`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test`
Expected: FAIL en los tres tests nuevos y en el de las filas 07:00.

- [ ] **Step 3: Implementar**

- En `pickRow`: si `exact.length >= 1`, devuelve `{ rows: exact, exact: true }`. La rama del descarte devuelve `{ rows: [free[0]], exact: false }`.
- En `fetchSeats`: mientras la Tarea 2 no exista, sigue usando `rows[0]` si `rows.length === 1`. Si hay más de una, devuelve `ok: false` con el motivo provisional `'Varias filas posibles en autobusing'`; la Tarea 2 lo sustituye.
- Cuando `pickRow` dé `null`, el motivo sale de las filas candidatas: `rows.filter((r) => r.departure === trip.departure && !(siblingArrivals ?? []).includes(r.arrival))`. Si no hay ninguna, el motivo es «No encontrado en autobusing»; si hay alguna, «Varias filas posibles en autobusing».
- Se mantiene el caso «`!exact` sin `siblingArrivals`», que sigue dando «No encontrado en autobusing».
- Hay que actualizar el comentario didáctico de `pickRow` con el ejemplo del refuerzo.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/autobusing.ts tests/autobusing.test.ts tests/fixtures/ab-horarios-vuelta-2026-11-09.html
git commit -m "fix: el emparejamiento devuelve todas las filas exactas y distingue «no encontrado» de «dudoso»"
```

---

### Task 2: plazas de cada autobús del refuerzo, con una sesión por fila

**Files:**
- Modify: `lib/autobusing.ts` (`SeatsResult` y `fetchSeats`)
- Modify: `lib/samar.ts:40` (`SCHEMA_VERSION` pasa de 4 a 5) y `tests/samar.test.ts:79` (`version: 5`)
- Test: `tests/autobusing.test.ts`
- Fixtures (ya copiados, sin commit): `tests/fixtures/ab-plazas-0515-a.html` (`nromov` 4123139: 65 asientos, 3 libres) y `tests/fixtures/ab-plazas-0515-b.html` (4123140: 60 asientos, 4 libres). Las dos páginas muestran «09/11/2026 05:15».

**Interfaces:**
- Consumes: `pickRow` de la Tarea 1.
- Produces, en `lib/autobusing.ts`:
  ```ts
  export type BusSeats =
    | { kind: 'count'; free: number; occupied: number; total: number }
    | { kind: 'full' }
    | { kind: 'available' };
  // SeatsResult gana la variante:
  //   | (Found & { kind: 'several'; buses: BusSeats[] })   // refuerzo: una entrada por fila, en orden de la tabla
  ```
  Las variantes `count`, `full` y `available` de una sola fila no cambian. La Tarea 3 usa `kind: 'several'` y `buses`.

- [ ] **Step 1: Ampliar el simulador y escribir los tests que fallan**

Cambios en `fakeAutobusing`:
- Cada `GET /venta/inicio_info` da una cookie nueva: `rack.session=s1`, `s2`… En el test de las 07:30, `'rack.session=abc'` pasa a `'rack.session=s1'`.
- El simulador recuerda qué `nromov` se eligió con cada cookie.
- Con `opts.plazasByNromov: Record<string, string>` (`nromov` → nombre del fixture), `GET /venta/plazas` devuelve el fixture que corresponde a la última elección de esa cookie.

Los tests nuevos usan `const refuerzo = { ...trip0730, departure: '05:15', arrival: '06:35' }`, la fecha `'2026-11-09'` y `siblingArrivals: ['07:05']`.

```ts
test('fetchSeats: refuerzo → plazas de cada fila por separado, cada una con su propia sesión', async () => {
  const { calls, fetchImpl } = fakeAutobusing({
    horarios: 'ab-horarios-vuelta-2026-11-09.html',
    plazasByNromov: { '4123139': 'ab-plazas-0515-a.html', '4123140': 'ab-plazas-0515-b.html' },
  });
  const r = await fetchSeats(refuerzo, '2026-11-09', { fetchImpl, siblingArrivals: ['07:05'], now: () => new Date('2026-11-08T21:00:00Z') });
  assert.deepEqual(r, {
    ok: true, kind: 'several', checkedAt: '2026-11-08T21:00:00.000Z',
    buses: [{ kind: 'count', free: 3, occupied: 62, total: 65 }, { kind: 'count', free: 4, occupied: 56, total: 60 }],
  });
  // cada nromov se elige con una cookie distinta
  const picks = calls.filter((c) => c.method === 'POST' && c.path === '/venta/horarios');
  assert.deepEqual(new Set(picks.map((c) => c.cookie)).size, 2);
});
```

Más tests, con el mismo esquema:
- **Una fila «Completo» y otra con plazas.** Se construye la tabla con `horariosHtml`, que se añade al simulador como alternativa a `horarios`: es el fixture del 09/11 con la celda de radio de la fila 4123139 cambiada por `Completo`. Se espera `buses: [{ kind: 'full' }, { kind: 'count', free: 4, … }]`, y que el `nromov` 4123139 no se envíe nunca en un POST.
- **Una fila sin elección de asiento.** `horariosPost` pasa a recibir el cuerpo del POST (`(body: string) => Response`); los tests que ya existen lo ignoran. Responde `302 → /venta/viajeros` solo cuando el cuerpo lleva 4123140. Esa entrada es `{ kind: 'available' }`.
- **Una sesión recibe la página de plazas de otra hora** (`plazasByNromov` con `ab-plazas-0730.html` para 4123140). El resultado es `{ ok: false, reason: 'La respuesta no corresponde al bus' }`.
- **4 filas idénticas.** Tabla construida a mano con `horariosHtml` (4 filas 05:15 → 06:35). Se espera `{ ok: false, reason: 'Demasiadas filas iguales en autobusing' }` y ningún `POST /venta/horarios`.
- **Una fila sola sigue como hasta ahora.** El test de las 07:30 sigue pasando, con 5 peticiones y una sola sesión.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test`
Expected: FAIL en los tests nuevos de refuerzo.

- [ ] **Step 3: Implementar**

- Se parte `fetchSeats` en dos funciones internas, que comparten `budget`:
  - `openSession(trip, date, budget, fetchImpl)` hace los pasos 1 a 3. Devuelve `{ request, lastRedirect: () => string, rows }`, o un `ok: false` si autobusing no reconoce el trayecto. Cada llamada tiene su propia variable `cookie`.
  - `readRow(session, row, trip, fecha)` hace los pasos 4 y 5. Devuelve un `BusSeats` o `{ ok: false; reason }`, con las mismas reglas de hoy: `full` sin seleccionar la fila, `available` si salta a `/venta/viajeros`, comprobación de `when` y de `total`.
- Con una fila, `fetchSeats` hace lo mismo que hoy y devuelve el mismo objeto plano (`kind: 'count'`, etc.).
- Con 2 o 3 filas:
  - La primera usa la sesión ya abierta; cada una de las demás abre la suya. Todas van en paralelo con `Promise.all`.
  - Si alguna devuelve `ok: false`, ese es el resultado entero. Si alguna lanza un error, el error se propaga y la ruta devuelve el 502 de siempre.
- Con más de 3 filas: `ok: false`, «Demasiadas filas iguales en autobusing», antes de seleccionar ninguna.
- Se sube `SCHEMA_VERSION` a 5. El comentario explica que cambia la forma de las plazas guardadas en la caché.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/autobusing.ts lib/samar.ts tests/autobusing.test.ts tests/samar.test.ts tests/fixtures/ab-plazas-0515-a.html tests/fixtures/ab-plazas-0515-b.html
git commit -m "feat: plazas de cada autobús cuando un horario tiene refuerzo"
```

---

### Task 3: la tarjeta muestra las plazas de cada autobús del refuerzo

**Files:**
- Modify: `app/TripCard.tsx` (`SeatsLine` y la clase del contenedor de resultado)
- Modify: `app/globals.css` (solo si la lista necesita margen o sangría; con tokens de `theme.css`)
- Test: `tests/e2e/tarjeta.spec.ts`

**Interfaces:**
- Consumes: `SeatsResult` con `kind: 'several'` y `BusSeats` de la Tarea 2.

- [ ] **Step 1: Escribir el test e2e que falla**

```ts
test('refuerzo: plazas de cada autobús por separado y en orden', async ({ page }) => {
  const card = await openFirstCard(page);
  await mockSeats(page, {
    ok: true, kind: 'several', checkedAt: CHECKED_AT, passThrough: false,
    buses: [{ kind: 'count', free: 3, occupied: 62, total: 65 }, { kind: 'full' }],
  });
  await seatsButton(card).click();
  const box = card.locator('.seats-ok');
  await expect(box).toContainText('2 autobuses a esta hora');
  await expect(box.locator('li')).toHaveText(['1.º: 3 libres de 65', '2.º: completo']);
});
```

Otro test: si todas las entradas son `{ kind: 'full' }`, el contenedor es `.seats-full`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx playwright test tests/e2e/tarjeta.spec.ts --project=<proyecto Chromium de escritorio de playwright.config.ts>`
Expected: FAIL. TypeScript también se queja en `SeatsLine` del `switch` sin el caso `'several'` (`npm run typecheck`).

- [ ] **Step 3: Implementar**

- Nuevo `case 'several'` en `SeatsLine`:
  - Un párrafo `<strong>{n} autobuses a esta hora</strong> {checked}`.
  - Debajo, un `<ol>` con una línea por autobús: `«{i}.º: {free} libres de {total}»`, `«{i}.º: completo»` o `«{i}.º: quedan plazas (sin elección de asiento)»`.
- El contenedor usa `seats-full` solo si es `kind === 'full'` o si es `several` con todas sus entradas `full`; si no, `seats-ok`.
- Comentario didáctico: qué es un refuerzo y por qué el orden importa para elegir la fila en autobusing.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm run typecheck && npm run lint && npm run build && npx playwright test tests/e2e/tarjeta.spec.ts --project=<Chromium escritorio>`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add app/TripCard.tsx app/globals.css tests/e2e/tarjeta.spec.ts
git commit -m "feat: la tarjeta muestra por separado las plazas de cada autobús del refuerzo"
```

---

### Task 4: enlace «Comprar en autobusing» con pista de la fila en todas las tarjetas

**Files:**
- Modify: `lib/rules.ts` (constante con la URL base y `buyUrl`)
- Modify: `lib/autobusing.ts` (`BASE` pasa a importar la constante de `rules.ts`, para no repetir la URL)
- Modify: `app/TripCard.tsx` (bloque de compra y función `buyHint`)
- Modify: `app/globals.css` (`.buy`, solo lo necesario para la distribución)
- Test: `tests/rules.test.ts`, `tests/e2e/tarjeta.spec.ts` y `tests/e2e/movil.spec.ts` (añadir el enlace a la lista de controles táctiles)

**Interfaces:**
- Consumes: `SeatsResult` (incluido `several`) de la Tarea 2.
- Produces, en `lib/rules.ts`:
  - `export const AUTOBUSING_URL = 'https://regular.autobusing.es'`.
  - `export function buyUrl(trip: Pick<Trip, 'originCode' | 'destinationCode'>, date: string): string`, que devuelve `${AUTOBUSING_URL}/venta/inicio_info?empresa=samar&origen_codigo=…&destino_codigo=…&fecha_ida=AAAA-MM-DD`, **sin `hora_ida`**.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// tests/rules.test.ts
test('buyUrl: enlace al paso 1 de autobusing con trayecto y fecha, sin hora (así autobusing no elige el bus)', () => {
  const u = new URL(buyUrl({ originCode: '0831', destinationCode: '0108' }, '2026-11-09'));
  assert.equal(`${u.origin}${u.pathname}`, 'https://regular.autobusing.es/venta/inicio_info');
  assert.deepEqual(Object.fromEntries(u.searchParams), { empresa: 'samar', origen_codigo: '0831', destino_codigo: '0108', fecha_ida: '2026-11-09' });
});
```

Tests e2e (`tarjeta.spec.ts`; el fixture es de Madrid a Talavera):
- Hay un enlace «Comprar en autobusing» por tarjeta: `getByRole('link', { name: /Comprar en autobusing/ })` tiene el mismo número que `getByRole('article')`.
- El enlace de la primera tarjeta tiene `href` igual a `buyUrl(first, '2026-11-03')`, `target="_blank"`, y en `rel` aparecen `noopener` y `noreferrer`.
- Su nombre accesible incluye «se abre en otra pestaña».
- Pista antes de consultar las plazas: `En autobusing, elige la fila ${first.departure} → ${first.arrival}. Si no aparece, este bus no se vende ahí.`
- Pista con `matchedArrival: '09:58'` simulado: muestra `→ 09:58`.
- Pista con `several` de 2 entradas: `En autobusing hay 2 filas ${first.departure} → ${first.arrival}; las dos son este horario.` Con 3 entradas: `…3 filas…; todas son este horario.`
- `movil.spec.ts`: añadir `['Comprar', page.getByRole('link', { name: /Comprar en autobusing/ }).first()]` a la lista de controles.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npm test` (falla `buyUrl`) y `npx playwright test tests/e2e/tarjeta.spec.ts --project=<Chromium escritorio>`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- `buyUrl` en `lib/rules.ts`, con `URLSearchParams`.
- `buyHint(trip, seats)` en `TripCard.tsx`: función local pura que devuelve exactamente los textos del Step 1. Solo usa el resultado si `seats.status === 'done' && result.ok`.
- Bloque `<div className="buy">`, **justo después** de `<div className="seats">` y **fuera** de él, para que el enlace no esté dentro de la zona `aria-live`. Contiene:
  - el `<a className="secondary press" href={buyUrl(trip, date)} target="_blank" rel="noopener noreferrer">` con el texto `Comprar en autobusing` y `<span className="sr"> (se abre en otra pestaña)</span>`;
  - debajo, `<p className="note">{buyHint(...)}</p>`.
- Si `.secondary` no da al `<a>` el aspecto y la altura de botón (por ejemplo, por `display` o el subrayado), se ajusta en `globals.css` con tokens.
- En `lib/autobusing.ts`, `BASE` pasa a ser `AUTOBUSING_URL` importada de `rules.ts`. Comprobar antes que `rules.ts` no importa nada de `autobusing.ts`, para no crear un ciclo.
- Comentario didáctico: por qué sin `hora_ida`, y por qué el usuario elige la fila en autobusing.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npx playwright test tests/e2e/tarjeta.spec.ts tests/e2e/a11y.spec.ts tests/e2e/movil.spec.ts --project=<Chromium escritorio> --project=<iPhone SE> --project=<Pixel 7>`
(los nombres de proyecto exactos están en `playwright.config.ts`)
Expected: todo en verde, sin fallos de axe ni de controles pequeños.

- [ ] **Step 5: Commit**

```bash
git add lib/rules.ts lib/autobusing.ts app/TripCard.tsx app/globals.css tests/rules.test.ts tests/e2e/tarjeta.spec.ts tests/e2e/movil.spec.ts
git commit -m "feat: enlace «Comprar en autobusing» en cada tarjeta, con la fila que hay que elegir"
```

---

### Task 5: comprobación real y documentación

**Files:**
- Modify: `README.md` (en la lista de funciones, junto a «Ver plazas libres», y en la sección «Plazas (autobusing)»)
- Modify: `docs/superpowers/specs/2026-11-08-comprar-billete-design.md` (estado: implementado)
- Modify: `/home/baialbert/second-brain/Proyectos/horarios-buses/horarios-buses.md`, solo si el usuario no lo deja para `/cerrar-sesion`

- [ ] **Step 1: Comprobación manual en un navegador real (Playwright MCP o Chromium), con datos reales**

Con `next build && next start` (puerto 3100, `APP_PASSWORD` desechable):
- Buscar Talavera → Madrid. Pulsar «Comprar en autobusing» en una tarjeta y luego «Continuar» en autobusing. Hay que llegar a la tabla **Horarios**, no a «Plazas».
- Repetir con Madrid → Talavera.
- Pulsar «Ver plazas libres» en un horario con refuerzo, si ese día lo hay (el 09/11 a las 05:15, Talavera → Madrid, ya habrá pasado; buscar otro lunes temprano). Comprobar que salen dos autobuses.
- No pasar del paso «Plazas» en autobusing.

Expected: las tres cosas como se describen. Si alguna falla, parar y avisar al usuario.

- [ ] **Step 2: README**

- Lista de funciones: «**Comprar en autobusing** desde cada bus, con la fila que hay que elegir».
- Sección «Plazas (autobusing)»: una frase sobre los refuerzos (varias filas idénticas → plazas de cada una por separado, cada una con su sesión).

- [ ] **Step 3: Nota del proyecto** (si toca)

- ADR-017, «Compra por enlace a la tabla Horarios de autobusing, sin `hora_ida`»: contexto (los hechos comprobados del spec), decisión, alternativas descartadas (POST entre sitios, compra a través de nuestro servidor) y consecuencias.
- ADR-002: añadir el refuerzo.
- Glosario: «refuerzo».
- Riesgos: quitar o actualizar el de los «no disponible» por filas duplicadas.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-08-comprar-billete-design.md
git commit -m "docs: compra desde la tarjeta y plazas de refuerzos"
```
