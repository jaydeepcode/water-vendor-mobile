// API Configuration
export const API_CONFIG = {
  LOCAL_BASE_URL: 'http://192.168.1.39:8080/api',
  PRODUCTION_BASE_URL: 'https://api.yourdomain.com/api',
};

// Get the appropriate base URL based on environment
export const getApiBaseUrl = (): string => {
  // Use __DEV__ flag to determine environment
  if (__DEV__) {
    // Development environment
    return API_CONFIG.LOCAL_BASE_URL;
  } else {
    // Production environment
    return API_CONFIG.PRODUCTION_BASE_URL;
  }
};
