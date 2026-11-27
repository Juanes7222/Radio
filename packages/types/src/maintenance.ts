/**
 * What `GET /api/maintenance` answers. Public and unauthenticated: the web and
 * the mobile app read it before rendering the station, so the fields are the
 * whole screen, not a reference to a settings row.
 */
export interface MaintenanceStatus {
  enabled: boolean;
  title: string;
  message: string;
  /** Optional line under the message. Empty means the screen omits it. */
  footerNote: string;
}
