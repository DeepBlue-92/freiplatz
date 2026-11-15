import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Tournament, TournamentProposedDate, PollVoteStatus, User, Role } from "../types";
import { useTranslation } from "react-i18next";
import { Check, HelpCircle, X, Circle } from "lucide-react";

interface TournamentPollModalProps {
  isOpen?: boolean;
  onClose: () => void;
  tournament: Tournament;
  currentUser: User;
  users?: Record<string, User>;
  isAdmin?: boolean;
  onVote: (tournamentId: string, votes: Record<string, PollVoteStatus>) => Promise<void> | void;
  onFinalizeDate: (tournamentId: string, dateId: string) => Promise<void> | void;
  onReopenPoll: (tournamentId: string) => Promise<void> | void;
}

export const TournamentPollModal: React.FC<TournamentPollModalProps> = ({
  isOpen = true,
  onClose,
  tournament,
  currentUser,
  users = {},
  isAdmin = false,
  onVote,
  onFinalizeDate,
  onReopenPoll,
}) => {
  const { t, i18n } = useTranslation();
  const [confirmFinalizeId, setConfirmFinalizeId] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"vote" | "matrix">("vote");

  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setIsAnimatingIn(false);
    const timer = setTimeout(() => setIsAnimatingIn(true), 15);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 220);
  };

  const getUserDisplayName = (nameOrId: string) => {
    if (!nameOrId) return "Unbekannt";
    const foundUser = Object.values(users).find(
      (u) =>
        u.name?.toLowerCase() === nameOrId.toLowerCase() || u.id === nameOrId,
    );
    if (foundUser) {
      if (foundUser.klarname) return foundUser.klarname;
      if (foundUser.firstName || foundUser.lastName) {
        return `${foundUser.firstName || ""} ${foundUser.lastName || ""}`.trim();
      }
      return foundUser.name;
    }
    return nameOrId;
  };

  // Helper to reliably detect System-Admin / Super-Admin accounts
  const isSystemAdmin = (nameOrId?: string, voteObj?: any) => {
    if (!nameOrId && !voteObj) return false;
    const cleanStr = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const candidates = [
      nameOrId,
      voteObj?.userName,
      voteObj?.userId,
      getUserDisplayName(nameOrId || voteObj?.userName || ""),
    ];

    for (const c of candidates) {
      if (!c) continue;
      const cleaned = cleanStr(c);
      if (
        cleaned === "systemadmin" ||
        cleaned === "superadmin" ||
        cleaned === "systemadministration" ||
        cleaned.startsWith("tempadmin") ||
        c.toLowerCase().includes("system-admin") ||
        c.toLowerCase().includes("system admin") ||
        c.toLowerCase().includes("super-admin") ||
        c.toLowerCase().includes("super admin")
      ) {
        return true;
      }
    }

    const foundUser = Object.values(users).find(
      (u) =>
        (nameOrId && (u.name?.toLowerCase() === nameOrId.toLowerCase() || u.id === nameOrId)) ||
        (voteObj?.userId && u.id === voteObj.userId) ||
        (voteObj?.userName && u.name?.toLowerCase() === voteObj.userName.toLowerCase())
    );

    if (foundUser) {
      if (foundUser.role === Role.SUPERADMIN) return true;
      const uName = cleanStr(foundUser.name);
      const uKlar = cleanStr(foundUser.klarname);
      if (
        uName === "systemadmin" ||
        uName === "superadmin" ||
        uKlar === "systemadmin" ||
        uKlar === "superadmin" ||
        (foundUser.klarname && foundUser.klarname.toLowerCase().includes("system-admin")) ||
        (foundUser.klarname && foundUser.klarname.toLowerCase().includes("system admin"))
      ) {
        return true;
      }
    }

    return false;
  };

  const currentUserName = useMemo(() => {
    if (!currentUser) return "Ich";
    if (currentUser.klarname) return currentUser.klarname;
    if (currentUser.firstName || currentUser.lastName) {
      return `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim();
    }
    return currentUser.name || "Ich";
  }, [currentUser]);

  const proposedDates: TournamentProposedDate[] = useMemo(() => {
    const raw = tournament.proposedDates || [];
    return [...raw].sort((a, b) => {
      const dateA = a.date || "";
      const dateB = b.date || "";
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      const timeA = a.startTime || "";
      const timeB = b.startTime || "";
      return timeA.localeCompare(timeB);
    });
  }, [tournament.proposedDates]);
  const pollVotes = tournament.pollVotes || {};
  const allowMaybe = tournament.allowMaybe ?? true;
  const isFinalized = tournament.pollStatus === "finalized";

  // Find current user's vote object safely (matching either userName or userId, case-insensitive)
  const myVoteObj = useMemo(() => {
    const uName = (currentUser?.name || "").toLowerCase().trim();
    const uId = (currentUser?.id || "").toLowerCase().trim();
    return (
      Object.values(pollVotes).find((v) => {
        const vName = (v.userName || "").toLowerCase().trim();
        const vId = (v.userId || "").toLowerCase().trim();
        return (uName && vName === uName) || (uId && vId === uId);
      }) ||
      (currentUser?.name ? pollVotes[currentUser.name] : undefined) ||
      (currentUser?.id ? pollVotes[currentUser.id] : undefined)
    );
  }, [pollVotes, currentUser]);

  // Local optimistic state: initialized with user's existing votes
  const [localVotes, setLocalVotes] = useState<Record<string, PollVoteStatus>>(() => myVoteObj?.votes || {});

  // Sync with incoming server votes when updated externally
  useEffect(() => {
    if (myVoteObj?.votes) {
      setLocalVotes(myVoteObj.votes);
    }
  }, [myVoteObj]);

  // Compute effective votes (merging localVotes optimistically, strictly filtering out System-Admin)
  const effectivePollVotes = useMemo(() => {
    const map: Record<string, any> = {};

    Object.entries(pollVotes).forEach(([key, vote]) => {
      if (!isSystemAdmin(vote.userName || vote.userId, vote)) {
        map[key] = vote;
      }
    });

    if (!isSystemAdmin(currentUser?.name || currentUser?.id)) {
      const userVoteKey = currentUser?.name || currentUser?.id || "currentUser";
      map[userVoteKey] = {
        userId: currentUser?.id || currentUser?.name || "unknown",
        userName: currentUserName,
        votes: localVotes,
        updatedAt: myVoteObj?.updatedAt || new Date().toISOString(),
      };
    }

    return map;
  }, [pollVotes, currentUser, localVotes, myVoteObj, currentUserName, users]);

  // Other participants who voted (strictly excluding currentUser and System-Admin)
  const otherVoters = useMemo(() => {
    const uName = (currentUser?.name || "").toLowerCase().trim();
    const uId = (currentUser?.id || "").toLowerCase().trim();
    return Object.values(pollVotes).filter((v) => {
      const vName = (v.userName || "").toLowerCase().trim();
      const vId = (v.userId || "").toLowerCase().trim();
      const isMe = (uName && vName === uName) || (uId && vId === uId);
      if (isMe) return false;
      if (isSystemAdmin(v.userName || v.userId, v)) return false;
      return true;
    });
  }, [pollVotes, currentUser, users]);

  // Compute aggregated counts per proposed date directly from effectivePollVotes
  const countsPerDate = useMemo(() => {
    return proposedDates.map((pDate) => {
      let yesCount = 0;
      let maybeCount = 0;
      let noCount = 0;

      Object.values(effectivePollVotes).forEach((v) => {
        const status = v.votes?.[pDate.id];
        if (status === "yes") yesCount++;
        else if (status === "maybe") maybeCount++;
        else if (status === "no") noCount++;
      });

      return {
        dateId: pDate.id,
        yesCount,
        maybeCount,
        noCount,
        score: yesCount + (allowMaybe ? maybeCount * 0.5 : 0),
      };
    });
  }, [proposedDates, effectivePollVotes, allowMaybe]);

  const maxYesCount = useMemo(() => {
    if (!countsPerDate || countsPerDate.length === 0) return 0;
    return Math.max(...countsPerDate.map((c) => c.yesCount));
  }, [countsPerDate]);

  const handleVoteToggle = (dateId: string, targetStatus: PollVoteStatus) => {
    if (isFinalized) return;

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);

    setLocalVotes((prev) => {
      const current = prev[dateId];
      const newVotes = { ...prev };

      if (current === targetStatus) {
        delete newVotes[dateId];
      } else {
        newVotes[dateId] = targetStatus;
      }

      // 1. Immediately persist to Firestore on each click (auto-save)
      try {
        onVote(tournament.id, newVotes);
      } catch (err) {
        console.error("Error saving poll vote:", err);
      }

      return newVotes;
    });
  };

  const formatDateHeader = (dateStr: string) => {
    if (!dateStr) return { weekday: "", dayMonth: "", fullDate: "" };
    const d = new Date(dateStr);
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    const weekday = d.toLocaleDateString(locale, { weekday: "short" });
    const dayMonth = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
    const fullDate = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    return { weekday, dayMonth, fullDate };
  };

  const colMinWidth = proposedDates.length >= 6 ? "135px" : "155px";

  // Scroll container ref & controls for smooth horizontal navigation
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 15);
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const t = setTimeout(checkScroll, 80);
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(t);
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [proposedDates.length, mobileTab]);

  const handleScrollBy = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = direction === "left" ? -340 : 340;
    el.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity"
      onClick={handleClose}
      style={{
        opacity: !isAnimatingIn || isClosing ? 0 : 1,
        transitionDuration: isClosing ? "200ms" : "250ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: isClosing ? "none" : "auto",
      }}
    >
      <div
        className="w-full max-w-5xl h-[100vh] bg-white shadow-2xl flex flex-col transform transition-all pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: !isAnimatingIn || isClosing ? "translateX(100%)" : "translateX(0)",
          transitionDuration: isClosing ? "200ms" : "250ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-calendar-check text-lg"></i>
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-slate-900 truncate">
                {tournament.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate font-medium">
                {isFinalized
                  ? t("tournaments.finalizedDate", "Festgelegter Termin")
                  : t("tournaments.pollActiveSubtitle", "Terminabstimmung läuft")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer"
              aria-label={t("common.close", "Schließen")}
              title={t("common.close", "Schließen")}
            >
              <i className="fa-solid fa-xmark text-base"></i>
            </button>
          </div>
        </div>

        {/* Action Guidance Banner: Explains voting & provides horizontal carousel navigation */}
        {!isFinalized && (
          <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-5 py-3 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                {t("tournaments.pollGuidanceTitle", "Verfügbarkeit angeben")}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                {t(
                  "tournaments.pollGuidanceText",
                  "Bitte gib für jeden Termin deine Verfügbarkeit an. Du musst nichts zusätzlich bestätigen.",
                )}
              </p>
            </div>
          </div>
        )}

        {/* Finalized Banner / Admin Reopen */}
        {isFinalized && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-900 shrink-0">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-calendar-check text-emerald-600 text-base shrink-0"></i>
              <span>
                {t("tournaments.finalizedDate", "Festgelegter Termin")}: <strong>{tournament.date}</strong> ({tournament.startTime}
                {tournament.endTime ? ` - ${tournament.endTime}` : ""}{i18n.language === "en" ? "" : " Uhr"})
              </span>
            </div>
            {isAdmin && (
              <div className="shrink-0 w-full sm:w-auto">
                {confirmReopen ? (
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-[11px] font-bold text-amber-800">{t("tournaments.reallyReopen", "Wirklich öffnen?")}</span>
                    <button
                      onClick={async () => {
                        await onReopenPoll(tournament.id);
                        setConfirmReopen(false);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition shadow-xs cursor-pointer"
                    >
                      {t("common.yes", "Ja")}
                    </button>
                    <button
                      onClick={() => setConfirmReopen(false)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                    >
                      {t("common.no", "Nein")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReopen(true)}
                    className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <i className="fa-solid fa-rotate-left text-slate-500"></i>
                    {t("tournaments.reopenPoll", "Abstimmung wiedereröffnen")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobile View Switcher (Tab-Bar) */}
        <div className="md:hidden bg-slate-100 p-1.5 border-b border-slate-200 flex gap-1.5 shrink-0 select-none">
          <button
            type="button"
            onClick={() => setMobileTab("vote")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileTab === "vote"
                ? "bg-white text-[var(--color-primary)] shadow-sm font-black"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <i className="fa-solid fa-check-to-slot"></i>
            {t("tournaments.myVotes", "Meine Stimmen")}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("matrix")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileTab === "matrix"
                ? "bg-white text-[var(--color-primary)] shadow-sm font-black"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <i className="fa-solid fa-table-cells"></i>
            {t("tournaments.liveMatrix", "Live-Matrix")} ({Object.keys(effectivePollVotes).length})
          </button>
        </div>

        {/* ============================================================== */}
        {/* MOBILE VIEW: Touch-Friendly Bento Cards for "Meine Stimmen"     */}
        {/* ============================================================== */}
        <div
          className={`md:hidden flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 ${
            mobileTab === "vote" ? "block" : "hidden"
          }`}
        >
          {proposedDates.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <i className="fa-solid fa-calendar-xmark text-3xl mb-2 opacity-30"></i>
              <p className="text-sm font-semibold">{t("tournaments.noProposedDates", "Keine Terminvorschläge vorhanden.")}</p>
            </div>
          ) : (
            proposedDates.map((pDate, pIdx) => {
              const { fullDate } = formatDateHeader(pDate.date);
              const currentStatus = localVotes[pDate.id];
              const isSelectedFinal = tournament.finalizedDateId === pDate.id;
              const dateCounts = countsPerDate[pIdx];
              const isTopOption = !isSelectedFinal && maxYesCount > 0 && dateCounts?.yesCount === maxYesCount;

              return (
                <div
                  key={pDate.id}
                  className={`bg-white rounded-2xl p-4 border transition-all shadow-xs space-y-3 ${
                    isSelectedFinal
                      ? "border-emerald-500 ring-2 ring-emerald-400/20 bg-emerald-50/10"
                      : isTopOption
                      ? "border-green-300 bg-green-50/20"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {isSelectedFinal && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-xs">
                            <i className="fa-solid fa-check mr-1"></i> {t("tournaments.selected", "Ausgewählt")}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500">
                          {t("tournaments.addOption", "Option")} {pIdx + 1} {t("tournaments.participantsOf", "von")} {proposedDates.length}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 leading-tight">
                        {fullDate || pDate.date}
                      </h4>
                      <p className="text-xs text-slate-600 font-bold mt-0.5 flex items-center gap-1.5">
                        <i className="fa-regular fa-clock text-slate-400"></i>
                        {pDate.startTime}{pDate.endTime ? ` - ${pDate.endTime}` : ""}{i18n.language === "en" ? "" : " Uhr"}
                      </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      {dateCounts.yesCount > 0 ? (
                        <span
                          className="text-sm inline-flex items-center gap-1 font-semibold text-green-600"
                          title={`${dateCounts.yesCount} ${t("tournaments.yesCount", "Zusagen")}`}
                        >
                          <span>{dateCounts.yesCount}</span>
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      ) : (
                        <span
                          className="text-sm font-normal text-gray-400 inline-flex items-center"
                          title={`0 ${t("tournaments.yesCount", "Zusagen")}`}
                        >
                          0
                        </span>
                      )}
                      {allowMaybe && dateCounts.maybeCount > 0 && (
                        <span className="text-xs font-bold text-amber-800 mt-0.5">
                          (?{dateCounts.maybeCount})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Connected Segmented Toggle (Touch-Friendly >= 44px with High Contrast) */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        {t("tournaments.yourResponseForDate", "Deine Antwort:")}
                      </span>
                      {currentStatus && (
                        <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                          <i className="fa-solid fa-circle-check text-[9px]"></i>
                          Live gespeichert
                        </span>
                      )}
                    </div>
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 gap-1">
                      <button
                        type="button"
                        disabled={isFinalized}
                        onClick={() => handleVoteToggle(pDate.id, "yes")}
                        aria-label="Ja"
                        title={t("tournaments.voteYesTooltip", "Ich kann / Zusage")}
                        className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                          currentStatus === "yes"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-slate-500 hover:text-emerald-700 hover:bg-white/70"
                        }`}
                      >
                        <Check className="w-5 h-5 stroke-[2.5]" />
                      </button>

                      {allowMaybe && (
                        <button
                          type="button"
                          disabled={isFinalized}
                          onClick={() => handleVoteToggle(pDate.id, "maybe")}
                          aria-label="Ggf."
                          title={t("tournaments.voteMaybeTooltip", "Unsicher / Wenn nötig")}
                          className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                            currentStatus === "maybe"
                              ? "bg-amber-500 text-white shadow-xs"
                              : "text-slate-500 hover:text-amber-700 hover:bg-white/70"
                          }`}
                        >
                          <HelpCircle className="w-5 h-5 stroke-[2.2]" />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isFinalized}
                        onClick={() => handleVoteToggle(pDate.id, "no")}
                        aria-label="Nein"
                        title={t("tournaments.voteNoTooltip", "Kann nicht / Absage")}
                        className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                          currentStatus === "no"
                            ? "bg-rose-600 text-white shadow-xs"
                            : "text-slate-500 hover:text-rose-700 hover:bg-white/70"
                        }`}
                      >
                        <X className="w-5 h-5 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile Admin: Finalize Button */}
                  {isAdmin && !isFinalized && (
                    <div className="pt-2 border-t border-slate-100">
                      {confirmFinalizeId === pDate.id ? (
                        <div className="flex items-center justify-between gap-2 bg-emerald-50 p-2 rounded-xl border border-emerald-300">
                          <span className="text-[11px] font-bold text-emerald-900">{t("tournaments.finalizeDate", "Termin festlegen?")}</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                await onFinalizeDate(tournament.id, pDate.id);
                                setConfirmFinalizeId(null);
                              }}
                              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                            >
                              {t("tournaments.yesFinalize", "Ja, festlegen")}
                            </button>
                            <button
                              onClick={() => setConfirmFinalizeId(null)}
                              className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold"
                            >
                              {t("common.cancel", "Abbrechen")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmFinalizeId(pDate.id)}
                          className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-600 hover:text-white transition shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <i className="fa-solid fa-calendar-check"></i>
                          {t("tournaments.selectDate", "Termin wählen")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ============================================================== */}
        {/* DESKTOP (or Mobile Tab 2): Full Doodle Transparenz-Matrix       */}
        {/* ============================================================== */}
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Floating Left Carousel Navigation Button */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => handleScrollBy("left")}
              className="hidden md:flex absolute top-12 left-[230px] z-30 w-9 h-9 rounded-full bg-white text-slate-800 hover:text-black border border-slate-300 shadow-md items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
              title={t("tournaments.scrollLeft", "Termine nach links")}
              aria-label="Nach links scrollen"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
          )}

          {/* Floating Right Carousel Navigation Button */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => handleScrollBy("right")}
              className="hidden md:flex absolute top-12 right-3 z-30 w-9 h-9 rounded-full bg-white text-slate-800 hover:text-black border border-slate-300 shadow-md items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
              title={t("tournaments.scrollRight", "Termine nach rechts")}
              aria-label="Nach rechts scrollen"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          )}

          {/* Subtle Right Edge Fade Indicator */}
          {canScrollRight && (
            <div className="pointer-events-none absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-slate-200/50 to-transparent z-25 hidden md:block" />
          )}

          {/* Subtle Left Edge Fade Indicator */}
          {canScrollLeft && (
            <div className="pointer-events-none absolute top-0 bottom-0 left-[220px] w-6 bg-gradient-to-r from-slate-200/40 to-transparent z-25 hidden md:block" />
          )}

          <div
            ref={scrollContainerRef}
            className={`flex-1 overflow-x-auto overflow-y-auto p-4 sm:p-5 scroll-smooth ${
              mobileTab === "matrix" ? "block" : "hidden md:block"
            }`}
          >
            {proposedDates.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <i className="fa-solid fa-calendar-xmark text-3xl mb-2 opacity-30"></i>
                <p className="text-sm font-semibold">{t("tournaments.noProposedDatesDesc", "Keine Terminvorschläge für diese Umfrage hinterlegt.")}</p>
              </div>
            ) : (
              <div className="w-full min-w-full inline-block align-top">
                <table className="w-full min-w-full border-collapse text-left select-none table-fixed">
                  <thead>
                    {/* Row 1: Date & Time Columns */}
                    <tr className="border-b border-slate-200 bg-white">
                      <th
                        style={{ width: "220px" }}
                        className="p-3 pb-3 text-xs font-black uppercase text-slate-600 tracking-wider sticky left-0 bg-white z-20 border-r border-slate-200 align-bottom"
                      >
                        {t("tournaments.proposedDate", "Terminvorschlag")}
                      </th>

                      {proposedDates.map((pDate, pIdx) => {
                        const { weekday, dayMonth } = formatDateHeader(pDate.date);
                        const isSelectedFinal = tournament.finalizedDateId === pDate.id;
                        const dateCounts = countsPerDate[pIdx];
                        const isTopOption = !isSelectedFinal && maxYesCount > 0 && dateCounts?.yesCount === maxYesCount;

                        return (
                          <th
                            key={pDate.id}
                            style={{ minWidth: colMinWidth }}
                            className={`p-3 pb-3 text-center border-l border-slate-200 relative transition-colors ${
                            isSelectedFinal
                              ? "bg-emerald-50/80"
                              : isTopOption
                              ? "bg-green-50/40"
                              : "bg-white"
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {isSelectedFinal ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-xs">
                                <i className="fa-solid fa-check mr-1"></i> {t("tournaments.selected", "Ausgewählt")}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {t("tournaments.addOption", "Option")} {pIdx + 1}
                              </span>
                            )}

                            <div>
                              <span className="block text-sm font-black text-slate-900 leading-snug">
                                {weekday}, {dayMonth}
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 font-normal mt-0.5">
                                <i className="fa-regular fa-clock text-gray-400 text-xs"></i>
                                {pDate.startTime}
                                {pDate.endTime ? ` - ${pDate.endTime}` : ""}{i18n.language === "en" ? "" : " Uhr"}
                              </span>
                            </div>
                          </div>

                          {/* Admin Action: Pill button */}
                          {isAdmin && !isFinalized && (
                            <div className="mt-2">
                              {confirmFinalizeId === pDate.id ? (
                                <div className="flex flex-col gap-1 items-center bg-white p-1.5 rounded-lg border border-emerald-300 shadow-sm max-w-[140px] mx-auto">
                                  <span className="text-[10px] font-black text-emerald-900 leading-tight">{t("tournaments.finalizeDate", "Termin festlegen?")}</span>
                                  <div className="flex gap-1 w-full justify-center">
                                    <button
                                      onClick={async () => {
                                        await onFinalizeDate(tournament.id, pDate.id);
                                        setConfirmFinalizeId(null);
                                      }}
                                      className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black hover:bg-emerald-700 cursor-pointer"
                                    >
                                      {t("common.yes", "Ja")}
                                    </button>
                                    <button
                                      onClick={() => setConfirmFinalizeId(null)}
                                      className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold hover:bg-slate-200 cursor-pointer"
                                    >
                                      {t("common.no", "Nein")}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmFinalizeId(pDate.id)}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition shadow-2xs cursor-pointer inline-flex items-center justify-center gap-1 max-w-[130px] w-full"
                                >
                                  <i className="fa-solid fa-check text-[9px]"></i>
                                  {t("tournaments.selectDate", "Termin wählen")}
                                </button>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>

                  {/* Row 2: Aggregated Results directly under date header */}
                  <tr className="bg-slate-100/70 border-b-2 border-slate-300">
                    <th className="py-2.5 px-3 text-left sticky left-0 bg-slate-100 z-20 border-r border-slate-200">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
                        {t("tournaments.results", "Ergebnis")}
                      </span>
                    </th>
                    {proposedDates.map((pDate, pIdx) => {
                      const counts = countsPerDate[pIdx];
                      const isSelectedFinal = tournament.finalizedDateId === pDate.id;
                      const isTopOption = !isSelectedFinal && maxYesCount > 0 && counts?.yesCount === maxYesCount;

                      return (
                        <th
                          key={pDate.id}
                          className={`py-2.5 px-2 text-center border-l border-slate-200 transition-colors ${
                            isSelectedFinal
                              ? "bg-emerald-100/60 font-bold"
                              : isTopOption
                              ? "bg-green-50 font-bold"
                              : "bg-slate-100/60 font-bold"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {counts.yesCount > 0 ? (
                              <span
                                className="text-sm inline-flex items-center justify-center gap-1 font-semibold text-green-600"
                                title={`${counts.yesCount} ${t("tournaments.yesCount", "Zusagen")}`}
                              >
                                <span>{counts.yesCount}</span>
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </span>
                            ) : (
                              <span
                                className="text-sm font-normal text-gray-400 inline-flex items-center justify-center"
                                title={`0 ${t("tournaments.yesCount", "Zusagen")}`}
                              >
                                0
                              </span>
                            )}
                            {allowMaybe && counts.maybeCount > 0 && (
                              <span
                                className="text-xs font-bold text-amber-700"
                                title={`${counts.maybeCount} ${t("tournaments.maybeCount", "Unsicher")}`}
                              >
                                (?{counts.maybeCount})
                              </span>
                            )}
                            {counts.noCount > 0 && (
                              <span
                                className="text-xs font-medium text-rose-600"
                                title={`${counts.noCount} ${t("tournaments.noCount", "Absagen")}`}
                              >
                                (✕{counts.noCount})
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {/* 1. Logged-in User's Row: Clean white styling */}
                  <tr className="bg-white border-b-2 border-slate-200 font-medium">
                    <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          {t("tournaments.yourResponse", "Deine Rückmeldung")}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <span className="text-xs font-black text-slate-900 truncate" title={currentUserName}>
                            {currentUserName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-slate-800 text-white shrink-0">
                            Du
                          </span>
                        </div>
                      </div>
                    </td>

                    {proposedDates.map((pDate) => {
                      const currentStatus = localVotes[pDate.id];

                      return (
                        <td
                          key={pDate.id}
                          className="p-2.5 text-center border-l border-slate-200 align-middle bg-white"
                        >
                          {isFinalized ? (
                            <div className="flex justify-center items-center h-8">
                              {currentStatus === "yes" ? (
                                <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                  <Check className="w-4 h-4 stroke-[2.5]" />
                                </span>
                              ) : currentStatus === "maybe" ? (
                                <span className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                  <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                                </span>
                              ) : currentStatus === "no" ? (
                                <span className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                  <X className="w-4 h-4 stroke-[2.5]" />
                                </span>
                              ) : (
                                <Circle className="w-4 h-4 text-gray-300 stroke-1" />
                              )}
                            </div>
                          ) : (
                            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 gap-0.5 shadow-2xs">
                              {/* YES Option */}
                              <button
                                type="button"
                                onClick={() => handleVoteToggle(pDate.id, "yes")}
                                title={t("tournaments.voteYesTooltip", "Ich kann / Zusage")}
                                aria-label="Ja"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                                  currentStatus === "yes"
                                    ? "bg-emerald-600 text-white shadow-xs"
                                    : "text-slate-500 hover:text-emerald-700 hover:bg-white/70"
                                }`}
                              >
                                <Check className="w-4 h-4 stroke-[2.5]" />
                              </button>

                              {/* MAYBE Option (if enabled) */}
                              {allowMaybe && (
                                <button
                                  type="button"
                                  onClick={() => handleVoteToggle(pDate.id, "maybe")}
                                  title={t("tournaments.voteMaybeTooltip", "Unsicher / Wenn nötig")}
                                  aria-label="Ggf."
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                                    currentStatus === "maybe"
                                      ? "bg-amber-500 text-white shadow-xs"
                                      : "text-slate-500 hover:text-amber-700 hover:bg-white/70"
                                  }`}
                                >
                                  <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                                </button>
                              )}

                              {/* NO Option */}
                              <button
                                type="button"
                                onClick={() => handleVoteToggle(pDate.id, "no")}
                                title={t("tournaments.voteNoTooltip", "Kann nicht / Absage")}
                                aria-label="Nein"
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                                  currentStatus === "no"
                                    ? "bg-rose-600 text-white shadow-xs"
                                    : "text-slate-500 hover:text-rose-700 hover:bg-white/70"
                                }`}
                              >
                                <X className="w-4 h-4 stroke-[2.5]" />
                              </button>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* 2. Section Header: Andere Teilnehmer */}
                  {otherVoters.length > 0 && (
                    <tr className="bg-slate-100/70 border-b border-slate-200">
                      <td
                        colSpan={proposedDates.length + 1}
                        className="py-1 px-3 text-[10px] font-black uppercase tracking-wider text-slate-500 sticky left-0 z-10"
                      >
                        {t("tournaments.otherParticipants", "Andere Teilnehmer")} ({otherVoters.length})
                      </td>
                    </tr>
                  )}

                  {/* 3. Other Participants Rows: Ultra-compact, NO avatars/photos, reduced height (~28px) */}
                  {otherVoters.map((voter, vIdx) => {
                    const displayName = getUserDisplayName(voter.userName);

                    return (
                      <tr
                        key={voter.userId || voter.userName || vIdx}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors h-8"
                      >
                        <td className="py-1 px-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <span className="text-xs font-semibold text-slate-700 truncate block max-w-[200px]" title={displayName}>
                            {displayName}
                          </span>
                        </td>

                        {proposedDates.map((pDate) => {
                          const status = voter.votes?.[pDate.id];

                          return (
                            <td
                              key={pDate.id}
                              className="py-1 px-2 text-center border-l border-slate-200 align-middle"
                            >
                              <div className="flex justify-center items-center">
                                {status === "yes" ? (
                                  <span
                                    className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center justify-center text-[10px]"
                                    title={`${displayName}: ${t("common.yes", "Ja")}`}
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  </span>
                                ) : status === "maybe" ? (
                                  <span
                                    className="w-5 h-5 rounded-md bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center text-[10px]"
                                    title={`${displayName}: ${t("tournaments.maybe", "Unsicher")}`}
                                  >
                                    <HelpCircle className="w-3.5 h-3.5 stroke-[2.2]" />
                                  </span>
                                ) : status === "no" ? (
                                  <span
                                    className="w-5 h-5 rounded-md bg-rose-50 text-rose-700 border border-rose-300 flex items-center justify-center text-[10px]"
                                    title={`${displayName}: ${t("common.no", "Nein")}`}
                                  >
                                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                  </span>
                                ) : (
                                  <Circle
                                    className="w-3.5 h-3.5 text-gray-300 stroke-1"
                                    title={`${displayName}: ${t("tournaments.pendingVote", "Ausstehend")}`}
                                  />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Empty State: Wenn noch keine weiteren Mitglieder abgestimmt haben */}
                  {otherVoters.length === 0 && (
                    <tr>
                      <td
                        colSpan={proposedDates.length + 1}
                        className="py-4 px-4 text-center text-slate-400 bg-slate-50/30 border-b border-slate-100"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <i className="fa-solid fa-info-circle text-slate-400 text-xs"></i>
                          <span className="text-xs font-medium text-slate-500">
                            {t("tournaments.onlyYouVoted", "Bisher hast nur du abgestimmt. Weitere Stimmen erscheinen hier live.")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>,
    document.body
  );
};
