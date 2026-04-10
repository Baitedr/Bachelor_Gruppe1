import { useEffect, useRef } from 'react'
import { StaticCanvas } from 'fabric'

const BASE_WIDTH = 960
const BASE_HEIGHT = 540

const LivePresentationCanvas = ({ slideData, presenterToolbar = null }) => {
  const canvasRef = useRef(null)
  const fabricRef = useRef(null)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const baseSizeRef = useRef({ width: BASE_WIDTH, height: BASE_HEIGHT })

  const resolveBaseSize = () => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT
    baseSizeRef.current = { width, height }
    return baseSizeRef.current
  }

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

    // Render base slide coordinates scaled to fitted viewport size.
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

  useEffect(() => {
    if (!fabricRef.current) return

    const renderData = async () => {
      const { width, height } = resolveBaseSize()
      if (slideData?.fabricData) {
        await fabricRef.current.loadFromJSON(slideData.fabricData)
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

  useEffect(() => {
    const observer = new ResizeObserver(() => fitToContainer())
    if (containerRef.current) observer.observe(containerRef.current)
    fitToContainer()
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className='flex h-full w-full items-center justify-center overflow-hidden'>
      <div ref={wrapperRef} className='relative overflow-hidden rounded-lg'>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {presenterToolbar}
      </div>
    </div>
  )
}

export default LivePresentationCanvas
