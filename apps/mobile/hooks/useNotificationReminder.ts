// hooks/useNotificationReminder.ts
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LAUNCH_COUNT_KEY = 'radio-app-launch-count';
const PROMPT_FREQUENCY = 4;

/**
 * Tracks application launches and triggers a reminder state based on a defined frequency.
 */
export function useNotificationReminder() {
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    async function evaluateReminderLogic() {
      try {
        const storedCount = await AsyncStorage.getItem(APP_LAUNCH_COUNT_KEY);
        const currentCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;

        await AsyncStorage.setItem(APP_LAUNCH_COUNT_KEY, currentCount.toString());

        if (currentCount > 1 && currentCount % PROMPT_FREQUENCY === 0) {
          setShowReminder(true);
        }
      } catch (error) {
        // Continue silently if storage access fails
      }
    }

    evaluateReminderLogic();
  }, []);

  const dismissReminder = () => setShowReminder(false);

  return { showReminder, dismissReminder };
}