import { ClubSettings, TenantLanguageTranslations, RegularLock, RangeLock } from "./db";

export type TranslationCategory =
  | "courts"
  | "equipment"
  | "lockReasons"
  | "categories"
  | "leagues"
  | "welcomeMessage"
  | "news";

/**
 * Resolves a tenant text (court name, lock reason, category, etc.)
 * in the user's active language if a translation is maintained in ClubSettings.
 * If no translation exists or the active language is the default language, the original text is returned.
 */
export function getTenantTranslation(
  original: string | undefined | null,
  category: TranslationCategory,
  settings?: ClubSettings | null,
  currentLang?: string | null
): string {
  if (!original) return "";

  const defaultLang = settings?.i18n?.defaultLanguage || "de";
  const activeLang = currentLang || (typeof window !== "undefined" ? window.localStorage?.getItem("app_language") : null) || defaultLang;

  // If the active language is the club's default master language, show original master text
  if (activeLang === defaultLang) {
    return original;
  }

  const translationsForLang: TenantLanguageTranslations | undefined =
    settings?.i18n?.translations?.[activeLang];

  if (category === "welcomeMessage") {
    const customWelcome = translationsForLang?.welcomeMessage;
    return (customWelcome && customWelcome.trim()) ? customWelcome : original;
  }

  if (category === "news") {
    const customNews = translationsForLang?.news;
    return (customNews && customNews.trim()) ? customNews : original;
  }

  const categoryMap = translationsForLang?.[category];
  if (categoryMap && categoryMap[original] && categoryMap[original].trim()) {
    return categoryMap[original].trim();
  }

  // Graceful fallback for standard court naming patterns when language differs
  if (category === "courts") {
    if (activeLang === "en") {
      const match = original.match(/^Platz\s*(\d+)$/i);
      if (match) return `Court ${match[1]}`;
      if (original.match(/^Platz\s+([A-Za-z0-9]+)$/i)) {
        return original.replace(/^Platz\s+/i, "Court ");
      }
      if (original.trim().toLowerCase() === "platz") return "Court";
    } else if (activeLang === "de") {
      const match = original.match(/^Court\s*(\d+)$/i);
      if (match) return `Platz ${match[1]}`;
      if (original.match(/^Court\s+([A-Za-z0-9]+)$/i)) {
        return original.replace(/^Court\s+/i, "Platz ");
      }
      if (original.trim().toLowerCase() === "court") return "Platz";
    }
  }

  // Graceful fallback for standard equipment naming patterns when language differs
  if (category === "equipment") {
    const trimmed = original.trim().toLowerCase();
    if (activeLang === "en") {
      if (trimmed === "ballmaschine") return "Ball Machine";
      if (trimmed === "ballkorb") return "Ball Basket";
      if (trimmed === "einfeldnetz") return "Single Net";
      if (trimmed === "schlägerset") return "Racket Set";
    } else if (activeLang === "de") {
      if (trimmed === "ball machine") return "Ballmaschine";
      if (trimmed === "ball basket") return "Ballkorb";
      if (trimmed === "single net") return "Einfeldnetz";
      if (trimmed === "racket set") return "Schlägerset";
    }
  }

  // Graceful fallback to original master text
  return original;
}

/**
 * Extracts all unique reasons from both recurring locks and range locks.
 */
export function getUniqueLockReasons(
  recurringLocks?: RegularLock[],
  rangeLocks?: RangeLock[]
): string[] {
  const set = new Set<string>();

  if (Array.isArray(recurringLocks)) {
    recurringLocks.forEach((lock) => {
      const r = lock.reason?.trim();
      if (r) set.add(r);
    });
  }

  if (Array.isArray(rangeLocks)) {
    rangeLocks.forEach((lock) => {
      const r = lock.reason?.trim();
      if (r) set.add(r);
    });
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
}
