import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/auth/AuthContext';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { RoleGate } from '@/auth/RoleGate';
import { AppShell } from '@/components/layout/AppShell';
import { queryClient } from '@/lib/query-client';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import InvoiceProcessingPage from '@/pages/InvoiceProcessingPage';
import InvoiceDetailPage from '@/pages/InvoiceDetailPage';
import OcrValidationPage from '@/pages/OcrValidationPage';
import OcrReviewPage from '@/pages/OcrReviewPage';
import DocumentViewerPage from '@/pages/DocumentViewerPage';
import MatchPage from '@/pages/MatchPage';
import ApprovalsPage from '@/pages/ApprovalsPage';
import ExceptionsPage from '@/pages/ExceptionsPage';
import PaymentsPage from '@/pages/PaymentsPage';
import VendorsPage from '@/pages/VendorsPage';
import SearchPage from '@/pages/SearchPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import AuditLogsPage from '@/pages/AuditLogsPage';
import AdminPage from '@/pages/AdminPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route element={<RoleGate />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="invoices" element={<InvoiceProcessingPage />} />
                    <Route path="invoices/:id" element={<InvoiceDetailPage />} />

                    {/* Role-gated modules (visibility + access driven by nav-items roles) */}
                    <Route path="ocr" element={<OcrValidationPage />} />
                    <Route path="ocr/new" element={<OcrReviewPage />} />
                    <Route path="ocr/:id" element={<OcrReviewPage />} />
                    <Route path="documents" element={<DocumentViewerPage />} />
                    <Route path="match" element={<MatchPage />} />
                    <Route path="match/:id" element={<MatchPage />} />
                    <Route path="approvals" element={<ApprovalsPage />} />
                    <Route path="exceptions" element={<ExceptionsPage />} />
                    <Route path="payments" element={<PaymentsPage />} />
                    <Route path="vendors" element={<VendorsPage />} />
                    <Route path="search" element={<SearchPage />} />
                    <Route path="analytics" element={<AnalyticsPage />} />
                    <Route path="audit" element={<AuditLogsPage />} />
                    <Route path="admin" element={<AdminPage />} />

                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
