import { motion } from 'framer-motion';
import { Users, Globe, Headphones, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Listeners } from '@/types/azuracast';

interface ListenerStatsProps {
  listeners: Listeners;
  isLive: boolean;
  streamerName: string | null;
  theme: 'dark' | 'light';
}

export function ListenerStats({ 
  listeners, 
  isLive, 
  streamerName,
  theme 
}: ListenerStatsProps) {
  const stats = [
    {
      icon: Users,
      label: 'Oyentes totales',
      value: listeners.total,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      icon: Headphones,
      label: 'Oyentes únicos',
      value: listeners.unique,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: Globe,
      label: 'Conectados ahora',
      value: listeners.current,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className={theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Estado del stream */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="md:col-span-3"
      >
        <Card className={theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${
                  isLive ? 'bg-red-500/10' : 'bg-blue-500/10'
                }`}>
                  <TrendingUp className={`w-6 h-6 ${
                    isLive ? 'text-red-500' : 'text-blue-500'
                  }`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estado del stream</p>
                  <p className="text-lg font-semibold">
                    {isLive ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        EN VIVO - {streamerName || 'Streamer'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        AutoDJ 24/7
                      </span>
                    )}
                  </p>
                </div>
              </div>
              
              {/* Indicador visual */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-1 rounded-full ${
                      isLive ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    animate={{
                      height: isLive ? [20, 40, 20] : [15, 25, 15],
                    }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
