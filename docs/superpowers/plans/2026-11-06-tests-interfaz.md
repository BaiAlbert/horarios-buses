# Plan: tests automáticos de la interfaz

## Situación (2026-11-06)

- `npm test` (node:test, 43 tests, ~0,1 s) cubre solo `lib/` y `proxy.ts`: lectores de samar/autobusing, reglas, calendario, sesión y matcher.
- **Sin ningún test**: `SearchApp`, `TripCard`, `DatePicker`, `ScrollbarFade`, `app/api/*/route.ts`, `login/actions.ts`, `lib/cache.ts` (≈ 600 líneas, la mitad de la lógica con estado y casos límite).
- La interfaz se verifica a mano o con Playwright MCP en Chromium; no queda nada repetible. Safari y Firefox, sin verificar.
- Hay pocos puntos de fallo en `lib/` y muchos en la UI: carreras de `fetch` (`inflight`), estados de error/offline/401, `localStorage`, foco y teclado del calendario, `inert`/animaciones, `aria-live`.

## Decisión de herramientas

| Opción | Veredicto |
|---|---|
| **Playwright Test (E2E, red mockeada)** | **Elegida.** Ejecuta la app real en un navegador real: cubre CSS, `inert`, foco, teclado, `animationend`, `localStorage`, redirecciones. Corre en Chromium, Firefox y WebKit (cierra el hueco de Safari/Firefox). |
| Vitest + Testing Library (jsdom) | Descartada. jsdom no tiene layout, ni `inert`, ni animaciones: justo lo delicado del `DatePicker` y las tarjetas. Añade 3-4 dependencias y un segundo runner. |
| Capturas comparadas (visual regression) | Descartada por ahora. El efecto cristal/blur y las fuentes varían entre SO y dan falsos fallos. |
| Probar contra samar.es real | Descartada. Lento, frágil y contra la regla del proyecto de no consultar las webs en tests. |

Los tests de `lib/` siguen en `node --test`; el E2E va aparte (`npm run test:e2e`) para que `npm test` siga siendo instantáneo.

## Cómo se evita consultar Samar

El navegador solo habla con `/api/trips` y `/api/seats`. Con `page.route()` se interceptan y se responde con datos controlados:

- `TripsResponse` se construye en el propio test con `parseResults()` sobre `tests/fixtures/samar-*.html` (HTML real ya guardado). Así el fixture sigue la forma real de `Trip` y `tsc` avisa si cambia.
- `SeatsResult` (`count`, `full`, `available`, no disponible) se escribe a mano: son 4 objetos pequeños.
- Los fallos (502, 401, 200 con cuerpo raro, red caída con `route.abort()`) se simulan igual.
- Sesión: el test crea la cookie con `sessionToken('test')` y `APP_PASSWORD=test` en el `webServer`; el login real se prueba en su propio archivo.
- Fecha: `page.clock.setFixedTime()` para que «hoy», `MAX_DAYS_AHEAD` y «hace N min» sean deterministas.

## Fases

### Fase 0 · Andamiaje ✅ (≈ 1 h)
1. `npm i -D @playwright/test` y `npx playwright install` (Chromium, Firefox, WebKit).
2. `playwright.config.ts`: `webServer` con `next build && next start` en un puerto propio (no `dev`: el build es lo que se despliega y evita el bloqueo de `.next` con un `dev` abierto), `APP_PASSWORD=test`, proyectos `chromium`, `firefox`, `webkit` y un perfil móvil.
3. `tests/e2e/helpers.ts`: login por cookie, `mockTrips()`, `mockSeats()`.
4. Script `test:e2e` en `package.json`; `test-results/` y `playwright-report/` en `.gitignore`; `tests/e2e` fuera del glob de `npm test` (ya lo está: `tests/*.test.ts` no es recursivo).
5. Criterio de salida: un test «abre `/`, busca, ve N tarjetas» en verde en los 3 navegadores.

