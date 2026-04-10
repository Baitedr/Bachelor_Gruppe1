import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* Myk i lyst modus: tynn, lavkontrast kant og lett fyll — ikke «kort»-kant og tung skygge. */
const modeToggleButtonClass = cn(
  'h-8 w-8 shrink-0 border border-border/50 bg-muted/30 text-foreground shadow-none',
  'hover:border-border/70 hover:bg-accent/70 hover:text-accent-foreground',
  'dark:border-input/70 dark:bg-transparent dark:hover:border-input dark:hover:bg-accent',
)

/**
 * Fjerner midlertidige CSS-variabler for View Transitions etter temabytte.
 * (Animasjonskonsept: samme idé som Telegram — sirkel fra knappen; detaljer ligger i index.css.)
 */
function clearThemeViewTransitionVars() {
  const r = document.documentElement
  r.style.removeProperty('--theme-vt-new-name')
  r.style.removeProperty('--theme-vt-old-name')
  r.style.removeProperty('--theme-vt-dur')
  r.style.removeProperty('--theme-vt-new-z')
  r.style.removeProperty('--theme-vt-old-z')
  r.style.removeProperty('--theme-orig-x')
  r.style.removeProperty('--theme-orig-y')
}

/**
 * Knapp som veksler mellom lyst og mørkt tema (shadcn + next-themes).
 * Måne i lyst modus → bytt til mørkt; sol i mørkt modus → bytt til lyst.
 * Sirkulær avsløring fra knappen (Telegram-inspirert) ved overgang til lyst, inntrekning mot knappen
 * ved overgang til mørkt — der nettleseren støtter View Transitions API.
 */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const clearVt = useCallback(() => clearThemeViewTransitionVars(), [])

  // Etter første render på klienten — unngår mismatch mellom server og nettleser.
  useEffect(() => {
    setMounted(true)
  }, [])

  const runThemeToggle = useCallback(
    (targetEl: HTMLButtonElement) => {
      const isDark = resolvedTheme === 'dark'
      const next = isDark ? 'light' : 'dark'
      const root = document.documentElement
      const rect = targetEl.getBoundingClientRect()
      const x = ((rect.left + rect.right) / 2 / window.innerWidth) * 100
      const y = ((rect.top + rect.bottom) / 2 / window.innerHeight) * 100

      root.style.setProperty('--theme-orig-x', `${x}%`)
      root.style.setProperty('--theme-orig-y', `${y}%`)
      /* Varighet avstemt mot ren clip-path (index.css easing) — verken stresset eller treig. */
      root.style.setProperty('--theme-vt-dur', '0.52s')

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const startVt = document.startViewTransition?.bind(document)
      const useViewTransition = !reduceMotion && Boolean(startVt)

      if (reduceMotion || !useViewTransition) {
        setTheme(next)
        clearVt()
        return
      }

      if (next === 'light') {
        root.style.setProperty('--theme-vt-new-name', 'theme-vt-expand')
        root.style.setProperty('--theme-vt-new-z', '2')
        root.style.setProperty('--theme-vt-old-z', '1')
      } else {
        root.style.setProperty('--theme-vt-old-name', 'theme-vt-implode')
        root.style.setProperty('--theme-vt-old-z', '2')
        root.style.setProperty('--theme-vt-new-z', '1')
      }

      try {
        const transition = startVt(() => {
          flushSync(() => setTheme(next))
        })
        void transition.finished.finally(clearVt)
      } catch {
        clearVt()
        setTheme(next)
      }
    },
    [clearVt, resolvedTheme, setTheme],
  )

  if (!mounted) {
    return (
      <Button type='button' variant='outline' size='icon' className={modeToggleButtonClass} disabled aria-hidden>
        <Sun className='h-4 w-4' />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      ref={buttonRef}
      type='button'
      variant='outline'
      size='icon'
      className={modeToggleButtonClass}
      aria-label={isDark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}
      onClick={(e) => runThemeToggle(buttonRef.current ?? e.currentTarget)}
    >
      {isDark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
    </Button>
  )
}
