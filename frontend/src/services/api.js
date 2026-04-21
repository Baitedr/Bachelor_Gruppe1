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

// Hjelpefunksjon for å sette eller fjerne token i localStorage
const setToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

// Hoved-API-objektet som eksporterer alle funksjoner for å kommunisere med backend.
const api = {
  setAuthToken: (token) => {
    setToken(token);
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

  // Login 
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

  // Oppdaterer brukerprofilen, for eksempel ved endring av navn. Tar et objekt med profildata og sender det til backend.
  updateProfile: async (profileData) => {
    const response = await axiosRetry(
      () => apiClient.patch('/auth/profile', profileData),
      1
    )
    return response.data
  },

  // Endrer brukerens passord ved å sende nåværende passord, nytt passord og bekreftelse til backend. Krever at brukeren er logget inn.
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

  // Logout - fjerner token fra localStorage og informerer backend om utlogging.
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

  // Henter detaljer for en spesifikk presentasjon basert på ID. 
  getPresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  // Oppretter en ny presentasjon ved å sende presentasjonsdata til backend. Returnerer data for den opprettede presentasjonen.
  createPresentation: async (presentationData) => {
    const response = await axiosRetry(
      () => apiClient.post('/presentations', { presentation: presentationData }),
      1
    )
    return response.data
  },

  // Oppdaterer en eksisterende presentasjon ved å sende oppdatert data til backend. Krever presentasjons-ID og det nye dataet for presentasjonen.
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

  // Sletter en presentasjon basert på ID ved å sende en DELETE-forespørsel til backend. Returnerer data fra responsen.
  deletePresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  // Sessions
  // Starter en live presentasjonsøkt ved å sende en POST-forespørsel til backend med presentasjons-ID. Returnerer data om den startet økten.
  startSession: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/start`),
      1
    )
    return response.data
  },

  // Avslutter en live presentasjonsøkt ved å sende en POST-forespørsel til backend med presentasjons-ID. Returnerer data om den avsluttede økten.
  endSession: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/end_session`),
      1
    )
    return response.data
  },

  // Bli med i en live presentasjonsøkt som presentatør ved å sende en POST-forespørsel til backend med presentasjons-ID.
  joinPresentation: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/join`),
      1
    )
    return response.data
  },

  // Blir med i en live presentasjon som deltaker via en join-kode. Sender POST forespørsel til backend med koden.
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

  // Blir med i en live presentasjon som gjest ved å sende en POST-forespørsel til backend med presentasjons-ID og join-kode. 
  // Returnerer data om økten og lagrer gjestetoken for autentisering.
  guestJoin: async (code) => {
    const response = await axiosRetry(
      () => apiClient.post('/sessions/guest_join', { code }),
      1
    )
    // Lagre gjestetoken slik at WebSocket + joinPresentation-kall fungerer
    setToken(response.data?.token)
    return response.data
  },

  // Henter listen over deltakere i en live presentasjonsøkt basert på presentasjons-ID. Returnerer data om deltakerne.
  getParticipants: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/participants`),
      1
    )
    return response.data
  },

  // Henter gjeldende tilstand for en live presentasjonsøkt basert på presentasjons-ID. Returnerer data om øktens tilstand, som om den har startet eller avsluttet.
  getSessionState: async (presentationId) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/session_state`),
      1
    )
    return response.data
  },

  // Polls
  // Henter listen over alle avstemninger. Returnerer data om avstemningene.
  getPolls: async () => {
    const response = await axiosRetry(() => apiClient.get('/polls'), 1)
    return response.data
  },

  // Oppretter en ny avstemning ved å sende avstemningsdata til backend. Returnerer data om den opprettede avstemningen.
  createPoll: async (pollData) => {
    const response = await axiosRetry(
      () => apiClient.post('/polls', { poll: pollData }),
      1
    )
    return response.data
  },

  // Sletter en avstemning basert på ID ved å sende en DELETE-forespørsel til backend. Returnerer data fra responsen.
  deletePoll: async (pollId) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/polls/${pollId}`),
      1
    )
    return response.data
  },

  // Stemmer i en avstemning ved å sende en POST-forespørsel til backend med avstemnings-ID og valgt alternativ-ID. Returnerer data om den registrerte stemmen.
  votePoll: async (pollId, optionId) => {
    const response = await axiosRetry(
      () => apiClient.post(`/polls/${pollId}/vote`, { option_id: optionId }),
      1
    )
    return response.data
  },
}

export default api
