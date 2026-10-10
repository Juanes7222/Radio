import StatusDashboard from './StatusDashboard';
import AnnouncementSettings from './AnnouncementSettings';
import TemplateEditor from './TemplateEditor';
import AudioBank from './AudioBank';
import { Section } from './Section';
import { Megaphone, NotebookPen, Library } from 'lucide-react';

/**
 * The locutor console, in four zones.
 *
 * The order is the operator's order of questions, not the module's: is the
 * engine speaking (Estado), is it safe to speak right now (Programación de
 * hoy), what will it say (Plantillas), and what has it already said (Banco).
 * Each zone owns its own heading, so the page reads as a console with four
 * readouts rather than a stack of cards.
 */
export default function LocutorAdminPanel() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
          Contenido · locutor
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Locutor virtual
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          La estación anuncia la hora por voz sintetizada. Estos son los motores que la hablan, las
          horas en las que puede hablar y el texto que dice.
        </p>
      </header>

      <StatusDashboard />

      <Section
        eyebrow="Programación de hoy"
        title="Cuándo puede hablar el locutor"
        description="El aire libre sale de la programación real. Un aviso solo se emite si cae dentro de una ventana libre y nunca hay una persona transmitiendo."
        icon={Megaphone}
      >
        <AnnouncementSettings />
      </Section>

      <Section
        eyebrow="Voz"
        title="Plantillas de anuncios"
        description="El texto que se sintetiza. Las variables se reemplazan por la hora y por el nombre de la estación en cada locución."
        icon={NotebookPen}
      >
        <TemplateEditor />
      </Section>

      <Section
        eyebrow="Archivo"
        title="Banco de audios"
        description="Cada locución ya generada. El sistema solo reutiliza las que están listas, así que borrar una es la forma de forzar una nueva."
        icon={Library}
      >
        <AudioBank />
      </Section>
    </div>
  );
}