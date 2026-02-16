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
  // Health check
  checkHealth: async () => {
    const response = await apiClient.get('/health')
    return response.data
  },
}

export default api
