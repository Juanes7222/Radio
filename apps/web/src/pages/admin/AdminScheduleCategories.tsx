import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Tags, Plus, X, Pencil, Trash2, RefreshCw, Eye, EyeOff, Music, Mic, Radio, Book, Flag, Bell, Heart, Newspaper, Sparkles, User, Star, MessageSquare, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { ScheduleCategory } from '@radio/types';

const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: 'radio', label: 'Radio' },
  { value: 'music', label: 'Música' },
  { value: 'mic', label: 'Micrófono' },
  { value: 'book', label: 'Libro' },
  { value: 'flag', label: 'Bandera' },
  { value: 'bell', label: 'Campana' },
  { value: 'heart', label: 'Corazón' },
  { value: 'news', label: 'Noticias' },
  { value: 'sparkles', label: 'Destellos' },
  { value: 'user', label: 'Persona' },
  { value: 'star', label: 'Estrella' },
  { value: 'message', label: 'Mensaje' },
];

const COLOR_PRESETS = [
  '#e8883a',
  '#4f98a3',
  '#a86fdf',
  '#6daa45',
  '#dd6974',
  '#e8af34',
  '#8b92a5',
];

const emptyForm = {
  name: '',
  description: '',
  color: '#4f98a3',
  icon: 'radio',
  keywords: '',
  isVisible: true,
  sortOrder: 0,
};

export default function AdminScheduleCategories() {
  const {
    getScheduleCategories,
    createScheduleCategory,
    updateScheduleCategory,
    deleteScheduleCategory,
  } = useAdminApi();

  const [categories, setCategories] = useState<ScheduleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const data = await getScheduleCategories();
    setCategories(data);
  }, [getScheduleCategories]);

  useEffect(() => {
    let cancelled = false;
    getScheduleCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [getScheduleCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (category: ScheduleCategory) => {
    setEditing(category);
    setForm({
      name: category.name,
      description: category.description ?? '',
      color: category.color,
      icon: category.icon,
      keywords: category.keywords,
      isVisible: category.isVisible,
      sortOrder: category.sortOrder,
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) {
      setFormError('El color debe tener formato hexadecimal (#RRGGBB).');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
        icon: form.icon,
        keywords: form.keywords.trim(),
        isVisible: form.isVisible,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) {
        await updateScheduleCategory(editing.id, payload);
      } else {
        await createScheduleCategory(payload);
      }
      setShowForm(false);
      await load();
    } catch {
      setFormError('No se pudo guardar la categoría. Verifica que los datos sean válidos.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleVisibility = async (category: ScheduleCategory) => {
    setActionId(category.id);
    try {
      await updateScheduleCategory(category.id, { isVisible: !category.isVisible });
      await load();
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (category: ScheduleCategory) => {
    if (!confirm(`¿Eliminar la categoría "${category.name}"? Esta acción no se puede deshacer.`)) return;
    setActionId(category.id);
    try {
      await deleteScheduleCategory(category.id);
      await load();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tipos de programa</h1>
          <p className="text-sm mt-0.5 text-slate-400">
            {categories.length} categoría{categories.length !== 1 ? 's' : ''} · Se asignan
            automáticamente según el título del programa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => (showForm ? setShowForm(false) : openCreate())}>
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancelar' : 'Nueva categoría'}
          </Button>
        </div>
      </div>

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/40 bg-slate-800/60">
            <CardHeader>
              <CardTitle className="text-base">
                {editing ? `Editar: ${editing.name}` : 'Nueva categoría'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium">Nombre *</label>
                    <Input
                      placeholder="Ej: PREDICAS DOMINICAL"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="bg-slate-900 border-slate-600"
                    />
                    <p className="text-xs text-slate-500">
                      Debe coincidir con el nombre del programa en AzuraCast para visualizarse igual en el público.
                    </p>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium">Descripción</label>
                    <Input
                      placeholder="Ej: Predicación grabada de la convención"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      className="bg-slate-900 border-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Palabras clave (separadas por coma)</label>
                    <Input
                      placeholder="Ej: PREDICAS,REV JOSE SOTO,CONVENCION"
                      value={form.keywords}
                      onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                      className="bg-slate-900 border-slate-600"
                    />
                    <p className="text-xs text-slate-500">
                      Se buscan dentro del título del programa. Sin acentos ni tildes.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Icono</label>
                    <Select value={form.icon} onValueChange={(v) => setForm((f) => ({ ...f, icon: v }))}>
                      <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                        className="w-10 h-9 rounded-md border cursor-pointer bg-transparent"
                      />
                      <Input
                        value={form.color}
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                        className="font-mono bg-slate-900 border-slate-600"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, color: preset }))}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            form.color === preset ? 'border-primary' : 'border-transparent'
                          }`}
                          style={{ background: preset }}
                          aria-label={`Color ${preset}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Orden</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                      className="bg-slate-900 border-slate-600"
                    />
                  </div>
                  <div className="flex items-end gap-3 pb-1">
                    <input
                      type="checkbox"
                      id="isVisible"
                      checked={form.isVisible}
                      onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <label htmlFor="isVisible" className="text-sm">
                      Visible para los oyentes
                    </label>
                  </div>
                </div>
                {formError && <p className="text-xs text-destructive">{formError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={formLoading}>
                    {formLoading ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear categoría'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading && categories.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-pulse bg-slate-700" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card className="border-slate-700 bg-slate-800/60">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <Tags className="w-10 h-10 mx-auto text-slate-400" />
            <p className="text-slate-400">
              No hay categorías configuradas. Crea la primera para clasificar la programación.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((category, i) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card
                className={`transition-opacity ${!category.isVisible ? 'opacity-60' : ''} border-slate-700 bg-slate-800/60`}
              >
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${category.color}26`, color: category.color }}
                  >
                    <CategoryIcon iconName={category.icon} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{category.name}</p>
                      {!category.isVisible && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Oculta
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs truncate text-slate-400">
                      {category.description || 'Sin descripción'}
                      {category.keywords ? ` · Claves: ${category.keywords}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={actionId === category.id}
                      onClick={() => handleToggleVisibility(category)}
                      title={category.isVisible ? 'Ocultar del público' : 'Mostrar al público'}
                    >
                      {category.isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={actionId === category.id}
                      onClick={() => openEdit(category)}
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={actionId === category.id}
                      onClick={() => handleDelete(category)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
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

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  music: Music,
  mic: Mic,
  radio: Radio,
  book: Book,
  flag: Flag,
  bell: Bell,
  heart: Heart,
  news: Newspaper,
  sparkles: Sparkles,
  user: User,
  star: Star,
  message: MessageSquare,
};

function CategoryIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = CATEGORY_ICONS[iconName] ?? Tags;
  return <Icon className={className} />;
}
