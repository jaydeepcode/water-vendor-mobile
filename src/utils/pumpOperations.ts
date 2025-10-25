import { apiService } from '../services/api';

export interface PumpOperationCallbacks {
  onStartSuccess: () => void;
  onStopSuccess: () => void;
  onError: (error: any, operation: 'start' | 'stop') => void;
  onCockConfirmationRequired: (onConfirm: () => void, onCancel: () => void) => void;
  onProgress?: (message: string, countdown?: number) => void; // NEW
}

/**
 * Start pump(s) with proper sequencing and cock position validation
 */
export async function startPump(
  pump: 'inside' | 'outside' | 'both',
  customerId: string,
  callbacks: PumpOperationCallbacks
) {
  try {
    // Check if cock confirmation is needed (for inside or both)
    const needsCockConfirmation = pump === 'inside' || pump === 'both';
    
    if (needsCockConfirmation) {
      // Show cock confirmation modal
      return new Promise<void>((resolve, reject) => {
        callbacks.onCockConfirmationRequired(
          async () => {
            try {
              await executeStartPump(pump, customerId, callbacks);
              callbacks.onStartSuccess();
              resolve();
            } catch (error) {
              callbacks.onError(error, 'start');
              reject(error);
            }
          },
          () => {
            console.log('Pump start cancelled by user');
            reject(new Error('Cancelled by user'));
          }
        );
      });
    } else {
      // Outside pump only - no cock confirmation needed
      await executeStartPump(pump, customerId, callbacks);
      callbacks.onStartSuccess();
    }
  } catch (error) {
    callbacks.onError(error, 'start');
    throw error;
  }
}

/**
 * Execute the actual pump start with proper sequencing
 */
async function executeStartPump(
  pump: 'inside' | 'outside' | 'both',
  customerId: string,
  callbacks: PumpOperationCallbacks
) {
  if (pump === 'both') {
    // Start inside pump first
    callbacks.onProgress?.('Starting inside pump...', 0);
    console.log('Starting inside pump...');
    await apiService.startPump('inside', 'start');
    
    // Wait 5 seconds with countdown
    callbacks.onProgress?.('Inside pump started. Waiting for voltage stabilization...', 5);
    console.log('Inside pump started, waiting 5 seconds for voltage stabilization...');
    for (let i = 5; i > 0; i--) {
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
      if (i > 1) {
        callbacks.onProgress?.(`Voltage stabilizing... ${i-1} seconds remaining`, i-1);
      }
    }
    
    // Start outside pump
    callbacks.onProgress?.('Starting outside pump...', 0);
    console.log('Starting outside pump...');
    await apiService.startPump('outside', 'start');
    callbacks.onProgress?.('Both pumps started successfully!', 0);
    console.log('Both pumps started successfully');
  } else {
    // Single pump
    callbacks.onProgress?.(`Starting ${pump} pump...`, 0);
    console.log(`Starting ${pump} pump...`);
    await apiService.startPump(pump, 'start');
    callbacks.onProgress?.(`${pump} pump started successfully!`, 0);
    console.log(`${pump} pump started successfully`);
  }
}

/**
 * Stop pump(s) - can be done simultaneously for both
 */
export async function stopPump(
  pump: 'inside' | 'outside' | 'both',
  callbacks: PumpOperationCallbacks
) {
  try {
    if (pump === 'both') {
      // Stop both pumps simultaneously
      console.log('Stopping both pumps simultaneously...');
      await Promise.all([
        apiService.stopPump('inside', 'stop'),
        apiService.stopPump('outside', 'stop')
      ]);
      console.log('Both pumps stopped successfully');
    } else {
      // Single pump - stop normally
      console.log(`Stopping ${pump} pump...`);
      await apiService.stopPump(pump, 'stop');
      console.log(`${pump} pump stopped successfully`);
    }
    
    callbacks.onStopSuccess();
  } catch (error) {
    callbacks.onError(error, 'stop');
    throw error;
  }
}
