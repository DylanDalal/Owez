import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { theme } from '@/ui/theme';

export default function Splash() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!profile) router.replace('/onboarding');
    else router.replace('/dashboard');
  }, [user, profile, loading, router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
      }}
    >
      <Text style={{ color: theme.fg, fontSize: 28, fontWeight: '800' }}>
        Owez
      </Text>
      <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
    </View>
  );
}
