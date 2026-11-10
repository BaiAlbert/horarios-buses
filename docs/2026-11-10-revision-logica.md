# Revisión de la lógica (2026-11-10)

Revisión completa de `lib/`, las rutas de API, el proxy, el login, el buscador y la tarjeta, seguida de comprobaciones
en vivo contra samar.es y autobusing. Este documento explica qué se cambió y por qué.

## Cómo se empareja un bus con autobusing (para entender los puntos 1 a 3)

samar.es dice qué buses hay. autobusing tiene una tabla con una fila por autobús a la venta (salida, llegada y precio),
pero **no dice de qué línea es cada fila**. La web tiene que deducir qué fila es de qué bus, en este orden:

1. **Fila exacta:** misma salida y misma llegada que el bus de samar.es. Si hay varias iguales es un *refuerzo*
   (varios autobuses para el mismo horario).
2. **Por descarte:** si el bus no tiene fila exacta, se quitan las filas que son de los otros buses de esa hora. Si no
   queda ningún otro bus sin fila, las que sobran son suyas, y la tarjeta avisa de que la llegada no coincide.
3. **Ante la duda, nada:** «Plazas no disponibles».

## Cambios

### 1. La regla del 909 de ruta solo vale a las 07:00 desde Talavera

- **La regla:** entre semana, a las 07:00 desde Talavera, samar.es tiene un 909 de ruta y un 910 con las mismas horas
  (07:00 → 09:00). autobusing tiene una fila 09:00 y otra 08:45, y la 08:45 solo existe los días en que sale el 909 de
  ruta. Deducción: la 09:00 es del 910 y la 08:45 del 909 de ruta.
- **Problema:** el código aplicaba la deducción a cualquier hora. Con un empate igual a las 15:00 y dos filas
  15:00 → 17:00 (una de cada bus), el 910 saldría como «2 autobuses a esta hora», sin aviso, y uno sería el 909.
- **Solución:** `inRuta909Slot` en `lib/rules.ts`: salida 07:00 y origen Talavera (`0831`). Fuera de ahí, los dos buses
  vuelven a «Otro bus de Samar tiene las mismas horas».

### 2. El descarte cuenta buses y filas

- **Problema:** a las 11:15 salen el 901 y el 902 (los dos → 13:10) y el 903 (→ 13:15). Con filas 13:10 y 13:20, el
  código daba por emparejados al 901 y al 902 porque «la llegada 13:10 aparece», y le daba la 13:20 al 903. Pero hay dos
  buses para una sola fila 13:10: uno está sin fila y la 13:20 puede ser la suya.
- **Solución:** en `pickRow`, un hermano está sin pareja si hay más buses con su llegada que filas con esa llegada. En ese
  caso no se reparte nada por descarte («No se sabe qué fila de autobusing es la suya»).

### 3. Un bus solo a su hora ya no se queda las filas sobrantes

- **Problema:** con la regla del 909 directo encendida, un bus que salía solo a su hora se quedaba, además de su fila
  exacta, cualquier otra fila de esa hora (`others.every(...)` es verdadero con una lista vacía).
- **Visto en vivo (11/11, Madrid → Talavera):** el 910 de las 21:30 (→ 23:20) salía como «2 autobuses» por una fila
  21:30 → 22:50. Comparando los mapas asiento a asiento, son autobuses distintos, y 22:50 es salida + 1:20, la llegada
  de un directo que samar.es no lista. Quien necesite Santa Olalla podría haber elegido el directo.
- **Solución:** `leftovers` exige que haya otros buses a esa hora. Un bus solo se queda únicamente su fila exacta; si no
  tiene ninguna, sigue yendo por descarte con aviso, como antes.

### 4. Tabla de autobusing ilegible → error

- **Problema:** si autobusing cambiaba el HTML de la tabla, se leían cero filas y todos los buses decían «No aparece en
  la venta online: puede estar completo», sin rastro en los logs.
- **Solución:** cero filas y la página no es una tabla de horarios (o tiene filas que no se saben leer) → error. La
  tarjeta dice «No se pudo consultar» con «Reintentar», queda en los logs de Vercel y no se guarda en la caché.

### 5. Tarjetas de samar.es a medias → error

`parseResults` lanza error si a un bus le falta la salida o la llegada, si no tienen forma `HH:MM` o si no tiene número
de línea (sin la línea, las reglas del 909 se apagaban en silencio). Un precio en blanco ya no cuenta como precio 0.

