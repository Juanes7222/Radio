import { motion } from 'framer-motion';
import { Shield, Wifi, Bell, Users, Mail } from 'lucide-react';
import { useTheme } from '@/hooks';
import { Header } from '@/components/ui-custom';

const sections = [
  {
    icon: Wifi,
    title: 'Acceso a Internet',
    description: 'Únicamente para transmitir el audio de la emisora en vivo y cargar el contenido relacionado.',
  },
  {
    icon: Bell,
    title: 'Notificaciones',
    description: 'Si el usuario lo autoriza, se envían notificaciones locales de canciones favoritas. Las preferencias se almacenan solo en el dispositivo.',
  },
  {
    icon: Users,
    title: 'Menores de edad',
    description: 'Esta aplicación no está dirigida a menores de 13 años y no recopila conscientemente información de menores.',
  },
  {
    icon: Mail,
    title: 'Contacto',
    description: 'Para preguntas sobre esta política, puedes contactarnos a través de nuestras redes sociales.',
  },
];

export default function PrivacyPolicyPage() {
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
            Política de Privacidad
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
          Última actualización: marzo 2026
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
          <div className={`flex items-center gap-3 mb-4`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              isDark ? 'bg-indigo-500/10' : 'bg-indigo-50'
            }`}>
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="font-semibold text-sm text-indigo-400 uppercase tracking-wider">
              Tu privacidad es importante
            </p>
          </div>
          <p className={`text-base sm:text-lg leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            La aplicación <span className="font-semibold text-indigo-400">La Voz de la Verdad</span> no
            recopila ni almacena información personal identificable de sus usuarios.
          </p>
          <p className={`text-base sm:text-lg leading-relaxed mt-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Utilizamos <span className="font-semibold text-indigo-400">AzuraCast</span> para la gestión
            del streaming de audio. No compartimos datos personales con terceros ni utilizamos la
            información del dispositivo con fines publicitarios.
          </p>
        </motion.div>
      </section>

      {/* Secciones */}
      <section className="px-4 pb-10 max-w-2xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-sm font-semibold uppercase tracking-widest mb-5 ${
            isDark ? 'text-indigo-400' : 'text-indigo-600'
          }`}
        >
          Uso de permisos
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sections.map((item, i) => (
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

    </div>
  );
}