import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { canAccessPath } from '@/components/layout/nav-items';

/**
 * Layout guard: if the signed-in user's role isn't allowed to view the current
 * route (per the nav-item `roles` config), bounce them to the dashboard.
 * Routes with no role restriction (Dashboard, Invoice Processing, detail pages,
 * etc.) pass straight through. The backend remains the source of truth.
 */
export function RoleGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (!canAccessPath(pathname, user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
