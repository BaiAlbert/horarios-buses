# Emparejamiento samar.es ↔ autobusing: hallazgos

Caso de estudio: **lunes 16/11/2026, Talavera de la Reina → Madrid Estación Sur.** Investigado el 08/11/2026.

Para comparar, también se miraron el 09/11, el 17/11, el 23/11 y el 14/12.

## Lo que observó el usuario

- **05:00.** samar.es: 909 directo, 05:00 → 06:05, «solo llega hasta Alcorcón». autobusing: primera fila 05:00 → 06:20, con la misma nota. Es el mismo bus, aunque samar.es diga que llega 15 minutos antes.
- **05:15 → 06:35 (909).** Igual en las dos webs.
- **05:15 → 07:05 (910, ruta) en samar.es.** autobusing tiene a las 05:15 las filas 06:35, 07:10 y 07:15. Las de 07:10 y 07:15 parecen corresponder al de 07:05 de samar.es (¿dos buses por la demanda?), pero con otras horas de llegada.
- **05:45.** samar.es tiene dos buses: 909 05:45 → 07:05 sin avisos, y 909 05:45 → 06:50 «solo hasta Alcorcón». En autobusing solo vio una fila 05:45 → 07:05, con la nota de Alcorcón.
- **06:00.** samar.es: 07:20 (909) y 07:50 (910). autobusing: dos filas 07:20, una 08:00 y una 07:55.
- **07:00.** samar.es: 08:20 (909), 09:00 (909) y 09:00 (910). autobusing: dos filas 08:20, una 09:00 y una 08:45.
- **Iguales en las dos webs:** 08:00, 08:30, 09:00, 09:30, 10:15 (904), 11:00, y las salidas de 12:30, 13:00, 14:00, 15:00, 16:00, 17:00 (909/910) y 18:00.
- **No están en autobusing:**
  - 907 de las 09:15, 11:45 y 17:00 (rutas de unas 3 h por muchos pueblos, sin precio en samar.es);
  - 905 de las 10:30;
  - 902 y 903 de las 18:15, y 901 de las 18:30.
- **11:15.** samar.es tiene tres buses: 901 → 13:10, 902 → 13:10 y 903 → 13:15. autobusing tiene una sola fila, 11:15 → 13:10.
- **«Comprar billete» en samar.es para un bus de las 18:15.** Lleva a autobusing con «salida 18:15». El paso siguiente enseña la tabla Horarios, donde no hay ningún bus a las 18:15.

## Lo comprobado

1. **autobusing calcula la llegada de los directos con una duración fija de 1 h 20.** Todas sus filas de directo llegan exactamente 1:20 después de salir (05:00 → 06:20, 05:45 → 07:05, 22:45 → 00:05…). samar.es da la llegada real de cada expedición. Por eso los buses que solo llegan hasta Alcorcón tienen otra hora en samar.es: 06:05 en vez de 06:20, y 06:50 en vez de 07:05. **Las horas fiables son las de samar.es.**
2. **La nota de Alcorcón está en las dos webs y distingue buses.** samar.es la pone como aviso de parada («ESTE SERVICIO SÓLO LLEGA HASTA ALCORCÓN…»). autobusing la pone como nota debajo de la fila («Esta expedición solo llega hasta Alcorcón…»).
3. **La estructura de la tabla de autobusing se repite cada día.** El 09/11, el 17/11, el 23/11 y el 14/12 tienen a primera hora las mismas filas:

   | Salida | Filas en autobusing |
   |---|---|
   | 05:00 | 2 filas → 06:20, las dos de Alcorcón |
   | 05:15 | 2 filas → 06:35; 1 → 07:10; 1 → 07:15 |
   | 05:45 | 2 filas → 07:05: una normal y otra de Alcorcón |
   | 06:00 | 2 filas → 07:20; 1 → 08:00; 1 → 07:55 |

   Por tanto, el 05:45 normal de samar.es es la fila 05:45 → 07:05 sin nota, y el 05:45 de Alcorcón es la fila 05:45 → 07:05 con la nota de Alcorcón.
