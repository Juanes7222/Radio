import { Router } from "express";
import { asyncHandler } from "../../shared/errors/async-handler";
import { AppError } from "../../shared/errors/app-error";
import { requireAuth, requireSuperAdmin } from "./auth.middleware";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  revokeAdminSessions,
  toPublicUser,
  updateAdminUser,
} from "./adminUsers.service";
import { isAdminRole, normalizeEmail, parsePermissions } from "./permissions";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await listAdminUsers();
    res.json({ rows: rows.map(toPublicUser), total: rows.length });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      email?: unknown;
      name?: unknown;
      role?: unknown;
      permissions?: unknown;
    };
    const email = normalizeEmail(body.email);
    const role = body.role;
    if (!isAdminRole(role)) {
      throw new AppError(400, "Rol inválido (SUPERADMIN, ADMIN o USER)");
    }
    const created = await createAdminUser({
      email,
      name: typeof body.name === "string" ? body.name : "",
      role,
      permissions: parsePermissions(body.permissions),
      createdBy: req.session?.email ?? null,
    });
    res.status(201).json({ user: toPublicUser(created) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = req.body as {
      name?: unknown;
      role?: unknown;
      permissions?: unknown;
      isActive?: unknown;
    };
    const input: {
      name?: string;
      role?: Parameters<typeof updateAdminUser>[1]["role"];
      permissions?: ReturnType<typeof parsePermissions>;
      isActive?: boolean;
    } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string") throw new AppError(400, "Nombre inválido");
      input.name = body.name;
    }
    if (body.role !== undefined) {
      if (!isAdminRole(body.role)) throw new AppError(400, "Rol inválido");
      input.role = body.role;
    }
    if (body.permissions !== undefined) {
      input.permissions = parsePermissions(body.permissions);
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") throw new AppError(400, "isActive inválido");
      input.isActive = body.isActive;
    }
    const updated = await updateAdminUser(String(req.params.id), input, req.session?.sub ?? "");
    res.json({ user: toPublicUser(updated) });
  })
);

router.post(
  "/:id/revoke",
  asyncHandler(async (req, res) => {
    const updated = await revokeAdminSessions(String(req.params.id));
    res.json({ user: toPublicUser(updated) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteAdminUser(String(req.params.id), req.session?.sub ?? "");
    res.json({ ok: true });
  })
);

export default router;
