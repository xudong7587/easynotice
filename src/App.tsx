import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Skeleton } from './components/ui';
import { api } from './lib/api';
import { SetupPage, LoginPage } from './pages/AuthPages';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((module) => ({ default: module.SourcesPage })));
const SourceDetailPage = lazy(() => import('./pages/SourceDetailPage').then((module) => ({ default: module.SourceDetailPage })));
const ChannelsPage = lazy(() => import('./pages/ChannelsPage').then((module) => ({ default: module.ChannelsPage })));
const EventsPage = lazy(() => import('./pages/EventsPage').then((module) => ({ default: module.EventsPage })));
const AssetsPage = lazy(() => import('./pages/AssetsPage').then((module) => ({ default: module.AssetsPage })));
const GuidePage = lazy(() => import('./pages/GuidePage').then((module) => ({ default: module.GuidePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));

interface BootstrapStatus {
  needsSetup: boolean;
  authenticated: boolean;
  setupComplete: boolean;
  appName: string;
}

export default function App() {
  const [status, setStatus] = useState<BootstrapStatus>();
  const loadStatus = useCallback(() => api<BootstrapStatus>('/api/setup/status').then(setStatus), []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    const unauthorized = () => setStatus((current) => current ? { ...current, authenticated: false } : current);
    window.addEventListener('easynotice:unauthorized', unauthorized);
    return () => window.removeEventListener('easynotice:unauthorized', unauthorized);
  }, []);

  if (!status) return <div className="boot-screen"><div className="brand brand--large"><span className="brand__mark" /><strong>EasyNotice</strong></div><Skeleton lines={3} /></div>;
  if (status.needsSetup) return <SetupPage onDone={loadStatus} />;
  if (!status.authenticated) return <LoginPage onDone={loadStatus} />;

  return <Suspense fallback={<div className="route-loading"><Skeleton lines={5} /></div>}><Routes>
    <Route element={<AppShell onLoggedOut={() => setStatus({ ...status, authenticated: false })} />}>
      <Route index element={status.setupComplete ? <DashboardPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="onboarding" element={<OnboardingPage onDone={() => setStatus({ ...status, setupComplete: true })} />} />
      <Route path="sources" element={<SourcesPage />} />
      <Route path="sources/:id" element={<SourceDetailPage />} />
      <Route path="channels" element={<ChannelsPage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="assets" element={<AssetsPage />} />
      <Route path="guide" element={<GuidePage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></Suspense>;
}
