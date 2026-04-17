import { useEffect, useRef } from 'react'
import { StaticCanvas } from 'fabric'
import { resolveFabricDataWithVariables } from '../../lib/utils'

/** Standard lysbildestørrelse når JSON mangler eksplisitte mål (16:9). */
const BASE_WIDTH = 960
const BASE_HEIGHT = 540

/**
 * Statisk Fabric-visning av ett lysbilde under live (presentatør eller publikum).
 * Skalerer proporsjonalt til foreldrens bredde/høyde via ResizeObserver.
 */
const LivePresentationCanvas = ({ slideData, presenterToolbar = null }) => {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const baseSizeRef = useRef({ width: BASE_WIDTH, height: BASE_HEIGHT })

  /** Leser «logisk» slide-bredde/høyde fra fabricData, ellers fallback til BASE_*. */
  const resolveBaseSize = () => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT
    baseSizeRef.current = { width, height }
    return baseSizeRef.current
  }

  /** Uniform skalering som «letterboxer» sliden innenfor beholderen (bevarer sideforhold). */
  const fitToContainer = () => {
    if (!containerRef.current || !wrapperRef.current || !fabricRef.current) return

    const { width: baseWidth, height: baseHeight } = baseSizeRef.current
    const availableWidth = containerRef.current.clientWidth
    const availableHeight = containerRef.current.clientHeight
    const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight)
    if (!Number.isFinite(scale) || scale <= 0) return

    const targetWidth = Math.max(1, Math.floor(baseWidth * scale))
    const targetHeight = Math.max(1, Math.floor(baseHeight * scale))

    wrapperRef.current.style.width = `${targetWidth}px`
    wrapperRef.current.style.height = `${targetHeight}px`

    // Tegner i basis-koordinater, skalert med viewportTransform (samme innhold, annen pikselstørrelse).
    fabricRef.current.setDimensions({ width: targetWidth, height: targetHeight })
    fabricRef.current.setViewportTransform([scale, 0, 0, scale, 0, 0])
    fabricRef.current.requestRenderAll()
  }

  useEffect(() => {
    if (!canvasRef.current) return

    const { width, height } = resolveBaseSize()
    fabricRef.current = new StaticCanvas(canvasRef.current, {
      width,
      height,
      backgroundColor: slideData?.backgroundColor || '#ffffff',
    })

    return () => {
      fabricRef.current?.dispose()
    }
  }, [])

  // Når slideData endres (nytt lysbilde, eller oppdaterte variabler), renderes fabric-objektene på nytt.
  useEffect(() => {
    if (!fabricRef.current) return

    const renderData = async () => {
      const { width, height } = resolveBaseSize()
      const resolvedFabricData = resolveFabricDataWithVariables(
        slideData?.fabricData,
        slideData?.variables || [],
      )

      if (resolvedFabricData) {
        await fabricRef.current.loadFromJSON(resolvedFabricData)
      } else {
        fabricRef.current.clear()
      }

      fabricRef.current.setDimensions({ width, height })
      fabricRef.current.setViewportTransform([1, 0, 0, 1, 0, 0])
      fabricRef.current.backgroundColor = slideData?.backgroundColor || '#ffffff'
      fabricRef.current.renderAll()
      fitToContainer()
    }

    renderData()
  }, [slideData])

  // Oppdaterer skalering ved vindusendring eller når forelderen får ny høyde (f.eks. flex-layout).
  useEffect(() => {
    const observer = new ResizeObserver(() => fitToContainer())
    if (containerRef.current) observer.observe(containerRef.current)
    fitToContainer()
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className='box-border flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-visible p-4 sm:p-5'
    >
      <div
        ref={wrapperRef}
        className='relative overflow-hidden rounded-lg shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {presenterToolbar}
      </div>
    </div>
  )
}

export default LivePresentationCanvas
