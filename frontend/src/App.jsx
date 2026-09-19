import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Services } from './pages/Services';
import { DependencyGraph } from './pages/DependencyGraph';
import { Incidents } from './pages/Incidents';
import { Deployments } from './pages/Deployments';
import { Demo } from './pages/Demo';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="services" element={<Services />} />
          <Route path="dependency-graph" element={<DependencyGraph />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="deployments" element={<Deployments />} />
          <Route path="demo" element={<Demo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
