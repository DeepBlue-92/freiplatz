import React, { useState, useMemo, useEffect, useRef } from "react";
import { User, Booking, RangeLock, RegularLock } from "../types";
import {
  Calendar,
  Lock,
  Plus,
  LogIn,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Layers,
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
  primaryColor = "#047857",
  courts = ["Platz 1", "Platz 2", "Platz 3"],
  bookings = [],
  rangeLocks = [],
  recurringLocks = [],
  currentUser = null,
  defaultView = "day",
  allowViewSwitch = true,
  showHeader = false,
  courtDisplay = "all",
  widgetWidth = "wide",
  widgetHeight = "medium",
  iconShape = "round",
  customColor,
  onLogin,
  onSelectSlot,
  onNavigateToFullApp,
}) => {
  // Check URL parameters for custom theme, view, header, courtDisplay, width, height, shape, color
  const urlParams = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        theme: "auto",
        view: null,
        allowSwitch: null,
        header: null,
        courts: null,
        width: null,
        height: null,
        shape: null,
        color: null,
      };
    }
    const sp = new URLSearchParams(window.location.search);
    return {
      theme: sp.get("theme") || "auto",
      view: (
        sp.get("view") === "3days" || sp.get("view") === "three_days"
          ? "three_days"
          : sp.get("view") === "week"
          ? "week"
          : sp.get("view") === "day"
          ? "day"
          : null
      ) as "day" | "three_days" | "week" | null,
      allowSwitch: sp.get("allowSwitch") !== null ? sp.get("allowSwitch") === "true" : null,
      header: sp.get("header") !== null ? sp.get("header") === "true" : null,
      courts: (sp.get("courts") === "single" ? "single" : sp.get("courts") === "all" ? "all" : null) as "all" | "single" | null,
      width: (sp.get("width") === "narrow" ? "narrow" : sp.get("width") === "medium" ? "medium" : sp.get("width") === "wide" ? "wide" : null) as "narrow" | "medium" | "wide" | null,
      height: (sp.get("height") === "low" ? "low" : sp.get("height") === "medium" ? "medium" : sp.get("height") === "high" ? "high" : null) as "low" | "medium" | "high" | null,
      shape: (sp.get("shape") === "box" ? "box" : sp.get("shape") === "bubble" ? "bubble" : sp.get("shape") === "round" ? "round" : null) as "box" | "round" | "bubble" | null,
      color: sp.get("color") || null,
    };
  }, []);

  const effectiveShowHeader = urlParams.header !== null ? urlParams.header : showHeader;
  const effectiveAllowSwitch = urlParams.allowSwitch !== null ? urlParams.allowSwitch : allowViewSwitch;
  const initialView: "day" | "three_days" | "week" = urlParams.view || defaultView || "day";
  const effectiveCourtDisplay = urlParams.courts || courtDisplay || "all";
  const effectiveWidth = urlParams.width || widgetWidth || "wide";
  const effectiveHeight = urlParams.height || widgetHeight || "medium";
  const effectiveShape = urlParams.shape || iconShape || "round";
  const effectiveColor = urlParams.color || customColor || primaryColor || "#047857";

  // Shape helper classes: box = eckig, round = rund, bubble = blase
  const shapeBadgeClass =
    effectiveShape === "box"
      ? "rounded-md"
      : effectiveShape === "bubble"
      ? "rounded-2xl"
      : "rounded-full";

  const shapeButtonClass =
    effectiveShape === "box"
      ? "rounded-md"
      : effectiveShape === "bubble"
      ? "rounded-2xl"
      : "rounded-full";

  const shapeIndicatorClass =
    effectiveShape === "box"
      ? "w-2.5 h-2.5 rounded-xs"
      : effectiveShape === "bubble"
      ? "w-2.5 h-2.5 rounded-md"
      : "w-2.5 h-2.5 rounded-full";

  // Height helper classes: low = kompakt, medium = standard, high = großzügig
  const slotHeightClass =
    effectiveHeight === "low"
      ? "h-7 sm:h-8 text-[10px]"
      : effectiveHeight === "high"
      ? "h-12 sm:h-14 text-sm"
      : "h-9 sm:h-10 text-xs";

  const cellPaddingClass =
    effectiveHeight === "low"
      ? "p-1 sm:p-1.5"
      : effectiveHeight === "high"
      ? "p-2.5 sm:p-3"
      : "p-1.5 sm:p-2";

  const timeCellClass =
    effectiveHeight === "low"
      ? "p-1 sm:p-1.5"
      : effectiveHeight === "high"
      ? "p-2.5 sm:p-3"
      : "p-2";

  // Width container helper classes
  const widthContainerClass =
    effectiveWidth === "narrow"
      ? "max-w-2xl mx-auto"
      : effectiveWidth === "medium"
      ? "max-w-5xl mx-auto"
      : "w-full max-w-full";

  // Current active view mode: day, three_days, or week
  const [viewMode, setViewMode] = useState<"day" | "three_days" | "week">(initialView);

  // Day selection (0 = Heute, 1 = Morgen, etc.)
  const [dayOffset, setDayOffset] = useState<number>(() => {
    const now = new Date();
    return now.getHours() >= 22 ? 1 : 0;
  });

  // 3-Day selection offset (0 = Heute..Übermorgen, 1 = Morgen..+3, etc.)
  const [threeDayOffset, setThreeDayOffset] = useState<number>(0);

  // Week selection (0 = Diese Woche, 1 = Nächste Woche, etc.)
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Active court in week view (defaults to first court)
  const [selectedWeekCourt, setSelectedWeekCourt] = useState<string>(() => courts[0] || "Platz 1");

  useEffect(() => {
    if (courts.length > 0 && !courts.includes(selectedWeekCourt)) {
      setSelectedWeekCourt(courts[0]);
    }
  }, [courts, selectedWeekCourt]);

  // Active court filter in day view (null = alle Plätze anzeigen)
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string | null>(null);

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

  // Auto-switch to tomorrow after 22:00 in day view
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() >= 22 && dayOffset === 0) {
        setDayOffset(1);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [dayOffset]);

  // Day view date computations
  const { activeDateStr, formattedDateBadge, isToday, isTomorrow, currentHourNow } =
    useMemo(() => {
      const target = new Date();
      target.setDate(target.getDate() + dayOffset);

      const y = target.getFullYear();
      const m = String(target.getMonth() + 1).padStart(2, "0");
      const d = String(target.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      const badge = target.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });

      return {
        activeDateStr: dateStr,
        formattedDateBadge: badge,
        isToday: dayOffset === 0,
        isTomorrow: dayOffset === 1,
        currentHourNow: new Date().getHours(),
      };
    }, [dayOffset]);

  // Week view date computations
  const { weekDays, weekRangeLabel, isCurrentWeek } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    const mon = new Date(now);
    mon.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
    mon.setHours(0, 0, 0, 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({
        dateStr,
        dayName: d.toLocaleDateString("de-DE", { weekday: "short" }),
        dateBadge: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        isToday: dateStr === todayStr,
      });
    }

    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const range = `${mon.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${sun.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;

    return {
      weekDays: days,
      weekRangeLabel: range,
      isCurrentWeek: weekOffset === 0,
    };
  }, [weekOffset]);

  // 3-Day view date computations (Heute, Morgen, Übermorgen + Navigation)
  const { threeDays, threeDayRangeLabel, isCurrentThreeDays } = useMemo(() => {
    const now = new Date();
    const base = new Date(now);
    base.setDate(now.getDate() + threeDayOffset);
    base.setHours(0, 0, 0, 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const days = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      let relativeLabel = "";
      if (dateStr === todayStr) {
        relativeLabel = "Heute";
      } else {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        if (dateStr === tomStr) {
          relativeLabel = "Morgen";
        } else {
          const overmorrow = new Date(now);
          overmorrow.setDate(now.getDate() + 2);
          const overStr = `${overmorrow.getFullYear()}-${pad(overmorrow.getMonth() + 1)}-${pad(overmorrow.getDate())}`;
          if (dateStr === overStr) {
            relativeLabel = "Übermorgen";
          }
        }
      }

      days.push({
        dateStr,
        dayName: d.toLocaleDateString("de-DE", { weekday: "short" }),
        dateBadge: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        relativeLabel,
        isToday: dateStr === todayStr,
      });
    }

    const last = new Date(base);
    last.setDate(base.getDate() + 2);
    const range = `${base.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${last.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;

    return {
      threeDays: days,
      threeDayRangeLabel: range,
      isCurrentThreeDays: threeDayOffset === 0,
    };
  }, [threeDayOffset]);

  // 14 hourly slots (08:00 - 22:00)
  const hourlySlots = useMemo(() => {
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    return hours.map((h) => ({
      start: `${String(h).padStart(2, "0")}:00`,
      end: `${String(h + 1).padStart(2, "0")}:00`,
      label: `${String(h).padStart(2, "0")} - ${String(h + 1).padStart(2, "0")} Uhr`,
      hour: h,
    }));
  }, []);

  // Smart Auto-scroll: Focus on current time on today's view
  useEffect(() => {
    if (viewMode === "day" && isToday && currentSlotRef.current && !hasAutoScrolledRef.current) {
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
  }, [dayOffset, isToday, viewMode]);

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

  // Auto-Resize messaging for embedding parent website (eliminates scrollbars)
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
  }, [viewMode, dayOffset, weekOffset, effectiveCourtDisplay, effectiveHeight]);

  const displayedCourts = useMemo(() => {
    if (effectiveCourtDisplay === "single") {
      const active = selectedCourtFilter || courts[0] || "Platz 1";
      return [active];
    }
    return courts;
  }, [courts, effectiveCourtDisplay, selectedCourtFilter]);

  const handleSlotClick = (court: string, time: string, dateStr: string = activeDateStr) => {
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
      // Store pending slot and open login modal
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

    setIsSubmittingLogin(true);
    setLoginError(null);

    try {
      const success = await onLogin(loginUsername.trim(), loginPassword.trim());
      if (success !== false) {
        setIsLoginModalOpen(false);
        if (pendingSlot && onSelectSlot) {
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

  return (
    <div
      className={`w-full ${widthContainerClass} flex flex-col rounded-2xl border shadow-2xs overflow-hidden select-none font-sans transition-colors ${
        isDarkTheme
          ? "bg-slate-900 border-slate-800 text-white"
          : "bg-white border-slate-200/90 text-slate-900"
      }`}
      style={{ "--color-primary": effectiveColor } as React.CSSProperties}
    >
      {/* 1. STICKY TOP CONTAINER: BRANDING, CONTROLS, LEGENDE & PLATZ-WECHSLER (PINNED AUF DEM BILDSCHIRM) */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs shadow-2xs border-b border-slate-200">
        {/* OPTIONAL BRANDING HEADER BAR (Only rendered if showHeader is explicitly enabled) */}
        {effectiveShowHeader && (
          <div
            className={`p-3.5 sm:p-4 border-b flex items-center justify-between gap-3 shrink-0 transition-colors ${
              isDarkTheme
                ? "bg-slate-950/80 border-slate-800"
                : "bg-slate-50/90 border-slate-200/80 backdrop-blur-xs"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 text-white flex items-center justify-center shadow-xs shrink-0 ${shapeButtonClass}`}
                style={{ backgroundColor: effectiveColor }}
              >
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black tracking-tight uppercase truncate max-w-[200px] sm:max-w-[320px]">
                    {clubName}
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300/60 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                    Live
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-500">
                  Platzbelegung &amp; Direktanmeldung
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TOP CONTROL BAR: DATE CONTROLS, DEZENTE AMPEL-LEGENDE & TAG/WOCHE SWITCHER */}
        <div
          className={`p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 transition-colors ${
            isDarkTheme
              ? "bg-slate-950/90 border-slate-800"
              : "bg-slate-50/90 border-slate-200/80 backdrop-blur-xs"
          }`}
        >
          {/* Navigation Controls */}
          {viewMode === "day" ? (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
              <button
                type="button"
                onClick={() => setDayOffset((prev) => Math.max(0, prev - 1))}
                disabled={dayOffset <= 0}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Vorheriger Tag"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDayOffset(0)}
                  className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                    isToday
                      ? "bg-[var(--color-primary)] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Heute
                </button>
                <button
                  type="button"
                  onClick={() => setDayOffset(1)}
                  className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                    isTomorrow
                      ? "bg-[var(--color-primary)] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  Morgen
                </button>
              </div>

              <button
                type="button"
                onClick={() => setDayOffset((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Nächster Tag"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-xs font-extrabold text-slate-700 pl-2 pr-1.5 border-l border-slate-200 whitespace-nowrap">
                {formattedDateBadge}
              </span>
            </div>
          ) : viewMode === "three_days" ? (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
              <button
                type="button"
                onClick={() => setThreeDayOffset((prev) => Math.max(0, prev - 1))}
                disabled={threeDayOffset <= 0}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Vorherige 3 Tage"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setThreeDayOffset(0)}
                className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                  isCurrentThreeDays
                    ? "bg-[var(--color-primary)] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Heute
              </button>

              <button
                type="button"
                onClick={() => setThreeDayOffset((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Nächste 3 Tage"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-xs font-extrabold text-slate-700 pl-2 pr-1.5 border-l border-slate-200 whitespace-nowrap">
                {threeDayRangeLabel}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => Math.max(0, prev - 1))}
                disabled={weekOffset <= 0}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Vorherige Woche"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                  isCurrentWeek
                    ? "bg-[var(--color-primary)] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Diese Woche
              </button>

              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                title="Nächste Woche"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-xs font-extrabold text-slate-700 pl-2 pr-1.5 border-l border-slate-200 whitespace-nowrap">
                {weekRangeLabel}
              </span>
            </div>
          )}

          {/* Legende OBEN (Exakt wie in der Buchungs-App / Dashboard.tsx line 5016) */}
          <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider select-none">
            <div className="w-[1px] h-3.5 bg-slate-300 mx-0.5 sm:mx-1 shrink-0" />
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-white border border-slate-300 rounded-xs shadow-2xs shrink-0" />
              <span>FREI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-3.5 bg-emerald-50 border border-emerald-200 border-l-[3px] rounded-xs shadow-2xs shrink-0"
                style={{ borderLeftColor: effectiveColor || "#059669" }}
              />
              <span>BELEGT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-slate-100 border border-slate-300 rounded-xs shadow-2xs shrink-0" />
              <span>GESPERRT</span>
            </div>
          </div>

          {/* Optional View Switcher (Day vs. 3-Day vs. Week) */}
          {effectiveAllowSwitch && (
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs ml-auto">
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                  viewMode === "day"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Tag
              </button>
              <button
                type="button"
                onClick={() => setViewMode("three_days")}
                className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                  viewMode === "three_days"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                3 Tage
              </button>
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={`px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${shapeButtonClass} ${
                  viewMode === "week"
                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                Woche
              </button>
            </div>
          )}
        </div>

        {/* Platz-Wechsler (falls einzelner Platzmodus aktiv ist und Verein mehrere Plätze hat) */}
        {effectiveCourtDisplay === "single" && courts.length > 1 && (
          <div className="px-3.5 py-1.5 bg-slate-100/90 border-t border-slate-200/70 flex items-center gap-1.5 overflow-x-auto select-none custom-scrollbar">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1 mr-1 shrink-0">
              <Layers className="w-3 h-3" />
              <span>Platz:</span>
            </span>
            {courts.map((court) => {
              const isSelected =
                viewMode === "day"
                  ? (selectedCourtFilter || courts[0]) === court
                  : selectedWeekCourt === court;
              return (
                <button
                  key={court}
                  type="button"
                  onClick={() => {
                    if (viewMode === "day") setSelectedCourtFilter(court);
                    else setSelectedWeekCourt(court);
                  }}
                  className={`px-3 py-1 text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${shapeButtonClass} ${
                    isSelected
                      ? "bg-[var(--color-primary)] text-white shadow-2xs"
                      : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80"
                  }`}
                >
                  {court}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. GRID CONTAINER WITH INTEGRATED DESIGN MATCHING DASHBOARD.TSX */}
      <div
        ref={scrollContainerRef}
        className="overflow-auto relative divide-y divide-slate-100 custom-scrollbar"
      >
        {viewMode === "day" ? (
          /* --- DAY VIEW --- */
          <table className="w-full border-collapse table-fixed text-left min-w-full">
            <thead>
              <tr className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
                <th className="sticky left-0 top-0 z-35 bg-slate-100/95 backdrop-blur-xs p-1.5 sm:p-2 text-center text-xs font-black uppercase text-slate-500 tracking-wider w-20 sm:w-24 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                  Von - Bis
                </th>
                {displayedCourts.map((c) => (
                  <th
                    key={c}
                    className="p-1.5 sm:p-2 text-center text-xs font-black uppercase text-[var(--color-primary)] tracking-wider border-l border-b border-slate-200 truncate"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hourlySlots.map((slot) => {
                const isPassed = isSlotPassed(activeDateStr, slot.start);
                const isCurrentHourSlot = isToday && currentHourNow === slot.hour;

                return (
                  <tr
                    key={slot.start}
                    ref={isCurrentHourSlot ? currentSlotRef : null}
                    className="border-b border-slate-200 last:border-b-0"
                  >
                    {/* Time Column (clean table cell, no boxes) */}
                    <td
                      className={`sticky left-0 z-10 p-1 text-center align-middle font-bold text-xs text-slate-700 bg-slate-50/80 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)] ${
                        isCurrentHourSlot ? "bg-emerald-50/90 text-emerald-950 font-black" : ""
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        <span className="whitespace-nowrap">
                          {parseInt(slot.start.split(":")[0], 10)} - {parseInt(slot.end.split(":")[0], 10)}
                        </span>
                      </div>
                    </td>

                    {/* Court Columns (clean cells matching Dashboard.tsx) */}
                    {displayedCourts.map((court) => {
                      const status = getSlotStatus(court, slot.hour, activeDateStr);

                      if (status.type === "locked") {
                        return (
                          <td
                            key={court}
                            className={`border-l border-b border-slate-200 p-0 text-center align-middle relative select-none ${
                              isPassed ? "bg-rose-50/50 opacity-80" : "bg-rose-50/80"
                            }`}
                          >
                            <div className={`w-full ${slotHeightClass} flex items-center justify-center gap-1 p-1 text-[11px] font-bold text-rose-700 border-l-4 border-l-rose-500 truncate`}>
                              <Lock className="w-3 h-3 text-rose-500 shrink-0" />
                              <span className="truncate">{status.label || "Gesperrt"}</span>
                            </div>
                          </td>
                        );
                      }

                      if (isPassed) {
                        return (
                          <td
                            key={court}
                            className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-50/70"
                          >
                            <div className={`w-full ${slotHeightClass} flex items-center justify-center p-1 text-[10px] font-bold text-slate-400 cursor-default select-none`}>
                              <span>{status.type === "free" ? "Vorbei" : "Belegt"}</span>
                            </div>
                          </td>
                        );
                      }

                      if (status.type === "booked") {
                        return (
                          <td
                            key={court}
                            className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-100/90"
                          >
                            <div className={`w-full ${slotHeightClass} flex items-center justify-center gap-1.5 p-1 text-[11px] font-bold text-slate-600 border-l-4 border-l-slate-400`}>
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-bold">Gebucht</span>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={court}
                          onClick={() => handleSlotClick(court, slot.start, activeDateStr)}
                          className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-white hover:bg-emerald-50/70 hover:border-l-4 hover:border-l-[var(--color-primary)] transition-all cursor-pointer group"
                          title={`Frei • Klicken um ${court} um ${slot.start} Uhr zu buchen`}
                        >
                          <div className={`w-full ${slotHeightClass} flex items-center justify-center p-1`}>
                            <div
                              className="hidden group-hover:flex items-center gap-1 text-[11px] font-black uppercase tracking-wider animate-in fade-in zoom-in-95 duration-100"
                              style={{ color: effectiveColor }}
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
        ) : (
          /* --- MULTI-DAY VIEW: 3-DAY OR WEEK VIEW (All courts stacked OR single court with tabs) --- */
          (() => {
            const daysToRender = viewMode === "three_days" ? threeDays : weekDays;
            return (
              <div className="divide-y-4 divide-slate-200">
                {(effectiveCourtDisplay === "all" ? courts : [selectedWeekCourt]).map((courtItem) => (
                  <div key={courtItem} className="w-full">
                    {effectiveCourtDisplay === "all" && courts.length > 1 && (
                      <div className="sticky left-0 z-20 px-3.5 py-2 bg-slate-100/95 backdrop-blur-xs font-black text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b border-slate-200">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: effectiveColor }} />
                        <span>{courtItem}</span>
                      </div>
                    )}
                    <table className="w-full border-collapse table-fixed text-left min-w-full">
                      <thead>
                        <tr className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-2xs">
                          <th className="sticky left-0 top-0 z-35 bg-slate-100/95 backdrop-blur-xs p-1.5 sm:p-2 text-center text-xs font-black uppercase text-slate-500 tracking-wider w-20 sm:w-24 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                            Von - Bis
                          </th>
                          {daysToRender.map((d) => (
                            <th
                              key={d.dateStr}
                              className={`p-1.5 sm:p-2 text-center text-xs font-black uppercase tracking-wider border-l border-b border-slate-200 truncate ${
                                d.isToday ? "bg-emerald-50/80 text-[var(--color-primary)]" : "text-slate-800"
                              }`}
                            >
                              <div className="text-xs font-black">{d.dayName}</div>
                              <div className="text-[10px] font-semibold text-slate-500 flex items-center justify-center gap-1">
                                {(d as any).relativeLabel ? (
                                  <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                    {(d as any).relativeLabel}
                                  </span>
                                ) : null}
                                <span>{d.dateBadge}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hourlySlots.map((slot) => {
                          return (
                            <tr key={slot.start} className="border-b border-slate-200 last:border-b-0">
                              {/* Time Column (clean table cell, no boxes) */}
                              <td className="sticky left-0 z-10 p-1 text-center align-middle font-bold text-xs text-slate-700 bg-slate-50/80 border-r border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                                <div className="flex items-center justify-center">
                                  <span className="whitespace-nowrap">
                                    {parseInt(slot.start.split(":")[0], 10)} - {parseInt(slot.end.split(":")[0], 10)}
                                  </span>
                                </div>
                              </td>

                              {daysToRender.map((d) => {
                                const isPassed = isSlotPassed(d.dateStr, slot.start);
                                const status = getSlotStatus(courtItem, slot.hour, d.dateStr);

                                if (status.type === "locked") {
                                  return (
                                    <td
                                      key={d.dateStr}
                                      className={`border-l border-b border-slate-200 p-0 text-center align-middle relative select-none ${
                                        isPassed ? "bg-rose-50/50 opacity-80" : "bg-rose-50/80"
                                      }`}
                                    >
                                      <div className={`w-full ${slotHeightClass} flex items-center justify-center gap-1 p-1 text-[11px] font-bold text-rose-700 border-l-4 border-l-rose-500 truncate`}>
                                        <Lock className="w-3 h-3 text-rose-500 shrink-0" />
                                        <span className="truncate">{status.label || "Gesperrt"}</span>
                                      </div>
                                    </td>
                                  );
                                }

                                if (isPassed) {
                                  return (
                                    <td
                                      key={d.dateStr}
                                      className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-50/70"
                                    >
                                      <div className={`w-full ${slotHeightClass} flex items-center justify-center p-1 text-[10px] font-bold text-slate-400 cursor-default select-none`}>
                                        <span>{status.type === "free" ? "Vorbei" : "Belegt"}</span>
                                      </div>
                                    </td>
                                  );
                                }

                                if (status.type === "booked") {
                                  return (
                                    <td
                                      key={d.dateStr}
                                      className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-slate-100/90"
                                    >
                                      <div className={`w-full ${slotHeightClass} flex items-center justify-center gap-1.5 p-1 text-[11px] font-bold text-slate-600 border-l-4 border-l-slate-400`}>
                                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="font-bold">Gebucht</span>
                                      </div>
                                    </td>
                                  );
                                }

                                return (
                                  <td
                                    key={d.dateStr}
                                    onClick={() => handleSlotClick(courtItem, slot.start, d.dateStr)}
                                    className="border-l border-b border-slate-200 p-0 text-center align-middle relative select-none bg-white hover:bg-emerald-50/70 hover:border-l-4 hover:border-l-[var(--color-primary)] transition-all cursor-pointer group"
                                    title={`Frei • Klicken um ${courtItem} am ${d.dayName}, ${d.dateBadge} um ${slot.start} Uhr zu buchen`}
                                  >
                                    <div className={`w-full ${slotHeightClass} flex items-center justify-center p-1`}>
                                      <div
                                        className="hidden group-hover:flex items-center gap-1 text-[11px] font-black uppercase tracking-wider animate-in fade-in zoom-in-95 duration-100"
                                        style={{ color: effectiveColor }}
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
                ))}
              </div>
            );
          })()
        )}
      </div>

      {/* MINIMAL FOOTER: DIRECT APP LINK (Legend moved to top bar) */}
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

      {/* 5. DIRECT LOGIN MODAL (Embedded Mode) */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-150 text-slate-900">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[var(--color-primary)] flex items-center justify-center mx-auto mb-2">
                <LogIn className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase tracking-wider text-slate-900">
                Mitgliederanmeldung
              </h3>
              {pendingSlot && (
                <p className="text-xs font-bold text-emerald-700 bg-emerald-50 py-1 px-2.5 rounded-full inline-block">
                  Reservierung für {pendingSlot.court}, {pendingSlot.time} Uhr
                </p>
              )}
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Benutzername
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="z. B. MaxMustermann"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Passwort / PIN
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs font-bold text-slate-900"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLogin}
                  className="flex-1 h-10 rounded-xl bg-[var(--color-primary)] text-white text-xs font-black uppercase tracking-wider hover:brightness-95 disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isSubmittingLogin ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    <span>Anmelden</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
