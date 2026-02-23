import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000/api/v1'
const TOKEN_KEY = 'auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

const setToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

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
  register: async (credentials) => {
    const response = await apiClient.post('/auth/register', credentials)
    setToken(response.data?.token)
    return response.data
  },

  login: async (credentials) => {
    const response = await apiClient.post('/auth/login', credentials)
    setToken(response.data?.token)
    return response.data
  },

  me: async () => {
    const response = await apiClient.get('/auth/me')
    return response.data
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      setToken(null)
    }
  },

  hasToken: () => {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },
}

export default api
