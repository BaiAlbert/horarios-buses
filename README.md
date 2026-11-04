# Buses Madrid ↔ Talavera

Web privada para ver los buses de Samar entre **Madrid Estación Sur** y **Talavera de la Reina** en una fecha.

- Datos al momento desde samar.es: horarios e itinerario de cada bus, guardados 1 hora.
- Tipo de cada bus: **Directo** (2 paradas), **Ruta · Santa Olalla** o **Ruta · sin Santa Olalla**.
- Botón **Ver plazas libres** en cada bus. Consulta el sistema de venta (autobusing) solo para ese bus y guarda el resultado 5 minutos. Nunca pasa del paso «Plazas» ni compra nada.
- Protegida con una contraseña compartida y oculta a los buscadores (noindex).

Más detalle en `docs/investigacion-samar.md` (fuentes de datos) y `docs/superpowers/specs/` (diseño).

## Desarrollo

```bash
npm install
echo 'APP_PASSWORD=una-contraseña' > .env.local
npm run dev        # http://localhost:3000
npm test           # tests con respuestas guardadas; no consultan Samar
npm run typecheck
```

Requiere Node 22.18 o superior, porque los tests usan `node --test` con TypeScript directamente.

## Desplegar en Vercel (gratis)

1. Sube el repositorio a GitHub y en Vercel elige **Add New → Project** para importarlo. Next.js se detecta solo.
2. En **Settings → Environment Variables**, crea `APP_PASSWORD` con la contraseña que vas a compartir. Que sea larga y aleatoria (20 caracteres o más, p. ej. `openssl rand -base64 24`): es la defensa real contra quien intente adivinarla.
3. Pulsa **Deploy**. Las funciones se ejecutan en París (`cdg1`, en `vercel.json`).
4. En **Firewall → Rules**, crea una regla de *Rate Limit*: método `POST`, ruta `/login`, ventana fija de 60 s, 10 peticiones, por IP, acción *Deny*. El plan gratuito solo admite una.
5. En los ajustes de la cuenta (Team), desactiva el uso de tu contenido para entrenar IA (*Model Training*): en el plan Hobby viene activado.
6. Comparte la URL y la contraseña con quien quieras.

Si notas un ataque (muchas peticiones de golpe), activa **Firewall → Bot Management → Attack Challenge Mode**. Es gratis y lo que bloquea no cuenta para la cuota.

**Cambiar la contraseña:** edita `APP_PASSWORD` en Vercel y haz **Deployments → Redeploy**. Todas las sesiones abiertas dejan de valer y hay que entrar con la nueva.

Si `APP_PASSWORD` no está definida, nadie puede entrar.

## Aspecto

Estética «cristal líquido» (estilo iOS/macOS) con animaciones de muelle en CSS puro (`linear()`), sin librerías. Todos los colores y la materia del cristal viven en `app/theme.css`: cambiando los cuatro `--hue-*` se recolorea toda la web (hay paletas de ejemplo en el comentario de cabecera). Respeta modo oscuro, `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`.

## Ajustes

- **Plazas de las líneas 901–905.** Estas líneas siguen hacia Extremadura y se muestran con un aviso de que las plazas podrían ser de todo el recorrido. Para fiarte de que son las de tu tramo, vacía `PASS_THROUGH_LINES` en `lib/rules.ts`.
- **Duración de la caché:** `TRIPS_TTL_S` y `SEATS_TTL_S` en `lib/cache.ts`.
- **Días hacia delante:** `MAX_DAYS_AHEAD` en `lib/rules.ts` (60).

## Limitaciones conocidas

- La web lee el HTML de samar.es y de autobusing. Si cambian su diseño, la búsqueda dará error («No se pudo consultar Samar») y no mostrará datos a medias.
- Las plazas se buscan en autobusing por hora de salida y llegada.
  - Si solo coincide la salida, y no hay otro bus de Samar a esa hora, se muestran con un aviso.
  - Si autobusing marca el bus como «Completo», se indica que no quedan plazas.
  - Algunos buses, sobre todo de ruta, no tienen elección de asiento en la venta online. Autobusing no da su número de plazas, ni siquiera en la pantalla de datos del viajero. Si no están marcados como «Completo», la web indica «Quedan plazas» sin cifra.
- Algunas 909 continúan hasta el aeropuerto. Sus plazas se muestran sin aviso.
