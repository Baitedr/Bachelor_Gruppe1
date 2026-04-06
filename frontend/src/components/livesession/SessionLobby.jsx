import React, { useEffect } from 'react'
import { usePresentation } from '../../hooks/usePresentation'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

const SessionLobby = ({ presentationId, joinCode, isPresenter, onSessionStarted, onSessionEnd }) => {
  const { participantCount, sessionStarted, startSession, sessionEnded } = usePresentation(
    presentationId,
    localStorage.getItem('auth_token')
  )

  useEffect(() => {
    if (sessionStarted) {
      onSessionStarted()
    }
  }, [sessionStarted, onSessionStarted])

  useEffect(() => {
    if (sessionEnded && onSessionEnd) {
      onSessionEnd()
    }
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

        <div className='mx-auto w-full max-w-sm rounded-xl border border-border bg-muted/30 px-4 py-3'>
          <p className='text-sm text-muted-foreground'>Deltakere i lobbyen</p>
          <p className='text-3xl font-semibold'>{participantCount}</p>
        </div>

        {isPresenter ? (
          <Button onClick={startSession} disabled={participantCount === 0} size='lg'>
            Start presentasjon
          </Button>
        ) : (
          <p className='text-sm text-muted-foreground'>Venter på at presentatør skal starte...</p>
        )}
      </CardContent>
    </Card>
  )
}

export default SessionLobby
