import React, { useState, useEffect } from "react";
import { Download, Share, PlusSquare, X, Smartphone, MoreVertical } from "lucide-react";

interface PwaInstallBannerProps {
  clubName?: string;
  primaryColor?: string;
  logoUrl?: string;
}

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({
  clubName = "SV Neuhausen Tennis",
  primaryColor = "#16422E",
  logoUrl = "/icons/icon-192x192.png",
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [platform, setPlatform] = useState<"native" | "android" | "ios" | null>(null);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  useEffect(() => {
    // 1. Prüfen, ob die App bereits im Standalone-Modus läuft (schon installiert)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) {
      return;
    }

    // 2. Prüfen, ob der Nutzer den Banner innerhalb der letzten 30 Tage geschlossen hat
    const dismissedUntil = localStorage.getItem("pwa_prompt_dismissed_until");
    if (dismissedUntil && parseInt(dismissedUntil, 10) > Date.now()) {
      return;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroid = /android/i.test(userAgent);
    const isIos = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios|edgios/.test(userAgent);

    // 3. Android / Chromium Event-Listener (Chrome, Edge, Samsung Internet, Brave)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("native");
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 4. Fallback-Erkennung für Android (z. B. Brave mit Shields oder bevor Chrome das Event abfeuert)
    let timer: NodeJS.Timeout;
    if (isAndroid) {
      timer = setTimeout(() => {
        setPlatform((prev) => prev || "android");
        setIsVisible(true);
      }, 3000);
    } else if (isIos) {
      timer = setTimeout(() => {
        setPlatform("ios");
        setIsVisible(true);
      }, 3500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    // 30 Tage nicht mehr anzeigen
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem("pwa_prompt_dismissed_until", (Date.now() + thirtyDaysMs).toString());
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult?.outcome === "accepted") {
          setIsVisible(false);
        } else {
          // Falls vom Browser (z.B. Brave) ignoriert oder unterdrückt
          setShowAndroidModal(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn("Install prompt failed, fallback to modal:", err);
        setShowAndroidModal(true);
      }
    } else if (platform === "android" || platform === "native") {
      setShowAndroidModal(true);
    } else if (platform === "ios") {
      setShowIosModal(true);
    }
  };

  if (!isVisible && !showIosModal && !showAndroidModal) {
    return null;
  }

  return (
    <>
      {/* Schwebender Bottom-Banner */}
      {isVisible && (
        <aside
          role="region"
          aria-label="App Installation"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[100] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 text-slate-800 dark:text-slate-100 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
        >
          <button
            onClick={handleDismiss}
            aria-label="Hinweis schließen"
            className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3.5 pr-6">
            <div className="w-12 h-12 flex-shrink-0 rounded-xl overflow-hidden bg-white p-1 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-center">
              <img
                src={logoUrl}
                alt={clubName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/icons/icon-192x192.png";
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {clubName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Als App auf deinem Startbildschirm für schnellen 1-Klick-Zugriff.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              style={{ backgroundColor: primaryColor }}
              className="flex-1 py-2 px-3 rounded-xl text-white font-medium text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>App installieren</span>
            </button>
            <button
              onClick={handleDismiss}
              className="py-2 px-3 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Später
            </button>
          </div>
        </aside>
      )}

      {/* Android / Brave Anleitung Modal */}
      {showAndroidModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAndroidModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white p-1 border border-slate-200 dark:border-slate-700">
                  <img
                    src={logoUrl}
                    alt={clubName}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/icons/icon-192x192.png";
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    App installieren
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Brave / Android Browser
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAndroidModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 my-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <MoreVertical className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">1. Menü öffnen</span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Tippe oben oder unten im Browser auf die 3 Punkte (⋮).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    2. „App installieren“
                  </span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Wähle im Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowAndroidModal(false);
                handleDismiss();
              }}
              style={{ backgroundColor: primaryColor }}
              className="w-full py-2.5 rounded-xl text-white font-medium text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer mt-2"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}

      {/* iOS Anleitung Modal */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white p-1 border border-slate-200 dark:border-slate-700">
                  <img
                    src={logoUrl}
                    alt={clubName}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/icons/icon-192x192.png";
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    App installieren
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Unter Apple iOS (Safari)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 my-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">1. Teilen</span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Tippe unten in der Safari-Leiste auf das Teilen-Symbol.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    2. Zum Home-Bildschirm
                  </span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Scrolle in der Auswahl nach unten und tippe darauf.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-xs">3</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    3. Hinzufügen
                  </span>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Oben rechts mit „Hinzufügen“ bestätigen – fertig!
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIosModal(false);
                handleDismiss();
              }}
              style={{ backgroundColor: primaryColor }}
              className="w-full py-2.5 rounded-xl text-white font-medium text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer mt-2"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}
    </>
  );
};
