import { useTranslation } from "react-i18next";
import { LANGS, currentLang, setLanguage } from "../i18n";

export function LangToggle() {
  const { t } = useTranslation();
  const active = currentLang();
  return (
    <div role="group" aria-label={t("lang.label")} className="flex rounded-full bg-zinc-200 p-1 dark:bg-zinc-800">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={lang === active}
          onClick={() => void setLanguage(lang)}
          className={`min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold transition-colors ${
            lang === active
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {t(`lang.${lang}`)}
        </button>
      ))}
    </div>
  );
}
