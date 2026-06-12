export interface PrayerRequest {
  id: string;
  name: string;
  request: string;
  createdAt: string;
}

export interface PrayerRequestPayload {
  name: string;
  request: string;
}
