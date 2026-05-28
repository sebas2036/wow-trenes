/**
 * WoW TRENES — ThemeContext
 * Detecta automáticamente el modo del sistema (claro/oscuro)
 * y provee los colores correctos a toda la app.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { getColors, type AppColors } from '../theme';

interface ThemeContextValue {
  colors: AppColors;
  isDark: boolean;
  scheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: getColors('dark'),
  isDark: true,
  scheme: 'dark',
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const scheme: 'light' | 'dark' = colorScheme === 'light' ? 'light' : 'dark';
  const isDark = scheme === 'dark';
  const colors = useMemo(() => getColors(scheme), [scheme]);

  return (
    <ThemeContext.Provider value={{ colors, isDark, scheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
