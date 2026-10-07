import {
  Prisma,
  type FeedbackMessage as FeedbackRow,
} from "@prisma/client";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackMessage,
  type FeedbackStatus,
  type FeedbackStatusCounts,
} from "@radio/types";
import { prisma } from "../../infrastructure/database/prisma";
import type { FeedbackInput, Pagination } from "./feedback.validation";

const CATEGORY_VALUES: readonly string[] = Object.values(FEEDBACK_CATEGORIES);
const STATUS_VALUES: readonly string[] = Object.values(FEEDBACK_STATUSES);

export interface FeedbackFilters {
  estado: FeedbackStatus | null;
  categoria: FeedbackCategory | null;
  search: string | null;
}

export interface FeedbackPage {
  rows: FeedbackMessage[];
  total: number;
  page: number;
  totalPages: number;
  counts: FeedbackStatusCounts;
  unreadCount: number;
}

function toCategory(value: string): FeedbackCategory {
  return CATEGORY_VALUES.includes(value)
    ? (value as FeedbackCategory)
    : "SUGERENCIA";
}

function toStatus(value: string): FeedbackStatus {
  return STATUS_VALUES.includes(value) ? (value as FeedbackStatus) : "PENDIENTE";
}

/**
 * The Prisma columns are plain strings because SQLite has no enum; the API
 * contract is narrow. This is the single place the two are reconciled, and it
 * is also where dates become the ISO strings the shared types declare.
 */
function toFeedbackMessage(row: FeedbackRow): FeedbackMessage {
  return {
    id: row.id,
    categoria: toCategory(row.categoria),
    mensaje: row.mensaje,
    nombre: row.nombre,
    contacto: row.contacto,
    estado: toStatus(row.estado),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildWhere(filters: FeedbackFilters): Prisma.FeedbackMessageWhereInput {
  const where: Prisma.FeedbackMessageWhereInput = {};
  if (filters.estado) {
    where.estado = filters.estado;
  }
  if (filters.categoria) {
    where.categoria = filters.categoria;
  }
  if (filters.search) {
    where.OR = [
      { mensaje: { contains: filters.search } },
      { nombre: { contains: filters.search } },
      { contacto: { contains: filters.search } },
    ];
  }
  return where;
}

function emptyCounts(): FeedbackStatusCounts {
  return Object.fromEntries(
    STATUS_VALUES.map((status) => [status, 0])
  ) as FeedbackStatusCounts;
}

export async function createFeedback(
  input: FeedbackInput
): Promise<FeedbackMessage> {
  const row = await prisma.feedbackMessage.create({
    data: {
      categoria: input.categoria,
      mensaje: input.mensaje,
      nombre: input.nombre,
      contacto: input.contacto,
      estado: "PENDIENTE",
    },
  });
  return toFeedbackMessage(row);
}

export async function listFeedback(
  filters: FeedbackFilters,
  { limit, skip }: Pagination
): Promise<FeedbackPage> {
  const where = buildWhere(filters);

  const [rows, total, grouped, unreadCount] = await Promise.all([
    prisma.feedbackMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.feedbackMessage.count({ where }),
    prisma.feedbackMessage.groupBy({ by: ["estado"], _count: { _all: true } }),
    prisma.feedbackMessage.count({ where: { readAt: null } }),
  ]);

  const counts = emptyCounts();
  for (const group of grouped) {
    counts[toStatus(group.estado)] += group._count._all;
  }

  return {
    rows: rows.map(toFeedbackMessage),
    total,
    page: Math.floor(skip / limit) + 1,
    totalPages: Math.ceil(total / limit),
    counts,
    unreadCount,
  };
}

export async function setFeedbackStatus(
  id: string,
  estado: FeedbackStatus
): Promise<FeedbackMessage> {
  const row = await prisma.feedbackMessage.update({ where: { id }, data: { estado } });
  return toFeedbackMessage(row);
}

export async function markFeedbackRead(id: string): Promise<FeedbackMessage> {
  const row = await prisma.feedbackMessage.update({
    where: { id },
    data: { readAt: new Date() },
  });
  return toFeedbackMessage(row);
}

export async function deleteFeedback(id: string): Promise<void> {
  await prisma.feedbackMessage.delete({ where: { id } });
}