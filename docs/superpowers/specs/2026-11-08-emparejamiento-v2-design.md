# Emparejamiento samar.es ↔ autobusing, versión 2 — diseño

Fecha: 2026-11-08. Estado: implementado (plan `docs/superpowers/plans/2026-11-09-emparejamiento-v2.md`).
Rama: `feat/comprar-billete` (sin fusionar). Se construye encima del diseño `2026-11-08-comprar-billete-design.md`.
Datos de partida: lo que observó el usuario a mano en Talavera → Madrid (16/11), recogido en `docs/emparejamiento/2026-11-16-hallazgos.md`. La tabla de autobusing tiene la misma estructura otros días (09/11, 17/11, 23/11, 14/12).

## Intención

Las plazas y la pista de compra dependen de saber qué fila de autobusing corresponde a cada bus de samar.es. El emparejamiento actual solo compara horas, y eso no basta:

- **Hay un fallo en la rama.** A las 05:45, autobusing tiene dos filas 05:45 → 07:05: una normal y otra «solo llega hasta Alcorcón». El código las toma como un refuerzo del 05:45 → 07:05 normal de samar.es y mezcla las plazas del bus de Alcorcón. **Hay que arreglarlo antes de fusionar.**
- **autobusing da llegadas teóricas** (los directos, siempre salida + 1 h 20), y samar.es da las reales. Que las horas de llegada no coincidan no significa que sea otro bus.
- **autobusing esconde los autobuses llenos** dentro de un grupo de filas iguales. Si se llenan todos, deja una sola fila «Completo». Por eso el usuario solo vio una fila a las 05:45: la normal estaba llena.
- **Los buses de ruta larga (línea 907)** no tienen precio en samar.es y no están en autobusing: se compran en el bus.

Sigue valiendo el principio del proyecto: **mejor «no disponible» que las plazas de otro bus.** La fuente de los horarios sigue siendo samar.es.

## Cómo queda cada caso (Talavera → Madrid)

| Bus de samar.es | Filas de autobusing que recibe | Por qué |
|---|---|---|
| 05:00 → 06:05 (909, Alcorcón) | las dos 05:00 → 06:20 de Alcorcón | es el único bus de Alcorcón a las 05:00 |
| 05:15 → 06:35 (909) | las dos 05:15 → 06:35 | horas exactas: refuerzo |
| 05:15 → 07:05 (910) | 05:15 → 07:10 y 05:15 → 07:15 | son las que sobran: refuerzo, como dedujo el usuario |
| 05:45 → 07:05 (909) | la 05:45 → 07:05 **sin** nota de Alcorcón | misma hora y sin la nota |
| 05:45 → 06:50 (909, Alcorcón) | la 05:45 → 07:05 **con** nota de Alcorcón | por la nota |
| 06:00 → 07:20 (909) | las dos 06:00 → 07:20 | horas exactas: refuerzo |
| 06:00 → 07:50 (910) | 06:00 → 08:00 y 06:00 → 07:55 | son las que sobran: refuerzo |
| 07:00 → 08:20 (909) | las dos 07:00 → 08:20 | horas exactas: refuerzo |
| 07:00 → 09:00 (909) y 07:00 → 09:00 (910) | — (en autobusing: 09:00 y 08:45) | no se sabe cuál es cuál: «no disponible» |
| 10:30 → 12:00 (905) | — | no aparece en autobusing |
| 11:15 → 13:10 (901 y 902) y 11:15 → 13:15 (903) | — (en autobusing: una sola fila → 13:10) | no se sabe de cuál es: «no disponible» |
| 09:15, 11:45 y 17:00 (907) | — | sin precio: «Este bus no se vende online.» |
| 18:15 (902, 903) y 18:30 (901) | — | no aparecen en autobusing |
| El resto | su fila exacta | horas exactas |

Si el 05:45 normal se llena, autobusing esconde su fila. Ese bus pasa a «No aparece en la venta online», y el de Alcorcón sigue con la suya.

## Objetivos

