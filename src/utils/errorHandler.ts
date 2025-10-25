import { Alert } from 'react-native';

export interface ApiError extends Error {
  status?: number;
}

export interface ErrorMessage {
  title: string;
  message: string;
}

export enum ErrorContext {
  LOGIN = 'login',
  MOTOR_STATUS = 'motor_status',
  PUMP_CONTROL = 'pump_control',
  CUSTOMER_REGISTRATION = 'customer_registration',
  CUSTOMER_APPROVAL = 'customer_approval',
  GENERAL = 'general'
}

/**
 * Maps HTTP status codes to appropriate error messages based on context
 */
const getErrorMessageByContext = (status: number, context: ErrorContext): ErrorMessage => {
  switch (context) {
    case ErrorContext.LOGIN:
      switch (status) {
        case 401:
          return {
            title: 'Authentication Failed',
            message: 'Invalid username or password. Please try again.'
          };
        case 403:
          return {
            title: 'Access Denied',
            message: 'Your account has been suspended or access is restricted.'
          };
        case 404:
          return {
            title: 'Service Not Found',
            message: 'The authentication service is not available. Please try again later.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'There was a problem with the server. Please try again later.'
          };
        default:
          return {
            title: 'Server Error',
            message: `Server returned error ${status}. Please try again later.`
          };
      }

    case ErrorContext.MOTOR_STATUS:
      switch (status) {
        case 401:
          return {
            title: 'Session Expired',
            message: 'Your session has expired. Please login again.'
          };
        case 403:
          return {
            title: 'Access Denied',
            message: 'You may not have permission to view motor status.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'Unable to fetch motor status. Please try again later.'
          };
        default:
          return {
            title: 'Error',
            message: 'Failed to fetch motor status. Please check your connection.'
          };
      }

    case ErrorContext.PUMP_CONTROL:
      switch (status) {
        case 401:
          return {
            title: 'Session Expired',
            message: 'Your session has expired. Please login again.'
          };
        case 403:
          return {
            title: 'Access Denied',
            message: 'You may not have permission to control pumps.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'Unable to control pump. Please try again later.'
          };
        default:
          return {
            title: 'Error',
            message: 'Failed to control pump. Please check your connection.'
          };
      }

    case ErrorContext.CUSTOMER_REGISTRATION:
      switch (status) {
        case 400:
          return {
            title: 'Invalid Data',
            message: 'Please check your registration details and try again.'
          };
        case 409:
          return {
            title: 'Account Exists',
            message: 'An account with this username already exists.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'Unable to register account. Please try again later.'
          };
        default:
          return {
            title: 'Registration Failed',
            message: 'Failed to register account. Please check your connection.'
          };
      }

    case ErrorContext.CUSTOMER_APPROVAL:
      switch (status) {
        case 401:
          return {
            title: 'Session Expired',
            message: 'Your session has expired. Please login again.'
          };
        case 403:
          return {
            title: 'Access Denied',
            message: 'You may not have permission to approve customers.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'Unable to process approval. Please try again later.'
          };
        default:
          return {
            title: 'Error',
            message: 'Failed to process approval. Please check your connection.'
          };
      }

    default:
      switch (status) {
        case 401:
          return {
            title: 'Authentication Required',
            message: 'Please login to continue.'
          };
        case 403:
          return {
            title: 'Access Denied',
            message: 'You do not have permission to perform this action.'
          };
        case 404:
          return {
            title: 'Not Found',
            message: 'The requested resource was not found.'
          };
        case 500:
          return {
            title: 'Server Error',
            message: 'There was a problem with the server. Please try again later.'
          };
        default:
          return {
            title: 'Error',
            message: 'An unexpected error occurred. Please try again.'
          };
      }
  }
};

/**
 * Handles API errors and shows appropriate user-friendly messages
 * @param error - The error object (should have status property for HTTP errors)
 * @param context - The context where the error occurred
 * @param showAlert - Whether to show an alert dialog (default: true)
 * @returns The error message object
 */
export const handleApiError = (
  error: unknown,
  context: ErrorContext,
  showAlert: boolean = true
): ErrorMessage => {
  let errorMessage: ErrorMessage;

  if (error instanceof Error) {
    const apiError = error as ApiError;
    const status = apiError.status;

    if (status) {
      // HTTP error with status code
      errorMessage = getErrorMessageByContext(status, context);
    } else {
      // Network or other errors
      errorMessage = {
        title: 'Connection Error',
        message: `Unable to connect to server. Please check your internet connection.\n\nTechnical details: ${error.message}`
      };
    }
  } else {
    // Unknown error type
    errorMessage = {
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.'
    };
  }

  if (showAlert) {
    Alert.alert(errorMessage.title, errorMessage.message);
  }

  return errorMessage;
};

/**
 * Convenience function for login errors
 */
export const handleLoginError = (error: unknown, showAlert: boolean = true): ErrorMessage => {
  return handleApiError(error, ErrorContext.LOGIN, showAlert);
};

/**
 * Convenience function for motor status errors
 */
export const handleMotorStatusError = (error: unknown, showAlert: boolean = true): ErrorMessage => {
  return handleApiError(error, ErrorContext.MOTOR_STATUS, showAlert);
};

/**
 * Convenience function for pump control errors
 */
export const handlePumpControlError = (error: unknown, showAlert: boolean = true): ErrorMessage => {
  return handleApiError(error, ErrorContext.PUMP_CONTROL, showAlert);
};

/**
 * Convenience function for customer registration errors
 */
export const handleCustomerRegistrationError = (error: unknown, showAlert: boolean = true): ErrorMessage => {
  return handleApiError(error, ErrorContext.CUSTOMER_REGISTRATION, showAlert);
};

/**
 * Convenience function for customer approval errors
 */
export const handleCustomerApprovalError = (error: unknown, showAlert: boolean = true): ErrorMessage => {
  return handleApiError(error, ErrorContext.CUSTOMER_APPROVAL, showAlert);
};
