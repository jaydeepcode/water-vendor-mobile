import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {StatusBar, StyleSheet} from 'react-native';

// Import screens
import LoginScreen from './src/screens/LoginScreen';
import CustomerRegistrationScreen from './src/screens/CustomerRegistrationScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PumpControlScreen from './src/screens/PumpControlScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import CustomerListScreen from './src/screens/CustomerListScreen';
import AdminPumpControlScreen from './src/screens/AdminPumpControlScreen';

// Import types
import {RootStackParamList} from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#007AFF" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{title: 'ShopLocal'}}
        />
        <Stack.Screen
          name="CustomerRegistration"
          component={CustomerRegistrationScreen}
          options={{
            title: 'Register',
            headerStyle: { backgroundColor: '#007AFF' },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: 'Dashboard',
            headerLeft: () => null, // Prevent going back to login
          }}
        />
        <Stack.Screen
          name="PumpControl"
          component={PumpControlScreen}
          options={{title: 'Pump Control'}}
        />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{
            title: 'Admin Dashboard',
            headerLeft: () => null, // Prevent going back to login
          }}
        />
        <Stack.Screen
          name="CustomerList"
          component={CustomerListScreen}
          options={{title: 'Select Customer'}}
        />
        <Stack.Screen
          name="AdminPumpControl"
          component={AdminPumpControlScreen}
          options={{title: 'Admin Pump Control'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});

export default App;
