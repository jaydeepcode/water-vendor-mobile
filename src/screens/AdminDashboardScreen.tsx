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
import {RootStackParamList, MotorStatusResponse} from '../types';
import {apiService} from '../services/api';
import {handleMotorStatusError} from '../utils/errorHandler';

type AdminDashboardScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AdminDashboard'
>;

interface Props {
  navigation: AdminDashboardScreenNavigationProp;
}

const AdminDashboardScreen: React.FC<Props> = ({navigation}) => {
  const [motorStatus, setMotorStatus] = useState<MotorStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [adminId, setAdminId] = useState<string>('');

  useEffect(() => {
    loadAdminData();
    fetchMotorStatus();
  }, []);

  const loadAdminData = async () => {
    try {
      const storedAdminId = await AsyncStorage.getItem('adminId');
      if (storedAdminId) {
        setAdminId(storedAdminId);
      }
    } catch (error) {
      console.error('Error loading admin data:', error);
    }
  };

  const fetchMotorStatus = async () => {
    try {
      setLoading(true);
      // Try local API first for development
      let status = await apiService.getMotorStatus();

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
      handleMotorStatusError(error);
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
              await AsyncStorage.removeItem('adminId');
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

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Mangale Services</Text>
        <Text style={styles.subtitle}>Administrator Portal</Text>
        {adminId && (
          <Text style={styles.adminId}>Admin ID: {adminId}</Text>
        )}
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>System Status Overview</Text>

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
            <Text style={styles.loadingText}>
              {loading ? 'Loading system status...' : 'No system status available'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.adminServicesContainer}>
        <Text style={styles.sectionTitle}>Administrator Services</Text>
        <Text style={styles.servicesSubtitle}>Manage water pump operations</Text>
        
        <View style={styles.servicesGrid}>
          <TouchableOpacity
            style={styles.serviceButton}
            onPress={() => navigation.navigate('CustomerList')}>
            <Text style={styles.serviceIcon}>🎛️</Text>
            <Text style={styles.serviceTitle}>Control Water Pumps</Text>
            <Text style={styles.serviceDescription}>Select and control customer water pumps remotely</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.serviceButton, styles.serviceButtonDisabled]}>
            <Text style={styles.serviceIcon}>📊</Text>
            <Text style={styles.serviceTitle}>System Analytics</Text>
            <Text style={styles.serviceDescription}>Coming Soon - System usage reports and insights</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.serviceButton, styles.serviceButtonDisabled]}>
            <Text style={styles.serviceIcon}>👥</Text>
            <Text style={styles.serviceTitle}>Customer Management</Text>
            <Text style={styles.serviceDescription}>Coming Soon - Customer accounts and settings</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.serviceButton, styles.serviceButtonDisabled]}>
            <Text style={styles.serviceIcon}>⚙️</Text>
            <Text style={styles.serviceTitle}>System Settings</Text>
            <Text style={styles.serviceDescription}>Coming Soon - System configuration and preferences</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#FF6B35',
    padding: 20,
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
  },
  adminId: {
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
  },
  adminServicesContainer: {
    padding: 16,
  },
  servicesSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  servicesGrid: {
    gap: 12,
  },
  serviceButton: {
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
  serviceButtonDisabled: {
    opacity: 0.6,
  },
  serviceIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
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

export default AdminDashboardScreen;
