import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { api } from '../lib/api'
import type { Profile } from '@shared/types'

// ─── Shape ───────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['admin', 'ceo', 'developer', 'owner'] as const

interface AuthContextValue {
  user: Profile | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithToken: (token: string, profile: Profile) => void
  logout: () => Promise<void>
  hasRole: (roles: string[]) => boolean
  updateUser: (updates: Partial<Profile>) => void
  /** Role being previewed (admin only). null = off. */
  previewRole: string | null
  setPreviewRole: (role: string | null) => void
  /** The effective role: previewRole if set, otherwise real user role */
  effectiveRole: string | null
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('aq_token'),
  )
  // Show loading while validating a stored token. No token = no loading needed.
  const [isLoading, setIsLoading] = useState(
    () => !!localStorage.getItem('aq_token'),
  )
  const urlPreviewRole = new URLSearchParams(window.location.search).get('preview_role')
  const [previewRole, setPreviewRoleState] = useState<string | null>(urlPreviewRole)

  // On mount: validate stored token and hydrate profile in background
  useEffect(() => {
    const stored = localStorage.getItem('aq_token')
    if (!stored) {
      setIsLoading(false)
      return
    }
    api.auth
      .me()
      .then((res) => {
        setUser(res.user ?? res)
      })
      .catch(() => {
        // Token is invalid or expired — clear it and redirect
        localStorage.removeItem('aq_token')
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password)
    const { token: newToken, user: profile } = res
    localStorage.setItem('aq_token', newToken)
    setToken(newToken)
    setUser(profile)
  }, [])

  const loginWithToken = useCallback((newToken: string, profile: Profile) => {
    localStorage.setItem('aq_token', newToken)
    setToken(newToken)
    setUser(profile)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // Ignore server errors on logout — we clear locally regardless
    } finally {
      localStorage.removeItem('aq_token')
      setToken(null)
      setUser(null)
    }
  }, [])

  const isRealAdmin = user ? (ADMIN_ROLES as readonly string[]).includes(user.role) : false

  const setPreviewRole = useCallback((role: string | null) => {
    if (!isRealAdmin) return
    setPreviewRoleState(role)
  }, [isRealAdmin])

  const effectiveRole = (isRealAdmin && previewRole) ? previewRole : (user?.role ?? null)

  const hasRole = useCallback(
    (roles: string[]) => {
      if (!user) return false
      const role = (isRealAdmin && previewRole) ? previewRole : user.role
      return roles.includes(role)
    },
    [user, isRealAdmin, previewRole],
  )

  const updateUser = useCallback((updates: Partial<Profile>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev))
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithToken,
        logout,
        hasRole,
        updateUser,
        previewRole,
        setPreviewRole,
        effectiveRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
