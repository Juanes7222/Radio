import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { Shield } from 'lucide-react';
import { Header } from '@/components/ui-custom';
import type { LegalDocument } from '@/legal/legal-docs';

interface LegalDocPageProps {
  doc: LegalDocument;
}

interface ParagraphProps {
  text: string;
}

const INLINE_LINK = /\[([^\]]+)\]\((\/[^)]+)\)/g;

function LegalParagraph({ text }: ParagraphProps) {
  const parts = text.split(INLINE_LINK);

  if (parts.length === 1) {
    return <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">{text}</p>;
  }

  return (
    <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
      {parts.map((part, i) => {
        if (i % 3 === 0) {
          return <span key={i}>{part}</span>;
        }
        if (i % 3 === 1) {
          return (
            <Link
              key={i}
              to={parts[i + 1] ?? ''}
              className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
            >
              {part}
            </Link>
          );
        }
        return null;
      })}
    </p>
  );
}

function LegalSection({ heading, paragraphs, lists, after }: { heading: string; paragraphs: string[]; lists?: string[]; after?: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl p-6 sm:p-8 border bg-card shadow-sm"
    >
      <h2 className="font-semibold text-sm sm:text-base text-primary uppercase tracking-wider mb-3">
        {heading}
      </h2>
      <div className="space-y-3">
        {paragraphs.map((paragraph, i) => (
          <LegalParagraph key={`${heading}-${i}`} text={paragraph} />
        ))}
        {lists && (
          <ul className="space-y-2">
            {lists.map((item, i) => (
              <li key={`${heading}-list-${i}`} className="flex gap-2.5 text-sm sm:text-base leading-relaxed text-muted-foreground">
                <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary/60" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {after && after.map((paragraph, i) => (
          <LegalParagraph key={`${heading}-after-${i}`} text={paragraph} />
        ))}
      </div>
    </motion.div>
  );
}

export default function LegalDocPage({ doc }: LegalDocPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header stationName="La Voz de la Verdad" />

      <section className="relative px-4 pt-14 pb-12 text-center overflow-hidden bg-gradient-to-b from-secondary to-background">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)_/_0.15)_0%,_transparent_65%)]" />

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-6 h-px w-20 bg-gradient-to-r from-transparent via-primary to-transparent"
        />

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-primary to-foreground">
            {doc.title}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="text-sm sm:text-base max-w-lg mx-auto flex items-center justify-center gap-2 text-muted-foreground"
        >
          <span className="inline-block w-1 h-1 rounded-full bg-primary" />
          Última actualización: {doc.updatedAt}
          <span className="inline-block w-1 h-1 rounded-full bg-primary" />
        </motion.p>
      </section>

      <section className="px-4 py-10 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="rounded-2xl p-6 sm:p-8 border bg-card shadow-sm"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <p className="font-semibold text-sm text-primary uppercase tracking-wider">
              La Voz de la Verdad
            </p>
          </div>
          <p className="text-base sm:text-lg leading-relaxed text-muted-foreground">
            {doc.intro}
          </p>
        </motion.div>

        <div className="mt-6 space-y-4">
          {doc.sections.map((section) => (
            <LegalSection key={section.heading} {...section} />
          ))}
        </div>
      </section>
    </div>
  );
}