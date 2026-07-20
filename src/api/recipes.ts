import apiClient from '../config/api'

export const recipesAPI = {
  list: () => apiClient.get('/api/admin/recipes'),
}
