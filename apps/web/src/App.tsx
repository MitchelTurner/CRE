import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/auth';
import { TokenGate } from './screens/TokenGate';
import { Shell } from './screens/Shell';
import { ParcelsPage } from './screens/ParcelsPage';
import { ParcelDetailPage } from './screens/ParcelDetailPage';
import { PipelinePage } from './screens/PipelinePage';
import { AdminPage } from './screens/AdminPage';

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
          <Route index element={<Navigate to="/parcels" replace />} />
          <Route path="parcels" element={<ParcelsPage />} />
          <Route path="parcels/:pin" element={<ParcelDetailPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}