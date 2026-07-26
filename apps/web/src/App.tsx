import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/auth';
import { ToastProvider } from './state/toast';
import { TokenGate } from './screens/TokenGate';
import { Shell } from './screens/Shell';
import { TodayPage } from './screens/TodayPage';
import { ParcelsPage } from './screens/ParcelsPage';
import { ParcelDetailPage } from './screens/ParcelDetailPage';
import { PipelinePage } from './screens/PipelinePage';
import { AdminPage } from './screens/AdminPage';
import { MapPage } from './screens/MapPage';
import { HitlPage } from './screens/HitlPage';
import { EventsPage } from './screens/EventsPage';
import { AgentsPage } from './screens/AgentsPage';
import { OwnerDetailPage } from './screens/OwnerDetailPage';
import { QuestsPage } from './screens/QuestsPage';
import { NotesPage } from './screens/NotesPage';



function Protected({ children }: { children: ReactNode }) {
  const { ready, authenticated } = useAuth();
  if (!ready) {
    return (
      <div className="atmosphere grain flex min-h-screen items-center justify-center">
        <p className="text-fog animate-fade text-sm tracking-wide">Loading…</p>
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<TokenGate />} />
          <Route
            path="/"
            element={
              <Protected>
                <Shell />
              </Protected>
            }
          >
            <Route index element={<TodayPage />} />
            <Route path="quests" element={<QuestsPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="parcels" element={<ParcelsPage />} />
            <Route path="parcels/:pin" element={<ParcelDetailPage />} />
            <Route path="owners/:id" element={<OwnerDetailPage />} />
            <Route path="map" element={<MapPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="review" element={<HitlPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
