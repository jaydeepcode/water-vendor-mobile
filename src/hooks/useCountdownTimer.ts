import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCountdownTimerOptions {
  initialSeconds: number;
  enabled: boolean;
  onReachFive?: () => void; // Called when countdown reaches 5 seconds
  onReachZero?: () => void; // Called when countdown reaches 0
}

interface UseCountdownTimerReturn {
  countdown: number;
  isInFinalCountdown: boolean; // true when countdown <= 5
  resetCountdown: (newSeconds: number) => void;
}

/**
 * Hook for countdown timer with callbacks
 * 
 * Features:
 * - 1-second interval updates
 * - isInFinalCountdown flag (true when <= 5 seconds)
 * - onReachFive callback (triggered once when reaching 5)
 * - onReachZero callback (triggered when reaching 0)
 * - resetCountdown method to update the countdown value
 */
export const useCountdownTimer = ({
  initialSeconds,
  enabled,
  onReachFive,
  onReachZero,
}: UseCountdownTimerOptions): UseCountdownTimerReturn => {
  const [countdown, setCountdown] = useState<number>(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTriggeredFiveRef = useRef<boolean>(false);
  const hasTriggeredZeroRef = useRef<boolean>(false);

  // Reset countdown to a new value
  const resetCountdown = useCallback((newSeconds: number) => {
    setCountdown(newSeconds);
    hasTriggeredFiveRef.current = false;
    hasTriggeredZeroRef.current = false;
  }, []);

  useEffect(() => {
    // Reset trigger flags when countdown changes externally
    if (countdown > 5) {
      hasTriggeredFiveRef.current = false;
    }
    if (countdown > 0) {
      hasTriggeredZeroRef.current = false;
    }
  }, [countdown]);

  useEffect(() => {
    if (!enabled || countdown <= 0) {
      // Clear interval if disabled or countdown is already at/below 0
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Set up interval to decrement countdown every second
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        const newCountdown = prev - 1;

        // Trigger onReachFive callback (only once when crossing from 6 to 5)
        if (newCountdown === 5 && !hasTriggeredFiveRef.current && onReachFive) {
          hasTriggeredFiveRef.current = true;
          onReachFive();
        }

        // Trigger onReachZero callback (when reaching 0)
        if (newCountdown <= 0 && !hasTriggeredZeroRef.current && onReachZero) {
          hasTriggeredZeroRef.current = true;
          onReachZero();
        }

        return Math.max(0, newCountdown);
      });
    }, 1000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, countdown, onReachFive, onReachZero]);

  const isInFinalCountdown = countdown <= 5;

  return {
    countdown,
    isInFinalCountdown,
    resetCountdown,
  };
};
