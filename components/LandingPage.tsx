import React from "react";
import { User, LandingPageConfig, BentoItem, Booking, Tournament } from "../types";
import { RichTextRenderer } from "./RichText";
import { WorkletCourts } from "./bento/WorkletCourts";
import { WorkletEvents } from "./bento/WorkletEvents";
import { WorkletChampionship } from "./bento/WorkletChampionship";
import { WorkletWeather } from "./bento/WorkletWeather";
import { WorkletHeroBanner } from "./bento/WorkletHeroBanner";
import {
  Calendar,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface LandingPageProps {
  config: LandingPageConfig;
  currentUser: User | null;
  onOpenLogin: () => void;
  onNavigateToBooking: () => void;
  onNavigateToWeekPlan?: () => void;
  onSelectSlot?: (court: string, time: string, date: string) => void;
  onNavigateToEvents?: () => void;
  onNavigateToChampionship?: () => void;
  clubName?: string;
  logoUrl?: string;
  onLogin?: (username: string, pass: string) => Promise<boolean | void>;
  loginError?: string | null;
  isLoggingIn?: boolean;
  onOpenTokenSetup?: () => void;
  currentVereinsId?: string;
  courts?: string[];
  bookings?: Booking[];
  tournaments?: Tournament[];
  users?: Record<string, User>;
  onToggleEventRegistration?: (eventId: string, comment?: string) => Promise<void> | void;
  primaryColor?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  config,
  currentUser,
  onOpenLogin,
  onNavigateToBooking,
  onNavigateToWeekPlan,
  onSelectSlot,
  onNavigateToEvents,
  onNavigateToChampionship,
  clubName = "Tennisclub",
  onLogin,
  loginError,
  isLoggingIn = false,
  onOpenTokenSetup,
  currentVereinsId = "",
  courts = ["Platz 1", "Platz 2"],
  bookings = [],
  tournaments = [],
  users = {},
  onToggleEventRegistration,
  primaryColor,
}) => {
  const sortedItems = [...(config.items || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-6 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0 select-text">
      {/* Bento Grid: 3-Tier Responsive with Auto-Packing */}
      {sortedItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 w-full [grid-auto-flow:dense]">
          {sortedItems.map((item) => {
            const colSpanClass =
              item.col_span === 4
                ? "md:col-span-1 lg:col-span-4"
                : item.col_span === 6
                ? "md:col-span-1 lg:col-span-6"
                : item.col_span === 8
                ? "md:col-span-2 lg:col-span-8"
                : "md:col-span-2 lg:col-span-12";

            const isHero = item.type === "hero_banner";
            return (
              <div
                key={item.id}
                className={`col-span-1 ${colSpanClass} ${
                  isHero
                    ? "bg-transparent p-0 border-0 shadow-none"
                    : "bg-white rounded-2xl border border-slate-200/80 ring-1 ring-slate-900/[0.03] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05),0_2px_6px_-1px_rgba(0,0,0,0.02)] hover:shadow-[0_16px_36px_-6px_rgba(0,0,0,0.09),0_0_24px_-2px_rgba(16,185,129,0.12)] hover:border-slate-300/90 hover:-translate-y-0.5 transition-all duration-300 p-5 sm:p-6 lg:p-7 flex flex-col justify-between"
                } min-w-0`}
              >
                {item.type === "hero_banner" ? (
                  <WorkletHeroBanner
                    item={item}
                    primaryColor={primaryColor}
                    clubName={clubName}
                    onNavigateToBooking={onNavigateToBooking}
                    onNavigateToEvents={onNavigateToEvents}
                    onNavigateToChampionship={onNavigateToChampionship}
                  />
                ) : item.type === "worklet_courts" ? (
                  <WorkletCourts
                    item={item}
                    courts={courts}
                    bookings={bookings}
                    onNavigateToBooking={onNavigateToBooking}
                    onNavigateToWeekPlan={onNavigateToWeekPlan}
                    onSelectSlot={onSelectSlot}
                    primaryColor={primaryColor}
                  />
                ) : item.type === "worklet_events" ? (
                  <WorkletEvents
                    item={item}
                    tournaments={tournaments}
                    currentUser={currentUser}
                    onOpenLogin={onOpenLogin}
                    onNavigateToEvents={onNavigateToEvents || onNavigateToBooking}
                    onToggleEventRegistration={onToggleEventRegistration}
                  />
                ) : item.type === "worklet_championship" ? (
                  <WorkletChampionship
                    item={item}
                    clubId={currentVereinsId}
                    users={users}
                    onNavigateToChampionship={onNavigateToChampionship || onNavigateToBooking}
                  />
                ) : item.type === "worklet_weather" ? (
                  <WorkletWeather
                    item={item}
                    clubCity={clubName}
                  />
                ) : (
                  <div className="flex flex-col flex-grow justify-between">
                    <div>
                      {item.title && (
                        <div className="pb-3 mb-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight truncate">
                              {item.title}
                            </h3>
                          </div>
                        </div>
                      )}

                      {/* Optional Image for rich_text with custom focal point & scale */}
                      {item.image_url && (
                        <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden mb-3.5 bg-slate-100 border border-slate-200/80 shadow-2xs">
                          <img
                            src={item.image_url}
                            alt={item.title || "Grafik"}
                            style={{
                              objectPosition: `${item.image_position_x ?? 50}% ${item.image_position_y ?? 50}%`,
                              transform: `scale(${(item.image_scale ?? 100) / 100})`,
                            }}
                            className="w-full h-full object-cover transition-transform duration-300"
                          />
                        </div>
                      )}

                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 sm:p-4 text-sm text-slate-600 leading-relaxed font-normal break-words shadow-2xs">
                        <RichTextRenderer text={item.content || ""} />
                      </div>
                    </div>

                    {/* Action Button & Link (if configured) */}
                    {item.cta_text && item.cta_link && item.cta_link !== "none" ? (
                      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-end">
                        {item.cta_link.startsWith("http://") || item.cta_link.startsWith("https://") ? (
                          <a
                            href={item.cta_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                          >
                            <span>{item.cta_text}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (item.cta_link === "tournaments" || item.cta_link === "events") {
                                if (onNavigateToEvents) onNavigateToEvents();
                                else if (onNavigateToBooking) onNavigateToBooking();
                              } else if (item.cta_link === "championship" || item.cta_link === "meisterschaft") {
                                if (onNavigateToChampionship) onNavigateToChampionship();
                                else if (onNavigateToBooking) onNavigateToBooking();
                              } else {
                                if (onNavigateToBooking) onNavigateToBooking();
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-primary)] hover:brightness-110 text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                          >
                            <span>{item.cta_text}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : currentUser && item.col_span >= 8 ? (
                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={onNavigateToBooking}
                          className="text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1.5 cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Zur Platzübersicht</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center text-slate-400">
          <p className="text-sm font-semibold">Aktuell sind keine Kacheln für die Startseite konfiguriert.</p>
        </div>
      )}
    </div>
  );
};
