import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';
import { Colors } from '@/constants/theme';
import { getDeviceId } from '@/lib/device';

import { TAB_BAR_HEIGHT } from '../../lib/responsive';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROSE = '#f43f5e';
const ACCENT_TINT = 'rgba(99,102,241,0.12)';
const NAME_MAX_LENGTH = 50;
const REQUEST_MAX_LENGTH = 500;

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isSmallScreen = useMemo(() => SCREEN_HEIGHT < 700, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedRequest = request.trim();

    if (!trimmedName || !trimmedRequest) {
      Alert.alert('Campos incompletos', 'Por favor ingresa tu nombre y la petición.');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(`${BACKEND_URL}/api/prayer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, request: trimmedRequest, deviceId }),
      });

      if (res.ok) {
        setSent(true);
        setName('');
        setRequest('');
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Error', data.error || 'No se pudo enviar la petición.');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, [name, request]);

  const handleReset = () => {
    setSent(false);
    setName('');
    setRequest('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[Colors.backgroundAlt, Colors.gradientDeep, Colors.backgroundAlt]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(insets.top, 12) + (isSmallScreen ? 8 : 16),
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + (isSmallScreen ? 8 : 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Ionicons name="heart" size={isSmallScreen ? 24 : 32} color={ROSE} />
          <Text style={[styles.heading, isSmallScreen && styles.headingSmall]}>
            Petición de oración
          </Text>
          <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
            Comparte tu petición y nuestro equipo intercederá por ti.
          </Text>
        </View>

        {!sent && !loading && (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push('/prayer-history')} style={styles.historyLink} activeOpacity={0.8}>
              <Ionicons name="list-outline" size={14} color={Colors.accent} />
              <Text style={styles.historyLinkText}>Mis peticiones</Text>
            </TouchableOpacity>
          </View>
        )}
        {sent ? (
          <View style={[styles.successCard, isSmallScreen && styles.successCardSmall]}>
            <Ionicons name="checkmark-circle" size={isSmallScreen ? 36 : 48} color={Colors.success} />
            <Text style={[styles.successTitle, isSmallScreen && styles.successTitleSmall]}>
              Petición enviada
            </Text>
            <Text style={[styles.successText, isSmallScreen && styles.successTextSmall]}>
              Tu petición ha sido recibida. Oraremos por ti.
            </Text>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn} activeOpacity={0.8}>
              <Text style={styles.resetBtnText}>Enviar otra petición</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/prayer-history')} style={styles.viewHistoryBtn} activeOpacity={0.8}>
              <Ionicons name="list-outline" size={14} color={Colors.accent} />
              <Text style={styles.viewHistoryBtnText}>Ver mis peticiones</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>Nombre</Text>
              <TextInput
                style={[styles.input, isSmallScreen && styles.inputSmall]}
                placeholder="Tu nombre"
                placeholderTextColor={Colors.textAltFaint}
                value={name}
                onChangeText={setName}
                maxLength={NAME_MAX_LENGTH}
                editable={!loading}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>Petición</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textarea,
                  isSmallScreen && styles.textareaSmall,
                ]}
                placeholder="Escribe tu petición de oración..."
                placeholderTextColor={Colors.textAltFaint}
                value={request}
                onChangeText={setRequest}
                multiline
                numberOfLines={isSmallScreen ? 3 : 4}
                textAlignVertical="top"
                maxLength={REQUEST_MAX_LENGTH}
                editable={!loading}
              />
              <Text style={styles.charCounter}>
                {request.length}/{REQUEST_MAX_LENGTH}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitBtn, loading && styles.submitBtnDisabled, isSmallScreen && styles.submitBtnSmall]}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.textBright} />
              ) : (
                <>
                  <Ionicons name="send" size={isSmallScreen ? 14 : 16} color={Colors.textBright} />
                  <Text style={[styles.submitBtnText, isSmallScreen && styles.submitBtnTextSmall]}>
                    Enviar petición
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundAlt },
  scroll: { paddingHorizontal: 20, gap: 20, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 10, marginBottom: 8 },
  heading: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headingSmall: { fontSize: 18 },
  subtitle: {
    color: Colors.textAltFaint,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  subtitleSmall: { fontSize: 12 },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { color: Colors.textAlt, fontSize: 13, fontWeight: '600' },
  labelSmall: { fontSize: 12 },
  input: {
    backgroundColor: Colors.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textSoft,
    fontSize: 14,
  },
  inputSmall: {
    paddingVertical: 10,
    fontSize: 13,
  },
  charCounter: {
    color: Colors.textAltFaint,
    fontSize: 11,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
  },
  textareaSmall: {
    minHeight: 72,
    paddingTop: 10,
  },
  submitBtn: {
    backgroundColor: ROSE,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnSmall: {
    paddingVertical: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: Colors.textBright, fontSize: 14, fontWeight: '700' },
  submitBtnTextSmall: { fontSize: 13 },
  successCard: {
    backgroundColor: Colors.surfaceDim,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceSoft,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  successCardSmall: {
    padding: 16,
    gap: 8,
  },
  successTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  successTitleSmall: { fontSize: 16 },
  successText: { color: Colors.textAlt, fontSize: 14, textAlign: 'center' },
  successTextSmall: { fontSize: 12 },
  headerActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  historyLinkText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },
  resetBtn: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resetBtnText: { color: Colors.textSoft, fontSize: 13, fontWeight: '600' },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_TINT,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewHistoryBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
});
