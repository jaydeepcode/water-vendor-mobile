import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { apiService } from '../services/api';
import { handleCustomerRegistrationError } from '../utils/errorHandler';
import { CheckMobileResponse } from '../types';

interface CustomerRegistrationScreenProps {
  navigation: any;
}

type MobileCheckStatus = 'idle' | 'checking' | 'found' | 'new' | 'registered' | 'error';

const CustomerRegistrationScreen: React.FC<CustomerRegistrationScreenProps> = ({ navigation }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerId: null as number | null,
    username: '',
    password: '',
    confirmPassword: '',
    contactNumber: '',
    storageType: 'Tanker',
    tankerCapacity: '',
    vehicleNumber: '',
    firstName: '',
    lastName: '',
    address: '',
    location: '',
  });
  
  const [mobileCheckStatus, setMobileCheckStatus] = useState<MobileCheckStatus>('idle');
  const [mobileCheckMessage, setMobileCheckMessage] = useState('');
  const [existingCustomer, setExistingCustomer] = useState(false);
  const [preFilledFields, setPreFilledFields] = useState<Set<string>>(new Set());

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Format vehicle number for display
  const formatVehicleNumber = (value: string): string => {
    // Remove all non-alphanumeric characters
    const cleaned = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    // Apply formatting: XX-##-X(X)-####
    let formatted = '';
    if (cleaned.length > 0) {
      formatted = cleaned.substring(0, 2); // State code
    }
    if (cleaned.length > 2) {
      formatted += '-' + cleaned.substring(2, 4); // District code
    }
    if (cleaned.length > 4) {
      // Series can be 1 or 2 characters
      const remainingAfterDistrict = cleaned.substring(4);
      const seriesMatch = remainingAfterDistrict.match(/^([A-Z]{1,2})/);
      if (seriesMatch) {
        formatted += '-' + seriesMatch[1];
        const numbersStart = 4 + seriesMatch[1].length;
        if (cleaned.length > numbersStart) {
          formatted += '-' + cleaned.substring(numbersStart, numbersStart + 4);
        }
      }
    }
    
    return formatted;
  };

  // Strip formatting from vehicle number for storage/API
  const stripVehicleNumberFormatting = (value: string): string => {
    return value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  };

  // Validate vehicle number format
  const isValidVehicleNumber = (value: string): boolean => {
    const cleaned = stripVehicleNumberFormatting(value);
    // Pattern: XX##X####  or XX##XX####
    const pattern = /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/;
    return pattern.test(cleaned);
  };

  // Validate mobile number
  const isValidMobileNumber = (mobile: string): boolean => {
    return /^\d{10}$/.test(mobile);
  };

  // Check mobile number with API
  const handleMobileCheck = async () => {
    const mobile = formData.contactNumber.trim();
    
    // Validate format first
    if (!isValidMobileNumber(mobile)) {
      if (mobile.length === 10) {
        setMobileCheckStatus('error');
        setMobileCheckMessage('Invalid mobile number format');
      }
      return;
    }

    setMobileCheckStatus('checking');
    setMobileCheckMessage('Checking mobile number...');

    try {
      const response: CheckMobileResponse = await apiService.checkMobileNumber(mobile);
      
      if (response.success && response.hasUserAccount === false && response.custId) {
        // Existing customer without user account (200 response)
        setMobileCheckStatus('found');
        setMobileCheckMessage('✓ Customer found! Details pre-filled from records');
        setExistingCustomer(true);
        
        // Pre-fill form data
        const preFilledFieldsList = new Set<string>();
        
        setFormData(prev => {
          const updated = { ...prev, customerId: response.custId || null };
          
          if (response.firstName) {
            updated.firstName = response.firstName;
            preFilledFieldsList.add('firstName');
          }
          if (response.lastName) {
            updated.lastName = response.lastName;
            preFilledFieldsList.add('lastName');
          }
          if (response.storageType) {
            updated.storageType = response.storageType;
            preFilledFieldsList.add('storageType');
          }
          if (response.capacity) {
            updated.tankerCapacity = response.capacity.toString();
            preFilledFieldsList.add('tankerCapacity');
          }
          if (response.vehicleNumber) {
            updated.vehicleNumber = formatVehicleNumber(response.vehicleNumber);
            preFilledFieldsList.add('vehicleNumber');
          }
          if (response.address) {
            updated.address = response.address;
            preFilledFieldsList.add('address');
          }
          if (response.location) {
            updated.location = response.location;
            preFilledFieldsList.add('location');
          }
          
          return updated;
        });
        
        setPreFilledFields(preFilledFieldsList);
        
      } else if (response.hasUserAccount === true) {
        // Already registered (400 response)
        setMobileCheckStatus('registered');
        setMobileCheckMessage(response.message || 'This mobile number is already registered. Please login.');
        setExistingCustomer(false);
        
      } else {
        // New customer (404 or other)
        setMobileCheckStatus('new');
        setMobileCheckMessage('ℹ️ New customer - please complete the form');
        setExistingCustomer(false);
        setFormData(prev => ({ ...prev, customerId: null }));
        setPreFilledFields(new Set());
      }
    } catch (error: any) {
      console.error('Mobile check error:', error);
      
      // Check if it's a 404 (new customer)
      if (error.status === 404) {
        setMobileCheckStatus('new');
        setMobileCheckMessage('ℹ️ New customer - please complete the form');
        setExistingCustomer(false);
        setFormData(prev => ({ ...prev, customerId: null }));
        setPreFilledFields(new Set());
      } else if (error.status === 400) {
        // Already registered
        setMobileCheckStatus('registered');
        setMobileCheckMessage('This mobile number is already registered. Please login.');
        setExistingCustomer(false);
      } else {
        // Network or other error
        setMobileCheckStatus('error');
        setMobileCheckMessage('Error checking mobile number. You can continue registration.');
      }
    }
  };

  const validateStep1 = () => {
    if (!formData.username.trim()) {
      Alert.alert('Error', 'Username is required');
      return false;
    }
    if (formData.username.length < 4) {
      Alert.alert('Error', 'Username must be at least 4 characters');
      return false;
    }
    if (!formData.password) {
      Alert.alert('Error', 'Password is required');
      return false;
    }
    if (formData.password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    if (!formData.contactNumber.trim()) {
      Alert.alert('Error', 'Contact number is required');
      return false;
    }
    if (!isValidMobileNumber(formData.contactNumber)) {
      Alert.alert('Error', 'Contact number must be exactly 10 digits');
      return false;
    }
    if (mobileCheckStatus === 'registered') {
      Alert.alert('Error', 'This mobile number is already registered. Please login.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.storageType.trim()) {
      Alert.alert('Error', 'Storage type is required');
      return false;
    }
    if (!formData.tankerCapacity || parseInt(formData.tankerCapacity) <= 0) {
      Alert.alert('Error', 'Valid tanker capacity is required');
      return false;
    }
    if (!formData.vehicleNumber.trim()) {
      Alert.alert('Error', 'Vehicle number is required');
      return false;
    }
    if (!isValidVehicleNumber(formData.vehicleNumber)) {
      Alert.alert('Error', 'Invalid vehicle number format. Expected format: MH-12-AB-1234');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.firstName.trim()) {
      Alert.alert('Error', 'First name is required');
      return false;
    }
    if (!formData.lastName.trim()) {
      Alert.alert('Error', 'Last name is required');
      return false;
    }
    if (!formData.address.trim()) {
      Alert.alert('Error', 'Address is required');
      return false;
    }
    if (!formData.location.trim()) {
      Alert.alert('Error', 'Location is required');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;
    
    setLoading(true);
    try {
      const result = await apiService.registerCustomer({
        customerId: formData.customerId,
        username: formData.username,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        storageType: formData.storageType,
        tankerCapacity: parseInt(formData.tankerCapacity),
        vehicleNumber: stripVehicleNumberFormatting(formData.vehicleNumber),
        address: formData.address,
        contactNumber: formData.contactNumber,
        location: formData.location,
      });

      if (result.success) {
        Alert.alert(
          'Registration Successful',
          result.message || 'Registration submitted successfully. Please wait for admin approval.',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      } else {
        Alert.alert('Registration Failed', result.message);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Handle specific error messages
      if (error.message) {
        Alert.alert('Registration Failed', error.message);
      } else {
        handleCustomerRegistrationError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleNumberChange = (text: string) => {
    const formatted = formatVehicleNumber(text);
    updateFormData('vehicleNumber', formatted);
  };

  const getPasswordStrength = () => {
    const password = formData.password;
    if (!password) return { text: '', color: '' };
    
    if (password.length >= 8) {
      return { text: 'Good', color: '#4CAF50' };
    } else {
      return { text: 'Too short (min 8)', color: '#F44336' };
    }
  };

  const renderMobileCheckFeedback = () => {
    if (mobileCheckStatus === 'idle' || !formData.contactNumber) return null;

    let iconColor = '#666';
    let backgroundColor = '#f0f0f0';
    
    switch (mobileCheckStatus) {
      case 'checking':
        return (
          <View style={[styles.feedbackContainer, { backgroundColor: '#E3F2FD' }]}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={[styles.feedbackText, { color: '#2196F3' }]}>{mobileCheckMessage}</Text>
          </View>
        );
      case 'found':
        return (
          <View style={[styles.feedbackContainer, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.feedbackText, { color: '#4CAF50' }]}>{mobileCheckMessage}</Text>
          </View>
        );
      case 'new':
        return (
          <View style={[styles.feedbackContainer, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.feedbackText, { color: '#2196F3' }]}>{mobileCheckMessage}</Text>
          </View>
        );
      case 'registered':
        return (
          <View style={[styles.feedbackContainer, { backgroundColor: '#FFEBEE' }]}>
            <Text style={[styles.feedbackText, { color: '#F44336' }]}>{mobileCheckMessage}</Text>
            <TouchableOpacity 
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        );
      case 'error':
        return (
          <View style={[styles.feedbackContainer, { backgroundColor: '#FFF3E0' }]}>
            <Text style={[styles.feedbackText, { color: '#FF9800' }]}>{mobileCheckMessage}</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Account Setup</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={formData.username}
        onChangeText={(text) => updateFormData('username', text)}
        autoCapitalize="none"
        editable={mobileCheckStatus !== 'registered'}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={formData.password}
        onChangeText={(text) => updateFormData('password', text)}
        secureTextEntry
        editable={mobileCheckStatus !== 'registered'}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={formData.confirmPassword}
        onChangeText={(text) => updateFormData('confirmPassword', text)}
        secureTextEntry
        editable={mobileCheckStatus !== 'registered'}
      />
      
      {formData.password && (
        <Text style={[
          styles.passwordStrength,
          { color: getPasswordStrength().color }
        ]}>
          Password strength: {getPasswordStrength().text}
        </Text>
      )}
      
      <TextInput
        style={styles.input}
        placeholder="Mobile Number (10 digits)"
        value={formData.contactNumber}
        onChangeText={(text) => updateFormData('contactNumber', text.replace(/[^0-9]/g, ''))}
        onBlur={handleMobileCheck}
        keyboardType="phone-pad"
        maxLength={10}
        editable={mobileCheckStatus !== 'registered'}
      />
      
      {renderMobileCheckFeedback()}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Vehicle Information</Text>
      
      {existingCustomer && (
        <View style={styles.preFilledNotice}>
          <Text style={styles.preFilledNoticeText}>
            📋 Some fields are pre-filled. You can edit them if needed.
          </Text>
        </View>
      )}
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('storageType') && styles.preFilledInput
        ]}
        placeholder="Storage Type (e.g., Tanker, Container)"
        value={formData.storageType}
        onChangeText={(text) => updateFormData('storageType', text)}
      />
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('tankerCapacity') && styles.preFilledInput
        ]}
        placeholder="Tanker Capacity (Liters)"
        value={formData.tankerCapacity}
        onChangeText={(text) => updateFormData('tankerCapacity', text)}
        keyboardType="numeric"
      />
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('vehicleNumber') && styles.preFilledInput
        ]}
        placeholder="Vehicle Number (e.g., MH-12-AB-1234)"
        value={formData.vehicleNumber}
        onChangeText={handleVehicleNumberChange}
        autoCapitalize="characters"
        maxLength={13}
      />
      
      {formData.vehicleNumber && !isValidVehicleNumber(formData.vehicleNumber) && (
        <Text style={styles.validationHint}>
          Format: XX-##-X-#### or XX-##-XX-#### (e.g., MH-12-AB-1234)
        </Text>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Contact Information</Text>
      
      {existingCustomer && (
        <View style={styles.preFilledNotice}>
          <Text style={styles.preFilledNoticeText}>
            📋 Some fields are pre-filled. You can edit them if needed.
          </Text>
        </View>
      )}
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('firstName') && styles.preFilledInput
        ]}
        placeholder="First Name"
        value={formData.firstName}
        onChangeText={(text) => updateFormData('firstName', text)}
      />
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('lastName') && styles.preFilledInput
        ]}
        placeholder="Last Name"
        value={formData.lastName}
        onChangeText={(text) => updateFormData('lastName', text)}
      />
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('address') && styles.preFilledInput
        ]}
        placeholder="Address"
        value={formData.address}
        onChangeText={(text) => updateFormData('address', text)}
        multiline
        numberOfLines={3}
      />
      
      <TextInput
        style={[
          styles.input,
          preFilledFields.has('location') && styles.preFilledInput
        ]}
        placeholder="Location/City"
        value={formData.location}
        onChangeText={(text) => updateFormData('location', text)}
      />
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return renderStep1();
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>Step {step} of 3</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
          </View>
        </View>

        {renderCurrentStep()}

        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          
          {step < 3 ? (
            <TouchableOpacity 
              style={[
                styles.nextButton,
                mobileCheckStatus === 'registered' && styles.disabledButton
              ]} 
              onPress={handleNext}
              disabled={mobileCheckStatus === 'registered'}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.submitButton, loading && styles.disabledButton]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Registering...' : 'Register'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
  },
  progressContainer: {
    marginBottom: 30,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  preFilledInput: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  preFilledNotice: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  preFilledNoticeText: {
    color: '#4CAF50',
    fontSize: 14,
    textAlign: 'center',
  },
  feedbackContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedbackText: {
    fontSize: 14,
    flex: 1,
  },
  loginButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  passwordStrength: {
    fontSize: 12,
    marginTop: -10,
    marginBottom: 15,
    textAlign: 'right',
  },
  validationHint: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: -10,
    marginBottom: 15,
    textAlign: 'right',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    padding: 15,
    borderRadius: 8,
    marginRight: 10,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginLeft: 10,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
});

export default CustomerRegistrationScreen;