4. **autobusing oculta los autobuses llenos.** El 16/11, entre la 01:53 y las 02:20 del 08/11, la tabla pasó de 43 a 40 filas:
   - Las dos filas de las 05:00 se quedaron en una sola, «Completo».
   - Las dos de las 05:15 → 06:35, igual: una sola, «Completo».
   - De las dos de las 05:45, desapareció la normal y se quedó la de Alcorcón, que tiene 8 libres de 52.
   - El bus normal oculto de las 05:45 (`nromov` 4127600) no se puede elegir: autobusing rechaza la selección.

   Regla deducida: dentro de un grupo de filas iguales, autobusing **esconde los autobuses llenos**. Si se llenan todos, deja **una sola fila «Completo»**. Consecuencias:
   - que falte una fila no significa que ese bus no se venda online; puede estar lleno;
   - en un refuerzo, solo se ven los autobuses que aún tienen sitio.
5. **Los 907 tienen precio 0,00 en samar.es** (`data-price="0.00"`) y nunca están en autobusing: no se venden online. La marca `data-can-buy-online` no sirve para distinguirlos, porque vale `true` en todos los buses, también en los 907.
6. **El botón «Comprar» de samar.es no prueba nada.** samar.es lo monta igual para todos los buses, con la hora de salida y los códigos 0831/0108, así que también aparece en buses que autobusing no vende (como los de las 18:15).
7. **Lo que autobusing vende de las líneas 901–905 se repite cada día.** El 09/11, 16/11, 17/11, 23/11 y 14/12 están el 904 de las 10:15 y una sola fila a las 11:15 (→ 13:10). Nunca están el 905 de las 10:30 ni los de las 18:15 y 18:30.
8. **autobusing no da paradas, línea ni expedición en ningún sitio.** Tampoco en su menú, que solo tiene Compra, Anulación, Cambio, Cierre de vuelta y Duplicado.

## Emparejamiento propuesto

La tabla caso por caso está en el diseño `docs/superpowers/specs/2026-11-08-emparejamiento-v2-design.md`, apartado «Cómo queda cada caso».

## Conclusiones

- **No conviene cambiar la fuente de los horarios.** samar.es tiene las horas reales, las paradas y Santa Olalla (el abono). autobusing tiene las llegadas teóricas y no tiene paradas. autobusing sigue siendo la referencia de **qué se vende y de las plazas**.
- **El emparejamiento debe usar la nota de Alcorcón.** Sin ella, el código actual de la rama `feat/comprar-billete` trata las dos filas 05:45 → 07:05 (la normal y la de Alcorcón) como un refuerzo del 05:45 normal y mezcla las plazas del bus de Alcorcón. Es un fallo que **hay que arreglar antes de fusionar la rama**.
- **Precio 0,00 = no se vende online.** Esos buses no deberían tener botón de compra ni de plazas, sino un texto del tipo «billete en taquilla o en el bus».
- **Que falte una fila puede significar que el bus está lleno.** «No encontrado en autobusing» puede ser injusto. Para buses que normalmente sí están, sería mejor decir algo como «No aparece en la venta online (puede estar completo)».
- **Refuerzos con otra llegada (05:00, 05:15 → 07:05 y 06:00 → 07:50).** Cuando las filas que sobran a una salida tienen otras horas de llegada y solo queda un bus de samar.es sin pareja, se pueden asignar todas a ese bus avisando de la llegada distinta. Con la nota de Alcorcón como filtro previo, no se mezclan buses de Alcorcón con buses normales.

## Dudas abiertas [sin verificar]

- **05:15 → 07:05 y 06:00 → 07:50.** El usuario cree que son refuerzos, y así se tratan. Aun así: ¿las dos filas con llegadas distintas (07:10/07:15 y 08:00/07:55) son un refuerzo del mismo recorrido, o dos rutas distintas de las que samar.es solo enseña una? A las 07:00, samar.es sí enseña dos buses de ruta (07:00 → 09:00 de la 909, por Santa Olalla con 7 paradas, y de la 910, con 15 paradas), lo que apunta a lo segundo. Si fueran rutas distintas, **no se sabe si las dos paran en Santa Olalla**.
- **Líneas 901–905.** ¿Por qué autobusing vende algunos buses (904 de las 10:15, una de las tres de las 11:15) y otros no (905, 18:15, 18:30)? Hipótesis: son líneas de larga distancia que pasan por Talavera, y las plazas desde Talavera solo se venden online si la empresa abre un cupo para esa parada. La idea del usuario de que aparezcan cuando otros buses se llenan no se ha podido comprobar.
- **11:15.** La fila de autobusing que llega a las 13:10, ¿es del 901 o del 902? Las dos llegan a las 13:10 en samar.es.
- **Hora de apertura de la venta.** Los autobuses del 16/11 se llenaron de madrugada, 8 días antes. ¿Abre la venta a una hora fija y los usuarios habituales compran en cuanto abre?
