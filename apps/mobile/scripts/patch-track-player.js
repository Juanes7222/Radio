#!/usr/bin/env node
// Patch react-native-track-player 4.1.2 for RN 0.86 New Architecture.
// New Arch TurboModule parsing enforces `returnType == void iff !isBlockingSynchronousMethod`.
// El código original usa `fun foo(...) = scope.launch { ... }` que retorna Job (non-void) en métodos async,
// lo que hace fallar TurboModuleInteropUtils.getMethodDescriptorsFromModule con:
// "Unable to parse @ReactMethod annotations... returnType == void iff synchronous"
// Fix: cambiar `) = scope.launch {` a `) { scope.launch {` para que retornen Unit (void).
const fs = require('fs');
const path = require('path');

function patchMusicService(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  let patched = normalized;
  // 3) New Architecture / Bridgeless crash: MusicService.emit usa reactNativeHost que lanza
  // RuntimeException "You should not use ReactNativeHost directly in the New Architecture"
  // En RN 0.86 Bridgeless el Host es ReactHost, no ReactNativeHost.
  // Patch: intentar ReactNativeHost y fallback a ReactHost via refleccion para Bridgeless.
  patched = patched.replace(
    '    @MainThread\n    private fun emit(event: String, data: Bundle? = null) {\n        reactNativeHost.reactInstanceManager.currentReactContext\n            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n            ?.emit(event, data?.let { Arguments.fromBundle(it) })',
    '    @MainThread\n    private fun emit(event: String, data: Bundle? = null) {\n        val context = try {\n            reactNativeHost.reactInstanceManager.currentReactContext\n        } catch (e: Exception) {\n            try {\n                val method = this::class.java.superclass.getDeclaredMethod("getReactHost")\n                method.isAccessible = true\n                val host = method.invoke(this)\n                val getContext = host::class.java.getMethod("getCurrentReactContext")\n                getContext.invoke(host) as? com.facebook.react.bridge.ReactContext\n            } catch (e2: Exception) {\n                Timber.w(e2, "MusicService.emit fallback failed: " + event)\n                null\n            }\n        }\n        try {\n            context?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)?.emit(event, data?.let { Arguments.fromBundle(it) })\n        } catch (e: Exception) {\n            Timber.w(e, "MusicService.emit failed: " + event)\n        }'
  );
  patched = patched.replace(
    '    @MainThread\n    private fun emitList(event: String, data: List<Bundle> = emptyList()) {\n        val payload = Arguments.createArray()\n        data.forEach { payload.pushMap(Arguments.fromBundle(it)) }\n\n        reactNativeHost.reactInstanceManager.currentReactContext\n            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)\n            ?.emit(event, payload)',
    '    @MainThread\n    private fun emitList(event: String, data: List<Bundle> = emptyList()) {\n        val payload = Arguments.createArray()\n        data.forEach { payload.pushMap(Arguments.fromBundle(it)) }\n        val context = try {\n            reactNativeHost.reactInstanceManager.currentReactContext\n        } catch (e: Exception) {\n            try {\n                val method = this::class.java.superclass.getDeclaredMethod("getReactHost")\n                method.isAccessible = true\n                val host = method.invoke(this)\n                val getContext = host::class.java.getMethod("getCurrentReactContext")\n                getContext.invoke(host) as? com.facebook.react.bridge.ReactContext\n            } catch (e2: Exception) {\n                Timber.w(e2, "MusicService.emitList fallback failed: " + event)\n                null\n            }\n        }\n        try {\n            context?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)?.emit(event, payload)\n        } catch (e: Exception) {\n            Timber.w(e, "MusicService.emitList failed: " + event)\n        }'
  );
  if (patched !== normalized) {
    fs.writeFileSync(filePath, patched.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`[patch-track-player] patched MusicService ${filePath}`);
    return true;
  }
  return false;
}

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const normalized = original.replace(/\r\n/g, '\n');
  let patched = normalized;
  // 1) TurboModule fix: métodos `= scope.launch {` retornan Job (non-void) y rompen TurboModule en RN 0.81+/0.86.
  // Necesitan retornar Unit: `) {\n        scope.launch {` + cerrar con `        }\n    }`
  // Caso normal: `) = scope.launch {` en la misma línea
  patched = patched.replace(
    /\) = scope\.launch \{\n([\s\S]*?)\n    \}\n\n    @ReactMethod/g,
    ') {\n        scope.launch {\n$1\n        }\n    }\n\n    @ReactMethod'
  );
  patched = patched.replace(
    /\) = scope\.launch \{\n([\s\S]*?)\n    \}\n\}/g,
    ') {\n        scope.launch {\n$1\n        }\n    }\n}'
  );
  // Caso especial detectado: updateMetadataForTrack usa `) =\n        scope.launch {` con salto de línea
  patched = patched.replace(
    /\) =\n        scope\.launch \{\n([\s\S]*?)\n        \}\n\n    @ReactMethod/g,
    ') {\n        scope.launch {\n$1\n        }\n    }\n\n    @ReactMethod'
  );
  // Fallback genérico: cualquier `= scope.launch`
  patched = patched.replace(
    /\) =\n?\s*scope\.launch \{/g,
    ') {\n        scope.launch {'
  );

  // 2) Kotlin 2.1 + RN 0.86 strict nullability: Arguments.fromBundle(Bundle) exige Bundle non-null
  // pero Track.originalItem es Bundle? (nullable). Con Kotlin 2.1 es error de compilación.
  // Fix en 3 sitios:
  // - getTrack: line 601
  patched = patched.replace(
    'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
    'callback.resolve(musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) })'
  );
  // - getActiveTrack: lines 648-650
  patched = patched.replace(
    'else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
    'else musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let { Arguments.fromBundle(it) }'
  );
  // fallback por si los saltos de línea ya fueron normalizados diferente
  patched = patched.replace(
    'Arguments.fromBundle(musicService.tracks[musicService.getCurrentTrackIndex()].originalItem)',
    'musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let { Arguments.fromBundle(it) }'
  );
  // - getQueue: Arguments.fromList con List<Bundle?> -> filtrar nulls
  patched = patched.replace(
    'callback.resolve(Arguments.fromList(musicService.tracks.map { it.originalItem }))',
    'callback.resolve(Arguments.fromList(ArrayList(musicService.tracks.mapNotNull { it.originalItem })))'
  );

  if (patched !== normalized) {
    fs.writeFileSync(filePath, patched.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`[patch-track-player] patched ${filePath}`);
    return true;
  }
  console.log(`[patch-track-player] already patched ${filePath}`);
  return false;
}

