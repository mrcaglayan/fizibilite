import React from "react";
import { useI18n } from "../i18n/I18nContext";

export default function LanguageSwitcher({ className = "" }) {
  const { language, languages, setLanguage } = useI18n();

  return (
    <div className={`language-switcher ${className}`.trim()} role="group" aria-label="Language" data-i18n-skip>
      {Object.values(languages).map((item) => (
        <button
          key={item.code}
          type="button"
          className={`language-switcher-btn${language === item.code ? " is-active" : ""}`}
          onClick={() => setLanguage(item.code)}
          aria-pressed={language === item.code}
          title={item.label}
        >
          {item.shortLabel}
        </button>
      ))}
    </div>
  );
}