### 6. Los fallos del momento no se guardan

«autobusing no aceptó la selección» y «la página de plazas no es la del bus» eran resultados guardados 5 minutos y sin
botón. Ahora son errores: «No se pudo consultar» con «Reintentar».

### 7. La consulta de plazas ya no manda la hora

- **Problema:** con `hora_ida`, autobusing elegía por su cuenta un bus de esa hora y dejaba la sesión en sus plazas. Si
  después nuestra elección de fila fallara sin avisar, se leería el mapa de ese otro bus, que pasa la comprobación.
- **Solución:** el flujo va sin hora, como el enlace de compra. Comprobado en vivo: la tabla es la misma con y sin hora,
  en los dos sentidos. `parseOrigenId` se borró (sin hora no hace falta `venta[origen_id]`).

### 8. Buses que ya han salido

autobusing no lista las salidas pasadas (comprobado en vivo). Buscando hoy, un bus cuya hora ya pasó dice «Este bus ya
ha salido.» y no tiene plazas ni compra (`hasDeparted` en `lib/rules.ts`).

### 9. «1 resultado» en singular

Un día con un solo bus rompía la búsqueda. Ya se acepta.

### 10. Pestaña abierta desde otro día

Un 400 de `/api/seats` dice «Esta búsqueda es de otro día. Vuelve a pulsar «Buscar buses».» en vez de un «Reintentar»
que nunca funcionaba.

### 11. Texto del límite de autobuses

«Demasiadas filas iguales en autobusing» pasó a «Demasiados autobuses a esa hora en autobusing», porque también sale
cuando las filas no son iguales.

### 12. Días sin venta en autobusing (nuevo, salió de las pruebas en vivo)

En festivos (08/12, 25/12) y fechas lejanas (04/01/2027, 09/01/2027), autobusing responde «Ida: No hay servicios
vigentes para esa fecha». Antes la web decía «No se pudo consultar». Ahora dice «Plazas no disponibles (autobusing no
tiene venta para este día)» y la pista de compra lo explica.

### CSS

`.seats-full` («Completo») seguía en el grupo de los avisos ámbar, de cuando lo era, y por eso su letra era más pequeña
que la de las plazas con cifra. Se quitó de ese grupo.

## Comprobaciones en vivo (2026-11-10, 13:00–13:20)

- Emparejamiento del día entero, miércoles 11/11, con una sola tabla de autobusing por sentido:
  - Talavera → Madrid: 46 buses, 35 filas. 30 exactas, 4 por descarte, 7 sin fila, 2 ambiguos, 3 sin venta online.
  - Madrid → Talavera: 46 buses, 33 filas. 27 exactas, 2 por descarte, 9 sin fila, 6 ambiguos, 2 sin venta online.
  - Ninguna fila repartida a dos buses. Los «sin fila» lo son de verdad: autobusing no tiene fila a esa hora.
- Plazas reales con el código nuevo (11 buses): directos con cifra, de ruta con «quedan plazas», el 909 directo de las
  09:00 del sábado 14/11, el de las 07:00 del viernes 13/11 y el 910 de las 21:30.
- samar.es se lee bien con las validaciones nuevas en 6 días distintos (incluidos el 25/12 y el 09/01/2027).

## Lo que queda abierto

- **Buses que solo están en autobusing:** el 11/11 había filas sin bus en samar.es (09:00 → 10:20 y 21:30 → 22:50 de
  Madrid a Talavera). La web no los enseña.
- **Madrid → Talavera a las 08:00 y a las 15:00:** el 901, el 902 y el 903 comparten horas y hay una sola fila; los
  tres salen como ambiguos.
- **Cierre de la venta:** a las 12:55 el bus de las 13:00 ya no estaba en autobusing. No se sabe si estaba lleno o si
  la venta se cierra un rato antes de salir.
- **Tabla vacía legítima:** no se ha visto ninguna; se supone que conserva `class="horarios"`.
- **Foco bajo la barra de filtros:** `scroll-padding-top` vale 88 px y la barra mide unos 105 px en móvil vertical. Al
  tabular, un control podría quedar tapado. Sin comprobar.
- **Campo de usuario oculto del login:** `.login-card input` le da ancho completo y 52 px de alto por encima de `.sr`.
  No se ve (lo recorta `clip-path`), pero no mide 1 px como se pretendía.
