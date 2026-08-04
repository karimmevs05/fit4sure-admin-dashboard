// API Configuration - reads from localStorage or uses production backend
const API_BASE_URL = localStorage.getItem('apiUrl') || import.meta.env.VITE_API_BASE_URL || 'https://fit4surebackend-production.up.railway.app'

export { API_BASE_URL }
