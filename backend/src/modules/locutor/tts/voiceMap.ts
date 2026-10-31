/**
 * El mapa de voces se guarda como `ef_dora=<id>,em_alex=<id>`: la etiqueta es
 * la que llevan las plantillas y el valor es el id del proveedor.
 *
 * `parseVoiceMap` lanza en un par mal formado a propósito: el panel tiene que
 * rechazar el guardado en vez de almacenar medio mapa, que dejaría unas
 * plantillas mudas en el proveedor sin que nadie sepa por qué.
 */
export function parseVoiceMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {};

  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    if (trimmed === "") continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) throw new Error(`Par de voces inválido: "${trimmed}"`);

    const label = trimmed.slice(0, equalsAt).trim();
    const voiceId = trimmed.slice(equalsAt + 1).trim();
    if (!label || !voiceId) throw new Error(`Par de voces inválido: "${trimmed}"`);

    map[label] = voiceId;
  }

  return map;
}

export function formatVoiceMap(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([label, voiceId]) => `${label}=${voiceId}`)
    .join(",");
}
