import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Loader2, Heart } from 'lucide-react';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/config';

interface PrayerRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrayerRequestDialog = memo(function PrayerRequestDialog({
  isOpen,
  onClose,
}: PrayerRequestDialogProps) {
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [acceptsDataTreatment, setAcceptsDataTreatment] = useState(false);
  const [acceptsCommunications, setAcceptsCommunications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const apiBaseUrl = API_BASE_URL;

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedRequest = request.trim();

    if (!trimmedName || !trimmedRequest) {
      setStatus('error');
      setMessage('Por favor completa todos los campos.');
      return;
    }

    if (!acceptsDataTreatment) {
      setStatus('error');
      setMessage('Debes aceptar la Política de Tratamiento de Datos Personales.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    try {
      const res = await fetch(`${apiBaseUrl}/api/prayer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, request: trimmedRequest }),
      });

      if (res.ok) {
        setStatus('success');
        setMessage('Tu petición ha sido enviada. ¡Oraremos por ti!');
        setName('');
        setRequest('');
        setAcceptsCommunications(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus('error');
        setMessage(data.error || 'Error al enviar la petición. Intenta de nuevo.');
      }
    } catch {
      setStatus('error');
      setMessage('Error de conexión. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  }, [name, request, acceptsDataTreatment, apiBaseUrl]);

  const handleClose = () => {
    setStatus('idle');
    setMessage('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full flex flex-col gap-0 p-0 max-h-[85vh] overflow-hidden bg-slate-900 border-slate-700">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500" />
            Petición de oración
          </DialogTitle>
          <DialogDescription className="sr-only">
            Envía tu petición de oración y nuestro equipo intercederá por ti
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">
              Nombre
            </label>
            <Input
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="bg-slate-800 border-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">
              Petición
            </label>
            <Textarea
              placeholder="Escribe tu petición de oración..."
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={loading}
              rows={4}
              className="bg-slate-800 border-slate-700"
            />
            <p className="text-xs leading-relaxed text-amber-400/80">
              Evita incluir datos personales sensibles (salud, situación familiar o económica) o información de otras personas que no sea necesaria para tu petición.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={acceptsDataTreatment}
                onCheckedChange={(checked) => setAcceptsDataTreatment(checked === true)}
                disabled={loading}
                aria-label="Aceptar tratamiento de datos personales"
                className="mt-0.5 bg-slate-800 border-slate-600"
              />
              <span className="text-xs leading-relaxed text-slate-400">
                He leído y acepto la{' '}
                <Link
                  to="/info/data-treatment"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Política de Tratamiento de Datos Personales
                </Link>{' '}
                y autorizo el tratamiento de mis datos para gestionar esta petición de oración.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={acceptsCommunications}
                onCheckedChange={(checked) => setAcceptsCommunications(checked === true)}
                disabled={loading}
                aria-label="Autorizar comunicaciones de la emisora"
                className="mt-0.5 bg-slate-800 border-slate-600"
              />
              <span className="text-xs leading-relaxed text-slate-400">
                Autorizo el envío de comunicaciones relacionadas con la emisora y sus actividades.
              </span>
            </label>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {loading ? 'Enviando...' : 'Enviar petición'}
          </Button>

          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  status === 'success'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                }`}
              >
                {status === 'success' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm">{message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
});
