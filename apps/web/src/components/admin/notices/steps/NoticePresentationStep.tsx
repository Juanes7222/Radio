import { BellMinus, MonitorUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NoticeMediaField } from "@/components/admin/notices/NoticeMediaField";
import { NoticeGalleryEditor } from "@/components/admin/notices/NoticeGalleryEditor";
import type {
  NoticeDisplayMode,
  NoticeGalleryItemInput,
  NoticeImage,
  NoticeVideo,
} from "@radio/types";

interface NoticePresentationStepProps {
  displayMode: NoticeDisplayMode;
  onDisplayModeChange: (mode: NoticeDisplayMode) => void;
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  localImagePreview: string | null;
  onLocalImagePreviewChange: (url: string | null) => void;
  imageUploading: boolean;
  onImageUpload: (file: File) => Promise<string | null>;
  imageLibrary: NoticeImage[];
  imageLibraryLoading: boolean;
  imageLibraryOpen: boolean;
  onImageLibraryOpenChange: (open: boolean) => void;
  onLoadImageLibrary: () => void;
  onDeleteImage: (id: string) => void;
  videoUrl: string;
  onVideoUrlChange: (url: string) => void;
  localVideoPreview: string | null;
  onLocalVideoPreviewChange: (url: string | null) => void;
  videoUploading: boolean;
  onVideoUpload: (file: File) => Promise<string | null>;
  videoLibrary: NoticeVideo[];
  videoLibraryLoading: boolean;
  videoLibraryOpen: boolean;
  onVideoLibraryOpenChange: (open: boolean) => void;
  onLoadVideoLibrary: () => void;
  onDeleteVideo: (id: string) => void;
  gallery: NoticeGalleryItemInput[];
  onGalleryChange: (next: NoticeGalleryItemInput[]) => void;
  onUploadGalleryImage: (file: File) => Promise<string | null>;
  onUploadGalleryVideo: (file: File) => Promise<{ url: string; posterUrl: string | null } | null>;
}

/**
 * Step 2 — how the notice appears.
 * Display mode cards plus media grouped in tabs to avoid one endless column.
 */
export function NoticePresentationStep({
  displayMode,
  onDisplayModeChange,
  imageUrl,
  onImageUrlChange,
  localImagePreview,
  onLocalImagePreviewChange,
  imageUploading,
  onImageUpload,
  imageLibrary,
  imageLibraryLoading,
  imageLibraryOpen,
  onImageLibraryOpenChange,
  onLoadImageLibrary,
  onDeleteImage,
  videoUrl,
  onVideoUrlChange,
  localVideoPreview,
  onLocalVideoPreviewChange,
  videoUploading,
  onVideoUpload,
  videoLibrary,
  videoLibraryLoading,
  videoLibraryOpen,
  onVideoLibraryOpenChange,
  onLoadVideoLibrary,
  onDeleteVideo,
  gallery,
  onGalleryChange,
  onUploadGalleryImage,
  onUploadGalleryVideo,
}: NoticePresentationStepProps) {
  const isModal = displayMode === "modal";
  const mediaCount = (imageUrl ? 1 : 0) + (videoUrl ? 1 : 0) + gallery.length;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p id="notice-display-mode-label" className="font-mono text-xs text-faint">
          Modo de aparición
        </p>
        <div role="radiogroup" aria-labelledby="notice-display-mode-label" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            role="radio"
            aria-checked={!isModal}
            onClick={() => onDisplayModeChange("toast")}
            className={`flex gap-3 rounded-xl border p-3.5 text-left transition-colors ${
              !isModal ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-sunken"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                !isModal ? "bg-primary text-primary-foreground" : "bg-sunken text-muted-foreground"
              }`}
            >
              <BellMinus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Discreto</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">Tarjeta abajo, no interrumpe la escucha.</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isModal}
            onClick={() => onDisplayModeChange("modal")}
            className={`flex gap-3 rounded-xl border p-3.5 text-left transition-colors ${
              isModal ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-sunken"
            }`}
          >
            <span
              aria-hidden
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                isModal ? "bg-primary text-primary-foreground" : "bg-sunken text-muted-foreground"
              }`}
            >
              <MonitorUp className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Anuncio central</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">Ocupa el centro al entrar, se cierra fácil.</span>
            </span>
          </button>
        </div>
        {isModal && (
          <p className="rounded-lg bg-warning/10 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-warning ring-1 ring-warning/20">
            Modo intrusivo: aparece una sola vez al entrar y respeta el límite por usuario. Úsalo solo para avisos que no pueden perderse.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-xs text-faint">Multimedia · opcional</p>
          {mediaCount > 0 && <span className="font-mono text-[11px] text-primary">{mediaCount} adjunto{mediaCount !== 1 ? "s" : ""}</span>}
        </div>
        <Tabs defaultValue="image" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-sunken">
            <TabsTrigger value="image">Imagen</TabsTrigger>
            <TabsTrigger value="video">Video</TabsTrigger>
            <TabsTrigger value="carousel" disabled={!isModal}>
              Carrusel{isModal ? ` · ${gallery.length}` : ""}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="image" className="pt-1">
            <NoticeMediaField
              kind="image"
              value={imageUrl}
              onChange={onImageUrlChange}
              localPreview={localImagePreview}
              onLocalPreviewChange={onLocalImagePreviewChange}
              uploading={imageUploading}
              onUpload={onImageUpload}
              library={imageLibrary}
              libraryLoading={imageLibraryLoading}
              libraryOpen={imageLibraryOpen}
              onLibraryOpenChange={onImageLibraryOpenChange}
              onLoadLibrary={onLoadImageLibrary}
              onDeleteFromLibrary={onDeleteImage}
            />
          </TabsContent>
          <TabsContent value="video" className="pt-1">
            <NoticeMediaField
              kind="video"
              value={videoUrl}
              onChange={onVideoUrlChange}
              localPreview={localVideoPreview}
              onLocalPreviewChange={onLocalVideoPreviewChange}
              uploading={videoUploading}
              onUpload={onVideoUpload}
              library={videoLibrary}
              libraryLoading={videoLibraryLoading}
              libraryOpen={videoLibraryOpen}
              onLibraryOpenChange={onVideoLibraryOpenChange}
              onLoadLibrary={onLoadVideoLibrary}
              onDeleteFromLibrary={onDeleteVideo}
            />
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
              Si hay video e imagen, el video se muestra primero.
            </p>
          </TabsContent>
          <TabsContent value="carousel" className="pt-1">
            {isModal ? (
              <NoticeGalleryEditor
                value={gallery}
                onChange={onGalleryChange}
                onUploadImage={onUploadGalleryImage}
                onUploadVideo={onUploadGalleryVideo}
                imageLibrary={imageLibrary}
                videoLibrary={videoLibrary}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-sunken/50 px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                El carrusel solo está disponible en modo central. Cambia el modo para activarlo.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
