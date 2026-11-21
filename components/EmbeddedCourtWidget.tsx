import React, { useState, useMemo, useEffect, useRef } from "react";
import { User, Booking, RangeLock, RegularLock } from "../types";
import {
  Calendar,
  Lock,
  Plus,
  LogIn,
  ExternalLink,
  UserCheck,
} from "lucide-react";

interface EmbeddedCourtWidgetProps {
  clubId: string;
  clubName?: string;
  primaryColor?: string;
  courts?: string[];
  bookings?: Booking[];
  rangeLocks?: RangeLock[];
  recurringLocks?: RegularLock[];
  currentUser?: User | null;
  defaultView?: "day" | "three_days" | "week";
  allowViewSwitch?: boolean;
  showHeader?: boolean;
  courtDisplay?: "all" | "single";
  widgetWidth?: "narrow" | "medium" | "wide";
  widgetHeight?: "low" | "medium" | "high";
  iconShape?: "box" | "round" | "bubble";
  customColor?: string;
  onLogin?: (username: string, pass: string) => Promise<boolean | void>;
  onSelectSlot?: (court: string, time: string, date: string) => void;
  onNavigateToFullApp?: (court?: string, time?: string, date?: string) => void;
}

export const EmbeddedCourtWidget: React.FC<EmbeddedCourtWidgetProps> = ({
  clubId,
  clubName = "Tennisclub",
  primaryColor = "#1b4332",
  courts = ["Platz 1", "Platz 2"],
  bookings = [],
  rangeLocks = [],
  recurringLocks = [],
  currentUser = null,
  showHeader = false,
  customColor,
  onLogin,
  onSelectSlot,
  onNavigateToFullApp,
}) => {
  // Effective button green color (defaults to SV Neuhausen dark green #1b4332)
  const effectiveColor = customColor || primaryColor || "#1b4332";

  // URL parameters for theme override
  const urlParams = useMemo(() => {
    if (typeof window === "undefined") {
      return { theme: "auto", header: null, color: null };
    }
    const sp = new URLSearchParams(window.location.search);
    return {
      theme: sp.get("theme") || "auto",
      header: sp.get("header") !== null ? sp.get("header") === "true" : null,
      color: sp.get("color") || null,
    };
  }, []);

  const activeColor = urlParams.color || effectiveColor;
  const effectiveShowHeader = urlParams.header !== null ? urlParams.header : showHeader;

  // 3-Day Computations: Heute (0), Morgen (1), Übermorgen (2)
  const threeDays = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const days = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      let label = "Heute";
      if (i === 1) label = "Morgen";
      else if (i === 2) label = "Übermorgen";

      const weekdayShort = d.toLocaleDateString("de-DE", { weekday: "short" });
      const dayMonth = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

      days.push({
        index: i,
        dateStr,
        label,
        weekdayShort,
        dayMonth,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, []);

  // Selected Day: 0 = Heute, 1 = Morgen, 2 = Übermorgen
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const now = new Date();
    return now.getHours() >= 22 ? 1 : 0;
  });

  const currentDay = threeDays[selectedDayIndex] || threeDays[0];

  // Auto-switch to tomorrow after 22:00 if on today
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() >= 22 && selectedDayIndex === 0) {
        setSelectedDayIndex(1);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [selectedDayIndex]);

  // 14 hourly slots (08:00 - 22:00)
  const hourlySlots = useMemo(() => {
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    return hours.map((h) => ({
      start: `${String(h).padStart(2, "0")}:00`,
      end: `${String(h + 1).padStart(2, "0")}:00`,
      hour: h,
    }));
  }, []);

  // Always display all courts side-by-side (default to Platz 1 & Platz 2 if none)
  const displayedCourts = useMemo(() => {
    return courts.length > 0 ? courts : ["Platz 1", "Platz 2"];
  }, [courts]);

  // Login Modal State
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<{
    court: string;
    time: string;
    date: string;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentSlotRef = useRef<HTMLTableRowElement>(null);
  const hasAutoScrolledRef = useRef(false);

  // Auto-scroll on initial load for today current hour
  useEffect(() => {
    if (currentDay.isToday && currentSlotRef.current && !hasAutoScrolledRef.current) {
      setTimeout(() => {
        currentSlotRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        hasAutoScrolledRef.current = true;
      }, 200);
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedDayIndex, currentDay.isToday]);

  const isSlotPassed = (dateStr: string, timeStr: string) => {
    const now = new Date();
    const [yr, mon, day] = dateStr.split("-").map(Number);
    const [hr, min] = timeStr.split(":").map(Number);
    const slotTimeObj = new Date(yr, mon - 1, day, hr, min, 0, 0);
    return slotTimeObj < now;
  };

  const getSlotStatus = (court: string, slotHour: number, dateStr: string) => {
    const slotTime = `${String(slotHour).padStart(2, "0")}:00`;

    // 1. Check Range Locks in settings (e.g. Winterpause, Platzsanierung)
    if (rangeLocks && rangeLocks.length > 0) {
      for (const l of rangeLocks) {
        if (!l.courts || !l.courts.includes(court)) continue;
        if (dateStr < l.startDate || dateStr > l.endDate) continue;

        const sTime = l.startTime || "00:00";
        const eTime = l.endTime || "24:00";

        if (dateStr === l.startDate && slotTime < sTime) continue;
        if (dateStr === l.endDate && slotTime >= eTime) continue;

        return {
          type: "locked" as const,
          label: l.title || (l.isEvent ? "Serientermin" : "Winterpause"),
        };
      }
    }

    // 2. Check Recurring Locks in settings (e.g. Freitagsdoppel, Training)
    if (recurringLocks && recurringLocks.length > 0) {
      const d = new Date(dateStr);
      const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      for (const l of recurringLocks) {
        if (day !== l.dayOfWeek) continue;
        if (!l.courts || !l.courts.includes(court)) continue;
        if (slotTime < l.startTime || slotTime >= l.endTime) continue;
        if (!l.isOngoing) {
          if (l.startDate && dateStr < l.startDate) continue;
          if (l.endDate && dateStr > l.endDate) continue;
        }

        return {
          type: "locked" as const,
          label: l.title || (l.isEvent ? "Vereinstraining" : "Gesperrt"),
        };
      }
    }

    // 3. Check regular bookings & manual locks from Firestore
    const match = bookings.find((b) => {
      if (b.court !== court || b.date !== dateStr) return false;
      const bHour = parseInt(b.time.split(":")[0], 10);
      const duration = (b as any).durationHours || (b as any).hours || 1;
      return slotHour >= bHour && slotHour < bHour + duration;
    });

    if (match) {
      if (match.isLocked || (match as any).is_locked || (match as any).locked || match.isEvent) {
        return {
          type: "locked" as const,
          label: match.reason || (match as any).blockReason || "Gesperrt",
        };
      }
      return {
        type: "booked" as const,
        label: "Gebucht",
      };
    }
    return { type: "free" as const, label: "Frei" };
  };

  // Auto-Resize messaging for embedding parent website (postMessage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sendHeight = () => {
      const height = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent.postMessage({ type: "freiplatz-widget-resize", height }, "*");
    };
    sendHeight();
    const ro = new ResizeObserver(() => sendHeight());
    ro.observe(document.body);
    window.addEventListener("resize", sendHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendHeight);
    };
  }, [selectedDayIndex]);

  const handleSlotClick = (court: string, time: string, dateStr: string = currentDay.dateStr) => {
    if (isSlotPassed(dateStr, time)) return;

    if (onSelectSlot) {
      onSelectSlot(court, time, dateStr);
      return;
    }
    if (onNavigateToFullApp) {
      onNavigateToFullApp(court, time, dateStr);
      return;
    }

    if (!currentUser) {
      setPendingSlot({ court, time, date: dateStr });
      setLoginError(null);
      setIsLoginModalOpen(true);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError("Bitte Benutzername und Passwort eingeben.");
      return;
    }

    if (!onLogin) {
      if (onNavigateToFullApp) {
        onNavigateToFullApp(
          pendingSlot?.court,
          pendingSlot?.time,
          pendingSlot?.date
        );
      }
      return;
    }

    try {
      setIsSubmittingLogin(true);
      setLoginError(null);
      const res = await onLogin(loginUsername, loginPassword);
      if (res !== false) {
        setIsLoginModalOpen(false);
        if (onSelectSlot && pendingSlot) {
          onSelectSlot(pendingSlot.court, pendingSlot.time, pendingSlot.date);
        } else if (onNavigateToFullApp) {
          onNavigateToFullApp(
            pendingSlot?.court,
            pendingSlot?.time,
            pendingSlot?.date
          );
        }
      } else {
        setLoginError("Anmeldedaten ungültig.");
      }
    } catch (err: any) {
      setLoginError(err.message || "Anmeldefehler aufgetreten.");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const isDarkTheme = urlParams.theme === "dark";
  const currentHourNow = new Date().getHours();

  return (
    <div
      className={`w-full max-w-2xl mx-auto flex flex-col rounded-2xl border shadow-xs overflow-hidden select-none font-sans transition-colors ${
        isDarkTheme
          ? "bg-slate-900 border-slate-800 text-white"
          : "bg-white border-slate-200/90 text-slate-900"
      }`}
      style={{ "--color-primary": activeColor } as React.CSSProperties}
    >
      {/* 1. STICKY TOP CONTAINER: BRANDING (OPTIONAL), 3-TAGE TABS & LEGENDE */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs shadow-2xs border-b border-slate-200">
        {/* OPTIONAL BRANDING HEADER */}
        {effectiveShowHeader && (
          <div
            className={`p-3 sm:p-3.5 border-b flex items-center justify-between gap-3 shrink-0 transition-colors ${
              isDarkTheme
                ? "bg-slate-950/80 border-slate-800"
                : "bg-slate-50/90 border-slate-200/80 backdrop-blur-xs"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 text-white flex items-center justify-center shadow-xs shrink-0 rounded-xl"
                style={{ backgroundColor: activeColor }}
              >
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black tracking-tight uppercase truncate max-w-[200px] sm:max-w-[280px]">
                    {clubName}
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300/60 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    Live
                  </span>
                </div>
                <p className="text-[10px] font-medium text-slate-500">
                  Platzbelegung &amp; Direktanmeldung
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TOP CONTROL BAR: 3-TAGE-TABS & LEGENDE */}
        <div
          className={`p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 transition-colors ${
            isDarkTheme
              ? "bg-slate-950/90 border-slate-800"
              : "bg-slate-50/90 border-slate-200/80 backdrop-blur-xs"
          }`}
        >
          {/* 3-TAGE TABS (Heute, Morgen, Übermorgen) - Rounded Pills */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
            {threeDays.map((d) => {
              const isActive = selectedDayIndex === d.index;
              return (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => setSelectedDayIndex(d.index)}
                  className={`px-3 py-1.5 text-xs font-bold transition-all cursor-pointer rounded-xl flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[var(--color-primary)] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <span>{d.label}</span>
                  <span className={`text-[10px] ${isActive ? "text-emerald-100" : "text-slate-400"}`}>
                    {d.dayMonth}
                  </span>
                </button>
              );
            })}
          </div>

          {/* LEGENDE: EXAKT WIE IN DER BUCHUNGS-APP (Dashboard.tsx) */}
          <div className="flex items-center gap-3 sm:gap-3.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider select-none shrink-0 ml-auto">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-white border border-slate-300 rounded-sm shadow-2xs shrink-0" />
              <span>FREI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 bg-emerald-50 border border-emerald-200 border-l-[3px] rounded-sm shadow-2xs shrink-0"
                style={{ borderLeftColor: activeColor }}
              />
              <span>BELEGT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-slate-100 border border-slate-300 rounded-sm shadow-2xs shrink-0" />
              <span>GESPERRT</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. COURT TABLE CONTAINER (Beide Plätze nebeneinander, kompakte Höhe) */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-auto max-h-[620px] custom-scrollbar divide-y divide-slate-200"
      >
        <table className="w-full border-collapse table-fixed text-left min-w-full">
          <thead>
            <tr className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
              <th className="sticky left-0 top-0 z-35 bg-slate-100/95 backdrop-blur-xs p-1.5 sm:p-2 text-center text-xs font-black uppercase text-slate-500 tracking-wider w-20 sm:w-24 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                Von - Bis
              </th>
              {displayedCourts.map((court) => (
                <th
                  key={court}
                  className="p-1.5 sm:p-2 text-center text-xs font-black uppercase text-slate-800 tracking-wider border-l border-b border-slate-200 truncate"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeColor }}
                    />
                    <span>{court}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hourlySlots.map((slot) => {
              const isCurrentHourSlot = currentDay.isToday && slot.hour === currentHourNow;

              return (
                <tr
                  key={slot.start}
                  ref={isCurrentHourSlot ? currentSlotRef : null}
                  className={`border-b border-slate-200 last:border-b-0 ${
                    isCurrentHourSlot ? "bg-amber-50/30" : ""
                  }`}
                >
                  {/* Time Axis Column */}
                  <td className="sticky left-0 z-10 p-1 text-center align-middle font-bold text-xs text-slate-700 bg-slate-50/90 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                    <div className="flex items-center justify-center">
                      <span className="whitespace-nowrap font-medium text-[11px] sm:text-xs">
                        {parseInt(slot.start.split(":")[0], 10)} - {parseInt(slot.end.split(":")[0], 10)} Uhr
                      </span>
                    </div>
                  </td>

                  {/* Court Columns (Platz 1 & Platz 2 nebeneinander) */}
                  {displayedCourts.map((court) => {
                    const isPassed = isSlotPassed(currentDay.dateStr, slot.start);
                    const status = getSlotStatus(court, slot.hour, currentDay.dateStr);

                    // 1. Locked Court (Winterpause, Locks)
                    if (status.type === "locked") {
                      return (
                        <td
                          key={court}
                          className={`border-l border-b border-slate-200 p-0 text-center align-middle relative select-none ${
                            isPassed ? "bg-rose-50/50 opacity-80" : "bg-rose-50/80"
                          }`}
                        >
                          <div className="w-full h-8 sm:h-9 flex items-center justify-center gap-1 p-1 text-[11px] font-bold text-rose-700 border-l-4 border-l-rose-500 truncate">
                            <Lock className="w-3 h-3 text-rose-500 shrink-0" />
                            <span className="truncate">{status.label || "Gesperrt"}</span>
                          </div>
                        </td>
                      );
                    }

                    // 2. Past Slot
                    if (isPassed) {
                      return (
                        <td
                          key={court}
                          className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-50/70"
                        >
                          <div className="w-full h-8 sm:h-9 flex items-center justify-center p-1 text-[10px] font-bold text-slate-400 cursor-default select-none">
                            <span>{status.type === "free" ? "Vorbei" : "Belegt"}</span>
                          </div>
                        </td>
                      );
                    }

                    // 3. Booked Slot
                    if (status.type === "booked") {
                      return (
                        <td
                          key={court}
                          className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-100/90"
                        >
                          <div className="w-full h-8 sm:h-9 flex items-center justify-center gap-1.5 p-1 text-[11px] font-bold text-slate-600 border-l-4 border-l-slate-400">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-bold">Gebucht</span>
                          </div>
                        </td>
                      );
                    }

                    // 4. Free Slot (Click to Book directly)
                    return (
                      <td
                        key={court}
                        onClick={() => handleSlotClick(court, slot.start, currentDay.dateStr)}
                        className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-white hover:bg-emerald-50/70 hover:border-l-4 hover:border-l-[var(--color-primary)] transition-all cursor-pointer group"
                        title={`Frei • Klicken um ${court} am ${currentDay.weekdayShort}, ${currentDay.dayMonth} um ${slot.start} Uhr zu reservieren`}
                      >
                        <div className="w-full h-8 sm:h-9 flex items-center justify-center p-1">
                          <div
                            className="hidden group-hover:flex items-center gap-1 text-[11px] font-black uppercase tracking-wider animate-in fade-in zoom-in-95 duration-100"
                            style={{ color: activeColor }}
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Buchen</span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. MINIMAL FOOTER: DIRECT APP LINK */}
      {onNavigateToFullApp && (
        <div className="bg-slate-50 border-t border-slate-200 p-2 sm:p-2.5 flex items-center justify-end text-xs shrink-0">
          <button
            type="button"
            onClick={() => onNavigateToFullApp()}
            className="text-slate-600 hover:text-[var(--color-primary)] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 text-xs"
          >
            <span className="hidden sm:inline">Vollständige Buchungs-App öffnen</span>
            <span className="sm:hidden">App öffnen</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LOGIN MODAL (Falls unangemeldet direkt gebucht wird) */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 text-left relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <LogIn className="w-5 h-5 text-[var(--color-primary)]" />
              <span>Anmelden zum Buchen</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Für {pendingSlot?.court} am {pendingSlot?.date} ({pendingSlot?.time} Uhr).
            </p>

            {loginError && (
              <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Benutzername
                </label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-[var(--color-primary)] outline-none"
                  placeholder="z. B. max.mustermann"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Passwort
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-[var(--color-primary)] outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLogin}
                  className="flex-1 py-2 text-xs font-bold text-white bg-[var(--color-primary)] hover:brightness-110 disabled:opacity-50 rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  {isSubmittingLogin ? "Anmelden..." : "Anmelden & Buchen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