1. **Emparejar también por la marca de Alcorcón.**
   - Un bus de samar.es es «de Alcorcón» si alguno de sus avisos contiene «sólo llega hasta Alcorcón». Una fila de autobusing lo es si su nota contiene «solo llega hasta Alcorcón». En los dos casos se usa la misma expresión, que no distingue mayúsculas ni tildes: `/s[oó]lo llega hasta alcorc[oó]n/i`.
   - Un bus solo puede emparejarse con filas que tengan **su misma marca**. Esto vale para la coincidencia exacta, para el descarte y para los «hermanos» (otros buses de samar.es con la misma salida). También vale para `isAmbiguous`: dos buses con la misma salida y llegada solo son ambiguos si tienen la misma marca.
   - En el sentido Madrid → Talavera no hay notas en autobusing ni ese aviso en samar.es, así que ahí no cambia nada.
2. **Asignar por descarte varias filas.** A una hora de salida y con una misma marca, se quitan primero las filas que coinciden exactamente con algún bus de samar.es. Si después queda **un solo** bus de samar.es sin pareja, recibe **todas** las filas que sobran (hasta 3), aunque tengan llegadas distintas. Es el caso del 05:15 → 07:05 y del 06:00 → 07:50.
   - Si sobra una sola fila, todo funciona como ahora (`matchedArrival`).
3. **Cada autobús de un refuerzo lleva su hora de llegada en autobusing.** Si alguna llegada no coincide con la de samar.es, la tarjeta pone la llegada en cada línea de la lista y añade un aviso:
   - «1.º (llega 07:10 según autobusing): 3 libres de 55»;
   - «Aviso: en el sistema de venta estos autobuses llegan a las 07:10 y 07:15 (en Samar, a las 07:05). Se han emparejado por descarte: puede que no hagan exactamente el mismo recorrido.»
4. **Sin precio = sin venta online.**
   - `Trip` gana `onlineSale: boolean`. Vale `false` solo si samar.es da `data-price` igual a 0. Si falta el atributo vale `true`, para que un cambio en el HTML de samar.es no quite la compra de todos los buses.
   - Esas tarjetas no tienen «Ver plazas libres» ni «Comprar». En su lugar dicen «Este bus no se vende online.».
   - Si se pregunta igualmente a `/api/seats` por uno de ellos, la ruta responde `ok: false` con «No se vende online» y no consulta autobusing.
5. **Motivo honesto cuando no hay fila.** «No encontrado en autobusing» se cambia por «No aparece en la venta online». La explicación («puede estar completo o no venderse online») va en la pista de compra, para no repetirla ni meter un paréntesis dentro de otro.
6. **Pista de compra.**
   - **Antes de consultar las plazas:**
     - bus normal: «En autobusing, busca la fila de las {salida} que llega a las {llegada}. Si no está, «Ver plazas libres» te dice cuál es.»;
     - bus de Alcorcón: «En autobusing, elige la fila de las {salida} que dice «solo llega hasta Alcorcón» (allí puede poner otra hora de llegada).».
   - **Después de consultarlas:** como ahora, pero con las llegadas de autobusing:
     - una fila: «elige la fila {salida} → {llegada en autobusing}»;
     - refuerzo con horas exactas: «hay N filas {salida} → {llegada}; las dos/todas son este horario»;
     - refuerzo por descarte: «elige una de las filas de las {salida} que llegan a las {07:10 y 07:15}».
   - Si el bus es de Alcorcón, se añade «(la que dice «solo llega hasta Alcorcón»)». Si no lo es, pero en samar.es hay otro bus de Alcorcón a esa misma hora, se añade «(la que no dice «solo llega hasta Alcorcón»)», también antes de consultar (es el caso del 05:45 normal, cuyas dos filas en autobusing tienen las mismas horas). Con varias filas va en plural: «(las que dicen…)», «(las que no dicen…)».
   - Si la consulta falla por otro motivo (por ejemplo, dos buses con las mismas horas), la pista es la de antes de consultar, pero sin «Si no está, «Ver plazas libres» te dice cuál es.».
   - Cuando no aparece en la venta online, la pista dice: «Ahora mismo no aparece en la venta online: puede estar completo o no venderse online.»

