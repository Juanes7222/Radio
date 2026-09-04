// plugins/withGoogleServices.js
// Generates google-services.json from EXPO_PUBLIC_FIREBASE_CONFIG before prebuild.
// Replaces the prebuildCommand node script that broke with `pnpm expo` prefix.
const fs = require('fs');
const path = require('path');

const ENV_VAR = 'EXPO_PUBLIC_FIREBASE_CONFIG';
const ENV_FILES = ['.env.production', '.env'];

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
    const v = readEnvValue(ENV_VAR, path.join(__dirname, '..', file));
    if (v) return v;
  }
  return null;
}

function withGoogleServices(config) {
  const raw = resolveValue();
  // On EAS, env var is injected; locally may be missing — don't fail config, just warn.
  // The native build will fail later if google-services.json is truly required and missing.
  if (!raw || !raw.trim()) {
    console.warn(`[withGoogleServices] ${ENV_VAR} not found — skipping google-services.json generation.`);
    return config;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[withGoogleServices] ${ENV_VAR} is not valid JSON — skipping.`);
    return config;
  }
  const hasClient = Array.isArray(parsed.client) || Array.isArray(parsed.client_info);
  if (!parsed.project_info || !hasClient) {
    console.warn('[withGoogleServices] JSON missing project_info/client — skipping.');
    return config;
  }
  const out = path.join(__dirname, '..', 'google-services.json');
  fs.writeFileSync(out, JSON.stringify(parsed, null, 2));
  console.log(`[withGoogleServices] google-services.json written to ${out}`);
  return config;
}

module.exports = withGoogleServices;
