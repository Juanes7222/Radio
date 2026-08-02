import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { prisma } from "../../infrastructure/database/prisma";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { logger } from "../../shared/logger/logger";

const router = Router();

interface ScheduleCategoryInput {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  keywords?: string;
  isVisible?: boolean;
  sortOrder?: number;
}

function validateCategoryInput(body: unknown): ScheduleCategoryInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : undefined;
  if (name !== undefined && name.length === 0) return null;

  const color = typeof raw.color === "string" ? raw.color.trim() : undefined;
  if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) return null;

  const icon = typeof raw.icon === "string" ? raw.icon.trim() : undefined;
  if (icon !== undefined && icon.length === 0) return null;

  const description =
    raw.description === null || raw.description === undefined
      ? undefined
      : typeof raw.description === "string"
      ? raw.description.trim()
      : null;

  const keywords = typeof raw.keywords === "string" ? raw.keywords.trim() : undefined;

  const isVisible = typeof raw.isVisible === "boolean" ? raw.isVisible : undefined;

  const sortOrder =
    typeof raw.sortOrder === "number" && Number.isInteger(raw.sortOrder)
      ? raw.sortOrder
      : undefined;

  return { name, description, color, icon, keywords, isVisible, sortOrder };
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = await prisma.scheduleCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.status(200).json(categories);
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = validateCategoryInput(req.body);
    if (!input || !input.name) {
      throw new AppError(400, "Datos inválidos: name es requerido");
    }

    const category = await prisma.scheduleCategory.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? "#4f98a3",
        icon: input.icon ?? "radio",
        keywords: input.keywords ?? "",
        isVisible: input.isVisible ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    res.status(201).json(category);
  })
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = validateCategoryInput(req.body);
    if (!input) {
      throw new AppError(400, "Datos inválidos");
    }

    const categoryId = String(req.params.id);
    const category = await prisma.scheduleCategory.update({
      where: { id: categoryId },
      data: {
        name: input.name,
        description: input.description,
        color: input.color,
        icon: input.icon,
        keywords: input.keywords,
        isVisible: input.isVisible,
        sortOrder: input.sortOrder,
      },
    });
    res.status(200).json(category);
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const categoryId = String(req.params.id);
    await prisma.scheduleCategory.delete({
      where: { id: categoryId },
    });
    res.status(204).send();
  })
);

export default router;
