import { useEffect } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

export default function NotificationClickScreen() {
  const router = useRouter();

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => {
      const data = response?.notification.request.content.data;

      if (data?.isLiveNotify) {
        // La app se abre en la pantalla principal, que ya muestra el reproductor de live
        router.replace('/');
        return;
      }

      if (data?.isProgramNotify) {
        // Notificación de programa programado
        router.replace('/');
        return;
      }

      // Fallback
      router.replace('/');
    });
  }, []);

  return <Redirect href="/" />;
}
