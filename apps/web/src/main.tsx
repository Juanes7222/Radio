import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AdminAuthProvider } from './hooks/index.ts'
import { AudioPlayerProvider } from './contexts/AudioPlayerContext.tsx'
import { PublicLayout } from './components/layout/PublicLayout.tsx'
import { Toaster } from './components/ui/sonner.tsx'
import { RouteFallback } from './components/RouteFallback.tsx'

// Route-level code splitting: these chunks only load when the user
// visits the corresponding route, keeping the initial bundle small.
const ProgramacionPage = lazy(() => import('./pages/ProgramacionPage.tsx'))
const AboutPage = lazy(() => import('./pages/info/who-we-are.tsx'))
const PrivacyPolicyPage = lazy(() => import('./pages/info/privacy.tsx'))

const AdminLogin = lazy(() => import('./pages/admin/AdminLogin.tsx'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.tsx'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.tsx'))
const AdminPlaylists = lazy(() => import('./pages/admin/AdminPlaylists.tsx'))
const AdminRequests = lazy(() => import('./pages/admin/AdminRequests.tsx'))
const AdminPrayerRequests = lazy(() => import('./pages/admin/AdminPrayerRequests.tsx'))
const AdminStreaming = lazy(() => import('./pages/admin/AdminStreaming.tsx'))
const AdminSchedule = lazy(() => import('./pages/admin/AdminSchedule.tsx'))
const AdminScheduleCategories = lazy(() => import('./pages/admin/AdminScheduleCategories.tsx'))
const AdminUpload = lazy(() => import('./pages/admin/AdminUpload.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminAuthProvider>
      <AudioPlayerProvider>
        <BrowserRouter>
            <Toaster richColors position="bottom-center" />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Rutas Publicas con Layout (incluye MiniPlayer) */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<App />} />
                  <Route path="/programacion" element={<ProgramacionPage />} />
                  <Route path="/info/who-we-are" element={<AboutPage />} />
                  <Route path="/info/privacy" element={<PrivacyPolicyPage />} />
                </Route>

                <Route path="/info/*" element={<Navigate to="/info/who-we-are" replace />} />

                {/* Panel de administracion */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="playlists" element={<AdminPlaylists />} />
                  <Route path="requests" element={<AdminRequests />} />
                  <Route path="prayer" element={<AdminPrayerRequests />} />
                  <Route path="streaming" element={<AdminStreaming />} />
                  <Route path="schedule" element={<AdminSchedule />} />
                  <Route path="schedule/categories" element={<AdminScheduleCategories />} />
                  <Route path="upload" element={<AdminUpload />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AudioPlayerProvider>
      </AdminAuthProvider>
  </StrictMode>,
)
