-- AlterTable: add version tracking to WorkerNode
ALTER TABLE "WorkerNode" ADD COLUMN "version" TEXT;

-- CreateTable: WorkerRelease for worker auto-update mechanism
CREATE TABLE "WorkerRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerRelease_version_key" ON "WorkerRelease"("version");
