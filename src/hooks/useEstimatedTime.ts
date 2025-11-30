import { useState, useCallback } from 'react';
import { apiService } from '../services/api';
import { EstimatedTimeResponse } from '../types';

interface UseEstimatedTimeOptions {
  onError?: (error: Error) => void;
}

interface UseEstimatedTimeReturn {
  estimatedTime: number | null;
  loading: boolean;
  error: Error | null;
  fetchEstimatedTime: (customerId: string, pumpUsed: 'inside' | 'outside' | 'both', tankerCapacity: number) => Promise<number>;
}

/**
 * Hook to fetch estimated time from backend API
 * Falls back to local calculation if API fails
 * 
 * Fallback rates:
 * - BOTH: 0.46 sec/L
 * - INSIDE/OUTSIDE: 0.9 sec/L
 */
export const useEstimatedTime = (options?: UseEstimatedTimeOptions): UseEstimatedTimeReturn => {
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEstimatedTime = useCallback(
    async (
      customerId: string,
      pumpUsed: 'inside' | 'outside' | 'both',
      tankerCapacity: number
    ): Promise<number> => {
      setLoading(true);
      setError(null);

      try {
        const response: EstimatedTimeResponse = await apiService.getEstimatedTime(
          customerId,
          pumpUsed.toUpperCase()
        );
        
        const estimated = response.estimatedTimeSeconds;
        setEstimatedTime(estimated);
        setLoading(false);
        return estimated;
      } catch (err) {
        console.error('Failed to fetch estimated time, using fallback:', err);
        
        // Fallback calculation
        const fallbackRate = pumpUsed === 'both' ? 0.46 : 0.9;
        const fallbackEstimated = Math.ceil(tankerCapacity * fallbackRate);
        
        setEstimatedTime(fallbackEstimated);
        setError(err instanceof Error ? err : new Error('Failed to fetch estimated time'));
        
        if (options?.onError && err instanceof Error) {
          options.onError(err);
        }
        
        setLoading(false);
        return fallbackEstimated;
      }
    },
    [options]
  );

  return {
    estimatedTime,
    loading,
    error,
    fetchEstimatedTime,
  };
};
