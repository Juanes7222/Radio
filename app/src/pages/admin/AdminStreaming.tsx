import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic2, Plus, Trash2, RefreshCw, Copy, Eye, EyeOff, CheckCircle2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTheme } from '@/hooks';
import type { Streamer } from '@/types/admin';

const STATION_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy} className="text-slate-400 hover:text-primary transition-colors" title="Copiar">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function InfoRow({ label, value, monospace = false }: { label: string; value: string; monospace?: boolean }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-xs shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className={`text-xs truncate ${monospace ? 'font-mono' : ''}`}>{value}</span>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function AdminStreaming() {
  const { getStreamers, createStreamer, deleteStreamer } = useAdminApi();
  const { user } = useAdminAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    streamer_username: '',
    streamer_password: '',
    display_name: '',
    comments: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const stationId = user?.stationId ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStreamers();
      setStreamers(data as Streamer[]);
    } finally {
      setLoading(false);
    }
  }, [getStreamers]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.streamer_username || !formData.streamer_password) {
      setFormError('Usuario y contraseña son obligatorios.');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      await createStreamer(formData);
      setFormData({ streamer_username: '', streamer_password: '', display_name: '', comments: '' });
      setShowForm(false);
      await load();
    } catch {
      setFormError('No se pudo crear el DJ. Verifica que el usuario no exista ya.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar al DJ "${name}"?`)) return;
    setActionId(id);
    try {
      await deleteStreamer(id);
      setStreamers((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setActionId(null);
    }
  };

  const togglePassword = (id: number) =>
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));

  // URL de conexión Icecast
  const icecastHost = STATION_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'localhost';
  const icecastPort = '8000';
  const mountPoint = `/${stationId}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Streaming / DJs</h1>
          <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Gestión de streamers y credenciales de transmisión
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4" />
            Nuevo DJ
          </Button>
        </div>
      </div>

      {/* Datos de conexión Icecast */}
      <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mic2 className="w-4 h-4 text-primary" />
            Datos de conexión para software (BUTT, Mixxx, etc.)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <InfoRow label="Servidor / Host" value={icecastHost} monospace />
          <InfoRow label="Puerto" value={icecastPort} monospace />
          <InfoRow label="Mount point" value={mountPoint} monospace />
          <InfoRow label="Protocolo" value="Icecast" />
          <p className={`text-xs pt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Cada DJ usa su propio usuario y contraseña configurados abajo.
          </p>
        </CardContent>
      </Card>

      {/* Formulario nuevo DJ */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={isDark ? 'border-primary/40 bg-slate-800/60' : 'border-primary/40'}>
            <CardHeader>
              <CardTitle className="text-base">Crear nuevo DJ</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Nombre para mostrar</label>
                    <Input
                      placeholder="DJ Juanes"
                      value={formData.display_name}
                      onChange={(e) => setFormData((d) => ({ ...d, display_name: e.target.value }))}
                      className={isDark ? 'bg-slate-900 border-slate-600' : ''}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Notas</label>
                    <Input
                      placeholder="Programa los miércoles..."
                      value={formData.comments}
                      onChange={(e) => setFormData((d) => ({ ...d, comments: e.target.value }))}
                      className={isDark ? 'bg-slate-900 border-slate-600' : ''}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Usuario *</label>
                    <Input
                      placeholder="dj_juanes"
                      value={formData.streamer_username}
                      onChange={(e) => setFormData((d) => ({ ...d, streamer_username: e.target.value }))}
                      className={`font-mono ${isDark ? 'bg-slate-900 border-slate-600' : ''}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Contraseña *</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={formData.streamer_password}
                      onChange={(e) => setFormData((d) => ({ ...d, streamer_password: e.target.value }))}
                      className={isDark ? 'bg-slate-900 border-slate-600' : ''}
                    />
                  </div>
                </div>
                {formError && (
                  <p className="text-xs text-destructive">{formError}</p>
                )}
                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={formLoading}>
                    {formLoading ? 'Creando...' : 'Crear DJ'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Lista de DJs */}
      {loading && streamers.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className={`animate-pulse ${isDark ? 'border-slate-700 bg-slate-800/60' : ''}`}>
              <CardContent className="pt-6 space-y-3">
                <div className={`h-4 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                <div className={`h-3 w-1/2 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : streamers.length === 0 ? (
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <Mic2 className="w-10 h-10 mx-auto text-slate-400" />
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>No hay DJs configurados.</p>
            <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4" />
              Agregar DJ
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {streamers.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {s.display_name || s.streamer_username}
                      </p>
                      {s.comments && (
                        <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {s.comments}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                        {s.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg space-y-2 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
                    <InfoRow label="Usuario" value={s.streamer_username} monospace />
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Contraseña</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-mono ${!showPasswords[s.id] ? 'tracking-widest' : ''}`}>
                          {showPasswords[s.id] ? s.streamer_password : '••••••••'}
                        </span>
                        <button
                          onClick={() => togglePassword(s.id)}
                          className="text-slate-400 hover:text-primary"
                        >
                          {showPasswords[s.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        {showPasswords[s.id] && <CopyButton text={s.streamer_password} />}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <a
                      href={`${STATION_URL}/station/1/streamers/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Editar en AzuraCast
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-xs h-7"
                      disabled={actionId === s.id}
                      onClick={() => handleDelete(s.id, s.display_name || s.streamer_username)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
