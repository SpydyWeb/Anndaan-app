import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { registerPushToken } from '@/api/hooks';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Expo Go (Android, SDK 53+) throws as soon as expo-notifications is imported, so the
 * module is loaded lazily and only in development/production builds. In Expo Go the app
 * still works; it just has no push notifications (the in-app list still updates).
 */
export const pushSupported =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let mod: NotificationsModule | null = null;
function notifications(): NotificationsModule | null {
  if (!pushSupported) return null;
  if (!mod) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return mod;
}

/**
 * Ask for notification permission and register this device's Expo push token.
 * Needs a real device and an EAS project id (app.json > extra.eas.projectId).
 */
export async function registerForPush(): Promise<string | null> {
  const N = notifications();
  if (!N || !Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', { name: 'Anndaan', importance: N.AndroidImportance.HIGH });
  }
  let { status } = await N.getPermissionsAsync();
  if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    const token = (await N.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return token;
  } catch {
    return null;
  }
}

/** Listen for incoming and tapped notifications. Returns an unsubscribe function. */
export function listenForNotifications(onReceive: () => void): () => void {
  const N = notifications();
  if (!N) return () => undefined;
  const received = N.addNotificationReceivedListener(onReceive);
  const tapped = N.addNotificationResponseReceivedListener((r) =>
    routeForNotification(r.notification.request.content.data as Record<string, unknown>),
  );
  return () => {
    received.remove();
    tapped.remove();
  };
}

/** Where a tapped notification should take the user. */
export function routeForNotification(data: Record<string, unknown> | undefined) {
  if (!data) return;
  const kind = String(data.kind ?? '');
  const res = data.reservation_id as string | undefined;
  const listing = data.listing_id as string | undefined;
  if (kind === 'reservation_created' && res) return router.push({ pathname: '/my-food/[id]', params: { id: listing ?? '' } });
  if (kind === 'guard_confirm_request' && res) return router.push({ pathname: '/reservation/[id]', params: { id: res } });
  if (res) return router.push({ pathname: '/reservation/[id]', params: { id: res } });
  if (listing) return router.push({ pathname: '/my-food/[id]', params: { id: listing } });
  if (kind.startsWith('ngo_') || kind.startsWith('pledge_')) return router.push('/ngos/mine');
  router.push('/notifications');
}
