import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { PartyPopper, Users, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Tournament, User, Role, TournamentProposedDate, PollVoteStatus } from "../types";
import { TournamentPollModal } from "./TournamentPollModal";

interface TournamentsProps {
  tournaments: Tournament[];
  users: Record<string, User>;
  currentUser: User;
  onToggleRegistration: (
    tournamentId: string,
    playerName?: string,
    comment?: string,
  ) => void;
  onAddTournament: (
    tournament: Omit<Tournament, "id" | "participants">,
  ) => void;
  onDeleteTournament: (tournamentId: string) => void;
  onUpdateTournament?: (id: string, updates: Partial<Tournament>) => void;
  highlightEventId?: string | null;
}

const Tournaments: React.FC<TournamentsProps> = ({
  tournaments,
  users,
  currentUser,
  onToggleRegistration,
  onAddTournament,
  onDeleteTournament,
  onUpdateTournament,
  highlightEventId,
}) => {
  const { t, i18n } = useTranslation();
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (highlightEventId) {
      setTimeout(() => {
        const element = document.getElementById(`event-${highlightEventId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }, [highlightEventId]);

  const handleCopyLink = () => {
    if (!editingTournamentId) return;
    const eventLink = `${window.location.origin}/#/events/${editingTournamentId}`;
    navigator.clipboard.writeText(eventLink)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch((err) => {
        console.error("Fehler beim Kopieren des Links:", err);
      });
  };

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {},
  );
  const [expandedMobile, setExpandedMobile] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedParticipants, setExpandedParticipants] = useState<
    Record<string, boolean>
  >({});

  const [formData, setFormData] = useState({
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    registrationStart: "",
    registrationEnd: "",
    deregistrationStart: "",
    deregistrationEnd: "",
    description: "",
    hideExpired: false,
    allowComment: false,
    maxParticipants: "",
    isRegistrationBlocked: false,
    isPoll: false,
    allowMaybe: true,
    proposedDates: [
      { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
      { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
    ] as TournamentProposedDate[],
  });

  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [auditModalId, setAuditModalId] = useState<string | null>(null);
  const [isAuditAnimatingIn, setIsAuditAnimatingIn] = useState(false);
  const [isAuditClosing, setIsAuditClosing] = useState(false);
  const [activePollModalTournament, setActivePollModalTournament] = useState<Tournament | null>(null);

  // Sync activePollModalTournament with latest tournament data from props
  const currentActivePollTournament = useMemo(() => {
    if (!activePollModalTournament) return null;
    return tournaments.find((t) => t.id === activePollModalTournament.id) || activePollModalTournament;
  }, [tournaments, activePollModalTournament]);

  const handleVotePoll = async (tournamentId: string, votes: Record<string, PollVoteStatus>) => {
    const tItem = tournaments.find((t) => t.id === tournamentId);
    if (!tItem || !onUpdateTournament) return;

    const existingVotes = { ...(tItem.pollVotes || {}) };
    const userVoteKey = currentUser.name;

    existingVotes[userVoteKey] = {
      userId: currentUser.id || currentUser.name,
      userName: currentUser.name,
      votes,
      updatedAt: new Date().toISOString(),
    };

    const newAuditLog = [...(tItem.auditLog || [])];
    newAuditLog.push({
      action: "poll_vote",
      userName: currentUser.name,
      actorName: currentUser.name,
      timestamp: new Date().toISOString(),
      details: `${currentUser.name} hat abgestimmt (${Object.keys(votes).length} Termine bewertet)`,
    });

    const updatedData = {
      pollVotes: existingVotes,
      auditLog: newAuditLog,
    };

    setActivePollModalTournament((prev) => {
      if (!prev || prev.id !== tournamentId) return prev;
      return { ...prev, ...updatedData };
    });

    onUpdateTournament(tournamentId, updatedData);
  };

  const handleFinalizeDate = async (tournamentId: string, dateId: string) => {
    const tItem = tournaments.find((t) => t.id === tournamentId);
    if (!tItem || !onUpdateTournament) return;

    const chosenDate = (tItem.proposedDates || []).find((p) => p.id === dateId);
    if (!chosenDate) return;

    // Auto-register all players who voted "yes" for this date (excluding System-Admin)
    const yesVoters: string[] = [];
    Object.values(tItem.pollVotes || {}).forEach((v) => {
      if (v.votes?.[dateId] === "yes" && v.userName) {
        const s = (v.userName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (s !== "systemadmin" && s !== "superadmin") {
          yesVoters.push(v.userName);
        }
      }
    });

    // Merge with existing participants without duplicates
    const updatedParticipants = Array.from(new Set([...(tItem.participants || []), ...yesVoters]));

    const newAuditLog = [...(tItem.auditLog || [])];
    newAuditLog.push({
      action: "poll_finalize",
      userName: currentUser.name,
      actorName: currentUser.name,
      timestamp: new Date().toISOString(),
      details: `Termin verbindlich festgelegt auf ${chosenDate.date} (${chosenDate.startTime} Uhr) mit ${yesVoters.length} Zusagen`,
    });

    onUpdateTournament(tournamentId, {
      date: chosenDate.date,
      startTime: chosenDate.startTime,
      endTime: chosenDate.endTime || "",
      pollStatus: "finalized",
      finalizedDateId: dateId,
      participants: updatedParticipants,
      auditLog: newAuditLog,
    });
  };

  const handleReopenPoll = async (tournamentId: string) => {
    const tItem = tournaments.find((t) => t.id === tournamentId);
    if (!tItem || !onUpdateTournament) return;

    const newAuditLog = [...(tItem.auditLog || [])];
    newAuditLog.push({
      action: "poll_reopen",
      userName: currentUser.name,
      actorName: currentUser.name,
      timestamp: new Date().toISOString(),
      details: `Terminabstimmung wiedereröffnet durch ${currentUser.name}`,
    });

    onUpdateTournament(tournamentId, {
      pollStatus: "open",
      finalizedDateId: null,
      auditLog: newAuditLog,
    });
  };

  const handleOpenAudit = (tournamentId: string) => {
    setAuditModalId(tournamentId);
    setIsAuditAnimatingIn(false);
    setTimeout(() => setIsAuditAnimatingIn(true), 10);
    setIsAuditClosing(false);
  };

  const handleCloseAudit = () => {
    setIsAuditClosing(true);
    setTimeout(() => {
      setAuditModalId(null);
      setIsAuditAnimatingIn(false);
      setIsAuditClosing(false);
    }, 250);
  };

  const handleOpenSlider = (tournament?: Tournament) => {
    if (tournament) {
      setEditingTournamentId(tournament.id);
      setFormData({
        title: tournament.title || "",
        date: tournament.date || "",
        startTime: tournament.startTime || "",
        endTime: tournament.endTime || "",
        registrationStart: tournament.registrationStart || "",
        registrationEnd: tournament.registrationEnd || "",
        deregistrationStart: tournament.deregistrationStart || "",
        deregistrationEnd: tournament.deregistrationEnd || "",
        description: tournament.description || "",
        hideExpired: tournament.hideExpired ?? false,
        allowComment: tournament.allowComment ?? false,
        maxParticipants: tournament.maxParticipants
          ? tournament.maxParticipants.toString()
          : "",
        isRegistrationBlocked: tournament.isRegistrationBlocked ?? false,
        isPoll: tournament.isPoll ?? false,
        allowMaybe: tournament.allowMaybe ?? true,
        proposedDates: tournament.proposedDates && tournament.proposedDates.length > 0
          ? tournament.proposedDates.map((p) => ({ ...p }))
          : [
              { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
              { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
            ],
      });
    } else {
      setEditingTournamentId(null);
      setFormData({
        title: "",
        date: "",
        startTime: "",
        endTime: "",
        registrationStart: "",
        registrationEnd: "",
        deregistrationStart: "",
        deregistrationEnd: "",
        description: "",
        hideExpired: false,
        allowComment: false,
        maxParticipants: "",
        isRegistrationBlocked: false,
        isPoll: false,
        allowMaybe: true,
        proposedDates: [
          { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
          { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
        ],
      });
    }

    setIsSliderOpen(true);
    setIsAnimatingIn(false);
    setTimeout(() => setIsAnimatingIn(true), 10);
    setIsClosing(false);
    // Scroll to top on mobile maybe
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCloseSlider = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsSliderOpen(false);
      setIsAnimatingIn(false);
      setIsClosing(false);
      setEditingTournamentId(null);
      setFormData({
        title: "",
        date: "",
        startTime: "",
        endTime: "",
        registrationStart: "",
        registrationEnd: "",
        deregistrationStart: "",
        deregistrationEnd: "",
        description: "",
        hideExpired: false,
        allowComment: false,
        maxParticipants: "",
        isRegistrationBlocked: false,
        isPoll: false,
        allowMaybe: true,
        proposedDates: [
          { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
          { id: Math.random().toString(36).substr(2, 9), date: "", startTime: "18:00", endTime: "20:00" },
        ],
      });
    }, 250);
  };

  const allUsers = Object.values(users) as User[];
  const isAdmin = currentUser.role === Role.ADMIN || currentUser.hauptAdmin === true;

  const getUserDisplayName = (nameOrId: string) => {
    if (!nameOrId) return "Unbekannt";
    const foundUser = allUsers.find(
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

  const formatShortDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    const clean = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = clean.split("-");
    if (parts.length === 3) {
      if (i18n.language === "en") {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mIdx = parseInt(parts[1], 10) - 1;
        return `${monthNames[mIdx]} ${parseInt(parts[2], 10)}`;
      }
      return `${parseInt(parts[2], 10)}.${parseInt(parts[1], 10)}.`;
    }
    return clean;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const tournamentDetails = {
      title: formData.title.trim(),
      date: formData.date || null,
      startTime: formData.startTime || null,
      endTime: formData.endTime || null,
      registrationStart: formData.registrationStart || null,
      registrationEnd: formData.registrationEnd || null,
      deregistrationStart: formData.deregistrationStart || null,
      deregistrationEnd: formData.deregistrationEnd || null,
      description: formData.description.trim() || null,
      hideExpired: !!formData.hideExpired,
      allowComment: !!formData.allowComment,
      maxParticipants: formData.maxParticipants
        ? parseInt(formData.maxParticipants, 10)
        : null,
      isRegistrationBlocked: !!formData.isRegistrationBlocked,
      isPoll: !!formData.isPoll,
      allowMaybe: formData.isPoll ? !!formData.allowMaybe : false,
      proposedDates: formData.isPoll
        ? formData.proposedDates.filter((p) => p.date && p.startTime)
        : [],
    };

    if (formData.isPoll && !editingTournamentId) {
      (tournamentDetails as any).pollStatus = "open";
      (tournamentDetails as any).pollVotes = {};
    }

    if (editingTournamentId && onUpdateTournament) {
      onUpdateTournament(editingTournamentId, tournamentDetails);
    } else {
      onAddTournament(tournamentDetails);
    }

    handleCloseSlider();
  };



  const { upcomingTournaments, pastTournaments, trashTournaments } =
    useMemo(() => {
      const today = new Date().toISOString().split("T")[0];
      const upcoming: Tournament[] = [];
      const past: Tournament[] = [];
      const trash: Tournament[] = [];

      tournaments.forEach((t) => {
        if (t.deletedAt) {
          if (isAdmin) trash.push(t);
          return;
        }

        const isPast = !!t.date && t.date < today;
        if (isPast) {
          const isHidden = t.hideExpired ?? false;
          if (isAdmin || !isHidden) {
            past.push(t);
          }
        } else {
          upcoming.push(t);
        }
      });

      const getEffectiveDate = (t: Tournament) => {
        if (t.date) return t.date;
        if (t.isPoll && t.proposedDates && t.proposedDates.length > 0) {
          const dates = t.proposedDates.map((p) => p.date).filter(Boolean).sort();
          return dates[0] || "";
        }
        return "";
      };

      upcoming.sort((a, b) => {
        const dateA = getEffectiveDate(a);
        const dateB = getEffectiveDate(b);

        // If both have no date, sort alphabetically by title
        if (!dateA && !dateB) {
          return (a.title || "").localeCompare(b.title || "", "de", { sensitivity: "base" });
        }
        // Events without date always go to the end
        if (!dateA) return 1;
        if (!dateB) return -1;

        // Both have dates: chronological ascending
        const dateCmp = dateA.localeCompare(dateB);
        if (dateCmp !== 0) return dateCmp;

        // On the same date: events with fixed startTime first, events without time at the end
        if (a.startTime && !b.startTime) return -1;
        if (!a.startTime && b.startTime) return 1;
        if (a.startTime && b.startTime) {
          const timeCmp = a.startTime.localeCompare(b.startTime);
          if (timeCmp !== 0) return timeCmp;
        }

        // Tie-breaker: title
        return (a.title || "").localeCompare(b.title || "", "de", { sensitivity: "base" });
      });

      past.sort((a, b) => {
        if (!a.date && !b.date) {
          return (a.title || "").localeCompare(b.title || "", "de", { sensitivity: "base" });
        }
        if (!a.date) return 1;
        if (!b.date) return -1;

        // Past events: reverse chronological (most recent past event first)
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;

        if (a.startTime && !b.startTime) return -1;
        if (!a.startTime && b.startTime) return 1;
        if (a.startTime && b.startTime) {
          const timeCmp = b.startTime.localeCompare(a.startTime);
          if (timeCmp !== 0) return timeCmp;
        }

        return (a.title || "").localeCompare(b.title || "", "de", { sensitivity: "base" });
      });

      return {
        upcomingTournaments: upcoming,
        pastTournaments: past,
        trashTournaments: trash,
      };
    }, [tournaments, isAdmin]);

  const renderEventList = (
    events: Tournament[],
    isTrashView = false,
    isUpcomingView = false,
  ) => {
    if (events.length === 0) {
      return (
        <div className="col-span-full bg-white p-12 md:p-20 rounded-[1.5rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-2">
            <i
              className={`fa-solid ${isTrashView ? "fa-trash-can" : "fa-calendar-day"} text-4xl`}
            ></i>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-400 uppercase tracking-tighter">
              {t("tournaments.noEvents")}
            </h3>
            {isAdmin && isUpcomingView && !isTrashView && (
              <div className="mt-6">
                <button
                  onClick={() => handleOpenSlider()}
                  className="bg-[var(--color-primary)] hover:bg-[#205234] text-white px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-transform hover:scale-105 active:scale-95 flex items-center gap-3 shadow-md mx-auto"
                >
                  <i className="fa-solid fa-plus text-base"></i> {t("tournaments.createEvent")}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    const renderedEvents = events.map((tItem) => {
      const isRegistered = tItem.participants.includes(currentUser.name);
      const hasDate = !!tItem.date;

      let formattedDateStr = t("tournaments.dateTbd");
      if (hasDate) {
        const dateObj = new Date(tItem.date!);
        const locale = i18n.language === "en" ? "en-US" : "de-DE";
        const dStr = dateObj.toLocaleDateString(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        if (i18n.language === "de") {
          formattedDateStr = dStr.replace(/,/g, "").replace(/\.\./g, ".");
          if (!formattedDateStr.includes(".")) {
            formattedDateStr = formattedDateStr.replace(
              /^(Mo|Di|Mi|Do|Fr|Sa|So)/,
              "$1.",
            );
          }
        } else {
          formattedDateStr = dStr;
        }
      }

      const hasTime = !!tItem.startTime;
      const formattedTimeStr = hasTime
        ? (i18n.language === "en"
            ? `${tItem.startTime}${tItem.endTime ? ` - ${tItem.endTime}` : ""}`
            : `${tItem.startTime}${tItem.endTime ? ` - ${tItem.endTime}` : ""} Uhr`)
        : t("tournaments.timeTbd");

      return (
        <div
          key={tItem.id}
          id={`event-${tItem.id}`}
          className={`bg-white rounded-xl border flex flex-col justify-between h-full overflow-hidden transition-all duration-300 ${
            highlightEventId === tItem.id
              ? "border-amber-400 ring-4 ring-amber-400/20 shadow-lg scale-[1.01]"
              : "border-slate-200"
          }`}
        >
          <div
            onClick={() => {
              if (tItem.isPoll) setActivePollModalTournament(tItem);
            }}
            className={`p-4 border-b border-slate-100 flex flex-col gap-1.5 relative ${
              tItem.isPoll ? "cursor-pointer hover:bg-slate-50/70 transition-colors" : ""
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <h3
                className="text-sm font-black md:font-black uppercase text-[var(--color-primary)] line-clamp-2 leading-tight overflow-hidden text-ellipsis flex-1"
                title={tItem.title}
              >
                {tItem.title}
              </h3>
              {highlightEventId === tItem.id && (
                <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full select-none shrink-0">
                  {t("tournaments.selected")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tItem.isPoll && tItem.pollStatus !== "finalized" ? (
                <>
                  <span className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal">
                    <i className="fa-solid fa-square-poll-vertical text-slate-400"></i>
                    {(() => {
                      const count = tItem.proposedDates?.length || 0;
                      const label = count === 1
                        ? t("tournaments.pollDateCountSingular", "Terminvorschlag")
                        : t("tournaments.pollDatesCount", "Terminvorschläge");
                      return `${count} ${label}`;
                    })()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal">
                    <i className="fa-solid fa-users text-slate-400"></i>
                    {(() => {
                      const count = Object.values(tItem.pollVotes || {}).filter((v) => {
                        const s = (v.userName || v.userId || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                        return s !== "systemadmin" && s !== "superadmin";
                      }).length;
                      const label = count === 1
                        ? t("tournaments.pollVoteCountSingular", "Stimme")
                        : t("tournaments.pollVotesCount", "Stimmen");
                      return `${count} ${label}`;
                    })()}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal">
                    <i className="fa-regular fa-calendar text-slate-400"></i>
                    {formattedDateStr}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal">
                    <i className="fa-regular fa-clock text-slate-400"></i>
                    {formattedTimeStr}
                  </span>
                  {tItem.isPoll && tItem.pollStatus === "finalized" && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-normal">
                      <i className="fa-solid fa-check-circle text-emerald-600"></i>
                      {t("tournaments.pollFinalizedBadge", "Termin fixiert")}
                    </span>
                  )}
                  {(tItem.registrationStart || tItem.registrationEnd) && (
                    <span
                      className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal"
                      title={`${t("tournaments.regFrom")} ${tItem.registrationStart ? formatShortDate(tItem.registrationStart) : ""} ${tItem.registrationEnd ? `${t("tournaments.regUntilShort")} ${formatShortDate(tItem.registrationEnd)}` : ""}`}
                    >
                      <i className="fa-regular fa-calendar-check text-slate-400"></i>
                      {tItem.registrationStart && `${t("tournaments.regFrom")} ${formatShortDate(tItem.registrationStart)}`}
                      {tItem.registrationStart && tItem.registrationEnd && " "}
                      {tItem.registrationEnd && `${t("tournaments.regUntilShort")} ${formatShortDate(tItem.registrationEnd)}`}
                    </span>
                  )}
                  {(tItem.deregistrationStart || tItem.deregistrationEnd) && (
                    <span
                      className="inline-flex items-center gap-1.5 bg-slate-100/80 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded-md text-[10px] font-normal"
                      title={`${t("tournaments.deregFrom")} ${tItem.deregistrationStart ? formatShortDate(tItem.deregistrationStart) : ""} ${tItem.deregistrationEnd ? `${t("tournaments.regUntilShort")} ${formatShortDate(tItem.deregistrationEnd)}` : ""}`}
                    >
                      <i className="fa-regular fa-calendar-xmark text-slate-400"></i>
                      {tItem.deregistrationStart && `${t("tournaments.deregFrom")} ${formatShortDate(tItem.deregistrationStart)}`}
                      {tItem.deregistrationStart && tItem.deregistrationEnd && " "}
                      {tItem.deregistrationEnd && `${t("tournaments.regUntilShort")} ${formatShortDate(tItem.deregistrationEnd)}`}
                    </span>
                  )}
                  {tItem.isRegistrationBlocked && (
                    <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-md text-[10px] font-normal">
                      <i className="fa-solid fa-lock text-red-400"></i>
                      {t("tournaments.blocked")}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col gap-4">
            <div className="relative mb-auto flex flex-col">
              {(() => {
                const descriptionText =
                  tItem.description || t("tournaments.noDescription");
                const hasMore =
                  tItem.description &&
                  (tItem.description.length > 115 || tItem.description.includes("\n"));

                let teaser = descriptionText;
                let rest = "";

                if (hasMore) {
                  let splitIdx = 115;
                  const firstNewline = descriptionText.indexOf("\n");
                  if (firstNewline !== -1 && firstNewline < 115) {
                    splitIdx = firstNewline;
                  } else {
                    const nextSpace = descriptionText.indexOf(" ", 115);
                    if (nextSpace !== -1 && nextSpace - 115 < 20) {
                      splitIdx = nextSpace;
                    }
                  }
                  teaser = descriptionText.slice(0, splitIdx);
                  rest = descriptionText.slice(splitIdx);
                }

                return (
                  <div className="text-slate-600 text-xs font-medium leading-relaxed">
                    <p className="inline">
                      {teaser}
                      {!expandedMobile[tItem.id] && hasMore ? "..." : ""}
                    </p>
                    {hasMore && (
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out overflow-hidden
                                ${
                                  expandedMobile[tItem.id]
                                    ? "grid-rows-[1fr] opacity-100 mt-1.5"
                                    : "grid-rows-[0fr] opacity-0"
                                }`}
                      >
                        <div className="min-h-0">
                          <p className="whitespace-pre-wrap">{rest}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {tItem.description &&
                (tItem.description.length > 115 ||
                  tItem.description.includes("\n")) && (
                  <button
                    onClick={() => {
                      setExpandedMobile((prev) => ({
                        ...prev,
                        [tItem.id]: !prev[tItem.id],
                      }));
                    }}
                    className="text-[var(--color-accent)] hover:text-[color-mix(in srgb, var(--color-accent) 80%, black)] text-[10px] font-black uppercase tracking-wider mt-1.5 focus:outline-none flex items-center gap-1.5 active:scale-95 transition-transform self-start"
                  >
                    {expandedMobile[tItem.id] ? (
                      <>
                        <i className="fa-solid fa-chevron-up"></i> {t("tournaments.showLess")}
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-chevron-down"></i> {t("tournaments.showMore")}
                      </>
                    )}
                  </button>
                )}
            </div>



            {(!tItem.isPoll || tItem.pollStatus === "finalized") && (
              <>
                <div className="pt-2.5 border-t border-slate-100 flex flex-col">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedParticipants((prev) => ({
                        ...prev,
                        [tItem.id]: !prev[tItem.id],
                      }))
                    }
                    className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-100/70 transition-all group cursor-pointer text-left select-none"
                    aria-expanded={!!expandedParticipants[tItem.id]}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="w-3.5 h-3.5 text-slate-400 group-hover:text-[var(--color-primary)] transition-colors shrink-0" />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                        {t("tournaments.participants")} ({tItem.participants?.length || 0}
                        {tItem.maxParticipants && tItem.maxParticipants > 0 ? ` / ${tItem.maxParticipants}` : ""})
                      </span>
                      {tItem.maxParticipants && tItem.maxParticipants > 0 && (
                        <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full border border-slate-200 font-medium shrink-0">
                          {t("tournaments.maxParticipantsBadge")} {tItem.maxParticipants}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400 group-hover:text-slate-600 shrink-0 ml-1">
                      <span>
                        {expandedParticipants[tItem.id]
                          ? t("tournaments.hideList", "Ausblenden")
                          : t("tournaments.showList", "Anzeigen")}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          expandedParticipants[tItem.id] ? "rotate-180 text-[var(--color-primary)]" : ""
                        }`}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedParticipants[tItem.id] && (
                      <motion.div
                        key="participants-list"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col max-h-48 overflow-y-auto pr-1 scrollbar-thin pt-2 pb-0.5">
                          {tItem.participants &&
                            tItem.participants.map((p, idx) => {
                              const comment = (tItem as any).registrationComments?.[p];
                              const playerDisplayName = getUserDisplayName(p);
                              return (
                                <div
                                  key={idx}
                                  className="py-1.5 px-2.5 rounded border border-slate-100 bg-slate-50/70 text-xs flex flex-col gap-0.5 mb-1.5 last:mb-0"
                                >
                                  <div className="flex justify-between items-center gap-2">
                                    <span className="font-medium text-slate-800 truncate" title={playerDisplayName}>
                                      {playerDisplayName}
                                    </span>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => onToggleRegistration(tItem.id, p)}
                                        className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                                        title={t("tournaments.deregisterParticipant")}
                                        aria-label={t("tournaments.deregisterParticipant")}
                                      >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                      </button>
                                    )}
                                  </div>
                                  {comment && (
                                    <p className="text-[10px] text-slate-500 italic truncate pl-0.5">
                                      "{comment}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          {(!tItem.participants || tItem.participants.length === 0) && (
                            <span className="text-slate-400 text-[10px] font-bold italic py-1 block">
                              {t("tournaments.noParticipantsYet")}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {(() => {
                  const todayStr = new Date().toISOString().split("T")[0];
                  const isBeforeRegStart = !!tItem.registrationStart && todayStr < (tItem.registrationStart.includes("T") ? tItem.registrationStart.split("T")[0] : tItem.registrationStart);
                  const isAfterRegEnd = !!tItem.registrationEnd && todayStr > (tItem.registrationEnd.includes("T") ? tItem.registrationEnd.split("T")[0] : tItem.registrationEnd);
                  const isRegPeriodOpen = !isBeforeRegStart && !isAfterRegEnd;

                  const isFull =
                    tItem.maxParticipants &&
                    tItem.maxParticipants > 0 &&
                    (tItem.participants?.length || 0) >= tItem.maxParticipants;

                  const showCommentField =
                    tItem.allowComment &&
                    !isRegistered &&
                    (isAdmin || (isRegPeriodOpen && !tItem.isRegistrationBlocked && !isFull));

                  if (!showCommentField) return null;

                  return (
                    <div className="mt-3 space-y-1">
                      <label className="block text-[9px] font-black text-slate-400 uppercase">
                        {t("tournaments.optionalComment")}
                      </label>
                      <input 
                        type="text"
                        placeholder={t("tournaments.commentPlaceholder")}
                        value={commentInputs[tItem.id] || ""}
                        onChange={(e) =>
                          setCommentInputs({
                            ...commentInputs,
                            [tItem.id]: e.target.value,
                          })
                        }
                        className="w-full px-2.5 border-2 border-slate-200 rounded-xl text-xs outline-none bg-white focus:border-[var(--color-primary)] py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2.5 pb-6 shrink-0 mt-auto">
            {tItem.isPoll && tItem.pollStatus !== "finalized" ? (
              (() => {
                const userVote = tItem.pollVotes?.[currentUser.name];
                const hasVoted = !!userVote && Object.keys(userVote.votes || {}).length > 0;
                return (
                  <button
                    onClick={() => setActivePollModalTournament(tItem)}
                    className="w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-md flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white hover:bg-[color-mix(in srgb, var(--color-primary) 80%, black)] active:scale-95 cursor-pointer"
                  >
                    <i className={`fa-solid ${hasVoted ? "fa-clipboard-check" : "fa-square-poll-vertical"}`}></i>
                    {hasVoted ? t("tournaments.editVote", "Meine Stimme bearbeiten") : t("tournaments.voteNow", "Jetzt abstimmen")}
                  </button>
                );
              })()
            ) : (
              (() => {
                const todayStr = new Date().toISOString().split("T")[0];
                const isBeforeRegStart = !!tItem.registrationStart && todayStr < (tItem.registrationStart.includes("T") ? tItem.registrationStart.split("T")[0] : tItem.registrationStart);
                const isAfterRegEnd = !!tItem.registrationEnd && todayStr > (tItem.registrationEnd.includes("T") ? tItem.registrationEnd.split("T")[0] : tItem.registrationEnd);

                const isBeforeDeregStart = !!tItem.deregistrationStart && todayStr < (tItem.deregistrationStart.includes("T") ? tItem.deregistrationStart.split("T")[0] : tItem.deregistrationStart);
                const isAfterDeregEnd = !!tItem.deregistrationEnd && todayStr > (tItem.deregistrationEnd.includes("T") ? tItem.deregistrationEnd.split("T")[0] : tItem.deregistrationEnd);

                const isFull =
                  tItem.maxParticipants &&
                  tItem.maxParticipants > 0 &&
                  (tItem.participants?.length || 0) >= tItem.maxParticipants;

                let btnText = isRegistered ? t("tournaments.unregister") : t("tournaments.register");
                let btnIcon = isRegistered ? "fa-user-minus" : "fa-user-plus";
                let isActionDisabled = false;

                if (!isAdmin) {
                  if (!isRegistered) {
                    if (isBeforeRegStart) {
                      btnText = `${t("tournaments.regFrom")} ${formatShortDate(tItem.registrationStart)}`;
                      btnIcon = "fa-clock";
                      isActionDisabled = true;
                    } else if (isAfterRegEnd) {
                      btnText = t("tournaments.regClosed");
                      btnIcon = "fa-calendar-xmark";
                      isActionDisabled = true;
                    } else if (tItem.isRegistrationBlocked) {
                      btnText = t("tournaments.regBlocked");
                      btnIcon = "fa-lock";
                      isActionDisabled = true;
                    } else if (isFull) {
                      btnText = t("tournaments.fullyBooked");
                      btnIcon = "fa-user-slash";
                      isActionDisabled = true;
                    }
                  } else {
                    if (isBeforeDeregStart) {
                      btnText = `${t("tournaments.deregFrom")} ${formatShortDate(tItem.deregistrationStart)}`;
                      btnIcon = "fa-clock";
                      isActionDisabled = true;
                    } else if (isAfterDeregEnd) {
                      btnText = t("tournaments.deregClosed");
                      btnIcon = "fa-calendar-xmark";
                      isActionDisabled = true;
                    }
                  }
                }

                return (
                  <button
                    disabled={isActionDisabled}
                    onClick={() => {
                      if (isActionDisabled) return;
                      onToggleRegistration(
                        tItem.id,
                        undefined,
                        commentInputs[tItem.id],
                      );
                      if (!isRegistered) {
                        setCommentInputs({ ...commentInputs, [tItem.id]: "" });
                      }
                    }}
                    className={`w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-md flex items-center justify-center gap-2 ${
                      isActionDisabled
                        ? "bg-slate-150 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                        : isRegistered
                          ? "bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 cursor-pointer"
                          : "bg-[var(--color-primary)] text-white hover:bg-[color-mix(in srgb, var(--color-primary) 80%, black)] active:scale-95 cursor-pointer"
                    }`}
                  >
                    <i className={`fa-solid ${btnIcon}`}></i>
                    {btnText}
                  </button>
                );
              })()
            )}

            {isAdmin && !isTrashView && (
              <div className="flex gap-1.5 w-full opacity-70 hover:opacity-100 transition-opacity pt-1 border-t border-slate-200/60">
                {tItem.isPoll && (
                  <button
                    onClick={() => setActivePollModalTournament(tItem)}
                    className="flex-1 p-2 border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors font-bold uppercase text-[9px] flex items-center justify-center gap-1.5"
                    title={t("tournaments.openPollMatrix", "Umfrage & Abstimmungs-Matrix öffnen")}
                  >
                    <i className="fa-solid fa-square-poll-vertical hidden sm:inline-block"></i>{" "}
                    {t("tournaments.poll", "Umfrage")}
                  </button>
                )}
                <button
                  onClick={() => handleOpenAudit(tItem.id)}
                  className="flex-1 p-2 border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors font-bold uppercase text-[9px] flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-list-check hidden sm:inline-block"></i>{" "}
                  {t("tournaments.audit", "Audit")}
                </button>
                <button
                  onClick={() => handleOpenSlider(tItem)}
                  className="flex-1 px-3 border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white rounded-lg transition-colors font-bold uppercase text-[9px] flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-pen hidden sm:inline-block"></i>{" "}
                  {t("common.edit", "Edit")}
                </button>
                <button
                  onClick={() => {
                    if (onUpdateTournament) {
                      onUpdateTournament(tItem.id, {
                        deletedAt: new Date().toISOString(),
                      });
                    }
                  }}
                  className="flex-1 p-2 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg transition-colors font-bold uppercase text-[9px] flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-trash-can hidden sm:inline-block"></i>{" "}
                  {t("common.delete", "Del")}
                </button>
              </div>
            )}
            {isAdmin && isTrashView && (
              <button
                onClick={() => {
                  if (onUpdateTournament) {
                    onUpdateTournament(tItem.id, { deletedAt: null as any });
                  }
                }}
                className="w-full py-2 bg-[var(--color-primary)] text-white hover:bg-[color-mix(in srgb, var(--color-primary) 80%, black)] rounded-lg transition-colors font-bold uppercase text-[9px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className="fa-solid fa-trash-arrow-up"></i>{" "}
                {t("tournaments.restore")}
              </button>
            )}
          </div>
        </div>
      );
    });

    if (isAdmin && isUpcomingView && !isTrashView) {
      renderedEvents.push(
        <button
          key="add-new-event"
          onClick={() => handleOpenSlider()}
          className="bg-white border-2 border-dashed border-slate-300 hover:border-[var(--color-primary)] hover:bg-slate-50 text-slate-500 hover:text-[var(--color-primary)] rounded-[1.5rem] flex flex-col items-center justify-center gap-3 transition-all p-8 md:p-12 min-h-[250px] group cursor-pointer"
        >
          <div className="w-16 h-16 bg-slate-100 group-hover:bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center transition-colors">
            <i className="fa-solid fa-plus text-2xl"></i>
          </div>
          <span className="text-sm font-black uppercase tracking-widest">
            {t("tournaments.newEvent")}
          </span>
        </button>
      );
    }

    return <>{renderedEvents}</>;
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      {/* Slider Drawer via Portal */}
      {isSliderOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
            onClick={handleCloseSlider}
            style={{
              opacity: !isAnimatingIn || isClosing ? 0 : 1,
              transitionDuration: isClosing ? "200ms" : "250ms",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: isClosing ? "none" : "auto",
            }}
          >
            <div
              className="w-[450px] max-w-[100vw] h-[100vh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto"
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
              {/* Drawer Header */}
              <div className="p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden bg-[var(--color-primary)]">
                {/* Background Relief Watermark */}
                <div className="absolute -bottom-10 -right-6 text-white opacity-[0.06] z-0 pointer-events-none transform -rotate-12">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-[140px] h-[140px]"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M5.5 5.5A7.5 7.5 0 0 1 12 12A7.5 7.5 0 0 1 5.5 18.5"></path>
                    <path d="M18.5 5.5A7.5 7.5 0 0 0 12 12A7.5 7.5 0 0 0 18.5 18.5"></path>
                  </svg>
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl font-bold uppercase tracking-tight leading-none mb-1">
                    {editingTournamentId ? t("common.edit") : t("tournaments.newEvent")}
                  </h3>
                  <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                    <i
                      className={`fa-solid ${editingTournamentId ? "fa-pen" : "fa-calendar-plus"} opacity-75`}
                    ></i>
                    {editingTournamentId
                      ? t("tournaments.editEvent")
                      : t("tournaments.createEvent")}
                  </p>
                </div>
                <button
                  onClick={handleCloseSlider}
                  className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium"
                >
                  <i className="fa-solid fa-xmark text-base"></i>
                </button>
              </div>

              {/* Scrollable Form Area */}
              <div
                className="p-5 space-y-5 overflow-y-auto flex-1 bg-white"
                style={{ isolation: "isolate" }}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                      {t("tournaments.eventName")}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text"
                      required
                      value={formData.title || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      className="w-full p-2 border-2 border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs shadow-sm transition-colors text-slate-700 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                      placeholder={t("tournaments.eventNamePlaceholder")}
                    />
                  </div>

                  {/* Termin-Modus: Fester Termin oder Terminumfrage */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                      {t("tournaments.dateMode", "Termin-Modus")}
                    </label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isPoll: false })}
                        className={`py-2 px-3 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          !formData.isPoll
                            ? "bg-white text-[var(--color-primary)] shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <i className="fa-regular fa-calendar-check text-xs"></i>
                        {t("tournaments.fixedDateMode", "Fester Termin")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isPoll: true })}
                        className={`py-2 px-3 rounded-lg text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          formData.isPoll
                            ? "bg-[var(--color-primary)] text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <i className="fa-solid fa-square-poll-vertical text-xs"></i>
                        {t("tournaments.pollMode", "Terminumfrage")}
                      </button>
                    </div>
                  </div>

                  {!formData.isPoll ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                          {t("tournaments.eventDate")}
                        </label>
                        <input 
                          type="date"
                          value={formData.date || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, date: e.target.value })
                          }
                          className="w-full p-2 border-2 border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs shadow-sm transition-colors text-slate-700 uppercase font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                        />
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 shrink-0 shadow-sm">
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                            {t("tournaments.startTime")}
                          </label>
                          <input 
                            type="time"
                            value={formData.startTime || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                startTime: e.target.value,
                              })
                            }
                            className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                            {t("tournaments.endTime")}
                          </label>
                          <input 
                            type="time"
                            value={formData.endTime || ""}
                            onChange={(e) =>
                              setFormData({ ...formData, endTime: e.target.value })
                            }
                            className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                            <i className="fa-solid fa-calendar-days text-amber-600"></i>
                            {t("tournaments.pollOptionsTitle", "Terminvorschläge für Umfrage")}
                          </h4>
                          <p className="text-[10px] text-amber-700 font-medium">
                            {t("tournaments.pollOptionsSubtitle", "Optionen, über die Teilnehmer abstimmen können")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newDates = [
                              ...formData.proposedDates,
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                date: "",
                                startTime: "18:00",
                                endTime: "20:00",
                              },
                            ];
                            setFormData({ ...formData, proposedDates: newDates });
                          }}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-plus text-[9px]"></i> {t("tournaments.addOption", "Option")}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {formData.proposedDates.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="p-2.5 bg-white rounded-lg border border-amber-200/80 shadow-xs flex items-center gap-2"
                          >
                            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-black text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="date"
                              required={formData.isPoll}
                              value={item.date || ""}
                              onChange={(e) => {
                                const updated = [...formData.proposedDates];
                                updated[idx] = { ...updated[idx], date: e.target.value };
                                setFormData({ ...formData, proposedDates: updated });
                              }}
                              className="flex-1 p-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-[var(--color-primary)] font-sans font-medium text-slate-700 uppercase"
                            />
                            <input
                              type="time"
                              value={item.startTime || ""}
                              onChange={(e) => {
                                const updated = [...formData.proposedDates];
                                updated[idx] = { ...updated[idx], startTime: e.target.value };
                                setFormData({ ...formData, proposedDates: updated });
                              }}
                              className="w-20 p-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-[var(--color-primary)] font-sans font-medium text-slate-700"
                            />
                            <span className="text-slate-400 text-xs">-</span>
                            <input
                              type="time"
                              value={item.endTime || ""}
                              onChange={(e) => {
                                const updated = [...formData.proposedDates];
                                updated[idx] = { ...updated[idx], endTime: e.target.value };
                                setFormData({ ...formData, proposedDates: updated });
                              }}
                              className="w-20 p-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-[var(--color-primary)] font-sans font-medium text-slate-700"
                            />
                            {formData.proposedDates.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = formData.proposedDates.filter((_, i) => i !== idx);
                                  setFormData({ ...formData, proposedDates: updated });
                                }}
                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                                title={t("common.delete", "Löschen")}
                              >
                                <i className="fa-solid fa-trash-can text-xs"></i>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Option: Allow "Unsicher" */}
                      <div className="pt-2 border-t border-amber-200/60 flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="allowMaybe"
                          checked={!!formData.allowMaybe}
                          onChange={(e) =>
                            setFormData({ ...formData, allowMaybe: e.target.checked })
                          }
                          className="mt-0.5 w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                        />
                        <label htmlFor="allowMaybe" className="text-xs font-semibold text-slate-700 cursor-pointer">
                          {t("tournaments.allowMaybeOption", "Option „Unsicher / Wenn nötig“ (?) für Teilnehmer erlauben")}
                          <span className="block text-[10px] text-slate-500 font-normal">
                            {t("tournaments.allowMaybeOptionDesc", "Wenn aktiv, können Teilnehmer mit Ja, Nein oder Unsicher abstimmen. Sonst nur Ja/Nein.")}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Anmelde- & Abmeldefristen (Optional) - in einer gemeinsamen Karte */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3 shrink-0 shadow-sm">
                    {/* Reihe 1: Anmeldefristen */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {t("tournaments.regFrom")}
                        </label>
                        <input 
                          type="date"
                          value={formData.registrationStart || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              registrationStart: e.target.value,
                            })
                          }
                          className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium uppercase text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {t("tournaments.regTo")}
                        </label>
                        <input 
                          type="date"
                          value={formData.registrationEnd || ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              registrationEnd: e.target.value,
                            })
                          }
                          className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium uppercase text-slate-700"
                        />
                      </div>
                    </div>

                    {/* Trennlinie */}
                    <div className="border-t border-slate-200/80 pt-2.5">
                      {/* Reihe 2: Abmeldefristen */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                            {t("tournaments.deregFrom")}
                          </label>
                          <input 
                            type="date"
                            value={formData.deregistrationStart || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                deregistrationStart: e.target.value,
                              })
                            }
                            className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium uppercase text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                            {t("tournaments.deregTo")}
                          </label>
                          <input 
                            type="date"
                            value={formData.deregistrationEnd || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                deregistrationEnd: e.target.value,
                              })
                            }
                            className="w-full h-8 px-3 py-1 border-2 border-slate-300 rounded-lg bg-white text-sm outline-none focus:border-[var(--color-primary)] transition-colors placeholder:font-normal placeholder:text-slate-400 font-sans font-medium uppercase text-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                      {t("tournaments.description")}
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      className="w-full p-3 border-2 border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs shadow-sm transition-colors h-24 resize-none text-slate-700 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                      placeholder={t("tournaments.descriptionPlaceholder")}
                    />
                  </div>
                </div>

                {/* Advanced options */}
                <div className="pt-4 border-t border-slate-200">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-3">
                    {t("tournaments.archivingHeader")}
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200 overflow-hidden shadow-sm">
                        <label className="flex items-center gap-3 text-[12px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100/70 p-3 transition-colors">
                          <input
                            type="radio"
                            checked={!formData.hideExpired}
                            onChange={() =>
                              setFormData({ ...formData, hideExpired: false })
                            }
                            className="w-4 h-4 accent-slate-800 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>
                            {t("tournaments.archiveToPast")}
                          </span>
                        </label>
                        <label className="flex items-center gap-3 text-[12px] font-bold text-slate-700 cursor-pointer hover:bg-slate-100/70 p-3 transition-colors">
                          <input
                            type="radio"
                            checked={formData.hideExpired}
                            onChange={() =>
                              setFormData({ ...formData, hideExpired: true })
                            }
                            className="w-4 h-4 accent-slate-800 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>{t("tournaments.archiveHide")}</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-3 mt-5 border-t border-slate-200 pt-5">
                    {t("tournaments.allowCommentHeader")}
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            checked={formData.allowComment}
                            onChange={() =>
                              setFormData({ ...formData, allowComment: true })
                            }
                            className="w-4 h-4 accent-slate-800 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>{t("common.yes")}</span>
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            checked={!formData.allowComment}
                            onChange={() =>
                              setFormData({ ...formData, allowComment: false })
                            }
                            className="w-4 h-4 accent-slate-800 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>{t("common.no")}</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 mt-4">
                        {t("tournaments.maxParticipantsLabel")}
                      </label>
                      <input 
                        type="number"
                        min="1"
                        placeholder={t("tournaments.noLimit")}
                        value={formData.maxParticipants}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxParticipants: e.target.value,
                          })
                        }
                        className="w-full p-2 border-2 border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:border-[var(--color-primary)] outline-none text-xs shadow-sm transition-colors font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-200 mt-4">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-3">
                        {t("tournaments.blockRegistrationsHeader")}
                      </h4>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            checked={formData.isRegistrationBlocked}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                isRegistrationBlocked: true,
                              })
                            }
                            className="w-4 h-4 accent-red-500 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>{t("tournaments.blocked")}</span>
                        </label>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            checked={!formData.isRegistrationBlocked}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                isRegistrationBlocked: false,
                              })
                            }
                            className="w-4 h-4 accent-[var(--color-primary)] font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                          />
                          <span>{t("tournaments.open")}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons at the end of the scroll container */}
                <div className="pt-5 border-t border-slate-200 pb-5">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full text-white rounded-xl shadow-md transition-transform active:scale-95 uppercase tracking-widest flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[color-mix(in srgb, var(--color-primary) 80%, black)] animate-none font-sans py-2.5 text-sm font-semibold"
                  >
                    <i
                      className={`fa-solid ${editingTournamentId ? "fa-floppy-disk" : "fa-check"} text-[12px]`}
                    ></i>
                    {editingTournamentId ? t("tournaments.saveEvent") : t("tournaments.createEvent")}
                  </button>

                  {editingTournamentId && isAdmin && (
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="w-full mt-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-wider font-sans bg-white shadow-sm py-2.5 text-sm font-medium"
                    >
                      <i className={`fa-solid ${copied ? "fa-circle-check text-green-600" : "fa-link"} text-[11px]`}></i>
                      {copied ? t("tournaments.copied") : t("tournaments.copyLink")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="flex flex-col gap-3.5 sm:gap-4 w-full">
        {/* 1. TOP HEADER (LIGHT MODE - IDENTISCH ZU RANGLISTE) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)] shrink-0">
                <PartyPopper className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">
                    {t("tournaments.title")}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 font-medium tracking-wide mt-1">
                  {t("tournaments.subtitle")}
                </p>
              </div>
            </div>


          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 items-stretch">
          {renderEventList(upcomingTournaments, false, true)}
        </div>

        {pastTournaments.length > 0 && (
          <div className="space-y-3.5 sm:space-y-4">
            <button
              onClick={() => setShowPastEvents(!showPastEvents)}
              type="button"
              className="w-full bg-slate-50 border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black uppercase tracking-widest text-xs py-4 rounded-2xl flex items-center justify-center gap-3 transition-colors outline-none cursor-pointer"
            >
              <i
                className={`fa-solid fa-chevron-${showPastEvents ? "up" : "down"}`}
              ></i>
              {t("tournaments.past")} ({pastTournaments.length})
            </button>

            {showPastEvents && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                {renderEventList(pastTournaments)}
              </div>
            )}
          </div>
        )}

        {isAdmin && trashTournaments.length > 0 && (
          <div className="space-y-3.5 sm:space-y-4">
            <button
              onClick={() => setShowTrash(!showTrash)}
              type="button"
              className="w-full bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-500 font-black uppercase tracking-widest text-xs py-4 rounded-2xl flex items-center justify-center gap-3 transition-colors outline-none cursor-pointer"
            >
              <i className={`fa-solid fa-trash-can`}></i>
              {t("tournaments.trash")} ({trashTournaments.length}){" "}
              <i
                className={`fa-solid fa-chevron-${showTrash ? "up" : "down"}`}
              ></i>
            </button>

            {showTrash && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                {renderEventList(trashTournaments, true)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit Modal Slider */}
      {auditModalId &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
            onClick={handleCloseAudit}
            style={{
              opacity: !isAuditAnimatingIn || isAuditClosing ? 0 : 1,
              transitionDuration: isAuditClosing ? "200ms" : "250ms",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              pointerEvents: isAuditClosing ? "none" : "auto",
            }}
          >
            <div
              className="w-[450px] max-w-[100vw] h-[100vh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              style={{
                transform:
                  !isAuditAnimatingIn || isAuditClosing
                    ? "translateX(100%)"
                    : "translateX(0)",
                transitionDuration: isAuditClosing ? "200ms" : "250ms",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* Drawer Header */}
              <div className="p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden bg-slate-800">
                {/* Background Relief Watermark */}
                <div className="absolute -bottom-10 -right-6 text-white opacity-[0.06] z-0 pointer-events-none transform -rotate-12">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-[140px] h-[140px]"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M5.5 5.5A7.5 7.5 0 0 1 12 12A7.5 7.5 0 0 1 5.5 18.5"></path>
                    <path d="M18.5 5.5A7.5 7.5 0 0 0 12 12A7.5 7.5 0 0 0 18.5 18.5"></path>
                  </svg>
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl font-bold uppercase tracking-tight leading-none mb-1">
                    {t("tournaments.auditLog")}
                  </h3>
                  <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left opacity-75"></i>{" "}
                    {t("tournaments.auditSubtitle")}
                  </p>
                </div>
                <button
                  onClick={handleCloseAudit}
                  className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium"
                >
                  <i className="fa-solid fa-xmark text-base"></i>
                </button>
              </div>

              <div
                className="p-5 overflow-y-auto flex-1 bg-white space-y-4"
                style={{ isolation: "isolate" }}
              >
                {(() => {
                  const targetTournament = tournaments.find(
                    (t) => t.id === auditModalId,
                  );
                  const logs = targetTournament?.auditLog || [];
                  if (logs.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                        <i className="fa-solid fa-receipt text-3xl opacity-20"></i>
                        <p className="text-sm font-bold uppercase tracking-wider text-center">
                          {t("tournaments.noAuditEntries")}
                        </p>
                      </div>
                    );
                  }
                  return logs.map((log, i) => {
                    const playerDisplayName = getUserDisplayName(log.userName);
                    const hasDifferentActor =
                      log.actorName && log.actorName !== log.userName;
                    const actorDisplayName = hasDifferentActor
                      ? getUserDisplayName(log.actorName!)
                      : null;

                    return (
                      <div
                        key={i}
                        className="flex gap-3 min-h-[52px] px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl items-center shadow-sm font-sans font-medium"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center text-white text-sm shadow-sm ${
                            log.action === "create"
                              ? "bg-blue-500"
                              : log.action === "register"
                                ? "bg-[var(--color-primary)]"
                                : log.action === "unregister"
                                  ? "bg-red-500"
                                  : log.action === "poll_vote"
                                    ? "bg-amber-500"
                                    : log.action === "poll_finalize"
                                      ? "bg-emerald-600"
                                      : log.action === "poll_reopen"
                                        ? "bg-indigo-600"
                                        : "bg-slate-500"
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              log.action === "create"
                                ? "fa-plus"
                                : log.action === "register"
                                  ? "fa-user-plus"
                                  : log.action === "unregister"
                                    ? "fa-user-minus"
                                    : log.action === "poll_vote"
                                      ? "fa-square-poll-vertical"
                                      : log.action === "poll_finalize"
                                        ? "fa-check"
                                        : log.action === "poll_reopen"
                                          ? "fa-arrow-rotate-left"
                                          : "fa-info"
                            } text-xs`}
                          ></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-xs text-slate-700 truncate">
                            {playerDisplayName}
                          </p>
                          {hasDifferentActor && (
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                              <i className="fa-solid fa-user-gear text-[10px] opacity-70"></i>
                              <span>
                                {t("tournaments.byActor")} <strong>{actorDisplayName}</strong>
                              </span>
                            </p>
                          )}
                          {log.details && (
                            <p className="text-[10px] text-slate-600 font-medium mt-0.5 line-clamp-2">
                              {log.details}
                            </p>
                          )}
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {new Date(log.timestamp).toLocaleString(i18n.language === "en" ? "en-US" : "de-DE")}
                          </p>
                        </div>
                        <div
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${
                            log.action === "create"
                              ? "bg-blue-100 text-blue-600"
                              : log.action === "register"
                                ? "bg-green-100 text-green-700"
                                : log.action === "unregister"
                                  ? "bg-red-100 text-red-600"
                                  : log.action === "poll_vote"
                                    ? "bg-amber-100 text-amber-800"
                                    : log.action === "poll_finalize"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : log.action === "poll_reopen"
                                        ? "bg-indigo-100 text-indigo-800"
                                        : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {log.action === "create"
                            ? t("tournaments.actionCreated")
                            : log.action === "register"
                              ? hasDifferentActor
                                ? t("tournaments.actionAdded")
                                : t("tournaments.actionRegistered")
                              : log.action === "unregister"
                                ? hasDifferentActor
                                  ? t("tournaments.actionRemoved")
                                  : t("tournaments.actionUnregistered")
                                : log.action === "poll_vote"
                                  ? t("tournaments.actionVoted", "Abgestimmt")
                                  : log.action === "poll_finalize"
                                    ? t("tournaments.actionFinalized", "Termin fixiert")
                                    : log.action === "poll_reopen"
                                      ? t("tournaments.actionReopened", "Wiedereröffnet")
                                      : log.action}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Tournament Poll Modal */}
      {currentActivePollTournament && (
        <TournamentPollModal
          tournament={currentActivePollTournament}
          currentUser={currentUser}
          isAdmin={isAdmin}
          users={users}
          onClose={() => setActivePollModalTournament(null)}
          onVote={handleVotePoll}
          onFinalizeDate={handleFinalizeDate}
          onReopenPoll={handleReopenPoll}
        />
      )}
    </div>
  );
};

export default Tournaments;
