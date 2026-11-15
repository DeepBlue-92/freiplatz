// Authoritative Knowledge Base for the AI Club Assistant "Ace"
// Grounded on public/tutorial (Knowledge) & public/personality (Tone & Style)

let cachedPersonalityTemplate: string | null = null;

/**
 * Loads the personality instructions from public/personality dynamically.
 * Replaces {{VORNAME}} with the user's first name, or removes it cleanly if empty.
 */
export async function loadPersonality(vorname: string = ''): Promise<string> {
  if (!cachedPersonalityTemplate) {
    try {
      const res = await fetch('/personality');
      if (res.ok) {
        cachedPersonalityTemplate = await res.text();
      }
    } catch (e) {
      console.warn('Could not fetch /personality:', e);
    }
  }

  const template = cachedPersonalityTemplate || `# PERSÖNLICHKEIT & SYSTEM-INSTRUCTIONS: "ACE"
Du bist "Ace", der persönliche, intelligente Vereins- und Tennisassistent.
Begrüße den Nutzer bei der ersten Antwort immer mit: "Servus {{VORNAME}}!" (falls leer: "Servus!").
Du bist ein bodenständiger, sympathischer Vereinskollege mit dem vertrauten Vereins-"Du".
Vermeide Anglizismen: Nutze "Partie/Spiel" statt "Match", "Spiele" statt "Games", "Anlage" statt "Location".
Verwende NIEMALS Markdown-Rauten (#, ##, ###) für Überschriften im Chatfenster, sondern Absätze, nummerierte Listen und Fettschrift.`;

  const cleanVorname = vorname.trim();
  if (cleanVorname) {
    return template.replace(/\{\{VORNAME\}\}/g, cleanVorname);
  } else {
    return template
      .replace(/Servus\s*\{\{VORNAME\}\}!/g, 'Servus!')
      .replace(/\{\{VORNAME\}\}/g, '');
  }
}

export interface KnowledgeEntry {
  id: string;
  module: string;
  title: string;
  keywords: string[];
  content: string;
}

