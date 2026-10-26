import { router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStateProvider, useAppState } from '../state/AppState';
import { CommunityProvider } from '../state/Community';
import { ProProvider } from '../state/Pro';
import { colors } from '../ui/theme';

function FirstRunGate() {
  const { ready, settings } = useAppState();
  useEffect(() => {
    if (ready && !settings.onboarded) router.push('/onboarding');
  }, [ready, settings.onboarded]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ProProvider>
          <CommunityProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerTintColor: colors.primary,
                headerTitleStyle: { color: colors.text },
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="spot/[id]" options={{ title: 'Parking details', headerBackTitle: 'Back' }} />
              <Stack.Screen name="report/[id]" options={{ title: 'Report what you saw', presentation: 'modal' }} />
              <Stack.Screen name="upgrade" options={{ title: 'Go Pro', presentation: 'modal' }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
            </Stack>
            <FirstRunGate />
          </CommunityProvider>
        </ProProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
