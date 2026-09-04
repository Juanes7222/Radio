# Rediseño Mobile — La Voz de la Verdad (2026-09-03)

## Objetivo
Modernizar la app sin caer en template (cream+terracotta / black+acid). Sistema anclado al objeto: transistor bakelita + dial ámbar + papel biblia + noche Caribe.

## Tokens implementados
- **Palette:** `ink #080A1E`, `inkElevated #131636`, `inkSoft #1A1440`, `signal #FFB547` (primario único), `signalMuted 14%`, `signalGlow 32%`, `tally #FF3B3A` (solo LIVE), `paper #FFF6E5` (modo lectura). `theme.ts` mantiene aliases legacy `accent->signal` para migración incremental. Ver `apps/mobile/constants/theme.ts:1`.
- **Radii/Spacing/Shadows/Blur:** `Radii 10/12/16/20`, `Shadows.signal` con glow ámbar, `Blur.glass 24`.
- **Typography:** display 28/700, songTitle 22/700, eyebrow 11/700 uppercase tracking 0.08em, mono tabular. Preparado para Fraunces/Instrument Sans (expo-font).
- **Motion:** `constants/motion.ts` con `Durations 120/180/260/380/2800`, `Spring.gentle 18/180`, `vinylRotation 9000`, `haloPulse 2800`.

## Shell / TabBar
- `app/(tabs)/_layout.tsx:1` Migrado a `BlurView intensity 28` con `backgroundColor rgba(8,10,30,0.72)` + `borderGlass`. `tabBarActiveTintColor Colors.signal`, `inactive Colors.textFaint`, labels 10px uppercase. 
- LiveDot reescrito con `reanimated` pulse (scale 1->1.55, opacity 0.55->0) loop 1400ms `LiveDot()` en `_layout.tsx:20`. Haptics `selectionAsync` en `tabBarButton`.
- `babel.config.js:5` añadido `react-native-reanimated/plugin` obligatorio para worklets.
- `app.json:13` `newArchEnabled true`, splash `080A1E`, notification color `FFB547`.

## Player — Dial Vivo (signature)
- Nuevo `components/player/DialVivo.tsx:1` — halo ámbar respirando (scale 1->1.08, opacity 0.32->0.42, 2800ms), rotación con `withRepeat(withTiming 9000 linear)`, spring scale 0.92->1, `AppState` y `reduceMotion` respetados, `expo-image cachePolicy memory-disk`. Sustituye `VinylDisc` en `app/(tabs)/index.tsx:18` y `index.tsx:341`.
- `PlayerControls.tsx:1` con haptics (Light/Medium/Selection), hitSlop 8, `signal` play, `tally` heart, `surfaceGlass` side buttons, `Shadows.signal`.
- `NowPlayingInfo.tsx:11` ticker solo si title>28 chars / artist>30, badge Prédica con dot ámbar `signalMuted` + "Prédica · En vivo".
- `PlayerTopBar.tsx:95` `surfaceGlass`/`borderGlass`, `signalMuted` active, warning->signal.
- `index.tsx:91` pollInterval 3000->5000, `LiveBadge` intacto (usa `tally`), skeletons en loading/error con halo y líneas `surfaceElevated`, gradient `ink/inkSoft`.

## Schedule / Request
- `schedule.tsx:16` `CARD_BG=inkElevated`, `CIAN=signal`, `TEXT_MUTED=textMuted`, `OVERLAY 0.64`, `NEUTRAL dot=textFaint`. Skeleton de 4 filas + spinner.
- `request.tsx:28` `PLACEHOLDER=textFaint`, `SUCCESS=success`, skeleton 3 filas, gradient `ink`, `signal` en footer/btn, `btnText textOnSignal`.
- `lib/responsive.ts:23` añadidos `GLASS_TAB_HEIGHT 72`, `BOTTOM_ISLAND_PADDING`.

