-- CreateTable
CREATE TABLE "feedback_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoria" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "nombre" TEXT,
    "contacto" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "feedback_messages_created_at_idx" ON "feedback_messages"("created_at");

-- CreateIndex
CREATE INDEX "feedback_messages_estado_idx" ON "feedback_messages"("estado");

-- CreateIndex
CREATE INDEX "feedback_messages_categoria_idx" ON "feedback_messages"("categoria");