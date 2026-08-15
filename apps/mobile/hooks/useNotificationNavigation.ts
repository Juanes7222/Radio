import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState, type Href } from 'expo-router';

type NotificationData = Record<string, string> | undefined;

function resolveTargetRoute(data: NotificationData): Href {
  if (data?.isLiveNotify) {
    return '/';
  }

  if (data?.isProgramNotify) {
    return '/';
  }

  if (data?.type === 'program_start') {
    const programTitle = data?.programTitle;
    if (programTitle) {
      return { pathname: '/schedule', params: { programTitle } };
    }
    return '/schedule';
  }

  if (data?.alarmId) {
    return '/?autoplay=1';
  }

  if (data?.type === 'prayer_response' && data?.prayerId) {
    return { pathname: '/prayer/[id]', params: { id: data.prayerId } };
  }

  return '/';
}

/**
 * Opens the screen related to the notification the user tapped.
 * Handles both cold starts (app launched from a notification) and taps
 * while the app is already running in foreground or background.
 */
export function useNotificationNavigation(): void {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isRouterReady = rootNavigationState?.key != null;
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!isRouterReady) {
      return;
    }
    if (!lastNotificationResponse) {
      return;
    }

    const data = lastNotificationResponse.notification.request.content.data as NotificationData;
    router.replace(resolveTargetRoute(data));
  }, [isRouterReady, lastNotificationResponse, router]);
}
