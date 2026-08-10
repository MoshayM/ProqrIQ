import React from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PlanProvider } from './contexts/PlanContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import PersistentLayout from './components/layout/PersistentLayout'
import { CommandPalette, useCommandPalette } from './components/ui/command-palette'
import { LogoMark } from './components/ui/logo'
import { PreviewBanner } from './components/PreviewBanner'

// ─── Pages ───────────────────────────────────────────────────────────────────
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AllQuotes from './pages/AllQuotes'
import NewQuote from './pages/NewQuote'
import QuoteDetail from './pages/QuoteDetail'
import BulkCosting from './pages/BulkCosting'
import Assemblies from './pages/Assemblies'
import KBManager from './pages/KBManager'
import RegionalRates from './pages/RegionalRates'
import Settings from './pages/Settings'
import Account from './pages/Account'
import AiControl from './pages/AiControl'
import Notifications from './pages/Notifications'
import DevicePreview from './pages/DevicePreview'
import SupplierMap from './pages/SupplierMap'
import Organization from './pages/Organization'
import SearchPage from './pages/Search'
import Pricing from './pages/Pricing'
import Register from './pages/Register'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Landing from './pages/Landing'
import Checkout from './pages/Checkout'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <LogoMark size={40} />
          <div className="absolute inset-0 rounded-xl ring-2 ring-brand ring-offset-2 animate-ping opacity-30" />
        </div>
        <p className="text-sm text-[#9aa3b2]">Loading…</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <PersistentLayout>{children}</PersistentLayout>
    </RequireAuth>
  )
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2">
      <div className="text-center">
        <p className="text-7xl font-bold text-[#e8ebf2] mb-4">404</p>
        <h1 className="text-xl font-semibold text-[#0f1729] mb-2">Page not found</h1>
        <p className="text-sm text-[#9aa3b2] mb-6">The page you're looking for doesn't exist.</p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-medium rounded-lg hover:bg-navy-800 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

// ─── App shell with command palette ──────────────────────────────────────────

function AppShell() {
  const { open, setOpen } = useCommandPalette()

  return (
    <>
      <PreviewBanner />
      <AppRoutes />
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  )
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login"    element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
      <Route path="/pricing"  element={<Pricing />} />
      <Route path="/terms"    element={<Terms />} />
      <Route path="/privacy"  element={<Privacy />} />

      <Route path="/dashboard"     element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/quotes"        element={<ProtectedLayout><AllQuotes /></ProtectedLayout>} />
      <Route path="/quotes/new"    element={<ProtectedLayout><NewQuote /></ProtectedLayout>} />
      <Route path="/quotes/:id"    element={<ProtectedLayout><QuoteDetail /></ProtectedLayout>} />
      <Route path="/bulk"          element={<ProtectedLayout><BulkCosting /></ProtectedLayout>} />
      <Route path="/assemblies"    element={<ProtectedLayout><Assemblies /></ProtectedLayout>} />
      <Route path="/assemblies/:id" element={<ProtectedLayout><Assemblies /></ProtectedLayout>} />
      <Route path="/account"       element={<ProtectedLayout><Account /></ProtectedLayout>} />
      <Route path="/ai-control"   element={<ProtectedLayout><AiControl /></ProtectedLayout>} />
      <Route path="/plans"          element={<Navigate to="/account?tab=billing" replace />} />
      <Route path="/notifications"   element={<ProtectedLayout><Notifications /></ProtectedLayout>} />
      <Route path="/device-preview"  element={<ProtectedLayout><DevicePreview /></ProtectedLayout>} />
      <Route path="/supplier-map"    element={<ProtectedLayout><SupplierMap /></ProtectedLayout>} />
      <Route path="/billing"         element={<Navigate to="/account?tab=billing" replace />} />
      <Route path="/organization"    element={<ProtectedLayout><Organization /></ProtectedLayout>} />
      <Route path="/search"          element={<ProtectedLayout><SearchPage /></ProtectedLayout>} />

      {/* Legacy redirects */}
      <Route path="/kb"             element={<Navigate to="/account?tab=kb"    replace />} />
      <Route path="/regional-rates" element={<Navigate to="/account?tab=rates" replace />} />
      <Route path="/settings"       element={<Navigate to="/account"           replace />} />

      <Route path="/"  element={<Landing />} />
      <Route path="*"  element={<NotFound />} />
    </Routes>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PlanProvider>
          <AppShell />
        </PlanProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
