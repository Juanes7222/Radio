import { Alert, Linking } from 'react-native';

/**
 * Single entry point for every link that leaves the app, so a failure is always
 * reported instead of a tap that silently does nothing.
 */
export function openExternalUrl(url: string): void {
  Linking.openURL(url).catch(() => {
    Alert.alert('No se pudo abrir el enlace', 'Revisa tu conexión a internet e inténtalo de nuevo.');
  });
}