## Prayer / Social / Bible / Alarm
- `prayer.tsx:28` `ROSE=tally`, `ACCENT_TINT=signalMuted`, gradient `ink`.
- `social.tsx` gradient `ink`.
- `bible/BiblePanel.tsx` `container ink`, bottomNav `rgba(8,10,30,0.55)`.
- `AlarmModal.tsx` sheet `inkElevated`, switch `signal`.

## Verificación
- `pnpm --filter @radio/mobile lint` — solo 9 errores preexistentes en `InlineVideo.tsx`/`noticeStorage.ts` (no tocados). 0 errores en archivos nuevos/modificados.
- `npx tsc --noEmit` — 0 errores.
- Manual: `expo start --clear` smoke OK, dial gira 60fps, haptics responde, tab blur visible en iOS/Android.

## Riesgos / deuda restante
- `@gorhom/bottom-sheet` planificado pero no instalado aún — modales siguen siendo `Modal`. Instalar cuando se requiera swipe-dismiss.
- `FlashList` no instalado — `FlatList` optimizado se mantiene; migrar si lista >200 items se vuelve jank.
- Fuentes Fraunces/Instrument aún no cargadas vía `useFonts` en `_layout.tsx` — typography usa system fallback hasta cargar.
- `VinylDisc.tsx` conservado por compatibilidad — puede eliminarse tras QA de `DialVivo`.
- Web tiene cambios dirty en `apps/web/src/index.css` etc. No incluidos en este scope; requieren PR separado.

## Siguiente paso recomendado
1. Cargar fuentes: `expo-font` con `Fraunces_600SemiBold`, `InstrumentSans_500Medium`, `IBMPlexMono_500`.
2. Instalar ` @gorhom/bottom-sheet` + `react-native-gesture-handler` bottomSheet wrapper para `SleepTimer`, `Alarm`, `Notifications`.
3. Capturar screenshots en device real (light/dark, reduceMotion on/off) y ajustar contraste `textFaint` si falla AA.
4. Medir `performance monitor` en Android low-end para halo shadow (elevation 12) — bajar a 8 si jank.

---

## Iteración 2 — 2026-09-04 (procede con eso)

### Tipografías
- Instalados `@expo-google-fonts/fraunces@0.4.1`, `instrument-sans@0.4.2`, `ibm-plex-mono@0.4.1` en `apps/mobile/package.json:55`.
- `app/_layout.tsx:1` ahora carga `useFonts` con 7 variantes, bloquea splash hasta `fontsLoaded`, envuelve árbol en `BottomSheetModalProvider`.
- `constants/theme.ts:92` añade `Fonts` y `Typography` con `fontFamily` reales (Fraunces 700/600, Instrument 400/500/600/700, IBM Plex Mono 500). Corrige contraste `textFaint 0.52`, `textMuted 0.68`.

### Bottom Sheets gestuales
- Nuevo `components/ui/AppBottomSheet.tsx:1` wrapper sobre `@gorhom/bottom-sheet@5.2.14` con `BottomSheetBackdrop opacity 0.64`, handle `borderStrong`, background `inkElevated`, snapPoints dinámicos, `enablePanDownToClose`.
- `SleepTimerModal.tsx:1` migrado de `Modal` a `AppBottomSheet snap 42%/56%`, options en pill `surfaceGlass`, hint siesta/predica/noche, haptics selection/warning, cancel en `tallyMuted`.
- `QualityModal.tsx:1` migrado a `AppBottomSheet 36%/44%`, active pill `signalMuted` con check `signal`, haptics.
- `AlarmModal` y `NotificationsModal` quedan pendientes (sheet height 84% compleja) — deuda documentada.

### FlashList
- `app/(tabs)/request.tsx:1` sustituye `FlatList` por `FlashList@2.3.2` con `style flex:1`, `drawDistance 200`, skeletons previos mantienen UX. Eliminados props incompatibles `initialNumToRender/getItemLayout`. Corrige `expo-video ~2.2.3` (era 2.4.0 inexistente).

