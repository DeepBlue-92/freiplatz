import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { User, LeaguePartnerSearch } from '../../types';

interface CreateAdModalProps {
  currentUser: User;
  userRank?: number;
  existingSearch?: LeaguePartnerSearch | null;
  onClose: () => void;
  onSave: (availabilityText: string, expiresAt: string, showContactInfo: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export const CreateAdModal: React.FC<CreateAdModalProps> = ({
  currentUser,
  userRank,
  existingSearch,
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Ensure initial off-screen render occurs before sliding in
    const frameId = requestAnimationFrame(() => {
      const timer = setTimeout(() => {
        setIsAnimatingIn(true);
      }, 30);
      return () => clearTimeout(timer);
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setIsAnimatingIn(false);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  const [availabilityText, setAvailabilityText] = useState(existingSearch?.availabilityText || '');
  const [showContactInfo, setShowContactInfo] = useState<boolean>(
    existingSearch && existingSearch.showContactInfo !== undefined
      ? existingSearch.showContactInfo
      : false
  );
  
  // Calculate default expiration (14 days from today)
  const getDefaultExpiry = (days: number) => {
    if (days >= 36500) return '2099-12-31';
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const isUnlimited = (expDate?: string) => {
    if (!expDate) return false;
    const year = new Date(expDate).getFullYear();
    return year > 2050;
  };

  const [expiresAt, setExpiresAt] = useState<string>(
    existingSearch?.expiresAt ? existingSearch.expiresAt.split('T')[0] : getDefaultExpiry(14)
  );

  const [presetDays, setPresetDays] = useState<number>(
    existingSearch?.expiresAt && isUnlimited(existingSearch.expiresAt) ? 36500 : 14
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApplyPreset = (days: number) => {
    setPresetDays(days);
    if (days >= 36500) {
      setExpiresAt('2099-12-31');
    } else {
      setExpiresAt(getDefaultExpiry(days));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availabilityText.trim()) {
      setError(t('spielpartner.modal.errorAvailability', 'Bitte gib deine Verfügbarkeit an.'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(availabilityText.trim(), expiresAt, showContactInfo);
      handleClose();
    } catch (err) {
      console.error(err);
      setError(t('spielpartner.modal.errorSave', 'Fehler beim Speichern der Anzeige.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete();
      handleClose();
    } catch (err) {
      console.error(err);
      setError(t('spielpartner.modal.errorDelete', 'Fehler beim Löschen der Anzeige.'));
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
      onClick={handleClose}
      style={{
        opacity: !isAnimatingIn || isClosing ? 0 : 1,
        transitionDuration: isClosing ? "200ms" : "250ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: isClosing ? "none" : "auto",
      }}
    >
      <div
        className="w-full sm:w-[450px] max-w-[100vw] h-[100dvh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto z-10 text-left overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform:
            !isAnimatingIn || isClosing
              ? "translateX(100%)"
              : "translateX(0)",
          transitionDuration: isClosing ? "200ms" : "250ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Drawer Header (Matching Court Booking Drawer style) */}
        <div className="bg-[var(--color-primary)] p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden">
          {/* Background Relief Watermark */}
          <div className="absolute -bottom-8 -right-4 text-white opacity-[0.08] z-0 pointer-events-none transform -rotate-12">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[130px] h-[130px]"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M5.5 5.5A7.5 7.5 0 0 1 12 12A7.5 7.5 0 0 1 5.5 18.5"></path>
              <path d="M18.5 5.5A7.5 7.5 0 0 0 12 12A7.5 7.5 0 0 0 18.5 18.5"></path>
            </svg>
          </div>

          <div className="relative z-10">
            <h3 className="text-xl font-bold uppercase tracking-tight leading-none mb-1 text-white">
              {existingSearch
                ? t('spielpartner.modal.editTitle', 'Anzeige bearbeiten')
                : t('spielpartner.modal.createTitle', 'Anzeige aufgeben')}
            </h3>
            <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 opacity-80" />
              <span>{t('spielpartner.modal.subtitle', 'Spielpartner suchen')}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-base font-medium cursor-pointer"
            title={t('common.close', 'Schließen')}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Content Form Area */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-slate-700">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2 animate-pulse">
                <i className="fa-solid fa-circle-exclamation text-rose-500 text-base"></i>
                <span>{error}</span>
              </div>
            )}

            {/* Availability Text */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                {t('spielpartner.modal.availabilityLabel', 'Wann passt es dir normalerweise?')} <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={10}
                value={availabilityText}
                onChange={(e) => setAvailabilityText(e.target.value)}
                placeholder={t('spielpartner.modal.availabilityPlaceholder', 'z. B. Meistens Samstagvormittag oder unter der Woche ab 18 Uhr. Gerne auch für regelmäßiges Training oder lockere Doppel.')}
                className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition resize-y placeholder:font-normal placeholder:text-slate-400 font-sans font-medium min-h-[200px]"
                required
              />
              <p className="text-[11px] font-medium text-slate-400">
                {t('spielpartner.modal.availabilityHelp', 'Beschreibe deine zeitliche Flexibilität oder gewünschte Spieltage.')}
              </p>
            </div>

            {/* Expiration Date */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                {t('spielpartner.modal.expiryLabel', 'Sichtbar bis (Ablaufdatum)')}
              </label>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { days: 7, label: t('spielpartner.modal.days7', '7 Tage') },
                  { days: 14, label: t('spielpartner.modal.days14', '14 Tage') },
                  { days: 30, label: t('spielpartner.modal.days30', '30 Tage') },
                  { days: 36500, label: t('spielpartner.modal.unlimited', 'Unbegrenzt') },
                ].map((p) => {
                  const isSelected =
                    (presetDays === p.days) ||
                    (p.days === 36500 && isUnlimited(expiresAt)) ||
                    (expiresAt === getDefaultExpiry(p.days));
                  return (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => handleApplyPreset(p.days)}
                      className={`py-2 px-2.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'border-[var(--color-primary)] bg-emerald-50 text-[var(--color-primary)] font-black shadow-sm'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {isUnlimited(expiresAt) ? (
                <div className="h-8 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-sans font-medium">
                  <i className="fa-solid fa-infinity text-[var(--color-primary)] text-sm" />
                  <span>{t('spielpartner.modal.permanentAd', 'Daueranzeige aktiv (kein Verfallsdatum)')}</span>
                </div>
              ) : (
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => {
                    setExpiresAt(e.target.value);
                    setPresetDays(0);
                  }}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-[var(--color-primary)] font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                />
              )}
              <p className="text-[11px] font-medium text-slate-400">
                {t('spielpartner.modal.expiryHelp', 'Anzeigen verschwinden nach dem Ablaufdatum automatisch oder können verlängert werden.')}
              </p>
            </div>

            {/* Contact Info Toggle */}
            <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showContactInfo}
                    onChange={(e) => setShowContactInfo(e.target.checked)}
                  />
                  <div className="w-5 h-5 bg-white border-2 border-slate-300 rounded-md peer-checked:bg-[var(--color-primary)] peer-checked:border-[var(--color-primary)] transition"></div>
                  <i className="fa-solid fa-check absolute text-white text-[10px] opacity-0 peer-checked:opacity-100 transition"></i>
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-bold text-slate-800 leading-snug">
                    {t('spielpartner.modal.showContactLabel', 'Meine Kontaktdaten (Telefon & E-Mail) in dieser Anzeige für Matchabsprachen anzeigen')}
                  </span>
                  <p className="text-[11px] font-medium text-slate-500 mt-1">
                    {t('spielpartner.modal.showContactHelp', 'Wenn aktiviert, sehen andere Spieler direkt deine Kontaktinfos in der Anzeige. Diese Einstellung wird in deinem Profil gespeichert.')}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Fixed Bottom Action Footer */}
          <div className="px-5 py-4 border-t-2 border-slate-200 bg-slate-50 shrink-0 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)] z-10">
            {existingSearch && onDelete && confirmDelete ? (
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-10 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider active:scale-95 cursor-pointer"
                >
                  {deleting ? (
                    <i className="fa-solid fa-spinner fa-spin text-[11px]" />
                  ) : (
                    <i className="fa-solid fa-trash-can text-[11px]" />
                  )}
                  {t('spielpartner.modal.confirmDelete', 'Ja, löschen')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 h-10 text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition uppercase tracking-wider active:scale-95 cursor-pointer"
                >
                  {t('common.cancel', 'Abbrechen')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full text-white rounded-xl shadow-md transition-transform active:scale-95 uppercase tracking-widest flex items-center justify-center gap-2 h-10 text-sm font-semibold hover:brightness-95 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {saving ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-[12px]"></i>
                      <span>{t('spielpartner.modal.saving', 'Speichern...')}</span>
                    </>
                  ) : (
                    <>
                      <i className={`fa-solid ${existingSearch ? 'fa-floppy-disk' : 'fa-check-circle'} text-[12px]`}></i>
                      <span>
                        {existingSearch
                          ? t('spielpartner.modal.save', 'Speichern')
                          : t('spielpartner.modal.publish', 'Veröffentlichen')}
                      </span>
                    </>
                  )}
                </button>

                {existingSearch && onDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 shrink-0 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl shadow-md transition-transform active:scale-95 uppercase tracking-widest text-[10px] flex items-center justify-center gap-1.5 cursor-pointer"
                    title={t('spielpartner.modal.deleteAdTitle', 'Anzeige löschen')}
                  >
                    <i className="fa-solid fa-trash-can text-[11px]"></i>
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
