import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';

export function TokenGate() {
  const { authenticated, login } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (authenticated) return <Navigate to="/parcels" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(token);
      navigate('/parcels', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="atmosphere grain relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16 md:px-10">
        <p className="animate-rise text-moss font-body mb-4 text-xs font-semibold tracking-[0.28em] uppercase">
          Investment sales · Greenville County
        </p>
        <h1 className="font-display animate-rise text-[clamp(3.2rem,10vw,6.5rem)] leading-[0.9] font-extrabold tracking-tight text-white">
          GREENVILLE
          <br />
          <span className="text-moss">CRE</span>
        </h1>
        <p className="animate-rise-delay font-body mt-6 max-w-md text-lg text-fog">
          Sell-likelihood leads from public parcel records — scored, ranked, and ready for outreach.
        </p>

        <form
          onSubmit={onSubmit}
          className="animate-rise-delay mt-12 flex w-full max-w-lg flex-col gap-3"
        >
          <label className="text-xs font-semibold tracking-[0.18em] text-fog uppercase" htmlFor="token">
            API token
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your API_TOKEN"
              className="border-pine-soft/60 bg-ink-2/80 focus:border-moss min-h-12 flex-1 border px-4 text-mist outline-none placeholder:text-fog/50"
              required
            />
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="bg-moss text-ink hover:bg-moss-dim min-h-12 px-7 font-semibold tracking-wide transition disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Enter'}
            </button>
          </div>
          {error ? <p className="text-danger text-sm">{error}</p> : null}
        </form>
      </main>
    </div>
  );
}