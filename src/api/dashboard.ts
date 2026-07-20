import apiClient from '../config/api'

export const dashboardAPI = {
  metrics: () => apiClient.get('/api/admin/dashboard/metrics'),
}