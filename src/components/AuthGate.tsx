import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LockKeyhole, MonitorPlay, ShieldCheck, UserRound } from 'lucide-react';
import { getAuthStatus, loginAccount, registerAccount, sessionStore } from '../api/aegis';
import { DEMO_USER } from '../lib/constants';
import type { AuthUser } from '../types';

export function AuthGate({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceDown, setServiceDown] = useState(false);
  const checking = setupRequired === null && !error;
  const title = checking
    ? 'Checking vault access'
    : serviceDown
      ? 'No local vault on this device'
      : setupRequired
        ? 'Create the vault owner'
        : 'Unlock your secure vault';
  const copy = checking
    ? 'Connecting to the local identity service before opening the workspace.'
    : serviceDown
      ? 'AEGIS keeps documents and audit records on the machine it runs on, and no local service was found here. You can walk through the workbench with sample evidence instead.'
      : setupRequired
        ? 'Set up the first local operator. Existing demo evidence will be sealed into this account.'
        : 'Your documents, conversations and audit records remain isolated on this device.';

  useEffect(() => {
    void getAuthStatus()
      .then(({ setup_required }) => setSetupRequired(setup_required))
      .catch(() => {
        setServiceDown(true);
        setError('Local AEGIS service is not reachable.');
      });
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
        <div className="auth-brand">
          <span><ShieldCheck size={23} /></span>
          <div>
            <strong>AEGIS</strong>
            <small>SOVEREIGN AI</small>
          </div>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">LOCAL IDENTITY BOUNDARY</p>
          <h1 id="auth-title">{title}</h1>
          <p>{copy}</p>
        </div>
        {checking && <div className="auth-loader"><span className="pulse" /> Verifying local session...</div>}
        {error && setupRequired === null && !serviceDown && (
          <p className="auth-error auth-error-block" role="alert">{error}</p>
        )}
        {serviceDown && (
          <div className="auth-demo">
            <button className="auth-submit" type="button" onClick={() => onAuthenticated(DEMO_USER)}>
              <MonitorPlay size={17} />
              Open the sample workbench
            </button>
            <p>Sample evidence only. Nothing you type here is stored or sent anywhere.</p>
          </div>
        )}
        {setupRequired !== null && (
        <form className="auth-form" onSubmit={submit}>
          {setupRequired && (
            <label>
              <span>Display name</span>
              <div>
                <UserRound size={17} />
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Secure Operator"
                  required
                  minLength={2}
                />
              </div>
            </label>
          )}
          <label>
            <span>Username</span>
            <div>
              <UserRound size={17} />
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="operator"
                required
                minLength={3}
              />
            </div>
          </label>
          <label>
            <span>Password</span>
            <div>
              <KeyRound size={17} />
              <input
                autoComplete={setupRequired ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
              />
            </div>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" disabled={busy || setupRequired === null} type="submit">
            <LockKeyhole size={17} />
            {busy ? 'Verifying...' : setupRequired ? 'Create secure vault' : 'Unlock AEGIS'}
          </button>
        </form>
        )}
        <footer><span className="pulse" /> {serviceDown ? 'Running from static files, no vault attached' : 'Credentials are hashed and stored locally'}</footer>
      </section>
    </div>
  );
}
