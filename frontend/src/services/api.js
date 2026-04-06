import axios from 'axios'

function resolveApiBaseUrl() {
  const explicit = import.meta.env.VITE_API_BASE_URL
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    return '/api/v1'
  }
  return `${window.location.origin}/api/v1`
}

const API_BASE_URL = resolveApiBaseUrl()
const TOKEN_KEY = 'auth_token'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // Utvidet fra 10s til 15s for å ta høyde for kalde DB-tilkoblinger (~1.8s)
  headers: {
    'Content-Type': 'application/json',
  },
})

// Prøv på nytt-logikk for autentiseringsendepunkter under belastning
const axiosRetry = async (axiosFunc, maxRetries = 2) => {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await axiosFunc()
    } catch (error) {
      lastError = error
      // Prøv på nytt bare ved tidsavbrudd, tilkoblingsfeil eller 5xx-statuskoder
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
  setAuthToken: (token) => {
    setToken(token);
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

  updateProfile: async (profileData) => {
    const response = await axiosRetry(
      () => apiClient.patch('/auth/profile', profileData),
      1
    )
    return response.data
  },

  changePassword: async ({ current_password, password, password_confirmation }) => {
    const response = await axiosRetry(
      () =>
        apiClient.patch('/auth/password', {
          password_change: {
            current_password: current_password ?? '',
            password,
            password_confirmation,
          },
        }),
      1
    )
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

  getToken: () => {
    return localStorage.getItem(TOKEN_KEY)
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

  deletePresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  // Sessions
  startSession: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/start`),
      1
    )
    return response.data
  },

  endSession: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/end_session`),
      1
    )
    return response.data
  },

  joinPresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/join`),
      1
    )
    return response.data
  },

  joinByCode: async (code) => {
    const response = await axiosRetry(
      () => apiClient.post('/sessions/join_by_code', { code }),
      1
    )
    if (response.data?.token) {
      setToken(response.data.token)
    }
    return response.data
  },

  guestJoin: async (code) => {
    const response = await axiosRetry(
      () => apiClient.post('/sessions/guest_join', { code }),
      1
    )
    // Lagre gjestetoken slik at WebSocket + joinPresentation-kall fungerer
    setToken(response.data?.token)
    return response.data
  },

  getParticipants: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/participants`),
      1
    )
    return response.data
  },

  getSessionState: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/session_state`),
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
