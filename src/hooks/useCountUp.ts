import { useState, useEffect, useRef } from 'react';

export function useCountUp(
  targetValue: number,
  duration: number = 600,
  formatter?: (val: number) => string
): string {
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const startValueRef = useRef<number>(targetValue);
  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Check prefers-reduced-motion
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayValue(targetValue);
      startValueRef.current = targetValue;
      return;
    }

    const startVal = startValueRef.current;
    const diff = targetValue - startVal;

    if (Math.abs(diff) < 0.001) {
      setDisplayValue(targetValue);
      return;
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutExpo easing: 1 - Math.pow(2, -10 * progress)
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const currentVal = startVal + diff * easeProgress;

      setDisplayValue(currentVal);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
        startValueRef.current = targetValue;
        startTimeRef.current = null;
      }
    };

    startTimeRef.current = null;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetValue, duration]);

  if (formatter) {
    return formatter(displayValue);
  }

  return displayValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
