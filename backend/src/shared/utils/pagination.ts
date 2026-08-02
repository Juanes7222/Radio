import {
  PRAYER_PAGE_SIZE_DEFAULT,
  PRAYER_PAGE_SIZE_MAX,
} from "../constants";

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export function paginate(
  query: Record<string, unknown>,
  pageSizeDefault = PRAYER_PAGE_SIZE_DEFAULT,
  pageSizeMax = PRAYER_PAGE_SIZE_MAX
): Pagination {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(pageSizeMax, Math.max(1, Number(query.limit) || pageSizeDefault));
  return { page, limit, skip: (page - 1) * limit };
}
