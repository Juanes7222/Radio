import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAzuraCast } from '@radio/api';
import type { ScheduleItem } from '@radio/types';
import { formatScheduleTime } from '../../lib/formatMedia';
import { BACKEND_URL } from '@/constants/api';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const SLOT_ACCENTS = [
  { dot: '#e8883a', glow: 'rgba(232,136,58,0.25)' },
  { dot: '#4f98a3', glow: 'rgba(79,152,163,0.25)' },
  { dot: '#a86fdf', glow: 'rgba(168,111,223,0.25)' },
  { dot: '#6daa45', glow: 'rgba(109,170,69,0.25)' },
  { dot: '#dd6974', glow: 'rgba(221,105,116,0.25)' },
  { dot: '#e8af34', glow: 'rgba(232,175,52,0.25)' },
];

const BACKGROUND = '#0c0c1e';
const CARD_BG = '#16162c';
const TEXT_MUTED = '#8b92a5';

function ProgramCard({ program, idx, onPress }: { program: ScheduleItem; idx: number; onPress?: () => void }) {
  const accent = SLOT_ACCENTS[idx % SLOT_ACCENTS.length];

  const startD = new Date(program.start_timestamp * 1000);
  const endD = new Date(program.end_timestamp * 1000);
  
  const startTime = formatScheduleTime(startD);
  const endTime = formatScheduleTime(endD);
  
  const isLive = program.type === 'streamer';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.cardWrapper}>
      <View style={styles.timelineIndicator}>
        <View style={styles.verticalLine} />
        <View style={[styles.dot, { backgroundColor: accent.dot }]} />
      </View>

      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: accent.dot }]} />
        
        <View style={styles.cardContent}>
          <View style={styles.timeColumn}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={14} color={TEXT_MUTED} />
              <Text style={styles.startTime}>{startTime}</Text>
            </View>
            <Text style={styles.endTime}>→ {endTime}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoColumn}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>{program.title}</Text>
              {isLive && (
                <View style={[styles.liveBadge, { backgroundColor: accent.glow, borderColor: accent.dot }]}>
                  <View style={[styles.liveDot, { backgroundColor: accent.dot }]} />
                  <Text style={[styles.liveText, { color: accent.dot }]}>EN VIVO</Text>
                </View>
              )}
            </View>

            <View style={styles.typeRow}>
              <Ionicons 
                name={isLive ? "mic-outline" : "musical-notes-outline"} 
                size={14} 
                color={TEXT_MUTED} 
              />
              <Text style={styles.typeText}>
                {isLive ? 'Programa en vivo con locutor' : 'Programa automático'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);

  const currentDay = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(currentDay);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await fetchSchedule();
        if (data) setSchedule(data);
      } catch (err) {
        console.error('Error fetching schedule:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, [fetchSchedule]);

  const programsForDay = schedule
    .filter(item => new Date(item.start_timestamp * 1000).getDay() === selectedDay)
    .sort((a, b) => a.start_timestamp - b.start_timestamp);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={styles.eyebrow}>
            <Ionicons name="radio" size={16} color="#4f98a3" />
            <Text style={styles.eyebrowText}>Horarios y Emisiones</Text>
          </View>
          <Text style={styles.mainTitle}>Programación</Text>
          <Text style={styles.subtitle}>
            Todos nuestros programas, de lunes a domingo. Selecciona un día para ver los detalles.
          </Text>
        </View>

        {/* Selector de Días */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.daysScroll}
          contentContainerStyle={styles.daysContainer}
        >
          {DAYS.map((day, i) => (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDay(i)}
              style={[
                styles.dayPill,
                selectedDay === i && styles.dayPillSelected
              ]}
            >
              <Text style={[
                styles.dayText,
                selectedDay === i && styles.dayTextSelected
              ]}>
                {day}
              </Text>
              {currentDay === i && (
                <View style={styles.todayIndicator} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Cabecera del día */}
        <View style={styles.dayHeader}>
          <View>
            <Text style={styles.dayTitle}>{DAYS_FULL[selectedDay]}</Text>
            {!loading && programsForDay.length > 0 && (
              <Text style={styles.programCount}>
                {programsForDay.length} programa{programsForDay.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          {currentDay === selectedDay && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Hoy</Text>
            </View>
          )}
        </View>

        {/* Lista de programas */}
        {loading ? (
          <ActivityIndicator size="large" color="#4f98a3" style={{ marginTop: 40 }} />
        ) : programsForDay.length > 0 ? (
          <View style={styles.timelineContainer}>
            {programsForDay.map((program, idx) => (
              <ProgramCard key={`${program.id}-${program.start_timestamp}`} program={program} idx={idx} onPress={() => setSelectedProgram(program)} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="musical-notes" size={24} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyTitle}>Programación continua</Text>
            <Text style={styles.emptyDesc}>
              La radio transmite música continua este día. No hay eventos especiales agendados.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Program Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedProgram}
        onRequestClose={() => setSelectedProgram(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedProgram?.title}</Text>
              <Pressable onPress={() => setSelectedProgram(null)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={18} color={TEXT_MUTED} />
                <Text style={styles.detailText}>
                  {selectedProgram && new Date(selectedProgram.start_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} - {' '}
                  {selectedProgram && new Date(selectedProgram.end_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons 
                  name={selectedProgram?.type === 'streamer' ? "mic-outline" : "musical-notes-outline"} 
                  size={18} 
                  color={TEXT_MUTED} 
                />
                <Text style={styles.detailText}>
                  {selectedProgram?.type === 'streamer' ? 'Programa en vivo con locutor' : 'Programa automático'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  eyebrowText: {
    color: '#4f98a3',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  daysScroll: {
    marginBottom: 24,
  },
  daysContainer: {
    gap: 8,
  },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    position: 'relative',
  },
  dayPillSelected: {
    backgroundColor: '#6366f1', // Tu color ACCENT
  },
  dayText: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  todayIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4f98a3',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  programCount: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  todayBadge: {
    backgroundColor: 'rgba(79,152,163,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayBadgeText: {
    color: '#4f98a3',
    fontSize: 12,
    fontWeight: '600',
  },
  timelineContainer: {
    paddingLeft: 10,
  },
  cardWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineIndicator: {
    width: 30,
    alignItems: 'center',
  },
  verticalLine: {
    position: 'absolute',
    top: 24,
    bottom: -16, // Conecta con la siguiente tarjeta
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 18,
    borderWidth: 2,
    borderColor: BACKGROUND,
  },
  card: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardAccent: {
    height: 4,
    width: '100%',
  },
  cardContent: {
    padding: 16,
    flexDirection: 'column',
    gap: 12,
  },
  timeColumn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  startTime: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: '600',
    fontSize: 15,
  },
  endTime: {
    color: TEXT_MUTED,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '100%',
  },
  infoColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    color: TEXT_MUTED,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDesc: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
});