### Fase 1 · Flujos críticos ✅ (≈ 2-3 h) — `tests/e2e/busqueda.spec.ts`
- Búsqueda feliz de ida y de vuelta: título enfocado, contador, línea de estado, fecha larga.
- Sin buses (`samar-vacio`): mensaje y sin barra de filtros.
- Errores: 502 → «No se pudo consultar Samar» + Reintentar funciona; red caída → «Sin conexión»; 200 con cuerpo inválido → error, no página en blanco; 401 → redirige a `/login`.
- ~~Una búsqueda nueva anula la anterior~~: no se puede provocar desde la interfaz (el botón «Buscar» se desactiva mientras carga y bloquea también el Enter). Se prueba lo alcanzable: cambiar el selector con la búsqueda en vuelo no altera el trayecto del resultado.
- Aviso de caché: `fetchedAt` de hace 12 min → «Resultados guardados… hace 12 min»; reciente → «Consultado a las».

### Fase 2 · Tarjetas, filtros y preferencias ✅ (≈ 2 h) — `tarjeta.spec.ts`, `filtros.spec.ts`
- Plazas: `count`, `full` («Completo»), `available`, no disponible (con motivo), error + reintento, `matchedArrival`, `passThrough`.
- Filtros por tipo: contadores, «Ningún bus con los tipos seleccionados», persistencia tras recargar (`localStorage`).
- «Ocultar paradas» y avisos de Samar: los elementos `inert` quedan fuera del foco; la preferencia persiste.
- `localStorage` bloqueado: la página funciona igual (el `try/catch` existe por esto).

### Fase 3 · Calendario y login ✅ (≈ 2 h) — `calendario.spec.ts`, `login.spec.ts`
- `DatePicker`: abrir/cerrar con clic, Escape (devuelve el foco al botón), clic fuera, tabulador fuera; flechas ±1/±7 días; días fuera de `min`/`max` deshabilitados; mes anterior/siguiente deshabilitados en los límites; el día elegido se refleja en el botón.
- Login: contraseña incorrecta → error (y tarda ≥ 1 s); correcta → `/` con cookie `httpOnly`; sin sesión, `/` y `/api/*` redirigen / devuelven 401; `/login`, `/robots.txt`, `/manifest.webmanifest` accesibles sin sesión.

### Fase 4 · Accesibilidad y móvil ✅ (≈ 1 h) — `a11y.spec.ts`
- `@axe-core/playwright` sobre: inicio, resultados, calendario abierto, error, `/login`. Cero violaciones graves.
- Mismo flujo de la Fase 1 con el perfil móvil (sin desbordamiento horizontal).

### Fase 5 · Integración continua ✅ (≈ 30 min)
- `.github/workflows/test.yml`: `npm ci`, `lint`, `typecheck`, `npm test`, `npx playwright install --with-deps`, `npm run test:e2e`. Informe de Playwright como artefacto si falla.
- Hoy no hay CI: es lo que hace que los tests se ejecuten siempre y no solo «cuando me acuerdo».

### Fase 6 · Documentación ✅
- README: sustituir «no tiene tests automáticos» por qué cubre cada suite y cómo ejecutarlas; mover «Safari y Firefox sin verificar» a «WebKit y Firefox verificados con Playwright (WebKit no es Safari real)».

## Fuera de alcance (a propósito)
- Tests de las rutas `/api` con servidor falso de Samar: harían falta variables para cambiar la URL base de samar/autobusing. Las rutas son finas y su lógica (`rules`, `auth`) ya está probada; reabrir si crecen.
- Capturas de pantalla comparadas, umbrales de cobertura, pruebas de carga.

## Riesgos
- **WebKit en Linux fuera de Ubuntu/Debian** (esta máquina es CachyOS) puede no ejecutarse localmente; en CI (Ubuntu) sí. Si pasa, local = Chromium + Firefox, CI = los tres.
- Los mocks pueden desviarse de la API real: se mitiga construyéndolos con `parseResults()` y con tipos (`TripsResponse`, `SeatsResult`), y el test existente de `SCHEMA_VERSION`.
- Animaciones (`animationend` del calendario): usar `expect(...).toBeHidden()` con espera automática, nunca `waitForTimeout`.
- Descarga de navegadores ≈ 400-500 MB y ~30-60 s de ejecución total: aceptable para un `test:e2e` separado.

## Orden recomendado
0 → 1 → 3 (login/calendario, lo más difícil de revisar a mano) → 2 → 5 (CI) → 4 → 6. Cada fase se puede comitear sola.
