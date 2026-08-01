-- CreateTable
CREATE TABLE "schedule_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#4f98a3',
    "icon" TEXT NOT NULL DEFAULT 'radio',
    "keywords" TEXT NOT NULL DEFAULT '',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_categories_name_key" ON "schedule_categories"("name");

-- CreateIndex
CREATE INDEX "schedule_categories_is_visible_idx" ON "schedule_categories"("is_visible");

-- CreateIndex
CREATE INDEX "schedule_categories_sort_order_idx" ON "schedule_categories"("sort_order");
