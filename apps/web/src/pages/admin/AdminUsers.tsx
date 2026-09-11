import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, UserPlus, Pencil, Trash2, KeyRound, Search } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { formatDateTime } from '@/lib/format';
import type {
  AdminPermission,
  AdminRole,
  ManagedAdminUser,
} from '@radio/types';
import { ADMIN_PERMISSION_LABELS, ADMIN_ROLE_LABELS } from '@radio/types';

const ROLE_BADGE: Record<AdminRole, string> = {
  SUPERADMIN: 'bg-primary/15 text-primary border-primary/25',
  ADMIN: 'bg-info/10 text-info border-info/25',
  USER: 'bg-accent text-muted-foreground border-border',
};

const PERMISSION_GROUPS: { title: string; items: AdminPermission[] }[] = [
  { title: 'Emisión', items: ['dashboard', 'schedule', 'schedule.categories', 'streaming', 'live'] },
  {
    title: 'Contenido',
    items: ['upload', 'playlists', 'rotations', 'reading.history', 'locutor', 'youtube'],
  },
  { title: 'Audiencia', items: ['requests', 'prayer', 'devices', 'notices'] },
  { title: 'Sistema', items: ['logs', 'jobs'] },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoadState = 'loading' | 'ready' | 'error';

interface FormState {
  email: string;
  name: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  email: '',
  name: '',
  role: 'USER',
  permissions: [],
  isActive: true,
};

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: string } | undefined)?.error;
    if (msg) return msg;
    if (err.response?.status === 403) return 'No tienes permiso para gestionar usuarios.';
    return 'Error al conectar con el servidor.';
  }
  return 'Error desconocido.';
}

