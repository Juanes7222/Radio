import { Card, CardContent } from '@/components/ui/card';

type StatTone = 'default' | 'primary' | 'live';

const STAT_TONE_CLASSES: Record<StatTone, { value: string; chip: string; icon: string }> = {
  default: { value: '', chip: 'bg-sunken', icon: 'text-muted-foreground' },
  primary: { value: 'text-primary', chip: 'bg-primary/10', icon: 'text-primary' },
  live: { value: 'text-tally', chip: 'bg-tally/10', icon: 'text-tally' },
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  tone?: StatTone;
}

/** Single-number readout with one tone colour, used by the dashboard stat row. */
export default function StatCard({
  title,
  value,
  icon: Icon,
  description,
  tone = 'default',
}: StatCardProps) {
  const classes = STAT_TONE_CLASSES[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-1 text-3xl font-bold ${classes.value}`}>{value}</p>
            {description && <p className="mt-1 text-xs text-faint">{description}</p>}
          </div>
          <div className={`rounded-md p-2.5 ${classes.chip}`}>
            <Icon className={`h-5 w-5 ${classes.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
