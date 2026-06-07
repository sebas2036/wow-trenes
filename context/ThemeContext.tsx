/**
 * WoW Train — ThemeContext
 * Modo oscuro permanente — identidad cyberpunk/premium.
 */
import React, { createContext, useContext } from 'react';
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
  return (
    <ThemeContext.Provider value={{ colors: getColors('dark'), isDark: true, scheme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
