import apiClient from '../config/api'

export const clientsAPI = {
  list: () => apiClient.get('/api/admin/clients'),
}
