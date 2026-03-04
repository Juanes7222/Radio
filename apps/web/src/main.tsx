import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { AdminAuthProvider, ThemeProvider } from './hooks/index.ts'
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

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AdminAuthProvider>
        <BrowserRouter>
          <Toaster richColors position="bottom-center" />
          <Routes>
            {/* Reproductor público */}
            <Route path="/" element={<App />} />

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
      </AdminAuthProvider>    </ThemeProvider>  </GoogleOAuthProvider></StrictMode>,
)
