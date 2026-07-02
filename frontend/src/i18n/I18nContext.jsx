import React from "react";
import { LANGUAGES, translatePhrase } from "./translations";

const STORAGE_KEY = "app.language";
const I18nContext = React.createContext(null);

function readInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (_) {
    // Ignore storage access errors.
  }
  return "tr";
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = React.useState(readInitialLanguage);

  const setLanguage = React.useCallback((nextLanguage) => {
    if (!LANGUAGES[nextLanguage]) return;
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch (_) {
      // Ignore storage access errors.
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = React.useMemo(
    () => ({
      language,
      languages: LANGUAGES,
      setLanguage,
      t: (valueToTranslate) => translatePhrase(valueToTranslate, language),
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
