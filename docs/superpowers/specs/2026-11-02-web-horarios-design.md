# Diseño: web de horarios Samar Madrid Estación Sur ↔ Talavera

Fecha: 2026-11-02. Base técnica: `docs/investigacion-samar.md`. Las muestras reales están en `samples/` y los parsers de referencia (Python) en `scripts/`.

## Intención

El usuario va a menudo de Madrid a Talavera de la Reina y al revés. Antes de ir a la estación quiere ver qué buses salen ese día y elegir uno. Para elegir le importa:
- si el bus es directo o cuántas paradas hace;
- si para en Santa Olalla, porque eso decide si sirve el abono;
- si al bus que tiene pensado le quedan plazas.

La web oficial de Samar no muestra esto de un vistazo, y las plazas solo se ven entrando en el proceso de compra. Los horarios tienen que estar **al día**: una fuente desactualizada, como el GTFS caducado, es justo lo que se quiere evitar.

## Objetivos

1. Página única en español, pensada para el móvil.
   - Dos botones para el trayecto: «Madrid Estación Sur → Talavera» y «Talavera → Madrid Estación Sur».
   - Un selector de fecha.
   - El botón «Buscar buses».
2. Al buscar, se muestran **todos los buses que samar.es da para ese día y ese sentido**, en tarjetas (la opción B de los bocetos). Cada tarjeta lleva:
   - hora de salida y de llegada, duración y número de línea;
   - **número de paradas**, contando origen y destino;
   - etiqueta **«Directo»** si hay exactamente 2 paradas;
   - etiqueta **«Santa Olalla»** si alguna parada del itinerario se llama así;
   - **itinerario** completo, con la hora de cada parada.
3. Un interruptor **«Ocultar itinerarios»** pliega las listas de paradas y deja una vista compacta.
4. Cada tarjeta tiene un botón **«Ver plazas libres»**. Al pulsarlo se consulta solo ese bus y se muestran **libres, ocupadas y totales**, con la hora de la consulta.

## Fuera del alcance (non-goals)

- Otras estaciones: Príncipe Pío (sin servicio ahora), Aeropuerto T1/T4 o Santa Olalla como origen o destino.
- Buses que salen en autobusing pero no en samar.es. Puede ser una mejora futura.
- Consultar plazas automáticamente, en bloque o con un cron.
- Precio, compra, enlace de compra, cuentas o favoritos.
- Etiquetas «Semi-ruta» o «Ruta completa». Solo se pide el número de paradas y «Directo».
- Vista de ida y vuelta.
- GTFS como fuente. No se usa.

## Lo que haría que fracase aunque funcione

- Mostrar un horario o unas plazas que no sean de ese bus. **Ante la duda, «no disponible», nunca un número dudoso.**
- Hacer muchas peticiones a Samar o a autobusing: con un cron, en bloque, por pulsar el botón muchas veces o porque entren desconocidos o bots.
- Hacer algo que inicie o continúe una compra más allá del paso «Plazas»: elegir asiento, enviar viajeros o pagar.
- Que la búsqueda tarde mucho o falle cuando sale publicada en Vercel.

## Decisiones tomadas (del usuario)

- **Plataforma:** Vercel o una parecida. Tecnología elegida por mí: **Next.js (App Router, TypeScript)**, sin librerías de interfaz ni de estilos, con CSS propio. El usuario dio vía libre: «continúa con lo que creas adecuado».
- **Sin cron.** Las consultas se hacen cuando el usuario pulsa el botón.
- **Caché de horarios de 1 a 2 horas**, compartida entre usuarios.
- **Plazas solo bajo demanda**, bus a bus.
- **Solo buses de samar.es.**
- Etiquetas: «Directo» (2 paradas) y «Santa Olalla».

## Fuentes de datos (verificadas, ver la investigación)

### Horarios e itinerarios: samar.es

`GET https://www.samar.es/horarios/autobuses/{slugO}/{slugD}/{idO}/{idD}?IsOneWay=true&OutboundDate=AAAA-MM-DD`

