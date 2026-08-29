-- CreateTable
CREATE TABLE "notice_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "notice_images_filename_key" ON "notice_images"("filename");

-- CreateIndex
CREATE INDEX "notice_images_created_at_idx" ON "notice_images"("created_at");
