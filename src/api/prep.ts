import apiClient from '../config/api'

export const prepAPI = {
  list: () => apiClient.get('/api/admin/weekly-prep'),
}
