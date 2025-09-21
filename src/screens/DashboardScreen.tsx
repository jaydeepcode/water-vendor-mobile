import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import types and services
import {RootStackParamList, DashboardProps, MotorStatusResponse} from '../types';
import {apiService} from '../services/api';

type DashboardScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Dashboard'
>;

interface Props {
  navigation: DashboardScreenNavigationProp;
}

const DashboardScreen: React.FC<Props> = ({navigation}) => {
  const [motorStatus, setMotorStatus] = useState<MotorStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [customerId, setCustomerId] = useState<string>('');

  useEffect(() => {
    loadCustomerData();
    fetchMotorStatus();
  }, []);

  const loadCustomerData = async () => {
    try {
      const storedCustomerId = await AsyncStorage.getItem('customerId');
      if (storedCustomerId) {
        setCustomerId(storedCustomerId);
      }
    } catch (error) {
      console.error('Error loading customer data:', error);
    }
  };

  const fetchMotorStatus = async () => {
    try {
      setLoading(true);
      // Try local API first for development
      let status = await apiService.getMotorStatusLocal();

      // If local fails, try remote API
      try {
        status = await apiService.getMotorStatus();
      } catch (remoteError) {
        // Keep local status if remote fails
        console.log('Using local motor status for development');
      }

      setMotorStatus(status);
    } catch (error) {
      console.error('Error fetching motor status:', error);
      Alert.alert('Error', 'Failed to fetch motor status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMotorStatus();
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('isLoggedIn');
              await AsyncStorage.removeItem('customerId');
              navigation.replace('Login');
            } catch (error) {
              console.error('Error during logout:', error);
            }
          },
        },
      ],
    );
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
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome to Dashboard</Text>
        {customerId && (
          <Text style={styles.customerId}>Customer ID: {customerId}</Text>
        )}
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>Motor Status</Text>

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
            <Text style={styles.loadingText}>
              {loading ? 'Loading motor status...' : 'No motor status available'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.navigate('PumpControl')}>
          <Text style={styles.menuButtonText}>Pump Control</Text>
          <Text style={styles.menuButtonSubtext}>Start/Stop water pumps</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  customerId: {
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
  },
  menuContainer: {
    padding: 16,
  },
  menuButton: {
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
  menuButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  menuButtonSubtext: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DashboardScreen;