## Lo que no se hace

- No se cambia la fuente de los horarios ni se consulta autobusing al buscar.
- No se averigua si los autobuses de un refuerzo por descarte paran en Santa Olalla, porque autobusing no da paradas. La tarjeta avisa de esa duda.
- No se intenta adivinar cuántos autobuses llenos (ocultos) tiene un refuerzo.
- Las 07:00 → 09:00 y las 11:15 siguen como «no disponible».

## Lo que no puede pasar

- Que se mezclen un bus de Alcorcón y uno normal, ni en las plazas ni en la pista.
- Que se asignen filas por descarte cuando, a esa hora y con esa marca, hay más de un bus de samar.es sin pareja.
- Que un bus sin venta online tenga botón de compra.

## Restricciones

- Las mismas del diseño anterior:
  - tests sin red (ADR-015);
  - comentarios didácticos (ADR-016);
  - commits sin coautoría;
  - nunca pasar de «Plazas»;
  - `MAX_ROWS` 3;
  - `SEATS_BUDGET_MS` 18 s.
- `SCHEMA_VERSION` pasa a 6, porque cambian `Trip` (`onlineSale`) y la forma de `several`.
- Hay que guardar en `tests/fixtures/` las capturas reales que usan los tests. Están en `.superpowers/investigacion-16nov/`:
  - `samar.html`: samar.es completo del 16/11;
  - `ab-2026-11-17.html`: la tabla completa de autobusing, sin nada lleno (misma estructura que el 16/11);
  - `ab16-b.html`: la tabla del 16/11 con los llenos ocultos.

## Decisiones tomadas por mí (revisables)

- La marca se detecta con un texto fijo (Alcorcón) y no con una regla general de «notas», porque es la única nota que aparece hoy en las dos webs. Si sale otra, habrá que añadirla.
- Si a una hora sobran filas pero ya no queda ningún bus de samar.es sin pareja, esas filas se ignoran.
- En un refuerzo con horas exactas no se muestran las llegadas; solo en el refuerzo por descarte.

## Añadido: regla del 909 directo (09/11, tras revisar a mano el sábado 28/11)

Experimental y desactivable: `DIRECT_909_RULE` en `lib/rules.ts`. Con `false`, todo funciona como antes.

- **Hecho:** autobusing pone a los 909 directos (sin paradas) su llegada teórica, siempre salida + 1:20.
- **Lo que se observó:** los sábados (14/11, 21/11, 28/11 y 05/12), samar.es tiene a las 09:00 un 909 directo y un 905, los dos → 10:20, y autobusing tiene 09:00 → 10:20 y 09:00 → 10:50. Entre semana (27/11, 30/11) no hay 905 a las 09:00, y autobusing solo tiene la fila 10:20. Los sábados también sobran filas a las 05:15 (→ 07:15) y a las 10:30 (→ 12:25).
- **Regla:** a una hora en la que sale un 909 directo, las filas que llegan a salida + 1:20 son suyas y no de los demás buses. Por tanto:
  1. un 909 directo y otro bus con sus mismas horas, si llegan a salida + 1:20, dejan de ser ambiguos. El 909 recibe esa fila y el otro bus va por descarte (el 905 recibe la 10:50);
  2. el único bus de una hora que no es 909 directo recibe también las filas que no son de ningún otro bus de samar.es, junto a las suyas exactas (el 910 de las 05:15 recibe 07:05, 07:15 y 07:05);
  3. la pista de compra del otro bus no lo manda a la fila del 909: «En autobusing, la fila de las 09:00 que llega a las 10:20 es la del directo 909; la de este bus llega a otra hora.».
