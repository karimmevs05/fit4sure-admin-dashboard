import apiClient from '../config/api'

export const inventoryAPI = {
  list: () => apiClient.get('/api/admin/inventory'),
}