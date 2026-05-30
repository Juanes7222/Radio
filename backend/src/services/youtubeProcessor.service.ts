import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const execAsync = promisify(exec);

export async function processYouTubeVideoAsync(videoId: string, title: string, channelId: string) {
  try {
    // 1. Verificar si ya existe para evitar procesos duplicados
    const existing = await prisma.youTubeVideo.findUnique({
      where: { videoId }
    });

    if (existing) {
      console.log(`[YouTube] El video ${videoId} ya fue registrado. Ignorando webhook repetido.`);
      return;
    }

    // 2. Registrar como pendiente inmediatamente
    await prisma.youTubeVideo.create({
      data: {
        videoId,
        channelId,
        title,
        status: 'PENDING'
      }
    });

    console.log(`[YouTube] Iniciando proceso en segundo plano para: ${title} (${videoId})`);

    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // 3. Obtener metadata usando yt-dlp para saber la duración (en segundos)
    console.log(`[YouTube] Obteniendo metadata de ${videoId}...`);
    const { stdout } = await execAsync(`yt-dlp --dump-json ${url}`);
    
    // Validar si el stdout no viene vacío (ej. es un directo que aún no arranca)
    if (!stdout.trim()) {
      throw new Error("No se pudo obtener metadata, ¿es un directo programado?");
    }

    const metadata = JSON.parse(stdout);
    const durationSeconds = metadata.duration || 0;

    // Actualizar duración en BD
    await prisma.youTubeVideo.update({
      where: { videoId },
      data: { duration: durationSeconds }
    });

    // 4. Validar si dura menos de 10 minutos (600 segundos)
    if (durationSeconds >= 600) {
      console.log(`[YouTube] Video descartado. Dura ${durationSeconds} seg (más de 10 min).`);
      await prisma.youTubeVideo.update({
        where: { videoId },
        data: { status: 'IGNORED' }
      });
      return;
    }

    // 5. Descargar el video como audio MP3
    const mediaDir = path.resolve(__dirname, '../../../data/youtube');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const outTemplate = path.join(mediaDir, `${videoId}.%(ext)s`);
    const finalPath = path.join(mediaDir, `${videoId}.mp3`);

    console.log(`[YouTube] Descargando y convirtiendo a mp3: ${videoId}...`);
    // -x extrae audio, --audio-format mp3
    await execAsync(`yt-dlp -x --audio-format mp3 -o "${outTemplate}" ${url}`);

    // 6. Marcar como completado
    await prisma.youTubeVideo.update({
      where: { videoId },
      data: { 
        status: 'DOWNLOADED', 
        downloadUrl: finalPath 
      }
    });

    console.log(`[YouTube] ¡Descarga exitosa de ${videoId}! Listo para programar.`);
    
    /**
     * Aquí puedes agregar la lógica para programar este MP3 en Azuracast
     */

  } catch (error) {
    console.error(`[YouTube] Error procesando video ${videoId}:`, error);
    
    // Tratamos de marcarlo con error si falló algo
    try {
      await prisma.youTubeVideo.update({
        where: { videoId },
        data: { status: 'ERROR' }
      });
    } catch(dbErr) {
        // Ignorar si falla la db al guardar el error
    }
  }
}
