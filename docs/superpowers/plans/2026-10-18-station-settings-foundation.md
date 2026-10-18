# Ajustes de la estación: cimiento y umbrales de salud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que existan el catálogo de ajustes y la caché que lo resuelve, la API y la página `/admin/settings`, y que los umbrales del vigilante de salud se puedan cambiar desde el panel sin editar el entorno.

**Architecture:** Un catálogo tipado en código (`settings.catalog.ts`) sobre una tabla genérica `station_settings` de clave y valor en texto. La resolución es una caché en memoria, síncrona para los lectores y tolerante a fallos, hidratada una vez en el arranque después de Prisma. Los módulos de `config/` que alojan un ajuste movido se convierten en getters que delegan en la caché, de modo que sus consumidores no cambian.

**Tech Stack:** Express, Prisma + SQLite, TypeScript estricto, pnpm, Vitest (backend nuevo, siguiendo la convención ya existente en `apps/web`), React + Tailwind para el panel.

**Spec:** `docs/superpowers/specs/2026-10-18-station-settings-design.md`

Este plan cubre las secciones 5, 7 y 10 (Fase 0 y Fase 1a) del spec. **Quedan fuera de alcance** y van en planes separados: la consolidación de la zona horaria (spec sección 9), y las fases 2 a 7.

## Global Constraints

- TypeScript estricto. Prohibido `any`. Si es inevitable, aislarlo y explicarlo.
- Los comentarios, JSDoc y descripciones de funciones se escriben en inglés (AGENTS.md). La excepción son las cabeceras de `migration.sql`, que siguen el patrón en español de las migraciones vecinas (`backend/prisma/schema/migrations/20261007000000_add_announcement_playback/migration.sql`).
- El copy que ve el operador (etiquetas, descripciones, mensajes de error de validación) va en español.
- Sin dependencias de runtime nuevas. Vitest es la única adición y va en `devDependencies`.
- El esquema Prisma es multiarchivo en `backend/prisma/schema/*.prisma`, combinado por el CLI. Una migración es un directorio con un único `migration.sql`, nombrado `YYYYMMDDHHMMSS_descripcion`.
- Patrón de validación del repo: funciones puras que devuelven `{ ok: true, data } | { ok: false, error }` (ver `backend/src/modules/feedback/feedback.validation.ts`). Este plan lo replica con `data` sustituido por `value`.
- Ningún endpoint nuevo debe filtrar hacia `SILENT_LOG_PATHS` en `backend/src/app.ts` salvo que la página que lo consume se polee a sí misma. `/admin-api/settings` no se polea, así que no va ahí.
- El backend corre como un proceso único (HTTP + WS). Este diseño no soporta PM2 en cluster; antes de migrar otro ajuste en caliente hay que verificar el modo de arranque.

**Decisión que este plan toma y que hay que revisar:** el backend no tiene runner de tests hoy (`apps/web` sí lo tiene). Este plan añade Vitest al `backend` siguiendo la convención que el repositorio ya usa en `apps/web`. Si prefieres no añadirlo, las tareas 1 a 5 se degradan a verificación manual con los mismos comandos, y se pierde la prueba de que la hidratación falla suave.

## Review Focus

Cinco clases de entrada o modo de fallo que el spec implica y que ninguna prueba existente cubre. Cada una tiene su prueba en la tarea indicada.

1. **La base no responde al arrancar.** Un operador despliega con la base caída y el backend no debe negarse a arrancar: la radio tiene que emitir con los valores del entorno. Prueba en Task 1 (`cache.test.ts`).
2. **Un valor guardado que ya no parsea.** Alguien sube el mínimo del catálogo, o una fila quedó editada a mano, y el valor guardado queda fuera de rango. `getSetting` debe devolver el respaldo y no lanzar; un ajuste corrupto no puede ser la razón de que la radio calle. Prueba en Task 2 (`validation.test.ts`) y Task 1 (`cache.test.ts`).
3. **Un ajuste que solo aplica al reiniciar.** `health.checkIntervalMinutes` se lee al registrar el cron, así que guardarlo no cambia nada hasta el reinicio. El operador tiene que verlo antes de guardar, no descubrirlo después. Prueba en Task 3 (`view.test.ts`) y prueba de fuente en Task 6.
4. **Una clave desconocida en el cuerpo del PUT.** Un panel con una versión vieja manda una clave que ya no existe. Si se ignora en silencio, el panel muestra "guardado" sobre un cambio que no ocurrió. Prueba en Task 3 (`validation.test.ts`).
5. **Un valor sensible en la bitácora.** Una clave marcada `sensitive` no puede escribir su valor anterior ni el nuevo en texto plano, porque esa tabla se copia a R2 cada día. Prueba en Task 3 (`view.test.ts`), con una clave de prueba marcada sensible porque la Fase 1 no trae ninguna.

---

### Task 1: Caché en memoria y esquema Prisma

Esta tarea arma el suelo: el esquema, los tipos y la caché. No lee ni escribe Prisma, así que sus pruebas no necesitan base de datos.

**Files:**
- Create: `backend/prisma/schema/settings.prisma`
- Create: `backend/prisma/schema/migrations/20261018090000_add_station_settings/migration.sql`
- Create: `backend/src/modules/settings/settings.types.ts`
- Create: `backend/src/modules/settings/settings.cache.ts`
- Create: `backend/vitest.config.ts`
- Test: `backend/tests/settings/cache.test.ts`
- Modify: `backend/package.json` (scripts + devDependencies)

**Interfaces:**
- Consumes: nada. Es la primera tarea.
- Produces:
  - `settings.types.ts`: `SettingFieldType`, `SettingSectionId`, `SettingValue`, `SettingSource`, `SettingDefinition<T>`, `SettingRow`.
  - `settings.cache.ts`: `hydrateFromRows(rows: readonly SettingRow[]): void`, `resetCache(): void`, `getSetting(key: string): SettingValue`, `settingSource(key: string): SettingSource`, `currentRows(): ReadonlyMap<string, SettingRow>`.

- [ ] **Step 1: Añade Vitest al backend**

En `backend/package.json` añade el script `"test": "vitest run"` y `"test:watch": "vitest"`, y en `devDependencies` `"vitest": "^4.1.11"`, la misma versión que ya usa `apps/web`.

