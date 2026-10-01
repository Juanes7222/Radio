-- DJ assignments: mapping between AzuraCast streamer accounts and panel users,
-- with weekly live slots in Bogota time. Streamer credentials stay in AzuraCast.
CREATE TABLE "dj_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamer_username" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "slots" TEXT NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "dj_assignments_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "dj_assignments_streamer_username_admin_user_id_key" ON "dj_assignments"("streamer_username", "admin_user_id");

CREATE INDEX "dj_assignments_admin_user_id_idx" ON "dj_assignments"("admin_user_id");

CREATE INDEX "dj_assignments_streamer_username_idx" ON "dj_assignments"("streamer_username");