| Sentido | Ruta fija |
|---|---|
| Ida | `madrid-estacion-sur/talavera-de-la-reina/341/261` |
| Vuelta | `talavera-de-la-reina/madrid-estacion-sur/261/341` |

- Sin cookies ni token. Basta un `User-Agent` de navegador.
- Devuelve unos 540 KB de HTML con un `div.journey-card` por bus. Lo que hay que sacar está en `scripts/parse_resultados.py` y en `samples/tarjeta_expedicion_910047.html`:
  - Atributos: `data-expedition`, `data-departure-time`, `data-arrival-time`, `data-origin-purchase-code`, `data-destination-purchase-code`.
  - Duración: `.time-duration`.
  - Línea: `<div class="small text-muted mb-2">909 - 909</div>`.
  - Paradas: `.itinerary-stop`, con su `.itinerary-stop-name` y su `.itinerary-stop-time` (formato `HH:MMh`).
- El itinerario incluye solo el tramo buscado, que es lo que queremos.
- Si no hay buses, responde `200` con «0 resultados».
- **Comprobación del parser:** el número de tarjetas tiene que coincidir con el texto «N resultados» de la página. Si no coincide, o si hay tarjetas sin `expedition` o con menos de 2 paradas, es un error: se muestra un error y no se guarda en caché.

### Plazas: regular.autobusing.es (5 peticiones con una cookie de sesión)

*(Decisión mía tras la revisión.)* Comparar solo la hora de salida no basta. El 03/11, samar.es tiene la 910 de las 20:15 que llega a las 22:00, y autobusing tiene una de las 20:15 que llega a las 22:10. Por eso se elige el bus en `GET /venta/horarios`, comparando **salida y llegada**:

1. `GET /venta/inicio_info?…`. Guardar la cookie y leer `venta[origen_id]`.
2. `POST /venta/inicio`. No seguir la redirección.
3. `GET /venta/horarios`. Buscar las filas cuya salida y llegada coincidan con las del bus de samar.es. **Si no hay exactamente una, «Plazas no disponibles».**
4. `POST /venta/horarios` con `venta[elegir_plazas_ida]=t` y `venta[nromov_ida]={nromov}`.
5. `GET /venta/plazas`. Validar la fecha y la hora, y contar los asientos.

Los pasos 1 a 3 abren la sesión igual que el flujo original de 3 peticiones, que se describe a continuación.

1. `GET /venta/inicio_info?empresa=samar&origen_codigo={purchase-code O}&destino_codigo={purchase-code D}&hora_ida=HH:MM&fecha_ida=AAAA-MM-DD`
   - Guardar la cookie `rack.session`.
   - Leer del HTML el valor de `input#venta_origen_id`.
2. `POST /venta/inicio` (`application/x-www-form-urlencoded`) con:
   - `hora_ida=HH:MM`
   - `venta[origen_id]={valor leído}`
   - `venta[fecha_ida]=DD/MM/AAAA`
   - `venta[fecha_vta]=`
   - `venta[cantidad]=1`
   - `venta[tipo_iyv]=ida`

   Responde `302` → `/venta/plazas`.
3. `GET /venta/plazas`
   - Cada asiento es un `<span id="asiento_N" class="asiento [normal|pasillo] {estado}">`, donde el estado es la última clase: `libre`, `ocupado`, `elegido` o `no_disponible`.
   - **Total** = número de asientos.
   - **Libres** = `libre`.
   - **Ocupadas** = todo lo que no es `libre`.

Además, `GET /venta/horarios` en la misma sesión lista todas las salidas con su hora de salida y de llegada y un `nromov`. Solo se usa si hace falta para resolver ambigüedades (ver más abajo).

**Validación obligatoria antes de mostrar plazas.** La página de plazas contiene la fecha y la hora del viaje, por ejemplo `03/11/2026 10:00`. Si no coinciden con el bus pedido, si el flujo no llega a `/venta/plazas`, o si hay 0 asientos, se muestra «Plazas no disponibles». Nunca se muestra un número sin esa comprobación.