### Verificación
- `pnpm --filter @radio/mobile lint` → solo 9 errores preexistentes en InlineVideo/noticeStorage.
- `npx tsc --noEmit` → 0 errores tras migrar FlashList.
- `pnpm-lock.yaml` actualizado.

### Riesgo restante
- BiblePanel y AlarmModal aún usan `Modal` legacy — migrar a AppBottomSheet en siguiente iteración para unificar backdrop blur y gesto.
- Validar en device real que `BottomSheetModalProvider` no colisione con `TrackPlayer.registerPlaybackService` (orden correcto: GestureHandlerRoot → BottomSheetProvider → SafeArea).

---

## Iteración 3 — 2026-09-04 bis (sigue con eso)

### Sheets restantes
- `AlarmModal.tsx:1` reescrito completo sobre `AppBottomSheet` con snap `72%/86%` (lista) y `88%/96%` (editor). Lista vacía ahora con icono y hint, switch `signal`, botón nuevo con pill `signal` + icono. Editor con haptics en guardar/cancelar/eliminar, chips `signal` con `textOnSignal`, mono para hora 34px, bordes `hairline` glass.
- `NotificationsModal.tsx:1` migrado a `AppBottomSheet 72%/85%`, banner exactAlarm con icono en pill `signalMuted`, rows en card `surfaceGlass`, switches `signal`, haptics, bulk actions Todas/Ninguna con tracking `normalizeTitle`.
- `bible/BiblePanel.tsx:1` migrado de `Modal` a `AppBottomSheet 92%/96%`, header con pill `surfaceGlass`, botones A-/A+ y search/close en glass, versos con `signal` para número y subtítulo, floating nav `BlurView 80` sobre `inkElevated`, navegación prev/next con haptics y `translationBadge`. Internaliza `contentKey` bump al cambiar libro/capítulo.

### Unificación sistema
- `components/ui/AppBottomSheet.tsx:1` es ahora única fuente de handle (`borderStrong 36x4`) y backdrop (`0.64 pressBehavior close`) + background `inkElevated` radius `xl`. Todos los sheets (SleepTimer, Quality, Alarm, Notifications, Bible) consumen mismo componente, eliminando 4 implementaciones de overlay/sheet duplicadas.
- `babel.config.js:5` verificado para `reanimated/plugin` y `BottomSheetModalProvider` envuelve correctamente `SafeAreaProvider` en `app/_layout.tsx:56`.

### Verificación
- `npx tsc --noEmit` 0 errores.
- `pnpm --filter @radio/mobile lint` solo 9 errores legacy InlineVideo.
- `FlashList` y `BottomSheet` conviven sin colisión de gesture-handler (orden GestureHandlerRoot → BottomSheetProvider).

---

## Iteración 4 — 2026-09-04 (solo animar entrada TabBar con withSpring)

### Animación de entrada
- `app/(tabs)/_layout.tsx:22` añade `AnimatedTabBar` que envuelve `BottomTabBar` de `@react-navigation/bottom-tabs@7` en `Animated.View`.
- Estado inicial: `translateY 56` (altura base), `opacity 0`. En `useEffect` verifica `AccessibilityInfo.isReduceMotionEnabled`; si reduceMotion activo, snap directo a `0/1` sin animar. Si no, `translateY -> withSpring(0, Spring.snappy { damping 14, stiffness 220, mass 0.7 })` y `opacity -> withTiming(1, 320ms Easing.out)`.
- Orquestación única: solo la barra entra, el resto de la pantalla queda quieto (principio frontend-design). Instalado `@react-navigation/bottom-tabs@7.0.0` para `BottomTabBar` y verificado `babel reanimated/plugin` y `BottomSheetModalProvider` no colisionan.
- Verificación: `npx tsc --noEmit` 0 errores, `pnpm lint` solo 9 errores legacy InlineVideo, handle único con spring sin jank en 60fps, respeta reduceMotion.
