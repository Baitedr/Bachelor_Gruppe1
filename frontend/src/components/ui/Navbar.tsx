import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Home, LogOut, MonitorPlay, Save, User } from 'lucide-react'
// Lys/mørk-modus (next-themes + shadcn-knapper).
import { ModeToggle } from '@/components/ui/mode-toggle'
import { cn, formatTime24h, logoutStyleDestructiveButtonClassName } from '@/lib/utils'

// Innhold til toast-linjen midt i navbar (f.eks. angre etter sletting).
export type NavbarCenterToast = {
  message: string
  actions?: React.ReactNode
}

// Lagre i editor: én rad (h-8), ikon venstre og tekst/tid høyre — samme som andre sm-knapper
export type NavbarEditorSave = {
  onSave: () => void
  isSaving: boolean
  lastSavedAt: Date | null
  saveFlash: boolean
  autosaveEnabled: boolean
  onToggleAutosave: () => void
}

type NavbarProps = {
  currentPage: string
  userEmail?: string
  userName?: string
  oauthUser?: boolean
  onGoHome: () => void
  onJoinLive: () => void
  onUpdateProfileName?: (name: string) => Promise<void> | void
  onChangePassword?: (payload: {
    current_password?: string
    password: string
    password_confirmation: string
  }) => Promise<void> | void
  onLogout: () => void
  // Kompakt melding midt i header (angre sletting osv.); styres fra App.
  centerToast?: NavbarCenterToast | null
  // Vises bare på redigersiden; plasseres rett ved «Logget inn som …»
  editorSave?: NavbarEditorSave | null
}

