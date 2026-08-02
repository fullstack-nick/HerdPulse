import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './layout';
import { AnimalDetailPage } from './pages/animal-detail';
import { AnimalsPage } from './pages/animals';
import { CaseDetailPage } from './pages/case-detail';
import { CasesPage } from './pages/cases';
import { DashboardPage } from './pages/dashboard';
import { SystemPage } from './pages/system';
import { TasksPage } from './pages/tasks';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="cases/:id" element={<CaseDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="animals" element={<AnimalsPage />} />
          <Route path="animals/:id" element={<AnimalDetailPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
