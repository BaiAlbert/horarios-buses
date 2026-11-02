'use client';

import { useActionState } from 'react';
import { login } from './actions.ts';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="page login">
      <h1>Buses Madrid ↔ Talavera</h1>
      <form action={action} className="login-form">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        <button type="submit" className="primary" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
        {state.error && <p role="alert" className="error">{state.error}</p>}
      </form>
    </main>
  );
}
