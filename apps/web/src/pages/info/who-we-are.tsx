import { motion } from 'framer-motion';
import { MapPin, BookOpen, Cross, Users, Flame } from 'lucide-react';
import { useTheme } from '@/hooks';
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>

      <Header stationName="La Voz de la Verdad" />
      {/* Hero */}
      <section className={`relative px-4 pt-14 pb-12 text-center overflow-hidden ${
        isDark
          ? 'bg-gradient-to-b from-indigo-950/70 to-slate-950'
          : 'bg-gradient-to-b from-indigo-50 to-slate-50'
      }`}>
        {/* Glow */}
        <div className={`absolute inset-0 pointer-events-none ${
          isDark
            ? 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18)_0%,_transparent_65%)]'
            : 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.10)_0%,_transparent_65%)]'
        }`} />

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-6 h-px w-20 bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
        />

        {/* Icono decorativo */}
        {/* <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 ${
            isDark ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-indigo-100 border border-indigo-200'
          }`}
        >
          <Heart className="w-7 h-7 text-indigo-400" />
        </motion.div> */}

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-3"
        >
          <span className={`bg-clip-text text-transparent bg-gradient-to-r ${
            isDark
              ? 'from-white via-indigo-200 to-white'
              : 'from-indigo-900 via-indigo-600 to-indigo-900'
          }`}>
            Sobre Nosotros
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className={`text-sm sm:text-base max-w-lg mx-auto flex items-center justify-center gap-2 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          <span className="inline-block w-1 h-1 rounded-full bg-indigo-400" />
          Iglesia Cristiana Pentecostal — Movimiento Misionero Mundial
          <span className="inline-block w-1 h-1 rounded-full bg-indigo-400" />
        </motion.p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto mt-6 h-px w-16 bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
        />
      </section>

      {/* Texto principal */}
      <section className="px-4 py-10 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className={`rounded-2xl p-6 sm:p-8 border ${
            isDark
              ? 'bg-slate-800/50 border-slate-700'
              : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <p className={`text-base sm:text-lg leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Somos una <span className="font-semibold text-indigo-400">Iglesia Cristiana Pentecostal</span> que
            forma parte de la obra del <span className="font-semibold text-indigo-400">Movimiento Misionero Mundial</span>.
            Nuestra identidad y nuestra predicación se basan en la sana doctrina de la Palabra de Dios.
          </p>
          <p className={`text-base sm:text-lg leading-relaxed mt-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Creemos en la Trinidad divina: el Padre, el Hijo y el Espíritu Santo, y en el poder transformador
            del Evangelio de Jesucristo. A través de este medio, buscamos edificar a los creyentes y alcanzar
            a los perdidos.
          </p>
          <p className={`text-base sm:text-lg leading-relaxed mt-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
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
          className={`text-sm font-semibold uppercase tracking-widest mb-5 ${
            isDark ? 'text-indigo-400' : 'text-indigo-600'
          }`}
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
              className={`flex gap-4 p-4 rounded-xl border ${
                isDark
                  ? 'bg-slate-800/40 border-slate-700 hover:border-indigo-500/40'
                  : 'bg-white border-slate-200 hover:border-indigo-300 shadow-sm'
              } transition-colors`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'
              }`}>
                <item.icon className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="font-semibold text-sm mb-0.5">{item.title}</p>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Dirección */}
      <section className="px-4 pb-14 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className={`flex items-start sm:items-center gap-4 p-5 rounded-2xl border ${
            isDark
              ? 'bg-indigo-500/5 border-indigo-500/20'
              : 'bg-indigo-50 border-indigo-200'
          }`}
        >
          <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
            isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'
          }`}>
            <MapPin className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${
              isDark ? 'text-indigo-400' : 'text-indigo-600'
            }`}>
              Visítanos
            </p>
            <p className={`font-semibold text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-800'}`}>
              Carrera 7 #13-35, Barrio La Libertad
            </p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Servicios presenciales disponibles
            </p>
          </div>
        </motion.div>
      </section>

    </div>
  );
}