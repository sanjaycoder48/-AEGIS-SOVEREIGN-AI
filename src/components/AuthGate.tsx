import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { getAuthStatus, loginAccount, registerAccount, sessionStore } from '../api/aegis';
import type { AuthUser } from '../types';

export function AuthGate({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAuthStatus().then(({ setup_required }) => setSetupRequired(setup_required)).catch(() => setError('Local AEGIS service is not reachable.'));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (setupRequired === null) return;
    setBusy(true);
    setError('');
    try {
      const session = setupRequired
        ? await registerAccount(name, username, password)
        : await loginAccount(username, password);
      sessionStore.set(session.token);
      onAuthenticated(session.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand"><span><ShieldCheck size={23} /></span><div><strong>AEGIS</strong><small>SOVEREIGN AI</small></div></div>
        <div className="auth-copy">
          <p className="eyebrow">LOCAL IDENTITY BOUNDARY</p>
          <h1 id="auth-title">{setupRequired ? 'Create the vault owner' : 'Unlock your secure vault'}</h1>
          <p>{setupRequired ? 'Set up the first local operator. Existing demo evidence will be sealed into this account.' : 'Your documents, conversations and audit records remain isolated on this device.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {setupRequired && <label><span>Display name</span><div><UserRound size={17} /><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Secure Operator" required minLength={2} /></div></label>}
          <label><span>Username</span><div><UserRound size={17} /><input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="operator" required minLength={3} /></div></label>
          <label><span>Password</span><div><KeyRound size={17} /><input autoComplete={setupRequired ? 'new-password' : 'current-password'} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" required minLength={8} /></div></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy || setupRequired === null} type="submit"><LockKeyhole size={17} />{busy ? 'Verifying…' : setupRequired ? 'Create secure vault' : 'Unlock AEGIS'}</button>
        </form>
        <footer><span className="pulse" /> Credentials are hashed and stored locally</footer>
      </section>
    </div>
  );
}
