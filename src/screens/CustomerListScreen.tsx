import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';

// Import types and services
import {RootStackParamList, Customer, PendingCustomer, ApprovedCustomer} from '../types';
import {apiService} from '../services/api';
import {handleCustomerApprovalError} from '../utils/errorHandler';

type CustomerListScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'CustomerList'
>;

interface Props {
  navigation: CustomerListScreenNavigationProp;
}


const CustomerListScreen: React.FC<Props> = ({navigation}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>([]);
  const [approvedCustomers, setApprovedCustomers] = useState<ApprovedCustomer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCustomer, setSelectedCustomer] = useState<PendingCustomer | ApprovedCustomer | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);
  const [activeFillingCustomerId, setActiveFillingCustomerId] = useState<number | null>(null);
  
  // Animation for pulsing effect
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fillingStatusInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [activeTab]);

  useEffect(() => {
    // Start polling for filling status
    checkFillingStatus();
    fillingStatusInterval.current = setInterval(() => {
      checkFillingStatus();
    }, 5000); // Poll every 5 seconds

    // Cleanup interval on unmount
    return () => {
      if (fillingStatusInterval.current) {
        clearInterval(fillingStatusInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    // Start pulse animation when there's an active filling customer
    if (activeFillingCustomerId !== null) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [activeFillingCustomerId]);

  const checkFillingStatus = async () => {
    try {
      const fillingCustomerId = await apiService.checkFillingStatus();
      setActiveFillingCustomerId(fillingCustomerId);
    } catch (error) {
      console.error('Error checking filling status:', error);
      // Don't show error to user, just log it
      setActiveFillingCustomerId(null);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      
      if (activeTab === 'pending') {
        const data = await apiService.getPendingCustomers();
        console.log('Pending customers data:', JSON.stringify(data, null, 2));
        setPendingCustomers(data);
        
        // Auto-switch to approved tab if no pending customers
        if (data.length === 0) {
          setActiveTab('approved');
        }
      } else {
        const data = await apiService.getApprovedCustomers();
        console.log('Approved customers data:', JSON.stringify(data, null, 2));
        setApprovedCustomers(data);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      handleCustomerApprovalError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSelect = (customer: PendingCustomer | ApprovedCustomer) => {
    if (activeTab === 'pending') {
      setSelectedCustomer(customer);
      setShowApprovalModal(true);
    } else {
      // Check if a different customer has active filling
      const isActiveFillingCustomer = activeFillingCustomerId === customer.customerId;
      const hasDifferentCustomerFilling = activeFillingCustomerId !== null && !isActiveFillingCustomer;
      
      if (hasDifferentCustomerFilling) {
        Alert.alert(
          'Pump In Use',
          'Another customer is currently filling water. Please wait until their filling is complete.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Convert to Customer format for navigation
      const customerForNav: Customer = {
        id: customer.customerId.toString(),
        name: customer.customerName,
        location: customer.address, // Use address as location since location field is removed
        contact: customer.contactNumber,
        status: 'active', // All approved customers are considered active
        pumpAvailable: true,
        lastUsed: new Date().toISOString(),
      };
      navigation.navigate('AdminPumpControl', { customer: customerForNav });
    }
  };

  const handleApprove = async () => {
    if (!selectedCustomer) return;
    
    console.log('Selected customer for approval:', JSON.stringify(selectedCustomer, null, 2));
    console.log('Customer ID:', selectedCustomer.customerId);
    
    try {
      const adminId = await AsyncStorage.getItem('userId');
      console.log('Raw Admin ID from storage:', adminId);
      
      if (!selectedCustomer.customerId) {
        Alert.alert('Error', 'Customer ID is missing. Cannot approve customer.');
        return;
      }
      
      if (!adminId || isNaN(parseInt(adminId))) {
        Alert.alert('Error', 'Admin session expired. Please login again.');
        navigation.replace('Login');
        return;
      }
      
      const adminIdNum = parseInt(adminId);
      console.log('Parsed Admin ID:', adminIdNum);
      
      const result = await apiService.approveCustomer(selectedCustomer.customerId, adminIdNum);
      
      if (result.success) {
        Alert.alert('Success', result.message);
        setShowApprovalModal(false);
        loadCustomers(); // Refresh list
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('Error approving customer:', error);
      handleCustomerApprovalError(error);
    }
  };

  const handleReject = async () => {
    if (!selectedCustomer) return;
    
    console.log('Selected customer for rejection:', JSON.stringify(selectedCustomer, null, 2));
    console.log('Customer ID:', selectedCustomer.customerId);
    
    try {
      const adminId = await AsyncStorage.getItem('userId');
      console.log('Raw Admin ID from storage:', adminId);
      
      if (!selectedCustomer.customerId) {
        Alert.alert('Error', 'Customer ID is missing. Cannot reject customer.');
        return;
      }
      
      if (!adminId || isNaN(parseInt(adminId))) {
        Alert.alert('Error', 'Admin session expired. Please login again.');
        navigation.replace('Login');
        return;
      }
      
      const adminIdNum = parseInt(adminId);
      console.log('Parsed Admin ID:', adminIdNum);
      
      const result = await apiService.rejectCustomer(selectedCustomer.customerId, adminIdNum);
      
      if (result.success) {
        Alert.alert('Success', result.message);
        setShowApprovalModal(false);
        loadCustomers(); // Refresh list
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('Error rejecting customer:', error);
      handleCustomerApprovalError(error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const renderCustomerItem = ({ item }: { item: PendingCustomer | ApprovedCustomer }) => {
    const isActiveFillingCustomer = activeTab === 'approved' && activeFillingCustomerId === item.customerId;
    const hasDifferentCustomerFilling = activeTab === 'approved' && activeFillingCustomerId !== null && !isActiveFillingCustomer;
    
    return (
      <Animated.View 
        style={[
          styles.customerCard,
          isActiveFillingCustomer && {
            transform: [{ scale: pulseAnim }],
            borderColor: '#2196F3',
            borderWidth: 2,
            shadowColor: '#2196F3',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 8,
          },
          hasDifferentCustomerFilling && styles.disabledCustomerCard,
        ]}
      >
        <TouchableOpacity
          style={styles.customerCardContent}
          onPress={() => handleCustomerSelect(item)}
          activeOpacity={0.7}
          disabled={hasDifferentCustomerFilling}>
          <View style={styles.customerInfo}>
            <View style={styles.customerHeader}>
              <View style={styles.customerNameContainer}>
                <Text style={styles.customerName}>{item.customerName}</Text>
                {isActiveFillingCustomer && (
                  <Text style={styles.waterDropIcon}>💧</Text>
                )}
              </View>
              <View style={[styles.statusBadge, { 
                backgroundColor: activeTab === 'pending' ? '#FF9800' : 
                  isActiveFillingCustomer ? '#2196F3' : '#4CAF50'
              }]}>
                <Text style={styles.statusText}>
                  {activeTab === 'pending' ? item.registrationStatus : 
                    isActiveFillingCustomer ? 'FILLING' : 'APPROVED'}
                </Text>
              </View>
            </View>
            
            <Text style={styles.customerId}>ID: {item.customerId}</Text>
            <Text style={styles.customerContact}>📞 {item.contactNumber}</Text>
            <Text style={styles.storageInfo}>
              {item.storageType} - {item.capacity}L
            </Text>
            
            {isActiveFillingCustomer && (
              <View style={styles.fillingIndicator}>
                <Text style={styles.fillingText}>🚰 Filling in Progress</Text>
              </View>
            )}
          </View>
          
          <View style={styles.actionIndicator}>
            <Text style={[
              styles.actionIcon,
              hasDifferentCustomerFilling && styles.disabledIcon
            ]}>
              {activeTab === 'pending' ? '⏳' : isActiveFillingCustomer ? '🚰' : '🎛️'}
            </Text>
            <Text style={[
              styles.actionText,
              hasDifferentCustomerFilling && styles.disabledText
            ]}>
              {activeTab === 'pending' ? 'Review' : 
                isActiveFillingCustomer ? 'Control Pump' : 
                hasDifferentCustomerFilling ? 'Busy' : 'Control Pump'}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading customers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Customer Management</Text>
        <Text style={styles.subtitle}>Manage customer approvals and pump controls</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}>
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
            Pending ({pendingCustomers.length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'approved' && styles.activeTab]}
          onPress={() => setActiveTab('approved')}>
          <Text style={[styles.tabText, activeTab === 'approved' && styles.activeTabText]}>
            Approved ({approvedCustomers.length})
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <FlatList
          data={activeTab === 'pending' ? pendingCustomers : approvedCustomers}
          renderItem={renderCustomerItem}
          keyExtractor={(item) => item.customerId.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>

      <Modal
        visible={showApprovalModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowApprovalModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer Approval</Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={() => setShowApprovalModal(false)}
                activeOpacity={0.7}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            
            {selectedCustomer && (
              <View style={styles.customerDetails}>
                <Text style={styles.detailText}>Name: {selectedCustomer.customerName}</Text>
                <Text style={styles.detailText}>Contact: {selectedCustomer.contactNumber}</Text>
                <Text style={styles.detailText}>Storage: {selectedCustomer.storageType} - {selectedCustomer.capacity}L</Text>
                <Text style={styles.detailText}>Address: {selectedCustomer.address}</Text>
                <Text style={styles.detailText}>Status: {selectedCustomer.registrationStatus}</Text>
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.rejectButton} onPress={handleReject}>
                <Text style={styles.rejectButtonText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.approveButton} onPress={handleApprove}>
                <Text style={styles.approveButtonText}>Approve</Text>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  customerCardContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  waterDropIcon: {
    fontSize: 20,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  customerId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  customerContact: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  storageInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  actionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  separator: {
    height: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
    lineHeight: 20,
  },
  customerDetails: {
    marginBottom: 20,
  },
  detailText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FF5722',
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledCustomerCard: {
    opacity: 0.5,
  },
  fillingIndicator: {
    marginTop: 8,
    backgroundColor: '#E3F2FD',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  fillingText: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  disabledIcon: {
    opacity: 0.4,
  },
  disabledText: {
    color: '#999',
  },
});

export default CustomerListScreen;
