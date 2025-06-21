import { useCallback, useEffect, useRef } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  renderCount: number;
  averageRenderTime: number;
}

export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>(0);
  const renderCount = useRef<number>(0);
  const totalRenderTime = useRef<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
    renderCount.current += 1;

    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      totalRenderTime.current += renderTime;
      
      const averageRenderTime = totalRenderTime.current / renderCount.current;
      
      // Log performance metrics in development
      if (__DEV__) {
        console.log(`[Performance] ${componentName}:`, {
          renderTime: renderTime.toFixed(2) + 'ms',
          renderCount: renderCount.current,
          averageRenderTime: averageRenderTime.toFixed(2) + 'ms',
        });
      }
    };
  });

  const getMetrics = useCallback((): PerformanceMetrics => {
    const averageRenderTime = renderCount.current > 0 
      ? totalRenderTime.current / renderCount.current 
      : 0;
    
    return {
      renderTime: performance.now() - renderStartTime.current,
      renderCount: renderCount.current,
      averageRenderTime,
    };
  }, []);

  return { getMetrics };
}

// Hook to measure function execution time
export function useFunctionTimer() {
  const timers = useRef<Map<string, number>>(new Map());

  const startTimer = useCallback((name: string) => {
    timers.current.set(name, performance.now());
  }, []);

  const endTimer = useCallback((name: string) => {
    const startTime = timers.current.get(name);
    if (startTime) {
      const duration = performance.now() - startTime;
      if (__DEV__) {
        console.log(`[Timer] ${name}: ${duration.toFixed(2)}ms`);
      }
      timers.current.delete(name);
      return duration;
    }
    return 0;
  }, []);

  return { startTimer, endTimer };
} 