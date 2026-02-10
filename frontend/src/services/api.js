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

  // Items CRUD
  getItems: async () => {
    const response = await apiClient.get('/items')
    return response.data
  },

  getItem: async (id) => {
    const response = await apiClient.get(`/items/${id}`)
    return response.data
  },

  createItem: async (itemData) => {
    const response = await apiClient.post('/items', { item: itemData })
    return response.data
  },

  updateItem: async (id, itemData) => {
    const response = await apiClient.put(`/items/${id}`, { item: itemData })
    return response.data
  },

  deleteItem: async (id) => {
    const response = await apiClient.delete(`/items/${id}`)
    return response.data
  },
}

export default api
