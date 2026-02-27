import { type ReactNode } from 'react';
import { ThemeContext, useThemeProvider } from './useTheme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeProvider();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
