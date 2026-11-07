// PÁGINA DE LOGIN (/login). En Next.js, cada `page.tsx` dentro de `app/` es una página y su carpeta es la URL.
//
// 'use client' indica que este componente se ejecuta también en el navegador (necesario para que el
// formulario reaccione: mostrar "Entrando…", el error, etc.). Sin esa línea, el componente solo se
// ejecutaría en el servidor y llegaría al navegador como HTML fijo.
'use client';

import { useActionState } from 'react';
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
  return (
    <main className="login-page">
      <form action={action} className="login-card glass">
        <h1>Buses Madrid ↔ Talavera</h1>
        {/* sin usuario real: los gestores de contraseñas necesitan uno para guardar la clave. Fuera de pantalla y no con `hidden`: algunos gestores ignoran los campos ocultos */}
        <input type="text" name="username" autoComplete="username" value="horarios-buses" readOnly tabIndex={-1} aria-hidden="true" className="sr" />
        <label htmlFor="password">Contraseña</label>
        {/* aria-invalid y aria-describedby: los lectores de pantalla anuncian que el campo tiene un error y cuál */}
        {/* biome-ignore lint/a11y/noAutofocus: es el único campo de la página */}
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={!!state.error} aria-describedby={state.error ? 'password-error' : undefined} />
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
