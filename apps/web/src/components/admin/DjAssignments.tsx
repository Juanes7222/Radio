import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, X } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { DjAssignment, LiveSlot, Streamer } from '@radio/types';

const DOW_OPTIONS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const DOW_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatSlots(slots: LiveSlot[]): string {
  if (slots.length === 0) return 'Sin franjas';
  return slots.map((s) => `${DOW_SHORT[s.dow]} ${s.start}–${s.end}`).join(' · ');
}

function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: string } | undefined)?.error;
    if (msg) return msg;
    return 'Error al conectar con el servidor.';
  }
  return 'Error desconocido.';
}

export function DjAssignments({ streamers }: { streamers: Streamer[] }) {
  // Destructure stable callbacks: the hook returns a new object identity on
  // every render, so depending on the whole object would refire effects
  // endlessly and flood the backend (429).
  const { getDjs, createDjAssignment, updateDjAssignment, deleteDjAssignment } = useAdminApi();
  const [rows, setRows] = useState<DjAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DjAssignment | null>(null);
  const [streamerUsername, setStreamerUsername] = useState('');
  const [email, setEmail] = useState('');
  const [slots, setSlots] = useState<LiveSlot[]>([{ dow: 1, start: '18:00', end: '20:00' }]);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DjAssignment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getDjs()
      .then((res) => setRows(res.assignments))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [getDjs]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = (preselect?: string) => {
    setEditing(null);
    setStreamerUsername(preselect ?? streamers[0]?.streamer_username ?? '');
    setEmail('');
    setSlots([{ dow: 1, start: '18:00', end: '20:00' }]);
    setDialogOpen(true);
  };

  const openEdit = (row: DjAssignment) => {
    setEditing(row);
    setStreamerUsername(row.streamerUsername);
    setEmail(row.email);
    setSlots(row.slots.length > 0 ? [...row.slots] : [{ dow: 1, start: '18:00', end: '20:00' }]);
    setDialogOpen(true);
  };

  const updateSlot = (index: number, patch: Partial<LiveSlot>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const handleSave = () => {
    if (!editing && !EMAIL_PATTERN.test(email.trim().toLowerCase())) {
      toast.error('Escribe el correo del usuario del panel.');
      return;
    }
    if (!streamerUsername) {
      toast.error('Selecciona un DJ.');
      return;
    }
    if (slots.length === 0) {
      toast.error('Agrega al menos una franja horaria.');
      return;
    }
    setSaving(true);
    const request = editing
      ? updateDjAssignment(editing.id, { slots })
      : createDjAssignment({
          streamerUsername,
          email: email.trim().toLowerCase(),
          slots,
        });
    request
      .then(() => {
        toast.success(editing ? 'Asignación actualizada.' : 'DJ asignado. Ya puede transmitir en su franja.');
        setDialogOpen(false);
        load();
      })
      .catch((err: unknown) => toast.error(getErrorMessage(err)))
      .finally(() => setSaving(false));
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    setDeleting(true);
    deleteDjAssignment(pendingDelete.id)
      .then(() => {
        toast.success('Asignación eliminada.');
        setPendingDelete(null);
        load();
      })
      .catch((err: unknown) => toast.error(getErrorMessage(err)))
      .finally(() => setDeleting(false));
  };

  return (
    <Card className="border-border bg-muted/60">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" />
          DJs asignados a usuarios
        </CardTitle>
        <Button size="sm" className="gap-2" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" />
          Asignar
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-faint">
          Vincula cada cuenta DJ con usuarios del panel y su franja semanal en hora de Bogotá.
          Solo en su franja verán habilitado el botón Transmitir.
        </p>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">
            Sin asignaciones. Los DJs solo podrán transmitir con software externo hasta que los
            asignes aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DJ</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Franjas (Bogotá)</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.streamerUsername}</TableCell>
                    <TableCell>
                      <p className="truncate text-sm">{row.name || 'Sin nombre'}</p>
                      <p className="truncate font-mono text-xs text-faint">{row.email}</p>
                    </TableCell>
                    <TableCell className="max-w-56 text-xs text-muted-foreground">
                      {formatSlots(row.slots)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {row.isActive ? (
                          <Badge variant="outline" className="border-success/25 bg-success/10 text-success">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                            Inactivo
                          </Badge>
                        )}
                        {row.inSlot && (
                          <Badge variant="outline" className="border-tally/40 bg-tally/10 text-tally">
                            En franja
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label={`Editar asignación de ${row.email}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(row)}
                          aria-label={`Quitar asignación de ${row.email}`}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar asignación' : 'Asignar DJ'}</DialogTitle>
              <DialogDescription>
                Franjas semanales en hora de Bogotá. El DJ solo podrá salir al aire dentro de
                ellas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>DJ</Label>
                  <Select
                    value={streamerUsername}
                    onValueChange={setStreamerUsername}
                    disabled={!!editing || streamers.length === 0}
                  >
                    <SelectTrigger aria-label="Cuenta DJ">
                      <SelectValue placeholder="Selecciona el DJ" />
                    </SelectTrigger>
                    <SelectContent>
                      {streamers.map((s) => (
                        <SelectItem key={s.id} value={s.streamer_username}>
                          {s.display_name || s.streamer_username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dj-email">Correo del usuario</Label>
                  <Input
                    id="dj-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@gmail.com"
                    disabled={!!editing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Franjas</Label>
                {slots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={String(slot.dow)}
                      onValueChange={(v) => updateSlot(i, { dow: Number(v) })}
                    >
                      <SelectTrigger className="w-32" aria-label="Día de la franja">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOW_OPTIONS.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={slot.start}
                      onChange={(e) => updateSlot(i, { start: e.target.value })}
                      aria-label="Inicio de franja"
                      className="font-mono"
                    />
                    <Input
                      type="time"
                      value={slot.end}
                      onChange={(e) => updateSlot(i, { end: e.target.value })}
                      aria-label="Fin de franja"
                      className="font-mono"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                      disabled={slots.length <= 1}
                      aria-label="Quitar franja"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSlots((prev) => [...prev, { dow: 1, start: '18:00', end: '20:00' }])}
                  disabled={slots.length >= 21}
                >
                  <Plus className="h-4 w-4" />
                  Agregar franja
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : editing ? 'Guardar' : 'Asignar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title="Quitar asignación"
          description={
            pendingDelete
              ? `${pendingDelete.email} ya no podrá transmitir como ${pendingDelete.streamerUsername}.`
              : undefined
          }
          confirmLabel="Quitar"
          loading={deleting}
          onConfirm={handleDelete}
        />
      </CardContent>
    </Card>
  );
}
