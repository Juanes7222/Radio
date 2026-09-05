import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import Animated, { FadeInDown, FadeIn, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BACKEND_URL, WEB_URL } from '@/constants/api';
import { Colors } from '@/constants/theme';
import { getDeviceId } from '@/lib/device';

import { TAB_BAR_BASE } from '../../lib/responsive';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ROSE = '#f43f5e';
const ACCENT_TINT = 'rgba(99,102,241,0.12)';
const NAME_MAX_LENGTH = 50;
const REQUEST_MAX_LENGTH = 500;
const DRAFT_KEY = 'prayer_draft_v1';

interface PrayerFieldErrors {
  name?: string;
  request?: string;
  consent?: string;
}

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [acceptsDataTreatment, setAcceptsDataTreatment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<PrayerFieldErrors>({});
  const nameRef = useRef<TextInput>(null);
  const requestRef = useRef<TextInput>(null);
  const draftLoadedRef = useRef(false);

  const isSmallScreen = useMemo(() => SCREEN_HEIGHT < 700, []);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const draft = JSON.parse(raw) as { name?: string; request?: string };
        if (typeof draft.name === 'string') setName(draft.name.slice(0, NAME_MAX_LENGTH));
        if (typeof draft.request === 'string') setRequest(draft.request.slice(0, REQUEST_MAX_LENGTH));
      })
      .catch(() => {})
      .finally(() => {
        draftLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current || sent) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ name, request })).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [name, request, sent]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedRequest = request.trim();
    const errors: PrayerFieldErrors = {};

    if (!trimmedName) {
      errors.name = 'Ingresa tu nombre para identificar tu petición.';
    }
    if (!trimmedRequest) {
      errors.request = 'Escribe tu petición antes de enviarla.';
    } else if (trimmedRequest.length < 10) {
      errors.request = 'Cuéntanos un poco más, mínimo 10 caracteres.';
    }
    if (!acceptsDataTreatment) {
      errors.consent = 'Acepta la Política de Tratamiento de Datos para continuar.';
    }
    setFieldErrors(errors);

    if (errors.name) {
      nameRef.current?.focus();
      return;
    }
    if (errors.request) {
      requestRef.current?.focus();
      return;
    }
    if (errors.consent) {
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
        setFieldErrors({});
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Error', data.error || 'No se pudo enviar la petición.');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, [name, request, acceptsDataTreatment]);

  const openLegalPage = useCallback((path: string) => {
    Linking.openURL(`${WEB_URL}${path}`).catch(() => {
      Alert.alert('Error', 'No se pudo abrir la página. Intenta más tarde.');
    });
  }, []);

  const handleReset = () => {
    setSent(false);
    setName('');
    setRequest('');
    setFieldErrors({});
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(insets.top, 12) + (isSmallScreen ? 8 : 16),
            paddingBottom: TAB_BAR_BASE + insets.bottom + (isSmallScreen ? 8 : 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          style={styles.header}
        >
          <Ionicons name="heart" size={isSmallScreen ? 24 : 32} color={ROSE} />
          <Text style={[styles.heading, isSmallScreen && styles.headingSmall]}>
            Petición de oración
          </Text>
          <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
            Comparte tu petición y nuestro equipo intercederá por ti.
          </Text>
        </Animated.View>

        {!sent && !loading && (
          <Animated.View entering={FadeIn.delay(80).duration(220)} style={styles.headerActions}>
            <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(()=>{}); router.push('/prayer-history'); }} style={styles.historyLink} activeOpacity={0.8}>
              <Ionicons name="list-outline" size={14} color={Colors.accent} />
              <Text style={styles.historyLinkText}>Mis peticiones</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        {sent ? (
          <Animated.View
            entering={FadeInDown.duration(320).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            style={[styles.successCard, isSmallScreen && styles.successCardSmall]}
          >
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
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(100).duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))} style={styles.form}>
            <View style={styles.field}>
              <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>Nombre</Text>
              <TextInput
                ref={nameRef}
                style={[styles.input, isSmallScreen && styles.inputSmall, fieldErrors.name && styles.inputError]}
                placeholder="Tu nombre"
                placeholderTextColor={Colors.textAltFaint}
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                maxLength={NAME_MAX_LENGTH}
                editable={!loading}
                accessibilityLabel="Tu nombre"
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => requestRef.current?.focus()}
              />
              {fieldErrors.name && (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.name}
                </Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>Petición</Text>
              <TextInput
                ref={requestRef}
                style={[
                  styles.input,
                  styles.textarea,
                  isSmallScreen && styles.textareaSmall,
                  fieldErrors.request && styles.inputError,
                ]}
                placeholder="Escribe tu petición de oración..."
                placeholderTextColor={Colors.textAltFaint}
                value={request}
                onChangeText={(value) => {
                  setRequest(value);
                  if (fieldErrors.request) setFieldErrors((prev) => ({ ...prev, request: undefined }));
                }}
                multiline
                numberOfLines={isSmallScreen ? 3 : 4}
                textAlignVertical="top"
                maxLength={REQUEST_MAX_LENGTH}
                editable={!loading}
                accessibilityLabel="Tu petición de oración"
              />
              {fieldErrors.request && (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.request}
                </Text>
              )}
              <Text style={styles.charCounter}>
                {request.length}/{REQUEST_MAX_LENGTH}
              </Text>
              <Text style={styles.sensitiveWarning}>
                Evita incluir datos personales sensibles (salud, situación familiar o económica) o información de otras personas que no sea necesaria para tu petición.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                setAcceptsDataTreatment((prev) => !prev);
                if (fieldErrors.consent) setFieldErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              style={styles.consentRow}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptsDataTreatment }}
              accessibilityLabel="Acepto la Política de Tratamiento de Datos Personales"
            >
              <Ionicons
                name={acceptsDataTreatment ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={acceptsDataTreatment ? Colors.success : Colors.textAltFaint}
              />
              <Text style={styles.consentText}>
                He leído y acepto la{' '}
                <Text
                  style={styles.consentLink}
                  onPress={(e) => {
                    e.stopPropagation();
                    openLegalPage('/info/data-treatment');
                  }}
                >
                  Política de Tratamiento de Datos Personales
                </Text>{' '}
                y autorizo el tratamiento de mis datos para gestionar esta petición de oración.
              </Text>
            </TouchableOpacity>
            {fieldErrors.consent && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {fieldErrors.consent}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitBtn, loading && styles.submitBtnDisabled, isSmallScreen && styles.submitBtnSmall]}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Enviando petición' : 'Enviar petición'}
              accessibilityState={{ disabled: loading, busy: loading }}
              accessibilityHint="Envía tu petición al equipo de intercesión"
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
          </Animated.View>
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
    minHeight: 48,
    color: Colors.textSoft,
    fontSize: 14,
  },
  inputSmall: {
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 13,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  charCounter: {
    color: Colors.textAltFaint,
    fontSize: 11,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  sensitiveWarning: {
    color: '#fbbf24',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    opacity: 0.85,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
  },
  textareaSmall: {
    minHeight: 72,
    paddingTop: 10,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  consentText: {
    flex: 1,
    color: Colors.textAltFaint,
    fontSize: 12,
    lineHeight: 17,
  },
  consentLink: {
    color: Colors.accent,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