- **Domingo 29/11:** a las 19:00 salen el 904 (→ 20:30), el 909 directo y el 905 (los dos → 20:20). autobusing solo tiene la fila 20:20, que recibe el 909; el 904 y el 905 dan «No aparece en la venta online».
- **[sin verificar]:** que la fila 10:50 sea la del 905 se deduce porque las dos cosas aparecen y faltan los mismos días; autobusing no dice la línea. Tampoco se sabe si los autobuses sobrantes hacen el mismo recorrido; la tarjeta avisa, como en el resto de refuerzos por descarte.

## Añadido: revisión manual del 13, 14 y 15/11 (10/11)

El usuario comparó a mano la web con autobusing (Talavera → Madrid, `docs/Analisis-manual.md`). Tres arreglos:

1. **Nota de Alcorcón, en toda la tabla.** El 13/11 (y el 06/11) autobusing tiene la fila de Alcorcón de las 05:00, pero no la del 05:45 de Alcorcón, que no está a la venta. La comprobación «a esta hora alguna fila lleva la nota» daba «No se distingue» a los dos 05:45. Ahora basta con que la lleve alguna fila del día: el 05:45 normal recibe su fila (07:05, «Completo») y el de Alcorcón da «No aparece en la venta online».
2. **Ambiguos, pero mirando autobusing.** Antes, la ruta cortaba sin consultar autobusing. Ahora `seatsContext` lleva `ambiguous` y `fetchSeats` lee la tabla. Si a esa hora no hay ninguna fila que pueda ser suya, dice «No aparece en la venta online» (902 y 903 de las 18:15 del domingo 15/11). Si la hay, dice «Otro bus de Samar tiene las mismas horas».
3. **Textos.** «Varios buses salen y llegan a la misma hora» pasa a «Otro bus de Samar tiene las mismas horas»: la frase vieja parecía hablar de autobusing, donde a veces hay una sola fila. «Varias filas posibles en autobusing» pasa a «No se sabe qué fila de autobusing es la suya»: el 903 de las 11:15 solo tiene una fila en disputa. Con los dos motivos, la pista de compra dice «En autobusing no se sabe qué fila de las HH:MM es este bus (en Samar llega a las HH:MM).».

Lo que queda igual (no se puede saber con los datos):

- Entre semana a las 07:00, el 909 de ruta y el 910 llegan los dos a las 09:00 en samar.es. autobusing tiene 09:00 y 08:45, y la 08:45 solo aparece los días en que sale el 909 de ruta. Como con el 905 de los sábados, apunta a que la 08:45 es la del 909 de ruta, pero no se ha añadido ninguna regla.
- El 901 y el 902 de las 11:15 (→ 13:10) entre semana, con una sola fila 13:10.

## Tests mínimos

Con la tabla completa de autobusing y samar.es del 16/11, cada caso de la tabla «Cómo queda cada caso» recibe lo que dice ahí. Como mínimo:

- 05:45 → 07:05 normal recibe solo la fila normal. 05:45 → 06:50 (Alcorcón) recibe solo la de Alcorcón, con `matchedArrival` 07:05.
- 05:00 → 06:05 (Alcorcón) recibe las dos filas de Alcorcón.
- 05:15 → 07:05 recibe 07:10 y 07:15. 05:15 → 06:35 recibe sus dos filas exactas.
- Los dos 07:00 → 09:00 siguen siendo ambiguos.
- 10:30 (905) da «No aparece en la venta online».

Con la tabla de los llenos ocultos:

- 05:45 normal da «No aparece…» y 05:45 de Alcorcón sigue con su fila.
- 05:00 y 05:15 → 06:35 dan «Completo».

Otros:

- Lector de samar.es: `onlineSale` es `false` en los tres 907 y `true` en el resto. Si falta el atributo, es `true`.
- `/api/seats` con un bus sin venta online: «No se vende online», sin llamar a autobusing.
- e2e:
  - una tarjeta sin venta online no tiene botones y dice «Este bus no se vende online.»;
  - la pista de un bus de Alcorcón y la de un refuerzo por descarte;
  - la lista del refuerzo con «(llega 07:10 según autobusing)».
