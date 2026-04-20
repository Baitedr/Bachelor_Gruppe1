import React, { useEffect, useMemo } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

const SessionLobby = ({ presentationId, joinCode, isPresenter, onSessionStarted, onSessionEnd }) => {
  const { participantCount, sessionStarted, startSession, sessionEnded } = usePresentation(
    presentationId,
    localStorage.getItem('auth_token')
  )

  //URL brukere kan dele for å bli med i økten
  const joinUrl = useMemo(() => {
    if (!joinCode) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/live/join/${joinCode}`
  }, [joinCode])

  //API kommando: Lager QR-kode
  const qrCodeUrl = useMemo(() => {
    if (!joinUrl) return ''
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`
  }, [joinUrl])

  // Når sessionStarted endres til true, kaller vi onSessionStarted callback for å informere parent-komponenten om at økten har startet.
  useEffect(() => {
    if (sessionStarted)  onSessionStarted()
    }, [sessionStarted, onSessionStarted])

  // Når sessionEnded endres til true, kaller vi onSessionEnd callback for å informere parent-komponenten om at økten har avsluttet.
  useEffect(() => {
    if (sessionEnded && onSessionEnd) onSessionEnd() 
    }, [sessionEnded, onSessionEnd])

  return (
    <Card className='mx-auto w-full max-w-2xl'>
      <CardHeader className='text-center'>
        <CardTitle>Øktlobby</CardTitle>
        <CardDescription>
          {isPresenter
            ? 'Vent på at deltakerne blir med, og start deretter presentasjonen.'
            : 'Venter på at presentatør skal starte økten.'}
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-6 text-center'>
        {isPresenter && joinCode && (
          <div className='mx-auto w-full max-w-md space-y-3'>
            <Badge variant='secondary'>Del denne live-koden</Badge>
            <div className='rounded-xl border border-border bg-muted/40 px-6 py-4'>
              <p className='font-mono text-3xl font-bold tracking-[0.2em] sm:text-4xl'>{joinCode}</p>
            </div>
          </div>
        )}

        <div className='mx-auto w-full max-w-sm rounded-xl border-2 border-border bg-muted/50 px-4 py-4 shadow-sm dark:border-border dark:bg-muted/30 dark:shadow-none'>
          <p className='text-sm font-medium text-foreground'>Deltakere i lobbyen</p>
          <p className='mt-1 text-3xl font-bold tabular-nums text-foreground'>{participantCount}</p>
        </div>

        {isPresenter ? (
          <Button onClick={startSession} disabled={participantCount === 0} size='lg'>
            Start presentasjon
          </Button>
        ) : (
          <p className='text-sm text-muted-foreground'>Venter på at presentatør skal starte...</p>
        )}

        {/*qr kode*/}
        {isPresenter && qrCodeUrl && (
          <div className='pt-4'>
            <p className='mb-2 text-sm text-muted-foreground'>Skann QR-koden for å bli med</p>
            <img
            src={qrCodeUrl}
            alt='QR-kode for å bli med i live presentasjon'
            width={180}
            height={180}
            className='mx-auto rounded-md border border-border bg-white p-2'
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SessionLobby
