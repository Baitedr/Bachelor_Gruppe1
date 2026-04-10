import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>

/**
 * Wrapper rundt next-themes slik at hele appen kan lese/sette lyst eller mørkt tema.
 * Selve temabyttet kan animeres med View Transitions fra ModeToggle (Telegram-lignende sirkel); se index.css.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
