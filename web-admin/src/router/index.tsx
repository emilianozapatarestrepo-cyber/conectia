import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { lazy, Suspense, type ReactNode } from 'react';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

const ResumenPage      = lazy(() => import('@/pages/ResumenPage'));
const RecaudoPage      = lazy(() => import('@/pages/RecaudoPage'));
const CarteraPage      = lazy(() => import('@/pages/CarteraPage'));
const MorosidadPage    = lazy(() => import('@/pages/MorosidadPage'));
const ConciliacionPage = lazy(() => import('@/pages/ConciliacionPage'));
const AsambleaPage     = lazy(() => import('@/pages/AsambleaPage'));
const LoginPage        = lazy(() => import('@/pages/LoginPage'));

const Suspensed = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
);

export const router = createBrowserRouter([
  { path: '/login', element: <Suspensed><LoginPage /></Suspensed> },
  {
    element: <ProtectedRoute />,
    children: [{
      element: <AppShell />,
      children: [
        { index: true,             element: <Suspensed><ResumenPage /></Suspensed> },
        { path: 'recaudo',         element: <Suspensed><RecaudoPage /></Suspensed> },
        { path: 'cartera',         element: <Suspensed><CarteraPage /></Suspensed> },
        { path: 'morosidad',       element: <Suspensed><MorosidadPage /></Suspensed> },
        { path: 'conciliacion',    element: <Suspensed><ConciliacionPage /></Suspensed> },
        { path: 'asamblea',        element: <Suspensed><AsambleaPage /></Suspensed> },
      ],
    }],
  },
]);
