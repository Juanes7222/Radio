import { Router, type Request, type Response } from "express";
import {
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from "../auth/auth.middleware";
import { asyncHandler } from "../../shared/errors/async-handler";
import { logger } from "../../shared/logger/logger";
import {
  addVoiceKey,
  getVoiceKeyOverview,
  removeVoiceKey,
  testVoiceChain,
} from "./voiceKeys.service";

/**
 * Claves de voz del panel.
 *
 * Leer el estado pide el permiso de ajustes; añadir o retirar una clave exige
 * superadmin, por la misma razón que la retención de respaldos: cambiar la
 * cuenta que gasta la cuota es una decisión de coste, no de operación diaria.
 *
 * Se monta antes que `settingsRouter` para que la ruta hija no dependa del
 * orden: `/admin-api/settings/voice-keys` y `/admin-api/settings` comparten
 * prefijo.
 */
export const voiceKeysRouter = Router();

voiceKeysRouter.use(requireAuth);

voiceKeysRouter.get(
  "/",
  requirePermission("settings"),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getVoiceKeyOverview());
  })
);

voiceKeysRouter.post(
  "/",
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    await addVoiceKey(req.body, actorEmail(req));
    res.json(await getVoiceKeyOverview());
  })
);

voiceKeysRouter.delete(
  "/:id",
  requireSuperAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    await removeVoiceKey(req.params.id, actorEmail(req));
    res.json(await getVoiceKeyOverview());
  })
);

/**
 * Synthesizes one short phrase with the current pool, so the operator can see
 * which engine answers before trusting the next morning's announcements to it.
 */
voiceKeysRouter.post(
  "/test",
  requireSuperAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await testVoiceChain());
  })
);

/** The administrator on the request, for the change log. */
function actorEmail(req: Request): string {
  const email = req.session?.email;
  if (email) return email;

  logger.warn("VoiceKeys", "The request has no administrator email", {
    path: req.originalUrl,
  });
  return "desconocido";
}
