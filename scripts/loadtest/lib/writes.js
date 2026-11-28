// @ts-check

/**
 * Builds the real payloads for the two public write surfaces.
 *
 * @param {string} marker
 * @param {string} categoria
 */
export function buildWritePayload(marker, categoria) {
  return {
    prayer: {
      name: `K6 ${marker}`,
      request: `Prueba de carga ${marker} para medir capacidad`,
      deviceId: `k6-${marker}`,
    },
    feedback: {
      categoria,
      mensaje: `Prueba de carga ${marker}`,
      consent: true,
    },
  };
}

/**
 * Payload that the prayer validator must reject.
 *
 * @param {string} marker
 */
export function invalidPrayerPayload(marker) {
  return { name: `K6 ${marker}`, deviceId: `k6-${marker}` };
}
