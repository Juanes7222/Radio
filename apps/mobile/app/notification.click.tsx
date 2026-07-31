import { useEffect } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

export default function NotificationClickScreen() {
  const router = useRouter();

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      const data = response?.notification.request.content.data as Record<string, string> | undefined;

      if (data?.isLiveNotify) {
        router.replace('/');
        return;
      }

      if (data?.isProgramNotify) {
        router.replace('/');
        return;
      }

      if (data?.type === 'prayer_response' && data?.prayerId) {
        router.replace(`/prayer/${data.prayerId}`);
        return;
      }

      router.replace('/');
    });
  }, []);

  return <Redirect href="/" />;
}
