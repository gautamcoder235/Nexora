import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrchestratorStore } from '../stores/orchestratorStore';

export type DragDirection = 'horizontal' | 'vertical' | 'horizontal-reverse';

interface DragOptions {
  direction: DragDirection;
  minSize: number;
  maxSize?: (windowSize: number) => number;
  onSizeChange: (newSize: number) => void;
  getStartSize: () => number;
}

export function useDragPanel(options: DragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const resizeRef = useRef({ startPos: 0, startSize: 0, lastSize: 0, animationFrameId: 0 });
  const optionsRef = useRef(options);

  // Keep options up to date without triggering effect reruns
  useEffect(() => {
    optionsRef.current = options;
  });

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { direction, getStartSize } = optionsRef.current;
    resizeRef.current = { 
      startPos: direction === 'vertical' ? e.clientY : e.clientX, 
      startSize: getStartSize(), 
      lastSize: 0,
      animationFrameId: 0
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    // Read direction once when drag starts for visual feedback
    const activeDirection = optionsRef.current.direction;

    const handleMouseMove = (e: MouseEvent) => {
      if (resizeRef.current.animationFrameId) {
        cancelAnimationFrame(resizeRef.current.animationFrameId);
      }
      
      resizeRef.current.animationFrameId = requestAnimationFrame(() => {
        const { direction, minSize, maxSize, onSizeChange } = optionsRef.current;
        const { startPos, startSize } = resizeRef.current;
        const currentPos = direction === 'vertical' ? e.clientY : e.clientX;
        
        let delta = currentPos - startPos;
        if (direction === 'horizontal-reverse') {
          delta = -delta;
        }

        const max = maxSize ? maxSize(direction === 'vertical' ? window.innerHeight : window.innerWidth) : 9999;
        const newSize = Math.max(minSize, Math.min(startSize + delta, max));
        
        resizeRef.current.lastSize = newSize;
        onSizeChange(newSize);
      });
    };

    const handleMouseUp = () => {
      if (resizeRef.current.animationFrameId) {
        cancelAnimationFrame(resizeRef.current.animationFrameId);
      }
      setIsDragging(false);
      useOrchestratorStore.getState().saveSnapshot();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Add visual feedback to body
    document.body.classList.add(activeDirection === 'vertical' ? 'cursor-row-resize' : 'cursor-col-resize');
    document.body.classList.add('select-none');

    return () => {
      if (resizeRef.current.animationFrameId) {
        cancelAnimationFrame(resizeRef.current.animationFrameId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('cursor-row-resize', 'cursor-col-resize', 'select-none');
    };
  }, [isDragging]); // We only depend on isDragging state. Options are safely kept in ref!

  return { isDragging, startDrag };
}
