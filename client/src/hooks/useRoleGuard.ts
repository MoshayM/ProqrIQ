import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function useRoleGuard(allowedRoles: string[]) {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role)) {
      navigate('/dashboard')
    }
  }, [user, isLoading, allowedRoles, navigate])
}
