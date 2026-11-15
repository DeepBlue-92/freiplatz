import React from 'react';

export const FirebaseConfigError: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-800 border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-2xl">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Datenbank-Verbindung fehlt</h1>
            <p className="text-xs text-slate-400">Firebase-Konfiguration erforderlich</p>
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/60 space-y-2 text-xs text-slate-300 leading-relaxed">
          <p className="font-semibold text-rose-400">
            Bitte konfiguriere deine Umgebungsvariablen (.env):
          </p>
          <p className="text-slate-400">
            Kopiere die Vorlage <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">.env.example</code> zu <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">.env</code> und trage deine Firebase-Projektzugangsdaten ein.
          </p>
        </div>

        <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
          <div>VITE_FIREBASE_API_KEY=...</div>
          <div>VITE_FIREBASE_AUTH_DOMAIN=...</div>
          <div>VITE_FIREBASE_PROJECT_ID=...</div>
          <div>VITE_FIREBASE_STORAGE_BUCKET=...</div>
          <div>VITE_FIREBASE_MESSAGING_SENDER_ID=...</div>
          <div>VITE_FIREBASE_APP_ID=...</div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-11 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className="fa-solid fa-arrows-rotate"></i>
            <span>Seite neu laden</span>
          </button>
        </div>
      </div>
    </div>
  );
};
