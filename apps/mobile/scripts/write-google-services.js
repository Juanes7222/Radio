/**
 * Materializes the google-services.json file from the EXPO_PUBLIC_FIREBASE_CONFIG
 * environment variable so the native Android build can register for FCM.
 *
 * Firebase's Google Services Gradle plugin requires the file to exist on disk
 * during the native build; environment variables alone never reach it.
 * This script must run before `expo prebuild` / Gradle compilation.
 */

const fs = require('fs');
const path = require('path');

const ENV_VAR = 'EXPO_PUBLIC_FIREBASE_CONFIG';
const OUTPUT_FILE = path.join(__dirname, '..', 'google-services.json');
const ENV_FILES = ['.env.production', '.env'];

function fail(message) {
  console.error(`[write-google-services] ${message}`);
  process.exit(1);
}

function readEnvValue(key, filePath) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === key) {
      return match[2].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

function resolveValue() {
  if (process.env[ENV_VAR]) return process.env[ENV_VAR];

  for (const file of ENV_FILES) {
    const value = readEnvValue(ENV_VAR, path.join(__dirname, '..', file));
    if (value) return value;
  }
  return null;
}

const raw = resolveValue();

if (!raw || !raw.trim()) {
  fail(
    `No se encontro la variable ${ENV_VAR} en el entorno ni en ${ENV_FILES.join(', ')}. ` +
      'Agrega el google-services.json como JSON en esa variable para habilitar FCM.'
  );
}

let config;
try {
  config = JSON.parse(raw);
} catch {
  fail(`La variable ${ENV_VAR} no contiene un JSON valido.`);
}

const hasClientInfo = Array.isArray(config.client) || Array.isArray(config.client_info);
if (!config.project_info || !hasClientInfo) {
  fail('El contenido no parece un google-services.json (faltan project_info o client/client_info).');
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
console.log(`[write-google-services] google-services.json generado en ${OUTPUT_FILE}`);
