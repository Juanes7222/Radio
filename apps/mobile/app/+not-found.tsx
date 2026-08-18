import { Redirect } from 'expo-router';

// Catch-all for unmatched deep links. Tapping the media notification launches
// the activity with a "trackplayer://notification.click" data URI that no app
// route matches; route it back to the player instead of showing "not found".
export default function NotFoundScreen() {
  return <Redirect href="/" />;
}