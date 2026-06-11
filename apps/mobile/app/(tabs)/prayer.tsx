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
import { BACKEND_URL } from '@/constants/api';

import { scale, TAB_BAR_HEIGHT } from '../../lib/responsive';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
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
      const res = await fetch(`${BACKEND_URL}/api/prayer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, request: trimmedRequest }),
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <LinearGradient
        colors={['#0a0a14', '#130926', '#0a0a14']}
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
          <Ionicons name="heart" size={isSmallScreen ? 24 : 32} color="#f43f5e" />
          <Text style={[styles.heading, isSmallScreen && styles.headingSmall]}>
            Petición de oración
          </Text>
          <Text style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
            Comparte tu petición y nuestro equipo intercederá por ti.
          </Text>
        </View>

        {sent ? (
          <View style={[styles.successCard, isSmallScreen && styles.successCardSmall]}>
            <Ionicons name="checkmark-circle" size={isSmallScreen ? 36 : 48} color="#22c55e" />
            <Text style={[styles.successTitle, isSmallScreen && styles.successTitleSmall]}>
              Petición enviada
            </Text>
            <Text style={[styles.successText, isSmallScreen && styles.successTextSmall]}>
              Tu petición ha sido recibida. Oraremos por ti.
            </Text>
            <TouchableOpacity onPress={handleReset} style={styles.resetBtn} activeOpacity={0.8}>
              <Text style={styles.resetBtnText}>Enviar otra petición</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[styles.label, isSmallScreen && styles.labelSmall]}>Nombre</Text>
              <TextInput
                style={[styles.input, isSmallScreen && styles.inputSmall]}
                placeholder="Tu nombre"
                placeholderTextColor="#4b5563"
                value={name}
                onChangeText={setName}
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
                placeholderTextColor="#4b5563"
                value={request}
                onChangeText={setRequest}
                multiline
                numberOfLines={isSmallScreen ? 3 : 4}
                textAlignVertical="top"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[styles.submitBtn, loading && styles.submitBtnDisabled, isSmallScreen && styles.submitBtnSmall]}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={isSmallScreen ? 14 : 16} color="#fff" />
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
  container: { flex: 1, backgroundColor: '#0a0a14' },
  scroll: { paddingHorizontal: 20, gap: 20, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 10, marginBottom: 8 },
  heading: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headingSmall: { fontSize: 18 },
  subtitle: {
    color: '#4b5563',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  subtitleSmall: { fontSize: 12 },
  form: { gap: 16 },
  field: { gap: 6 },
  label: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  labelSmall: { fontSize: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f1f5f9',
    fontSize: 14,
  },
  inputSmall: {
    paddingVertical: 10,
    fontSize: 13,
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
    backgroundColor: '#f43f5e',
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
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  submitBtnTextSmall: { fontSize: 13 },
  successCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  successCardSmall: {
    padding: 16,
    gap: 8,
  },
  successTitle: { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  successTitleSmall: { fontSize: 16 },
  successText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  successTextSmall: { fontSize: 12 },
  resetBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resetBtnText: { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
});
