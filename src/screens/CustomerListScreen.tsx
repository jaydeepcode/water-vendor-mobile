import React, {useEffect, useState, useRef, useCallback, useMemo} from 'react';
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
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

// Import types and services
import {RootStackParamList, Customer, PendingCustomer, ApprovedCustomer, CustomerWithCreditPointsDTO, CustomerSearchResult} from '../types';
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
  
  // New states for credit points and search
  const [creditPointsMap, setCreditPointsMap] = useState<Map<number, number>>(new Map());
  const [fillingStatusMap, setFillingStatusMap] = useState<Map<number, boolean>>(new Map());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  
  // Animation for pulsing effect
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fillingStatusInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to store current approved customers to avoid stale closure issues
  const approvedCustomersRef = useRef<ApprovedCustomer[]>([]);

  useEffect(() => {
    loadCustomers();
  }, [activeTab]);

  // Keep ref in sync with approvedCustomers state
  useEffect(() => {
    approvedCustomersRef.current = approvedCustomers;
  }, [approvedCustomers]);

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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
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

  // Get active filling customer using hybrid approach (primary: hasActiveTrip, fallback: polling)
  const getActiveFillingCustomer = useCallback((): number | null => {
    // Primary: Use hasActiveTrip from endpoint
    for (const [customerId, hasActiveTrip] of fillingStatusMap.entries()) {
      if (hasActiveTrip) return customerId;
    }
    // Fallback: Use polling result
    return activeFillingCustomerId;
  }, [fillingStatusMap, activeFillingCustomerId]);

  // Fetch customers with credit points
  const fetchCustomersWithCreditPoints = useCallback(async () => {
    try {
      const customersWithCredit = await apiService.getCustomersWithCreditPoints();
      
      // Update credit points map
      const newCreditPointsMap = new Map<number, number>();
      const newFillingStatusMap = new Map<number, boolean>();
      
      customersWithCredit.forEach(customer => {
        newCreditPointsMap.set(customer.custId, customer.creditPoints);
        newFillingStatusMap.set(customer.custId, customer.hasActiveTrip || false);
      });
      
      setCreditPointsMap(newCreditPointsMap);
      setFillingStatusMap(newFillingStatusMap);
      
      // Update active filling customer from the map (find first customer with active trip)
      let activeCustomer: number | null = null;
      for (const [customerId, hasActiveTrip] of newFillingStatusMap.entries()) {
        if (hasActiveTrip) {
          activeCustomer = customerId;
          break;
        }
      }
      // Fallback to polling result if no active trip found in map
      if (activeCustomer === null) {
        activeCustomer = activeFillingCustomerId;
      }
      setActiveFillingCustomerId(activeCustomer);
    } catch (error) {
      console.error('Error fetching customers with credit points:', error);
      // Don't show error to user, just log it - customer list can still be shown
    }
  }, [activeFillingCustomerId]);

  // Get credit points color based on thresholds
  const getCreditPointsColor = useCallback((creditPoints: number): string => {
    if (creditPoints < 0) {
      return '#4CAF50'; // Green - good credit (2+ trips available)
    } else if (creditPoints == 0) {
      return '#2196F3'; // Blue - some credit (1 trip available)
    } else {
      return '#F44336'; // Red - no credit or owes money
    }
  }, []);

  // Debounced search handler
  const handleSearch = useCallback(async (query: string) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);

    // Debounce search (400ms delay)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await apiService.searchCustomers(query.trim());
        
        // Filter out customers already in the main list using ref to get current value
        const currentApprovedCustomers = approvedCustomersRef.current;
        const approvedCustomerIds = new Set(currentApprovedCustomers.map(c => c.customerId));
        const filteredResults = results.filter(result => !approvedCustomerIds.has(result.customerId));
        
        setSearchResults(filteredResults);
      } catch (error) {
        console.error('Error searching customers:', error);
        setSearchResults([]);
        Alert.alert('Search Error', 'Failed to search customers. Please try again.');
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  // Update credit points for a specific customer (optimized approach)
  const updateCustomerCreditPoints = useCallback(async (customerId: number) => {
    try {
      const creditBalance = await apiService.getCreditBalance(customerId.toString());
      
      // Update the maps for this specific customer
      setCreditPointsMap(prev => {
        const newMap = new Map(prev);
        newMap.set(customerId, creditBalance.creditPoints);
        return newMap;
      });
      
      setFillingStatusMap(prev => {
        const newMap = new Map(prev);
        newMap.set(customerId, creditBalance.hasActiveTrip || false);
        return newMap;
      });
      
      // Update active filling customer if needed
      if (creditBalance.hasActiveTrip) {
        setActiveFillingCustomerId(customerId);
      } else if (activeFillingCustomerId === customerId) {
        // If this customer was filling but no longer is, clear it
        setActiveFillingCustomerId(null);
      }
    } catch (error) {
      console.error('Error updating customer credit points:', error);
      // Fallback to full refresh if single update fails
      if (activeTab === 'approved') {
        fetchCustomersWithCreditPoints();
      }
    }
  }, [activeTab, activeFillingCustomerId, fetchCustomersWithCreditPoints]);

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
        // Update ref with current approved customers to avoid stale closure issues
        approvedCustomersRef.current = data;
        
        // Fetch credit points for approved customers
        await fetchCustomersWithCreditPoints();
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      handleCustomerApprovalError(error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh credit points when screen comes into focus (e.g., navigating back from AdminPumpControl)
  // This ensures credit points are up-to-date after pump operations
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'approved') {
        // Refresh all credit points when screen comes into focus
        fetchCustomersWithCreditPoints();
      }
    }, [activeTab, fetchCustomersWithCreditPoints])
  );

  const handleCustomerSelect = (customer: PendingCustomer | ApprovedCustomer) => {
    if (activeTab === 'pending') {
      setSelectedCustomer(customer);
      setShowApprovalModal(true);
    } else {
      // Check if a different customer has active filling
      const activeFillingCustomer = getActiveFillingCustomer();
      const isActiveFillingCustomer = activeFillingCustomer === customer.customerId;
      const hasDifferentCustomerFilling = activeFillingCustomer !== null && !isActiveFillingCustomer;
      
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
        capacity: customer.capacity, // Include tanker capacity
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
        // Refresh credit points after rejection
        if (activeTab === 'approved') {
          await fetchCustomersWithCreditPoints();
        }
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

  // Credit Points Indicator Component
  const CreditPointsIndicator = React.memo(({ creditPoints }: { creditPoints: number | undefined }) => {
    if (creditPoints === undefined) {
      return null;
    }

    const color = getCreditPointsColor(creditPoints);
    const displayValue = creditPoints > 0 ? creditPoints : Math.abs(creditPoints);

    return (
      <View style={[styles.creditPointsCircle, { backgroundColor: color }]}>
        <Text style={styles.creditPointsText}>{displayValue}</Text>
      </View>
    );
  });

  const renderCustomerItem = ({ item }: { item: PendingCustomer | ApprovedCustomer }) => {
    const activeFillingCustomer = getActiveFillingCustomer();
    const isActiveFillingCustomer = activeTab === 'approved' && activeFillingCustomer === item.customerId;
    const hasDifferentCustomerFilling = activeTab === 'approved' && activeFillingCustomer !== null && !isActiveFillingCustomer;
    const creditPoints = creditPointsMap.get(item.customerId);
    
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
              {/* Only show status badge for pending customers */}
              {activeTab === 'pending' && (
                <View style={[styles.statusBadge, { 
                  backgroundColor: '#FF9800'
                }]}>
                  <Text style={styles.statusText}>
                    {item.registrationStatus}
                  </Text>
                </View>
              )}
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
          
          <View style={styles.rightSideContainer}>
            {/* Credit points indicator - positioned above action indicator */}
            {activeTab === 'approved' && creditPoints !== undefined && (
              <View style={styles.creditPointsWrapper}>
                <CreditPointsIndicator creditPoints={creditPoints} />
              </View>
            )}
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

      {activeTab === 'approved' && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search customer by name or ID..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearchResults(false);
                }}>
                <Text style={styles.clearButtonText}>×</Text>
              </TouchableOpacity>
            )}
            {isSearching && (
              <ActivityIndicator size="small" color="#007AFF" style={styles.searchLoader} />
            )}
          </View>

          {showSearchResults && searchQuery.length >= 2 && (
            <View style={styles.searchResultsContainer}>
              {isSearching ? (
                <View style={styles.searchResultsLoading}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={styles.searchResultsText}>Searching...</Text>
                </View>
              ) : searchResults.length > 0 ? (
                <>
                  <Text style={styles.searchResultsHeader}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                  </Text>
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.customerId.toString()}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.searchResultItem}
                        onPress={() => {
                          // Navigate to customer or add to list
                          const customerForNav: Customer = {
                            id: item.customerId.toString(),
                            name: item.customerName,
                            location: item.address,
                            contact: item.contactNumber,
                            status: 'active',
                            pumpAvailable: true,
                            lastUsed: new Date().toISOString(),
                            capacity: item.capacity,
                          };
                          navigation.navigate('AdminPumpControl', { customer: customerForNav });
                        }}>
                        <Text style={styles.searchResultName}>{item.customerName}</Text>
                        <Text style={styles.searchResultDetails}>
                          ID: {item.customerId} • {item.contactNumber}
                        </Text>
                        <Text style={styles.searchResultDetails}>
                          {item.storageType} - {item.capacity}L
                        </Text>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.searchResultSeparator} />}
                  />
                </>
              ) : (
                <View style={styles.searchResultsEmpty}>
                  <Text style={styles.searchResultsText}>No customers found</Text>
                  <Text style={styles.searchResultsSubtext}>Try a different search term</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

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
    position: 'relative',
  },
  customerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    marginRight: 8, // Add space before credit points circle
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
  rightSideContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 16,
  },
  creditPointsWrapper: {
    marginBottom: 8,
    alignItems: 'center',
  },
  actionIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
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
  creditPointsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  creditPointsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    padding: 0,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  searchLoader: {
    marginLeft: 8,
  },
  searchResultsContainer: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 300,
  },
  searchResultsHeader: {
    padding: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchResultsLoading: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchResultsText: {
    fontSize: 14,
    color: '#666',
  },
  searchResultsSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  searchResultsEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  searchResultDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  searchResultSeparator: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
});

export default CustomerListScreen;
