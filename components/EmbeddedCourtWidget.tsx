import React, { useState, useMemo, useEffect, useRef } from "react";
import { User, Booking } from "../types";
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
  currentUser?: User | null;
  defaultView?: "day" | "week";
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
      view: (sp.get("view") === "week" ? "week" : sp.get("view") === "day" ? "day" : null) as "day" | "week" | null,
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
  const initialView = urlParams.view || defaultView || "day";
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

  // Current active view mode: day or week
  const [viewMode, setViewMode] = useState<"day" | "week">(initialView);

  // Day selection (0 = Heute, 1 = Morgen, etc.)
  const [dayOffset, setDayOffset] = useState<number>(() => {
    const now = new Date();
    return now.getHours() >= 22 ? 1 : 0;
  });

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
    const match = bookings.find((b) => {
      if (b.court !== court || b.date !== dateStr) return false;
      const bHour = parseInt(b.time.split(":")[0], 10);
      const duration = (b as any).durationHours || 1;
      return slotHour >= bHour && slotHour < bHour + duration;
    });

    if (match) {
      if (match.is_locked || match.locked || match.blockReason) {
        return {
          type: "locked" as const,
          label: match.blockReason || "Gesperrt",
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

    if (currentUser) {
      if (onSelectSlot) {
        onSelectSlot(court, time, dateStr);
      } else if (onNavigateToFullApp) {
        onNavigateToFullApp(court, time, dateStr);
      }
    } else {
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

      {/* TOP CONTROL BAR: DATE CONTROLS, AMPEL-LEGENDE & OPTIONAL VIEW SWITCHER */}
      <div
        className={`p-2 sm:p-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 transition-colors ${
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

        {/* Dezente Ampel-Legende OBEN (wie im normalen Buchungsplan) */}
        <div className="flex items-center gap-3 text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider select-none bg-white p-1.5 px-3 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <span
              className={`${shapeIndicatorClass} shadow-2xs shrink-0`}
              style={{ backgroundColor: effectiveColor }}
            />
            <span className="font-extrabold text-slate-800">Frei</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${shapeIndicatorClass} bg-slate-400 shadow-2xs shrink-0`} />
            <span>Gebucht</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${shapeIndicatorClass} bg-rose-500 shadow-2xs shrink-0`} />
            <span>Gesperrt</span>
          </div>
        </div>

        {/* Optional View Switcher (Day vs. Week) */}
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

      {/* COURT TABS: When 'single' court mode is selected and club has multiple courts */}
      {effectiveCourtDisplay === "single" && courts.length > 1 && (
        <div className="px-3.5 py-1.5 bg-slate-100/70 border-b border-slate-200/70 flex items-center gap-1.5 overflow-x-auto select-none custom-scrollbar">
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

      {/* GRID CONTAINER WITH STICKY TIME COLUMN & HEADER */}
      <div
        ref={scrollContainerRef}
        className="overflow-auto relative divide-y divide-slate-100 custom-scrollbar"
      >
        {viewMode === "day" ? (
          /* --- DAY VIEW --- */
          <table className="w-full border-collapse text-left min-w-full">
            <thead>
              <tr className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-xs shadow-2xs">
                <th className="sticky left-0 top-0 z-30 bg-slate-200/95 backdrop-blur-xs p-2 sm:p-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-600 w-20 sm:w-24 border-r border-b border-slate-300 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                  Uhrzeit
                </th>
                {displayedCourts.map((c) => (
                  <th
                    key={c}
                    className="p-2 sm:p-2.5 text-center text-xs font-black text-slate-800 uppercase tracking-wider min-w-[120px] sm:min-w-[150px] border-b border-slate-200"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hourlySlots.map((slot) => {
                const isPassed = isSlotPassed(activeDateStr, slot.start);
                const isCurrentHourSlot = isToday && currentHourNow === slot.hour;

                return (
                  <tr
                    key={slot.start}
                    ref={isCurrentHourSlot ? currentSlotRef : null}
                    className={`transition-colors ${
                      isCurrentHourSlot
                        ? "bg-emerald-50/40"
                        : isPassed
                        ? "bg-slate-50/50 opacity-75"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* Sticky Time Column */}
                    <td
                      className={`sticky left-0 z-10 ${timeCellClass} text-center border-r border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.03)] ${
                        isCurrentHourSlot
                          ? "bg-emerald-50/95 text-emerald-950"
                          : isPassed
                          ? "bg-slate-50 text-slate-400"
                          : "bg-white text-slate-700"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1">
                          <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                            {slot.start}
                          </span>
                          {isCurrentHourSlot && (
                            <span
                              className="w-1.5 h-1.5 rounded-full animate-ping"
                              style={{ backgroundColor: effectiveColor }}
                            ></span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold">
                          bis {slot.end}
                        </span>
                      </div>
                    </td>

                    {/* Court Columns */}
                    {displayedCourts.map((court) => {
                      const status = getSlotStatus(court, slot.hour, activeDateStr);

                      if (isPassed) {
                        return (
                          <td key={court} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                            <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-slate-100/90 text-slate-400 font-bold flex items-center justify-center`}>
                              {status.type === "free" ? "Vorbei" : "Belegt"}
                            </div>
                          </td>
                        );
                      }

                      if (status.type === "locked") {
                        return (
                          <td key={court} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                            <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center justify-center gap-1 px-2 truncate shadow-2xs`}>
                              <Lock className="w-3 h-3 shrink-0" />
                              <span className="truncate">{status.label}</span>
                            </div>
                          </td>
                        );
                      }

                      if (status.type === "booked") {
                        return (
                          <td key={court} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                            <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-slate-100 border border-slate-200 text-slate-600 font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs`}>
                              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                              <span>Gebucht</span>
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={court} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                          <button
                            type="button"
                            onClick={() => handleSlotClick(court, slot.start, activeDateStr)}
                            className={`w-full ${slotHeightClass} ${shapeButtonClass} transition-all duration-150 flex items-center justify-center gap-1.5 font-black uppercase tracking-wider cursor-pointer group shadow-2xs hover:shadow-xs active:scale-95 relative overflow-hidden`}
                            style={{
                              backgroundColor: `${effectiveColor}15`,
                              borderColor: `${effectiveColor}40`,
                              color: effectiveColor,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = effectiveColor;
                              e.currentTarget.style.color = "#ffffff";
                              e.currentTarget.style.borderColor = "transparent";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = `${effectiveColor}15`;
                              e.currentTarget.style.color = effectiveColor;
                              e.currentTarget.style.borderColor = `${effectiveColor}40`;
                            }}
                            title={`Jetzt ${court} um ${slot.start} Uhr buchen`}
                          >
                            <span className="group-hover:hidden flex items-center gap-1.5 text-[11px]">
                              <span className={`${shapeIndicatorClass} shrink-0`} style={{ backgroundColor: effectiveColor }}></span>
                              <span>Frei</span>
                            </span>
                            <span className="hidden group-hover:flex items-center gap-1 text-[11px] animate-in fade-in zoom-in-95 duration-100 text-white">
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Buchen</span>
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* --- WEEK VIEW (All courts stacked OR single court with tabs) --- */
          <div className="divide-y-4 divide-slate-200">
            {(effectiveCourtDisplay === "all" ? courts : [selectedWeekCourt]).map((courtItem, cIdx) => (
              <div key={courtItem} className="w-full">
                {effectiveCourtDisplay === "all" && courts.length > 1 && (
                  <div className="sticky left-0 z-20 px-3.5 py-2 bg-slate-100/95 backdrop-blur-xs font-black text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2 border-b border-slate-200">
                    <span className={`${shapeIndicatorClass} shrink-0`} style={{ backgroundColor: effectiveColor }} />
                    <span>{courtItem}</span>
                  </div>
                )}
                <table className="w-full border-collapse text-left min-w-full">
                  <thead>
                    <tr className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-xs shadow-2xs">
                      <th className="sticky left-0 top-0 z-30 bg-slate-200/95 backdrop-blur-xs p-2 sm:p-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-600 w-20 sm:w-24 border-r border-b border-slate-300 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                        Uhrzeit
                      </th>
                      {weekDays.map((d) => (
                        <th
                          key={d.dateStr}
                          className={`p-2 sm:p-2.5 text-center text-xs font-black uppercase tracking-wider min-w-[95px] sm:min-w-[120px] border-b border-slate-200 ${
                            d.isToday ? "bg-emerald-50/80 text-[var(--color-primary)]" : "text-slate-800"
                          }`}
                        >
                          <div className="text-xs sm:text-sm font-black">{d.dayName}</div>
                          <div className="text-[10px] font-semibold text-slate-500 mt-0.5">{d.dateBadge}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {hourlySlots.map((slot) => {
                      return (
                        <tr key={slot.start} className="hover:bg-slate-50/70 transition-colors">
                          <td className={`sticky left-0 z-10 ${timeCellClass} text-center border-r border-slate-200 bg-white text-slate-700 shadow-[2px_0_4px_rgba(0,0,0,0.03)]`}>
                            <div className="flex flex-col items-center justify-center">
                              <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                                {slot.start}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold">
                                bis {slot.end}
                              </span>
                            </div>
                          </td>

                          {weekDays.map((d) => {
                            const isPassed = isSlotPassed(d.dateStr, slot.start);
                            const status = getSlotStatus(courtItem, slot.hour, d.dateStr);

                            if (isPassed) {
                              return (
                                <td key={d.dateStr} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                                  <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-slate-100/90 text-slate-400 font-bold flex items-center justify-center`}>
                                    {status.type === "free" ? "Vorbei" : "Belegt"}
                                  </div>
                                </td>
                              );
                            }

                            if (status.type === "locked") {
                              return (
                                <td key={d.dateStr} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                                  <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center justify-center gap-1 px-1.5 truncate shadow-2xs`}>
                                    <Lock className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{status.label}</span>
                                  </div>
                                </td>
                              );
                            }

                            if (status.type === "booked") {
                              return (
                                <td key={d.dateStr} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                                  <div className={`w-full ${slotHeightClass} ${shapeBadgeClass} bg-slate-100 border border-slate-200 text-slate-600 font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs`}>
                                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="hidden sm:inline">Gebucht</span>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td key={d.dateStr} className={`${cellPaddingClass} text-center border-r border-slate-100 last:border-r-0`}>
                                <button
                                  type="button"
                                  onClick={() => handleSlotClick(courtItem, slot.start, d.dateStr)}
                                  className={`w-full ${slotHeightClass} ${shapeButtonClass} transition-all duration-150 flex items-center justify-center gap-1 font-black uppercase tracking-wider cursor-pointer group shadow-2xs hover:shadow-xs active:scale-95 relative overflow-hidden`}
                                  style={{
                                    backgroundColor: `${effectiveColor}15`,
                                    borderColor: `${effectiveColor}40`,
                                    color: effectiveColor,
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = effectiveColor;
                                    e.currentTarget.style.color = "#ffffff";
                                    e.currentTarget.style.borderColor = "transparent";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = `${effectiveColor}15`;
                                    e.currentTarget.style.color = effectiveColor;
                                    e.currentTarget.style.borderColor = `${effectiveColor}40`;
                                  }}
                                  title={`Jetzt ${courtItem} am ${d.dayName}, ${d.dateBadge} um ${slot.start} Uhr buchen`}
                                >
                                  <span className="group-hover:hidden flex items-center gap-1 text-[11px]">
                                    <span className={`${shapeIndicatorClass} shrink-0`} style={{ backgroundColor: effectiveColor }}></span>
                                    <span>Frei</span>
                                  </span>
                                  <span className="hidden group-hover:flex items-center gap-1 text-[11px] animate-in fade-in zoom-in-95 duration-100 text-white">
                                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                    <span>Buchen</span>
                                  </span>
                                </button>
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
