import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  RadioPlayer, 
  SongHistory, 
  SongRequest, 
} from '@/components/player';
import { Header, PWAInstall } from '@/components/ui-custom';
import { useAzuraCast, useTheme } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Radio, 
  Info
} from 'lucide-react';
import type { StreamQuality } from '@/types/azuracast';

// Configuración de la estación
const STATION_URL = import.meta.env.VITE_STATION_URL || '';
const STATION_ID = import.meta.env.VITE_STATION_ID || 'la_voz_de_la_verdad';

function App() {
  const { resolvedTheme } = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [quality, setQuality] = useState<StreamQuality>('128');

  const { 
    data, 
    isLoading, 
    error, 
    history, 
    getStreamUrl,
  } = useAzuraCast({ 
    stationUrl: STATION_URL,
    stationId: STATION_ID,
    pollInterval: 15000,
  });

  const streamUrl = getStreamUrl(quality);

  const handleQualityChange = (newQuality: StreamQuality) => {
    setQuality(newQuality);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      resolvedTheme === 'dark' 
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900'
    }`}>
      <Header stationName={data?.station?.name} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-primary mb-6 shadow-2xl"
          >
            <Radio className="w-12 h-12 text-primary-foreground" />
          </motion.div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            {data?.station?.name || 'RadioStream'}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {data?.station?.description || 'La Voz de la Verdad es una emisora cristiana online donde proclamamos el mensaje de Jesucristo y la obra del Padre, del Hijo y del Espíritu Santo'}
          </p>
        </motion.section>

        {/* Player Principal */}
        <section className="mb-8">
          <RadioPlayer
            stationData={data}
            streamUrl={streamUrl}
            isLoading={isLoading}
            error={error}
            onQualityChange={handleQualityChange}
            onShowHistory={() => setShowHistory(true)}
            onShowRequests={() => setShowRequests(true)}
          />
        </section>
        

        {/* Info Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <Card className={resolvedTheme === 'dark' ? 'bg-slate-800/50 border-slate-700' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-4">
                <Info className="w-5 h-5" />
                <span className="font-medium">¿Cómo escuchar?</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong className="block mb-1">Desde el navegador</strong>
                  <span className="text-muted-foreground">Reproduce directamente desde esta página</span>
                </div>
                <div>
                  <strong className="block mb-1">En tu móvil</strong>
                  <span className="text-muted-foreground">Instala la app PWA para acceso rápido</span>
                </div>

              </div>
            </CardContent>
          </Card>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className={`border-t mt-12 py-8 ${
        resolvedTheme === 'dark' ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {data?.station?.name || 'RadioStream'} - 
            Powered by AzuraCast
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <button 
              className="text-sm text-primary hover:underline"
              onClick={() => setShowHistory(true)}
            >
              Historial
            </button>
            <button 
              className="text-sm text-primary hover:underline"
              onClick={() => setShowRequests(true)}
            >
              Solicitar canción
            </button>
          </div>
        </div>
      </footer>

      {/* Modales */}
      <SongHistory
        history={history}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        isLoading={isLoading}
        theme={resolvedTheme}
      />

      <SongRequest
        stationUrl={STATION_URL}
        stationId={STATION_ID}
        isOpen={showRequests}
        onClose={() => setShowRequests(false)}
        theme={resolvedTheme}
      />

      {/* PWA Install Dialog */}
      <PWAInstall />
    </div>
  );
}

export default App;
