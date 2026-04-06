import { motion } from 'framer-motion';
import { useTheme } from '@/hooks';
import { Header, AppFooter } from '@/components/ui-custom';
import { Radio, AlertCircle } from 'lucide-react';

export default function MaintenancePage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className={`min-h-[100dvh] flex flex-col font-sans overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} selection:bg-indigo-500/30`}>
      
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[50%] ${isDark ? 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18)_0%,transparent_65%)]' : 'bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12)_0%,transparent_65%)]'}`} />
      </div>

      <div className="relative z-10 border-b border-transparent dark:border-slate-800">
        <Header stationName="La Voz de la Verdad" />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center p-4 py-8 md:p-8 lg:p-12 relative z-10 w-full mx-auto max-w-7xl">
        <motion.article 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`border z-20 rounded-2xl md:rounded-[1.25rem] shadow-xl p-8 md:p-12 lg:p-14 max-w-[580px] w-full text-center relative overflow-hidden ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
          role="main"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140px] h-[1px] bg-gradient-to-r from-transparent via-indigo-600 dark:via-indigo-400 to-transparent" aria-hidden="true" />

          <div className="relative w-[72px] h-[72px] mx-auto mb-6" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className={`absolute -inset-[6px] rounded-[calc(1.25rem+6px)] border-[1.5px] ${isDark ? 'border-indigo-400' : 'border-indigo-600'}`}
                animate={{
                  scale: [0.97, 1.4],
                  opacity: [0.5, 0]
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: i * 0.85
                }}
              />
            ))}
            <div className={`w-full h-full border rounded-[1.25rem] flex items-center justify-center relative z-10 ${isDark ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
              <Radio size={32} strokeWidth={1.6} />
            </div>
          </div>

          <div className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs font-semibold tracking-widest uppercase mb-5 ${isDark ? 'bg-indigo-500/10 text-indigo-400 border-transparent' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
            <motion.span 
              className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-indigo-400' : 'bg-indigo-600'}`}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            />
            Mantenimiento en progreso
          </div>

          {/* Divisor centrado */}
          <div 
            className={`mx-auto mt-0 mb-5 h-[1px] w-[80px] bg-gradient-to-r from-transparent ${isDark ? 'via-indigo-400' : 'via-indigo-600'} to-transparent`}
            aria-hidden="true" 
          />

          <h1 className={`text-[2rem] md:text-[2.25rem] font-extrabold tracking-tight leading-[1.15] mb-4 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Estamos afinando<br />
            <span className={`bg-clip-text text-transparent bg-gradient-to-r ${isDark ? 'from-slate-100 via-indigo-400 to-slate-100' : 'from-slate-900 via-indigo-600 to-slate-900'}`}>
              la señal
            </span>
          </h1>

          <div className="flex items-center justify-center gap-[3px] h-[22px] mx-auto mt-4 mb-6" aria-hidden="true">
            {[7, 15, 21, 13, 19, 9, 17, 11, 19].map((height, i) => (
              <motion.div
                key={i}
                className={`w-[3px] rounded-full opacity-55 origin-bottom ${isDark ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                style={{ height }}
                animate={{ scaleY: [0.35, 1, 0.35] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.1
                }}
              />
            ))}
          </div>

          <p className={`text-base leading-relaxed max-w-[44ch] mx-auto mb-8 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Estamos realizando mejoras para brindarte una mejor experiencia de escucha.
            Volveremos pronto con la señal al aire. ¡Gracias por tu paciencia!
          </p>

          <p className={`flex items-center justify-center gap-2 text-xs opacity-80 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />
            Si el problema persiste, contáctanos en redes sociales.
          </p>

        </motion.article>
      </main>

      {/* Pie de página con el theme oscuro transferido nativo */}
      <div className="relative z-10 border-t border-transparent dark:border-slate-800 mt-auto">
        <AppFooter isDark={isDark} stationName="La Voz de la Verdad" />
      </div>
    </div>
  );
}