-- CreateTable NoticeGalleryItem for carousel notices
CREATE TABLE "notice_gallery_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notice_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "poster_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notice_gallery_items_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "app_notices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notice_gallery_items_notice_id_idx" ON "notice_gallery_items"("notice_id");
CREATE INDEX "notice_gallery_items_sort_order_idx" ON "notice_gallery_items"("sort_order");
