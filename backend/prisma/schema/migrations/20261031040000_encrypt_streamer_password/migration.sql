-- Cifra la contraseña del locutor automático.
--
-- La tabla anterior guardaba el valor en claro. SQLite no puede cifrar en SQL y
-- la clave maestra no vive en la base, así que el valor no se puede trasladar:
-- se reconstruye la tabla con los tres campos del cifrado y la contraseña se
-- vuelve a escribir desde el panel, donde el campo ya existe y usa la misma
-- clave maestra que las claves de proveedor (SECRETS_ENCRYPTION_KEY).
--
-- En este despliegue la tabla estaba vacía porque el locutor usaba la
-- contraseña del entorno, así que no se pierde acceso a nada.

CREATE TABLE "announcement_streamer_credentials_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL
);

DROP TABLE "announcement_streamer_credentials";

ALTER TABLE "announcement_streamer_credentials_new" RENAME TO "announcement_streamer_credentials";
