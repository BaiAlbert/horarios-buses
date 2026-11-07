// PÁGINA DE LOGIN (/login). En Next.js, cada `page.tsx` dentro de `app/` es una página y su carpeta es la URL.
//
// 'use client' indica que este componente se ejecuta también en el navegador (necesario para que el
// formulario reaccione: mostrar "Entrando…", el error, etc.). Sin esa línea, el componente solo se
// ejecutaría en el servidor y llegaría al navegador como HTML fijo.
'use client';

import { useActionState, useState } from 'react';
import { login } from './actions.ts';

// En React, un "componente" es una función que devuelve lo que se ve en pantalla, escrito en JSX:
// una sintaxis que parece HTML pero dentro de JavaScript. Diferencias con el HTML: `className` en vez
// de `class`, `htmlFor` en vez de `for`, y entre llaves { } se mete código JavaScript.
export default function LoginPage() {
  // useActionState conecta el formulario con la función `login` del servidor y devuelve:
  //   state   → lo último que devolvió login (p. ej. { error: 'Contraseña incorrecta' }); al principio {}
  //   action  → lo que se pone en <form action={...}>
  //   pending → true mientras se espera la respuesta del servidor
  const [state, action, pending] = useActionState(login, {});
  // ¿Se ve la contraseña en claro? Cambia el campo entre type="password" (puntos) y type="text".
  const [show, setShow] = useState(false);
  return (
    <main className="login-page">
      {/* Al enviar se vuelve a ocultar: así el gestor de contraseñas del navegador reconoce el campo como contraseña */}
      <form action={action} onSubmit={() => setShow(false)} className="login-card glass">
        <h1>Buses Madrid ↔ Talavera</h1>
        {/* sin usuario real: los gestores de contraseñas necesitan uno para guardar la clave. Fuera de pantalla y no con `hidden`: algunos gestores ignoran los campos ocultos */}
        <input type="text" name="username" autoComplete="username" value="horarios-buses" readOnly tabIndex={-1} aria-hidden="true" className="sr" />
        <label htmlFor="password">Contraseña</label>
        {/* aria-invalid y aria-describedby: los lectores de pantalla anuncian que el campo tiene un error y cuál */}
        <div className="password-field">
          {/* biome-ignore lint/a11y/noAutofocus: es el único campo de la página */}
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required autoFocus aria-invalid={!!state.error} aria-describedby={state.error ? 'password-error' : undefined} />
          {/* Botón del ojo. aria-pressed dice a los lectores de pantalla si está activado (contraseña visible).
              onMouseDown con preventDefault: al pulsarlo con ratón o dedo el cursor sigue en el campo y se puede seguir escribiendo */}
          <button type="button" className="reveal" aria-label="Mostrar contraseña" aria-pressed={show} aria-controls="password" onMouseDown={(e) => e.preventDefault()} onClick={() => setShow(!show)}>
            {/* Ojo dibujado en SVG: contorno, pupila y una raya que lo tacha. El CSS anima la raya y la pupila según aria-pressed */}
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle className="reveal-pupil" cx="12" cy="12" r="3" fill="currentColor" />
              <line className="reveal-slash" x1="4" y1="4" x2="20" y2="20" pathLength={1} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button type="submit" className="primary press" disabled={pending}>
          {/* `a && <X />` en JSX: si a es verdadero se pinta <X />, si no, nada */}
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        {state.error && <p id="password-error" role="alert" className="error">{state.error}</p>}
      </form>
    </main>
  );
}
