import { Router } from "express";
import { asyncHandler } from "../../shared/errors/async-handler";
import { requireAuth, requirePermission } from "../auth/auth.middleware";
import {
  createAssignment,
  deleteAssignment,
  getMyAssignments,
  listAssignments,
  listStreamers,
  updateAssignment,
} from "./dj.service";
import { canStopAnyRelay, getRelayStatus, stopRelay } from "../liveRelay/relay.service";

const router = Router();

router.use(requireAuth);

/**
 * GET /admin-api/djs/mine
 * Assignments of the current user with live slot status.
 */
router.get(
  "/mine",
  asyncHandler(async (req, res) => {
    res.json(await getMyAssignments(req.session?.sub ?? ""));
  })
);

/**
 * GET /admin-api/djs
 * AzuraCast streamers joined with panel assignments (manage view).
 */
router.get(
  "/",
  requirePermission("streaming"),
  asyncHandler(async (_req, res) => {
    const [streamers, assignments] = await Promise.all([listStreamers(), listAssignments()]);
    res.json({ streamers, assignments });
  })
);

router.post(
  "/assignments",
  requirePermission("streaming"),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      streamerUsername?: unknown;
      email?: unknown;
      slots?: unknown;
    };
    const created = await createAssignment({
      streamerUsername: typeof body.streamerUsername === "string" ? body.streamerUsername : "",
      email: typeof body.email === "string" ? body.email : "",
      slots: body.slots,
      assignedBy: req.session?.email ?? null,
    });
    res.status(201).json({ assignment: created });
  })
);

router.patch(
  "/assignments/:id",
  requirePermission("streaming"),
  asyncHandler(async (req, res) => {
    const body = req.body as { slots?: unknown; isActive?: unknown };
    const updated = await updateAssignment(String(req.params.id), {
      slots: body.slots,
      isActive: body.isActive,
    });
    res.json({ assignment: updated });
  })
);

router.delete(
  "/assignments/:id",
  requirePermission("streaming"),
  asyncHandler(async (req, res) => {
    await deleteAssignment(String(req.params.id));
    res.json({ ok: true });
  })
);

/**
 * GET /admin-api/djs/relay/status — estado de la transmisión en vivo actual.
 */
router.get(
  "/relay/status",
  asyncHandler(async (_req, res) => {
    res.json({ relay: getRelayStatus() });
  })
);

/**
 * POST /admin-api/djs/relay/stop — detiene el relevo propio; con permiso de
 * gestión puede detener el de otro DJ (corte de emergencia al aire).
 */
router.post(
  "/relay/stop",
  asyncHandler(async (req, res) => {
    const session = req.session;
    if (!session) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }
    const ownerId = canStopAnyRelay(session) ? undefined : session.sub;
    res.json({ relay: stopRelay("Detenida desde el panel", ownerId) });
  })
);

export default router;
