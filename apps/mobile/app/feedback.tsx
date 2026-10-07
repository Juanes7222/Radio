import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { submitFeedback } from '@radio/api';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_LIMITS,
  FEEDBACK_MIN_MENSAJE,
  type FeedbackCategory,
} from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { legalUrl } from '@/constants/legalDocuments';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Durations, Easings, Spring } from '@/constants/motion';
import { openExternalUrl } from '@/lib/externalLinks';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORY_VALUES = Object.values(FEEDBACK_CATEGORIES);
const DRAFT_KEY = 'feedback_draft_v1';

interface FeedbackFieldErrors {
  mensaje?: string;
  nombre?: string;
  contacto?: string;
  consent?: string;
}

/**
 * The same seal the site drops on the sheet: two concentric squares in tally
 * red and the station's word for being on the air. Built from plain views so
 * it needs no SVG asset and scales with the type ramp.
 */
function OnAirSeal() {
  return (
    <View style={styles.sealOuter}>
      <View style={styles.sealInner}>
        <View style={styles.sealLamp} />
        <Text style={styles.sealText}>Al aire</Text>
      </View>
    </View>
  );
}

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [categoria, setCategoria] = useState<FeedbackCategory>('SUGERENCIA');
  const [mensaje, setMensaje] = useState('');
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [acceptsDataTreatment, setAcceptsDataTreatment] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [signedName, setSignedName] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FeedbackFieldErrors>({});

  const mensajeRef = useRef<TextInput>(null);
  const nombreRef = useRef<TextInput>(null);
  const contactoRef = useRef<TextInput>(null);
  const draftLoadedRef = useRef(false);

  const isSmallScreen = useMemo(() => SCREEN_HEIGHT < 700, []);
  const remaining = FEEDBACK_LIMITS.mensaje - mensaje.length;

  // The consent checkbox is a legal gate, so its state change is the one the
  // user must be certain landed. A spring pop acknowledges it physically
  // instead of relying on the glyph swap alone.
  const consentScale = useSharedValue(1);
  useEffect(() => {
    consentScale.value = acceptsDataTreatment
      ? withSequence(
          withTiming(0.78, { duration: Durations.instant }),
          withSpring(1.2, Spring.bouncy),
          withSpring(1, Spring.gentle)
        )
      : withTiming(0.92, { duration: Durations.fast, easing: Easing.out(Easing.ease) });
  }, [acceptsDataTreatment, consentScale]);
  const consentIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: consentScale.value }],
  }));

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const draft = JSON.parse(raw) as {
          categoria?: string;
          mensaje?: string;
          nombre?: string;
          contacto?: string;
        };
        if (
          typeof draft.categoria === 'string' &&
          (CATEGORY_VALUES as readonly string[]).includes(draft.categoria)
        ) {
          setCategoria(draft.categoria as FeedbackCategory);
        }
        if (typeof draft.mensaje === 'string') {
          setMensaje(draft.mensaje.slice(0, FEEDBACK_LIMITS.mensaje));
        }
        if (typeof draft.nombre === 'string') {
          setNombre(draft.nombre.slice(0, FEEDBACK_LIMITS.nombre));
        }
        if (typeof draft.contacto === 'string') {
          setContacto(draft.contacto.slice(0, FEEDBACK_LIMITS.contacto));
        }
      })
      .catch(() => {})
      .finally(() => {
        draftLoadedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current || sent) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ categoria, mensaje, nombre, contacto })
      ).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [categoria, mensaje, nombre, contacto, sent]);

  const handleSubmit = useCallback(async () => {
    const trimmedMensaje = mensaje.trim();
    const trimmedNombre = nombre.trim();
    const trimmedContacto = contacto.trim();

    const errors: FeedbackFieldErrors = {};
    if (trimmedMensaje.length < FEEDBACK_MIN_MENSAJE) {
      errors.mensaje = `Escribe un mensaje de al menos ${FEEDBACK_MIN_MENSAJE} caracteres.`;
    } else if (trimmedMensaje.length > FEEDBACK_LIMITS.mensaje) {
      errors.mensaje = `El mensaje no puede superar ${FEEDBACK_LIMITS.mensaje} caracteres.`;
    }
    if (trimmedNombre.length > FEEDBACK_LIMITS.nombre) {
      errors.nombre = `Máximo ${FEEDBACK_LIMITS.nombre} caracteres.`;
    }
    if (trimmedContacto.length > FEEDBACK_LIMITS.contacto) {
      errors.contacto = `Máximo ${FEEDBACK_LIMITS.contacto} caracteres.`;
    }
    if (!acceptsDataTreatment) {
      errors.consent = 'Debes autorizar el tratamiento de tus datos para continuar.';
    }
    setFieldErrors(errors);

    if (errors.mensaje) {
      mensajeRef.current?.focus();
      return;
    }
    if (errors.nombre) {
      nombreRef.current?.focus();
      return;
    }
    if (errors.contacto) {
      contactoRef.current?.focus();
      return;
    }
    if (errors.consent) {
      return;
    }

    setLoading(true);
    try {
      const result = await submitFeedback(BACKEND_URL, {
        categoria,
        mensaje: trimmedMensaje,
        nombre: trimmedNombre.length > 0 ? trimmedNombre : undefined,
        contacto: trimmedContacto.length > 0 ? trimmedContacto : undefined,
        consent: true,
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSignedName(trimmedNombre.length > 0 ? trimmedNombre : null);
        setMensaje('');
        setNombre('');
        setContacto('');
        setFieldErrors({});
        setSent(true);
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      } else {
        Alert.alert('No se pudo enviar', result.errorMessage);
      }
    } catch {
      Alert.alert('Error', 'Error de conexión. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, [acceptsDataTreatment, categoria, contacto, mensaje, nombre]);

  const handleReset = useCallback(() => {
    setSent(false);
    setSignedName(null);
    setFieldErrors({});
    setAcceptsDataTreatment(false);
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  }, []);

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

      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Escríbanos</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (isSmallScreen ? Spacing.md : Spacing.lg) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(Durations.slow).easing(Easing.bezier(...Easings.enter))}
        >
          <Text style={styles.lede}>
            Sugerencias, felicitaciones, consultas y problemas con la emisión. Puedes
            firmar o dejar tu mensaje anónimo: llega igual a la bandeja del equipo.
          </Text>
        </Animated.View>

        {sent ? (
          <Animated.View
            entering={FadeInDown.duration(Durations.slow).easing(Easing.bezier(...Easings.enter))}
            exiting={FadeOut.duration(Durations.fast).easing(Easing.bezier(...Easings.exit))}
            style={styles.successCard}
          >
            <Animated.View
              entering={ZoomIn.duration(Durations.normal).delay(120).easing(Easing.bezier(...Easings.spring))}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <OnAirSeal />
            </Animated.View>
            <Animated.Text
              entering={FadeInDown.delay(220).duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
              style={styles.successTitle}
            >
              Ya está al aire
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(280).duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
              style={styles.successText}
            >
              {signedName
                ? `Gracias, ${signedName}. Tu mensaje ya está en la bandeja del equipo.`
                : 'Tu mensaje ya está en la bandeja del equipo.'}
            </Animated.Text>
            <Animated.View entering={FadeIn.delay(360).duration(Durations.normal)}>
              <TouchableOpacity
                onPress={handleReset}
                style={styles.resetBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Escribir otro mensaje"
              >
                <Text style={styles.resetBtnText}>Escribir otro mensaje</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(80).duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
            style={styles.sheet}
          >
            {/* Motivo: una línea de opciones, como una línea del formulario */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Motivo</Text>
              <View style={styles.categoryRow}>
                {CATEGORY_VALUES.map((category, index) => {
                  const selected = category === categoria;
                  return (
                    <View key={category} style={styles.categoryItem}>
                      {index > 0 ? (
                        <Text style={styles.categoryDot} accessibilityElementsHidden>
                          ·
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setCategoria(category);
                        }}
                        disabled={loading}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: loading }}
                        accessibilityLabel={FEEDBACK_CATEGORY_LABELS[category]}
                      >
                        <Text
                          style={[
                            styles.categoryLabel,
                            selected ? styles.categoryLabelSelected : styles.categoryLabelIdle,
                          ]}
                        >
                          {FEEDBACK_CATEGORY_LABELS[category]}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowLabelLine}>
                <Text style={styles.rowLabel}>Mensaje</Text>
                <Text style={styles.counter}>
                  {mensaje.length}/{FEEDBACK_LIMITS.mensaje}
                </Text>
              </View>
              <TextInput
                ref={mensajeRef}
                style={[
                  styles.input,
                  styles.textarea,
                  isSmallScreen && styles.textareaSmall,
                  fieldErrors.mensaje && styles.inputError,
                ]}
                placeholder="Escribe aquí lo que quieras contarnos."
                placeholderTextColor={Colors.textMuted}
                keyboardAppearance="dark"
                value={mensaje}
                onChangeText={(value) => {
                  setMensaje(value);
                  if (fieldErrors.mensaje) setFieldErrors((prev) => ({ ...prev, mensaje: undefined }));
                }}
                multiline
                numberOfLines={isSmallScreen ? 4 : 6}
                textAlignVertical="top"
                maxLength={FEEDBACK_LIMITS.mensaje}
                editable={!loading}
                accessibilityLabel="Tu mensaje para la estación"
              />
              {fieldErrors.mensaje ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.mensaje}
                </Text>
              ) : (
                <Text style={styles.hint}>
                  {remaining < 60
                    ? `Quedan ${remaining} caracteres.`
                    : `Mínimo ${FEEDBACK_MIN_MENSAJE} caracteres.`}
                </Text>
              )}
            </View>

            <View style={styles.row}>
              <View style={styles.rowLabelLine}>
                <Text style={styles.rowLabel}>Nombre</Text>
                <Text style={styles.optionalTag}>opcional</Text>
              </View>
              <TextInput
                ref={nombreRef}
                style={[styles.input, fieldErrors.nombre && styles.inputError]}
                placeholder="Con el que le saludemos"
                placeholderTextColor={Colors.textMuted}
                keyboardAppearance="dark"
                value={nombre}
                onChangeText={(value) => {
                  setNombre(value);
                  if (fieldErrors.nombre) setFieldErrors((prev) => ({ ...prev, nombre: undefined }));
                }}
                maxLength={FEEDBACK_LIMITS.nombre}
                editable={!loading}
                autoComplete="name"
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => contactoRef.current?.focus()}
                accessibilityLabel="Tu nombre"
              />
              {fieldErrors.nombre ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.nombre}
                </Text>
              ) : null}
            </View>

            <View style={styles.row}>
              <View style={styles.rowLabelLine}>
                <Text style={styles.rowLabel}>Contacto</Text>
                <Text style={styles.optionalTag}>opcional</Text>
              </View>
              <TextInput
                ref={contactoRef}
                style={[styles.input, fieldErrors.contacto && styles.inputError]}
                placeholder="Correo o teléfono"
                placeholderTextColor={Colors.textMuted}
                keyboardAppearance="dark"
                value={contacto}
                onChangeText={(value) => {
                  setContacto(value);
                  if (fieldErrors.contacto)
                    setFieldErrors((prev) => ({ ...prev, contacto: undefined }));
                }}
                maxLength={FEEDBACK_LIMITS.contacto}
                editable={!loading}
                autoComplete="email"
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                accessibilityLabel="Correo o teléfono de contacto"
              />
              {fieldErrors.contacto ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.contacto}
                </Text>
              ) : null}
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                onPress={() => {
                  setAcceptsDataTreatment((prev) => !prev);
                  if (fieldErrors.consent)
                    setFieldErrors((prev) => ({ ...prev, consent: undefined }));
                }}
                style={styles.consentRow}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptsDataTreatment }}
                accessibilityLabel="Autorizo el tratamiento de mis datos"
              >
                <View style={styles.consentIconWrap} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Animated.View style={consentIconStyle}>
                    <Ionicons
                      name={acceptsDataTreatment ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={acceptsDataTreatment ? Colors.success : Colors.textAltFaint}
                    />
                  </Animated.View>
                </View>
                <Text style={styles.consentText}>
                  Autorizo el tratamiento de los datos que escriba aquí, incluido mi nombre y
                  mi contacto, para que la estación pueda responderme. Conozco la{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={(event) => {
                      event.stopPropagation();
                      openExternalUrl(legalUrl('data-treatment'));
                    }}
                  >
                    política de tratamiento de datos
                  </Text>
                  .
                </Text>
              </TouchableOpacity>
              {fieldErrors.consent ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {fieldErrors.consent}
                </Text>
              ) : null}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={loading ? 'Enviando mensaje' : 'Enviar mensaje'}
                accessibilityState={{ disabled: loading, busy: loading }}
                accessibilityHint="Envía tu mensaje a la bandeja del equipo"
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.textOnSignal} />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color={Colors.textOnSignal} />
                    <Text style={styles.submitBtnText}>Enviar mensaje</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeIn.delay(120).duration(Durations.normal)} style={styles.aftermath}>
          <Text style={styles.aftermathTitle}>Qué pasa con tu mensaje</Text>
          {[
            'Llega a la bandeja del equipo de la estación.',
            'Si dejaste un nombre o un contacto, te respondemos por ese medio.',
            'No se publica en el sitio ni en la aplicación.',
          ].map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.md },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg },
  backBtn: { minHeight: 44, minWidth: 44, alignItems: 'flex-start', justifyContent: 'center' },
  heading: { ...Typography.display, color: Colors.text, flex: 1 },

  lede: { ...Typography.body, color: Colors.textMuted, lineHeight: 21 },

  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  row: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.md, gap: 6 },
  rowLabelLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
  rowLabel: { ...Typography.eyebrow, color: Colors.textFaint },
  optionalTag: { ...Typography.caption, color: Colors.textAltFaint, fontSize: 11 },

  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  categoryItem: { flexDirection: 'row', alignItems: 'center' },
  categoryDot: { ...Typography.body, color: Colors.border, marginHorizontal: 2 },
  categoryLabel: { ...Typography.body, paddingVertical: 4 },
  categoryLabelSelected: { color: Colors.text, fontWeight: '600' },
  categoryLabelIdle: { color: Colors.textMuted },

  input: {
    ...Typography.body,
    backgroundColor: Colors.surfaceDim,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 46,
    color: Colors.textSoft,
  },
  inputError: { borderColor: Colors.danger },
  textarea: { minHeight: 120, paddingTop: 12 },
  textareaSmall: { minHeight: 96, paddingTop: 10 },
  errorText: { ...Typography.caption, color: Colors.danger },
  hint: { ...Typography.caption, color: Colors.textAltFaint, fontSize: 11 },
  counter: { ...Typography.mono, color: Colors.textAltFaint },

  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  consentIconWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  consentText: { ...Typography.caption, flex: 1, color: Colors.textMuted, lineHeight: 17 },
  consentLink: { color: Colors.signal, fontWeight: '600', textDecorationLine: 'underline' },

  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderGlass,
  },
  submitBtn: {
    backgroundColor: Colors.signal,
    borderRadius: Radii.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { ...Typography.bodyStrong, color: Colors.textOnSignal },

  successCard: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  sealOuter: {
    width: 108,
    height: 108,
    borderRadius: Radii.sm,
    borderWidth: 2.5,
    borderColor: Colors.tally,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealInner: {
    width: 82,
    height: 82,
    borderRadius: Radii.xs,
    borderWidth: 1,
    borderColor: Colors.tallyGlow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sealLamp: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.tally },
  sealText: {
    ...Typography.mono,
    color: Colors.tally,
    fontSize: 12,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  successTitle: { ...Typography.display, color: Colors.text, fontSize: 24, lineHeight: 30 },
  successText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  resetBtn: {
    marginTop: Spacing.sm,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  resetBtnText: { ...Typography.bodyStrong, color: Colors.textSoft, fontSize: 13 },

  aftermath: { paddingTop: Spacing.sm, gap: Spacing.xs },
  aftermathTitle: { ...Typography.screenTitle, color: Colors.text, fontSize: 16, lineHeight: 22 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderGlass,
  },
  stepNumber: { ...Typography.mono, color: Colors.textAltFaint, width: 18 },
  stepText: { ...Typography.body, flex: 1, color: Colors.textMuted },
});