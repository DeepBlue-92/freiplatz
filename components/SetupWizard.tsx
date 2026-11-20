import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useSystemConfig } from '../contexts/SystemConfigContext';

interface SetupWizardProps {
  onSetupComplete?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onSetupComplete }) => {
  const { setSystemConfigState, refreshSystemConfig } = useSystemConfig();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [multiTenantMode, setMultiTenantMode] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validierungen
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Die Passwörter stimmen nicht überein.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Firebase Auth: User erstellen
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = userCredential.user;
      const uid = firebaseUser.uid;

      const nowIso = new Date().toISOString();

      // 2. Firestore: User in 'users'-Collection mit role 'super-admin'
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, {
        id: uid,
        email: email.trim().toLowerCase(),
        name: email.trim().split('@')[0],
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super-admin',
        hauptAdmin: true,
        gender: 'm',
        createdAt: nowIso,
        status: 'active',
        isSuspended: false,
      });

      // 3. Firestore: system/status Dokument anlegen
      const statusDocRef = doc(db, 'system', 'status');
      await setDoc(statusDocRef, {
        isInitialized: true,
        multiTenantMode: multiTenantMode,
        initializedAt: nowIso,
        initializedBy: email.trim().toLowerCase(),
      });

      // 4. System-State im Context aktualisieren & Weiterleitung
      setSystemConfigState({
        isInitialized: true,
        multiTenantMode: multiTenantMode,
      });

      await refreshSystemConfig();

      if (onSetupComplete) {
        onSetupComplete();
      } else {
        // Fallback: URL auf Dashboard / Root leiten
        window.location.hash = '#/';
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Setup Wizard Error:', err);
      let msg = 'Fehler bei der Initialisierung des Systems.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Diese E-Mail-Adresse wird bereits verwendet.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Das Passwort ist zu schwach (mindestens 8 Zeichen erforderlich).';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Ungültiges E-Mail-Format.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 to-slate-900 border-b border-emerald-900/40 p-6 sm:p-8">
          <div className="flex items-center gap-3.5 mb-2">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl shadow-inner">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                First-Run Setup
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                Freiplatz Initialisierung
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mt-2">
            Willkommen! Es wurden keine bestehenden Konten gefunden. Richte jetzt das primäre Superadminkonto und die Systemarchitektur ein.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl p-4 text-xs font-semibold flex items-start gap-3">
              <i className="fa-solid fa-triangle-exclamation text-base mt-0.5 shrink-0"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sektion 1: Superadmin Zugangsdaten */}
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-emerald-500"></i>
              <span>1. Superadminkonto anlegen</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                E-Mail-Adresse
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@meinverein.de"
                  className="w-full h-11 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                />
                <i className="fa-regular fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Passwort (min. 8 Zeichen)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Passwort wiederholen
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-10 pr-4 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
                </div>
              </div>
            </div>
          </div>

          {/* Sektion 2: Systemmodus */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <i className="fa-solid fa-network-wired text-blue-500"></i>
              <span>2. Betriebsmodus wählen</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Option A: Single-Tenant */}
              <label
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                  !multiTenantMode
                    ? 'bg-emerald-950/20 border-emerald-500/80 ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-building text-sm text-emerald-400"></i>
                    <span className="font-bold text-xs text-white">Single-Tenant</span>
                  </div>
                  <input
                    type="radio"
                    name="systemMode"
                    checked={!multiTenantMode}
                    onChange={() => setMultiTenantMode(false)}
                    className="text-emerald-500 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Für <strong>einen einzelnen Verein</strong>. Kein Mandantennetzwerk – vereinfachte Oberfläche für maximale Übersicht.
                </p>
              </label>

              {/* Option B: Multi-Tenant */}
              <label
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                  multiTenantMode
                    ? 'bg-blue-950/20 border-blue-500/80 ring-1 ring-blue-500/50'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-sitemap text-sm text-blue-400"></i>
                    <span className="font-bold text-xs text-white">Multi-Tenant</span>
                  </div>
                  <input
                    type="radio"
                    name="systemMode"
                    checked={multiTenantMode}
                    onChange={() => setMultiTenantMode(true)}
                    className="text-blue-500 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Für <strong>Netzwerke & Plattformen</strong> mit mehreren eigenständigen Vereinen und Vereinsumschalter.
                </p>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  <span>System wird initialisiert...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-check"></i>
                  <span>System jetzt initialisieren</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
