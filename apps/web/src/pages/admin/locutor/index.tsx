import StatusDashboard from './StatusDashboard';
import TemplateEditor from './TemplateEditor';
import AudioBank from './AudioBank';
import AnnouncementSettings from './AnnouncementSettings';

export default function LocutorAdminPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Panel de Locutores Virtuales</h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          Anuncios generados por voz sintetizada y su estado de generación
        </p>
      </div>

      <StatusDashboard />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Avisos de hora</h2>
        <p className="text-sm text-muted-foreground">
          Cuándo se emiten y cuándo se omiten para no cortar ningún programa
        </p>
      </div>

      <AnnouncementSettings />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TemplateEditor />
        <AudioBank />
      </div>
    </div>
  );
}