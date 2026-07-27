import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { JobWatcher } from '../components/JobWatcher';
import { XpHud } from '../components/XpHud';
import { getProgress } from '../lib/api';
import type { ProgressSummary } from '../lib/types';

const links = [
  { to: '/', label: 'Today', end: true },
  { to: '/quests', label: 'Quests' },
  { to: '/notes', label: 'Notes' },
  { to: '/drive-by', label: 'Drive-by' },
  { to: '/parcels', label: 'Parcels' },
  { to: '/map', label: 'Map' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/events', label: 'Events' },

  { to: '/agents', label: 'Agents' },
  { to: '/review', label: 'Review' },
  { to: '/admin', label: 'Admin' },
];

export function Shell() {
  const { logout } = useAuth();
  const [progress, setProgress] = useState<ProgressSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getProgress()
        .then((p) => {
          if (!cancelled) setProgress(p);
        })
        .catch(() => {
          /* ignore */
        });
    void load();
    const id = window.setInterval(() => void load(), 45000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <div className="atmosphere grain relative min-h-screen">
      <JobWatcher />
      <header className="relative z-[2]">

        <div className="mx-auto max-w-7xl px-5 pt-5 md:px-8">
          <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl px-4 py-4 md:px-6">
            <div className="min-w-0">
              <p className="text-moss mb-1 text-[10px] font-semibold tracking-[0.3em] uppercase">
                Lead Engine
              </p>
              <NavLink
                to="/"
                className="font-display text-2xl leading-none font-extrabold tracking-tight text-white md:text-3xl"
              >
                GREENVILLE <span className="text-moss">CRE</span>
              </NavLink>
            </div>
            <XpHud progress={progress} />
          </div>
          <nav className="mt-3 flex flex-wrap items-center gap-1 px-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  ['nav-pill', isActive ? 'nav-pill-active' : 'hover:text-mist'].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={logout}
              className="text-fog hover:text-mist ml-auto px-3 py-2 text-sm"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="relative z-[2] mx-auto max-w-7xl px-5 py-8 md:px-8">
        <Outlet context={{ progress, setProgress }} />
      </main>

    </div>
  );
}
