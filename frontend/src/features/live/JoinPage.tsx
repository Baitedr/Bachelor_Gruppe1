import { useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Håndterer innmelding til live-økt via kode.
 * @author T3lluz
 */
function sanitizeLiveCodeSuffix(raw: string): string {
  const sanitized = raw.trim().toUpperCase().replace(/^LIVE-?/, '')
  return sanitized.replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

// Sikrer at API alltid får kode i forventet LIVE-XXXX-format.
function fullLiveJoinCode(suffix: string): string {
  return `LIVE-${sanitizeLiveCodeSuffix(suffix)}`
}

interface JoinStatus {
  type: 'success' | 'error' | null
  title: string
  message: string
}

interface JoinResponse {
  message?: string
  error?: string
  presentation_id?: string
  join_code?: string
  session_started?: boolean
  token?: string
}

type JoinResult = {
  presentationId: string
}

const styles = {
  pageWrap: 'mx-auto w-full max-w-md p-4',
  cardBorder: 'border-border/70',
  cardContent: 'space-y-4',
  form: 'space-y-4',
  fieldGroup: 'space-y-2',
  codeInputWrap:
    'flex overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
  codePrefix: 'inline-flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground',
  codeInput:
    'rounded-none border-0 font-mono uppercase shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
  submitButton: 'flex w-full items-center gap-2',
  submitIcon: 'h-4 w-4',
  statusError: 'rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive',
  statusSuccess: 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500',
  statusTitle: 'font-medium',
} as const

const PhoneInteraction = ({ onJoined }: { onJoined?: (payload: JoinResult) => void }) => {
  // Lokal input/state for kode, request-status og brukerfeedback.
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [joinStatus, setJoinStatus] = useState<JoinStatus>({
    type: null,
    title: '',
    message: '',
  })

  // Normaliserer feilmelding slik at bruker alltid får en lesbar tekst.
  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message
    return 'Noe gikk galt. Prøv igjen.'
  }

  // Forsøk innlogget join først; fallback til gjeste-join ved 401.
  const joinSession = async (normalizedCode: string): Promise<JoinResponse> => {
    try {
      return (await api.joinByCode(normalizedCode)) as JoinResponse
    } catch (error: unknown) {
      const statusCode = (error as { response?: { status?: number } })?.response?.status
      if (statusCode !== 401) throw error
      return (await api.guestJoin(normalizedCode)) as JoinResponse
    }
  }

  // Hovedflyt for validering + innmelding med fallback til gjest.
  const handleJoinInteraction = async (event: FormEvent) => {
    event.preventDefault()

    const suffix = sanitizeLiveCodeSuffix(joinCode)
    if (!suffix) {
      setJoinStatus({
        type: 'error',
        title: 'Kode mangler',
        message: 'Skriv inn de 4 tegnene i live-koden.',
      })
      return
    }

    if (suffix.length < 4) {
      setJoinStatus({
        type: 'error',
        title: 'For kort kode',
        message: 'Oppgi alle 4 tegnene (bokstaver eller tall).',
      })
      return
    }

    setIsJoining(true)
    setJoinStatus({ type: null, title: '', message: '' })

    try {
      const payload = await joinSession(fullLiveJoinCode(suffix))
      setJoinStatus({
        type: 'success',
        title: 'Tilkoblet',
        message: payload?.message || 'Du er nå koblet til liveøkten.',
      })
      setJoinCode('')

      if (payload.presentation_id && onJoined) {
        onJoined({ presentationId: payload.presentation_id })
      }
    } catch (error: unknown) {
      const backendMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      setJoinStatus({
        type: 'error',
        title: 'Kunne ikke koble til',
        message: backendMessage || extractErrorMessage(error),
      })
    } finally {
      setIsJoining(false)
    }
  }

  return (
    // UI: enkel kodeinngang med prefiks, submit-knapp og statusmelding.
    <div className={styles.pageWrap}>
      <Card className={styles.cardBorder}>
        <CardHeader>
          <CardTitle>Delta med kode</CardTitle>
          <CardDescription>
            Skriv inn de fire tegnene du ser etter «LIVE-» på skjermen til presentatøren.
          </CardDescription>
        </CardHeader>

        <CardContent className={styles.cardContent}>
          <form className={styles.form} onSubmit={handleJoinInteraction}>
            <div className={styles.fieldGroup}>
              <Label htmlFor='liveInteractionCode'>Live-kode</Label>
              <div className={styles.codeInputWrap}>
                <span className={styles.codePrefix} aria-hidden>
                  LIVE-
                </span>
                <Input
                  id='liveInteractionCode'
                  type='text'
                  className={styles.codeInput}
                  value={joinCode}
                  onChange={(event) => setJoinCode(sanitizeLiveCodeSuffix(event.target.value))}
                  placeholder='AB12'
                  autoComplete='off'
                  maxLength={4}
                  inputMode='text'
                  spellCheck={false}
                />
              </div>
            </div>

            <Button type='submit' className={styles.submitButton} disabled={isJoining}>
              {!isJoining && <LogIn className={styles.submitIcon} />}
              {isJoining ? 'Vennligst vent...' : 'Bli med'}
            </Button>
          </form>

          {joinStatus.type && (
            <div
              role='status'
              aria-live='polite'
              className={
                joinStatus.type === 'error'
                  ? styles.statusError
                  : styles.statusSuccess
              }
            >
              <h3 className={styles.statusTitle}>{joinStatus.title}</h3>
              <p>{joinStatus.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PhoneInteraction
