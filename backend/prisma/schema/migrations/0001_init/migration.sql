-- CreateTable
CREATE TABLE "BibleTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "abbreviation" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "BibleBook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "translationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "testament" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "BibleBook_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "BibleTranslation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BibleChapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    CONSTRAINT "BibleChapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "BibleBook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BibleVerse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "BibleVerse_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "BibleChapter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YouTubeVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "duration" INTEGER,
    "publishedAt" DATETIME,
    "localPath" TEXT,
    "azuracastFileId" TEXT,
    "azuracastPath" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "YouTubeSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "subscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BibleTranslation_abbreviation_key" ON "BibleTranslation"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "BibleBook_translationId_name_key" ON "BibleBook"("translationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BibleChapter_bookId_number_key" ON "BibleChapter"("bookId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BibleVerse_chapterId_number_key" ON "BibleVerse"("chapterId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeVideo_videoId_key" ON "YouTubeVideo"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeSubscription_channelId_key" ON "YouTubeSubscription"("channelId");
