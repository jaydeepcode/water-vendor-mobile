import { useEffect, useRef } from 'react';

interface SmartPollingIntervals {
  normal: number; // Normal operation interval (default: 30000ms = 30s)
  last30Seconds: number; // Last 30 seconds interval (default: 5000ms = 5s)
  last5Seconds: number; // Last 5 seconds interval (default: 1000ms = 1s)
  postCompletion: number; // Post-completion interval (default: 2000ms = 2s)
}

interface UseSmartPollingOptions {
  enabled: boolean;
  countdown: number; // Current countdown in seconds
  isCompleted: boolean; // Whether the operation has completed
  onPoll: () => void | Promise<void>;
  intervals?: Partial<SmartPollingIntervals>;
}

const DEFAULT_INTERVALS: SmartPollingIntervals = {
  normal: 30000, // 30 seconds
  last30Seconds: 5000, // 5 seconds
  last5Seconds: 1000, // 1 second
  postCompletion: 2000, // 2 seconds
};

/**
 * Hook for smart polling with dynamic intervals based on countdown state
 * 
 * Intervals:
 * - Normal operation: 30 seconds
 * - Last 30 seconds: 5 seconds
 * - Last 5 seconds: 1 second
 * - Post-completion: 2 seconds
 */
export const useSmartPolling = ({
  enabled,
  countdown,
  isCompleted,
  onPoll,
  intervals = {},
}: UseSmartPollingOptions): void => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalsConfig = { ...DEFAULT_INTERVALS, ...intervals };

  useEffect(() => {
    if (!enabled) {
      // Clear interval if polling is disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Determine current interval based on countdown state
    let currentInterval: number;
    
    if (isCompleted) {
      // Post-completion: poll every 2 seconds
      currentInterval = intervalsConfig.postCompletion;
    } else if (countdown <= 5) {
      // Last 5 seconds: poll every 1 second
      currentInterval = intervalsConfig.last5Seconds;
    } else if (countdown <= 30) {
      // Last 30 seconds: poll every 5 seconds
      currentInterval = intervalsConfig.last30Seconds;
    } else {
      // Normal operation: poll every 30 seconds
      currentInterval = intervalsConfig.normal;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      onPoll();
    }, currentInterval);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, countdown, isCompleted, onPoll, intervalsConfig]);
};
