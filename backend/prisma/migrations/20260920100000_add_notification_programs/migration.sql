-- CreateTable
CREATE TABLE "notification_programs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notifiable" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_programs_title_key_key" ON "notification_programs"("title_key");

-- CreateIndex
CREATE INDEX "notification_programs_notifiable_idx" ON "notification_programs"("notifiable");
