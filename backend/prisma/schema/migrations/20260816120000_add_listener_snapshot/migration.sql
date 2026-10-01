-- CreateTable
CREATE TABLE "listener_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "current" INTEGER NOT NULL DEFAULT 0,
    "unique" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "listener_snapshots_recordedAt_idx" ON "listener_snapshots"("recordedAt");
