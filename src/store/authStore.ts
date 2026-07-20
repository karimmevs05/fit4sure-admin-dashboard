import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User, token: string) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      // For now, just store the credentials
      // In real implementation, this would call the backend
      set({ isLoading: false })
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed'
      set({ error: errorMessage, isLoading: false })
      throw new Error(errorMessage)
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  setUser: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },

  clearError: () => {
    set({ error: null })
  },
}))
