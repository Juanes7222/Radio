// hooks/useNotificationReminder.ts
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LAUNCH_COUNT_KEY = 'radio-app-launch-count';
const REMINDER_DISABLED_KEY = 'radio-app-reminder-disabled';
const PROMPT_FREQUENCY = 4;

/**
 * Tracks application launches and triggers a reminder state based on a defined frequency.
 * The reminder can be disabled permanently by the user.
 */
export function useNotificationReminder() {
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    async function evaluateReminderLogic() {
      try {
        const disabled = await AsyncStorage.getItem(REMINDER_DISABLED_KEY);
        if (disabled === 'true') return;

        const storedCount = await AsyncStorage.getItem(APP_LAUNCH_COUNT_KEY);
        const currentCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;

        await AsyncStorage.setItem(APP_LAUNCH_COUNT_KEY, currentCount.toString());

        if (currentCount > 1 && currentCount % PROMPT_FREQUENCY === 0) {
          setShowReminder(true);
        }
      } catch {
        // Continue silently if storage access fails
      }
    }

    evaluateReminderLogic();
  }, []);

  const dismissReminder = () => setShowReminder(false);

  const dismissReminderForever = () => {
    setShowReminder(false);
    AsyncStorage.setItem(REMINDER_DISABLED_KEY, 'true').catch(() => {
      // Continue silently if storage access fails
    });
  };

  return { showReminder, dismissReminder, dismissReminderForever };
}