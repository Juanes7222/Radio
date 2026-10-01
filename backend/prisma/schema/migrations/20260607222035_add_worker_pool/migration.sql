-- CreateTable
CREATE TABLE "WorkerNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "currentJobId" TEXT,
    "lastSeenAt" DATETIME,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "workerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProcessingJob_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "YouTubeVideo" ("videoId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProcessingJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerNode" ("workerId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerNode_workerId_key" ON "WorkerNode"("workerId");
