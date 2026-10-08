import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Lang } from "./money";
import ru from "./locales/ru.json";
import kk from "./locales/kk.json";
import en from "./locales/en.json";

export const LANGS: readonly Lang[] = ["ru", "kk", "en"];
const STORAGE_KEY = "lang";

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Stored language, or null if absent, invalid or storage is unavailable (private mode, blocked). */
export function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked: the choice simply won't survive a reload.
  }
}

export function currentLang(): Lang {
  return isLang(i18n.language) ? i18n.language : "ru";
}

function syncDocument(lang: string): void {
  document.documentElement.lang = lang;
  document.title = i18n.t("app.title");
}

export async function setLanguage(lang: Lang): Promise<void> {
  storeLang(lang);
  await i18n.changeLanguage(lang);
}

i18n.on("languageChanged", syncDocument);

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk }, en: { translation: en } },
  lng: readStoredLang() ?? "ru",
  fallbackLng: "ru",
  supportedLngs: [...LANGS],
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});
syncDocument(i18n.language);

export default i18n;
