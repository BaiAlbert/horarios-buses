'use client';

import { useActionState } from 'react';
import { login } from './actions.ts';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="login-page">
      <form action={action} className="login-card glass">
        <h1>Buses Madrid ↔ Talavera</h1>
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        <button type="submit" className="primary press" disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        {state.error && <p role="alert" className="error">{state.error}</p>}
      </form>
    </main>
  );
}
