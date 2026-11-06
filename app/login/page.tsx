'use client';

import { useActionState } from 'react';
import { login } from './actions.ts';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="login-page">
      <form action={action} className="login-card glass">
        <h1>Buses Madrid ↔ Talavera</h1>
        {/* sin usuario real: los gestores de contraseñas necesitan uno para guardar la clave */}
        <input type="text" name="username" autoComplete="username" value="horarios-buses" readOnly hidden />
        <label htmlFor="password">Contraseña</label>
        {/* biome-ignore lint/a11y/noAutofocus: es el único campo de la página */}
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={!!state.error} aria-describedby={state.error ? 'password-error' : undefined} />
        <button type="submit" className="primary press" disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        {state.error && <p id="password-error" role="alert" className="error">{state.error}</p>}
      </form>
    </main>
  );
}
