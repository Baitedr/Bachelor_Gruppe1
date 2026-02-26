import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000/api/v1'
const TOKEN_KEY = 'auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // Extended from 10s to 15s to account for cold DB connections (~1.8s)
  headers: {
    'Content-Type': 'application/json',
  },
})

// Retry logic for auth endpoints under load
const axiosRetry = async (axiosFunc, maxRetries = 2) => {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await axiosFunc()
    } catch (error) {
      lastError = error
      // Retry only on timeout, connection errors, or 5xx status codes
      const isRetryable =
        error.code === 'ECONNABORTED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        (error.response && error.response.status >= 500)

      if (!isRetryable || i === maxRetries) {
        throw error
      }

      // Exponential backoff: 100ms, 300ms
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(3, i) * 100)
      )
    }
  }
  throw lastError
}

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
    const response = await axiosRetry(() => apiClient.get('/health'), 1)
    return response.data
  },

  getSlides: async () => {
    const response = await axiosRetry(() => apiClient.get('/slides'), 1)
    return response.data
  },

  // Authentication
  register: async (credentials) => {
    const response = await axiosRetry(
      () => apiClient.post('/auth/register', credentials),
      2
    )
    setToken(response.data?.token)
    return response.data
  },

  login: async (credentials) => {
    const response = await axiosRetry(
      () => apiClient.post('/auth/login', credentials),
      2
    )
    setToken(response.data?.token)
    return response.data
  },

  me: async () => {
    const response = await axiosRetry(() => apiClient.get('/auth/me'), 1)
    return response.data
  },

  logout: async () => {
    try {
      await axiosRetry(() => apiClient.post('/auth/logout'), 1)
    } finally {
      setToken(null)
    }
  },

  hasToken: () => {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },

  // Presentations
  getPresentations: async (limit = 10) => {
    const response = await axiosRetry(
      () => apiClient.get('/presentations', { params: { limit } }),
      1
    )
    return response.data
  },

  getPresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  createPresentation: async (presentationData) => {
    const response = await axiosRetry(
      () => apiClient.post('/presentations', { presentation: presentationData }),
      1
    )
    return response.data
  },

  updatePresentation: async (presentationId, presentationData) => {
    const response = await axiosRetry(
      () =>
        apiClient.put(`/presentations/${presentationId}`, {
          presentation: presentationData,
        }),
      1
    )
    return response.data
  },

  // Polls
  getPolls: async () => {
    const response = await axiosRetry(() => apiClient.get('/polls'), 1)
    return response.data
  },

  createPoll: async (pollData) => {
    const response = await axiosRetry(
      () => apiClient.post('/polls', { poll: pollData }),
      1
    )
    return response.data
  },

  deletePoll: async (pollId) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/polls/${pollId}`),
      1
    )
    return response.data
  },

  votePoll: async (pollId, optionId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/polls/${pollId}/vote`, { option_id: optionId }),
      1
    )
    return response.data
  },
}

export default api
