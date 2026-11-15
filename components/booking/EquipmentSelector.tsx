import React from "react";
import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EquipmentResource } from "../../types";

export interface EquipmentSelectorProps {
  resources: EquipmentResource[];
  selectedResourceIds: string[];
  onChange: (resourceIds: string[]) => void;
  bookedResourceIds?: string[];
  disabled?: boolean;
  className?: string;
}

export const EquipmentSelector: React.FC<EquipmentSelectorProps> = ({
  resources,
  selectedResourceIds,
  onChange,
  bookedResourceIds = [],
  disabled = false,
  className = "",
}) => {
  const { t } = useTranslation();

  if (!resources || resources.length === 0) {
    return null;
  }

  const handleToggle = (resourceId: string, isBooked: boolean) => {
    if (disabled || isBooked) return;
    if (selectedResourceIds.includes(resourceId)) {
      onChange(selectedResourceIds.filter((id) => id !== resourceId));
    } else {
      onChange([...selectedResourceIds, resourceId]);
    }
  };

  return (
    <div className={`equipment-selection-container ${className}`}>
      {/* 1. UI-Update & Einheitliche Überschrift */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <i className="fa-solid fa-box-open text-slate-400 text-xs shrink-0"></i>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t("equipment.title", "Ausrüstung")}
          </span>
        </div>
      </div>

      {/* 2. Dynamische Liste mit minimalistischen Tailwind-Toggles (exakt h-8 wie die Spielzeiten) */}
      <div className="space-y-1.5">
        {resources.map((resource) => {
          const isSelected = selectedResourceIds.includes(resource.id);
          const isBooked = bookedResourceIds.includes(resource.id);
          const isDisabled = disabled || isBooked;

          return (
            <div
              key={resource.id}
              onClick={() => handleToggle(resource.id, isBooked)}
              className={`group flex items-center justify-between h-8 px-2.5 rounded-lg border transition-all select-none ${
                isBooked
                  ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                  : isDisabled
                  ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                  : isSelected
                  ? "bg-emerald-50/80 border-emerald-300 shadow-xs cursor-pointer hover:bg-emerald-50"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 cursor-pointer"
              }`}
            >
              <div className="min-w-0 flex items-center gap-1.5 pr-2">
                <span
                  className={`text-xs block truncate ${
                    isSelected
                      ? "text-emerald-950 font-bold"
                      : isBooked
                      ? "text-slate-400 line-through font-medium"
                      : "text-slate-700 font-semibold"
                  }`}
                >
                  {resource.name || t(resource.nameKey, resource.nameKey)}
                </span>
                {isBooked && (
                  <span className="text-[9px] text-red-500 font-bold shrink-0 flex items-center gap-0.5">
                    <i className="fa-solid fa-circle-exclamation text-[8px]"></i>
                    {t("equipment.inUseOtherCourt", "Belegt!")}
                  </span>
                )}
              </div>

              {/* Minimalistischer Tailwind-Toggle (kompakt für h-8) */}
              <div className="shrink-0 flex items-center pl-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSelected}
                  disabled={isDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(resource.id, isBooked);
                  }}
                  className={`relative inline-flex items-center h-4 w-7 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-hidden disabled:cursor-not-allowed ${
                    isSelected ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                      isSelected ? "translate-x-3" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
