import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

describe('request row action', () => {
  it('does not fill the row action with the accent', () => {
    const idle = read('app/(tabs)/request.tsx').match(/btn: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(idle).not.toMatch(/Colors\.signal/);
    expect(idle).toMatch(/Colors\.borderGlass/);
  });

  it('gives the colour to the sent state only', () => {
    const sent = read('app/(tabs)/request.tsx').match(/btnSent: \{[\s\S]*?\n  \},/)?.[0] ?? '';

    expect(sent).toMatch(/Colors\.successMuted/);
  });

  it('announces the row as requested once it is sent', () => {
    expect(read('app/(tabs)/request.tsx')).toMatch(/Pedida: \$\{title\}/);
  });

  it('confirms the request with a soft success and a brief notice', () => {
    const screen = read('app/(tabs)/request.tsx');

    expect(screen).toMatch(/Haptics\.NotificationFeedbackType\.Success/);
    expect(screen).toMatch(/<Snackbar/);
    expect(read('components/ui/Snackbar.tsx')).toMatch(/2600/);
  });
});
