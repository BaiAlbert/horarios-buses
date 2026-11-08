# Comprar billete desde la tarjeta y plazas de buses de refuerzo — diseño

Fecha: 2026-11-08. Estado: implementado (plan `docs/superpowers/plans/2026-11-08-comprar-billete.md`).

## Intención

Hoy la web sirve para consultar horarios y plazas, pero para comprar hay que ir a samar.es, buscar otra vez el viaje y pulsar «Comprar billete», que lleva al motor de venta `regular.autobusing.es`. La meta es **ir a comprar directamente desde la tarjeta de cada bus**, con un paso menos y **sin riesgo de acabar pagando un bus distinto del elegido**.

Ese riesgo existe hoy, también desde samar.es:

- El enlace «Comprar billete» de samar.es solo lleva la hora de salida (`hora_ida`). Con ella, autobusing **elige el bus por su cuenta** al pulsar «Continuar» y salta directamente a «Plazas». La página de plazas solo muestra «09/11/2026 10:30», sin la llegada.
- Ejemplo real del 09/11/2026, de Talavera a Madrid a las 10:30. samar.es lista tres buses: el 905, que llega a las 12:00; el 909, a las 11:50, y el 910, a las 12:30. autobusing tiene dos filas, con llegada a las 11:50 y a las 12:30. Desde samar.es los tres llevan al mismo enlace y al mismo mapa de asientos. El 905 es de una línea que va o viene de Extremadura y autobusing no lo vende.
- **La tabla «Horarios» de autobusing es la referencia de qué se vende y de cuál es cada bus.** En ella se elige la fila exacta (salida y llegada).

Además, al investigar apareció un fallo de la consulta de plazas: el bus de las 05:15 (909, que llega a las 06:35) sale como «Plazas no disponibles (No encontrado en autobusing)». En realidad, autobusing vende para ese horario **dos autobuses distintos**: dos filas idénticas, 05:15 → 06:35, una con 65 asientos y 3 libres y otra con 60 asientos y 4 libres. El usuario y yo creemos que es un **refuerzo**, porque el horario necesita muchas plazas. `pickRow` devuelve `null` cuando hay más de una fila exacta (`lib/autobusing.ts:89`), y la ruta lo presenta con el texto de «no encontrado».

## Hechos comprobados en autobusing (2026-11-08, con curl, sin pasar de «Plazas»)

1. `GET /venta/inicio_info?empresa=samar&origen_codigo=…&destino_codigo=…&fecha_ida=AAAA-MM-DD` **sin `hora_ida`** devuelve el paso 1 con la fecha ya puesta, y un formulario solo con la fecha, el número de viajeros y el tipo de viaje. Al enviarlo, la respuesta es `302 → /venta/horarios`: la tabla completa, sin ningún bus elegido. **Con** `hora_ida`, la respuesta es `302 → /venta/plazas` con un bus elegido por autobusing.
2. La sesión es la cookie `rack.session` de autobusing (HttpOnly, sin `SameSite`). Guarda el trayecto, la hora y la fecha del paso 1. Si se envía `/venta/inicio` sin ella, la respuesta es **500**. Nuestra web no puede crear esa sesión por el navegador del usuario: el paso 1 tiene que abrirlo el propio navegador.
3. El formulario no tiene token anti-CSRF. Aun así, **no** se usará: la cookie sin `SameSite` llega o no en un POST entre sitios según el navegador, y no compensa depender de eso.
4. Las dos filas iguales del refuerzo tienen `nromov` distintos (4123139 y 4123140), estables entre sesiones. Ninguna nota las distingue en la tabla.
5. La página de plazas **no indica qué fila se eligió**: no contiene el `nromov`. En una misma sesión se puede elegir una fila y luego otra, pero si la segunda elección fallara sin avisar no se notaría. Por eso cada fila se consulta con **su propia sesión**.

Para tests: en `/tmp/claude-1000/-home-baialbert-Coding-horarios-buses/b9bed046-6d32-4719-99a2-9476ce14fe25/scratchpad/ab/` quedan capturas reales del 09/11, de Talavera a Madrid: `h.html` (tabla de horarios con el refuerzo de las 05:15 y las dos filas de las 05:00) y `pl_4123139.html` y `pl_4123140.html` (mapas de las dos filas). Copiar las que hagan falta a `tests/fixtures/` como `ab-horarios-vuelta-2026-11-09.html` y similares.