export const TUTORIAL_KNOWLEDGE: KnowledgeEntry[] = [
  // ---------------------------------------------------------------------------
  // Modul 6: Gastspiele & Gebühren
  // ---------------------------------------------------------------------------
  {
    id: 'gastspiele-kosten-gebuehren',
    module: 'Gastspiele',
    title: 'Was kostet eine Gastspielstunde und wie wird abgerechnet?',
    keywords: ['gast kostet', 'kosten gast', 'was kostet gast', 'gastspielstunde', 'gastgebühr', 'wie teuer gast', 'preis gast', 'gastpreis', 'gastgebühren', 'gast gebühr'],
    content: `Die Gastgebühren und die Abrechnung bei uns:

• **Gebühr:** {{GAST_FEE_TEXT}}
• **Keine Barzahlung am Platz:** Du musst vor Ort kein Bargeld bezahlen. Die Gastgebühr wird automatisch deinem Mitgliedskonto zugeordnet.
• **SEPA-Lastschrifteinzug:** Der Verein bucht den Betrag bequem am Saison- bzw. Quartalsende per SEPA-Lastschrift ab.
• **Gast eintragen:** Klicke bei der Platzreservierung einfach auf **„Gast“** und trage Vor- und Nachnamen deines Gastes ein.`
  },
  {
    id: 'support-gast-bezahlen',
    module: 'Supportmatrix',
    title: 'Muss ich meinen Gastspieler bar bezahlen?',
    keywords: ['gast bar', 'bar bezahlen', 'bargeld', 'gastgebühr bar', 'wie bezahlen gast', 'sepa gast', 'gastspiel bezahlen'],
    content: `Nein, auf der Anlage findet **keine Barzahlung** statt:

• **Abrechnung per Lastschrift:** Die Gastgebühr wird automatisch deinem Mitgliedskonto zugeordnet.
• **SEPA-Einzug:** Der Verein zieht den offenen Saldo satzungsgemäß am Quartals- oder Saisonende per SEPA-Lastschrift ein.
• **Transparenz:** Im Modul **Gastspiele** kannst du jederzeit deine gebuchten Gaststunden mit Status (*Offen* / *Bezahlt*) einsehen.`
  },

  // ---------------------------------------------------------------------------
  // Modul 1: Plätze (Platzreservierung & Belegungsplan)
  // ---------------------------------------------------------------------------
  {
    id: 'plaetze-vorlaufzeit-tage',
    module: 'Plätze',
    title: 'Wie viele Tage im Voraus darf ich einen Platz buchen?',
    keywords: ['im voraus buchen', 'wie lange im voraus', 'wie viele tage im voraus', 'vorlaufzeit', 'buchungsfrist', 'tage im voraus', 'reservierungsfrist'],
    content: `Die Buchungsfristen für unsere Plätze:

• **Vorlaufzeit:** Bei uns kannst du maximal **{{ADVANCE_DAYS}} Tage im Voraus** reservieren.
• **Parallele Buchungen:** Jedes Mitglied darf maximal **{{ACTIVE_BOOKINGS}} aktive Vorab-Reservierungen** gleichzeitig im System halten.
• **Spieldauer:** Einzel regulär **60 Minuten**, Doppel bis zu **120 Minuten**.`
  },
  {
    id: 'support-alleine-buchen',
    module: 'Supportmatrix',
    title: 'Kann ich alleine einen Platz reservieren?',
    keywords: ['alleine', 'einzeln', 'ohne partner', 'allein', 'solo', 'ohne mitspieler', 'alleine buchen', 'alleine spielen'],
    content: `Nein, das System blockiert reine Alleinbuchungen:

• **Regel:** Es muss mindestens 1 Mitspieler (Partner), 1 Gast oder die **Ballmaschine** ausgewählt werden.
• **Reines Einzeltraining ohne Ballmaschine** ist buchungsseitig nicht zulässig.
• **Tipp:** Wenn du allein Aufschläge trainieren möchtest, wähle bei der Buchung einfach das Häkchen **„Ballmaschine zubuchen“**!`
  },
  {
    id: 'support-spieldauer',
    module: 'Supportmatrix',
    title: 'Wie lange darf ich spielen (Einzel vs. Doppel)?',
    keywords: ['dauer', 'spieldauer', 'wie lange', 'einzel dauer', 'doppel dauer', '60 minuten', '120 minuten', 'stunde', 'doppel wie lange'],
    content: `Die Buchungsdauer richtet sich nach der Spielform:

• **Einzel (2 Spieler):** Regulär **60 Minuten** (1 Stunde).
• **Doppel (4 Spieler):** Bis zu **120 Minuten** (2 Stunden) im Dropdown-Menü „Bis“ wählbar.
• Buchungen sind standardmäßig für das Zeitfenster von 08:00 bis 22:00 Uhr möglich.`
  },
  {
    id: 'plaetze-reservierung-schritte',
    module: 'Plätze',
    title: 'Platzreservierung Schritt für Schritt',
    keywords: ['platz buchen', 'reservieren', 'platz reservieren', 'wie buche ich', 'buchung schritte', 'platzbuchung', 'anleitung buchen'],
    content: `So buchst du einen Tennisplatz:

1. **Reiter öffnen:** Wähle in der Navigation den Reiter **Plätze**.
2. **Zeitslot wählen:** Klicke im Belegungsplan auf das gewünschte freie (weiße) Zeitfenster deines Wunschplatzes.
3. **Spielzeit prüfen:** Standard ist 60 Minuten (z. B. 14:00 – 15:00 Uhr). Für Doppel kannst du bis zu 120 Minuten wählen.
4. **Partner eintragen:** Spieler 1 bist automatisch du. Klicke in das Suchfeld *„Mitspieler suchen & hinzufügen...“* und wähle deinen Partner aus.
5. **Bestätigen:** Klicke auf den grünen Button **„Jetzt buchen“**. Der Slot färbt sich sofort farbig und ist verbindlich für euch reserviert!`
  },
  {
    id: 'plaetze-ballmaschine',
    module: 'Plätze',
    title: 'Ballmaschine zubuchen',
    keywords: ['ballmaschine', 'ballwurfmaschine', 'ballmaschine zubuchen', 'alleine mit maschine'],
    content: `Wenn der Platz über die Vereinsballmaschine verfügt:

1. Klicke im Belegungsplan auf einen freien Zeitslot.
2. Setze im Buchungsfenster ein Häkchen bei **„Ballmaschine zubuchen“**.
3. In diesem Fall ist **kein menschlicher Mitspieler** erforderlich – die Ballmaschine gilt als vollwertiger Spielpartner.
4. Klicke auf **„Jetzt buchen“**.`
  },
  {
    id: 'plaetze-stornieren',
    module: 'Plätze',
    title: 'Buchung stornieren oder freigeben',
    keywords: ['stornieren', 'stornierung', 'absagen', 'buchung löschen', 'platz freigeben', 'termin absagen'],
    content: `Wenn du nicht spielen kannst, gib den Platz bitte fairerweise sofort frei:

1. Klicke im Belegungsplan direkt auf deine **eigene bestehende Buchung**.
2. Im Drawer erscheint die Buchungsübersicht mit dem roten Button **„Buchung stornieren / Freigeben“**.
3. Bestätige die Sicherheitsabfrage.
4. Der Slot wird sofort wieder weiß und steht allen anderen Mitgliedern zur Verfügung.
• **Hinweis:** Stornierungen sind bis kurz vor Spielbeginn möglich. Vergangene Stunden können nicht storniert werden.`
  },
  {
    id: 'plaetze-pflege-witterung',
    module: 'Plätze',
    title: 'Witterung, Regen & Sandplatzpflege',
    keywords: ['platzpflege', 'sandplatz', 'schleppnetz', 'abziehen', 'regen', 'pfützen', 'linienbesen', 'wässern', 'platz wässern'],
    content: `Richtige Pflege erhält unsere Sandplätze:

• **Nach JEDEM Spiel:**
  1. Platz mit dem Schleppnetz **kreisförmig von außen nach innen** bis an die Zäune abziehen.
  2. Alle Linien mit dem Linienbesen säubern.
  3. Bei Trockenheit die Beregnungsanlage einschalten.
• **Wichtige Regenregel:**
  * Bei Pfützenbildung ist das Spielen untersagt!
  * **Pfützen dürfen NIEMALS mit Schleppnetzen oder Besen weggeschoben werden**, da dies das feine Ziegelmehl unwiderruflich ausschwemmt. Erst spielen, wenn der Platz trittfest abgetrocknet ist.`
  },

  // ---------------------------------------------------------------------------
  // Modul 4: Meisterschaft (Clubturniere & Meisterschaftshub)
  // ---------------------------------------------------------------------------
  {
    id: 'support-meisterschaft-dritter-satz',
    module: 'Supportmatrix',
    title: 'Was passiert bei 1:1 Sätzen in der Meisterschaft?',
    keywords: ['1:1', 'dritter satz', '3. satz', 'satzgleichstand', 'match-tiebreak', 'champions tiebreak', 'entscheidungssatz', 'gleichstand sätze', 'meisterschaft tiebreak'],
    content: `In der Vereinsmeisterschaft wird **kein voller 3. Satz** ausgespielt:

• **Verpflichtender Match-Tiebreak:** Bei einem Satzstand von 1:1 erzwingt das System die Eingabe eines Match-Tiebreaks bis **10 Punkte** (mit mindestens 2 Punkten Vorsprung, z. B. 10:7 oder 12:10).
• **Mathematische Prüfung:** Ein Unentschieden (z. B. 10:10) wird vom System strikt abgewiesen.
• Der Gewinner des Match-Tiebreaks gewinnt die gesamte Partie!`
  },
  {
    id: 'support-punktgleichheit-gruppe',
    module: 'Supportmatrix',
    title: 'Wie wird bei Punktgleichheit in der Meisterschaftsgruppe entschieden?',
    keywords: ['punktgleich', 'punktgleichheit', 'gleiche punkte', 'tabelle reihenfolge', 'wer kommt weiter', 'kaskade', 'direkter vergleich', 'standings'],
    content: `Stehen nach Beendigung aller Gruppenspiele zwei oder mehr Teilnehmer punktgleich da, entscheidet das System strikt nach folgender Kaskade:

1. **Anzahl der Siege** (Gewonnene Partien / Punkte)
2. **Direkter Vergleich (Head-to-Head):** Greift vorrangig, wenn exakt 2 Spieler punktgleich sind.
3. **Satzdifferenz:** Gewonnene Sätze minus verlorene Sätze.
4. **Spieledifferenz:** Gewonnene Spiele minus verlorene Spiele.
5. **Erzielte Spiele gesamt:** Wer absolut mehr Spiele erzielt hat.
6. **Alphabetische Sortierung:** Letzter technischer Tiebreaker.`
  },
  {
    id: 'meisterschaft-ergebnis-eintragen',
    module: 'Meisterschaft',
    title: 'Ergebnis nach Meisterschaftsspiel eintragen',
    keywords: ['ergebnis eintragen', 'ergebnis melden', 'meisterschaft eintragen', 'score eintragen', 'spiel ergebnis', 'meisterschaft eintragen'],
    content: `Jeder beteiligte Spieler kann das Ergebnis direkt erfassen:

1. Öffne das Modul **Meisterschaft**.
2. Suche deine Partie im Spielplan oder K.-o.-Baum.
3. Klicke auf der Spielkarte auf **„Ergebnis eintragen“**.
4. Trage die Spiele für Satz 1 und Satz 2 ein.
5. Bei 1:1 Sätzen schaltet das Fenster automatisch das Feld für den Match-Tiebreak frei (z. B. 10:8).
6. Klicke auf **„Ergebnis speichern“** – Tabelle und K.-o.-Baum aktualisieren sich sofort.`
  },

  // ---------------------------------------------------------------------------
  // Modul 7: Arbeitseinsätze (Helferstunden & Schichten)
  // ---------------------------------------------------------------------------
  {
    id: 'arbeitseinsaetze-soll-stunden',
    module: 'Arbeitseinsätze',
    title: 'Wie viele Arbeitsstunden muss ich leisten?',
    keywords: ['arbeitsstunden wie viele', 'wie viele stunden arbeit', 'sollstunden', 'pflichtstunden', 'helferstunden wie viele', 'stunden pro saison'],
    content: `Die Arbeitsstunden-Regelung unseres Vereins:

• **Sollvorgabe:** Jedes aktive Mitglied leistet pro Saison in der Regel **{{SOLL_STUNDEN}} Arbeitsstunden** ab.
• **Saisonfrist:** Alle Stunden sollten bis zum Saisonende (in der Regel **31. Oktober**) erbracht sein.
• **Erfassung:** Im Menü **Arbeitseinsätze** kannst du eigene Stunden per **„Einsatz einreichen“** melden oder dich für **„Offene Schichten“** eintragen.`
  },
  {
    id: 'support-arbeitsstunden-einsehen',
    module: 'Supportmatrix',
    title: 'Wo sehe ich meine geleisteten Arbeitsstunden?',
    keywords: ['arbeitsstunden', 'arbeitszeit', 'fortschrittsbalken', 'helferstunden', 'wo sehe ich', 'meine stunden', 'soll-stunden'],
    content: `Im Modul **Arbeitseinsätze** (Aktentaschensymbol):

• **Fortschrittsbalken:** Direkt im Kopfbereich siehst du deinen aktuellen Stand (z. B. *7.5 von 10.0 Std. geleistet*).
• **Status:** Zeigt offene Stunden und die Saisonfrist (in der Regel 31. Oktober).
• **Übersicht:** Darunter findest du eine Liste aller deiner eingereichten Einsätze mit Prüfstatus (*Bestätigt*, *Ausstehend* oder *Abgelehnt*).`
  },

  // ---------------------------------------------------------------------------
  // Modul 3: Rangliste (Forderungspyramide)
  // ---------------------------------------------------------------------------
  {
    id: 'rangliste-pyramide',
    module: 'Rangliste',
    title: 'Die Ranglisten-Pyramide & Forderungsregeln',
    keywords: ['rangliste', 'pyramide', 'forderung', 'fordern', 'herausfordern', 'platztausch', 'wie fordern'],
    content: `Die vereinsinterne Forderungspyramide (Symbol: Medaille):

• **Forderungsrecht:** Du darfst Spieler fordern, die in der Pyramide über dir stehen (in derselben Reihe links von dir oder in der Reihe direkt darüber).
• **Platztauschprinzip:**
  * **Sieg des Forderers:** Du übernimmst den Rangplatz des Verlierers. Der Verlierer und alle dazwischenliegenden Spieler rücken genau 1 Platz nach unten.
  * **Sieg des Geforderten:** Die Rangliste bleibt unverändert.
• **Ablauf:** Klicke auf das Profil des Spielers in der Pyramide, öffne das Kontaktfenster, vereinbart einen Termin und bucht regulär einen Platz!`
  },

  // ---------------------------------------------------------------------------
  // Modul 5: Liga (Hobbyliga & Partnerbörse)
  // ---------------------------------------------------------------------------
  {
    id: 'liga-hobbyliga-punkte',
    module: 'Liga',
    title: 'Hobbyliga Punktemechanik & Regeln',
    keywords: ['hobbyliga', 'liga', 'ligapunkte', 'partnerbörse', 'inaktivität', 'abzug punkte', 'hobbyliga spiel', 'bonuspunkte'],
    content: `Die Hobbyliga (Symbol: Schild) für ganzjährigen Spielbetrieb:

• **Teilnahme:** Im Profil per Häkchen bei *„Teilnahme an der Hobbyliga“* aktivieren.
• **Punktesystem:**
  * Jede ausgetragene Partie belohnt beide Spieler mit Basispunkten (Standard: 5 Punkte).
  * Siege über höher platzierte Spieler bringen spürbare **Bonuspunkte**!
• **Inaktivitätsdämpfung:** Wer länger als 7 Tage kein Ligaspiel macht, verliert 5 Punkte pro inaktiver Woche.
• **24-Stundenfenster:** Neu gemeldete Ergebnisse bleiben 24 Stunden als vorläufig markiert zur Einsicht beider Spieler.
• **Spielpartner-Börse:** Unter *Liga -> Spielpartner-Börse* kannst du eigene Inserate aufgeben oder auf Gesuche antworten.`
  },

  // ---------------------------------------------------------------------------
  // Modul 8: Mein Profil, Sicherheit & Einstellungen
  // ---------------------------------------------------------------------------
  {
    id: 'profil-privatsphaere-avatar',
    module: 'Mein Profil',
    title: 'Profil, Avatarzuschnitt & Datenschutzeinstellungen',
    keywords: ['profil', 'avatar', 'profilbild', 'bild zuschneiden', 'passwort ändern', 'datenschutz', 'kontaktdaten', 'onboarding'],
    content: `Im Profilmenü (Klick auf deinen Avatar oben rechts):

• **Profilbild (AvatarUploader):** Klicke auf das Kamerasymbol und lade dein Wunschfoto hoch. Das integrierte Werkzeug schneidet das Bild quadratisch zu und komprimiert es blitzschnell auf WebP (< 25 KB).
• **Kontaktdaten freigeben:** Bestimme selbst, ob andere Clubmitglieder in der Börse und Rangliste deine Telefonnummer oder E-Mail sehen dürfen.
• **Passwort ändern:** Jederzeit im Profil mit mindestens 8 Zeichen möglich.
• **Assistent Ace:** Kann jederzeit über die Checkbox *„Assistent \"Ace\" aktivieren“* ein- oder ausgeschaltet werden.`
  },
  {
    id: 'support-ace-deaktivieren',
    module: 'Supportmatrix',
    title: 'Wie deaktiviere ich den Assistenten Ace?',
    keywords: ['ace deaktivieren', 'assistent ausschalten', 'ausblenden', 'ace entfernen', 'maskottchen weg', 'deaktivieren'],
    content: `Du kannst Ace auf zwei Wegen ausschalten:

1. **Direkt im Chat:** Klicke oben rechts im Ace-Fenster auf das Drei-Punkte-Menü (⋮) und wähle **„Assistent deaktivieren“**.
2. **Über dein Profil:** Klicke oben rechts auf deinen Avatar, scrolle zu **„Privatsphäre & App-Anzeige“** und schalte **„Assistent \"Ace\" aktivieren“** aus.
• Das Widget wird sofort ausgeblendet und die Einstellung in deinem Konto gespeichert.`
  },

  // ---------------------------------------------------------------------------
  // Offizielle ITF / DTB Tennisregeln
  // ---------------------------------------------------------------------------
  {
    id: 'tennisregel-tiebreak',
    module: 'Tennisregeln',
    title: 'Tie-Break Regeln (Zählweise, Aufschlag, Seitenwechsel)',
    keywords: ['tiebreak', 'tie-break', 'zählweise tiebreak', 'seitenwechsel tiebreak', 'aufschlag tiebreak', 'wie geht tiebreak'],
    content: `Offizielle Zählweise nach ITF Rule 5b:

• **Ziel:** Erster auf **7 Punkte** mit mindestens 2 Punkten Vorsprung (bei 6:6 weiter bis 2 Punkte Differenz).
• **Aufschlagfolge:**
  * Spieler A hat 1 Aufschlag (von rechts).
  * Danach schlägt Spieler B 2 Mal auf (erst von links, dann von rechts).
  * Anschließend wechseln die Aufschläger alle 2 Punkte.
• **Seitenwechsel:** Genau alle **6 gespielten Punkte** (z. B. bei 4:2, 6:6, 9:9 usw.) wechseln die Spieler die Platzseiten.`
  },
  {
    id: 'tennisregel-netzberuehrung',
    module: 'Tennisregeln',
    title: 'Netzberührung während des Ballwechsels',
    keywords: ['netzberührung', 'netz berühren', 'netz berührt', 'schläger ans netz', 'netzpfosten', 'berührung netz'],
    content: `Eindeutige Regel nach ITF Rule 24g:

• **Punktverlust:** Berührt ein Spieler während des laufenden Ballwechsels mit Schläger, Körper oder Kleidung das Netz, Netzband oder die Netzpfosten, verliert er **sofort den Punkt**!
• **Ausnahme:** Wenn der Ballwechsel bereits beendet ist (der Ball ist bereits im Aus oder doppelt aufgesprungen), ist eine Netzberührung unschädlich.`
  },
  {
    id: 'tennisregel-linie',
    module: 'Tennisregeln',
    title: 'Ball auf der Linie (In oder Aus?)',
    keywords: ['ball auf linie', 'linie berührt', 'kratzt die linie', 'in oder aus', 'zweifel', 'abdruck linie'],
    content: `Offizielle Regelung nach ITF Rule 12:

• **Die Linie gehört zum Feld:** Berührt der Ball auch nur die winzigste Außenkante einer Linie, gilt er als **vollkommen GUT**!
• **Entscheidung:** Jeder Spieler entscheidet Bälle auf seiner eigenen Platzhälfte.
• **Fairplaygebot:** Kann ein Spieler einen Ball nicht zu 100 % sicher im Aus sehen, **muss** der Ball zwingend zugunsten des Gegners als „GUT“ gewertet werden.`
  },
  {
    id: 'tennisregel-fussfehler',
    module: 'Tennisregeln',
    title: 'Fußfehler beim Aufschlag',
    keywords: ['fußfehler', 'fussfehler', 'grundlinie übertreten', 'aufschlaglinie treten'],
    content: `Regel nach ITF Rule 18:

• Während des gesamten Aufschlagvorgangs bis zum Balltreffpunkt darf der Aufschläger weder die Grundlinie mit den Füßen berühren noch übertreten.
• Ein Berühren der Grundlinie vor dem Balltreffpunkt ist ein **Fußfehler** (Fehlaufschlag; 1. Aufschlag verloren bzw. Doppelfehler beim 2. Aufschlag).`
  },
  {
    id: 'tennisregel-netzaufschlag',
    module: 'Tennisregeln',
    title: 'Netzaufschlag (Let)',
    keywords: ['netzaufschlag', 'let', 'netzroller aufschlag', 'aufschlag berührt netz'],
    content: `Regel nach ITF Rule 22:

• Berührt der Ball beim Aufschlag das Netz, Netzband oder Netzpfosten und landet danach im korrekten gegnerischen Aufschlagfeld, heißt es **„Let“** – der Aufschlag wird ohne Punktabzug wiederholt!
• Berührt er das Netz und landet im Aus oder falschen Feld, ist es ein gewöhnlicher Fehler.`
  },
  {
    id: 'tennisregel-aufschlag-unten',
    module: 'Tennisregeln',
    title: 'Aufschlag von unten erlaubt?',
    keywords: ['aufschlag von unten', 'unterhandaufschlag', 'von unten servieren', 'darf man von unten aufschlagen'],
    content: `Ja, vollkommen regelkonform!

• Nach den offiziellen ITF- und DTB-Regeln ist der Aufschlag von unten ausdrücklich erlaubt.
• Bedingung: Der Ball muss vor dem Treffen aus der Hand geworfen bzw. losgelassen werden und der Aufschläger muss hinter der Grundlinie stehen.`
  }
];

