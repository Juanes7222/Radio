import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Megaphone, Pin, Trash2, Pencil, RefreshCw, Users, Layers, ShieldCheck, Clock3, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPagination } from "@/components/ui-custom/AdminPagination";
import { ConfirmDialog } from "@/components/ui-custom/ConfirmDialog";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import { formatDateTime } from "@/lib/format";
import { resolveNoticeMediaSrc } from "@/lib/noticeMedia";
import { NoticeFormDialog } from "@/components/admin/notices/NoticeFormDialog";
import { AUDIENCE_LABELS, VARIANT_CFG, getNoticeStatus } from "@/components/admin/notices/noticeConfig";
import type { AppNotice } from "@radio/types";

export default function AdminNotices() {
  const { getNotices, deleteNotice, getDeviceZones } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [rows, setRows] = useState<AppNotice[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<string[]>([]);
  const [editing, setEditing] = useState<AppNotice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppNotice | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotices({ page, limit: 12 });
      setRows(res.rows);
      setTotalPages(Math.max(1, res.totalPages));
    } catch {
      toast.error("No se pudo cargar el tablón");
    } finally {
      setLoading(false);
    }
  }, [getNotices, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getDeviceZones()
      .then((r) => {
        if (!cancelled) setZones(r.zones);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getDeviceZones]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (notice: AppNotice) => {
    setEditing(notice);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
  };

  const handleSaved = () => {
    void load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNotice(deleteTarget.id);
      toast.success("Aviso eliminado");
      setDeleteTarget(null);
      void load();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Cabina · Tablón de avisos</p>
              <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Megaphone className="h-4 w-4" />
                </span>
                Avisos para oyentes
              </h1>
              <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
                Un anuncio pequeño, no un pop-up agresivo. Elige ventana, frecuencia y zona. Se muestra en web y app hasta que expire o el oyente lo
                descarte.
              </p>
            </div>
            <Button onClick={openCreate} className="hidden shrink-0 gap-2 rounded-full sm:inline-flex">
              <Pin className="h-4 w-4" />
              Nuevo aviso
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs">
              <Layers className="h-3 w-3 text-faint" />
              {rows.length} en esta página
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3 w-3" />
              Respeta no molestar
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="ml-auto gap-1.5 rounded-full">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 rounded-b-lg bg-primary/15 backdrop-blur border border-primary/10"
          style={{ clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0 100%)" }}
        />
      </div>

      <Button onClick={openCreate} className="w-full gap-2 rounded-full sm:hidden">
        <Pin className="h-4 w-4" />
        Nuevo aviso
      </Button>

      {/* List */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/30 py-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-faint" />
            <CardTitle className="text-sm">Tablón</CardTitle>
            <span className="ml-auto font-mono text-xs text-faint">{loading ? "Cargando…" : `${rows.length} avisos`}</span>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-xl bg-sunken" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-sunken/50 px-6 py-12 text-center">
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                Aún no hay avisos. Crea el primero: un recordatorio de evento, un cambio de horario o una invitación breve.
              </p>
              <Button onClick={openCreate} className="mt-4 rounded-full">
                Crear aviso
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {rows.map((notice, idx) => {
                    const status = getNoticeStatus(notice);
                    const cfg = VARIANT_CFG[notice.variant];
                    const mode = (notice as unknown as { displayMode?: string }).displayMode ?? "toast";
                    const gallery: Array<{ type: string; url: string; posterUrl: string | null }> = (notice as unknown as { gallery?: Array<{ type: string; url: string; posterUrl: string | null }> }).gallery ?? [];
                    const hasGallery = gallery.length > 0;
                    const video = (notice as unknown as { videoUrl?: string | null }).videoUrl ?? null;
                    return (
                      <motion.div
                        key={notice.id}
                        layout={!shouldReduceMotion}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.12) }}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm border-l-4 ${cfg.border}`}
                      >
                        <div className="flex items-center gap-2 border-b border-border bg-sunken/40 px-3 py-2">
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-faint">{cfg.label}</span>
                          <span
                            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${mode === "modal" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-card text-faint"}`}
                          >
                            {mode === "modal" ? "● Central" : "▬ Discreto"}
                          </span>
                          {hasGallery ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              <Film className="h-3 w-3" />
                              Carrusel · {gallery.length}
                            </span>
                          ) : video ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              <Film className="h-3 w-3" />
                              Video
                            </span>
                          ) : (
                            notice.imageUrl && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-faint">
                                <Layers className="h-3 w-3" />
                                Imagen
                              </span>
                            )
                          )}
                          <Badge variant="outline" className={`ml-auto rounded-full border text-xs ${status.tone}`}>
                            {status.label}
                          </Badge>
                        </div>
                        {hasGallery ? (
                          <div className="relative">
                            {gallery[0].type === "video" ? (
                              <video
                                src={resolveNoticeMediaSrc(gallery[0].url) ?? ""}
                                poster={gallery[0].posterUrl ? (resolveNoticeMediaSrc(gallery[0].posterUrl) ?? undefined) : undefined}
                                className="aspect-[16/8] w-full object-cover bg-black"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <img src={resolveNoticeMediaSrc(gallery[0].url) ?? ""} alt="" className="aspect-[16/8] w-full object-cover" />
                            )}
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                              <Film className="h-3 w-3" />
                              {gallery.length} elementos
                            </span>
                            {gallery.length > 1 && (
                              <span className="absolute bottom-2 right-2 flex gap-1">
                                {gallery.slice(0, 4).map((_, i) => (
                                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} aria-hidden />
                                ))}
                                {gallery.length > 4 && <span className="font-mono text-[10px] text-white">+{gallery.length - 4}</span>}
                              </span>
                            )}
                          </div>
                        ) : video ? (
                          <div className="relative">
                            <video src={resolveNoticeMediaSrc(video) ?? ""} className="aspect-[16/8] w-full object-cover bg-black" muted playsInline />
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                              <Film className="h-3 w-3" />
                              Video
                            </span>
                          </div>
                        ) : notice.imageUrl ? (
                          <img src={resolveNoticeMediaSrc(notice.imageUrl) ?? ""} alt="" className="aspect-[16/8] w-full object-cover" />
                        ) : null}
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-tight">
                            {notice.title}
                          </h3>
                          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{notice.body}</p>
                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint">
                              <Users className="h-3 w-3" />
                              {AUDIENCE_LABELS[notice.audience]}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint">
                              <Clock3 className="h-3 w-3" />
                              {notice.maxDisplaysPerUser === 0 ? "∞" : `${notice.maxDisplaysPerUser}×`} por usuario
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-faint">
                            {formatDateTime(notice.startsAt)} → {formatDateTime(notice.endsAt)}
                          </p>
                          <div className="flex gap-1.5 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openEdit(notice)} className="h-7 flex-1 gap-1 rounded-full text-xs">
                              <Pencil className="h-3 w-3" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteTarget(notice)}
                              className="h-7 gap-1 rounded-full text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {totalPages > 1 && (
                <div className="pt-4">
                  <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showForm && <NoticeFormDialog notice={editing} zones={zones} onClose={closeForm} onSaved={handleSaved} />}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="¿Eliminar aviso?"
        description={`Se eliminará "${deleteTarget?.title ?? ""}".`}
        confirmLabel="Eliminar"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
