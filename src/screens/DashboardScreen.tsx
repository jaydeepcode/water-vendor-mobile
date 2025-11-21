import React, {useEffect, useState, useCallback} from 'react';
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
import {useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import types and services
import {RootStackParamList, DashboardProps, MotorStatusResponse, CreditBalanceResponse} from '../types';
import {apiService} from '../services/api';
import {handleMotorStatusError} from '../utils/errorHandler';

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
  const [creditBalance, setCreditBalance] = useState<CreditBalanceResponse | null>(null);

  useEffect(() => {
    loadCustomerData();
  }, []);

  useEffect(() => {
    if (customerId) {
      fetchMotorStatus();
      fetchCreditBalance();
    }
  }, [customerId]);

  // Refresh credit balance when screen comes into focus (e.g., navigating back from PumpControl)
  // This ensures the credit information is always up-to-date after pump operations
  useFocusEffect(
    useCallback(() => {
      if (customerId) {
        // Silently refresh credit balance in the background without showing loading indicator
        fetchCreditBalance();
        fetchMotorStatus();
      }
    }, [customerId])
  );

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
    fetchCreditBalance();
  };

  const fetchCreditBalance = async () => {
    if (!customerId) return;
    try {
      const balance = await apiService.getCreditBalance(customerId);
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  };

  const getCreditPointsColor = (creditPoints: number): string => {
    // Color scheme:
    // creditPoints <= -1 → Green (advance balance - customer has credit)
    // creditPoints == 0 → Blue (zero balance)
    // creditPoints > 0 → Red (customer owes money - pending trips)
    if (creditPoints <= -1) {
      return '#4CAF50'; // Green - advance balance present
    } else if (creditPoints === 0) {
      return '#2196F3'; // Blue - zero balance
    } else {
      // creditPoints > 0
      return '#F44336'; // Red - customer owes money (pending trips)
    }
  };

  const handlePurchaseWater = () => {
    if (!creditBalance) {
      // If no credit balance data, block access
      Alert.alert(
        'Account Information Unavailable',
        'Unable to verify your account balance. Please try again later.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Allow access if active trip exists (so they can stop it)
    // Check explicitly for true (handles undefined/null cases)
    // Also handle string "true" case in case backend sends it as string (type assertion for edge cases)
    const hasActiveTripValue: any = creditBalance.hasActiveTrip;
    const hasActiveTrip = hasActiveTripValue === true || 
                          (typeof hasActiveTripValue === 'string' && hasActiveTripValue.toLowerCase() === 'true');
    
    if (hasActiveTrip) {
      navigation.navigate('PumpControl');
      return;
    }

    // Allow access ONLY when creditPoints <= -1 (advance balance present - business owes customer)
    if (creditBalance.creditPoints <= -1) {
      navigation.navigate('PumpControl');
      return;
    }

    // Block access for all other cases
    if (creditBalance.creditPoints > 0) {
      // Customer owes money
      Alert.alert(
        'Outstanding Balance',
        `You have ${creditBalance.creditPoints} pending trip(s) with an outstanding balance of ₹${creditBalance.balanceAmount.toFixed(2)}. Please update your balance to continue water access.`,
        [{ text: 'OK' }]
      );
    } else {
      // Zero balance (creditPoints === 0)
      Alert.alert(
        'Zero Balance',
        'Your account balance is zero. Please update your balance to continue water access.',
        [{ text: 'OK' }]
      );
    }
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

  const showStatusAlert = (stationName: string, status: string) => {
    Alert.alert(
      stationName,
      `Status: ${status}`,
      [{ text: 'OK' }]
    );
  };


  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Mangale Services</Text>
        <Text style={styles.subtitle}>Water Vendor Management Portal</Text>
        {customerId && (
          <Text style={styles.customerId}>Vendor ID: {customerId}</Text>
        )}
      </View>

      <View style={styles.creditPointsRow}>
        {creditBalance && (
          <View style={[
            styles.creditPointsContainer,
            { borderLeftColor: getCreditPointsColor(creditBalance.creditPoints) }
          ]}>
            {creditBalance.creditPoints > 0 ? (
              <>
                <Text style={styles.creditPointsLabel}>Pending Trips</Text>
                <Text style={[
                  styles.creditPointsValue,
                  { color: getCreditPointsColor(creditBalance.creditPoints) }
                ]}>
                  {creditBalance.creditPoints}
                </Text>
                <Text style={styles.balanceLabel}>
                  Outstanding Balance: ₹{creditBalance.balanceAmount.toFixed(2)}
                </Text>
                <Text style={styles.statusHint}>
                  {creditBalance.creditPoints} unpaid trip{creditBalance.creditPoints !== 1 ? 's' : ''} pending
                </Text>
              </>
            ) : creditBalance.creditPoints < 0 ? (
              <>
                <Text style={styles.creditPointsLabel}>Available Credit</Text>
                <Text style={[
                  styles.creditPointsValue,
                  { color: getCreditPointsColor(creditBalance.creditPoints) }
                ]}>
                  {Math.abs(creditBalance.creditPoints)}
                </Text>
                <Text style={styles.balanceLabel}>
                  Advance Balance: ₹{Math.abs(creditBalance.balanceAmount).toFixed(2)}
                </Text>
                <Text style={styles.statusHint}>
                  {Math.abs(creditBalance.creditPoints)} trip{Math.abs(creditBalance.creditPoints) !== 1 ? 's' : ''} available
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.creditPointsLabel}>Account Balance</Text>
                <Text style={[
                  styles.creditPointsValue,
                  { color: getCreditPointsColor(creditBalance.creditPoints) }
                ]}>
                  0
                </Text>
                <Text style={styles.balanceLabel}>
                  Current Balance: ₹{creditBalance.balanceAmount.toFixed(2)}
                </Text>
                <Text style={styles.statusHint}>No pending trips</Text>
              </>
            )}
          </View>
        )}

        {motorStatus && (
          <View style={styles.statusIconsContainer}>
            <TouchableOpacity
              style={styles.statusIconWrapper}
              onPress={() => showStatusAlert('Filling Station 1 (Inside)', motorStatus.pump_inside.status)}>
              <View style={[
                styles.statusIconContainer,
                { borderColor: getStatusColor(motorStatus.pump_inside.status) }
              ]}>
                <Text style={styles.statusIcon}>
                  ⚙️
                </Text>
              </View>
              <Text style={styles.statusIconLabel}>Inside</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statusIconWrapper}
              onPress={() => showStatusAlert('Filling Station 2 (Outside)', motorStatus.pump_outside.status)}>
              <View style={[
                styles.statusIconContainer,
                { borderColor: getStatusColor(motorStatus.pump_outside.status) }
              ]}>
                <Text style={styles.statusIcon}>
                  ⚙️
                </Text>
              </View>
              <Text style={styles.statusIconLabel}>Outside</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.servicesContainer}>
        <Text style={styles.sectionTitle}>Our Services</Text>
        <Text style={styles.servicesSubtitle}>Choose from Mangale Services offerings</Text>
        
        <View style={styles.servicesGrid}>
          <TouchableOpacity
            style={styles.serviceButton}
            onPress={handlePurchaseWater}>
            <Text style={styles.serviceIcon}>💧</Text>
            <Text style={styles.serviceTitle}>Purchase Water</Text>
            <Text style={styles.serviceDescription}>Access water filling stations and manage tanker operations</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.serviceButton, styles.serviceButtonDisabled]}>
            <Text style={styles.serviceIcon}>📊</Text>
            <Text style={styles.serviceTitle}>Analytics</Text>
            <Text style={styles.serviceDescription}>Coming Soon - Usage reports and insights</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.serviceButton, styles.serviceButtonDisabled]}>
            <Text style={styles.serviceIcon}>⚙️</Text>
            <Text style={styles.serviceTitle}>Settings</Text>
            <Text style={styles.serviceDescription}>Coming Soon - Account and preferences</Text>
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
    backgroundColor: '#007AFF',
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
  customerId: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
  },
  creditPointsRow: {
    flexDirection: 'row',
    margin: 16,
    marginTop: 16,
    gap: 12,
  },
  creditPointsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  creditPointsLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  creditPointsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  statusIconsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 12,
    minWidth: 70,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  statusIcon: {
    fontSize: 24,
  },
  statusIconLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  servicesContainer: {
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
    color: '#007AFF',
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

export default DashboardScreen;
