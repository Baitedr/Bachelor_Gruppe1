import React, { useEffect, useRef } from 'react';
import { StaticCanvas } from 'fabric';

const LivePresentationCanvas = ({ slideData }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    fabricRef.current = new StaticCanvas(canvasRef.current, {
      width: 960,
      height: 540,
      backgroundColor: slideData?.backgroundColor || '#ffffff',
    });

    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (!fabricRef.current || !slideData) return;

    const renderData = async () => {
      if (slideData.fabricData) {
        await fabricRef.current.loadFromJSON(slideData.fabricData);
      } else {
        fabricRef.current.clear();
      }
      fabricRef.current.backgroundColor = slideData.backgroundColor || '#ffffff';
      fabricRef.current.renderAll();
    };

    renderData();
  }, [slideData]);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const scale = containerWidth / 960;
      
      const target = containerRef.current.querySelector('.canvas-container') || containerRef.current.querySelector('canvas');
      if (target) {
        target.style.transform = `scale(${scale})`;
        target.style.transformOrigin = 'top left';
        containerRef.current.style.height = `${540 * scale}px`;
      }
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    setTimeout(handleResize, 50);

    return () => resizeObserver.disconnect();
  }, [slideData]); // Dependency array covers updates

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default LivePresentationCanvas;
