import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { QuotaSnapshot } from "../services/quotaService";

export default function SuperAdminQuotaWidget() {
  const { t, i18n } = useTranslation();
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Fetch current quota from API
  const fetchQuota = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/superadmin/quota");
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success && data.quota) {
        setQuota(data.quota);
      } else {
        throw new Error(data.error || "Fehler beim Laden des Kontingents");
      }
    } catch (err: any) {
      console.warn("Fehler beim Abrufen der Quota-Daten:", err);
      setError(err?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger manual refresh
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch("/api/superadmin/quota/refresh", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success && data.quota) {
        setQuota(data.quota);
      } else {
        throw new Error(data.error || "Fehler beim Aktualisieren");
      }
    } catch (err: any) {
      console.warn("Fehler beim Aktualisieren der Quota-Daten:", err);
      setError(err?.message || "Aktualisierung fehlgeschlagen");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Color helper based on percentage
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 75) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const getTextColor = (percent: number) => {
    if (percent >= 90) return "text-red-700";
    if (percent >= 75) return "text-amber-700";
    return "text-emerald-700";
  };

  const getBadgeColor = (percent: number) => {
    if (percent >= 90) return "bg-red-50 text-red-700 border-red-200";
    if (percent >= 75) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  const locale = i18n.language === "en" ? "en-US" : "de-DE";

  // Format date helper
  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#e47726] text-lg shrink-0">
            <i className="fa-solid fa-server"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                {t("superadmin.quotaTitle", "Firebase Kontingent-Monitor")}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                Spark Plan
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium leading-relaxed mt-0.5">
              {t(
                "superadmin.quotaSubtitle",
                "Automatische Aktualisierung immer zur vollen Stunde (z. B. 13:00, 14:00 Uhr)"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {quota && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t("superadmin.quotaLastCheck", "Letzte stündliche Prüfung")}
              </div>
              <div className="text-xs font-semibold text-slate-700">
                {formatTimestamp(quota.timestamp)}
              </div>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title={t(
              "superadmin.quotaFetchTooltip",
              "Jetzt sofort aktuelle Kontingentdaten bei Firebase abrufen"
            )}
            className="px-4 py-2.5 bg-[#e47726] hover:bg-[#c8631b] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <i
              className={`fa-solid fa-arrows-rotate text-white ${
                refreshing ? "animate-spin" : ""
              }`}
            ></i>
            <span>
              {refreshing
                ? t("superadmin.quotaLoadingButton", "Lädt...")
                : t("superadmin.quotaFetchNow", "Sofort abrufen")}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <i className="fa-solid fa-circle-exclamation text-red-500 shrink-0"></i>
          <span>{error}</span>
        </div>
      )}

      {loading && !quota ? (
        <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
          <i className="fa-solid fa-spinner animate-spin text-2xl text-[#e47726]"></i>
          <span className="text-xs font-medium">
            {t("superadmin.quotaLoadingData", "Lade Kontingentdaten...")}
          </span>
        </div>
      ) : quota ? (
        <div className="space-y-6">
          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Speicherplatz */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                  {t("superadmin.quotaStorage", "Speicherplatz")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeColor(
                    quota.storage.usedPercent
                  )}`}
                >
                  {quota.storage.usedPercent.toFixed(1)}%
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="font-black text-slate-900 text-base">
                    {quota.storage.usedMb} MB
                  </span>
                  <span className="text-slate-500 font-medium">
                    {t("superadmin.quotaOfLimitMb", "von {{limit}} MB (1 GB)", {
                      limit: quota.storage.limitMb,
                    })}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getProgressColor(
                      quota.storage.usedPercent
                    )}`}
                    style={{ width: `${Math.min(100, quota.storage.usedPercent)}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                <span>{t("superadmin.quotaTotalDocs", "Dokumente gesamt:")}</span>
                <span className="font-bold text-slate-700">
                  {quota.storage.documentCount.toLocaleString(locale)}
                </span>
              </div>
            </div>

            {/* Card 2: Lesezugriffe */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                  {t("superadmin.quotaReadsToday", "Lesezugriffe (Heute)")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeColor(
                    quota.reads.usedPercent
                  )}`}
                >
                  {quota.reads.usedPercent.toFixed(1)}%
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="font-black text-slate-900 text-base">
                    {quota.reads.usedToday.toLocaleString(locale)}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {t("superadmin.quotaOfLimitPerDay", "von {{limit}} / Tag", {
                      limit: quota.reads.limitDaily.toLocaleString(locale),
                    })}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getProgressColor(
                      quota.reads.usedPercent
                    )}`}
                    style={{ width: `${Math.min(100, quota.reads.usedPercent)}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                <span>{t("superadmin.quotaRemainingToday", "Verbleibend heute:")}</span>
                <span className={`font-bold ${getTextColor(quota.reads.usedPercent)}`}>
                  {quota.reads.remaining.toLocaleString(locale)}
                </span>
              </div>
            </div>

            {/* Card 3: Schreibzugriffe */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                  {t("superadmin.quotaWritesToday", "Schreibzugriffe (Heute)")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeColor(
                    quota.writes.usedPercent
                  )}`}
                >
                  {quota.writes.usedPercent.toFixed(1)}%
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="font-black text-slate-900 text-base">
                    {quota.writes.usedToday.toLocaleString(locale)}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {t("superadmin.quotaOfLimitPerDay", "von {{limit}} / Tag", {
                      limit: quota.writes.limitDaily.toLocaleString(locale),
                    })}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${getProgressColor(
                      quota.writes.usedPercent
                    )}`}
                    style={{ width: `${Math.min(100, quota.writes.usedPercent)}%` }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                <span>{t("superadmin.quotaDeletesToday", "Löschvorgänge heute:")}</span>
                <span className="font-bold text-slate-700">
                  {quota.deletes.usedToday.toLocaleString(locale)} (
                  {t("superadmin.quotaOfLimitPerDay", "von {{limit}}", {
                    limit: quota.deletes.limitDaily.toLocaleString(locale),
                  })}
                  )
                </span>
              </div>
            </div>
          </div>

          {/* Details Toggle Button & Table */}
          {quota.storage.collections && Object.keys(quota.storage.collections).length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <i
                    className={`fa-solid fa-chevron-${
                      showDetails ? "down" : "right"
                    } text-slate-400 text-[10px]`}
                  ></i>
                  <span>
                    {t(
                      "superadmin.quotaCollectionDetails",
                      "Details nach Firestore-Sammlungen"
                    )}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                  {t(
                    "superadmin.quotaCollectionsRecorded",
                    "{{count}} Sammlungen erfasst",
                    { count: Object.keys(quota.storage.collections).length }
                  )}
                </span>
              </button>

              {showDetails && (
                <div className="p-4 border-t border-slate-200 bg-white">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {Object.entries(quota.storage.collections).map(([collName, stats]) => (
                      <div
                        key={collName}
                        className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 flex flex-col"
                      >
                        <span className="font-mono text-xs font-bold text-slate-800 truncate">
                          {collName}
                        </span>
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                          <span>
                            {stats.count}{" "}
                            {t("superadmin.quotaDocs", "Docs")}
                          </span>
                          <span>{(stats.estimatedBytes / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
