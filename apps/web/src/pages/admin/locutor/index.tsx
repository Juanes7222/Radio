import { useState } from 'react';
import { AudioLines, Library, Megaphone, NotebookPen } from 'lucide-react';
import StatusDashboard from './StatusDashboard';
import AnnouncementSettings from './AnnouncementSettings';
import TemplateEditor from './TemplateEditor';
import AudioBank from './AudioBank';
import { SectionRail, type RailSection } from './SectionRail';

/**
 * The locutor console, split into four rack units.
 *
 * Stacking every area on one page meant the operator scrolled past the credit
 * pool to reach the templates and past the templates to reach the audio bank.
 * The order below is the order of questions, not the order of the module:
 * which engine speaks, when may it speak, what will it say, what has it said.
 *
 * Units stay mounted while hidden on purpose. Unmounting would drop the
 * template form the operator is halfway through, the audio bank selection and
 * the polled engine status the moment they glance at another unit, and all
 * three are cheap to keep.
 */

const SECTIONS: RailSection[] = [
  {
    id: 'motor',
    label: 'Motor',
    caption: 'Voz y créditos',
    icon: AudioLines,
  },
  {
    id: 'plan',
    label: 'Plan de hoy',
    caption: 'Cuándo puede hablar',
    icon: Megaphone,
  },
  {
    id: 'voz',
    label: 'Voz',
    caption: 'Plantillas y texto',
    icon: NotebookPen,
  },
  {
    id: 'banco',
    label: 'Banco',
    caption: 'Audios generados',
    icon: Library,
  },
];

export default function LocutorAdminPanel() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
          Contenido · locutor
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Locutor virtual</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          La estación anuncia la hora por voz sintetizada. Estos son los motores que la hablan, las
          horas en las que puede hablar y el texto que dice.
        </p>
      </header>

      <SectionRail sections={SECTIONS} activeId={activeId} onChange={setActiveId} />

      {SECTIONS.map((section) => (
        <div
          key={section.id}
          id={`panel-${section.id}`}
          role="tabpanel"
          aria-labelledby={`rail-${section.id}`}
          hidden={section.id !== activeId}
          className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          tabIndex={0}
        >
          {section.id === 'motor' && <StatusDashboard />}
          {section.id === 'plan' && <AnnouncementSettings />}
          {section.id === 'voz' && <TemplateEditor />}
          {section.id === 'banco' && <AudioBank />}
        </div>
      ))}
    </div>
  );
}