const candidates = [
  path.join(__dirname, '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'module', 'MusicModule.kt'),
  // pnpm store layout (pnpm 10)
  ...(() => {
    try {
      const pnpmDir = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
      if (!fs.existsSync(pnpmDir)) return [];
      return fs.readdirSync(pnpmDir)
        .filter((n) => n.startsWith('react-native-track-player@'))
        .map((n) => path.join(pnpmDir, n, 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'module', 'MusicModule.kt'));
    } catch {
      return [];
    }
  })(),
  // fallback: root node_modules pnpm
  path.join(__dirname, '..', '..', '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'module', 'MusicModule.kt'),
];

const serviceCandidates = [
  path.join(__dirname, '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'service', 'MusicService.kt'),
  ...(() => {
    try {
      const pnpmDir = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
      if (!fs.existsSync(pnpmDir)) return [];
      return fs.readdirSync(pnpmDir)
        .filter((n) => n.startsWith('react-native-track-player@'))
        .map((n) => path.join(pnpmDir, n, 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'service', 'MusicService.kt'));
    } catch {
      return [];
    }
  })(),
  path.join(__dirname, '..', '..', '..', 'node_modules', 'react-native-track-player', 'android', 'src', 'main', 'java', 'com', 'doublesymmetry', 'trackplayer', 'service', 'MusicService.kt'),
];

let patchedAny = false;
for (const p of candidates) {
  if (patchFile(p)) patchedAny = true;
}
for (const p of serviceCandidates) {
  if (patchMusicService(p)) patchedAny = true;
}
if (!patchedAny) {
  console.log('[patch-track-player] no files patched (already ok or not found)');
}
