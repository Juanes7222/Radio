import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AUDIENCE_LABELS } from "@/components/admin/notices/noticeConfig";
import type { NoticeAudience } from "@radio/types";

interface NoticeScheduleStepProps {
  audience: NoticeAudience;
  onAudienceChange: (audience: NoticeAudience) => void;
  audienceZoneId: string;
  onAudienceZoneIdChange: (value: string) => void;
  audiencePlatform: string;
  onAudiencePlatformChange: (value: string) => void;
  audienceProgram: string;
  onAudienceProgramChange: (value: string) => void;
  audienceDeviceIds: string;
  onAudienceDeviceIdsChange: (value: string) => void;
  zones: string[];
  previewCount: number | null;
  onPreviewAudience: () => void;
  startsAt: string;
  onStartsAtChange: (value: string) => void;
  endsAt: string;
  onEndsAtChange: (value: string) => void;
  datesError?: string;
  maxDisplays: string;
  onMaxDisplaysChange: (value: string) => void;
  dismissible: boolean;
  onDismissibleChange: (value: boolean) => void;
  isActive: boolean;
  onIsActiveChange: (value: boolean) => void;
}

/**
 * Step 3 — who sees the notice and for how long.
 * Audience picker with contextual fields, live reach preview and schedule.
 */
export function NoticeScheduleStep({
  audience,
  onAudienceChange,
  audienceZoneId,
  onAudienceZoneIdChange,
  audiencePlatform,
  onAudiencePlatformChange,
  audienceProgram,
  onAudienceProgramChange,
  audienceDeviceIds,
  onAudienceDeviceIdsChange,
  zones,
  previewCount,
  onPreviewAudience,
  startsAt,
  onStartsAtChange,
  endsAt,
  onEndsAtChange,
  datesError,
  maxDisplays,
  onMaxDisplaysChange,
  dismissible,
  onDismissibleChange,
  isActive,
  onIsActiveChange,
}: NoticeScheduleStepProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border bg-sunken/60 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs font-medium text-muted-foreground">Audiencia</p>
          <span className="font-mono text-[10px] text-faint">Zonas del sistema de notificaciones</span>
        </div>
        <Select value={audience} onValueChange={(v) => onAudienceChange(v as NoticeAudience)}>
          <SelectTrigger className="border-border bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-h-[76px]" aria-live="polite">
          {audience === "zone" && (
            <div className="space-y-2">
              <Input
                value={audienceZoneId}
                onChange={(e) => onAudienceZoneIdChange(e.target.value)}
                list="notice-zones"
                placeholder="Ej: Cartago"
                className="border-border bg-card"
              />
              <datalist id="notice-zones">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              {zones.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {zones.map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => onAudienceZoneIdChange(z)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        audienceZoneId === z ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {audience === "platform" && (
            <Select value={audiencePlatform} onValueChange={onAudiencePlatformChange}>
              <SelectTrigger className="border-border bg-card">
                <SelectValue placeholder="Plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS</SelectItem>
                <SelectItem value="web">Web</SelectItem>
              </SelectContent>
            </Select>
          )}
          {audience === "program" && (
            <Input
              value={audienceProgram}
              onChange={(e) => onAudienceProgramChange(e.target.value)}
              placeholder="Ej: Amanecer con fe"
              className="border-border bg-card"
            />
          )}
          {audience === "devices" && (
            <Textarea
              value={audienceDeviceIds}
              onChange={(e) => onAudienceDeviceIdsChange(e.target.value)}
              placeholder="deviceId, deviceId..."
              rows={2}
              className="border-border bg-card font-mono text-xs"
            />
          )}
          {audience === "all" && (
            <p className="font-mono text-[11px] leading-relaxed text-faint">Llega a todos los dispositivos con avisos activos.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPreviewAudience} className="gap-1.5 rounded-full">
            <Eye className="h-3.5 w-3.5" />
            Previsualizar alcance
          </Button>
          {previewCount !== null && (
            <span className="rounded-full bg-info/10 px-2.5 py-1 font-mono text-xs text-info ring-1 ring-info/20">
              {previewCount} dispositivos
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-xs text-faint">Ventana de vigencia</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notice-starts-at" className="font-mono text-xs text-faint">
              Desde
            </Label>
            <Input
              id="notice-starts-at"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => onStartsAtChange(e.target.value)}
              aria-invalid={Boolean(datesError)}
              className="border-border bg-sunken"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-ends-at" className="font-mono text-xs text-faint">
              Hasta
            </Label>
            <Input
              id="notice-ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => onEndsAtChange(e.target.value)}
              aria-invalid={Boolean(datesError)}
              className="border-border bg-sunken"
            />
          </div>
        </div>
        {datesError && (
          <p role="alert" className="font-mono text-[11px] text-destructive">
            {datesError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-sunken/60 p-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-faint">Máx. por usuario · 0 = ilimitado</Label>
          <Select value={maxDisplays} onValueChange={onMaxDisplaysChange}>
            <SelectTrigger className="border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 vez</SelectItem>
              <SelectItem value="2">2 veces</SelectItem>
              <SelectItem value="3">3 veces (recomendado)</SelectItem>
              <SelectItem value="5">5 veces</SelectItem>
              <SelectItem value="0">Ilimitado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3 sm:pt-5">
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">El oyente puede cerrarlo</span>
            <Switch checked={dismissible} onCheckedChange={onDismissibleChange} />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">Publicado al guardar</span>
            <Switch checked={isActive} onCheckedChange={onIsActiveChange} />
          </label>
        </div>
      </div>
    </div>
  );
}
