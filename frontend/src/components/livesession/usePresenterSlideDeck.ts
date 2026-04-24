import { useCallback, useMemo, useRef } from 'react'
import type { PresenterSlideData } from './PresenterSlideViewport'

type PresentationShape = {
  slides: unknown[]
}

const slideHasInteractiveTools = (slideData: PresenterSlideData) =>
  Boolean(slideData && ((slideData.polls?.length || 0) > 0 || (slideData.questions?.length || 0) > 0))

const slideHasEngagement = (
  slideData: PresenterSlideData,
  pollResults: Record<string, { total?: number }>,
  questionResults: Record<string, { total?: number }>,
  activePoll: unknown,
  activeQuestion: unknown,
) => {
  if (activePoll || activeQuestion) return true
  if (!slideData) return false
  for (const p of slideData.polls || []) {
    if ((pollResults[String(p.id)]?.total || 0) > 0) return true
  }
  for (const q of slideData.questions || []) {
    if ((questionResults[String(q.id)]?.total || 0) > 0) return true
  }
  return false
}

export function usePresenterSlideDeck({
  presentation,
  currentSlide,
  currentSlideData,
  navigateSlide,
  liveboardForSlideIndex,
  showLiveboard,
  dismissLiveboard,
  pollResults,
  questionResults,
  activePoll,
  activeQuestion,
}: {
  presentation: PresentationShape | null
  currentSlide: number
  currentSlideData: PresenterSlideData
  navigateSlide: (index: number, options?: { resumeLiveboard?: boolean }) => void
  liveboardForSlideIndex: number | null
  showLiveboard: (slideIndex: number) => void
  dismissLiveboard: () => void
  pollResults: Record<string, { total?: number }>
  questionResults: Record<string, { total?: number }>
  activePoll: unknown
  activeQuestion: unknown
}) {
  const slidesAdvancedFromLiveboardRef = useRef(new Set<number>())

  const slideCount = presentation?.slides.length ?? 0
  const inLiveboardPhase =
    liveboardForSlideIndex != null && Number(liveboardForSlideIndex) === Number(currentSlide)

  const offerLiveboard = useMemo(
    () =>
      slideHasInteractiveTools(currentSlideData) &&
      slideHasEngagement(currentSlideData, pollResults, questionResults, activePoll, activeQuestion),
    [currentSlideData, pollResults, questionResults, activePoll, activeQuestion],
  )

  const handleNextSlide = useCallback(() => {
    if (!presentation) return
    if (currentSlide >= slideCount - 1 && inLiveboardPhase) return

    if (inLiveboardPhase) {
      slidesAdvancedFromLiveboardRef.current.add(Number(currentSlide))
      navigateSlide(currentSlide + 1)
      return
    }

    if (offerLiveboard) {
      showLiveboard(currentSlide)
      return
    }

    if (currentSlide < slideCount - 1) {
      navigateSlide(currentSlide + 1)
    }
  }, [presentation, slideCount, currentSlide, inLiveboardPhase, offerLiveboard, navigateSlide, showLiveboard])

  const handlePrevSlide = useCallback(() => {
    if (inLiveboardPhase) {
      slidesAdvancedFromLiveboardRef.current.delete(Number(currentSlide))
      dismissLiveboard()
      return
    }
    if (currentSlide > 0) {
      const prevIdx = currentSlide - 1
      if (slidesAdvancedFromLiveboardRef.current.has(prevIdx)) {
        navigateSlide(prevIdx, { resumeLiveboard: true })
      } else {
        navigateSlide(prevIdx)
      }
    }
  }, [inLiveboardPhase, currentSlide, navigateSlide, dismissLiveboard])

  const navCanGoNext =
    currentSlide < slideCount - 1 ||
    (currentSlide === slideCount - 1 && !inLiveboardPhase && offerLiveboard)
  const navCanGoPrev = inLiveboardPhase || currentSlide > 0

  return {
    handleNextSlide,
    handlePrevSlide,
    navCanGoNext,
    navCanGoPrev,
    inLiveboardPhase,
    offerLiveboard,
    slideCount,
  }
}
