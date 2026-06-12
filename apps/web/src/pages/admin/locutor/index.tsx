import StatusDashboard from './StatusDashboard';
import TemplateEditor from './TemplateEditor';
import AudioBank from './AudioBank';

export default function LocutorAdminPanel() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Locutores Virtuales</h1>
      </div>
      
      <StatusDashboard />
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TemplateEditor />
        <AudioBank />
      </div>
    </div>
  );
}