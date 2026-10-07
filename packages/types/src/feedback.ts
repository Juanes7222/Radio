export const FEEDBACK_CATEGORIES = {
  FELICITACION: 'FELICITACION',
  SUGERENCIA: 'SUGERENCIA',
  CONSULTA: 'CONSULTA',
  PROBLEMA: 'PROBLEMA',
} as const;

export type FeedbackCategory =
  (typeof FEEDBACK_CATEGORIES)[keyof typeof FEEDBACK_CATEGORIES];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  FELICITACION: 'Felicitación',
  SUGERENCIA: 'Sugerencia',
  CONSULTA: 'Consulta',
  PROBLEMA: 'Problema',
};

export const FEEDBACK_STATUSES = {
  PENDIENTE: 'PENDIENTE',
  RESUELTO: 'RESUELTO',
  DESCARTADO: 'DESCARTADO',
} as const;

export type FeedbackStatus =
  (typeof FEEDBACK_STATUSES)[keyof typeof FEEDBACK_STATUSES];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  PENDIENTE: 'Pendiente',
  RESUELTO: 'Resuelto',
  DESCARTADO: 'Descartado',
};

export const FEEDBACK_LIMITS = {
  mensaje: 800,
  nombre: 60,
  contacto: 120,
} as const;

export const FEEDBACK_MIN_MENSAJE = 10;

export interface FeedbackMessage {
  id: string;
  categoria: FeedbackCategory;
  mensaje: string;
  nombre: string | null;
  contacto: string | null;
  estado: FeedbackStatus;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackPayload {
  categoria: FeedbackCategory;
  mensaje: string;
  nombre?: string;
  contacto?: string;
  consent: boolean;
}

export interface FeedbackUpdatePayload {
  estado: FeedbackStatus;
}

export type FeedbackStatusCounts = Record<FeedbackStatus, number>;

export interface FeedbackListResponse {
  rows: FeedbackMessage[];
  total: number;
  page: number;
  totalPages: number;
  counts: FeedbackStatusCounts;
  unreadCount: number;
}