-- CreateTable
CREATE TABLE "prayer_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "prayer_requests_created_at_idx" ON "prayer_requests"("created_at");
