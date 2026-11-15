<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Freiplatz – Tennis Court Booking & Club Management

Open-Source Club- und Platzbuchungssystem auf Basis von React, TypeScript und Firebase.

## Schnellstart

### 1. Voraussetzungen
- Node.js (v18+)
- Ein Firebase-Projekt (Firestore & Firebase Authentication aktiviert)

### 2. Konfiguration
Kopiere die Vorlage für die Umgebungsvariablen:
```bash
cp .env.example .env
```
Trage deine Firebase-Projekt-Zugangsdaten in `.env` ein:
```env
VITE_FIREBASE_API_KEY=dein_api_key
VITE_FIREBASE_AUTH_DOMAIN=dein_projekt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dein_projekt_id
VITE_FIREBASE_STORAGE_BUCKET=dein_projekt.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=deine_sender_id
VITE_FIREBASE_APP_ID=deine_app_id
# Optional:
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
VITE_FIREBASE_MEASUREMENT_ID=
```

### 3. Starten
```bash
npm install
npm run dev
```

### 4. First-Run Setup Wizard
Beim ersten Start gegen eine frische Firebase-Instanz führt dich der **First-Run Setup Wizard** automatisch durch die Einrichtung:
1. Erstellung des initialen Superadmin-Accounts mit sicherem individuellem Passwort.
2. Auswahl der Betriebsart:
   - **Single-Tenant**: Für einzelne Vereine (Mandantenverwaltung ausgeblendet).
   - **Multi-Tenant**: Zur zentralen Verwaltung mehrerer Clubs/Mandanten.

Bestehende Live-Installationen mit vorhandenen Benutzern erkennen automatisch ihren Status und bleiben ohne Unterbrechung voll funktionsfähig.
