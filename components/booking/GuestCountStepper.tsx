import React from "react";

export interface GuestCountStepperProps {
  value: number;
  onChange: (newValue: number) => void;
  label: string;
  icon?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

export const GuestCountStepper: React.FC<GuestCountStepperProps> = ({
  value,
  onChange,
  label,
  icon,
  min = 0,
  max = 4,
  disabled = false,
  className = "",
}) => {
  const isMaxReached = value >= max;
  const isMinReached = value <= min;
  const isSelected = value > 0;

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isMinReached) return;
    onChange(Math.max(min, value - 1));
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isMaxReached) return;
    onChange(Math.min(max, value + 1));
  };

  return (
    <div
      className={`flex items-center justify-between h-8 px-2.5 rounded-lg border transition-all select-none ${
        disabled
          ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
          : isSelected
          ? "bg-emerald-50/80 border-emerald-300 shadow-2xs"
          : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70"
      } ${className}`}
    >
      {/* Label & Icon */}
      <div className="min-w-0 flex items-center gap-1.5 pr-2">
        {icon && (
          <i
            className={`${icon} text-[11px] shrink-0 ${
              isSelected ? "text-emerald-700" : "text-slate-400"
            }`}
          />
        )}
        <span
          className={`text-xs block truncate ${
            isSelected
              ? "text-emerald-950 font-bold"
              : "text-slate-700 font-semibold"
          }`}
        >
          {label}
        </span>
      </div>

      {/* Stepper Controls: [ - ]  [ count ]  [ + ] */}
      <div className="shrink-0 flex items-center gap-1 pl-2">
        <button
          type="button"
          disabled={disabled || isMinReached}
          onClick={handleDecrement}
          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none transition-all shadow-2xs"
          aria-label={`${label} verringern`}
        >
          <i className="fa-solid fa-minus text-[9px]"></i>
        </button>

        <span
          className={`w-6 text-center font-bold text-xs select-none ${
            isSelected ? "text-emerald-800" : "text-slate-700"
          }`}
        >
          {value}
        </span>

        <button
          type="button"
          disabled={disabled || isMaxReached}
          onClick={handleIncrement}
          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-xs disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none transition-all shadow-2xs"
          aria-label={`${label} erhöhen`}
        >
          <i className="fa-solid fa-plus text-[9px]"></i>
        </button>
      </div>
    </div>
  );
};
