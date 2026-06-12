import { motion } from 'framer-motion';
import { MapPin, BookOpen, Cross, Users, Flame } from 'lucide-react';
import { Header } from '@/components/ui-custom';

const beliefs = [
  {
    icon: BookOpen,
    title: 'La Palabra de Dios',
    description: 'Nuestra identidad y predicación se fundamentan en la sana doctrina de las Escrituras.',
  },
  {
    icon: Cross,
    title: 'La Trinidad',
    description: 'Creemos en el Padre, el Hijo y el Espíritu Santo: un solo Dios en tres personas.',
  },
  {
    icon: Flame,
    title: 'Poder Pentecostal',
    description: 'Somos una iglesia pentecostal que cree en el poder transformador del Espíritu Santo.',
  },
  {
    icon: Users,
    title: 'Misión Mundial',
    description: 'Parte del Movimiento Misionero Mundial, comprometidos con alcanzar a los perdidos.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">

      <Header stationName="La Voz de la Verdad" />
      
      {/* Hero */}
      <section className="relative px-4 pt-14 pb-12 text-center overflow-hidden bg-gradient-to-b from-secondary/50 to-background">
        
        {/* Glow - Usando variables de Tailwind para mapear automáticamente al color primario */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-6 h-px w-20 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-3"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground/80 to-foreground">
            Sobre Nosotros
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="text-sm sm:text-base max-w-lg mx-auto flex items-center justify-center gap-2 text-muted-foreground"
        >
          <span className="inline-block w-1 h-1 rounded-full bg-primary" />
          Iglesia Cristiana Pentecostal — Movimiento Misionero Mundial
          <span className="inline-block w-1 h-1 rounded-full bg-primary" />
        </motion.p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        />
      </section>

      {/* Texto principal */}
      <section className="px-4 py-10 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="rounded-2xl p-6 sm:p-8 border border-border bg-card shadow-sm"
        >
          <p className="text-base sm:text-lg leading-relaxed text-card-foreground">
            Somos una <span className="font-semibold text-primary">Iglesia Cristiana Pentecostal</span> que
            forma parte de la obra del <span className="font-semibold text-primary">Movimiento Misionero Mundial</span>.
            Nuestra identidad y nuestra predicación se basan en la sana doctrina de la Palabra de Dios.
          </p>
          <p className="text-base sm:text-lg leading-relaxed mt-4 text-card-foreground">
            Creemos en la Trinidad divina: el Padre, el Hijo y el Espíritu Santo, y en el poder transformador
            del Evangelio de Jesucristo. A través de este medio, buscamos edificar a los creyentes y alcanzar
            a los perdidos.
          </p>
          <p className="text-base sm:text-lg leading-relaxed mt-4 text-card-foreground">
            Te invitamos a congregarte con nosotros y experimentar la presencia de Dios.
          </p>
        </motion.div>
      </section>

      {/* Creencias */}
      <section className="px-4 pb-10 max-w-2xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm font-semibold uppercase tracking-widest mb-5 text-primary"
        >
          Lo que creemos
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {beliefs.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.08 }}
              className="flex gap-4 p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 transition-colors group"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-secondary group-hover:bg-primary/10 transition-colors">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm mb-0.5 text-card-foreground">{item.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Dirección */}
      <section className="px-4 pb-14 max-w-2xl mx-auto">
        <motion.a
          href="https://maps.app.goo.gl/rvDGGceqMb1w8bgV7"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex items-start sm:items-center gap-4 p-5 rounded-2xl border border-border bg-secondary/30 hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group"
        >
          <div className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-background border border-border shadow-sm group-hover:border-primary/30 transition-colors">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5 text-primary">
              Visítanos
            </p>
            <p className="font-semibold text-sm sm:text-base text-foreground">
              Carrera 7 #13-35, Barrio La Libertad
            </p>
            <p className="text-xs mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">
              Ver en Google Maps →
            </p>
          </div>
        </motion.a>
      </section>

    </div>
  );
}