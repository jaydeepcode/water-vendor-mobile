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
import {RootStackParamList, PumpControlProps, MotorStatusResponse} from '../types';
import {apiService} from '../services/api';

type PumpControlScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'PumpControl'
>;

interface Props {
  navigation: PumpControlScreenNavigationProp;
}

const PumpControlScreen: React.FC<Props> = ({navigation}) => {
  const [motorStatus, setMotorStatus] = useState<MotorStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [pumpRunning, setPumpRunning] = useState<boolean>(false);
  const [selectedPump, setSelectedPump] = useState<'inside' | 'outside' | 'both' | null>(null);
  const [showStartModal, setShowStartModal] = useState<boolean>(false);
  const [showStopModal, setShowStopModal] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(240); // 4 minutes in seconds
  const [autoStopWarning, setAutoStopWarning] = useState<boolean>(false);

  const countdownInterval = useRef<NodeJS.Timeout | null>(null);
  const autoStopTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchMotorStatus();
    return () => {
      // Cleanup timers on unmount
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
      if (autoStopTimeout.current) {
        clearTimeout(autoStopTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (pumpRunning && countdown > 0) {
      countdownInterval.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            handleAutoStopWarning();
            return 0;
          }
          return prev - 1;
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

  const fetchMotorStatus = async () => {
    try {
      setLoading(true);
      // Try local API first for development
      let status = await apiService.getMotorStatusLocal();

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
    setSelectedPump(pump);
    setShowStartModal(true);
  };

  const confirmStartPump = async () => {
    if (!selectedPump) return;

    try {
      setLoading(true);
      setShowStartModal(false);

      // Get customer ID for trip amount
      const customerId = await AsyncStorage.getItem('customerId');
      if (customerId) {
        await apiService.getTripAmount(customerId);
      }

      // Start the pump
      await apiService.startPump(selectedPump, 'start');

      setPumpRunning(true);
      setCountdown(240); // Reset to 4 minutes
      setAutoStopWarning(false);

      Alert.alert('Success', `Pump ${selectedPump} started successfully`);
      fetchMotorStatus(); // Refresh status
    } catch (error) {
      console.error('Error starting pump:', error);
      Alert.alert('Error', 'Failed to start pump');
    } finally {
      setLoading(false);
    }
  };

  const handleStopPump = async () => {
    if (!selectedPump) return;

    try {
      setLoading(true);
      setShowStopModal(false);

      await apiService.stopPump(selectedPump, 'stop');

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

      Alert.alert('Success', 'Pump stopped successfully');
      fetchMotorStatus(); // Refresh status
    } catch (error) {
      console.error('Error stopping pump:', error);
      Alert.alert('Error', 'Failed to stop pump');
    } finally {
      setLoading(false);
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

  const getWaterLevelColor = (level: string) => {
    switch (level) {
      case 'HIGH':
        return '#4CAF50';
      case 'MEDIUM':
        return '#FF9800';
      case 'LOW':
        return '#FF5722';
      default:
        return '#666';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pump Control</Text>
        <Text style={styles.subtitle}>Monitor and control water pumps</Text>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>Current Status</Text>

        {motorStatus ? (
          <View style={styles.statusGrid}>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Inside Pump</Text>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getStatusColor(motorStatus.pump_inside.status)},
                ]}>
                <Text style={styles.statusText}>{motorStatus.pump_inside.status}</Text>
              </View>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Outside Pump</Text>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getStatusColor(motorStatus.pump_outside.status)},
                ]}>
                <Text style={styles.statusText}>{motorStatus.pump_outside.status}</Text>
              </View>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Water Level</Text>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getWaterLevelColor(motorStatus.water_level)},
                ]}>
                <Text style={styles.statusText}>{motorStatus.water_level}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading motor status...</Text>
          </View>
        )}
      </View>

      <View style={styles.controlContainer}>
        {pumpRunning ? (
          <View style={styles.runningContainer}>
            <Text style={styles.runningText}>
              Pump {selectedPump} is running
            </Text>
            <Text style={styles.timerText}>
              Time remaining: {formatTime(countdown)}
            </Text>

            <TouchableOpacity
              style={styles.stopButton}
              onPress={() => setShowStopModal(true)}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.stopButtonText}>Stop Pump</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.startContainer}>
            <Text style={styles.startTitle}>Start Pump</Text>
            <Text style={styles.startSubtitle}>Choose which pump to start</Text>

            <View style={styles.buttonGrid}>
              <TouchableOpacity
                style={styles.startButton}
                onPress={() => handleStartPump('inside')}
                disabled={loading}>
                <Text style={styles.startButtonText}>Start Inside Pump</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.startButton}
                onPress={() => handleStartPump('outside')}
                disabled={loading}>
                <Text style={styles.startButtonText}>Start Outside Pump</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.startButton}
                onPress={() => handleStartPump('both')}
                disabled={loading}>
                <Text style={styles.startButtonText}>Start Both Pumps</Text>
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
              Are you sure you want to start the {selectedPump} pump?
            </Text>
            <Text style={styles.modalSubtext}>
              This will run for approximately 4 minutes.
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
              Are you sure you want to stop the {selectedPump} pump?
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
              The pump has been running for 3 minutes. It will automatically stop in 1 minute.
            </Text>
            <Text style={styles.modalSubtext}>
              You can stop it now or let it continue.
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
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
    marginBottom: 8,
  },
  timerText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
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
    marginBottom: 20,
  },
  buttonGrid: {
    gap: 12,
  },
  startButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  startButtonText: {
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
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PumpControlScreen;
