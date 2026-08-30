import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import type { NoticeImage, NoticeVideo } from "@radio/types";

type MediaType = "image" | "video";

interface UseNoticeMediaLibraryOptions {
  type: MediaType;
  pageSize?: number;
}

/**
 * Generic hook for managing a reusable notice media library (images or videos).
 * Encapsulates fetching, uploading and deletion with loading states.
 */
export function useNoticeMediaLibrary(options: UseNoticeMediaLibraryOptions) {
  const { type, pageSize = 24 } = options;
  const { getNoticeImages, uploadNoticeImage, deleteNoticeImage, getNoticeVideos, uploadNoticeVideo, deleteNoticeVideo } =
    useAdminApi();

  const [items, setItems] = useState<Array<NoticeImage | NoticeVideo>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res =
        type === "image"
          ? await getNoticeImages({ limit: pageSize })
          : await getNoticeVideos({ limit: pageSize });
      setItems(res.rows as Array<NoticeImage | NoticeVideo>);
    } catch {
      toast.error(type === "image" ? "No se pudo cargar la biblioteca" : "No se pudo cargar la biblioteca de videos");
    } finally {
      setLoading(false);
    }
  }, [type, pageSize, getNoticeImages, getNoticeVideos]);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      const maxBytes = type === "image" ? 20 * 1024 * 1024 : 120 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error(`Máx ${Math.round(maxBytes / 1024 / 1024)} MB`);
        return null;
      }
      if (type === "image" && !file.type.startsWith("image/")) {
        toast.error("Solo imágenes");
        return null;
      }
      if (type === "video" && !file.type.startsWith("video/")) {
        toast.error("Solo videos");
        return null;
      }
      setUploading(true);
      try {
        const record =
          type === "image" ? await uploadNoticeImage(file) : await uploadNoticeVideo(file);
        await load();
        return record.url;
      } catch {
        toast.error(type === "image" ? "No se pudo subir la imagen" : "No se pudo subir el video");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [type, uploadNoticeImage, uploadNoticeVideo, load]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        if (type === "image") await deleteNoticeImage(id);
        else await deleteNoticeVideo(id);
        toast.success(type === "image" ? "Imagen eliminada" : "Video eliminado");
        await load();
      } catch {
        toast.error("No se pudo eliminar");
      }
    },
    [type, deleteNoticeImage, deleteNoticeVideo, load]
  );

  return {
    items,
    loading,
    uploading,
    isOpen,
    setIsOpen,
    load,
    upload,
    remove,
  };
}