export default function Navbar({
  currentPage,
  userEmail,
  userName,
  oauthUser = false,
  onGoHome,
  onJoinLive,
  onUpdateProfileName,
  onChangePassword,
  onLogout,
  centerToast = null,
  editorSave = null,
}: NavbarProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [nameValue, setNameValue] = useState(userName || '')
  const [isSavingName, setIsSavingName] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  const isInLiveFlow =
    currentPage === 'phoneinteraction' || currentPage === 'lobby' || currentPage === 'live'

  const accountLabel = userName?.trim() || userEmail || 'Bruker'

  useEffect(() => {
    setNameValue(userName || '')
  }, [userName])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleSaveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountError(null)
    setAccountMessage(null)

    const normalizedName = nameValue.trim()
    if (!normalizedName) {
      setAccountError('Navn kan ikke være tomt.')
      return
    }

    if (!onUpdateProfileName) {
      setAccountError('Kunne ikke oppdatere navn akkurat nå.')
      return
    }

    try {
      setIsSavingName(true)
      await onUpdateProfileName(normalizedName)
      setAccountMessage('Navn oppdatert.')
    } catch {
      setAccountError('Kunne ikke oppdatere navn.')
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSavePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountError(null)
    setAccountMessage(null)

    if (newPassword !== confirmNewPassword) {
      setAccountError('De nye passordene er ikke like.')
      return
    }

    if (!onChangePassword) {
      setAccountError('Passordendring er ikke tilgjengelig.')
      return
    }

    try {
      setIsSavingPassword(true)
      await onChangePassword({
        ...(oauthUser ? {} : { current_password: currentPassword }),
        password: newPassword,
        password_confirmation: confirmNewPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setShowPasswordForm(false)
      setAccountMessage('Passord oppdatert.')
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { errors?: string[]; error?: string } } }
      const data = ax.response?.data
      const msg = data?.errors?.join(', ') || data?.error || 'Kunne ikke oppdatere passord.'
      setAccountError(msg)
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <header className='sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur'>
      {/* Fast høyde slik at toast kan ligge absolutt uten å utvide headeren */}
      <div className='relative mx-auto flex h-14 w-full items-center justify-between gap-2 px-4'>
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
        <h1
          className='mr-2 shrink-0 cursor-pointer text-lg font-semibold transition-colors hover:text-primary'
          onClick={onGoHome}
        >
          ProSlides
        </h1>

        {/* Konto-meny (egen ref) + valgfri lagre-knapp for editor */}
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <div className='relative' ref={accountMenuRef}>
            {/* Bruk samme lyse/outline uttrykk som andre handlingsknapper. */}
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='flex items-center gap-2 hover:bg-accent hover:text-accent-foreground'
              aria-label='Åpne profilinnstillinger'
              onClick={() => {
                setIsAccountMenuOpen((previous) => !previous)
                setAccountError(null)
                setAccountMessage(null)
              }}
            >
              <User className='h-4 w-4' />
              <span className='max-w-44 truncate'>Logget inn som {accountLabel}</span>
            </Button>

            {isAccountMenuOpen && (
            <Card className='absolute left-0 top-11 z-50 w-80 border-border/80 shadow-lg'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-sm'>Konto</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {/* Egen seksjon for navneendring. */}
                <form className='space-y-2' onSubmit={handleSaveName}>
                  <Label htmlFor='account-name'>Navn</Label>
                  <Input
                    id='account-name'
                    value={nameValue}
                    onChange={(event) => setNameValue(event.target.value)}
                    placeholder='Skriv nytt navn'
                  />
                  <Button type='submit' size='sm' variant='outline' disabled={isSavingName}>
                    {isSavingName ? 'Lagrer...' : 'Lagre navn'}
                  </Button>
                </form>

                <div className='space-y-2'>
                  <Label>Passord</Label>
                  {!showPasswordForm ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setShowPasswordForm(true)
                        setAccountError(null)
                        setAccountMessage(null)
                      }}
                    >
                      Endre passord
                    </Button>
                  ) : (
                    <form className='space-y-2' onSubmit={handleSavePassword}>
                      {oauthUser && (
                        <p className='text-xs text-muted-foreground'>
                          Du logget inn med OAuth. Du kan sette et passord for innlogging med e-post uten
                          nåværende passord.
                        </p>
                      )}
                      {!oauthUser && (
                        <div className='space-y-1'>
                          <Label htmlFor='account-current-password'>Nåværende passord</Label>
                          <Input
                            id='account-current-password'
                            type='password'
                            autoComplete='current-password'
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                          />
                        </div>
                      )}
                      <div className='space-y-1'>
                        <Label htmlFor='account-new-password'>Nytt passord</Label>
                        <Input
                          id='account-new-password'
                          type='password'
                          autoComplete='new-password'
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                        <p className='text-xs text-muted-foreground'>
                          Minst 8 tegn med store og små bokstaver og minst ett tall.
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='account-confirm-password'>Bekreft nytt passord</Label>
                        <Input
                          id='account-confirm-password'
                          type='password'
                          autoComplete='new-password'
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button type='submit' size='sm' variant='outline' disabled={isSavingPassword}>
                          {isSavingPassword ? 'Lagrer...' : 'Lagre passord'}
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            setShowPasswordForm(false)
                            setCurrentPassword('')
                            setNewPassword('')
                            setConfirmNewPassword('')
                            setAccountError(null)
                          }}
                        >
                          Avbryt
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                {accountError && <p className='text-sm text-destructive'>{accountError}</p>}
                {accountMessage && <p className='text-sm text-emerald-600'>{accountMessage}</p>}
              </CardContent>
            </Card>
            )}
          </div>

          {editorSave ? (
            <div className='flex items-center gap-2'>
              <div className='flex items-center gap-2 rounded-md border border-input px-2 py-1'>
                <span className='text-xs text-muted-foreground'>Autosave</span>
                <button
                  type='button'
                  role='switch'
                  aria-checked={editorSave.autosaveEnabled}
                  onClick={editorSave.onToggleAutosave}
                  className={cn(
                    'relative h-5 w-10 rounded-full transition-colors',
                    editorSave.autosaveEnabled ? 'bg-emerald-500' : 'bg-muted'
                  )}
                  title={editorSave.autosaveEnabled ? 'Autosave på' : 'Autosave av'}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                      editorSave.autosaveEnabled && 'translate-x-5'
                    )}
                  />
                </button>
              </div>

              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={editorSave.isSaving}
                onClick={editorSave.onSave}
                title={
                  editorSave.lastSavedAt
                    ? `Sist lagret ${formatTime24h(editorSave.lastSavedAt)}`
                    : 'Ikke lagret ennå'
                }
                className={cn(
                  'h-8 shrink-0 gap-2 border-emerald-500/30 bg-emerald-500/15 px-3 text-emerald-600 hover:border-input hover:bg-accent hover:text-accent-foreground',
                  editorSave.saveFlash &&
                    'border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/45'
                )}
              >
                {editorSave.saveFlash ? (
                  <Check className='h-4 w-4 shrink-0' aria-hidden />
                ) : (
                  <Save className='h-4 w-4 shrink-0' aria-hidden />
                )}
                <span className='flex min-w-0 items-center gap-2 text-xs leading-none'>
                  <span className='whitespace-nowrap'>
                    {editorSave.isSaving ? 'Lagrer...' : editorSave.saveFlash ? 'Lagret' : 'Lagre'}
                  </span>
                  <span className='max-w-[4.5rem] min-w-0 truncate text-left text-[10px] font-normal text-muted-foreground sm:max-w-[6rem]'>
                    {editorSave.lastSavedAt ? formatTime24h(editorSave.lastSavedAt) : '—'}
                  </span>
                </span>
              </Button>
            </div>
          ) : null}
        </div>
        </div>

        {/* Toast midt i header: absolute = ingen ekstra høyde; stil som sm outline-knapper */}
        {centerToast ? (
          <div
            className='pointer-events-none absolute left-1/2 top-1/2 z-50 flex max-w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 justify-center max-sm:top-full max-sm:mt-1 max-sm:translate-y-0'
            role='status'
          >
            {/* Kun selve boksen fanger klikk (ikke hele overlay-fladen) */}
            <div className='pointer-events-auto inline-flex min-h-8 w-max max-w-[min(92vw,22rem)] items-center gap-2 rounded-md border border-input bg-background/95 px-3 py-0 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200'>
              <span className='min-w-0 flex-1 truncate leading-none'>{centerToast.message}</span>
              {centerToast.actions ? (
                <span className='flex shrink-0 items-center gap-1'>{centerToast.actions}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Høyre: tema, hjem, live, logg ut. z-10 = under toast (z-50) ved overlapp */}
        <div className='relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-2'>
          {/* Tema: sol/måne-ikon som veksler lyst og mørkt. */}
          <ModeToggle />
          {currentPage !== 'home' && (
            <Button onClick={onGoHome} variant='outline' size='sm'>
              <Home className='mr-2 h-4 w-4' />
              Hjem
            </Button>
          )}
          {!isInLiveFlow && (
            <Button
              onClick={onJoinLive}
              variant='outline'
              size='sm'
              className='flex items-center justify-center gap-1.5 border-primary/30 bg-primary/10 text-primary transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
            >
              <MonitorPlay className='mr-2 h-4 w-4' />
              Bli med live
            </Button>
          )}
          <Button onClick={onLogout} variant='outline' size='sm' className={logoutStyleDestructiveButtonClassName}>
            <LogOut className='h-4 w-4' />
            Logg ut
          </Button>
        </div>      
      </div>
    </header>


    
  )
}