function PermissionChips({ permissions, role }: { permissions: AdminPermission[]; role: AdminRole }) {
  if (role !== 'USER') {
    return <span className="text-xs text-muted-foreground">Acceso total</span>;
  }
  if (permissions.length === 0) {
    return <span className="font-mono text-xs text-faint">Sin permisos</span>;
  }
  const visible = permissions.slice(0, 3);
  const extra = permissions.length - visible.length;
  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {visible.map((p) => (
        <span
          key={p}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/15"
        >
          {ADMIN_PERMISSION_LABELS[p]}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
          +{extra}
        </span>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const api = useAdminApi();
  const { user: currentUser, isSuperAdmin } = useAdminAuth();
  const [rows, setRows] = useState<ManagedAdminUser[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedAdminUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: 'delete'; target: ManagedAdminUser }
    | { kind: 'revoke'; target: ManagedAdminUser }
    | { kind: 'toggle'; target: ManagedAdminUser }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(() => {
    setState('loading');
    api
      .getAdminUsers()
      .then((res) => {
        setRows(res.rows);
        setState('ready');
      })
      .catch(() => {
        setState('error');
      });
  }, [api]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
  }, [isSuperAdmin, load]);

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-faint" />
        <h1 className="mt-4 text-lg font-semibold">Solo el superadmin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La gestión de usuarios está reservada al superadmin. Si necesitas acceso, pídelo al
          administrador del sistema.
        </p>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (target: ManagedAdminUser) => {
    setEditing(target);
    setForm({
      email: target.email,
      name: target.name,
      role: target.role,
      permissions: target.role === 'USER' ? [...target.permissions] : [],
      isActive: target.isActive,
    });
    setDialogOpen(true);
  };

  const togglePermission = (permission: AdminPermission) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  const validateForm = (): string | null => {
    if (!editing && !EMAIL_PATTERN.test(form.email.trim().toLowerCase())) {
      return 'Escribe un correo válido.';
    }
    if (form.role === 'USER' && form.permissions.length === 0) {
      return 'Selecciona al menos un permiso para un usuario personalizado.';
    }
    return null;
  };

  const handleSave = () => {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    const permissions = form.role === 'USER' ? form.permissions : [];
    const request = editing
      ? api.updateAdminUser(editing.id, {
          name: form.name.trim(),
          role: form.role,
          permissions,
          isActive: form.isActive,
        })
      : api.createAdminUser({
          email: form.email.trim().toLowerCase(),
          name: form.name.trim(),
          role: form.role,
          permissions,
        });

    request
      .then(() => {
        toast.success(editing ? 'Usuario actualizado.' : 'Usuario creado. Ya puede ingresar con Google.');
        setDialogOpen(false);
        load();
      })
      .catch((err: unknown) => {
        toast.error(getErrorMessage(err));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const handleConfirm = () => {
    if (!confirm) return;
    setConfirmBusy(true);
    const { kind, target } = confirm;
    const request =
      kind === 'delete'
        ? api.deleteAdminUser(target.id).then(() => undefined)
        : kind === 'revoke'
          ? api.revokeAdminUserSessions(target.id).then(() => undefined)
          : api.updateAdminUser(target.id, { isActive: !target.isActive }).then(() => undefined);

    request
      .then(() => {
        toast.success(
          kind === 'delete'
            ? 'Usuario eliminado.'
            : kind === 'revoke'
              ? 'Sesiones revocadas. Deberá volver a iniciar sesión.'
              : target.isActive
                ? 'Usuario desactivado.'
                : 'Usuario activado.'
        );
        setConfirm(null);
        load();
      })
      .catch((err: unknown) => {
        toast.error(getErrorMessage(err));
      })
      .finally(() => {
        setConfirmBusy(false);
      });
  };

  const query = search.trim().toLowerCase();
  const filtered = query
    ? rows.filter(
        (r) =>
          r.email.toLowerCase().includes(query) || r.name.toLowerCase().includes(query)
      )
    : rows;

  const total = rows.length;
  const active = rows.filter((r) => r.isActive).length;
  const superadmins = rows.filter((r) => r.role === 'SUPERADMIN').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
            Sistema · Solo superadmin
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            El ingreso es siempre con Google. Los admins tienen acceso total excepto a esta
            sección; los usuarios personalizados solo ven las secciones que selecciones.
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Usuarios registrados', value: total },
          { label: 'Activos', value: active },
          { label: 'Superadmins', value: superadmins },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
                {stat.label}
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Cuentas con acceso</CardTitle>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por correo o nombre"
              className="pl-9"
              aria-label="Buscar usuarios"
            />
          </div>
        </CardHeader>
        <CardContent>
          {state === 'loading' ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : state === 'error' ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No se pudieron cargar los usuarios.</p>
              <Button variant="outline" className="mt-4" onClick={load}>
                Reintentar
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">Sin resultados</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {rows.length === 0
                  ? 'Aún no hay usuarios. Crea el primero con el botón superior.'
                  : 'Ningún usuario coincide con la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Permisos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Último acceso</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const isSelf = currentUser?.email.toLowerCase() === row.email.toLowerCase();
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {row.picture ? (
                              <img
                                src={row.picture}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
                                {(row.name || row.email).slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {row.name || 'Sin nombre'}
                                {isSelf && (
                                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-faint">
                                    tú
                                  </span>
                                )}
                              </p>
                              <p className="truncate font-mono text-xs text-faint">{row.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border ${ROLE_BADGE[row.role]}`}>
                            {ADMIN_ROLE_LABELS[row.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PermissionChips permissions={row.permissions} role={row.role} />
                        </TableCell>
                        <TableCell>
                          {row.isActive ? (
                            <Badge variant="outline" className="border-success/25 bg-success/10 text-success">
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                              Inactivo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(row)}
                              aria-label={`Editar ${row.email}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirm({ kind: 'revoke', target: row })}
                              aria-label={`Revocar sesiones de ${row.email}`}
                              title="Revocar sesiones"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirm({ kind: 'toggle', target: row })}
                              disabled={isSelf}
                              aria-label={row.isActive ? `Desactivar ${row.email}` : `Activar ${row.email}`}
                              title={row.isActive ? 'Desactivar' : 'Activar'}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirm({ kind: 'delete', target: row })}
                              disabled={isSelf}
                              aria-label={`Eliminar ${row.email}`}
                              title="Eliminar"
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Cambia el rol, los permisos o el estado. Los cambios de rol y permisos cierran las sesiones activas.'
                : 'El usuario ingresará con su cuenta de Google. No hay contraseñas que gestionar.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-email">Correo de Google</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@gmail.com"
                disabled={!!editing}
                autoComplete="email"
              />
              {!editing && (
                <p className="text-xs text-faint">
                  Debe ser la cuenta de Google con la que ingresará. Se guarda en minúsculas.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-name">Nombre (opcional)</Label>
              <Input
                id="user-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nombre visible"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, role: v as AdminRole, permissions: [] }))
                }
              >
                <SelectTrigger aria-label="Rol del usuario">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ADMIN_ROLE_LABELS) as AdminRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {ADMIN_ROLE_LABELS[role]}
                      {role === 'SUPERADMIN' && ' · acceso total + usuarios'}
                      {role === 'ADMIN' && ' · acceso total sin usuarios'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.role !== 'USER' && (
                <p className="text-xs text-faint">
                  Con este rol no hace falta seleccionar permisos: tiene acceso total
                  {form.role === 'ADMIN' ? ' excepto a esta sección.' : '.'}
                </p>
              )}
            </div>

            {form.role === 'USER' && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Permisos por sección</legend>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.title} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
                      {group.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.items.map((permission) => {
                        const checked = form.permissions.includes(permission);
                        return (
                          <label
                            key={permission}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              checked
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => togglePermission(permission)}
                            />
                            {ADMIN_PERMISSION_LABELS[permission]}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
            )}

            {editing && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Cuenta activa</p>
                  <p className="text-xs text-muted-foreground">
                    Al desactivar se cierran sus sesiones de inmediato.
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                  aria-label="Cuenta activa"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Eliminar usuario"
        description={
          confirm?.target
            ? `Se eliminará el acceso de ${confirm.target.email}. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
        loading={confirmBusy}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={confirm?.kind === 'revoke'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Revocar sesiones"
        description={
          confirm?.target
            ? `Se cerrarán todas las sesiones de ${confirm.target.email}. Deberá volver a iniciar sesión.`
            : undefined
        }
        confirmLabel="Revocar"
        destructive={false}
        loading={confirmBusy}
        onConfirm={handleConfirm}
      />

      <ConfirmDialog
        open={confirm?.kind === 'toggle'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.target?.isActive ? 'Desactivar usuario' : 'Activar usuario'}
        description={
          confirm?.target
            ? confirm.target.isActive
              ? `Se bloqueará el acceso de ${confirm.target.email} de inmediato.`
              : `Se restaurará el acceso de ${confirm.target.email}.`
            : undefined
        }
        confirmLabel={confirm?.target?.isActive ? 'Desactivar' : 'Activar'}
        destructive={confirm?.target?.isActive ?? true}
        loading={confirmBusy}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
