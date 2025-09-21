import {
  MotorStatusResponse,
  AuthCredentials,
  AuthResponse,
  TripAmountResponse,
  PumpStatus
} from '../types';

const API_BASE_URL = 'https://api.connectsattva.in/api';
const LOCAL_API_BASE_URL = 'http://localhost:3000/api'; // For local development

class ApiService {
  private baseUrl: string;

  constructor() {
    // Use local API for development, remote for production
    this.baseUrl = __DEV__ ? LOCAL_API_BASE_URL : API_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Authentication
  async authenticate(credentials: AuthCredentials): Promise<AuthResponse> {
    return this.request<AuthResponse>('/authenticate', {
      method: 'POST',
      body: JSON.stringify({ credentials }),
    });
  }

  // Motor Status
  async getMotorStatus(): Promise<MotorStatusResponse> {
    return this.request<MotorStatusResponse>('/motor/status');
  }

  // Pump Control
  async startPump(pump: 'inside' | 'outside' | 'both', action: 'start'): Promise<any> {
    const pumpPath = pump === 'both' ? 'both' : pump;
    return this.request(`/motor/pump/${pumpPath}/${action}`, {
      method: 'POST',
    });
  }

  async stopPump(pump: 'inside' | 'outside' | 'both', action: 'stop'): Promise<any> {
    const pumpPath = pump === 'both' ? 'both' : pump;
    return this.request(`/motor/pump/${pumpPath}/${action}`, {
      method: 'POST',
    });
  }

  // Trip Amount
  async getTripAmount(customerId: string): Promise<TripAmountResponse> {
    return this.request<TripAmountResponse>(`/party/trip-amount/${customerId}`);
  }

  // Local API endpoints (for development)
  async authenticateLocal(credentials: AuthCredentials): Promise<AuthResponse> {
    // Mock authentication for development
    return new Promise((resolve) => {
      setTimeout(() => {
        if (credentials.username === 'admin' && credentials.password === 'password') {
          resolve({
            success: true,
            message: 'Login successful',
            customerId: 'CUST001',
          });
        } else {
          resolve({
            success: false,
            message: 'Invalid credentials',
          });
        }
      }, 1000);
    });
  }

  async getMotorStatusLocal(): Promise<MotorStatusResponse> {
    // Mock motor status for development
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          pump_inside: { status: Math.random() > 0.5 ? 'ON' : 'OFF' },
          pump_outside: { status: Math.random() > 0.5 ? 'ON' : 'OFF' },
          water_level: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)] as any,
          timestamp: Date.now(),
        });
      }, 500);
    });
  }

  async getTripAmountLocal(customerId: string): Promise<TripAmountResponse> {
    // Mock trip amount for development
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          amount: Math.floor(Math.random() * 1000) + 500,
          currency: 'INR',
        });
      }, 300);
    });
  }
}

export const apiService = new ApiService();
