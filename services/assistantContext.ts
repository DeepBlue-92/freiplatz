import { User } from '../types';
import { ClubSettings } from './db';

export interface AssistantContextOptions {
  settings?: ClubSettings | null;
  currentUser?: User | null;
  activeChampionshipName?: string | null;
  championshipDeadline?: string | null;
  userHoursWorked?: number | null;
}

/**
 * Builds an authoritative, dynamic club context text block from live database settings.
 * Injected into Gemini / AI Assistant system prompt to ensure 100% factual accuracy.
 */
export function buildClubAssistantContext(options: AssistantContextOptions = {}): string {
  const {
    settings,
    currentUser,
    activeChampionshipName,
    championshipDeadline,
    userHoursWorked
  } = options;

  if (!settings) {
    return 'VEREINS-KONFIGURATION: Standardeinstellungen aktiv.';
  }

  const clubName = settings.clubName || settings.vereinsName || 'Unser Tennisclub';
  const courts = Array.isArray(settings.courts) && settings.courts.length > 0
    ? settings.courts
    : ['Platz 1', 'Platz 2'];
  
  const rules = settings.reservationRules || {};
  const feeSettings = settings.feeSettings;

  // 1. Gastspiel-Preise & Abrechnungsmodell
  let guestFeeText = '';
  if (feeSettings?.fee_calculation_mode === 'SIMPLE' && feeSettings.simple_config) {
    const euro = (feeSettings.simple_config.amount_cents / 100).toFixed(2).replace('.', ',') + ' €';
    if (feeSettings.simple_config.rate_type === 'PER_COURT_HOUR') {
      guestFeeText = `${euro} pauschal pro Platzstunde (unabhängig von der Gastanzahl)`;
    } else if (feeSettings.simple_config.rate_type === 'PER_GUEST') {
      guestFeeText = `${euro} pro Gastspieler`;
    } else {
      guestFeeText = `${euro} pro Gast und Stunde`;
    }
  } else if (rules.guestFeePerHour !== undefined) {
    const euro = Number(rules.guestFeePerHour).toFixed(2).replace('.', ',') + ' €';
    const mode = rules.guestBillingMode === 'per_court' ? 'pro Platzstunde' : 'pro Spieler und Stunde';
    guestFeeText = `${euro} ${mode}`;
  } else {
    guestFeeText = '10,00 € pro Platzstunde';
  }

  // 2. Buchungsregeln
  const maxAdvanceDays = rules.maxAdvanceDays ?? 14;
  const maxActiveBookings = rules.maxActiveBookings ?? 3;
  const singleDuration = rules.maxDurationMinutesSingle ?? 60;
  const doubleDuration = rules.maxDurationMinutesDouble ?? 120;
  const cancelDeadline = rules.cancellationDeadlineMinutes ?? 30;
  const ballMachinesCount = rules.availableBallMachines ?? 1;

  // 3. Arbeitseinsätze
  const isArbeitseinsaetzeActive = settings.modules?.arbeitseinsaetze !== false;
  const sollStunden = settings.arbeitseinsaetzeSettings?.sollStunden ?? 10;
  const categories = settings.arbeitseinsaetzeSettings?.categories?.join(', ') || 'Platzpflege, Clubheim, Grünanlagen, Veranstaltungsdienst';

  // 4. Ligen & Meisterschaften
  const isLeagueActive = settings.modules?.league === true;
  const isChampionshipActive = settings.modules?.championship === true;

  // 5. Nutzerdaten
  const vorname = currentUser?.firstName || currentUser?.name?.split(' ')[0] || '';
  const roleName = currentUser?.role === 'super-admin' ? 'Super-Administrator' : currentUser?.role === 'admin' ? 'Administrator' : 'Mitglied';

  let context = `=== DYNAMISCHE VEREINS-KONFIGURATION & ECHTZEIT-REGELN ===
• Verein: ${clubName} (${settings.city ? settings.city : 'Tennisanlage'})
• Plätze: ${courts.length} Plätze (${courts.join(', ')})
• Ballmaschine: ${ballMachinesCount > 0 ? `${ballMachinesCount} Ballmaschine(n) vorhanden (im Buchungsfenster per Häkchen zubuchbar)` : 'Keine Ballmaschine verfügbar'}

GÄSTE & GASTSPIELE:
• Gastgebühr: ${guestFeeText}
• Bezahlung: Keine Barzahlung vor Ort! Alle Gastgebühren werden automatisch auf dem Mitgliedskonto erfasst und satzungsgemäß am Saisonende bequem per SEPA-Lastschrift eingezogen.

PLATZRESERVIERUNG & REGELN:
• Buchungsvorlauf: Maximal ${maxAdvanceDays} Tage im Voraus buchbar.
• Parallele Reservierungen: Maximal ${maxActiveBookings} aktive Vorab-Buchungen pro Mitglied gleichzeitig.
• Spieldauer Einzel: ${singleDuration} Minuten (Standard: 60 Minuten).
• Spieldauer Doppel: Bis zu ${doubleDuration} Minuten (im Dropdown "Bis" wählbar).
• Stornierung: Bis zu ${cancelDeadline} Minuten vor Spielbeginn kostenlos über das Buchungsfenster möglich.
• Mindestbelegung: Mindestens 1 Mitspieler (Partner), 1 Gast oder die Ballmaschine erforderlich. Reines Alleintraining ohne Ballmaschine blockiert das System.

ARBEITSEINSÄTZE (GEMEINSCHAFTSSTUNDEN):
• Status Modul: ${isArbeitseinsaetzeActive ? 'Aktiviert' : 'Deaktiviert'}
• Sollvorgabe: ${sollStunden} Pflichtstunden pro Saison (Frist in der Regel 31. Oktober).
• Kategorien: ${categories}
• Einreichung: Im Menü "Arbeitseinsätze" über den Button "Einsatz einreichen" oder für "Offene Schichten" eintragen.

MEISTERSCHAFT & TURNIERE:
• Status Meisterschaft: ${isChampionshipActive ? 'Aktiv' : 'Inaktiv'}
${activeChampionshipName ? `• Aktuelle Meisterschaft: "${activeChampionshipName}"` : ''}
${championshipDeadline ? `• Nächste Spiel-Deadline: ${championshipDeadline}` : ''}
• Zählweise: 1. & 2. Satz regulär (bis 6 bzw. Tiebreak bis 7 bei 6:6). Bei 1:1 Satzstand wird zwingend ein Match-Tiebreak bis 10 Punkte (mit min. 2 Punkten Vorsprung) als Entscheidungssatz gespielt. Es wird kein 3. Satz ausgespielt! Unentschieden sind strikt unzulässig.

HOBBYLIGA:
• Status Hobbyliga: ${isLeagueActive ? 'Aktiv' : 'Inaktiv'}
• Punktesystem: Teilnahme/Sieg gibt Basispunkte (5 Pkt.), Siege gegen Bessere bringen Bonuspunkte. Bei >7 Tagen Inaktivität werden 5 Punkte pro inaktiver Woche abgezogen.`;

  if (settings.customAiInstructions && settings.customAiInstructions.trim()) {
    context += `\n\nINDIVIDUELLE VEREINSHINWEISE DES VORSTANDS:\n${settings.customAiInstructions.trim()}`;
  }

  if (currentUser) {
    context += `\n\nANGEMELDETER NUTZER:
• Name: ${vorname ? vorname : currentUser.name}
• Rolle: ${roleName}
${userHoursWorked !== undefined && userHoursWorked !== null ? `• Geleistete Arbeitsstunden: ${userHoursWorked} von ${sollStunden} Std.` : ''}`;
  }

  return context;
}