**Varios buses a la misma hora.** Cuando samar.es tiene varios buses del mismo sentido y día con la **misma salida y la misma llegada** (por ejemplo, 901, 902 y 903 de 08:00 a 09:45), no se puede saber cuál es cuál. En esos buses se muestra «Plazas no disponibles». Si coinciden en la salida pero no en la llegada, el paso 3 los distingue.

Lo que no he comprobado, y hay que descubrir al construir:
- qué hace autobusing cuando `hora_ida` no existe en su lista (un bus que solo sale en samar.es);
- cómo trata esas horas duplicadas.

La validación de fecha y hora cubre el primer caso.

## Caché

- **Horarios:** clave = sentido + fecha. **Tiempo de vida: 1 hora** *(decisión mía, dentro de lo que pidió el usuario)*. Es compartida entre usuarios y entre instancias de Vercel, usando la caché de datos de Next.js (`unstable_cache` o `fetch` con `revalidate`). No se guardan errores.
- **Plazas:** clave = sentido + fecha + hora. **Tiempo de vida: 5 minutos** *(decisión mía)*, para que pulsar varias veces el botón no repita las 3 peticiones. Se muestra «consultado a las HH:MM».

## Reglas de negocio

- **Paradas** = número de entradas del itinerario, incluidos origen y destino. «Directo» si es 2.
- **Santa Olalla:** alguna parada cuyo nombre, sin tildes ni mayúsculas, sea «santa olalla».
- **Zona horaria:** Europe/Madrid. «Hoy» y la fecha por defecto se calculan en esa zona.
- **Fechas:** desde hoy hasta hoy + 60 días *(decisión mía; solo he comprobado hasta 14 días vista)*. Las fechas pasadas no se aceptan, ni en la interfaz ni en el servidor.
- **Orden:** el que da samar.es, por hora de salida.
- Las salidas después de medianoche (por ejemplo 23:45 → 01:40) se muestran tal cual.

## Acceso (decisión del usuario)

- **Hosting gratuito** (Vercel Hobby o similar). Lo usarán el usuario y los amigos o familiares a los que les pase el enlace y la contraseña.
- **Contraseña única compartida**, guardada en una variable de entorno (`APP_PASSWORD`).
  - El usuario la cambia en el panel de Vercel y vuelve a desplegar.
  - Al cambiarla, **las sesiones abiertas dejan de valer**. La cookie de sesión lleva un HMAC derivado de la contraseña, así que no hace falta base de datos.
  - Sin la cookie no se ve la página ni responden las rutas de servidor que consultan a Samar o a autobusing.
- **Que no la indexen los buscadores:**
  - `<meta name="robots" content="noindex, nofollow">`;
  - cabecera `X-Robots-Tag: noindex`;
  - `robots.txt` con `Disallow: /`.
- Sin límite global de peticiones ni almacenamiento externo. La contraseña y las cachés bastan para este uso.

## Plazas de buses que pasan por Talavera o Madrid (decisión del usuario)

Las líneas 901–905 siguen hasta Extremadura, y algunas 909 siguen hasta el aeropuerto. Sus plazas **se muestran con un aviso**: «Este bus continúa más allá de tu trayecto; las plazas podrían referirse a todo el recorrido».

- **Cómo se detecta:** por la línea (901–905).
- **Las 909 que siguen al aeropuerto** no se pueden detectar sin una búsqueda extra, porque el itinerario se corta en el tramo buscado. **Se aceptan sin aviso.**
- El usuario se reserva confiar más adelante en que autobusing da las plazas del tramo buscado. Por eso el aviso tiene que ser **fácil de quitar**: una constante o una lista de líneas.

## Seguridad y buen uso

