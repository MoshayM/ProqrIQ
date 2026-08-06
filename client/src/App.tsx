import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import PersistentLayout from './components/layout/PersistentLayout'

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

// ─── Route guards ─────────────────────────────────────────────────────────────

/**
 * Renders a full-screen spinner while auth is initialising, then redirects
 * unauthenticated users to /login.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#e85c1a] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/**
 * Wraps protected pages in the persistent sidebar layout.
 */
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <PersistentLayout>{children}</PersistentLayout>
    </RequireAuth>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />

      {/* Protected */}
      <Route
        path="/dashboard"
        element={
          <ProtectedLayout>
            <Dashboard />
          </ProtectedLayout>
        }
      />
      <Route
        path="/quotes"
        element={
          <ProtectedLayout>
            <AllQuotes />
          </ProtectedLayout>
        }
      />
      <Route
        path="/quotes/new"
        element={
          <ProtectedLayout>
            <NewQuote />
          </ProtectedLayout>
        }
      />
      <Route
        path="/quotes/:id"
        element={
          <ProtectedLayout>
            <QuoteDetail />
          </ProtectedLayout>
        }
      />
      <Route
        path="/bulk"
        element={
          <ProtectedLayout>
            <BulkCosting />
          </ProtectedLayout>
        }
      />
      <Route
        path="/assemblies"
        element={
          <ProtectedLayout>
            <Assemblies />
          </ProtectedLayout>
        }
      />
      <Route
        path="/assemblies/:id"
        element={
          <ProtectedLayout>
            <Assemblies />
          </ProtectedLayout>
        }
      />
      <Route
        path="/kb"
        element={
          <ProtectedLayout>
            <KBManager />
          </ProtectedLayout>
        }
      />
      <Route
        path="/regional-rates"
        element={
          <ProtectedLayout>
            <RegionalRates />
          </ProtectedLayout>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedLayout>
            <Settings />
          </ProtectedLayout>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 fallback */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-300">404</h1>
              <p className="text-gray-500 mt-2">Page not found</p>
              <a href="/dashboard" className="btn-primary inline-block mt-4">
                Back to Dashboard
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
