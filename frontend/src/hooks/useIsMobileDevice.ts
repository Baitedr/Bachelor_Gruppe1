// Hook for å sjekke om brukeren er på en mobil enhet basert på user agent.

export function useIsMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}