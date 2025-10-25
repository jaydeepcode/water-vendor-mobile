// API Types
export type PumpStatus = 'ON' | 'OFF';

export interface PumpStateResponse {
  status: PumpStatus;
}

export interface MotorStatusResponse {
  pump_inside: PumpStateResponse;
  pump_outside: PumpStateResponse;
  timestamp: number;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  userType?: 'admin' | 'customer';
  userId?: number;
  waterPartyId?: number | string;
  accountStatus?: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  tankerCapacity?: number;
}

export interface WaterPurchaseTransactionDTO {
  purchaseId: number;
  waterPurchaseParty: WaterPurchasePartyDTO;
  rcCreditReqList: RcCreditReqDTO[];
  customerName: string;
  balanceAmount: number;
}

export interface WaterPurchasePartyDTO {
  // Add fields as needed when they become relevant
}

export interface RcCreditReqDTO {
  // Add fields as needed when they become relevant
}

// Customer Interface
export interface Customer {
  id: string;
  name: string;
  location: string;
  contact: string;
  status: 'active' | 'inactive';
  pumpAvailable: boolean;
  lastUsed: string;
}

// Backend Customer Interfaces
export interface PendingCustomer {
  customerId: number;
  storageType: string;
  capacity: number;
  address: string;
  userId: number | null;
  registrationStatus: string;
  contactNumber: string;
  customerName: string;
}

export interface ApprovedCustomer extends PendingCustomer {
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  CustomerRegistration: undefined;
  Dashboard: undefined;
  PumpControl: undefined;
  AdminDashboard: undefined;
  CustomerList: undefined;
  AdminPumpControl: { customer: Customer };
};

// Filling Status Types
export interface FillingStatusResponse {
  customerId: number | null;
}

export interface ActiveTripStatus {
  tripId: number;
  customerId: number;
  customerName?: string;
  pumpUsed: string; // Backend returns "INSIDE", "OUTSIDE", "BOTH" - may vary in case
  tripStartTime?: string; // Backend returns 'tripStartTime'
  tripStatus?: 'FILLING' | 'COMPLETED'; // Backend returns 'tripStatus'
}

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
