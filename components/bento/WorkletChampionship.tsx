import React, { useState, useEffect, useMemo } from "react";
import { BentoItem, User } from "../../types";
import { TournamentInstance, Match } from "../../types/championship";
import { listenToChampionshipTournaments } from "../../services/championshipService";
import { formatParticipantById } from "../../utils/championshipNameResolver";
import { Trophy, ArrowRight, Medal } from "lucide-react";

interface WorkletChampionshipProps {
  item: BentoItem;
  clubId: string;
  onNavigateToChampionship: () => void;
  users?: Record<string, User>;
}

export const WorkletChampionship: React.FC<WorkletChampionshipProps> = ({
  item,
  clubId,
  onNavigateToChampionship,
  users = {},
}) => {
  const [tournaments, setTournaments] = useState<TournamentInstance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!clubId) return;
    setIsLoading(true);
    const unsubscribe = listenToChampionshipTournaments(clubId, (list) => {
      setTournaments(list || []);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [clubId]);

  // Find most relevant tournament: active first, or newest
  const activeTournament = useMemo(() => {
    if (tournaments.length === 0) return null;
    return (
      tournaments.find((t) => t.status === "in_progress") ||
      tournaments.find((t) => t.status === "completed") ||
      tournaments[0]
    );
  }, [tournaments]);

  // Climax matches (Finale, Kleines Finale or Halbfinale)
  const highlightMatches = useMemo(() => {
    if (!activeTournament || !activeTournament.matches) return [];
    const all = activeTournament.matches;

    // Look for finals first
    const finals = all.filter((m) => {
      const lbl = (m.roundLabel || "").toLowerCase();
      return lbl.includes("finale") || lbl.includes("endspiel") || lbl.includes("platz 3");
    });

    if (finals.length > 0) {
      // Sort so Großes Finale comes first
      return finals
        .sort((a, b) => {
          const aGrand = (a.roundLabel || "").toLowerCase().includes("groß");
          const bGrand = (b.roundLabel || "").toLowerCase().includes("groß");
          if (aGrand && !bGrand) return -1;
          if (!aGrand && bGrand) return 1;
          return 0;
        })
        .slice(0, 2);
    }

    // Otherwise check for Halbfinale
    const semis = all.filter((m) => (m.roundLabel || "").toLowerCase().includes("halb"));
    if (semis.length > 0) return semis.slice(0, 2);

    // Otherwise latest scheduled/completed matches
    return all.slice(0, 2);
  }, [activeTournament]);

  return (
    <div className="flex flex-col justify-between h-auto w-full">
      <div>
        {/* Worklet Header */}
        <div className="pb-3.5 mb-3.5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 tracking-tight truncate">
            {item.title || "Vereinsmeisterschaft"}
          </h3>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <i className="fa-solid fa-spinner fa-spin"></i>
            <span>Lade Meisterschaft...</span>
          </div>
        ) : activeTournament && highlightMatches.length > 0 ? (
          <div className="space-y-3">
            {highlightMatches.map((m: Match) => {
              const p1Name = formatParticipantById(
                m.participant1Id,
                activeTournament.participants,
                users
              );
              const p2Name = formatParticipantById(
                m.participant2Id,
                activeTournament.participants,
                users
              );

              const isCompleted = m.status === "completed" || m.status === "walkover" || !!m.result;
              const isP1Winner = isCompleted && m.result?.winnerParticipantId === m.participant1Id;
              const isP2Winner = isCompleted && m.result?.winnerParticipantId === m.participant2Id;
              const sets = m.result?.sets || [];

              return (
                <div
                  key={m.id}
                  className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-3 flex flex-col gap-2 shadow-2xs"
                >
                  {/* Round Bar */}
                  <div className="flex items-center text-[10px]">
                    <span className="font-black uppercase tracking-wider text-[var(--color-primary)] flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span>{m.roundLabel || "Match"}</span>
                    </span>
                  </div>

                  {/* Players / Pairing Card with Inline Scores */}
                  <div className="space-y-1">
                    {/* Player 1 */}
                    <div
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        isP1Winner
                          ? "bg-white border-emerald-400 font-bold text-slate-900 shadow-2xs"
                          : "bg-white/70 border-slate-200/80 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate mr-2">
                        {isP1Winner && <Medal className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="truncate">{p1Name}</span>
                      </div>

                      {/* Player 1 Sets Score */}
                      {sets.length > 0 ? (
                        <div className="flex items-center gap-1 font-mono shrink-0">
                          {sets.map((s, idx) => (
                            <span
                              key={idx}
                              className={`w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold ${
                                s.player1Games > s.player2Games
                                  ? "bg-emerald-100 text-emerald-800 font-black"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {s.player1Games}
                            </span>
                          ))}
                        </div>
                      ) : m.result?.isWalkover && isP1Winner ? (
                        <span className="text-[10px] font-bold text-emerald-700 uppercase shrink-0">w/o</span>
                      ) : null}
                    </div>

                    {/* Player 2 */}
                    <div
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        isP2Winner
                          ? "bg-white border-emerald-400 font-bold text-slate-900 shadow-2xs"
                          : "bg-white/70 border-slate-200/80 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate mr-2">
                        {isP2Winner && <Medal className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="truncate">{p2Name}</span>
                      </div>

                      {/* Player 2 Sets Score */}
                      {sets.length > 0 ? (
                        <div className="flex items-center gap-1 font-mono shrink-0">
                          {sets.map((s, idx) => (
                            <span
                              key={idx}
                              className={`w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold ${
                                s.player2Games > s.player1Games
                                  ? "bg-emerald-100 text-emerald-800 font-black"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {s.player2Games}
                            </span>
                          ))}
                        </div>
                      ) : m.result?.isWalkover && isP2Winner ? (
                        <span className="text-[10px] font-bold text-emerald-700 uppercase shrink-0">w/o</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 space-y-2 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <Trophy className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold">Aktuell keine aktive Meisterschaft eingeteilt.</p>
          </div>
        )}
      </div>

      {/* Footer Link */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-end">
        <button
          type="button"
          onClick={onNavigateToChampionship}
          className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>Zu den Turnierergebnissen</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