## Objetivos

1. **Botón «Comprar» en todas las tarjetas** (decisión del usuario), aunque no se hayan consultado las plazas y aunque el bus salga como «Completo» o «no disponible».
   - Es un enlace a `https://regular.autobusing.es/venta/inicio_info?empresa=samar&origen_codigo={trip.originCode}&destino_codigo={trip.destinationCode}&fecha_ida={date}`, **sin `hora_ida`**. Se abre en otra pestaña (`target="_blank"`, `rel="noopener noreferrer"`).
   - Junto al enlace va una **pista** de qué fila elegir en la tabla Horarios de autobusing, por ejemplo: «En autobusing, elige la fila 10:30 → 12:30.» Y una frase fija: «Si no aparece, este bus no se vende ahí.»
   - Si ya se consultaron las plazas y la fila emparejada tiene otra llegada (`matchedArrival`), la pista usa la llegada de autobusing, porque es la que el usuario verá en la tabla.
   - Si el bus es un refuerzo (ver el objetivo 2), la pista lo dice: «Hay 2 filas 05:15 → 06:35; las dos son este horario.»
2. **Plazas de los buses de refuerzo, por separado** (decisión del usuario).
   - Cuando autobusing tenga **varias filas con salida y llegada exactas** a las de un bus de samar.es, se consultan las plazas de cada fila y se muestran por separado, en el orden de la tabla de autobusing. Por ejemplo: «2 autobuses a esta hora: 1.º 3 libres de 65 · 2.º 4 libres de 60».
   - Cada fila puede ser `count`, `full` o `available`, igual que hoy.
   - El orden importa: así el usuario sabe qué fila elegir en autobusing si quiere el bus con más sitio.
   - Cada fila se consulta con una sesión nueva (pasos 1 a 5 completos), y las sesiones pueden ir en paralelo dentro del mismo presupuesto `SEATS_BUDGET_MS`.

## Lo que no se hace (non-goals)

- No se compra desde nuestra web: ni pago, ni datos del viajero, ni nada de autobusing «incrustado» o reenviado por nuestro servidor.
- No se salta el paso 1 de autobusing ni se elige el bus por el usuario: quien elige la fila en la tabla Horarios es el propio usuario.
- No se cambia la fuente de los horarios. samar.es sigue dando la lista, las paradas, los avisos y el tipo de bus. autobusing se sigue consultando solo bajo demanda.
- No se consulta autobusing al buscar para marcar de antemano qué buses no se venden online. Costaría unas 3 peticiones por búsqueda. Queda como idea para más adelante.
- No se cambia el emparejamiento por descarte ni el caso en el que samar.es tiene dos buses idénticos (`isAmbiguous`).

## Lo que no puede pasar (anti-goals)

- Que el usuario pague un bus distinto del de la tarjeta por culpa de nuestra web.
- Que se muestren plazas de otro bus. Sigue valiendo el principio del proyecto: ante la duda, «no disponible».
- Que nuestra web toque dinero o datos personales.
- Más peticiones a terceros en cada búsqueda. El enlace de compra no hace ninguna petición desde nuestro servidor.

## Restricciones

- Los tests nunca consultan samar.es ni autobusing (ADR-015). Las pruebas de `lib/` usan fixtures y `fetchImpl` simulado, y las e2e simulan `/api/seats` con `page.route`.
- `maxDuration` de la ruta: 30 s. El presupuesto del recorrido a autobusing es de 18 s. Con el refuerzo, las sesiones de cada fila van en paralelo, así que el tiempo total apenas cambia.
- Comentarios didácticos en todo el código (ADR-016): los cambios en `app/` y `lib/` llevan comentarios del mismo estilo.
- Accesibilidad: el enlace tiene que avisar de que abre otra web en otra pestaña, por ejemplo con el texto «Comprar en autobusing» y un texto para lectores de pantalla «(se abre en otra pestaña)». La zona de plazas ya es `aria-live`. Deben seguir pasando los tests de axe y de `movil`.
- Commits sin líneas `Co-Authored-By` ni «Generated with».

