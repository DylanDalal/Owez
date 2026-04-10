import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0B0D0C' },
          headerTintColor: '#F4F5F3',
          contentStyle: { backgroundColor: '#0B0D0C' },
        }}
      />
    </AuthProvider>
  );
}
