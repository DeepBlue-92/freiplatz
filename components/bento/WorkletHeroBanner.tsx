import React from "react";
import { BentoItem } from "../../types";
import { ArrowRight, Sparkles } from "lucide-react";
import { RichTextRenderer } from "../RichText";

interface WorkletHeroBannerProps {
  item: BentoItem;
  primaryColor?: string;
  clubName?: string;
  onNavigateToBooking?: () => void;
  onNavigateToEvents?: () => void;
  onNavigateToChampionship?: () => void;
}

export const WorkletHeroBanner: React.FC<WorkletHeroBannerProps> = ({
  item,
  primaryColor = "#0c3823",
  clubName = "Tennisclub",
  onNavigateToBooking,
  onNavigateToEvents,
  onNavigateToChampionship,
}) => {
  const bgStart = item.bg_color_start || primaryColor || "#0c3823";
  const bgEnd = item.bg_color_end || "#14532d";
  const imageUrl =
    item.image_url ||
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=1600&auto=format&fit=crop";

  const defaultGreeting = (() => {
    const hour = new Date().getHours();
    if (hour < 11) return "GUTEN MORGEN,";
    if (hour < 17) return "GUTEN TAG,";
    return "GUTEN ABEND,";
  })();

  const eyebrow = item.eyebrow?.trim() || defaultGreeting;
  const title = item.title?.trim() || `Willkommen bei der ${clubName}`;
  const content =
    item.content?.trim() ||
    "Hier findest du alle wichtigen Informationen rund um die Tennisabteilung. Entdecke unsere Plätze, Veranstaltungen und aktuellen Ranglisten.";

  const rawLink = item.cta_link?.trim();
  // A link is active if cta_link is set and not explicitly "none" or empty
  const hasLink = Boolean(rawLink && rawLink !== "none" && rawLink !== "");
  const isExternal = Boolean(hasLink && (rawLink?.startsWith("http://") || rawLink?.startsWith("https://")));

  const handleAction = () => {
    if (!hasLink) return;
    if (isExternal && rawLink) {
      window.open(rawLink, "_blank", "noopener,noreferrer");
      return;
    }

    if (rawLink === "tournaments" || rawLink === "events") {
      if (onNavigateToEvents) onNavigateToEvents();
      else if (onNavigateToBooking) onNavigateToBooking();
    } else if (rawLink === "championship" || rawLink === "meisterschaft") {
      if (onNavigateToChampionship) onNavigateToChampionship();
      else if (onNavigateToBooking) onNavigateToBooking();
    } else {
      // Default to booking
      if (onNavigateToBooking) onNavigateToBooking();
    }
  };

  const posX = typeof item.image_position_x === "number" ? item.image_position_x : 50;
  const posY = typeof item.image_position_y === "number" ? item.image_position_y : 50;
  const baseScale = typeof item.image_scale === "number" ? item.image_scale / 100 : 1;

  return (
    <div
      onClick={hasLink ? handleAction : undefined}
      onKeyDown={
        hasLink
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleAction();
              }
            }
          : undefined
      }
      role={hasLink ? "link" : undefined}
      tabIndex={hasLink ? 0 : undefined}
      className={`relative w-full rounded-2xl overflow-hidden shadow-[0_8px_30px_-6px_rgba(0,0,0,0.16),0_2px_8px_-1px_rgba(0,0,0,0.06)] border border-white/20 ring-1 ring-white/10 min-h-[220px] sm:min-h-[250px] lg:min-h-[260px] flex items-stretch select-none transition-all duration-300 ${
        hasLink
          ? "group cursor-pointer hover:shadow-[0_20px_45px_-8px_rgba(0,0,0,0.26),0_0_35px_2px_rgba(16,185,129,0.22)] hover:border-white/35 hover:-translate-y-0.5"
          : "cursor-default hover:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.20)]"
      }`}
    >
      {/* Background Image Layer on the Right */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          style={{
            objectPosition: `${posX}% ${posY}%`,
            transformOrigin: `${posX}% ${posY}%`,
            transform: `scale(${baseScale})`,
          }}
          className="w-full h-full object-cover transition-transform duration-500 ease-out"
        />
        {/* Fallback subtle dark overlay to guarantee contrast on right side */}
        <div className="absolute inset-0 bg-black/15 z-0 pointer-events-none" />
      </div>

      {/* Dynamic Angled Gradient Overlay (Left to Right) */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: `linear-gradient(108deg, ${bgStart}FA 0%, ${bgStart}F0 42%, ${bgEnd}D9 58%, ${bgEnd}80 72%, transparent 100%)`,
        }}
      />

      {/* Content Container (Left Column) */}
      <div className="relative z-20 w-full lg:w-3/5 p-5 sm:p-7 md:p-8 flex flex-col justify-between select-text text-white">
        <div className="space-y-2">
          {eyebrow && (
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-emerald-300 drop-shadow-sm">
              <Sparkles className="w-3 h-3 text-emerald-300" />
              <span>{eyebrow}</span>
            </div>
          )}

          <h2
            className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white leading-tight drop-shadow-sm"
            style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif" }}
          >
            {title}
          </h2>

          <div className="text-xs sm:text-sm text-white/90 leading-relaxed font-normal pt-1 max-w-xl drop-shadow-xs">
            {content.includes("<p>") || content.includes("<") ? (
              <RichTextRenderer text={content} />
            ) : (
              <p className="whitespace-pre-line">{content}</p>
            )}
          </div>
        </div>

        {/* Optional CTA Button */}
        {hasLink && item.cta_text && (
          <div className="pt-4 mt-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[var(--color-primary)] group-hover:bg-slate-100 group-hover:shadow-lg text-xs font-bold transition-all shadow-md active:scale-95 pointer-events-none">
              <span>{item.cta_text}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
