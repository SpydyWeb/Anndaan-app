import { Eczar_600SemiBold, Eczar_700Bold } from '@expo-google-fonts/eczar';
import { Mukta_400Regular, Mukta_500Medium, Mukta_600SemiBold, Mukta_700Bold } from '@expo-google-fonts/mukta';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { listenForNotifications, registerForPush } from '@/lib/push';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
          },
        },
      }),
  );
  const [fonts] = useFonts({ Eczar_600SemiBold, Eczar_700Bold, Mukta_400Regular, Mukta_500Medium, Mukta_600SemiBold, Mukta_700Bold });
  const ready = useSession((s) => s.ready);
  const access = useSession((s) => s.access);
  const prefsReady = useSyncExternalStore(
    (cb) => usePrefs.persist.onFinishHydration(cb),
    () => usePrefs.persist.hasHydrated(),
  );

  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  useEffect(() => {
    if (fonts && ready && prefsReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [fonts, ready, prefsReady]);

  // Register for push once signed in; refresh data whenever a notification arrives.
  useEffect(() => {
    if (!access) return;
    void registerForPush();
    return listenForNotifications(() => client.invalidateQueries());
  }, [access, client]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && client.invalidateQueries({ queryKey: ['me'] }));
    return () => sub.remove();
  }, [client]);

  if (!fonts || !ready || !prefsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.rice }, animation: 'slide_from_right' }}>
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="home" options={{ animation: 'fade' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