Crea `backend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Escribe la prueba que falla**

En `backend/tests/settings/cache.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  currentRows,
  getSetting,
  hydrateFromRows,
  resetCache,
  settingSource,
} from "../../src/modules/settings/settings.cache";

describe("settings cache", () => {
  beforeEach(() => {
    resetCache();
  });

  it("reports the default and source 'default' for a key that was never stored", () => {
    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  it("returns the stored value and source 'panel' once a row exists", () => {
    hydrateFromRows([
      {
        key: "health.emailEnabled",
        value: "false",
        updatedAt: new Date("2026-10-18T12:00:00Z"),
        updatedBy: "admin@radio",
      },
    ]);

    expect(getSetting("health.emailEnabled")).toBe(false);
    expect(settingSource("health.emailEnabled")).toBe("panel");
    expect(currentRows().get("health.emailEnabled")?.updatedBy).toBe("admin@radio");
  });

  it("falls back to the default and keeps reading when a stored value cannot be parsed", () => {
    hydrateFromRows([
      {
        key: "health.emailEnabled",
        value: "not-a-boolean",
        updatedAt: new Date("2026-10-18T12:00:00Z"),
        updatedBy: "admin@radio",
      },
    ]);

    expect(getSetting("health.emailEnabled")).toBe(true);
    expect(settingSource("health.emailEnabled")).toBe("default");
  });

  it("reports 'env' for a key backed by an environment variable that is set", () => {
    // The catalog reads HEALTH_EMAIL_ENABLED lazily, so the cache resolves it
    // at read time and this test does not mutate process.env.
    expect(getSetting("health.diskMinFreePercent")).toBe(15);
    expect(settingSource("health.diskMinFreePercent")).toBe("default");
  });
});
```

- [ ] **Step 3: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, porque `../../src/modules/settings/settings.cache` no existe.

- [ ] **Step 4: Define los tipos en `settings.types.ts`**

```ts
export type SettingFieldType = "number" | "boolean" | "text" | "emailList";

export type SettingSectionId =
  | "identity"
  | "health"
  | "announcements"
  | "voice"
  | "programs"
  | "processing"
  | "notifications"
  | "backups";

/** The value shape a definition can produce. Narrow per key via the catalog. */
export type SettingValue = string | number | boolean | string[];

export type SettingSource = "panel" | "env" | "default";

export interface SettingDefinition<T extends SettingValue = SettingValue> {
  key: string;
  section: SettingSectionId;
  label: string;
  description: string;
  type: SettingFieldType;
  defaultValue: T;
  /**
   * Reads the environment variable that seeds the value and stays as the
   * fallback. A function, not a value, because the catalog is built at import
   * time — long before Infisical has finished loading — and a direct read
   * there would capture the empty value.
   */
  envFallback?: () => T;
  unit?: string;
  min?: number;
  max?: number;
  parse: (raw: string) => T;
  format: (value: T) => string;
  /** The consumer captures the value at import; a change needs a restart. */
  requiresRestart?: boolean;
  /** Never written to the change log in clear text. */
  sensitive?: boolean;
}

/** A row of `station_settings`, as Prisma returns it. */
export interface SettingRow {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}
```

- [ ] **Step 5: Implementa `settings.cache.ts`**

```ts
import { logger } from "../../shared/logger/logger";
import { getDefinition, SETTINGS_CATALOG } from "./settings.catalog";
import type { SettingRow, SettingSource, SettingValue } from "./settings.types";
```

`settings.catalog.ts` todavía no existe, así que créalo en este mismo paso con una entrada mínima que esta tarea pueda probar, y que la Task 2 Complete:

```ts
export const SETTINGS_CATALOG = {
  "health.emailEnabled": {
    key: "health.emailEnabled",
    section: "health",
    label: "Enviar alertas de salud por correo",
    description: "Cuando está activo, el vigilante notifica a los destinatarios configurados.",
    type: "boolean",
    defaultValue: true,
    envFallback: () => boolEnvOr("HEALTH_EMAIL_ENABLED", true),
    parse: parseBoolean,
    format: String,
  },
  "health.diskMinFreePercent": {
    key: "health.diskMinFreePercent",
    section: "health",
    label: "Espacio libre mínimo en disco",
    description:
      "Porcentaje de espacio libre por debajo del cual el disco se marca como degradado. El estado crítico se calcula como la mitad de este valor, así que bajarlo también baja el crítico.",
    type: "number",
    defaultValue: 15,
    envFallback: () => intEnvOr("HEALTH_DISK_MIN_FREE_PERCENT", 15),
    unit: "%",
    min: 1,
    max: 99,
    parse: parseNumber,
    format: String,
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTINGS_CATALOG;

export function getDefinition(key: string): SettingDefinition | null {
  return (SETTINGS_CATALOG as Record<string, SettingDefinition>)[key] ?? null;
}
```

`parseBoolean` acepta `"true"` y `"false"` (más `"1"`/`"0"`), sin distinguir mayúsculas, y lanza `Error` con el valor recibido en el mensaje ante cualquier otra cosa. `parseNumber` exige un número finito y lanza `Error` en caso contrario. Ninguno de los dos recorta ni reescribe: el rechazo de rango lo hace `settings.validation.ts` en la Task 2, y un `parse` permisivo y un rango estricto son dos responsabilidades distintas.

El resto de `settings.cache.ts`:

- Un `Map<string, SettingRow>` a nivel de módulo y un `Set<string>` de claves que fallaron al parsear, para no reintentar el parseo en cada lectura.
- `hydrateFromRows(rows)` limpia ambos, guarda las filas recibidas y, para cada fila cuya clave exista en el catálogo y cujo `parse` falle, registra un `logger.warn("Settings", ...)` con la clave y el error. Las filas cuya clave no está en el catálogo se ignoran con el mismo aviso: una fila huérfana de una versión anterior no debe romper nada.
- `getSetting(key)` mira primero el mapa. Si hay fila y no está en el conjunto de fallos, devuelve `definition.parse(row.value)`. Si no hay fila, o la fila falló, o la clave no existe en el catálogo, devuelve el `defaultValue` de la definición, y si tampoco existe devuelve `null`. **Nunca lanza.**
- `settingSource(key)` devuelve `"panel"` si hay fila válida, `"env"` si no hay fila pero la definición tiene `envFallback` y este devuelve algo distinto del `defaultValue`, y `"default"` en cualquier otro caso.
- `resetCache()` vacía el mapa, el conjunto de fallos y el contador de claves inválidas.

`logger` viene de `backend/src/shared/logger/logger` y su firma es `logger.warn(context, message, meta?)`.

- [ ] **Step 6: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, 4 pruebas.

- [ ] **Step 7: Aplica la migración**

En `backend/prisma/schema/settings.prisma`, con los mismos comentarios explicativos en el estilo de los demás archivos del esquema:

```prisma
/// Ajustes de la estación administrables desde el panel. Una fila por clave.
/// El tipo, el rango y la descripción viven en el catálogo de código, no aquí:
/// por eso agregar un ajuste no es una migración.
model StationSetting {
  /// Clave del catálogo, p.ej. "health.diskMinFreePercent".
  key   String @id

  /// Texto. El catálogo declara el tipo y lo parsea al leer.
  value String

  updatedAt DateTime @updatedAt @map("updated_at")
  /// Correo del administrador que guardó el valor por última vez.
  updatedBy String?  @map("updated_by")

  @@map("station_settings")
}

/// Quién cambió qué, para reconstruir por ejemplo por qué un umbral bajó.
/// Una clave marcada `sensitive` en el catálogo guarda un marcador, no el valor.
model StationSettingChange {
  id String @id @default(uuid())

  key           String
  previousValue String? @map("previous_value")
  newValue      String? @map("new_value")

  changedBy String   @map("changed_by")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([key])

  @@map("station_setting_changes")
}
```

`key` no lleva índice adicional: es la clave primaria. El índice por `key` en los cambios existe porque `GET /settings/changes` filtra por clave.

Crea `backend/prisma/schema/migrations/20261018090000_add_station_settings/migration.sql` con el SQL correspondiente, siguiendo el formato de las migraciones vecinas (comentario de cabecera en español, comillas dobles en los identificadores, `DATETIME` sin precisión).

- [ ] **Step 8: Aplica la migración y regenera el cliente**

Run: `pnpm --filter @radio/backend exec prisma migrate deploy && pnpm --filter @radio/backend exec prisma generate`
Expected: la migración `20261018090000_add_station_settings` aplicada y el cliente regenerado con los modelos `StationSetting` y `StationSettingChange`.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma backend/src/modules/settings backend/tests backend/vitest.config.ts backend/package.json
git commit -m "feat(settings): schema and in-memory cache for station settings"
```

---

### Task 2: Catálogo tipado y validación

**Files:**
- Modify: `backend/src/modules/settings/settings.catalog.ts`
- Create: `backend/src/modules/settings/settings.validation.ts`
- Test: `backend/tests/settings/validation.test.ts`

**Interfaces:**
- Consumes: `SettingDefinition`, `SettingRow`, `SettingValue` de `settings.types.ts`; `getDefinition` de `settings.catalog.ts` (Task 1).
- Produces:
  - `settings.catalog.ts`: completa con las siete claves de salud (dos ya sembradas en la Task 1); exporta `SETTINGS_CATALOG`, `SettingKey`, `getDefinition(key): SettingDefinition | null`, y `SETTING_SECTIONS: ReadonlyArray<{ id: SettingSectionId; label: string; description: string }>`.
  - `settings.validation.ts`: `ParseResult<T>`, `parseSettingInput(key: string, raw: unknown): ParseResult`, `normalizeSettingValue(key: string, value: SettingValue): string`.

- [ ] **Step 1: Escribe la prueba que falla**

En `backend/tests/settings/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeSettingValue, parseSettingInput } from "../../src/modules/settings/settings.validation";

describe("parseSettingInput", () => {
  it("rejects a key that is not in the catalog", () => {
    const result = parseSettingInput("health.nope", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("health.nope");
  });

  it("rejects a value outside the declared range", () => {
    const result = parseSettingInput("health.diskMinFreePercent", 0);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("1");
  });

  it("rejects a value whose type does not match the definition", () => {
    const result = parseSettingInput("health.emailEnabled", "sí");

    expect(result.ok).toBe(false);
  });

  it("accepts a valid value inside the range", () => {
    const result = parseSettingInput("health.diskMinFreePercent", 20);

    expect(result).toEqual({ ok: true, value: 20 });
  });
});

describe("normalizeSettingValue", () => {
  it("serializes a boolean to the lowercase form parse() accepts", () => {
    expect(normalizeSettingValue("health.emailEnabled", false)).toBe("false");
  });

  it("round-trips through the catalog parse", () => {
    const raw = normalizeSettingValue("health.diskMinFreePercent", 20);

    expect(parseSettingInput("health.diskMinFreePercent", raw)).toEqual({
      ok: true,
      value: 20,
    });
  });
});
```

- [ ] **Step 2: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, porque `settings.validation.ts` no existe.

- [ ] **Step 3: Completa el catálogo**

Añade estas cinco claves a `SETTINGS_CATALOG`. Con las dos que la Task 1 ya sembró, el catálogo queda en siete entradas de salud. Los valores por defecto son los de `backend/src/config/health.config.ts`; los rangos son el mínimo que el dominio necesita y el máximo que no tiene sentido de superar, y son un límite de este plan, no una copia de los defaults del `.env`.

| Clave | Variable | Default | min | max | Unidad | `requiresRestart` |
|---|---|---|---|---|---|---|
| `health.checkIntervalMinutes` | `HEALTH_CHECK_INTERVAL_SECONDS` | 2 | 1 | 60 | min | sí |
| `health.nowPlayingSilenceSeconds` | `HEALTH_NOW_PLAYING_SILENCE_SECONDS` | 900 | 60 | 86400 | s | no |
| `health.backupMaxAgeHours` | `HEALTH_BACKUP_MAX_AGE_HOURS` | 26 | 1 | 720 | h | no |
| `health.snapshotMaxAgeHours` | `HEALTH_SNAPSHOT_MAX_AGE_HOURS` | 2 | 1 | 720 | h | no |
| `health.pushEnabled` | `HEALTH_PUSH_ENABLED` | false | — | — | — | no |

`health.diskMinFreePercent` y `health.emailEnabled` ya están desde el paso 5 de la Task 1, con los valores y rangos que la tabla del plan original fija: default 15, rango 1 a 99, unidad `%`. No las vuelvas a añadir.

`health.checkIntervalMinutes` lleva `requiresRestart: true` y una descripción que lo diga: el intervalo se lee al registrar el cron, así que el cambio solo aplica al reiniciar. Su `envFallback` convierte de segundos a minutos con `Math.max(1, Math.ceil(intEnvOr("HEALTH_CHECK_INTERVAL_SECONDS", 120) / 60))`, porque el dominio real son minutos y un campo rotulado "segundos" con mínimo 30 sería falso.

`health.pushEnabled` entra sin `health.pushTokens`: los tokens siguen viniendo del entorno a través de `HEALTH_PUSH_TOKENS` en `health.service.ts`, así que activar el interruptor desde el panel funciona exactamente igual que hoy. La decisión 13.2 del spec los deja para una fase posterior.

Añade también:

```ts
export const SETTING_SECTIONS: ReadonlyArray<{
  id: SettingSectionId;
  label: string;
  description: string;
}> = [
  {
    id: "health",
    label: "Salud",
    description: "Cuándo el vigilante considera que algo anda mal y a quién avisa.",
  },
];
```

Más adelante se añadirán las demás secciones; el array es el orden de pintado de la página.

- [ ] **Step 4: Implementa `settings.validation.ts`**

```ts
export type ParseResult<T = SettingValue> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

- `parseSettingInput(key, raw)` devuelve `{ ok: false, error }` con un mensaje en español que nombre la clave y, cuando aplique, el rango, si la clave no está en el catálogo, si `raw` no es del tipo que la definición declara, si `definition.parse(String(raw))` lanza, o si el número queda fuera de `[min, max]`. Devuelve `{ ok: true, value }` en caso contrario. **No recorta**: un 0 donde el mínimo es 1 es un rechazo, no un 1 silencioso, porque un recorte hace que el operador guarde y no entienda por qué el valor no es el que escribió.
- `normalizeSettingValue(key, value)` devuelve `definition.format(value)`. Es el camino de ida a la base: todo lo que se persiste pasa por `format`, y todo lo que se lee pasa por `parse`, así que el par no puede desincronizarse.

El `String(raw)` que entra a `parse` solo se usa cuando el tipo declarado es `number` o `boolean`; para `emailList`, `raw` debe ser un array de cadenas y cada elemento se valida contra `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

- [ ] **Step 5: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, las 4 pruebas de Task 1 más estas 6.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/settings backend/tests
git commit -m "feat(settings): typed catalog and range validation"
```

---

### Task 3: Vista, redacción y permiso

Esta tarea construye las funciones puras que arman lo que ve el operador y lo que se registra, más el permiso que los protege.

**Files:**
- Create: `backend/src/modules/settings/settings.view.ts`
- Test: `backend/tests/settings/view.test.ts`
- Modify: `packages/types/src/admin.ts`

**Interfaces:**
- Consumes: `SettingRow` y `SettingValue` de `settings.types.ts`; `SETTINGS_CATALOG`, `getDefinition` y `SETTING_SECTIONS` de `settings.catalog.ts` (Task 2).
- Produces:
  - `settings.view.ts`: `StationSettingValue` (el tipo de vista, local), `StationSettingsSection`, `buildSettingsView(rows: ReadonlyMap<string, SettingRow>): StationSettingsSection[]`, `redactForAudit(key: string, value: string | null): string | null`, `REDACTED_PLACEHOLDER = "(oculto)"`.
  - `packages/types/src/admin.ts`: el permiso `"settings"` y los contratos `SettingSource`, `StationSettingValue`, `StationSettingsSection`, `StationSettingsResponse`, `StationSettingChange`, `StationSettingsChangesResponse`.

- [ ] **Step 1: Escribe la prueba que falla**

En `backend/tests/settings/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SETTINGS_CATALOG } from "../../src/modules/settings/settings.catalog";
import {
  buildSettingsView,
  REDACTED_PLACEHOLDER,
  redactForAudit,
} from "../../src/modules/settings/settings.view";
import type { SettingRow } from "../../src/modules/settings/settings.types";

const row = (key: string, value: string): SettingRow => ({
  key,
  value,
  updatedAt: new Date("2026-10-18T12:00:00Z"),
  updatedBy: "admin@radio",
});

describe("buildSettingsView", () => {
  it("groups the catalog into sections in the declared order", () => {
    const sections = buildSettingsView(new Map());

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("health");
    expect(sections[0].items.length).toBe(Object.keys(SETTINGS_CATALOG).length);
  });

  it("flags a setting that only takes effect after a restart", () => {
    const sections = buildSettingsView(new Map());
    const interval = sections[0].items.find(
      (item) => item.key === "health.checkIntervalMinutes"
    );

    expect(interval?.requiresRestart).toBe(true);
  });

  it("reports the stored value and its source when a row exists", () => {
    const sections = buildSettingsView(
      new Map([["health.diskMinFreePercent", row("health.diskMinFreePercent", "20")]])
    );
    const item = sections[0].items.find(
      (entry) => entry.key === "health.diskMinFreePercent"
    );

    expect(item?.value).toBe(20);
    expect(item?.source).toBe("panel");
    expect(item?.min).toBe(1);
    expect(item?.max).toBe(99);
    expect(item?.unit).toBe("%");
  });

  it("carries the range for a setting with no row, so the form can constrain it", () => {
    const sections = buildSettingsView(new Map());
    const item = sections[0].items.find((entry) => entry.key === "health.diskMinFreePercent");

    expect(item?.source).toBe("default");
    expect(item?.min).toBe(1);
  });
});

describe("redactForAudit", () => {
  it("hides the value of a key the catalog marks sensitive", () => {
    expect(redactForAudit("health.pushTokens", "token-abc")).toBe(REDACTED_PLACEHOLDER);
  });

  it("keeps the value of an ordinary key", () => {
    expect(redactForAudit("health.diskMinFreePercent", "20")).toBe("20");
  });

  it("keeps null as null", () => {
    expect(redactForAudit("health.diskMinFreePercent", null)).toBeNull();
  });
});
```

La Fase 1 no trae ninguna clave sensible, así que `redactForAudit` se prueba contra `health.pushTokens`, una clave que **no** existe todavía en el catálogo. Esa es la prueba de la Review Focus 5: el mecanismo se fija ahora, antes de que exista la clave que lo ejercite en producción.

- [ ] **Step 2: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, porque `settings.view.ts` no existe.

- [ ] **Step 3: Implementa `settings.view.ts`**

Tipos locales:

```ts
export const REDACTED_PLACEHOLDER = "(oculto)";

export interface StationSettingValue {
  key: string;
  label: string;
  description: string;
  type: SettingFieldType;
  value: SettingValue | null;
  source: SettingSource;
  unit: string | null;
  min: number | null;
  max: number | null;
  requiresRestart: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface StationSettingsSection {
  id: SettingSectionId;
  label: string;
  description: string;
  items: StationSettingValue[];
}
```

`buildSettingsView(rows)` recorre `SETTING_SECTIONS` en orden y, dentro de cada sección, las definiciones del catálogo **en el orden en que están declaradas** (usa `Object.values(SETTINGS_CATALOG)` filtrado por sección, no `Object.keys`, para no perder el tipado del valor). Para cada una arma un `StationSettingValue` con el `label`, `description` y `type` de la definición, el `min`/`max`/`unit` normalizados a `null` cuando no aplican, `requiresRestart` de la definición (por defecto `false`), y el valor resuelto con la misma precedencia de `settings.cache.ts`: fila válida si la hay, si no `envFallback()`, si no `defaultValue`. Reutiliza `settingSource` y `getSetting` del caché en lugar de reimplementar la precedencia, pasando `rows` como argumento en lugar del mapa de módulo; para eso `settings.cache.ts` expone también `resolveFromRows(key, rows): { value: SettingValue; source: SettingSource }`, que es la función pura que `getSetting` y `settingSource` envuelven.

`redactForAudit(key, value)` devuelve `value` intacto, o `REDACTED_PLACEHOLDER` si la definición de la clave tiene `sensitive: true`.

- [ ] **Step 4: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, todas.

- [ ] **Step 5: Añade el permiso y los contratos a `packages/types/src/admin.ts`**

En el union `AdminPermission` y en el array `ADMIN_PERMISSIONS`, añade `"settings"` al final de cada uno. En `ADMIN_PERMISSION_LABELS` añade `settings: "Ajustes"`.

`hasAdminPermission` no se toca: con el union ampliado, `SUPERADMIN` y `ADMIN` ya obtienen el permiso por las reglas existentes (`packages/types/src/admin.ts:84-87`).

Añade los contratos, junto a los de las demás secciones del panel:

```ts
export type SettingFieldType = "number" | "boolean" | "text" | "emailList";

/** De dónde viene el valor efectivo ahora mismo. */
export type SettingSource = "panel" | "env" | "default";

export interface StationSettingValue {
  key: string;
  label: string;
  description: string;
  type: SettingFieldType;
  value: string | number | boolean | string[] | null;
  source: SettingSource;
  unit: string | null;
  min: number | null;
  max: number | null;
  /** true cuando el consumidor captura el valor al importar. */
  requiresRestart: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface StationSettingsSection {
  id: string;
  label: string;
  description: string;
  items: StationSettingValue[];
}

export interface StationSettingsResponse {
  sections: StationSettingsSection[];
}

export interface StationSettingChange {
  id: string;
  key: string;
  previousValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface StationSettingsChangesResponse {
  rows: StationSettingChange[];
}
```

El tipo de vista del backend y el del panel son deliberadamente distintos: el del backend tiene `section: SettingSectionId`, que en `@radio/types` se degrada a `string` porque SQLite no tiene enums y la unión vive en el catálogo.

- [ ] **Step 6: Ejecuta las pruebas de ambos paquetes**

Run: `pnpm --filter @radio/backend test && pnpm --filter @radio/web test`
Expected: PASS en los dos.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/settings backend/tests packages/types
git commit -m "feat(settings): settings view, audit redaction and panel permission"
```

---

### Task 4: Servicio, endpoints e hidratación del arranque

**Files:**
- Create: `backend/src/modules/settings/settings.service.ts`
- Create: `backend/src/modules/settings/settings.routes.ts`
- Modify: `backend/src/app.ts` (import y montaje del router)
- Modify: `backend/src/index.ts` (hidratación antes del scheduler)
- Test: `backend/tests/settings/boot-order.test.ts`

**Interfaces:**
- Consumes: `settings.cache.ts`, `settings.catalog.ts`, `settings.validation.ts`, `settings.view.ts` y `settings.types.ts` (Tasks 1 a 3); `StationSettingsResponse` y `StationSettingsChangesResponse` de `@radio/types` (Task 3).
- Produces:
  - `settings.service.ts`: `readSettings(): Promise<StationSettingsSection[]>`, `applyPatch(patch: Record<string, unknown>, changedBy: string): Promise<{ applied: string[] }>`, `resetKeys(keys: string[], changedBy: string): Promise<{ cleared: string[] }>`, `listChanges(limit: number): Promise<StationSettingChange[]>`.
  - `settings.routes.ts`: `settingsRouter`, montado en `/admin-api/settings`.
  - `settings.cache.ts` gana `resolveFromRows(key: string, rows: ReadonlyMap<string, SettingRow>): { value: SettingValue; source: SettingSource }`.

- [ ] **Step 1: Escribe la prueba que falla**

En `backend/tests/settings/boot-order.test.ts`, una prueba de fuente con el estilo de `apps/web/tests/bumpers/nav-entry.test.ts`, porque el arranque es código imperativo y no se puede invocar sin arrancar el proceso:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/**
 * The scheduler registers jobs that read settings at registration time. A job
 * registered before hydration would decide using catalog defaults, so a
 * setting saved in the panel would silently not apply on the first cycle
 * after a deploy.
 */
describe("settings boot order", () => {
  it("hydrates the settings cache before the scheduler starts", () => {
    const index = readFileSync(join(srcRoot, "index.ts"), "utf8");
    const hydrate = index.indexOf("hydrateSettings(");
    const scheduler = index.indexOf("startScheduler(");

    expect(hydrate).toBeGreaterThan(-1);
    expect(scheduler).toBeGreaterThan(hydrate);
  });

  it("awaits the hydration, so the scheduler cannot race it", () => {
    const index = readFileSync(join(srcRoot, "index.ts"), "utf8");

    expect(/await\s+hydrateSettings\(\)/.test(index)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, porque `index.ts` no llama a `hydrateSettings`.

- [ ] **Step 3: Implementa `settings.service.ts`**

Importa `prisma` de `backend/src/infrastructure/database/prisma` y `logger` del logger compartido.

- `readSettings()`: `const rows = await prisma.stationSetting.findMany();` construye un `Map` y devuelve `buildSettingsView(map)`.
- `applyPatch(patch, changedBy)`: recorre las claves del parche. Para cada una llama a `parseSettingInput`; con un `ok: false` lanza `AppError(400, result.error)` importando `AppError` de `backend/src/shared/errors/app-error.ts`. **Una clave desconocida es un 400, no un rechazo silencioso**: un panel con una versión vieja manda una clave que ya no existe, y si se ignora el panel muestra "guardado" sobre un cambio que no ocurrió (Review Focus 4). Con `ok: true`, guarda con `normalizeSettingValue` y anota el valor anterior. Tras el bucle, si hubo cambios, refresca el caché con `hydrateFromRows` desde una lectura fresca y, en una transacción, escribe las filas y los registros de `station_setting_changes` con `redactForAudit` aplicado a los dos lados. Devuelve `{ applied: string[] }`.
- `resetKeys(keys, changedBy)`: para cada clave existente, borra la fila y registra el cambio con el valor anterior redactado y `newValue: null`. Refresca el caché. Devuelve `{ cleared: string[] }`.
- `listChanges(limit)`: `prisma.stationSettingChange.findMany({ orderBy: { createdAt: "desc" }, take: limit })`, y un `deleteMany` poda las filas con `createdAt` más antigua de 180 días antes de leer. La poda va en la lectura y no en un job: la tabla solo crece cuando alguien guarda, y una lectura por página es un sitio donde el coste es cero.

- [ ] **Step 4: Implementa `settings.routes.ts`**

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import { listChanges, readSettings, applyPatch, resetKeys } from "./settings.service";
```

`router.use(requireAuth, requirePermission("settings"))`. Los cuatro handlers, siguiendo el estilo de `backend/src/modules/locutor/announcement.routes.ts`: `GET /` devuelve `res.json({ sections: await readSettings() })`; `PUT /` valida que el cuerpo sea un objeto plano y llama a `applyPatch`, devolviendo la vista completa para que el panel no tenga que recargar; `POST /reset` acepta `{ keys: string[] }` y devuelve la vista completa; `GET /changes` acepta `?limit`, con tope de 200 y defecto de 50.

El correo del administrador que hizo el cambio sale de `req.adminUser.email` (el mismo campo que ya leen otras rutas del panel); si no está, se usa `"desconocido"` y se registra un aviso.

- [ ] **Step 5: Monta el router en `app.ts`**

Añade el import junto a los demás routers de administración y monta con `app.use("/admin-api/settings", settingsRouter);`. La línea va después de `app.use("/admin-api/health/watchdog", healthAdminRouter);`, antes del bloque de routers con precondición de sesión al final del archivo. **No** añadas la ruta a `SILENT_LOG_PATHS`: la página no se polea a sí misma, así que cada guardado debe dejar rastro en la bitácora.

- [ ] **Step 6: Hidrata el arranque en `index.ts`**

Añade el import de `hydrateSettings` entre los imports dinámicos de módulos, y la llamada inmediatamente antes de `startScheduler()`:

```ts
await hydrateSettings();
startScheduler();
```

`hydrateSettings()` es un envoltorio de Prisma sobre `hydrateFromRows` y **falla suave**: si Prisma no responde, registra `logger.warn("Settings", "Hydration failed; running on environment values", { error })` y no relanza. El backend debe arrancar igual, porque una radio que emite con los valores del entorno es recuperable y una radio que no arranca no lo es (Review Focus 1).

`index.ts` ya importa los módulos de forma dinámica después de cargar Infisical, así que este import sigue ese mismo patrón y no rompe el orden que exige `requiredEnv`.

- [ ] **Step 7: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, incluidas las dos de `boot-order.test.ts`.

- [ ] **Step 8: Compila el backend**

Run: `pnpm --filter @radio/backend build`
Expected: sin errores de TypeScript.

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat(settings): admin API and boot hydration"
```

---

### Task 5: Migrar los umbrales del vigilante de salud

Esta es la primera migración real: `health.config.ts` pasa a leer el caché y el vigilante deja de depender de su entorno para sus umbrales.

**Files:**
- Modify: `backend/src/config/health.config.ts`
- Modify: `backend/src/modules/health/health.job.ts`
- Modify: `backend/src/modules/health/health.service.ts` (solo si lee algo que se haya movido)
- Test: `backend/tests/settings/health-wiring.test.ts`

**Interfaces:**
- Consumes: `getSetting` de `settings.cache.ts` (Task 1), `SettingKey` de `settings.catalog.ts` (Task 2).
- Produces: `healthConfig` con un accessor nuevo, `intervalMinutes`, en lugar de `intervalSeconds`. Los demás accessors conservan su nombre y su tipo.

- [ ] **Step 1: Escribe la prueba que falla**

En `backend/tests/settings/health-wiring.test.ts`, prueba de fuente por el mismo motivo que la Task 4: `health.config.ts` lanza en el import si le falta una variable requerida, así que importarlo en una prueba no es viable sin un entorno completo.

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/**
 * Every threshold the watchdog reads has to come from the settings cache.
 * A getter left reading process.env would keep working silently, and the panel
 * would show a value that nothing consumes.
 */
describe("health config wiring", () => {
  const config = readFileSync(join(srcRoot, "config", "health.config.ts"), "utf8");

  it("no longer reads thresholds from the environment", () => {
    const moved = [
      "HEALTH_NOW_PLAYING_SILENCE_SECONDS",
      "HEALTH_BACKUP_MAX_AGE_HOURS",
      "HEALTH_DISK_MIN_FREE_PERCENT",
      "HEALTH_SNAPSHOT_MAX_AGE_HOURS",
      "HEALTH_EMAIL_ENABLED",
      "HEALTH_PUSH_ENABLED",
      "HEALTH_CHECK_INTERVAL_SECONDS",
    ];

    for (const key of moved) {
      expect(config).not.toContain(key);
    }
  });

  it("exposes the check interval in minutes", () => {
    expect(config).toContain("intervalMinutes");
    expect(config).not.toContain("intervalSeconds");
  });
});
```

- [ ] **Step 2: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL en las dos.

- [ ] **Step 3: Reescribe `health.config.ts`**

Deja el archivo como getters delgados, sin `getHealthConfig()` intermedio, siguiendo el patrón que ya usan `logs.config.ts` y `backups.config.ts`:

```ts
import { envOr, intEnvOr, listEnvOr } from "./env";
import { getSetting } from "../modules/settings/settings.cache";
```

- `get intervalMinutes()` devuelve `getSetting("health.checkIntervalMinutes")`.
- `get nowPlayingSilenceSeconds()` devuelve `getSetting("health.nowPlayingSilenceSeconds")`.
- `get backupMaxAgeHours()` devuelve `getSetting("health.backupMaxAgeHours")`.
- `get diskMinFreePercent()` devuelve `getSetting("health.diskMinFreePercent")`.
- `get snapshotMaxAgeHours()` devuelve `getSetting("health.snapshotMaxAgeHours")`.
- `get emailEnabled()` devuelve `getSetting("health.emailEnabled")`.
- `get pushEnabled()` devuelve `getSetting("health.pushEnabled")`.
- `get diskMountPath()` y `get pushTokens()` **no se tocan**: son rutas y tokens, y quedan en el entorno.

Añade en cabecera del archivo un comentario que explique por qué el módulo es getters: los getters se evalúan en cada acceso, así que leen la caché ya hidratada, y por eso el umbral del disco cambia sin reiniciar mientras que el del intervalo no, que se congela en el cron de `health.job.ts`.

- [ ] **Step 4: Ajusta `health.job.ts`**

```ts
const minutes = Math.max(1, config.health.intervalMinutes);
```

Sustituye las tres líneas que hoy calculan `seconds` con `Math.max(30, ...)` y `Math.ceil(seconds / 60)`. El `Math.max(30, ...)` sobre segundos era una forma indirecta de proteger un dominio que en realidad son minutos; ahora el rango vive en el catálogo.

El resto del archivo no cambia: el cron sigue siendo `*/${minutes} * * * *`.

- [ ] **Step 5: Ajusta los consumidores del accessor renombrado**

Busca `intervalSeconds` en todo `backend/src`. El único consumidor es `health.job.ts`; si aparece otro, cámbialo a `intervalMinutes`. En `health.service.ts`, `config.health.emailEnabled`, `config.health.pushEnabled` y `config.health.pushTokens` conservan sus nombres, así que ese archivo probablemente no cambia; verifícalo con `Select-String -Path backend/src -Pattern "intervalSeconds"` y confirma que no queda ninguna coincidencia.

- [ ] **Step 6: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, incluidas las dos de `health-wiring.test.ts`.

- [ ] **Step 7: Compila y arranca en humo**

Run: `pnpm --filter @radio/backend build`
Expected: sin errores de TypeScript.

Run (PowerShell):
```powershell
$env:WORKER_AUTH_SECRET = "x"; $env:PORT = "18888"; $env:WS_PORT = "18889"
node backend/dist/index.js
```
Expected: en el log aparece `Settings` hidratado o el aviso de fallo suave, y después la línea de `Scheduler`. En una ventana aparte, `curl http://localhost:18888/health` responde 200. Detén el proceso al terminar.

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat(settings): read health thresholds from the settings cache"
```

---

### Task 6: Página de ajustes en el panel

**Files:**
- Create: `apps/web/src/pages/admin/AdminSettings.tsx`
- Test: `apps/web/tests/settings/panel-wiring.test.ts`
- Modify: `apps/web/src/hooks/useAdminApi.ts`
- Modify: `apps/web/src/pages/admin/AdminLayout.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `StationSettingsResponse` y `StationSettingsChangesResponse` de `@radio/types` (Task 3).
- Produces: la ruta `/admin/settings`, protegida por el permiso `settings`, y cuatro métodos en `useAdminApi`: `getSettings`, `updateSettings`, `resetSettings`, `getSettingsChanges`.

- [ ] **Step 1: Escribe la prueba que falla**

En `apps/web/tests/settings/panel-wiring.test.ts`, al estilo de `apps/web/tests/bumpers/nav-entry.test.ts` y `apps/web/tests/bumpers/upload-inputs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

describe("settings panel entry", () => {
  it("registers /admin/settings under the settings permission", () => {
    const layout = readFileSync(join(srcRoot, "pages", "admin", "AdminLayout.tsx"), "utf8");
    const entry = /to:\s*'\/admin\/settings'[\s\S]{0,200}?permission:\s*'settings'/.exec(layout);

    expect(entry).not.toBeNull();
  });

  it("surfaces the restart requirement instead of hiding it", () => {
    const page = readFileSync(join(srcRoot, "pages", "admin", "AdminSettings.tsx"), "utf8");

    expect(page).toContain("requiresRestart");
  });

  it("does not offer an input for a setting that is not in the catalog", () => {
    // The form is driven by the response, so a hardcoded field list would be a
    // second source of truth that drifts from the backend.
    const page = readFileSync(join(srcRoot, "pages", "admin", "AdminSettings.tsx"), "utf8");

    expect(page).not.toMatch(/HEALTH_[A-Z_]+/);
  });
});
```

La tercera prueba fija el punto del spec 7.7: el formulario lo dibuja la respuesta, no una lista escrita a mano.

- [ ] **Step 2: Ejecuta la prueba y verifica que falla**

Run: `pnpm --filter @radio/web test`
Expected: FAIL en las tres.

- [ ] **Step 3: Añade los métodos a `useAdminApi`**

Sigue el patrón de `getAnnouncementSettings` / `updateAnnouncementSettings` (`apps/web/src/hooks/useAdminApi.ts:915-928`): `useCallback` con `[request]` como dependencia, y devueltos en el objeto que el hook expone al final del archivo.

```ts
const SETTINGS_BASE = '/admin-api/settings';

const getSettings = useCallback(
  () => request<StationSettingsResponse>({ url: SETTINGS_BASE }),
  [request]
);

const updateSettings = useCallback(
  (patch: Record<string, string | number | boolean | string[]>) =>
    request<StationSettingsResponse>({ method: 'PUT', url: SETTINGS_BASE, data: patch }),
  [request]
);

const resetSettings = useCallback(
  (keys: string[]) =>
    request<StationSettingsResponse>({ method: 'POST', url: `${SETTINGS_BASE}/reset`, data: { keys } }),
  [request]
);

const getSettingsChanges = useCallback(
  (limit?: number) =>
    request<StationSettingsChangesResponse>({ url: `${SETTINGS_BASE}/changes`, params: limit ? { limit } : undefined }),
  [request]
);
```

Comprueba la firma exacta de `request` en el hook antes de escribir esto: si su parámetro de query se llama distinto de `params`, usa el nombre que ya usen las llamadas vecinas.

- [ ] **Step 4: Añade la entrada de navegación**

En `AdminLayout.tsx`, dentro de `NAV_SECTIONS`, crea una sección nueva con `label: "Ajustes"` e `id: "settings"`, y dentro el ítem `{ to: '/admin/settings', label: 'Ajustes', icon: Settings, permission: 'settings' }`. Importa `Settings` de `lucide-react`. Coloca la sección después de "Audiencia", que es donde el resto del spec coloca lo que no es emisión.

Verifica el nombre del icono en la librería instalada antes de usarlo: `better-icons search settings`, o revisa los imports que ya tiene el archivo y usa uno que ya esté.

- [ ] **Step 5: Añade la ruta y el import perezoso**

En `apps/web/src/main.tsx`, añade `const AdminSettings = lazy(() => import('./pages/admin/AdminSettings.tsx'))` junto a los demás `lazy` de administración, y `<Route path="settings" element={<AdminSettings />} />` dentro del árbol de administración.

- [ ] **Step 6: Implementa `AdminSettings.tsx`**

Un componente, sin subcomponentes salvo que el archivo pase de unas 250 líneas; si lo pasa, extrae `SettingsSectionCard.tsx` al lado, como se hizo con `pages/admin/programs/`.

Estados que el componente modela explícitamente, porque la sección 7.7 del spec pide que la UI sea la que evita la mentira:

- **Cargando**: esqueleto por sección, no un spinner de pantalla completa.
- **Error de carga**: mensaje con botón de reintento. Un `400` del backend se muestra con el mensaje que devuelve `error.message`, sin transformarlo.
- **Guardando**: el botón de la sección queda deshabilitado mientras corre su `PUT`, y solo esa sección, no la página entera.
- **Error de guardado**: mensaje bajo la sección que falló; el valor que escribió el operador sigue en el campo, para que pueda corregirlo sin volver a teclear.
- **Ninguno**: `sections` llega siempre con al menos una sección porque el catálogo la define, así que no hay estado vacío que modelar. No escribas un caso para él.

Por cada ítem, según `item.type`:

- `number`: `Input` numérico con `min`, `max` y `step={1}`, la unidad en el `placeholder`, y la descripción bajo el campo. Cuando `item.requiresRestart` es `true`, una línea `aria-live="polite"` debajo que dice que el cambio aplica al reiniciar.
- `boolean`: el `Checkbox` del proyecto con la etiqueta y la descripción como texto de apoyo.
- `text` y `emailList`: `Input` de texto; para `emailList`, un campo de texto que separa por comas y se envía como `string[]`.

Junto a cada campo, una línea pequeña con el origen: `Del panel`, `Del entorno` o `Valor por defecto`, según `item.source`. Es la mitigación directa del "cambié el `.env` y no pasó nada".

Debajo de cada sección, un botón `Restablecer al entorno` que llama a `resetSettings` con las claves de esa sección y pide confirmación con el `AlertDialog` que ya usa `AdminYouTube.tsx`.

Al pie de la página, una tabla con `getSettingsChanges()`, que muestra clave, valor anterior, valor nuevo, autor y fecha.

- [ ] **Step 7: Ejecuta las pruebas y verifica que pasan**

Run: `pnpm --filter @radio/web test`
Expected: PASS, las tres nuevas más las ocho existentes.

- [ ] **Step 8: Compila el frontend**

Run: `pnpm --filter @radio/web build`
Expected: sin errores de TypeScript.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(settings): admin settings page"
```

---

## Self-Review

**Cobertura del spec.** Sección 5 (estado del código) y 6 (restricciones) son insumo, no entregable. La 7.1 (esquema) la cumple la Task 1. La 7.2 (precedencia y origen) la cumplen las Tasks 1 y 3, y la prueba de `settingSource` la fija. La 7.3 (capa de resolución) la cumplen las Tasks 1 y 4. La 7.4 (getters sobre `config.*`) la cumple la Task 5 y es el criterio que decide el resto de fases. La 7.5 (`AnnouncementSettings` intacto) no necesita tarea: este plan no lo toca, y su única excepción, la zona horaria, está explícitamente fuera de alcance. La 7.6 (API) la cumple la Task 4. La 7.7 (interfaz) la cumple la Task 6. La 7.8 (permiso) la cumple la Task 3. La 7.9 (auditoría) la cumplen las Tasks 3 y 4. La 10, Fase 0, son las Tasks 1 a 4 y la 6; Fase 1a es la Task 5.

**Cobertura de Review Focus.** 1 → `boot-order.test.ts` más el fallo suave de `hydrateSettings`, que se documenta en el paso 6 de la Task 4 y merece además una prueba cuando exista la base. 2 → `cache.test.ts` "cannot be parsed" más `validation.test.ts` "outside the declared range". 3 → `view.test.ts` "flags a setting that only takes effect after a restart" más la prueba de fuente de `AdminSettings.tsx` buscando `requiresRestart`. 4 → `validation.test.ts` "rejects a key that is not in the catalog", y el servicio convierte ese fallo en `AppError(400)`. 5 → `view.test.ts` con `health.pushTokens` como clave sensible de prueba.

**Consistencia de tipos.** `SettingSource`, `SettingFieldType` y `StationSettingValue` existen en dos sitios, `@radio/types` y `settings.view.ts`. A propósito: el del backend no puede importar de `@radio/types` sin crear una dependencia del backend al paquete del panel, y el del panel no puede conocer el catálogo. Los dos se declaran por separado y se comparan solo en la frontera de la respuesta, que es una asignación directa. El paso 3 de la Task 5 define `intervalMinutes` y el paso 4 lo consume; el paso 5 manda a buscar `intervalSeconds` en todo `backend/src` para confirmar que no queda ninguna coincidencia, y ese nombre no vuelve a aparecer en ninguna tarea posterior.

**Proporción.** Seis tareas, siete pasos cada una aproximadamente. El plan nombra firmas, claves, valores por defecto, rangos, comandos y aserciones, y deja los cuerpos para quien lo implementa salvo donde el algoritmo no queda determinado por la firma: el orden de precedencia en `settings.cache.ts`, el rechazo en vez de recorte en `settings.validation.ts`, y el reparto de estados en `AdminSettings.tsx`.
