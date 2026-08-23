export const PRAYER_STATUS = {
  PENDIENTE: 'PENDIENTE',
  EN_REVISION: 'EN_REVISION',
  RESPONDIDA: 'RESPONDIDA',
  CERRADA: 'CERRADA',
} as const;

export type PrayerStatus = (typeof PRAYER_STATUS)[keyof typeof PRAYER_STATUS];

export interface PrayerRequest {
  id: string;
  deviceId: string | null;
  name: string;
  request: string;
  estado: PrayerStatus;
  respuesta: string | null;
  answeredAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrayerRequestPayload {
  deviceId: string;
  name: string;
  request: string;
}

export interface PrayerRequestUpdatePayload {
  estado?: PrayerStatus;
  respuesta?: string;
  name?: string;
  request?: string;
}

export type PrayerStatusCounts = Record<PrayerStatus, number>;

export interface PrayerListResponse {
  rows: PrayerRequest[];
  total: number;
  page: number;
  totalPages: number;
  counts: PrayerStatusCounts;
  unreadCount: number;
}

export interface PrayerCreatedEvent {
  id: string;
  name: string;
}

export interface PrayerBulkResult {
  count: number;
}

export interface DeviceInfo {
  id: string;
  deviceId: string;
  fcmToken: string | null;
  platform: string | null;
  appVersion: string | null;
  lastSeen: string;
  createdAt: string;
}

export interface DeviceRegistrationPayload {
  deviceId: string;
  fcmToken: string;
  platform: string;
  appVersion: string;
}

export interface DeviceTokenUpdatePayload {
  fcmToken: string;
}