export interface DynamicKnowledgeVariables {
  clubName?: string;
  guestFeeText?: string;
  advanceDays?: number | string;
  activeBookings?: number | string;
  sollStunden?: number | string;
}

/**
 * Intelligent client-side matcher that finds the most relevant knowledge base entry
 * and dynamically interpolates live tenant settings.
 */
export function findKnowledgeAnswer(
  queryText: string,
  dynamicVars: DynamicKnowledgeVariables = {}
): { title: string; content: string } | null {
  const q = queryText.toLowerCase().trim();
  if (!q) return null;

  let bestMatch: KnowledgeEntry | null = null;
  let highestScore = 0;

  for (const entry of TUTORIAL_KNOWLEDGE) {
    let score = 0;

    // Check title equality / inclusion
    if (q.includes(entry.title.toLowerCase()) || entry.title.toLowerCase().includes(q)) {
      score += 50;
    }

    // Check keywords
    for (const kw of entry.keywords) {
      const lowerKw = kw.toLowerCase();
      if (q === lowerKw) {
        score += 40;
      } else if (q.includes(lowerKw)) {
        score += 20 + lowerKw.length;
      }
    }

    if (score > highestScore && score >= 15) {
      highestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    let content = bestMatch.content;
    const guestFee = dynamicVars.guestFeeText || '10,00 € pro Platzstunde';
    const advanceDays = String(dynamicVars.advanceDays || 14);
    const activeBookings = String(dynamicVars.activeBookings || 3);
    const sollStunden = String(dynamicVars.sollStunden || 10);

    content = content
      .replace(/\{\{GAST_FEE_TEXT\}\}/g, guestFee)
      .replace(/\{\{ADVANCE_DAYS\}\}/g, advanceDays)
      .replace(/\{\{ACTIVE_BOOKINGS\}\}/g, activeBookings)
      .replace(/\{\{SOLL_STUNDEN\}\}/g, sollStunden);

    return {
      title: bestMatch.title,
      content,
    };
  }

  return null;
}
