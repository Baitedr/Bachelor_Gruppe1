import { useEffect, useMemo } from 'react'
import { usePresentation } from '@/hooks/usePresentation'
import api from '@/services/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Lobby før live-økt starter; viser kode, deltakerantall og startknapp.
 * @author T3lluz
 */
const styles = {
  rootCard: 'mx-auto w-full max-w-2xl',
  header: 'text-center',
  content: 'space-y-6 text-center',
  codeWrap: 'mx-auto w-full max-w-md space-y-3',
  codePanel: 'rounded-xl border border-border bg-muted/40 px-6 py-4',
  codeText: 'font-mono text-3xl font-bold tracking-[0.2em] sm:text-4xl',
  participantsPanel:
    'mx-auto w-full max-w-sm rounded-xl border-2 border-border bg-muted/50 px-4 py-4 shadow-sm dark:border-border dark:bg-muted/30 dark:shadow-none',
  participantsLabel: 'text-sm font-medium text-foreground',
  participantsCount: 'mt-1 text-3xl font-bold tabular-nums text-foreground',
  waitingText: 'text-sm text-muted-foreground',
  qrSection: 'pt-4',
  qrHint: 'mb-2 text-sm text-muted-foreground',
  qrImage: 'mx-auto rounded-md border border-border bg-white p-2',
} as const

const SessionLobby = ({
  presentationId,
  joinCode,
  isPresenter,
  onSessionStarted,
  onSessionEnd,
}: {
  presentationId: string | number | null
  joinCode: string | null
  isPresenter: boolean
  onSessionStarted: () => void
  onSessionEnd?: () => void
}) => {
  // Bruker live-hooken for å lese lobby-status i sanntid.
  const { participantCount, sessionStarted, startSession, sessionEnded } = usePresentation(
    presentationId,
    localStorage.getItem('auth_token'),
  )

  // Lager delbar URL som deltakere kan åpne direkte.
  const joinUrl = useMemo(() => {
    if (!joinCode) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/live/join/${joinCode}`
  }, [joinCode])

  // Genererer QR-lenke fra join-url for rask mobil innmelding.
  const qrCodeUrl = useMemo(() => {
    if (!joinUrl) return ''
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`
  }, [joinUrl])

  // Publikum: sjekk server med én gang (unngår race der join-API sa lobby men økten allerede er startet).
  useEffect(() => {
    if (isPresenter || !presentationId) return

    let cancelled = false
    void api.resolveAudienceEntryPage(presentationId).then((page) => {
      if (!cancelled && page === 'live') onSessionStarted()
    })

    return () => {
      cancelled = true
    }
  }, [isPresenter, presentationId, onSessionStarted])

  // Varsler parent når økten er startet i kanalen.
  useEffect(() => {
    if (sessionStarted) onSessionStarted()
  }, [sessionStarted, onSessionStarted])

  // Varsler parent når økten er avsluttet av presentatør/system.
  useEffect(() => {
    if (sessionEnded && onSessionEnd) onSessionEnd()
  }, [sessionEnded, onSessionEnd])

  return (
    // Samme kort brukes for både presentatør og publikum; innhold styres av `isPresenter`.
    <Card className={styles.rootCard}>
      <CardHeader className={styles.header}>
        <CardTitle>Øktlobby</CardTitle>
        <CardDescription>
          {isPresenter
            ? 'Vent på at deltakerne blir med, og start deretter presentasjonen.'
            : 'Venter på at presentatør skal starte økten.'}
        </CardDescription>
      </CardHeader>

      <CardContent className={styles.content}>
        {isPresenter && joinCode && (
          <div className={styles.codeWrap}>
            <Badge variant='secondary'>Del denne live-koden</Badge>
            <div className={styles.codePanel}>
              <p className={styles.codeText}>{joinCode}</p>
            </div>
          </div>
        )}

        <div className={styles.participantsPanel}>
          <p className={styles.participantsLabel}>Deltakere i lobbyen</p>
          <p className={styles.participantsCount}>{participantCount}</p>
        </div>

        {isPresenter ? (
          <Button onClick={startSession} disabled={participantCount === 0} size='lg'>
            Start presentasjon
          </Button>
        ) : (
          <p className={styles.waitingText}>Venter på at presentatør skal starte...</p>
        )}

        {isPresenter && qrCodeUrl && (
          <div className={styles.qrSection}>
            <p className={styles.qrHint}>Skann QR-koden for å bli med</p>
            <img
              src={qrCodeUrl}
              alt='QR-kode for å bli med i live presentasjon'
              width={180}
              height={180}
              className={styles.qrImage}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SessionLobby
