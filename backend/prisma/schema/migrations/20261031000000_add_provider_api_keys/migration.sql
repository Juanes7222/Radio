-- Claves de API de proveedores de voz, cifradas con AES-256-GCM.
--
-- Tabla aparte y no `station_settings` por dos razones: esa tabla entra completa
-- en el respaldo diario que sube a R2, y sus valores se sirven desde el panel.
-- Aquí el secreto está cifrado y la clave maestra vive en
-- SECRETS_ENCRYPTION_KEY, fuera de la base.
CREATE TABLE "provider_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "updated_by" TEXT
);

-- La reconstrucción del pool lee todas las claves de un proveedor a la vez.
CREATE INDEX "provider_api_keys_provider_idx" ON "provider_api_keys"("provider");
