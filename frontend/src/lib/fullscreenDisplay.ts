/**
 * Fullskjerm-hjelpere som fungerer på tvers av nettlesere (inkl. Safari/WebKit).
 * Valg av skjerm bruker Window Management API der det finnes; ellers faller vi tilbake
 * til standard fullskjerm på skjermen der vinduet ligger (fungerer på Mac, Windows, Linux).
 */

export const getFullscreenElement = (): Element | null =>
  document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement || null

export const requestFullscreenEl = (el: Element, options?: FullscreenOptions): Promise<void> => {
  if (!el) return Promise.reject(new Error('no element'))
  const anyEl = el as Element & {
    requestFullscreen?: (opts?: FullscreenOptions) => Promise<void>
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  const req = anyEl.requestFullscreen || anyEl.webkitRequestFullscreen
  if (!req) return Promise.reject(new Error('fullscreen unsupported'))
  if (anyEl.requestFullscreen && options !== undefined) {
    return anyEl.requestFullscreen.call(anyEl, options)
  }
  return Promise.resolve(req.call(anyEl) as Promise<void> | void).then(() => undefined)
}

export const exitFullscreenDoc = (): Promise<void> => {
  const anyDoc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  const exit = document.exitFullscreen || anyDoc.webkitExitFullscreen
  return exit ? Promise.resolve(exit.call(document) as Promise<void> | void).then(() => undefined) : Promise.resolve()
}

export type PresenterScreenChoice = {
  id: string
  label: string
  /** Underliggende `Screen` når Window Management API er tilgjengelig. */
  screen: Screen | null
  availLeft: number
  availTop: number
  availWidth: number
  availHeight: number
}

type ScreenDetailsLike = {
  screens: Screen[]
  currentScreen: Screen
}

const isScreenDetailsLike = (v: unknown): v is ScreenDetailsLike =>
  Boolean(v && typeof v === 'object' && Array.isArray((v as ScreenDetailsLike).screens))

function formatScreenLabel(screen: Screen, index: number, current: Screen): string {
  const w = screen.width
  const h = screen.height
  const anyS = screen as Screen & { isInternal?: boolean; label?: string }
  const parts: string[] = []
  if (anyS.label && String(anyS.label).trim()) parts.push(String(anyS.label).trim())
  else parts.push(`Skjerm ${index + 1}`)
  parts.push(`${w}×${h}`)
  if (anyS.isInternal === true) parts.push('intern')
  if (anyS.isInternal === false) parts.push('ekstern')
  if (screen === current) parts.push('(der du er nå)')
  return parts.join(' · ')
}

/**
 * Returnerer tilgjengelige skjermer, eller én «gjeldende» rad hvis API mangler eller tilgang nektes.
 */
export async function getPresenterScreenChoices(): Promise<PresenterScreenChoice[]> {
  const w = window as Window & { getScreenDetails?: () => Promise<unknown> }
  if (typeof w.getScreenDetails !== 'function') {
    return [
      {
        id: 'fallback-current',
        label: 'Skjermen der nettleservinduet er (standard fullskjerm)',
        screen: null,
        availLeft: window.screen.availLeft,
        availTop: window.screen.availTop,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
      },
    ]
  }
  try {
    const raw = await w.getScreenDetails()
    if (!isScreenDetailsLike(raw)) {
      throw new Error('invalid screen details')
    }
    return raw.screens.map((s, i) => ({
      id: `screen-${s.left}-${s.top}-${s.width}-${s.height}-${i}`,
      label: formatScreenLabel(s, i, raw.currentScreen),
      screen: s,
      availLeft: s.availLeft ?? s.left,
      availTop: s.availTop ?? s.top,
      availWidth: s.availWidth ?? s.width,
      availHeight: s.availHeight ?? s.height,
    }))
  } catch {
    return [
      {
        id: 'fallback-current',
        label: 'Skjermen der nettleservinduet er (standard fullskjerm)',
        screen: null,
        availLeft: window.screen.availLeft,
        availTop: window.screen.availTop,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
      },
    ]
  }
}

type FullscreenWithScreen = (options?: FullscreenOptions & { screen?: Screen }) => Promise<void>

/**
 * Fullskjerm med valgfri målskjerm (Chromium). Uten støtte: vanlig fullskjerm på vinduets skjerm.
 */
export async function requestFullscreenOnScreen(el: Element, targetScreen: Screen | null): Promise<void> {
  const anyEl = el as Element & { requestFullscreen?: FullscreenWithScreen }
  if (targetScreen && typeof anyEl.requestFullscreen === 'function') {
    try {
      await anyEl.requestFullscreen({ navigationUI: 'hide', screen: targetScreen })
      return
    } catch {
      // Fall through til fullskjerm uten screen (f.eks. Safari / eldre Chromium).
    }
  }
  await requestFullscreenEl(el, { navigationUI: 'hide' })
}

const PROJECTOR_WINDOW_NAME_PREFIX = 'liveProjector-'

export function openLiveProjectorWindow(presentationId: string, choice: PresenterScreenChoice): Window | null {
  const u = new URL(window.location.href)
  u.searchParams.set('liveProjector', '1')
  u.searchParams.set('presentationId', presentationId)
  const width = Math.min(Math.max(choice.availWidth, 640), 1600)
  const height = Math.min(Math.max(choice.availHeight, 480), 1200)
  const features = [
    `popup=yes`,
    `width=${width}`,
    `height=${height}`,
    `left=${choice.availLeft}`,
    `top=${choice.availTop}`,
    `noopener`,
    `noreferrer`,
  ].join(',')
  return window.open(u.toString(), `${PROJECTOR_WINDOW_NAME_PREFIX}${presentationId}`, features)
}
