import StatusDashboard from './StatusDashboard';
import TemplateEditor from './TemplateEditor';
import AudioBank from './AudioBank';

export default function LocutorAdminPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel de Locutores Virtuales</h1>
        <p className="text-sm mt-0.5 text-slate-400">
          Anuncios generados por voz sintetizada y su estado de generación
        </p>
      </div>

      <StatusDashboard />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TemplateEditor />
        <AudioBank />
      </div>
    </div>
  );
}