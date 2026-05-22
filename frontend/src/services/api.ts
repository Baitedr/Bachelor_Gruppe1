import axios, { type AxiosRequestConfig } from 'axios'

function resolveApiBaseUrl(): string {
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
const axiosRetry = async <T>(axiosFunc: () => Promise<T>, maxRetries = 2): Promise<T> => {
  let lastError: unknown
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await axiosFunc()
    } catch (error: unknown) {
      lastError = error
      // Prøv på nytt bare ved tidsavbrudd, tilkoblingsfeil eller 5xx-statuskoder
      const err = error as { code?: string; response?: { status: number } }
      const isRetryable =
        err.code === 'ECONNABORTED' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ECONNREFUSED' ||
        (err.response != null && err.response.status >= 500)

      if (!isRetryable || i === maxRetries) {
        throw error
      }

      // Exponential backoff: 100ms, 300ms
      await new Promise((resolve) => setTimeout(resolve, Math.pow(3, i) * 100))
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
const setToken = (token: string | null): void => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

// Hoved-API-objektet som eksporterer alle funksjoner for å kommunisere med backend.
const api = {
  setAuthToken: (token: string | null): void => {
    setToken(token)
  },

  // Authentication
  register: async (credentials: Record<string, unknown>) => {
    const response = await axiosRetry(
      () => apiClient.post('/auth/register', credentials),
      2
    )
    setToken(response.data?.token ?? null)
    return response.data
  },

  // Login
  login: async (credentials: Record<string, unknown>) => {
    const response = await axiosRetry(
      () => apiClient.post('/auth/login', credentials),
      2
    )
    setToken(response.data?.token ?? null)
    return response.data
  },

  me: async () => {
    const response = await axiosRetry(() => apiClient.get('/auth/me'), 1)
    return response.data
  },

  // Oppdaterer brukerprofilen, for eksempel ved endring av navn. Tar et objekt med profildata og sender det til backend.
  updateProfile: async (profileData: Record<string, unknown>) => {
    const response = await axiosRetry(
      () => apiClient.patch('/auth/profile', profileData),
      1
    )
    return response.data
  },

  // Endrer brukerens passord ved å sende nåværende passord, nytt passord og bekreftelse til backend. Krever at brukeren er logget inn.
  changePassword: async ({
    current_password,
    password,
    password_confirmation,
  }: {
    current_password?: string
    password: string
    password_confirmation: string
  }) => {
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
  logout: async (): Promise<void> => {
    if (!localStorage.getItem(TOKEN_KEY)) return

    try {
      await axiosRetry(() => apiClient.post('/auth/logout'), 1)
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status !== 401) throw error
    } finally {
      setToken(null)
    }
  },

  hasToken: (): boolean => {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },

  getToken: (): string | null => {
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
  getPresentation: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  // Oppretter en ny presentasjon ved å sende presentasjonsdata til backend. Returnerer data for den opprettede presentasjonen.
  createPresentation: async (presentationData: Record<string, unknown>) => {
    const response = await axiosRetry(
      () =>
        apiClient.post('/presentations', { presentation: presentationData }, {
          timeout: 120000,
        } as AxiosRequestConfig),
      1
    )
    return response.data
  },

  // Oppdaterer en eksisterende presentasjon ved å sende oppdatert data til backend. Krever presentasjons-ID og det nye dataet for presentasjonen.
  updatePresentation: async (
    presentationId: string | number,
    presentationData: Record<string, unknown>
  ) => {
    const response = await axiosRetry(
      () =>
        apiClient.put(
          `/presentations/${presentationId}`,
          { presentation: presentationData },
          { timeout: 120000 } as AxiosRequestConfig
        ),
      1
    )
    return response.data
  },

  // Sletter en presentasjon basert på ID ved å sende en DELETE-forespørsel til backend. Returnerer data fra responsen.
  deletePresentation: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/presentations/${presentationId}`),
      1
    )
    return response.data
  },

  // Sessions
  // Starter en live presentasjonsøkt ved å sende en POST-forespørsel til backend med presentasjons-ID. Returnerer data om den startet økten.
  startSession: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/start`),
      1
    )
    return response.data
  },

  // Avslutter en live presentasjonsøkt ved å sende en POST-forespørsel til backend med presentasjons-ID. Returnerer data om den avsluttede økten.
  endSession: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/end_session`),
      1
    )
    return response.data
  },

  // Bli med i en live presentasjonsøkt som presentatør ved å sende en POST-forespørsel til backend med presentasjons-ID.
  joinPresentation: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.post(`/presentations/${presentationId}/join`),
      1
    )
    return response.data
  },

  // Blir med i en live presentasjon som deltaker via en join-kode. Sender POST forespørsel til backend med koden.
  joinByCode: async (code: string) => {
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
  guestJoin: async (code: string) => {
    const response = await axiosRetry(
      () => apiClient.post('/sessions/guest_join', { code }),
      1
    )
    // Lagre gjestetoken slik at WebSocket + joinPresentation-kall fungerer
    setToken(response.data?.token ?? null)
    return response.data
  },

  // Henter listen over deltakere i en live presentasjonsøkt basert på presentasjons-ID. Returnerer data om deltakerne.
  getParticipants: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/participants`),
      1
    )
    return response.data
  },

  // Henter gjeldende tilstand for en live presentasjonsøkt basert på presentasjons-ID. Returnerer data om øktens tilstand, som om den har startet eller avsluttet.
  getSessionState: async (presentationId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.get(`/presentations/${presentationId}/session_state`),
      1
    )
    return response.data
  },

  /** Publikum: live hvis økten er startet på server, ellers lobby. */
  resolveAudienceEntryPage: async (
    presentationId: string | number,
  ): Promise<'live' | 'lobby'> => {
    try {
      const state = await api.getSessionState(presentationId)
      if (state?.session_started) return 'live'
      return 'lobby'
    } catch {
      return 'lobby'
    }
  },

  // Polls
  // Henter listen over alle avstemninger. Returnerer data om avstemningene.
  getPolls: async () => {
    const response = await axiosRetry(() => apiClient.get('/polls'), 1)
    return response.data
  },

  // Oppretter en ny avstemning ved å sende avstemningsdata til backend. Returnerer data om den opprettede avstemningen.
  createPoll: async (pollData: Record<string, unknown>) => {
    const response = await axiosRetry(
      () => apiClient.post('/polls', { poll: pollData }),
      1
    )
    return response.data
  },

  // Sletter en avstemning basert på ID ved å sende en DELETE-forespørsel til backend. Returnerer data fra responsen.
  deletePoll: async (pollId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.delete(`/polls/${pollId}`),
      1
    )
    return response.data
  },

  // Stemmer i en avstemning ved å sende en POST-forespørsel til backend med avstemnings-ID og valgt alternativ-ID. Returnerer data om den registrerte stemmen.
  votePoll: async (pollId: string | number, optionId: string | number) => {
    const response = await axiosRetry(
      () => apiClient.post(`/polls/${pollId}/vote`, { option_id: optionId }),
      1
    )
    return response.data
  },
}

export default api