- El servidor solo acepta `sentido ∈ {ida, vuelta}` y una fecha `AAAA-MM-DD` dentro del rango.
- **Para las plazas, el servidor no acepta códigos ni horas del cliente.** Recibe sentido + fecha + `expedition`. Busca ese bus en los horarios (de la caché o recién pedidos) y de ahí saca los `purchase-code` y la hora.
- Así nadie puede usar nuestro servidor como proxy contra autobusing con parámetros inventados.
- Todas las peticiones salen del servidor, nunca del navegador del usuario.
- Nunca se envía `POST /venta/plazas` ni ningún paso posterior.

## Tiempos

- **Búsqueda:** 1 petición, unos 1–2 s.
- **Plazas:** 5 peticiones encadenadas. El `POST /venta/inicio` llegó a tardar 4,3 s en el navegador.
- Hay que fijar en las rutas de servidor un `maxDuration` suficiente para Vercel, unos 30 s, y un timeout por petición de unos 10 s. Si se supera, se muestra un mensaje de error y no se guarda en caché.

## Estados de la interfaz

- **Búsqueda:**
  - cargando;
  - «No hay buses para este día»;
  - error de Samar, con un botón «Reintentar».
- **Plazas:**
  - botón;
  - cargando;
  - «31 libres · 19 ocupadas · 50 totales (consultado 22:41)»;
  - «Plazas no disponibles» (con el motivo en el `title`);
  - error con «Reintentar».

## Otras decisiones mías (tras la revisión)

- **Avisos de Samar.** Los avisos en texto libre de la cabecera de resultados (por ejemplo «LOS DÍAS 1 Y 2 DE NOVIEMBRE SE REALIZARÁN LOS HORARIOS DE DOMINGO…») **se muestran tal cual** encima de la lista, porque no está claro si ya se aplican a los resultados. En la página real son los `div` dentro del bloque que hay tras el título y la fecha, antes de «Selecciona tu viaje».
- **Región de Vercel:** europea, `cdg1` o `fra1` (en `vercel.json` o en la configuración de la ruta), para acortar las 5 peticiones encadenadas.
- **Despliegue:** lo hace el usuario con su cuenta. El plan termina con la web funcionando en local y las instrucciones para desplegarla. Yo no despliego.

## Lo que queda a criterio del constructor

- Estructura de carpetas y forma de las rutas: Server Actions o route handlers.
- Diseño visual dentro de la opción B: limpio, legible en el móvil y accesible (contraste, foco, etiquetas).
- Parser: expresiones regulares (como en `scripts/parse_resultados.py`) o un parser de HTML ligero. Mejor sin dependencias nuevas si se puede.
- Tests:
  - del parser de samar.es con `samples/tarjeta_expedicion_910047.html` (y una página completa si se vuelve a descargar);
  - del parser de plazas con `samples/autobusing_plazas_909-1000_2026-11-03.html`;
  - de las reglas (paradas, Directo, Santa Olalla, horas duplicadas).
- `User-Agent`: uno de navegador, el que se ha probado.

## Peticiones reales durante el desarrollo (decisión del usuario)

- **Hasta unas 50 a samar.es y unas 50 a autobusing**, con al menos 2 s entre cada una. Hay que llevar la cuenta.
- Lo que hay que comprobar:
  - el texto «N resultados»;
  - el formato de fecha y hora en `/venta/plazas`;
  - qué hace autobusing con una hora que no tiene y con horas duplicadas;
  - la web montada en local.
- Las respuestas se guardan como fixtures para que los tests nunca hagan peticiones reales.
- Nunca se pasa del paso «Plazas».

## Notas

- Vercel Hobby es para uso personal y no comercial, que encaja con este caso. El `maxDuration` de las funciones hay que fijarlo dentro del límite del plan Hobby; el valor exacto está [sin verificar].

- El proyecto aún no es un repositorio git. Al empezar se puede hacer `git init` y añadir `.superpowers/` a `.gitignore`.
- Durante la investigación no hubo CAPTCHA ni bloqueos. Si aparecen en producción, se muestra un error y no se intenta esquivarlos.
