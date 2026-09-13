import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VARIANT_CFG } from "@/components/admin/notices/noticeConfig";
import type { NoticeVariant } from "@radio/types";

interface FormErrors {
  title?: string;
  body?: string;
  ctaUrl?: string;
}

interface NoticeContentStepProps {
  title: string;
  onTitleChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  variant: NoticeVariant;
  onVariantChange: (variant: NoticeVariant) => void;
  ctaLabel: string;
  onCtaLabelChange: (value: string) => void;
  ctaUrl: string;
  onCtaUrlChange: (value: string) => void;
  errors: FormErrors;
}

const VARIANTS: NoticeVariant[] = ["info", "event", "warning", "prayer"];

/**
 * Step 1 — message content.
 * Title, body, variant as selectable cards and an optional call to action.
 */
export function NoticeContentStep({
  title,
  onTitleChange,
  body,
  onBodyChange,
  variant,
  onVariantChange,
  ctaLabel,
  onCtaLabelChange,
  ctaUrl,
  onCtaUrlChange,
  errors,
}: NoticeContentStepProps) {
  const titleNearLimit = title.length >= 100;
  const bodyNearLimit = body.length >= 1800;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="notice-title" className="font-mono text-xs text-faint">
            Título
          </Label>
          <span className={`font-mono text-[11px] ${titleNearLimit ? "text-warning" : "text-faint"}`}>{title.length}/120</span>
        </div>
        <Input
          id="notice-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={120}
          placeholder="Ej: Vigilia este viernes 8PM"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "notice-title-error" : undefined}
          autoFocus
          className="border-border bg-sunken"
        />
        {errors.title && (
          <p id="notice-title-error" role="alert" className="font-mono text-[11px] text-destructive">
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="notice-body" className="font-mono text-xs text-faint">
            Mensaje · admite saltos de línea
          </Label>
          <span className={`font-mono text-[11px] ${bodyNearLimit ? "text-warning" : "text-faint"}`}>{body.length}/2000</span>
        </div>
        <Textarea
          id="notice-body"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Mensaje breve, humano. Qué, cuándo, dónde."
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? "notice-body-error" : undefined}
          className="border-border bg-sunken"
        />
        {errors.body && (
          <p id="notice-body-error" role="alert" className="font-mono text-[11px] text-destructive">
            {errors.body}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p id="notice-variant-label" className="font-mono text-xs text-faint">
          Tono del aviso
        </p>
        <div role="radiogroup" aria-labelledby="notice-variant-label" className="grid grid-cols-2 gap-2">
          {VARIANTS.map((v) => {
            const cfg = VARIANT_CFG[v];
            const active = variant === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onVariantChange(v)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:border-border hover:bg-sunken"
                }`}
              >
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dot}`} />
                <span className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <details className="group rounded-xl border border-border bg-sunken/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-mono text-xs font-medium text-muted-foreground">
            Llamado a la acción · opcional
            {ctaLabel.trim() || ctaUrl.trim() ? <span className="ml-2 text-primary">●</span> : null}
          </span>
          <span aria-hidden className="font-mono text-xs text-faint transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="space-y-3 border-t border-border px-3.5 py-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="notice-cta-label" className="font-mono text-xs text-faint">
              Etiqueta del botón
            </Label>
            <Input
              id="notice-cta-label"
              value={ctaLabel}
              onChange={(e) => onCtaLabelChange(e.target.value)}
              placeholder="Ej: Ver detalles"
              className="border-border bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notice-cta-url" className="font-mono text-xs text-faint">
              URL https://
            </Label>
            <Input
              id="notice-cta-url"
              value={ctaUrl}
              onChange={(e) => onCtaUrlChange(e.target.value)}
              placeholder="https://..."
              inputMode="url"
              aria-invalid={Boolean(errors.ctaUrl)}
              aria-describedby={errors.ctaUrl ? "notice-cta-url-error" : "notice-cta-hint"}
              className="border-border bg-card font-mono text-xs"
            />
            {errors.ctaUrl ? (
              <p id="notice-cta-url-error" role="alert" className="font-mono text-[11px] text-destructive">
                {errors.ctaUrl}
              </p>
            ) : (
              <p id="notice-cta-hint" className="font-mono text-[11px] leading-relaxed text-faint">
                Se muestra como botón solo si hay etiqueta. Vacío = sin botón.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
