// API Types
export type PumpStatus = 'ON' | 'OFF';
export type WaterLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PumpStateResponse {
  status: PumpStatus;
}

export interface MotorStatusResponse {
  pump_inside: PumpStateResponse;
  pump_outside: PumpStateResponse;
  water_level: WaterLevel;
  timestamp: number;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  customerId?: string;
}

export interface TripAmountResponse {
  amount: number;
  currency: string;
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  PumpControl: undefined;
};

// Component Props Types
export interface PumpControlProps {
  navigation: any;
}

export interface LoginProps {
  navigation: any;
}

export interface DashboardProps {
  navigation: any;
}