## Decisiones tomadas por mí (revisables)

- **Si falla una fila del refuerzo, falla todo el resultado.** Si alguna fila devuelve `ok: false` (por ejemplo, «La respuesta no corresponde al bus»), el resultado entero es `ok: false` con ese motivo. Si alguna lanza un error, se devuelve el 502 de siempre y el usuario ve «Reintentar». Es más simple que mostrar resultados parciales, y en la práctica es raro.
- **Forma del resultado:** una variante nueva de `SeatsResult` con `ok: true`, por ejemplo `kind: 'several'` con `buses: Array<count | full | available>`. Los demás casos quedan como están. Quien lo construya puede elegir otra forma, siempre que `TripCard` distinga los casos sin adivinar.
- **La pista depende de si ya se consultaron las plazas.** Antes de consultarlas, la pista es siempre la de samar.es: «elige la fila {salida} → {llegada}». Solo después se sabe si hay refuerzo o si la llegada de autobusing es otra, y entonces la pista se actualiza. No se hace ninguna petición extra para afinarla.
- **Límite de filas.** Como mucho se consultan 3 filas idénticas. Si hay más, el resultado es `ok: false` («Demasiadas filas iguales en autobusing»), para no lanzar una cantidad de sesiones sin control.
- **Ida y vuelta.** Si el usuario elige «Ida/Vuelta» en el paso 1, la pista solo le sirve para la ida. Para la vuelta tendrá que elegir él solo. No se añade nada para la vuelta.
- **Motivo de «no encontrado».** Tras el cambio, el `null` de `pickRow` solo se da cuando de verdad no hay fila, o cuando el descarte es dudoso. Ese segundo caso pasa a decir «Varias filas posibles en autobusing», para no repetir el error de llamar «no encontrado» a algo que sí está.
- **Ubicación del enlace:** justo debajo de la zona de plazas de `TripCard`, pero fuera de su región `aria-live`, para que los lectores de pantalla no anuncien el enlace cada vez que cambian las plazas. Tiene el mismo tamaño de control que «Ver plazas libres». La pista va debajo en texto pequeño (`.note`). Los estilos salen de los tokens de `theme.css`.
- **Versión de la caché.** Se sube `SCHEMA_VERSION`, porque cambia la forma de lo que se guarda en la caché de plazas. Como efecto, también se invalida la caché de horarios una vez.

## Lo que queda para quien lo construya

- Cómo separar `fetchSeats` para poder repetir los pasos 1 a 5 por fila, por ejemplo con una función que recibe el `nromov`, sin duplicar el código de la sesión.
- Los textos exactos, dentro del tono actual de la web.
- Comprobar a mano, una sola vez y en un navegador real, que el enlace sin `hora_ida` lleva a la tabla Horarios **en los dos sentidos**. Solo se ha comprobado de Talavera a Madrid y con curl.

## Tests mínimos

- `tests/autobusing.test.ts`:
  - `pickRow`, o la función que lo sustituya, con dos filas exactas devuelve las dos filas.
  - `fetchSeats` con el fixture del refuerzo hace dos recorridos con sesiones (cookies) separadas, elige `nromov` distintos y devuelve las plazas de cada fila en orden.
  - Si una fila falla, el resultado es `ok: false`.
- `tests/e2e/tarjeta.spec.ts`:
  - El enlace «Comprar» está en todas las tarjetas, con el `href` correcto (sin `hora_ida`) y `target="_blank"`.
  - La pista muestra salida → llegada.
  - Con `/api/seats` simulado en formato refuerzo, se ven las plazas de cada fila por separado.
- Deben seguir pasando: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` y las e2e de `tarjeta`, `a11y` y `movil` en Chromium.

## Documentación

- Nota del proyecto (`second-brain/Proyectos/horarios-buses/horarios-buses.md`):
  - ADR nuevo «Compra por enlace a la tabla Horarios de autobusing, sin `hora_ida`».
  - Ampliar ADR-002 con el caso del refuerzo.
  - Glosario: «refuerzo».
  - Quitar o actualizar el riesgo de los «no disponible» por filas duplicadas.
- README: una línea sobre el botón «Comprar».
