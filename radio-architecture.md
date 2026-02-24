# Arquitectura RadioStream - Emisora Online 24/7

## Resumen del Proyecto

**RadioStream** es una emisora de radio por internet completamente funcional que opera 24/7, con gestión remota desde cualquier dispositivo y un frontend moderno desarrollado en React para los oyentes.

---

## Arquitectura Técnica

### Backend (Infraestructura)

```
┌─────────────────┐    ┌──────────────────┐
│   Tu VPS        │    │  AzuraCast       │
│  (3-5 USD/mes)  │◄──►│ • Icecast server │
│                 │    │ • AutoDJ 24/7    │
└─────────────────┘    │ • Panel admin web│
                       │ • API pública     │
                       └──────────────────┘
```

**AzuraCast maneja:**
- Streaming 24/7 con música automática (AutoDJ)
- Gestión de playlists, horarios, jingles vía web
- Servidor Icecast/SHOUTcast integrado
- API pública para el frontend React
- Estadísticas de oyentes en tiempo real

### Frontend (React App)

```
React App (Vercel/Netlify gratis)
├── Player HTML5 (stream directo)
├── API polling (nowplaying, listeners)
├── Requests de canciones
├── Responsive mobile-first
└── PWA ready
```

---

## Funcionalidades Principales

### Para el Administrador:
- **Control total 24/7**: Subes música al VPS, programas rotaciones, horarios
- **Gestión remota**: Panel web de AzuraCast desde celular/PC
- **Directos cuando quieras**: Te conectas con BUTT/Mixxx desde cualquier lugar
- **Escalabilidad**: Subes recursos VPS según oyentes

### Para Oyentes (React App):
- **Player moderno** con waveform, controles pro
- **Canción actual** con carátula, artista, progreso
- **Estadísticas live**: cuántos escuchan, mapa
- **Requests**: piden canciones de tu playlist
- **Responsive perfecto** móvil/desktop

---

## Requisitos Funcionales - Frontend Oyentes (React)

### MVP (Fase 1 - Absolutamente necesario)

#### RF-01: Reproducción básica del stream
- Play/pause toggle
- Volume slider (0-100%)
- Mute/unmute
- Indicador de estado: "En vivo" / "AutoDJ"
- Soporte streams: 64kbps, 128kbps (selector bitrate)

#### RF-02: Metadatos canción actual
- Artista + título + álbum
- Carátula álbum (300x300px mínimo)
- Tiempo transcurrido / total
- Actualización automática cada 10-15s
- Fallback imagen si no hay metadatos
- Indicador "En directo" si hay streamer

#### RF-04: Responsive design
- Layout responsive (Tailwind: sm/md/lg)
- Touch-friendly (botones >44px)
- Landscape/portrait en móvil

#### RF-06: Historial reciente
- Lista scrollable: canción + hora reproducción
- Click → abre modal con más info (duración, playlist)

#### RF-07: Controles avanzados reproductor
- Waveform visual (wavesurfer.js)
- Selector calidad: 64/128/320kbps
- Media Session API (controles nativos móvil/desktop)

#### RF-09: Favoritos / compartir
- Botón "Añadir a inicio" (PWA manifest)
- Share API: WhatsApp, Twitter, Facebook

#### RF-10: Notificaciones push
- Service Worker + Push API
- Suscripción opcional

---

## UX/UI Requisitos Transversales

- **RF-UI-01**: Diseño dark/light mode toggle
- **RF-UI-02**: Animaciones suaves (Framer Motion)
- **RF-UI-03**: Loading states y skeletons
- **RF-UI-04**: Error handling (stream caído, API down)
- **RF-UI-05**: Offline support (PWA cache)

---

## Stack Tecnológico

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 3.4
- **UI Components**: shadcn/ui (40+ componentes)
- **Animations**: Framer Motion
- **Audio Visualization**: Web Audio API + Canvas
- **HTTP Client**: Axios
- **PWA**: Service Worker, Manifest, Offline Support

