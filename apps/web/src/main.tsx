import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { AdminAuthProvider, ThemeProvider } from './hooks/index.ts'
import { AudioPlayerProvider } from './contexts/AudioPlayerContext.tsx'
import { PublicLayout } from './components/layout/PublicLayout.tsx'
import { Toaster } from './components/ui/sonner.tsx'
import {
  AdminLogin,
  AdminLayout,
  AdminDashboard,
  AdminPlaylists,
  AdminRequests,
  AdminStreaming,
  AdminSchedule,
  AdminUpload,
} from './pages/admin'
import { AboutPage, PrivacyPolicyPage } from './pages/info';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AdminAuthProvider>
          <AudioPlayerProvider>
            <BrowserRouter>
              <Toaster richColors position="bottom-center" />
              <Routes>
                {/* Rutas Públicas con Layout (incluye MiniPlayer) */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<App />} />
                  <Route path="/info/who-we-are" element={<AboutPage />} />
                  <Route path="/info/privacy" element={<PrivacyPolicyPage />} />
                </Route>

                <Route path="/info/*" element={<Navigate to="/info/who-we-are" replace />} />

                {/* Panel de administración */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="playlists" element={<AdminPlaylists />} />
                  <Route path="requests" element={<AdminRequests />} />
                  <Route path="streaming" element={<AdminStreaming />} />
                  <Route path="schedule" element={<AdminSchedule />} />
                  <Route path="upload" element={<AdminUpload />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AudioPlayerProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
