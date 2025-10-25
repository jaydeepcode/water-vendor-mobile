import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';
import {
  MotorStatusResponse,
  AuthCredentials,
  AuthResponse,
  PumpStatus,
  PendingCustomer,
  ApprovedCustomer,
  WaterPurchaseTransactionDTO,
  ActiveTripStatus
} from '../types';

class ApiService {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = getApiBaseUrl();
  } 

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const apiKey = await AsyncStorage.getItem('apiKey');
      const fullUrl = `${this.baseUrl}${endpoint}`;
      
      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey && { 'X-API-Key': apiKey }),
        ...options.headers,
      };
      
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Create custom error with status code for better handling
        const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Helper method for requests that may return empty responses (204, 404)
   * Returns null for empty responses instead of attempting to parse JSON
   */
  private async requestWithEmptyResponse<T>(
    endpoint: string,
    options: RequestInit = {},
    emptyStatuses: number[] = [204, 404]
  ): Promise<T | null> {
    try {
      const apiKey = await AsyncStorage.getItem('apiKey');
      const fullUrl = `${this.baseUrl}${endpoint}`;
      
      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey && { 'X-API-Key': apiKey }),
        ...options.headers,
      };
      
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });
      
      // If status indicates empty response, return null
      if (emptyStatuses.includes(response.status)) {
        return null;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }
      
      // Check if response has content before parsing
      const text = await response.text();
      if (!text || text.trim() === '') {
        return null;
      }
      
      // Parse JSON response
      try {
        const data = JSON.parse(text);
        
        // Check if response is an empty object {}
        if (data && typeof data === 'object' && Object.keys(data).length === 0) {
          return null;
        }
        
        return data;
      } catch (parseError) {
        console.warn(`Failed to parse JSON for ${endpoint}, returning null`);
        return null;
      }
    } catch (error: any) {
      // Silently return null for these endpoints to avoid UI disruption
      return null;
    }
  }

  private async unauthenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const fullUrl = `${this.baseUrl}${endpoint}`;
      
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Create custom error with status code for better handling
        const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Unauthenticated API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Authentication
  async login(username: string, password: string): Promise<AuthResponse> {
    const deviceInfo = `${Platform.OS} ${Platform.Version}`;
    return this.unauthenticatedRequest<AuthResponse>('/authenticate', {
      method: 'POST',
      body: JSON.stringify({ username, password, deviceInfo }),
    });
  }

  // Motor Status
  async getMotorStatus(): Promise<MotorStatusResponse> {
    return this.request<MotorStatusResponse>('/motor/status');
  }

  // Pump Control
  // Note: 'both' is handled at the utility layer (pumpOperations.ts)
  // This method only handles individual pumps
  async startPump(pump: 'inside' | 'outside', action: 'start'): Promise<any> {
    return this.request(`/motor/pump/${pump}/${action}`, {
      method: 'POST',
    });
  }

  async stopPump(pump: 'inside' | 'outside', action: 'stop'): Promise<any> {
    return this.request(`/motor/pump/${pump}/${action}`, {
      method: 'POST',
    });
  }

  // Trip Amount
  async getTripAmount(customerId: string): Promise<number> {
    return this.request(`/party/trip-amount/${customerId}`);
  }

  // Customer Registration
  async registerCustomer(data: {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    storageType: string;
    tankerCapacity: number;
    vehicleNumber: string;
    address: string;
    contactNumber: string;
    location: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.unauthenticatedRequest('/customer/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Admin Customer Management
  async getPendingCustomers(): Promise<PendingCustomer[]> {
    return this.request('/admin/customers/pending', {
      method: 'GET',
    });
  }

  async getApprovedCustomers(): Promise<ApprovedCustomer[]> {
    return this.request('/admin/customers', {
      method: 'GET',
    });
  }

  async approveCustomer(customerId: number, adminId: number): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/customers/${customerId}/approve?adminId=${adminId}`, {
      method: 'POST',
    });
  }

  async rejectCustomer(customerId: number, adminId: number): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/customers/${customerId}/reject?adminId=${adminId}`, {
      method: 'POST',
    });
  }

  // Record Water Purchase Transaction
  async recordTrip(customerId: string, tripAmount: number, pumpUsed: string): Promise<WaterPurchaseTransactionDTO> {
    const queryParams = new URLSearchParams({
      customerId: customerId,
      tripAmount: tripAmount.toString(),
      pumpUsed: pumpUsed
    });
    
    return this.request<WaterPurchaseTransactionDTO>(`/party/record-trip?${queryParams.toString()}`, {
      method: 'POST',
    });
  }

  // Update Trip Stop Time
  async updateTripTime(customerId: string, tripId: number): Promise<any> {
    return this.request(
      `/party/update-trip-time?customerId=${customerId}&tripId=${tripId}`,
      { method: 'PUT' }
    );
  }

  // Check Filling Status - returns customer ID if any filling is in progress
  async checkFillingStatus(): Promise<number | null> {
    return this.requestWithEmptyResponse<number>(
      '/party/check-filling-status',
      { method: 'GET' },
      [204] // Return null for 204 No Content
    );
  }

  // Get In-Progress Trip for a specific customer
  async getInProgressTrip(customerId: number): Promise<ActiveTripStatus | null> {
    return this.requestWithEmptyResponse<ActiveTripStatus>(
      `/party/in-progress-trip/${customerId}`,
      { method: 'GET' },
      [204, 404] // Return null for 204 No Content or 404 Not Found
    );
  }
}

export const apiService = new ApiService();
