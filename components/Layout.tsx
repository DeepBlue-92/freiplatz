import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  CircleUser,
  UserCog,
  LogOut,
  ArrowLeftRight,
  Check,
  LogIn,
  User,
  Lock,
  Loader2,
} from "lucide-react";
import { RichTextRenderer } from "./RichText";
import { UserClub } from "../types";
import { getUserClubs } from "../lib/userUtils";
import { UserAvatar } from "./UserAvatar";
import { useTranslation } from "react-i18next";

export const GermanFlag: React.FC<{ className?: string }> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 30 30" preserveAspectRatio="none" className={`${className} block`}>
    <rect width="30" height="10" y="0" fill="#111111" />
    <rect width="30" height="10" y="10" fill="#DD0000" />
    <rect width="30" height="10" y="20" fill="#FFCE00" />
  </svg>
);

export const UKFlag: React.FC<{ className?: string }> = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 60 60" preserveAspectRatio="none" className={`${className} block`}>
    <rect width="60" height="60" fill="#012169" />
    <path d="M0,0 L60,60 M60,0 L0,60" stroke="#fff" strokeWidth="12" />
    <path d="M0,0 L60,60 M60,0 L0,60" stroke="#C8102E" strokeWidth="4" />
    <path d="M30,0 v60 M0,30 h60" stroke="#fff" strokeWidth="20" />
    <path d="M30,0 v60 M0,30 h60" stroke="#C8102E" strokeWidth="12" />
  </svg>
);

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
  onShowImpressum?: () => void;
  onShowProfile?: () => void;
  news?: string;
  clubName?: string;
  logoUrl?: string;
  bannerUrl?: string;
  bannerPosition?: string;
  bannerType?: "image" | "color" | "gradient";
  bannerColor?: string;
  bannerGradientStart?: string;
  bannerGradientEnd?: string;
  primaryColor?: string;
  websiteUrl?: string;
  hideWebsiteLink?: boolean;
  impressum?: string;
  headerFontFamily?: "sans" | "serif" | "sporty";
  desktopNav?: React.ReactNode;
  isPublicWochenplanRoute?: boolean;
  onLogoClick?: () => void;
  userClubs?: UserClub[];
  currentVereinsId?: string;
  onSwitchClub?: (vereinsId: string) => void;
  onOpenLogin?: () => void;
  supportedLanguages?: ("de" | "en")[];
  currentLanguage?: "de" | "en";
  onLanguageChange?: (lang: "de" | "en") => void;
  onPerformLogin?: (username: string, password: string) => Promise<any>;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  user,
  onLogout,
  onOpenLogin,
  onShowImpressum,
  onShowProfile,
  news,
  clubName = "Tennisclub",
  logoUrl = "https://lirp.cdn-website.com/236a6a55/dms3rep/multi/opt/Wappen-1920w.jpg",
  bannerUrl = "https://lirp.cdn-website.com/236a6a55/dms3rep/multi/opt/banner_platzreservierung_1-1920w.png",
  bannerPosition = "50% 50%",
  bannerType = "image",
  bannerColor = "#1b4332",
  bannerGradientStart = "#1b4332",
  bannerGradientEnd = "#2d6a4f",
  primaryColor = "var(--color-primary)",
  websiteUrl = "https://www.tennis-club.local",
  hideWebsiteLink = false,
  impressum,
  headerFontFamily = "sans",
  desktopNav,
  isPublicWochenplanRoute,
  onLogoClick,
  userClubs,
  currentVereinsId,
  onSwitchClub,
  supportedLanguages,
  currentLanguage,
  onLanguageChange,
  onPerformLogin,
}) => {
  const { t } = useTranslation();
  const clubUrl = websiteUrl;
  const [isTopLeftDropdownOpen, setIsTopLeftDropdownOpen] = useState(false);
  const topLeftDropdownRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<any>(null);

  // Desktop Inline Login State
  const [inlineUsername, setInlineUsername] = useState("");
  const [inlinePassword, setInlinePassword] = useState("");
  const [isInlineLoggingIn, setIsInlineLoggingIn] = useState(false);
  const [inlineLoginError, setInlineLoginError] = useState<string | null>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus username input on desktop when non-authenticated user visits
    if (!user && usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, [user]);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineUsername.trim() || !inlinePassword.trim()) return;
    if (!onPerformLogin) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    setIsInlineLoggingIn(true);
    setInlineLoginError(null);
    try {
      await onPerformLogin(inlineUsername.trim(), inlinePassword);
    } catch (err: any) {
      setInlineLoginError(err?.message || "Anmeldung fehlgeschlagen.");
      setTimeout(() => {
        setInlineLoginError(null);
      }, 4000);
    } finally {
      setIsInlineLoggingIn(false);
    }
  };

  const handleDropdownMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (showClubSwitcher) {
      setIsTopLeftDropdownOpen(true);
    }
  };

  const handleDropdownMouseLeave = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setIsTopLeftDropdownOpen(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const availableClubs = useMemo(() => {
    const rawList = userClubs && userClubs.length > 0
      ? userClubs
      : getUserClubs(user);
    if (!Array.isArray(rawList)) return [];

    const uniqueSet = new Set<string>();
    const filteredClubs: any[] = [];

    rawList.forEach((c: any) => {
      if (!c) return;
      const rawId = typeof c === "string" ? c : (c.vereinsId || c.id);
      if (!rawId) return;

      const normId = String(rawId).trim().toLowerCase().replace(/\s/g, "");
      if (!normId || ["super-admin", "system"].includes(normId)) return;

      if (!uniqueSet.has(normId)) {
        uniqueSet.add(normId);
        const nameVal = typeof c === "object" ? (c.clubName || c.vereinsName || c.name) : undefined;
        filteredClubs.push({
          ...(typeof c === "object" ? c : {}),
          id: rawId,
          vereinsId: rawId,
          clubName: nameVal || rawId,
          type: "club",
          is_tenant: true,
        });
      }
    });

    return filteredClubs.sort((a: any, b: any) => {
      const nameA = String(a.clubName || a.name || a.id || "").toLowerCase();
      const nameB = String(b.clubName || b.name || b.id || "").toLowerCase();
      return nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
    });
  }, [userClubs, user]);

  const showClubSwitcher = availableClubs.length > 1 && !!onSwitchClub;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        topLeftDropdownRef.current &&
        !topLeftDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTopLeftDropdownOpen(false);
      }
    }
    if (isTopLeftDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isTopLeftDropdownOpen]);

  const getCleanClubName = (clubObj: any, fallbackName?: string) => {
    if (!clubObj) return fallbackName || "Verein";

    const candidates = [
      clubObj.clubName,
      clubObj.vereinsName,
      clubObj.name,
      clubObj.shortName,
      clubObj.abbreviation,
      clubObj.title,
      clubObj.displayName,
    ];

    for (const cand of candidates) {
      if (typeof cand === "string" && cand.trim()) {
        const trimmed = cand.trim();
        if (!["api", "default", "system", "super-admin"].includes(trimmed.toLowerCase())) {
          return trimmed;
        }
      }
    }

    if (fallbackName && typeof fallbackName === "string") {
      const trimmedFallback = fallbackName.trim();
      if (!["api", "default", "system", "super-admin"].includes(trimmedFallback.toLowerCase())) {
        return trimmedFallback;
      }
    }

    const vId = clubObj.vereinsId || clubObj.id;
    if (typeof vId === "string" && vId.trim()) {
      const trimmedVId = vId.trim();
      if (!["api", "default", "system", "super-admin"].includes(trimmedVId.toLowerCase())) {
        return trimmedVId;
      }
    }

    return "Verein";
  };

  // Find active club name and font
  const activeClubObj = availableClubs.find((c: any) => {
    const cId = String(c.vereinsId || c.id || "").toLowerCase().replace(/\s/g, "");
    const curId = String(currentVereinsId || "").toLowerCase().replace(/\s/g, "");
    return cId === curId;
  });

  const effectiveHeaderFontFamily: "sans" | "serif" | "sporty" =
    headerFontFamily ||
    activeClubObj?.headerFontFamily ||
    (String(currentVereinsId || "").toLowerCase().includes("neuhausen") ? "sans" : "serif");
  const renderLanguagePill = () => {
    if (!onLanguageChange) return null;
    return (
      <div className="flex items-center bg-white/10 hover:bg-white/15 border border-white/20 rounded-full p-0.5 shadow-xs backdrop-blur-sm transition-colors text-white select-none shrink-0">
        <button
          type="button"
          onClick={() => onLanguageChange("de")}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
            (currentLanguage || "de") === "de"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-white/80 hover:text-white"
          }`}
          title="Deutsch"
        >
          <span className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 inline-block shadow-3xs">
            <GermanFlag />
          </span>
          <span>DE</span>
        </button>
        <button
          type="button"
          onClick={() => onLanguageChange("en")}
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-all cursor-pointer flex items-center gap-1.5 ${
            (currentLanguage || "de") === "en"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-white/80 hover:text-white"
          }`}
          title="English"
        >
          <span className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 inline-block shadow-3xs">
            <UKFlag />
          </span>
          <span>EN</span>
        </button>
      </div>
    );
  };

  if (isPublicWochenplanRoute) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-100 w-full font-sans text-slate-900">
        {/* Clean Static Header */}
        <header
          className="w-full h-14 relative shadow-md shrink-0 z-[60] text-white flex items-center"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={`${clubName} Logo`}
                  className="w-8 h-8 object-contain drop-shadow-lg shrink-0 animate-in fade-in zoom-in duration-200"
                />
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-[15.5pt] leading-none" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif" }}>
                  {clubName}
                </span>
                <span className="text-sm font-semibold text-white/90">
                  – {t("nav.reservation")}
                </span>
              </div>
            </div>

            {renderLanguagePill()}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow flex flex-col w-full px-4 pt-4 pb-6 md:px-6 md:pt-6 md:pb-6 lg:px-4 lg:pt-4 lg:pb-4 overflow-x-hidden">
          <div className="max-w-[1600px] w-full mx-auto flex-grow flex flex-col">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 w-full font-sans text-slate-900">
      {/* Super Compact Club Banner Section */}
      <div
        className="hidden lg:block w-full h-12 md:h-14 relative shadow-md border-b-[3px] border-[var(--color-accent)] shrink-0 z-[60]"
        style={{ backgroundColor: primaryColor }}
      >
        {/* Background media and overlays contained inside a clipped viewport */}
        <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentVereinsId || bannerType || bannerUrl || bannerColor || bannerGradientStart || bannerGradientEnd || primaryColor}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {bannerType === "color" ? (
                <div
                  className="w-full h-full"
                  style={{ backgroundColor: bannerColor || primaryColor }}
                />
              ) : bannerType === "gradient" ? (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(to right, ${bannerGradientStart || primaryColor}, ${bannerGradientEnd || "#2d6a4f"})`,
                  }}
                />
              ) : bannerUrl ? (
                <>
                  <img
                    src={bannerUrl}
                    alt={`${clubName} Anlage`}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: bannerPosition }}
                  />
                  {/* Gradient overlay for text readability */}
                  <div
                    className="absolute inset-0 bg-gradient-to-r"
                    style={{
                      backgroundImage: `linear-gradient(to right, ${primaryColor}F2, ${primaryColor}E6, ${primaryColor}80, transparent)`,
                    }}
                  ></div>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="absolute inset-0 flex items-center z-20 pointer-events-none">
          <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 flex items-center justify-between gap-4 transition-all duration-300 ease-in-out pointer-events-auto">
            <div className="flex items-center gap-4 min-w-0 shrink transition-all duration-300 ease-in-out">
              <motion.div
                ref={topLeftDropdownRef}
                layout
                transition={{ layout: { duration: 0.3, ease: "easeInOut" } }}
                className="relative flex items-center shrink-0 transition-all duration-300 ease-in-out"
                onMouseEnter={handleDropdownMouseEnter}
                onMouseLeave={handleDropdownMouseLeave}
              >
                <div 
                  onClick={() => {
                    if (showClubSwitcher && onSwitchClub) {
                      setIsTopLeftDropdownOpen((prev) => !prev);
                    } else if (onLogoClick) {
                      onLogoClick();
                    }
                  }}
                  className="flex items-center gap-2 sm:gap-3 shrink-0 cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out select-none"
                  title={showClubSwitcher ? "Verein wechseln" : clubName}
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${clubName} Logo`}
                      className="w-7 h-7 md:w-8 md:h-8 object-contain drop-shadow-lg shrink-0 transition-all duration-300 ease-in-out"
                    />
                  ) : null}
                  <div className="text-white drop-shadow-2xl truncate min-w-0 flex items-center gap-1.5 transition-all duration-300 ease-in-out">
                    <h2
                      className={`text-sm sm:text-base md:text-[14pt] leading-none truncate max-w-[200px] sm:max-w-[240px] md:max-w-[280px] transition-all duration-300 ease-in-out ${
                        effectiveHeaderFontFamily === "sporty"
                          ? "font-black tracking-wider uppercase"
                          : effectiveHeaderFontFamily === "serif"
                          ? "font-bold tracking-tight"
                          : "font-normal tracking-tight"
                      }`}
                      style={{
                        fontFamily:
                          effectiveHeaderFontFamily === "serif"
                            ? "Georgia, Cambria, 'Times New Roman', Times, serif"
                            : "'Inter', sans-serif",
                      }}
                      title={clubName}
                    >
                      {clubName}
                    </h2>
                    {showClubSwitcher && (
                      <ChevronDown className={`w-3.5 h-3.5 text-white/80 transition-transform duration-200 shrink-0 ${isTopLeftDropdownOpen ? "rotate-180" : ""}`} strokeWidth={1.8} />
                    )}
                  </div>
                </div>

                {/* Top-Left Club Switcher Dropdown */}
                <AnimatePresence>
                  {showClubSwitcher && isTopLeftDropdownOpen && onSwitchClub && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute left-0 top-full pt-1.5 w-60 z-[100] select-none text-slate-800"
                    >
                      <div className="bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200/90 py-1.5 overflow-hidden">
                        <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 flex items-center justify-between">
                          <span>Verein wechseln</span>
                          <ArrowLeftRight className="w-3 h-3 text-[var(--color-primary)]" strokeWidth={1.8} />
                        </div>
                        <div className="py-1 max-h-60 overflow-y-auto hide-scrollbar">
                          {availableClubs.map((club: any) => {
                            const clubId = club.id || club.vereinsId;
                            const clubNameDisplay = getCleanClubName(club, clubName);
                            const targetVereinsId = club.vereinsId || club.id;
                            const isActive = targetVereinsId === currentVereinsId || String(targetVereinsId).toLowerCase().replace(/\s/g, "") === String(currentVereinsId).toLowerCase().replace(/\s/g, "");
                            return (
                              <button
                                key={clubId}
                                onClick={() => {
                                  onSwitchClub(targetVereinsId);
                                  setIsTopLeftDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                  isActive
                                    ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold"
                                    : "text-slate-700 hover:bg-slate-50 font-medium"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-[var(--color-primary)]" : "bg-slate-300"}`} />
                                  <span className="truncate">{clubNameDisplay}</span>
                                </div>
                                {isActive && (
                                  <Check className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" strokeWidth={2} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {desktopNav && (
                <motion.div 
                  layout 
                  transition={{ layout: { duration: 0.3, ease: "easeInOut" } }} 
                  className="flex items-center min-w-0 transition-all duration-300 ease-in-out"
                >
                  {desktopNav}
                </motion.div>
              )}
            </div>

            {/* Compact Greeting & Control Buttons inside the Banner */}
            <motion.div 
              layout
              transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
              className="flex items-center justify-end drop-shadow-lg text-white select-none shrink-0 gap-3 ml-auto transition-all duration-300 ease-in-out"
            >
              {user ? (
                (() => {
                  const headerDisplayName = (user.firstName && user.lastName)
                    ? `${user.firstName} ${user.lastName}`
                    : (user.firstName || user.lastName)
                      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                      : (user.displayName || user.username || user.klarname || user.name);

                  return (
                    <>
                      <motion.div 
                        layout
                        transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
                        className="hidden lg:flex bg-white/10 py-0.5 pl-1 pr-1.5 rounded-full shadow-sm gap-1 w-auto backdrop-blur-sm border border-white/10 relative items-center h-8 transition-all duration-300 ease-in-out"
                      >
                        {/* Interactive Profile Button (Avatar + Name) */}
                        {onShowProfile ? (
                          <button
                            type="button"
                            onClick={onShowProfile}
                            className="flex items-center gap-2 pl-1 pr-2.5 h-[26px] text-[10px] font-medium tracking-wide rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer outline-none select-none group"
                            title={t("profile.title")}
                          >
                            <UserAvatar user={user} size="xs" showBorder borderColor="border-white/40" />
                            <span className="truncate max-w-[120px] group-hover:text-white">
                              {headerDisplayName}
                            </span>
                          </button>
                        ) : (
                          <div 
                            className="flex items-center gap-2 pl-1 pr-2.5 h-[26px] text-[10px] font-medium tracking-wide rounded-full text-white/90"
                            title={headerDisplayName}
                          >
                            <UserAvatar user={user} size="xs" showBorder borderColor="border-white/40" />
                            <span className="truncate max-w-[120px]">
                              {headerDisplayName}
                            </span>
                          </div>
                        )}

                        {/* Language Switcher (Single Active Language, 1-Click Toggle directly next to name) */}
                        {onLanguageChange && (
                          <>
                            <div className="w-[1px] h-3.5 bg-white/20 mx-0.5 shrink-0" />
                            <motion.button
                              layout
                              transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
                              type="button"
                              onClick={() => onLanguageChange((currentLanguage || "de") === "de" ? "en" : "de")}
                              className="flex items-center gap-1.5 px-2 h-[26px] text-[10px] font-bold tracking-wide rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer outline-none select-none shrink-0"
                              title={(currentLanguage || "de") === "de" ? "Zu English wechseln" : "Zu Deutsch wechseln"}
                            >
                              <span className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 inline-block shadow-3xs">
                                {(currentLanguage || "de") === "de" ? <GermanFlag /> : <UKFlag />}
                              </span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={currentLanguage || "de"}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  {(currentLanguage || "de").toUpperCase()}
                                </motion.span>
                              </AnimatePresence>
                            </motion.button>
                          </>
                        )}
                      </motion.div>

                      {/* Mobile Fallback for Account/Profile */}
                      <div className="flex lg:hidden items-center gap-1">
                        <div className="text-[9px] font-medium tracking-wide flex items-center gap-1.5 text-white/95 bg-white/10 px-2.5 py-1 rounded-md border border-white/10 backdrop-blur-sm w-auto">
                          <UserAvatar user={user} size="xs" />
                          <span className="truncate max-w-[100px]">
                            {headerDisplayName}
                          </span>
                        </div>
                        {onLanguageChange && (
                          <button
                            type="button"
                            onClick={() => onLanguageChange((currentLanguage || "de") === "de" ? "en" : "de")}
                            className="bg-white/10 hover:bg-white/20 transition-all px-2 rounded-lg text-white border border-white/15 active:scale-95 shadow-sm flex items-center justify-center gap-1.5 backdrop-blur-sm text-[10px] font-bold h-7 cursor-pointer"
                            title={(currentLanguage || "de") === "de" ? "Zu English wechseln" : "Zu Deutsch wechseln"}
                          >
                            <span className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 inline-block">
                              {(currentLanguage || "de") === "de" ? <GermanFlag /> : <UKFlag />}
                            </span>
                            <span>{(currentLanguage || "de").toUpperCase()}</span>
                          </button>
                        )}
                        {onShowProfile && (
                          <button
                            onClick={onShowProfile}
                            className="bg-white/10 hover:bg-white/20 transition-all p-1 rounded-lg text-white border border-white/15 active:scale-95 shadow-sm flex items-center justify-center backdrop-blur-sm text-xs font-medium h-7 w-7"
                            title={t("profile.title")}
                          >
                            <UserCog className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                        )}
                      </div>

                      {/* Logout Button */}
                      <motion.button
                        layout
                        transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
                        onClick={onLogout}
                        className="bg-[var(--color-accent)] hover:bg-[color-mix(in srgb, var(--color-accent) 80%, black)] transition-all px-4 h-7 lg:h-8 rounded-lg lg:rounded-full text-white border border-white/20 active:scale-95 shadow-sm flex items-center justify-center gap-1.5 text-[10px] font-medium tracking-wide shrink-0 cursor-pointer"
                        title={t("nav.logout")}
                      >
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={t("nav.logout")}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="hidden xl:inline"
                          >
                            {t("nav.logout")}
                          </motion.span>
                        </AnimatePresence>
                        <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                      </motion.button>
                    </>
                  );
                })()
              ) : (
                <div className="flex items-center gap-2">
                  {/* Language Switcher for Guest / Unauthenticated */}
                  {onLanguageChange && (
                    <button
                      type="button"
                      onClick={() => onLanguageChange((currentLanguage || "de") === "de" ? "en" : "de")}
                      className="bg-white/10 hover:bg-white/20 transition-all px-2.5 rounded-full text-white border border-white/15 active:scale-95 shadow-sm flex items-center justify-center gap-1.5 backdrop-blur-sm text-[10px] font-bold h-8 cursor-pointer shrink-0"
                      title={(currentLanguage || "de") === "de" ? "Zu English wechseln" : "Zu Deutsch wechseln"}
                    >
                      <span className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 inline-block shadow-3xs">
                        {(currentLanguage || "de") === "de" ? <GermanFlag /> : <UKFlag />}
                      </span>
                      <span>{(currentLanguage || "de").toUpperCase()}</span>
                    </button>
                  )}

                  {/* Desktop: Clean Floating Inline Login Form */}
                  {onPerformLogin ? (
                    <form
                      onSubmit={handleInlineLogin}
                      className="hidden lg:flex items-center gap-2 transition-all"
                    >
                      <div className="relative flex items-center">
                        <User className="w-3.5 h-3.5 text-white/50 absolute left-2.5 pointer-events-none" />
                        <input
                          ref={usernameInputRef}
                          type="text"
                          value={inlineUsername}
                          onChange={(e) => {
                            setInlineUsername(e.target.value);
                            if (inlineLoginError) setInlineLoginError(null);
                          }}
                          placeholder={t("auth.username", "Benutzername")}
                          autoFocus
                          disabled={isInlineLoggingIn}
                          className={`w-32 xl:w-40 h-8 pl-8 pr-3 rounded-full text-xs text-white placeholder:text-white/50 bg-white/15 hover:bg-white/20 focus:bg-white/25 border transition-all outline-none font-medium backdrop-blur-sm ${
                            inlineLoginError
                              ? "border-rose-400 bg-rose-500/20 text-rose-100"
                              : "border-white/20 focus:border-white/60 focus:ring-2 focus:ring-white/20"
                          }`}
                        />
                      </div>

                      <div className="relative flex items-center">
                        <Lock className="w-3.5 h-3.5 text-white/50 absolute left-2.5 pointer-events-none" />
                        <input
                          type="password"
                          value={inlinePassword}
                          onChange={(e) => {
                            setInlinePassword(e.target.value);
                            if (inlineLoginError) setInlineLoginError(null);
                          }}
                          placeholder={t("auth.password", "Passwort")}
                          disabled={isInlineLoggingIn}
                          className={`w-28 xl:w-36 h-8 pl-8 pr-3 rounded-full text-xs text-white placeholder:text-white/50 bg-white/15 hover:bg-white/20 focus:bg-white/25 border transition-all outline-none font-medium backdrop-blur-sm ${
                            inlineLoginError
                              ? "border-rose-400 bg-rose-500/20 text-rose-100"
                              : "border-white/20 focus:border-white/60 focus:ring-2 focus:ring-white/20"
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isInlineLoggingIn || !inlineUsername.trim() || !inlinePassword.trim()}
                        className="bg-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_85%,black)] disabled:opacity-40 disabled:pointer-events-none text-white transition-all px-3.5 h-8 rounded-full border border-white/20 active:scale-95 shadow-sm flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer min-w-[100px]"
                        title={inlineLoginError || t("nav.login", "Anmelden")}
                      >
                        {isInlineLoggingIn ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" strokeWidth={2.2} />
                        ) : (
                          <LogIn className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                        )}
                        <span>{t("nav.login", "Anmelden")}</span>
                      </button>

                      {inlineLoginError && (
                        <span className="text-[11px] font-semibold text-rose-200 bg-rose-600/90 px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm border border-rose-400/40 animate-in fade-in zoom-in-95 duration-200">
                          {inlineLoginError}
                        </span>
                      )}
                    </form>
                  ) : null}

                  {/* Mobile fallback button */}
                  <button
                    type="button"
                    onClick={onOpenLogin || onLogout}
                    className={`${onPerformLogin ? "flex lg:hidden" : "flex"} bg-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_85%,black)] text-white transition-all px-3.5 sm:px-4 h-7 lg:h-8 rounded-full border border-white/20 active:scale-95 shadow-md items-center justify-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer`}
                  >
                    <LogIn className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                    <span>{t("nav.login", "Anmelden")}</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {news && news.trim() !== "" && (
        <header
          className="sticky top-0 z-50 w-full"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {/* Centered Compact News Bar - Icon removed, Padding reduced */}
          <div className="w-full py-1.5 px-4 shadow-md flex justify-center items-center animate-in fade-in slide-in-from-top-2 duration-500">
            <p className="text-[9px] md:text-xs font-black uppercase tracking-wider text-white text-center w-full leading-tight">
              {news}
            </p>
          </div>
        </header>
      )}

      <main className="flex-grow flex flex-col w-full pb-[calc(64px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <div className="w-full mx-auto flex-grow flex flex-col min-h-0">{children}</div>
      </main>

      <footer
        className="hidden md:block py-2.5 text-center w-full border-t border-white/10 px-6 select-none"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-[11px] font-medium text-white/70">
          {logoUrl ? (
            <div className="flex items-center gap-2 text-white/90 font-medium">
              <img
                src={logoUrl}
                alt={`${clubName} Logo`}
                className="w-4 h-4 object-contain drop-shadow-sm shrink-0"
              />
              <span>{clubName}</span>
            </div>
          ) : (
            <span className="text-white/90 font-medium">{clubName}</span>
          )}

          <span className="text-white/20 select-none">|</span>

          {onShowImpressum && (
            <button
              type="button"
              onClick={onShowImpressum}
              className="text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              {t("nav.impressum")}
            </button>
          )}

          {!hideWebsiteLink && (
            <>
              <span className="text-white/20 select-none">|</span>
              <a
                href={clubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Website</span>
                <i className="fa-solid fa-external-link text-[8.5px] text-white/40"></i>
              </a>
            </>
          )}


        </div>
      </footer>
    </div>
  );
};

export default Layout;
