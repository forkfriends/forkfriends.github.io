import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import './global.css';

import HomeScreen from './components/Home/HomeScreen';
import MakeQueueScreen from './components/Make/MakeQueueScreen';
import JoinQueueScreen from './components/Join/JoinQueueScreen';
import HostQueueScreen from './components/Host/HostQueueScreen';
import GuestQueueScreen from './components/Guest/GuestQueueScreen';
import PrivacyPolicyScreen from './components/PrivacyPolicy/PrivacyPolicyScreen';
import AdminDashboardScreen from './components/Admin/AdminDashboardScreen';
import HostDashboardScreen from './components/HostDashboard/HostDashboardScreen';
import LoginScreen from './components/Login/LoginScreen';
import type { RootStackParamList } from './types/navigation';
import { ModalProvider } from './contexts/ModalContext';
import { AuthProvider } from './contexts/AuthContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Linking configuration for deep links and web URLs (web only)
const linking =
  Platform.OS === 'web'
    ? {
        prefixes: ['queueup://', 'https://queueup.app', 'http://localhost:8081'],
        config: {
          screens: {
            HomeScreen: '',
            LoginScreen: 'login',
            MakeQueueScreen: 'make',
            JoinQueueScreen: 'join/:code?',
            GuestQueueScreen: {
              path: 'queue/:code',
              parse: {
                code: (code: string) => code,
              },
              stringify: {
                code: (code: string) => code,
                partyId: () => undefined as unknown as string,
                sessionId: () => undefined as unknown as string,
                initialPosition: () => undefined as unknown as string,
                initialAheadCount: () => undefined as unknown as string,
                initialQueueLength: () => undefined as unknown as string,
                initialEtaMs: () => undefined as unknown as string,
                guestName: () => undefined as unknown as string,
                partySize: () => undefined as unknown as string,
              },
            },
            HostQueueScreen: {
              path: 'host/:code',
              parse: {
                code: (code: string) => code,
              },
              stringify: {
                code: (code: string) => code,
                sessionId: () => undefined as unknown as string,
                wsUrl: () => undefined as unknown as string,
                hostAuthToken: () => undefined as unknown as string,
                joinUrl: () => undefined as unknown as string,
                eventName: () => undefined as unknown as string,
                maxGuests: () => undefined as unknown as string,
                location: () => undefined as unknown as string,
                contactInfo: () => undefined as unknown as string,
                openTime: () => undefined as unknown as string,
                closeTime: () => undefined as unknown as string,
                requiresAuth: () => undefined as unknown as string,
              },
            },
            PrivacyPolicyScreen: 'privacy',
            AdminDashboardScreen: 'admin',
            HostDashboardScreen: 'my-queues',
          },
        },
      }
    : undefined;

function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="HomeScreen" screenOptions={{ headerTitle: '' }}>
        <Stack.Screen name="HomeScreen" component={HomeScreen} />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="MakeQueueScreen" component={MakeQueueScreen} />
        <Stack.Screen name="JoinQueueScreen" component={JoinQueueScreen} />
        <Stack.Screen name="GuestQueueScreen" component={GuestQueueScreen} />
        <Stack.Screen name="HostQueueScreen" component={HostQueueScreen} />
        <Stack.Screen name="PrivacyPolicyScreen" component={PrivacyPolicyScreen} />
        <Stack.Screen name="AdminDashboardScreen" component={AdminDashboardScreen} />
        <Stack.Screen name="HostDashboardScreen" component={HostDashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ModalProvider>
        <AppNavigator />
      </ModalProvider>
    </AuthProvider>
  );
}
