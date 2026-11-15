import React, { useState, useEffect } from "react";
import defaultFirebaseConfig from "../firebase-applet-config.json";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { activeFirebaseConfig } from "../lib/firebase";

export interface FirebaseConfigType {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
}

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Globale SuperAdmin-Freigabe
    match /{document=**} {
      allow read, write: if isSuperAdmin();
    }

    match /system/{document=**} {
      allow read: if true;
      allow write: if isSuperAdmin();
    }

    match /test/{document=**} {
      allow read, write: if true;
    }

    function isSuperAdmin() {
      return request.auth != null && (
        (request.auth.token.email != null && (
          request.auth.token.email == 'superadmin@system.local' ||
          request.auth.token.email.matches('^superadmin.*')
        )) ||
        (userExists() && getUserData().get('role', '') in ['super-admin', 'superadmin', 'SUPER_ADMIN'])
      );
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    
    function userExists() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }
    
    // Standard Club & Buchungs-Regeln
    match /vereine/{vereinsId}/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /clubs/{clubId}/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}`;

const STORAGE_RULES_SNIPPET = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}`;

export default function SuperAdminFirebaseSettings() {
  // Load saved or default configuration
  const [config, setConfig] = useState<FirebaseConfigType>(() => {
    try {
      const stored = localStorage.getItem("custom_firebase_config");
      if (stored) {
        return { ...defaultFirebaseConfig, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Failed to load saved firebase config:", e);
    }
    return defaultFirebaseConfig as FirebaseConfigType;
  });

  const [rawJsonInput, setRawJsonInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingStatus, setTestingStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"config" | "rules">("config");

  const isCustomized = typeof window !== "undefined" && Boolean(localStorage.getItem("custom_firebase_config"));

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const handleProjectIdChange = (newProjectId: string) => {
    const trimmed = newProjectId.trim();
    setConfig((prev) => {
      // If authDomain or storageBucket were default or matched previous projectId, auto-derive
      const prevProject = prev.projectId;
      const shouldUpdateAuth = !prev.authDomain || prev.authDomain === `${prevProject}.firebaseapp.com` || prev.authDomain.includes("firebaseapp.com");
      const shouldUpdateStorage = !prev.storageBucket || prev.storageBucket === `${prevProject}.firebasestorage.app` || prev.storageBucket.includes("firebasestorage.app");
      return {
        ...prev,
        projectId: trimmed,
        authDomain: shouldUpdateAuth && trimmed ? `${trimmed}.firebaseapp.com` : prev.authDomain,
        storageBucket: shouldUpdateStorage && trimmed ? `${trimmed}.firebasestorage.app` : prev.storageBucket,
      };
    });
  };

  const handleParseJson = () => {
    if (!rawJsonInput.trim()) return;
    try {
      // Clean string if it contains `const firebaseConfig = ` or trailing semicolons
      let cleaned = rawJsonInput.trim();
      if (cleaned.startsWith("const ") || cleaned.startsWith("var ") || cleaned.startsWith("let ")) {
        cleaned = cleaned.substring(cleaned.indexOf("=") + 1).trim();
      }
      if (cleaned.endsWith(";")) {
        cleaned = cleaned.slice(0, -1).trim();
      }

      // Convert JS object literals if unquoted keys are present
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback for JS Object notation
        const jsonCompatible = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        parsed = JSON.parse(jsonCompatible);
      }

      if (!parsed.projectId || !parsed.apiKey) {
        throw new Error("Das JSON muss mindestens 'projectId' und 'apiKey' enthalten.");
      }

      setConfig({
        projectId: parsed.projectId || "",
        appId: parsed.appId || "",
        apiKey: parsed.apiKey || "",
        authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
        firestoreDatabaseId: parsed.firestoreDatabaseId || "(default)",
        storageBucket: parsed.storageBucket || `${parsed.projectId}.firebasestorage.app`,
        messagingSenderId: parsed.messagingSenderId || "",
        measurementId: parsed.measurementId || "",
      });

      setTestMessage("Konfiguration erfolgreich übernommen und alle Felder automatisch befüllt!");
      setTestingStatus("success");
      setTimeout(() => {
        setTestingStatus("idle");
        setTestMessage(null);
      }, 4000);
      setRawJsonInput("");
    } catch (err: any) {
      setTestingStatus("error");
      setTestMessage(`Fehler beim Verarbeiten: ${err.message || "Ungültiges Format. Bitte den Codeblock aus der Firebase-Konsole kopieren."}`);
    }
  };

  const handleTestConnection = async () => {
    setTestingStatus("testing");
    setTestMessage("Prüfe Verbindung zur angegebenen Firebase-Instanz...");

    const testAppName = `test-app-${Date.now()}`;
    let testApp: any = null;

    try {
      const startTime = performance.now();
      testApp = initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        },
        testAppName
      );

      const testDb = getFirestore(testApp, config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)" ? config.firestoreDatabaseId : undefined);
      
      // Ping test document
      await getDocFromServer(doc(testDb, "test", "connection")).catch(() => {
        // Even if the document does not exist, reaching the server without auth/network error is a valid connection
      });

      const elapsed = Math.round(performance.now() - startTime);
      setTestingStatus("success");
      setTestMessage(`Erfolgreich verbunden mit Projekt "${config.projectId}" (Latenz: ${elapsed}ms)`);
    } catch (err: any) {
      console.error("Firebase connection test error:", err);
      setTestingStatus("error");
      setTestMessage(
        `Verbindung fehlgeschlagen: ${err.message || "Projekt nicht erreichbar oder API-Key ungültig"}`
      );
    } finally {
      if (testApp) {
        try {
          await deleteApp(testApp);
        } catch {
          // ignore cleanup error
        }
      }
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem("custom_firebase_config", JSON.stringify(config));
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (e: any) {
      alert("Fehler beim Speichern: " + e.message);
    }
  };

  const handleResetToDefault = () => {
    if (
      window.confirm(
        "Möchtest du wirklich auf die Standard-Konfiguration der Anwendung zurücksetzen?"
      )
    ) {
      localStorage.removeItem("custom_firebase_config");
      setConfig(defaultFirebaseConfig as FirebaseConfigType);
      setSaveSuccess(true);
      setTestMessage("Standard-Konfiguration wiederhergestellt.");
      setTimeout(() => {
        setSaveSuccess(false);
        setTestMessage(null);
      }, 3000);
    }
  };

  const handleDownloadConfig = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "firebase-applet-config.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2.5">
              <i className="fa-solid fa-cloud text-[#e47726]"></i>
              Firebase & Cloud-Datenbank
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Verwalte die zentrale Datenbankverbindung oder verbinde eine neue Firebase-Instanz für Open-Source / Mandanten-Deployments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 text-xs font-black rounded-lg border flex items-center gap-1.5 ${
                isCustomized
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
              }`}
            >
              <i
                className={`fa-solid ${
                  isCustomized ? "fa-sliders" : "fa-circle-check text-emerald-600"
                }`}
              ></i>
              {isCustomized ? "Benutzerdefinierte Instanz" : "Standard-Projekt aktiv"}
            </span>
          </div>
        </div>

        {/* Live Status Banner */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
            <div>
              <div className="text-xs font-black text-slate-800 flex items-center gap-2">
                Verbunden mit Projekt:
                <code className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-mono text-[11px]">
                  {config.projectId || "Nicht konfiguriert"}
                </code>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Auth-Domain: <span className="font-mono text-slate-600">{config.authDomain || "-"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleTestConnection}
              disabled={testingStatus === "testing"}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              <i
                className={`fa-solid ${
                  testingStatus === "testing"
                    ? "fa-spinner fa-spin text-[#e47726]"
                    : "fa-network-wired text-[#e47726]"
                }`}
              ></i>
              {testingStatus === "testing" ? "Prüfe..." : "Verbindung testen"}
            </button>
            <button
              onClick={handleDownloadConfig}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Konfiguration als JSON herunterladen"
            >
              <i className="fa-solid fa-download text-slate-500"></i>
              Exportieren
            </button>
          </div>
        </div>

        {/* Status Message Alerts */}
        {testMessage && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in ${
              testingStatus === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : testingStatus === "error"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
            }`}
          >
            <i
              className={`fa-solid ${
                testingStatus === "success"
                  ? "fa-circle-check text-emerald-600 text-sm"
                  : testingStatus === "error"
                  ? "fa-circle-exclamation text-rose-600 text-sm"
                  : "fa-info-circle text-blue-600 text-sm"
              }`}
            ></i>
            <span>{testMessage}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="p-4 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-bold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
              <span>Firebase-Konfiguration erfolgreich gespeichert!</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-black transition-all"
            >
              Seite neu laden
            </button>
          </div>
        )}

        {/* Sub Navigation Bar */}
        <div className="flex border-b border-slate-200 gap-6 text-xs font-black uppercase tracking-wider">
          <button
            onClick={() => setActiveSubTab("config")}
            className={`pb-3 transition-all border-b-2 flex items-center gap-2 ${
              activeSubTab === "config"
                ? "border-[#e47726] text-[#e47726]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <i className="fa-solid fa-sliders"></i>
            Konfiguration & Schlüssel
          </button>
          <button
            onClick={() => setActiveSubTab("rules")}
            className={`pb-3 transition-all border-b-2 flex items-center gap-2 ${
              activeSubTab === "rules"
                ? "border-[#e47726] text-[#e47726]"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <i className="fa-solid fa-shield-halved"></i>
            Sicherheitsregeln
          </button>
        </div>

        {/* SUBTAB 1: Configuration Form */}
        {activeSubTab === "config" && (
          <div className="space-y-6">
            {/* Step 1: 1-Klick Import (Empfohlen) */}
            <div className="p-5 bg-slate-50 rounded-2xl border-2 border-slate-200/90 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#e47726] text-white flex items-center justify-center text-[10px] font-black">1</span>
                  Schnell-Import (Empfohlen: 1-Klick Setup)
                </span>
                <span className="text-[11px] text-slate-400">
                  Firebase Console &rarr; Projekteinstellungen &rarr; Allgemeine Einstellungen
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Kopiere den Web-App-Codeblock (<code className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700">const firebaseConfig = &#123; ... &#125;;</code>) direkt aus Firebase und füge ihn hier ein. Alle Pflicht- und Zusatzfelder werden automatisch befüllt:
              </p>
              <div className="flex gap-2">
                <textarea
                  value={rawJsonInput}
                  onChange={(e) => setRawJsonInput(e.target.value)}
                  placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "mein-projekt.firebaseapp.com",\n  projectId: "mein-projekt",\n  storageBucket: "mein-projekt.firebasestorage.app",\n  messagingSenderId: "123456789",\n  appId: "1:123456789:web:abcdef"\n};`}
                  rows={3}
                  className="w-full text-xs font-mono p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-[#e47726] focus:outline-none resize-none font-medium placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseJson}
                  disabled={!rawJsonInput.trim()}
                  className="px-4 py-2 bg-[#e47726] hover:bg-[#c8631b] disabled:opacity-40 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  Automatisch einlesen & befüllen
                </button>
              </div>
            </div>

            {/* Step 2: Primary Required Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-black">2</span>
                  Pflicht-Verbindungsdaten
                </span>
                <span className="text-[11px] text-slate-400">Nur diese 2 Felder sind für die Datenbank zwingend nötig</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Project ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Firebase Project ID <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-slate-400 font-mono">projectId</span>
                  </label>
                  <input
                    type="text"
                    value={config.projectId}
                    onChange={(e) => handleProjectIdChange(e.target.value)}
                    placeholder="z. B. tc-musterstadt-12345"
                    className="w-full text-xs font-mono p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    Domain & Storage-Bucket werden bei Eingabe automatisch passend abgeleitet.
                  </p>
                </div>

                {/* API Key */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>Web API Key <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] text-slate-400 font-mono">apiKey</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={config.apiKey}
                      onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                      placeholder="AIzaSy..."
                      className="w-full text-xs font-mono p-2.5 pr-10 bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title={showApiKey ? "Verbergen" : "Anzeigen"}
                    >
                      <i className={`fa-solid ${showApiKey ? "fa-eye-slash" : "fa-eye"} text-xs`}></i>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Öffentlicher Browser-Schlüssel für Client-Abfragen.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Collapsible Advanced Settings */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left cursor-pointer border-b border-transparent"
              >
                <div className="flex items-center gap-2.5">
                  <i className={`fa-solid fa-chevron-right text-xs text-slate-400 transition-transform ${showAdvanced ? "rotate-90" : ""}`}></i>
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Erweiterte Parameter (Optional / Automatisch)
                    </span>
                    <p className="text-[11px] text-slate-400 font-normal">
                      Auth Domain, Storage Bucket, App-ID, Push Messaging &amp; Named Database
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                  {showAdvanced ? "Einklappen" : "Anzeigen & Bearbeiten"}
                </span>
              </button>

              {showAdvanced && (
                <div className="p-5 border-t border-slate-200 bg-white space-y-4 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* App ID */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>App ID</span>
                        <span className="text-[10px] text-slate-400 font-mono">appId</span>
                      </label>
                      <input
                        type="text"
                        value={config.appId}
                        onChange={(e) => setConfig({ ...config, appId: e.target.value })}
                        placeholder="1:123456789:web:abcdef"
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                      />
                    </div>

                    {/* Auth Domain */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Auth Domain</span>
                        <span className="text-[10px] text-slate-400 font-mono">authDomain</span>
                      </label>
                      <input
                        type="text"
                        value={config.authDomain}
                        onChange={(e) => setConfig({ ...config, authDomain: e.target.value })}
                        placeholder="z. B. tc-musterstadt.firebaseapp.com"
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                      />
                    </div>

                    {/* Storage Bucket */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Storage Bucket (Uploads / Bilder)</span>
                        <span className="text-[10px] text-slate-400 font-mono">storageBucket</span>
                      </label>
                      <input
                        type="text"
                        value={config.storageBucket}
                        onChange={(e) => setConfig({ ...config, storageBucket: e.target.value })}
                        placeholder="z. B. tc-musterstadt.firebasestorage.app"
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                      />
                    </div>

                    {/* Messaging Sender ID */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Messaging Sender ID (Push Notifications)</span>
                        <span className="text-[10px] text-slate-400 font-mono">messagingSenderId</span>
                      </label>
                      <input
                        type="text"
                        value={config.messagingSenderId}
                        onChange={(e) => setConfig({ ...config, messagingSenderId: e.target.value })}
                        placeholder="123456789"
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                      />
                    </div>

                    {/* Firestore Database ID */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>Firestore Database ID (Nur bei Custom Named DBs)</span>
                        <span className="text-[10px] text-slate-400 font-mono">firestoreDatabaseId</span>
                      </label>
                      <input
                        type="text"
                        value={config.firestoreDatabaseId || ""}
                        onChange={(e) => setConfig({ ...config, firestoreDatabaseId: e.target.value })}
                        placeholder="(default)"
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#e47726] outline-none"
                      />
                      <p className="text-[10px] text-slate-400">
                        In 99% aller Fälle einfach leer lassen oder <code className="font-mono text-slate-600">(default)</code> nutzen.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={!isCustomized}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold disabled:opacity-40 disabled:hover:text-rose-600 flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-arrow-rotate-left"></i>
                Auf Standard-Konfiguration zurücksetzen
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-vial text-[#e47726]"></i>
                  Verbindung testen
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-2.5 bg-[#e47726] hover:bg-[#c8631b] text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  Konfiguration speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: Rules Snippets */}
        {activeSubTab === "rules" && (
          <div className="space-y-6">
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <i className="fa-solid fa-triangle-exclamation text-amber-600 mt-0.5 shrink-0"></i>
              <div>
                <strong>Wichtiger Hinweis für neue Firebase-Instanzen:</strong>
                <p className="mt-0.5 text-amber-800">
                  Damit die Buchungslogik, Berechtigungen und Uploads funktionieren, müssen die folgenden Regeln in der Firebase Console unter <em>Firestore &rarr; Regeln</em> bzw. <em>Storage &rarr; Regeln</em> eingetragen werden.
                </p>
              </div>
            </div>

            {/* Firestore Rules */}
            <div className="rounded-2xl border border-slate-800/80 overflow-hidden shadow-md">
              <div className="bg-slate-900/95 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300 ml-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-database text-emerald-400"></i>
                    firestore.rules
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(FIRESTORE_RULES_SNIPPET, "firestore")}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700 shadow-xs"
                >
                  <i className={`fa-solid ${copiedSection === "firestore" ? "fa-check text-emerald-400" : "fa-copy"}`}></i>
                  {copiedSection === "firestore" ? "Kopiert!" : "Regeln kopieren"}
                </button>
              </div>
              <pre className="p-4 bg-[#0d1117] text-slate-200 text-[11px] font-mono overflow-x-auto max-h-72 leading-relaxed">
                {FIRESTORE_RULES_SNIPPET}
              </pre>
            </div>

            {/* Storage Rules */}
            <div className="rounded-2xl border border-slate-800/80 overflow-hidden shadow-md">
              <div className="bg-slate-900/95 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300 ml-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-folder-open text-amber-400"></i>
                    storage.rules
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(STORAGE_RULES_SNIPPET, "storage")}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700 shadow-xs"
                >
                  <i className={`fa-solid ${copiedSection === "storage" ? "fa-check text-emerald-400" : "fa-copy"}`}></i>
                  {copiedSection === "storage" ? "Kopiert!" : "Regeln kopieren"}
                </button>
              </div>
              <pre className="p-4 bg-[#0d1117] text-slate-200 text-[11px] font-mono overflow-x-auto leading-relaxed">
                {STORAGE_RULES_SNIPPET}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
