import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import types and services
import {RootStackParamList, MotorStatusResponse, Customer} from '../types';
import {apiService} from '../services/api';
import {startPump, stopPump, PumpOperationCallbacks} from '../utils/pumpOperations';

type AdminPumpControlScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AdminPumpControl'
>;

interface Props {
  navigation: AdminPumpControlScreenNavigationProp;
  route: {
    params: {
      customer: Customer;
    };
  };
}

const AdminPumpControlScreen: React.FC<Props> = ({navigation, route}) => {
  const { customer } = route.params;
  const [motorStatus, setMotorStatus] = useState<MotorStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [pumpRunning, setPumpRunning] = useState<boolean>(false);
  const [selectedPump, setSelectedPump] = useState<'inside' | 'outside' | 'both' | null>(null);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStopModal, setShowStopModal] = useState<boolean>(false);
  const [showCockModal, setShowCockModal] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(240); // 4 minutes in seconds
  const [autoStopWarning, setAutoStopWarning] = useState<boolean>(false);
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressCountdown, setProgressCountdown] = useState<number>(0);
  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [activeFillingCustomerId, setActiveFillingCustomerId] = useState<number | null>(null);
  const [otherCustomerFilling, setOtherCustomerFilling] = useState<boolean>(false);
  // Tanker capacity from customer data passed from CustomerListScreen
  const tankerCapacity = customer.capacity || 5000; // Use customer capacity or default fallback
  const [estimatedTime, setEstimatedTime] = useState<number>(240); // Based on capacity

  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillingStatusInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchMotorStatus();
    checkFillingStatus();
    checkAndRestoreActiveTrip();
    
    // Calculate estimated time based on tanker capacity
    const timePerLiter = 0.58; // 48 seconds per liter (approximate)
    setEstimatedTime(Math.ceil(tankerCapacity * timePerLiter));
    
    // Poll filling status every 10 seconds
    fillingStatusInterval.current = setInterval(() => {
      checkFillingStatus();
    }, 10000);
    
    return () => {
      // Cleanup timers on unmount
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
      if (autoStopTimeout.current) {
        clearTimeout(autoStopTimeout.current);
      }
      if (fillingStatusInterval.current) {
        clearInterval(fillingStatusInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pumpRunning && countdown > 0) {
      countdownInterval.current = setInterval(() => {
        setCountdown(prev => {
          const newCountdown = prev - 1;
        
          // Show warning at 3 minutes (180 seconds) remaining
          if (newCountdown === 180) {
            handleAutoStopWarning();
          }
          
          // Auto-stop at 0
          if (newCountdown <= 0) {
            handleStopPump();
            return 0;
          }
          
          return newCountdown;
        });
      }, 1000);
    } else {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    }

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    };
  }, [pumpRunning, countdown]);

  const checkAndRestoreActiveTrip = async () => {
    try {
      const customerIdNum = parseInt(customer.id);
      console.log('Checking for active trip for customer:', customerIdNum);
      
      const activeTrip = await apiService.getInProgressTrip(customerIdNum);
      console.log('Active trip response:', activeTrip);
      
      if (activeTrip) {
        // Check if trip has tripId (indicates valid data)
        if (activeTrip.tripId) {
          console.log('Restoring active trip:', activeTrip);
          setPumpRunning(true);
          // Ensure pump value is lowercase
          const pumpUsed = (activeTrip.pumpUsed || '').toLowerCase() as 'inside' | 'outside' | 'both';
          setSelectedPump(pumpUsed);
          setPurchaseId(activeTrip.tripId);
          
          // Calculate time elapsed and set countdown
          if (activeTrip.tripStartTime) {
            const startTime = new Date(activeTrip.tripStartTime).getTime();
            const now = new Date().getTime();
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            const remainingTime = Math.max(0, estimatedTime - elapsedSeconds);
            console.log('Setting countdown to:', remainingTime, 'seconds');
            setCountdown(remainingTime);
          } else {
            setCountdown(estimatedTime);
          }
        } else {
          console.log('No valid trip ID found, not restoring state');
        }
      } else {
        console.log('No active trip found for customer');
      }
    } catch (error) {
      console.error('Error restoring active trip:', error);
      // Not a critical error, just log it
    }
  };

  const checkFillingStatus = async () => {
    try {
      const fillingCustomerId = await apiService.checkFillingStatus();
      setActiveFillingCustomerId(fillingCustomerId);
      
      // Check if a different customer has active filling
      const customerIdNum = parseInt(customer.id);
      setOtherCustomerFilling(
        fillingCustomerId !== null && fillingCustomerId !== customerIdNum
      );
    } catch (error) {
      console.error('Error checking filling status:', error);
      setActiveFillingCustomerId(null);
      setOtherCustomerFilling(false);
    }
  };

  const fetchMotorStatus = async () => {
    try {
      setLoading(true);
      // Try local API first for development
      let status = null;

      // If local fails, try remote API
      try {
        status = await apiService.getMotorStatus();
      } catch (remoteError) {
        console.log('Using local motor status for development');
      }

      setMotorStatus(status);
    } catch (error) {
      console.error('Error fetching motor status:', error);
      Alert.alert('Error', 'Failed to fetch motor status');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoStopWarning = () => {
    setAutoStopWarning(true);
    // Auto-stop after 3 minutes (180 seconds) from start
    autoStopTimeout.current = setTimeout(() => {
      if (pumpRunning) {
        handleStopPump();
      }
    }, 180000); // 3 minutes
  };

  const handleStartPump = async (pump: 'inside' | 'outside' | 'both') => {
    // Check if another customer has filling in progress
    if (otherCustomerFilling) {
      Alert.alert(
        'Pump In Use',
        'Another customer is currently filling water. Please wait until their filling is complete before starting a new operation.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setSelectedPump(pump);
    // Calculate estimated time based on tanker capacity
    const timePerLiter = 0.048; // 48 seconds per liter (approximate)
    const estimated = Math.ceil(tankerCapacity * timePerLiter);
    setEstimatedTime(estimated);
    setCountdown(estimated);
    setShowStartModal(true);
  };

  const confirmStartPump = async () => {
    if (!selectedPump) return;

    try {
      setLoading(true);
      setShowStartModal(false);
      
      // Check if cock confirmation is needed (for inside or both)
      const needsCockConfirmation = selectedPump === 'inside' || selectedPump === 'both';
      
      if (needsCockConfirmation) {
        setShowCockModal(true); // Show cock confirmation after start confirmation
      } else {
        // Outside pump only - no cock confirmation needed, start directly
        await confirmCockPosition();
      }
    } catch (error) {
      console.error('Error starting pump:', error);
      Alert.alert('Error', 'Failed to start pump');
      setLoading(false);
    }
  };

  const confirmCockPosition = async () => {
    if (!selectedPump) return;

    const callbacks: PumpOperationCallbacks = {
      onStartSuccess: async () => {
        setPumpRunning(true);
        setCountdown(estimatedTime); // Use calculated time
        setAutoStopWarning(false);
        setShowProgressModal(false);
        Alert.alert('Success', `Filling station ${selectedPump} started successfully for ${customer.name}`);
        fetchMotorStatus(); // Refresh status
        
        // Record transaction after successful pump start
        try {
          const tripAmount = await apiService.getTripAmount(customer.id);
          console.log(`Trip amount for customer ${customer.id}:`, tripAmount);
          
          if (tripAmount !== undefined && tripAmount !== null) {
            const transaction = await apiService.recordTrip(customer.id, tripAmount, selectedPump);
            console.log(`Transaction recorded for customer ${customer.id}:`, transaction);
            setPurchaseId(transaction.purchaseId);
          }
        } catch (error) {
          console.log('Could not record transaction:', error);
          // Don't fail the pump start if transaction recording fails
        }
      },
      onStopSuccess: () => {
        // Not used in start operation
      },
      onError: (error: any, operation: 'start' | 'stop') => {
        console.error(`Error ${operation}ing pump:`, error);
        Alert.alert('Error', `Failed to ${operation} pump`);
        setLoading(false);
        setShowProgressModal(false);
      },
      onCockConfirmationRequired: (onConfirm: () => void, onCancel: () => void) => {
        // This will be handled by the modal state
        setShowCockModal(false);
        onConfirm();
      },
      onProgress: (message: string, countdown?: number) => {
        setProgressMessage(message);
        setProgressCountdown(countdown || 0);
        setShowProgressModal(true);
        if (message.includes('successfully')) {
          setTimeout(() => setShowProgressModal(false), 2000);
        }
      }
    };

    try {
      await startPump(selectedPump, customer.id, callbacks);
    } catch (error) {
      // Error handling is done in callbacks
    }
  };

  const handleStopPump = async () => {
    if (!selectedPump) return;

    const callbacks: PumpOperationCallbacks = {
      onStartSuccess: () => {
        // Not used in stop operation
      },
      onStopSuccess: async () => {
        setPumpRunning(false);
        setCountdown(240); // Reset countdown
        setAutoStopWarning(false);
        setSelectedPump(null);

        // Clear timers
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
        if (autoStopTimeout.current) {
          clearTimeout(autoStopTimeout.current);
        }

        Alert.alert('Success', `Pump stopped successfully for ${customer.name}`);
        fetchMotorStatus(); // Refresh status
        
        // Update trip stop time if purchaseId exists
        if (purchaseId) {
          try {
            await apiService.updateTripTime(customer.id, purchaseId);
            console.log(`Trip stop time updated for customer ${customer.id}, purchaseId ${purchaseId}`);
          } catch (error) {
            console.log('Could not update trip stop time:', error);
          }
        }
        
        // Always reset purchaseId after stop
        setPurchaseId(null);
      },
      onError: (error: any, operation: 'start' | 'stop') => {
        console.error(`Error ${operation}ing pump:`, error);
        Alert.alert('Error', `Failed to ${operation} pump`);
        setLoading(false);
      },
      onCockConfirmationRequired: (onConfirm: () => void, onCancel: () => void) => {
        // Not used in stop operation
      }
    };

    try {
      setLoading(true);
      setShowStopModal(false);
      await stopPump(selectedPump, callbacks);
    } catch (error) {
      // Error handling is done in callbacks
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    return status === 'ON' ? '#4CAF50' : '#FF5722';
  };

  const handleBackToCustomerList = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToCustomerList}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Admin Pump Control</Text>
          <Text style={styles.subtitle}>Controlling: {customer.name}</Text>
          <Text style={styles.customerId}>Customer ID: {customer.id}</Text>
        </View>
      </View>

      {otherCustomerFilling && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningTextContainer}>
            <Text style={styles.warningTitle}>Another Customer Filling</Text>
            <Text style={styles.warningText}>
              Cannot start new filling operation while another customer is using the pump.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>Current Status</Text>

        {motorStatus ? (
          <View style={styles.statusGrid}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Filling Station 1</Text>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getStatusColor(motorStatus.pump_inside.status)},
                ]}>
                <Text style={styles.statusText}>{motorStatus.pump_inside.status}</Text>
              </View>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Filling Station 2</Text>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getStatusColor(motorStatus.pump_outside.status)},
                ]}>
                <Text style={styles.statusText}>{motorStatus.pump_outside.status}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.loadingText}>Loading motor status...</Text>
          </View>
        )}
      </View>

      <View style={styles.controlContainer}>
        {pumpRunning ? (
          <View style={styles.runningContainer}>
            <Text style={styles.runningText}>
              Filling Station {selectedPump === 'both' ? '1 & 2' : selectedPump} is running
            </Text>
            <Text style={styles.customerRunningText}>for {customer.name}</Text>
            <View style={styles.timeTrackerContainer}>
              <Text style={styles.timerText}>
                Time remaining: {formatTime(countdown)}
              </Text>
              <Text style={styles.capacityText}>
                Tanker Capacity: {tankerCapacity}L
              </Text>
              <Text style={styles.estimatedText}>
                Estimated time: {formatTime(estimatedTime)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.stopButton}
              onPress={() => setShowStopModal(true)}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.stopButtonText}>Stop Filling</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.startContainer}>
            <Text style={styles.startTitle}>Start Tanker Filling</Text>
            <Text style={styles.startSubtitle}>Choose which filling station to use</Text>
            <Text style={styles.customerInfo}>Customer: {customer.name}</Text>

            <View style={styles.buttonGrid}>
              <View style={styles.stationButtonsRow}>
                <TouchableOpacity
                  style={[
                    styles.stationButton,
                    otherCustomerFilling && styles.disabledButton
                  ]}
                  onPress={() => handleStartPump('inside')}
                  disabled={loading || otherCustomerFilling}>
                  <Text style={[
                    styles.stationButtonText,
                    otherCustomerFilling && styles.disabledButtonText
                  ]}>Station 1</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.stationButton,
                    otherCustomerFilling && styles.disabledButton
                  ]}
                  onPress={() => handleStartPump('outside')}
                  disabled={loading || otherCustomerFilling}>
                  <Text style={[
                    styles.stationButtonText,
                    otherCustomerFilling && styles.disabledButtonText
                  ]}>Station 2</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.bothStationsButton,
                  otherCustomerFilling && styles.disabledBothButton
                ]}
                onPress={() => handleStartPump('both')}
                disabled={loading || otherCustomerFilling}>
                <Text style={[
                  styles.bothStationsButtonText,
                  otherCustomerFilling && styles.disabledButtonText
                ]}>Start Both Stations</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Start Confirmation Modal */}
      <Modal
        visible={showStartModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowStartModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Start</Text>
            <Text style={styles.modalText}>
              Do you really want to start the water filling operation at {selectedPump === 'both' ? 'both stations' : `station ${selectedPump}`} for {customer.name}?
            </Text>
            <Text style={styles.modalSubtext}>
              This will run for approximately {formatTime(estimatedTime)} to fill their {tankerCapacity}L tanker.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowStartModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmStartPump}>
                <Text style={styles.modalConfirmText}>Start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Stop Confirmation Modal */}
      <Modal
        visible={showStopModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowStopModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Stop</Text>
            <Text style={styles.modalText}>
              Are you sure you want to stop filling at {selectedPump === 'both' ? 'both stations' : `station ${selectedPump}`} for {customer.name}?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowStopModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleStopPump}>
                <Text style={styles.modalConfirmText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cock Position Confirmation Modal */}
      <Modal
        visible={showCockModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCockModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cock Position Confirmation</Text>
            <Text style={styles.modalText}>
              Please confirm that the yellow cock is turned to route water to the tanker pipe (not to the storage tank inside) for {customer.name}.
            </Text>
            <Text style={styles.modalSubtext}>
              This ensures water flows to their tanker and not to internal storage.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowCockModal(false);
                  setLoading(false);
                }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmCockPosition}>
                <Text style={styles.modalConfirmText}>Cock is Correct</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Auto-stop Warning Modal */}
      <Modal
        visible={autoStopWarning}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAutoStopWarning(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Auto-Stop Warning</Text>
            <Text style={styles.modalText}>
              The filling operation for {customer.name} has been running for 3 minutes. It will automatically stop in 1 minute.
            </Text>
            <Text style={styles.modalSubtext}>
              You can stop it now or let it continue to complete the tanker filling.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setAutoStopWarning(false)}>
                <Text style={styles.modalCancelText}>Continue</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={() => {
                  setAutoStopWarning(false);
                  setShowStopModal(true);
                }}>
                <Text style={styles.modalConfirmText}>Stop Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Progress Modal */}
      <Modal
        visible={showProgressModal}
        transparent={true}
        animationType="fade">
        <View style={styles.progressModalOverlay}>
          <View style={styles.progressModalContent}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.progressMessage}>{progressMessage}</Text>
            {progressCountdown > 0 && (
              <Text style={styles.progressCountdown}>{progressCountdown}s</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#FF6B35',
    padding: 20,
    paddingTop: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  customerId: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  statusContainer: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusCard: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  controlContainer: {
    flex: 1,
    padding: 16,
  },
  runningContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  runningText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  customerRunningText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  timeTrackerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
  },
  capacityText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  estimatedText: {
    fontSize: 12,
    color: '#999',
  },
  stopButton: {
    backgroundColor: '#FF5722',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  startContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  startTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  startSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  customerInfo: {
    fontSize: 14,
    color: '#FF6B35',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonGrid: {
    gap: 12,
  },
  stationButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stationButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  stationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bothStationsButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  bothStationsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    margin: 20,
    width: '80%',
    maxWidth: 400,
    alignItems: 'center',
  },
  progressMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  progressCountdown: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B35',
    textAlign: 'center',
  },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  disabledBothButton: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  disabledButtonText: {
    color: '#666666',
  },
});

export default AdminPumpControlScreen;
