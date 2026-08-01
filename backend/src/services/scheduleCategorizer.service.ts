import { prisma } from '../lib/prisma';
import type { ScheduleCategory } from '@prisma/client';

export interface ScheduleCategorySummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
}

export interface CategorizedScheduleItem {
  [key: string]: unknown;
  title?: string;
  category: ScheduleCategorySummary | null;
}

export function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function categoryToSummary(
  category: ScheduleCategory
): ScheduleCategorySummary {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    color: category.color,
    icon: category.icon,
  };
}

export async function getAllCategories(): Promise<ScheduleCategory[]> {
  return prisma.scheduleCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getVisibleCategories(): Promise<ScheduleCategory[]> {
  return prisma.scheduleCategory.findMany({
    where: { isVisible: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

function parseKeywords(category: ScheduleCategory): string[] {
  return category.keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map(normalizeKeyword);
}

function findMatchingCategory(
  categories: ScheduleCategory[],
  normalizedTitle: string
): ScheduleCategory | null {
  let bestMatch: ScheduleCategory | null = null;
  let bestLength = 0;

  for (const category of categories) {
    for (const keyword of parseKeywords(category)) {
      if (keyword.length > bestLength && normalizedTitle.includes(keyword)) {
        bestMatch = category;
        bestLength = keyword.length;
      }
    }
  }

  return bestMatch;
}

export async function categorizeSchedule(
  items: unknown[]
): Promise<CategorizedScheduleItem[]> {
  const categories = await getAllCategories();

  return items.map((item) => {
    const rawItem = item as CategorizedScheduleItem;
    const title = rawItem.title ?? '';
    const normalizedTitle = normalizeKeyword(String(title));
    const match = findMatchingCategory(categories, normalizedTitle);

    return {
      ...rawItem,
      category: match ? categoryToSummary(match) : null,
    };
  });
}

export async function filterVisibleSchedule(
  items: unknown[]
): Promise<unknown[]> {
  const categories = await getAllCategories();

  return items.filter((item) => {
    const title = normalizeKeyword(String((item as { title?: string }).title ?? ''));
    const match = findMatchingCategory(categories, title);
    return !(match && !match.isVisible);
  });
}
