import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000/api/v1'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

const api = {
  checkHealth: async () => {
    const response = await apiClient.get('/health')
    return response.data
  },

  getSlides: async () => {
    const response = await apiClient.get('/slides')
    return response.data
  },

  // Authentication
  login: async (credentials) => {
    const response = await apiClient.post('/auth/login', credentials)
    return response.data
  },

  logout: async () => {
    const response = await apiClient.post('/auth/logout')
    return response.data
  },
}

export default api
