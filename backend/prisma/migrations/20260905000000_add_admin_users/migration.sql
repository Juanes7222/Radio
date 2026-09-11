-- Admin users with role-based access (SUPERADMIN / ADMIN / USER con permisos dinamicos).
-- La tabla parte vacia: el bootstrap en primer login crea el superadmin desde
-- SUPERADMIN_EMAIL y migra ADMIN_WHITELIST como ADMIN.
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'USER',
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

CREATE INDEX "admin_users_is_active_idx" ON "admin_users"("is_active");
