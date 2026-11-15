export const VIEW_LOCALIZED_SLUGS: Record<string, { de: string; en: string }> = {
  landing_page: { de: "startseite", en: "home" },
  reservation: { de: "reservierung", en: "reservation" },
  tournaments: { de: "turniere", en: "tournaments" },
  ranking: { de: "rangliste", en: "ranking" },
  arbeitseinsaetze: { de: "arbeitseinsaetze", en: "work-service" },
  spielpartner: { de: "spielpartner", en: "partners" },
  league: { de: "liga", en: "league" },
  championship: { de: "vereinsmeisterschaft", en: "championship" },
  reports: { de: "berichte", en: "reports" },
  guests: { de: "gaeste", en: "guests" },
  adminSettings: { de: "einstellungen", en: "settings" },
  impressum: { de: "impressum", en: "legal" },
};

// Bidirectional lookup table supporting German, English and historical aliases
export const SLUG_TO_VIEW_MAP: Record<string, string> = {
  // Landing Page
  startseite: "landing_page",
  start: "landing_page",
  home: "landing_page",
  landing: "landing_page",
  landing_page: "landing_page",

  // Reservation / Court booking
  reservierung: "reservation",
  buchen: "reservation",
  buchung: "reservation",
  platz: "reservation",
  plaetze: "reservation",
  reservation: "reservation",
  booking: "reservation",
  bookings: "reservation",
  courts: "reservation",

  // Tournaments / Events
  turniere: "tournaments",
  turnier: "tournaments",
  events: "tournaments",
  event: "tournaments",
  tournaments: "tournaments",
  tournament: "tournaments",

  // Ranking
  rangliste: "ranking",
  tabelle: "ranking",
  ranking: "ranking",
  standings: "ranking",

  // Work hours / Arbeitseinsätze
  arbeitseinsaetze: "arbeitseinsaetze",
  arbeitseinsatz: "arbeitseinsaetze",
  arbeitsstunden: "arbeitseinsaetze",
  "work-service": "arbeitseinsaetze",
  "work-hours": "arbeitseinsaetze",
  workhours: "arbeitseinsaetze",

  // Spielpartner / Match partners
  spielpartner: "spielpartner",
  partnersuche: "spielpartner",
  partners: "spielpartner",
  partner: "spielpartner",
  players: "spielpartner",
  matchmaking: "spielpartner",

  // League / Hobbyliga
  liga: "league",
  hobbyliga: "league",
  league: "league",

  // Championship / Vereinsmeisterschaft
  vereinsmeisterschaft: "championship",
  meisterschaft: "championship",
  championship: "championship",

  // Reports
  berichte: "reports",
  bericht: "reports",
  auswertung: "reports",
  reports: "reports",

  // Guests
  gaeste: "guests",
  gast: "guests",
  guests: "guests",
  guest: "guests",

  // Admin Settings
  einstellungen: "adminSettings",
  admin: "adminSettings",
  verwaltung: "adminSettings",
  settings: "adminSettings",
  adminsettings: "adminSettings",
  "admin-settings": "adminSettings",

  // Impressum / Legal
  impressum: "impressum",
  legal: "impressum",
  imprint: "impressum",
};

/**
 * Resolves any URL hash/slug to the internal canonical view name.
 */
export function resolveViewFromSlug(slug: string): string | null {
  if (!slug) return null;
  const clean = slug.toLowerCase().replace(/^#\/?/, "").replace(/^\//, "").trim();
  return SLUG_TO_VIEW_MAP[clean] || null;
}

/**
 * Gets the localized slug for a given view name in the requested language.
 */
export function getLocalizedSlugForView(viewName: string, lang: "de" | "en" = "de"): string {
  const mapping = VIEW_LOCALIZED_SLUGS[viewName];
  if (!mapping) return viewName.toLowerCase();
  return lang === "en" ? mapping.en : mapping.de;
}