### Backend (AzuraCast)
- **Streaming Server**: Icecast/SHOUTcast
- **AutoDJ**: Liquidsoap
- **Panel Admin**: PHP + Vue.js
- **API**: RESTful JSON
- **Database**: MariaDB

---

## Estructura de Archivos

```
/mnt/okcomputer/output/app/
├── src/
│   ├── components/
│   │   ├── player/           # Componentes del reproductor
│   │   │   ├── RadioPlayer.tsx
│   │   │   ├── WaveformVisualizer.tsx
│   │   │   ├── SongInfo.tsx
│   │   │   ├── SongHistory.tsx
│   │   │   ├── SongRequest.tsx
│   │   │   └── ListenerStats.tsx
│   │   └── ui-custom/        # Componentes UI personalizados
│   │       ├── Header.tsx
│   │       ├── ThemeToggle.tsx
│   │       └── PWAInstall.tsx
│   ├── hooks/                # Custom hooks
│   │   ├── useAudioPlayer.ts
│   │   ├── useAzuraCast.ts
│   │   ├── useMediaSession.ts
│   │   ├── useTheme.ts
│   │   └── useNotifications.ts
│   ├── types/                # Tipos TypeScript
│   │   └── azuracast.ts
│   ├── lib/                  # Utilidades
│   │   └── utils.ts
│   ├── App.tsx               # App principal
│   └── main.tsx              # Entry point
├── public/                   # Assets públicos
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                # Service Worker
│   └── icons/               # Iconos PWA
└── .env                     # Variables de entorno
```

---

## Guía de Configuración

### 1. Configurar Backend (AzuraCast en VPS)

```bash
# En tu VPS (3-5 USD/mes recomendado)
# Instalar AzuraCast con Docker

mkdir -p /var/azuracast
cd /var/azuracast

curl -fsSL https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/docker.sh > docker.sh
chmod a+x docker.sh
./docker.sh install
```

### 2. Configurar el Frontend

Edita el archivo `.env` en el proyecto:

```bash
# /mnt/okcomputer/output/app/.env
VITE_STATION_URL=https://tu-radio.dominio.com
```

### 3. Subir música y configurar playlists

1. Accede al panel de AzuraCast: `https://tu-radio.dominio.com`
2. Sube tu música en **Music Files**
3. Crea **Playlists** con rotaciones automáticas
4. Configura **AutoDJ** para 24/7

### 4. Conectar desde tu PC (Directos)

Usa **BUTT** o **Mixxx** para transmitir en vivo:
- Server Type: Icecast 2
- Host: tu VPS IP/dominio
- Port: 8000
- Mountpoint: /radio.mp3
- Password: (de AzuraCast)

---

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_STATION_URL` | URL de tu servidor AzuraCast | `https://radio.midominio.com` |

---

## API Endpoints (AzuraCast)

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/nowplaying` | Datos de reproducción actual |
| `GET /api/station/{id}/requests` | Buscar canciones para solicitar |
| `POST /api/station/{id}/request/{songId}` | Solicitar canción |

---

## Instalación como PWA

1. Abre la URL en Chrome/Safari/Edge
2. Verás un banner "Instalar aplicación"
3. O manualmente: **Menú → Añadir a pantalla de inicio**
4. ¡Listo! Funciona como app nativa

---

## Personalización

Para cambiar colores, edita `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        DEFAULT: '#3b82f6', // Cambia este color
      },
    },
  },
}
```

---

## URL del Proyecto Desplegado

**Frontend**: https://ijt7kl2gswcks.ok.kimi.link

---

## Próximos Pasos

1. Configurar VPS con AzuraCast
2. Actualizar URL en `.env`
3. Subir música y crear playlists
4. Personalizar branding (colores, logo)
5. Configurar dominio propio
6. Activar SSL (Let's Encrypt)

---

*Documento generado el 2026-02-24*
