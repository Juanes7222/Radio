import { useState, useEffect } from 'react';

interface Template {
  id: number;
  type: string;
  name: string;
  text_template: string;
  voice: string;
  speed: number;
}

const EMPTY_TEMPLATE: Template = {
  id: 0,
  type: 'custom',
  name: '',
  text_template: '',
  voice: 'ef_dora',
  speed: 0.85,
};

export default function TemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const fetchTemplates = () => {
    fetch('/admin-api/locutor/templates')
      .then(res => res.json())
      .then(setTemplates)
      .catch(console.error);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    const method = editingTemplate.id ? 'PUT' : 'POST';
    const url = editingTemplate.id ? `/admin-api/locutor/templates/${editingTemplate.id}` : '/admin-api/locutor/templates';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTemplate)
    });
    
    setEditingTemplate(null);
    fetchTemplates();
  };

  const handleGenerate = async (id: number) => {
    if (!confirm('¿Generar audio prueba para esta plantilla?')) return;
    await fetch(`/admin-api/locutor/audios/generate/${id}`, { method: 'POST', body: JSON.stringify({ variables: {} }), headers: { 'Content-Type': 'application/json' } });
    alert('Generación iniciada. Revisa el banco de audios.');
  };

  return (
    <div className="bg-slate-900 border border-slate-700 p-6 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">Plantillas de Anuncios</h2>
        <button 
          onClick={() => setEditingTemplate({ ...EMPTY_TEMPLATE })}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm"
        >
          + Nueva Plantilla
        </button>
      </div>

      {editingTemplate && (
        <form onSubmit={handleSave} className="mb-8 p-4 bg-slate-800 rounded-md">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
             <div>
               <label className="block text-sm text-slate-300">Nombre</label>
               <input type="text" required value={editingTemplate.name} onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm" />
             </div>
             <div>
               <label className="block text-sm text-slate-300">Tipo</label>
               <select value={editingTemplate.type} onChange={e => setEditingTemplate({...editingTemplate, type: e.target.value})} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm">
                 <option value="hourly">Hora en punto</option>
                 <option value="custom">Personalizado</option>
               </select>
             </div>
             <div>
               <label className="block text-sm text-slate-300">Voz</label>
               <select value={editingTemplate.voice} onChange={e => setEditingTemplate({...editingTemplate, voice: e.target.value})} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm">
                 <option value="ef_dora">Dora (Femenina - ES)</option>
                 <option value="em_alex">Alex (Masculina - ES)</option>
               </select>
             </div>
          </div>
          <div className="mb-4">
             <label className="block text-sm text-slate-300">Plantilla de Texto</label>
             <textarea required rows={3} value={editingTemplate.text_template} onChange={e => setEditingTemplate({...editingTemplate, text_template: e.target.value})} className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"></textarea>
              <p className="text-xs text-slate-400 mt-1">Variables: {'{{hour}}'}, {'{{period}}'}, {'{{station_name}}'}, {'{{day}}'}, {'{{date}}'}, {'{{time_text}}'}</p>
              <p className="text-xs text-slate-400">Ej: "Muy buenas {'{{period_greeting}}'}. {'{{time_text}}'}. Esto es {'{{station_name}}'}."</p>
          </div>
          <div className="flex justify-end space-x-3">
             <button type="button" onClick={() => setEditingTemplate(null)} className="px-4 py-2 border border-slate-600 rounded-md text-sm text-slate-300">Cancelar</button>
             <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm">Guardar</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-slate-700">
        {templates.map(t => (
          <li key={t.id} className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{t.name} <span className="text-xs text-slate-400">[{t.type}]</span></p>
              <p className="text-sm text-slate-400 italic mt-1">{t.text_template}</p>
            </div>
            <div className="flex space-x-3">
              <button onClick={() => handleGenerate(t.id)} className="text-indigo-400 hover:text-indigo-300 text-sm">Generar Test</button>
              <button onClick={() => setEditingTemplate(t)} className="text-blue-400 hover:text-blue-300 text-sm">Editar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}