# Investigación: fuentes de datos de Samar Madrid ↔ Talavera de la Reina

Fecha: 2026-11-02.

Peticiones a samar.es: **30 de 40**.
- 27 mías: 3 con curl antes de tener navegador, 9 desde el navegador (portada, 7 autocompletados y resultados) y 15 con curl. De estas 15, 5 se repitieron por un fallo de mi script en zsh.
- 3 del investigador.
- Aparte, el navegador cargó los recursos estáticos (JS, CSS e imágenes) de las dos páginas que abrió.

Peticiones a `regular.autobusing.es`: unas 11. Son 4 desde el navegador (portada de compra, POST, plazas y una petición de registro de errores) y 7 con curl (`robots.txt`, la secuencia de 3 pasos y 3 más para una segunda expedición).

No apareció ningún CAPTCHA, desafío ni bloqueo en ninguno de los dos dominios.

## Resumen y recomendación

- **samar.es tiene una página de resultados pública con una URL GET**: `/horarios/autobuses/{slug-origen}/{slug-destino}/{idOrigen}/{idDestino}?IsOneWay=true&OutboundDate=AAAA-MM-DD`. La genera el servidor y **cada expedición trae su código de línea, su número de expedición, todas las paradas con hora, los días de la semana y el precio**. Se puede reproducir con un `curl` sin cookies ni token, y `robots.txt` no excluye esa ruta.
- **Plazas:** no aparecen en samar.es, pero **sí en el paso «Plazas» del motor de venta `regular.autobusing.es`**, antes de pedir ningún dato personal. Es un mapa de 50 asientos con estado `libre` u `ocupado`, generado por el servidor. Por ejemplo, la 909 de las 10:00 del 3/11 tenía 36 libres, 14 ocupados y 50 en total. Se puede reproducir con curl, sin CAPTCHA: una cookie de sesión y **3 peticiones para la primera expedición y 2 más por cada expedición adicional**. Ver [Plazas](#plazas-autobusing).
- **Los códigos de línea se confirman.** 909 = "MADRID-TALAVERA (DIRECTO)" y 910 = "MADRID-TALAVERA (RUTA)", tanto en el GTFS como en la web (`909 - 909`). También unen Madrid y Talavera las líneas 901, 902, 903, 904, 905 y 907.
- **Los IDs de parada de la web son los mismos `stop_id` del GTFS:** 341 Estación Sur, 261 Talavera, 1027 T1, 1119 T4. Príncipe Pío (831) existe en la web, pero hoy no tiene ningún servicio a Talavera.
- **El GTFS caducó el 27/10/2026**, pero coincide en 45 de las 46 salidas de los dos días que he comparado.
- **Recomendación: B**, en una versión que no estaba en la lista original. La fuente principal sería esa página HTML, pedida con curl y analizada en el servidor, sin `/api/` y sin navegador headless. El GTFS quedaría como respaldo y para comprobar los datos. Ver [Recomendación](#recomendación).

## Endpoints

| # | URL | Método | Parámetros | Cabeceras / cookies | Respuesta | Línea | Paradas | Estación | Precio | Plazas |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `https://www.samar.es/horarios/autobuses/{slugO}/{slugD}/{idO}/{idD}` | GET | `IsOneWay=true`, `OutboundDate=AAAA-MM-DD`; con ida y vuelta añade `ReturnDate` [no verificado] | **Ninguna.** Basta un `User-Agent` de navegador (con otro User-Agent [no verificado]). Responde con `Cache-Control: no-cache, no-store` y pone una cookie antiforgery que no hace falta | HTML de unos 540 KB, con una tarjeta `div.journey-card` por expedición | sí (`909 - 909` en el itinerario) | **sí**, todas las del tramo, con hora | sí (nombre e ID en la URL) | sí (`data-price`) | **no** |
| 2 | `https://www.samar.es/api/app/public/stops-dropdown?name={texto}&maxResultCount=10` | GET (XHR) | `name`, `maxResultCount` | El navegador envía `RequestVerificationToken` y `X-Requested-With`. **No lo he probado con curl** porque robots.txt excluye `/api/` | JSON `[{"text","value"}]` | — | solo nombre e ID | — | — | — |
| 3 | `https://www.samar.es/?handler=Search` | POST (formulario) | `Search.OriginStopCode`, `Search.DestinationStopCode`, `Search.OutboundDate` (AAAA-MM-DD), `Search.IsOneWay`, `__RequestVerificationToken` | Cookie antiforgery más el token | Redirige al endpoint 1 | — | — | — | — | — |
| 4 | `https://regular.autobusing.es/venta/inicio_info?empresa=samar&origen_codigo=0108&destino_codigo=0831&hora_ida=HH:MM&fecha_ida=AAAA-MM-DD` | GET | Códigos de compra de la tarjeta de samar.es (`0108` Estación Sur, `0831` Talavera) | Crea la cookie `rack.session` | HTML con un formulario. `venta[origen_id]=287` va oculto; el destino queda en la sesión | — | — | — | sí | — |
| 5 | `https://regular.autobusing.es/venta/inicio` | POST (formulario) | `hora_ida`, `venta[origen_id]`, `venta[fecha_ida]=DD/MM/AAAA`, `venta[fecha_vta]=`, `venta[cantidad]=1`, `venta[tipo_iyv]=ida` | Cookie `rack.session`. Sin token CSRF | `302` → `/venta/plazas` | — | — | — | — | — |
| 6 | `https://regular.autobusing.es/venta/horarios` | GET | — | `rack.session` | HTML: tabla de todas las salidas del día (hora de salida y llegada, precio y `nromov`) | no | no | no | sí | **no** |
| 7 | `https://regular.autobusing.es/venta/horarios` | POST (formulario) | `venta[elegir_plazas_ida]=t`, `venta[nromov_ida]={nromov}` | `rack.session` | `302` → `/venta/plazas` | — | — | — | — | — |
| 8 | `https://regular.autobusing.es/venta/plazas` | GET | — | `rack.session` | HTML de unos 10 KB: `<span id="asiento_N" class="asiento [normal\|pasillo] libre\|ocupado">N</span>` | no | no | no | sí | **sí** |

**Datos de cada tarjeta** (`div.journey-card`, ver `samples/tarjeta_expedicion_910047.html`):
- Atributos `data-*`:
  - `expedition`: el número de expedición. Sus 3 primeras cifras son la línea, por ejemplo `909001`.
  - `line-id` (GUID), `departure-time`, `arrival-time`, `price`, `can-buy-online`, `origin-purchase-code`, `destination-purchase-code`, `direction`.
- Insignias de días de la semana (`.day-badge`) y clase de servicio (`Expert Class`).
- Itinerario (`.itinerary-collapse`):
  - Línea (`<div class="small text-muted mb-2">909 - 909</div>`).
  - Lista `.itinerary-stop` con nombre y hora de cada parada.
  - `data-waypoints` con las coordenadas de las paradas intermedias.
- Avisos generales en la cabecera de la página, en texto libre. Por ejemplo: «LOS DÍAS 1 Y 2 DE NOVIEMBRE SE REALIZARÁN LOS HORARIOS DE DOMINGO…».

**Comportamiento comprobado:**
- **El itinerario solo incluye el tramo que se busca.** La 909528 (Talavera 05:45) termina en Estación Sur si se busca Talavera → Estación Sur, pero si se busca Talavera → T4 sigue Estación Sur > T1 > T4. Para saber qué buses van al aeropuerto hay que buscar ese destino.
- **Si el slug es incorrecto, el servidor responde `301`** a la URL con el slug correcto. Los slugs salen del nombre de la parada: sin tildes, en minúsculas y con `-` en lugar de lo que no sea letra o número. Para no hacer dos peticiones conviene enviar ya el slug correcto.
- **Si no hay servicio, responde `200` con «0 resultados»**, no un error. Pasa con Príncipe Pío ↔ Talavera.
- A 14 días vista (16/11) devuelve 45 expediciones. No he probado más adelante.
- La 907 lleva `data-price="0.00"` y muestra «Precio no disponible», aunque tiene `data-can-buy-online="true"`. Las 94 tarjetas tienen ese atributo a `true`.

**Motor de reservas:** el buscador y los horarios son de Samar (ASP.NET Core y ABP Framework, `Server: Kestrel`). La venta se hace en **autobusing.es**, de otra empresa, y aparece también en el enlace «COMPRA ON-LINE» de la portada.

**IDs de parada** (web = GTFS):

| Parada | ID |
|---|---|
| Madrid-Estación Sur | 341 |
| Madrid Príncipe Pío | 831 (solo en la web) |
| Madrid-Avenida América | 953 |
| Aeropuerto Barajas T1 | 1027 |
| Aeropuerto Barajas T4 | 1119 |
| Talavera de la Reina | 261 |
| Santa Olalla | 873 (GTFS; en la web aparece por nombre en el itinerario) |

**Enlace de compra:** se puede usar la URL del endpoint 1, que abre la búsqueda ya hecha en samar.es, o enlazar directamente a la expedición con el endpoint 4.

## Reproducción con curl

```bash
UA='Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'

# Resultados con itinerario completo. Sin cookies ni token.
curl -sS -A "$UA" -o resultados.html \
  'https://www.samar.es/horarios/autobuses/madrid-estacion-sur/talavera-de-la-reina/341/261?IsOneWay=true&OutboundDate=2026-11-03'
python -I scripts/parse_resultados.py resultados.html --json resultados.json

# Sentido contrario y aeropuerto
curl -sS -A "$UA" -o r.html 'https://www.samar.es/horarios/autobuses/talavera-de-la-reina/madrid-estacion-sur/261/341?IsOneWay=true&OutboundDate=2026-11-06'
curl -sS -A "$UA" -o r.html 'https://www.samar.es/horarios/autobuses/talavera-de-la-reina/aeropuerto-barajas-t4/261/1119?IsOneWay=true&OutboundDate=2026-11-06'
```

Resultados verificados:

| Búsqueda | Fecha | HTTP | Expediciones |
|---|---|---|---|
| Estación Sur → Talavera | 03/11 | 200 | 46 |
| Talavera → Estación Sur | 06/11 | 200 | 48 |
| Talavera → T1 | 06/11 | 200 | 1 |
| Talavera → T4 | 06/11 | 200 | 1 |
| T1 → Talavera | 03/11 | 200 | 1 |
| Príncipe Pío → Talavera | 03/11 | 200 | 0 |
| Talavera → Príncipe Pío | 06/11 | 200 | 0 |
| Estación Sur → Talavera | 16/11 | 200 | 45 |

Conjunto mínimo: **una petición GET con cualquier User-Agent de navegador, sin cookies ni token.** No hay nada que caduque. El endpoint `stops-dropdown` no hace falta porque los IDs son fijos y los mismos del GTFS.

## Plazas (autobusing)

`regular.autobusing.es` es el motor de venta: Ruby/Rack sobre `nginx + Phusion Passenger 6.0.2`, sin `robots.txt` (404). En los análisis del navegador aparece el dominio `umami.app.sinfeauto.com`, así que quizá el proveedor sea Sinfeauto [no verificado].

El proceso tiene estos pasos: Inicio → Horarios → **Plazas** → Viajeros → Resumen → Pago → Resultado. Las plazas se ven en el tercero, sin haber metido ningún dato. Entrar en el mapa no reserva nada: no aparece ningún asiento «elegido».

Recorrido con el navegador, autorizado expresamente por el usuario, y repetido con curl:

```bash
UA='Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'; A=https://regular.autobusing.es
# 1) Abre la sesión. Origen, destino, hora y fecha salen de una tarjeta de samar.es (data-*-purchase-code, data-departure-time)
curl -sS -A "$UA" -c jar -b jar -o inicio.html "$A/venta/inicio_info?empresa=samar&origen_codigo=0108&destino_codigo=0831&hora_ida=10:00&fecha_ida=2026-11-03"
# 2) Envía el formulario (origen_id sale de inicio.html, input #venta_origen_id) → 302 /venta/plazas de esa hora
curl -sS -A "$UA" -c jar -b jar -o /dev/null --data-urlencode 'hora_ida=10:00' --data-urlencode 'venta[origen_id]=287' \
  --data-urlencode 'venta[fecha_ida]=03/11/2026' --data-urlencode 'venta[fecha_vta]=' --data-urlencode 'venta[cantidad]=1' \
  --data-urlencode 'venta[tipo_iyv]=ida' "$A/venta/inicio"
# 3) Mapa de asientos
curl -sS -A "$UA" -c jar -b jar -o plazas.html "$A/venta/plazas"
python -I -c "import re,sys,collections;h=open(sys.argv[1]).read();print(collections.Counter(c.split()[-1] for c in re.findall(r'id=\"asiento_\d+\" class=\"asiento ([^\"]*)\"',h)))" plazas.html
# Otra expedición de la misma sesión: nromov sale de GET /venta/horarios
curl -sS -A "$UA" -c jar -b jar -o horarios.html "$A/venta/horarios"
curl -sS -A "$UA" -c jar -b jar -o /dev/null --data-urlencode 'venta[elegir_plazas_ida]=t' --data-urlencode 'venta[nromov_ida]=4119481' "$A/venta/horarios"
curl -sS -A "$UA" -c jar -b jar -o plazas.html "$A/venta/plazas"
```

Resultados verificados (03/11/2026, Estación Sur → Talavera, autobús de 50 plazas):

| Expedición | Libres | Ocupadas | Total | Origen |
|---|---|---|---|---|
| 909 de las 10:00 | 36 | 14 | 50 | navegador y curl (mismo resultado) |
| 910 de las 07:30 (`nromov` 4119481) | 31 | 19 | 50 | curl |

En la leyenda hay otros dos estados que no han salido en estas pruebas: `elegido` («Reservado») y `no_disponible`. El tipo de asiento va en la clase: `normal` o `pasillo`.

**autobusing y samar.es no tienen la misma lista de salidas** (03/11, Estación Sur → Talavera):
- autobusing muestra 41 filas y samar.es 46 expediciones.
- **Solo en autobusing:** 09:00–10:20, 17:30–18:50, 18:45–20:05, 20:15–22:10, 20:30–21:50 y 21:30–22:50.
- **Solo en samar.es:** 907 de las 07:15, 909 de las 08:30–09:50, 909 de las 12:00–13:20, 907 de las 16:30, 910 de las 20:15–22:00, 910 de las 21:30–23:20 y 910 de las 23:00–00:45.
- autobusing **junta en una fila las salidas que coinciden en hora**. Por ejemplo, las 901, 902 y 903 de las 08:00 aparecen como una sola. No sé si es el mismo autobús físico [no verificado].
- autobusing no muestra línea, paradas ni número de expedición, solo `nromov`. Para unir las dos fuentes solo hay **hora de salida y hora de llegada**, y eso no basta cuando coinciden varias.
- No sé cuál de las dos fuentes es la real en las diferencias [no verificado].

**Coste para un cron:**
- Plazas de todas las salidas de un día y un sentido: 3 + 2 × 41 ≈ **85 peticiones**.
- Plazas de una sola expedición, a petición del usuario: **3 peticiones** (unos 2 s con las pausas).

## GTFS

| | |
|---|---|
| Fichero oficial | NAP `https://nap.transportes.gob.es/api/Fichero/download/1165` → **`401`** sin cuenta |
| Copia pública | `https://files.mobilitydatabase.org/mdb-2712/latest.zip` (`Last-Modified: 2026-07-28`, 69 KB), en `samples/gtfs/samar_mdb-2712_20260728.zip` |
| Vigencia | Del 2026-07-25 al 2026-10-27 (`calendar.txt`). No trae `calendar_dates.txt` ni `feed_info.txt`. **Caducado** |
| Contenido | Agencias `SAM` y `LAV`, 108 rutas, 602 paradas y 1039 trips. Sin tarifas |
| Licencia | LDA del MITRAMS: uso comercial con atribución (según el investigador; texto exacto [no verificado]) |
| Rarezas | Espacios tras las comas, horas `00:xx` después de medianoche en lugar de `24:xx`, paradas repetidas seguidas y entidades HTML en los nombres |

- **Códigos de línea:** son el `route_short_name` (909, 910…), sin el cero inicial de los agregadores.
- **Santa Olalla:** `stop_id` 873.
- **Príncipe Pío:** no está en el GTFS.

**Comparación con la web**, tomando como referencia los días de la semana del GTFS caducado:

| | GTFS | Web | Coinciden | Solo en la web |
|---|---|---|---|---|
| Martes, Madrid → Talavera | 45 | 46 | 45 | 910 de las 00:30 |
| Viernes, Talavera → Madrid | 45 | 46 | 45 | 909 de las 22:45 |

Ninguna salida aparece solo en el GTFS. Se parecen mucho, pero el GTFS **no recoge cambios de última hora**: festivos como «1 y 2 de noviembre con horario de domingo», obras o salidas nuevas. Si lo que importa es tener los datos del día, el GTFS no basta.

## Tabla de clasificación y umbrales

Datos reales de la web: Madrid → Talavera del 03/11 (46 expediciones) más Talavera → Madrid del 06/11 (48). "Intermedias" son las paradas que hay entre las dos estaciones buscadas.

| Línea | Origen ↔ destino | Expediciones | Intermedias (nº de expediciones) | Santa Olalla | Duración (min) |
|---|---|---|---|---|---|
| 909 | Estación Sur ↔ Talavera | 46 | 0 (42), 1 (2), 2 (1), 5 (1) | 4 de 46 | 65–120 (80 la mayoría) |
| 904 | Estación Sur ↔ Talavera | 3 | 0 | no | 80–120 |
| 905 | Estación Sur ↔ Talavera | 2 | 0 | no | 90 |
| 901 / 902 / 903 | Estación Sur ↔ Talavera (Alcorcón y Móstoles) | 12 | 2 | no | 105–120 |
| 910 | Estación Sur ↔ Talavera | 26 | 3 (2), 5, 6, 7, 9 (2), 10 (10), 11, 13 (8) | **26 de 26** | 95–120 |
| 907 | Estación Sur ↔ Talavera (Torrijos y Puebla de Montalbán) | 5 | 16–19 | no | 165–200 |
| 909 (528 y 029) | T1 / T4 ↔ Talavera, pasando por Estación Sur | 1 por sentido | 1–2 | no | 125–150 |

Duración según el número de intermedias (web):

| Intermedias | 0 | 1 | 2 | 3 | 5 | 6 | 7 | 9 | 10 | 11 | 13 | 16–19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Expediciones | 47 | 2 | 13 | 2 | 2 | 1 | 1 | 2 | 10 | 1 | 8 | 5 |
| Duración (min) | 65–120 | 80 | 80–120 | 95 | 120 | 110 | 105 | 110–115 | 105–115 | 115 | 120 | 165–200 |

**Umbrales propuestos.** Se aplican a cada expedición según sus paradas, no según el código de línea, porque 4 de las 46 expediciones de la 909 paran en Santa Olalla. Los datos del GTFS dan la misma distribución.

| Etiqueta | Regla |
|---|---|
| **Directo** | 0 intermedias |
| **Semi-ruta** | de 1 a 6 intermedias |
| **Ruta completa** | 7 o más intermedias |
| **Abono** | hay una parada llamada «Santa Olalla» en el itinerario |
| **Estación** | la de la búsqueda (341, 1027, 1119). Una expedición del aeropuerto aparece también en la búsqueda de Estación Sur con el mismo `expedition`, así que se puede fusionar por ese número |

- Hay un salto natural entre 6 y 7 intermedias: la 910 con su recorrido habitual empieza en 7.
- **La duración no sirve para separar categorías.** Hay directos de 120 min y rutas de 95.

## robots.txt y condiciones

- `robots.txt`: `Allow: /` y `Disallow: /Backoffice/, /Account/, /api/, /swagger/, /Abp/, /libs/`. **`/horarios/` está permitido**, mientras que `/api/` (autocompletado) está excluido.
- samar.es **no publica aviso legal, condiciones de uso ni política de cookies** (`/aviso-legal` da 404). Solo pone «© 2026 SAMAR - Todos los derechos reservados» (según el investigador).
- No hay protección anti-bot: ni CAPTCHA ni desafío. Las respuestas llevan `Cache-Control: no-store`, así que no hay caché de CDN y cada consulta llega al servidor de Samar.
- El GTFS del NAP tiene una licencia clara (LDA), pero descargarlo del NAP oficial requiere cuenta.

## Recomendación

**Opción B, con la página HTML de resultados en lugar de la API.**
- Es la única fuente con los datos del mismo día: refleja festivos, salidas nuevas y cambios de estación, que el GTFS caducado no recoge.
- Da paradas y horas de cada expedición en **una sola petición GET por trayecto y fecha**, sin token ni navegador.
- Está en una ruta que `robots.txt` permite.

**Peticiones del cron:** 6 trayectos al día (Estación Sur, T1 y T4, cada uno en los dos sentidos).

| Frecuencia | Peticiones por ejecución | Peticiones al día |
|---|---|---|
| Cada 15–30 min, 7 días vista | 42 | 2.000–4.000 |
| 2 veces al día, 7 días vista | 42 | 84 |
| Lo anterior, más el día de hoy cada hora | — | unas 230 |

Recomiendo una de las dos últimas filas. Los horarios no cambian cada 15 minutos, y sin plazas no hay nada que deba refrescarse tan a menudo. Los trayectos del aeropuerto (1 expedición por sentido) podrían consultarse una vez al día.

**GTFS:** úsalo como respaldo si samar.es falla o cambia su HTML, y para comprobar los datos de vez en cuando. No como fuente principal.

**Plazas: consultarlas a petición del usuario, no en el cron.** Cuando alguien abre una expedición, el backend hace las 3 peticiones a autobusing con los `purchase-code` y la hora de la tarjeta, y guarda el resultado unos minutos.
- Si van en el cron, son unas 85 peticiones por día y sentido, con datos que caducan enseguida.
- Avisar en la web de que es un dato «en el momento de la consulta».
- Si la hora es ambigua (varias salidas a la misma hora), no mostrar plazas, o mostrar las de la única fila que devuelva autobusing con su hora de llegada.

## Riesgos

1. **Depender del HTML.** Si Samar cambia el marcado, el parser se rompe sin avisar. El cron debería dar error si una búsqueda que antes traía datos devuelve 0 tarjetas, o si falta `expedition` o la lista de paradas.
2. **Uso automatizado sin condiciones escritas.** Robots.txt lo permite, pero el copyright está reservado. Conviene un volumen bajo, un User-Agent identificable y, si se puede, pedir permiso a Samar.
3. **Peso de cada respuesta:** unos 540 KB, sin caché. Con 84 peticiones al día son unos 45 MB.
4. **Itinerario limitado al tramo buscado.** Para etiquetar las expediciones del aeropuerto hacen falta las búsquedas propias del aeropuerto.
5. **Avisos en texto libre** como «horarios de domingo», que no se sabe si ya están aplicados en los resultados [no verificado]. Convendría mostrarlos tal cual en la web.
6. **Plazas con autobusing:**
   - Cada consulta abre una sesión de venta en un sistema de terceros, sin `robots.txt` ni condiciones vistas.
   - Recorre un flujo de 3 pasos que depende del estado de la sesión, así que es frágil.
   - Hay que emparejar las salidas por hora, porque autobusing no da línea ni expedición, y las dos listas no coinciden.
   - Un abuso (un cron cada 15 minutos para todas las salidas) podría acabar en un bloqueo.
7. **Las insignias de días son el patrón semanal, no la confirmación de que el bus sale ese día.** Los resultados ya vienen filtrados por fecha (el martes y el viernes devuelven expediciones distintas), pero no he comprobado cómo trata los festivos [no verificado].

## Preguntas abiertas

- [ ] ¿Qué lista de salidas es la buena, la de samar.es o la de autobusing, en las 13 diferencias del 03/11? Habría que comprobarlo en taquilla o con un viaje real.
- [ ] Las plazas de un trayecto con paradas intermedias (por ejemplo Estación Sur → Santa Olalla en la 910): ¿son las del tramo o las de todo el autobús? No lo he comprobado.
- [ ] ¿Cómo se comporta autobusing cuando varias líneas salen a la misma hora (08:00 de 901, 902 y 903)? ¿Es un solo autobús?
- [ ] ¿Se mantienen los resultados para festivos o fechas lejanas (más de 30 días)? Solo he probado 1, 4 y 14 días vista.
- [ ] Príncipe Pío no tiene ningún servicio a Talavera ahora. ¿Lo mantienes como etiqueta por si vuelve, o lo quitas?
- [ ] ¿Se muestran la 907 (vía Torrijos, unas 3 h, «Precio no disponible») y las 901 a 905 (que pasan por Talavera camino de Extremadura, con precio de 11,33 €)?
- [ ] ¿El `User-Agent` es obligatorio? No he probado sin él para ahorrar peticiones.
- [ ] Texto exacto de la atribución de la licencia LDA, por si se usa el GTFS.

## Ficheros

- **`samples/`:**
  - `resultados_*.json`: 3 expediciones por fichero, más una de aeropuerto.
  - `stops-dropdown_madrid.json`: token cambiado por `<REDACTED>`.
  - `tarjeta_expedicion_910047.html`: el HTML de una tarjeta.
  - `autobusing_plazas_909-1000_2026-11-03.html`: el mapa de asientos, recortado.
  - `autobusing_horarios_2026-11-03.html`: la tabla de salidas con `nromov`, recortada. La cookie de sesión está cambiada por `<REDACTED>`.
- **`samples/gtfs/`:** el zip (69 KB) y `expediciones_madrid_talavera.csv`.
- **`scripts/parse_resultados.py`:** HTML de resultados → JSON.
- **`scripts/analiza_gtfs.py`:** GTFS → expediciones Madrid–Talavera.
- **Nota del investigador:** `/home/baialbert/second-brain/Investigaciones/fuentes-datos-samar-madrid-talavera.md`.
