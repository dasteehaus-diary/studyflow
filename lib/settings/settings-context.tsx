'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { localDB, type HighlightColor } from '@/lib/db/local';

export interface AppSettings {
  appTheme: 'warm' | 'light' | 'dark';
  readerBg: 'warm' | 'white' | 'dark';
  fitMode: 'fit-width' | 'fit-page' | 'free';
  defaultHlColor: HighlightColor;
  inactivityDays: number;
  showContext: boolean;
  telegramChatId: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  appTheme: 'warm',
  readerBg: 'warm',
  fitMode: 'fit-width',
  defaultHlColor: 'apricot',
  inactivityDays: 3,
  showContext: true,
  telegramChatId: ''
};

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  isLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  isLoaded: false
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Apply theme to DOM & localStorage
  const applyTheme = useCallback((theme: 'warm' | 'light' | 'dark') => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('studyflow_theme', theme);
      } catch {}
    }
  }, []);

  // Load from localDB on mount
  useEffect(() => {
    if (!localDB) {
      setIsLoaded(true);
      return;
    }

    localDB.settings.get('app_settings')
      .then((record) => {
        if (record?.value && typeof record.value === 'object') {
          const loaded = { ...DEFAULT_SETTINGS, ...(record.value as Partial<AppSettings>) };
          setSettings(loaded);
          applyTheme(loaded.appTheme);
        } else {
          applyTheme(DEFAULT_SETTINGS.appTheme);
        }
      })
      .catch((err) => {
        console.error('Failed to load app_settings:', err);
        applyTheme(DEFAULT_SETTINGS.appTheme);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, [applyTheme]);

  const updateSettings = async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);

    if (updates.appTheme) {
      applyTheme(updates.appTheme);
    }

    if (localDB) {
      try {
        await localDB.settings.put({ key: 'app_settings', value: next });
      } catch (err) {
        console.error('Failed to persist app_settings:', err);
      }
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
