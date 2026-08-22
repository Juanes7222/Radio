import { useEffect, useRef } from 'react';
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
  // Wait until the initial route (tabs) is actually mounted. If we navigate
  // while the stack is still empty, the notification screen becomes the root
  // and pressing back exits the app instead of returning home.
  const isRouterReady =
    rootNavigationState?.key != null &&
    (rootNavigationState.routes?.length ?? 0) > 0;
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const handledIdentifierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRouterReady) {
      return;
    }
    if (!lastNotificationResponse) {
      return;
    }

    // Handle each tap exactly once: the response object stays set and the
    // effect can re-run, which would otherwise re-trigger navigation.
    const identifier = lastNotificationResponse.notification.request.identifier;
    if (handledIdentifierRef.current === identifier) {
      return;
    }
    handledIdentifierRef.current = identifier;

    const data = lastNotificationResponse.notification.request.content.data as NotificationData;
    router.push(resolveTargetRoute(data));
  }, [isRouterReady, lastNotificationResponse, router]);
}
