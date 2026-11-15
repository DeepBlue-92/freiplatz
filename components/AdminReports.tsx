import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Booking, User, ClubFeeSettings } from "../types";
import { BarChart3, Download, Clock, Users, Box } from "lucide-react";

interface AdminReportsProps {
  bookings: Booking[];
  users: Record<string, User>;
  courts?: string[];
  equipmentList?: string[];
  feeSettings?: ClubFeeSettings;
}

const AdminReports: React.FC<AdminReportsProps> = ({
  bookings,
  users,
  courts,
  equipmentList,
  feeSettings,
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? "en-US" : "de-DE";
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const youthAgeThreshold = feeSettings?.youth_age_threshold ?? 18;

  const getEquipmentDisplayName = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower === "ballmaschine" || lower === "ball machine") {
      return t("equipment.ballMachine", "Ballmaschine");
    }
    if (lower === "ballmaschine 1" || lower === "ball machine 1") {
      return t("equipment.ballMachine1", "Ballmaschine 1");
    }
    if (lower === "ballmaschine 2" || lower === "ball machine 2") {
      return t("equipment.ballMachine2", "Ballmaschine 2");
    }
    if (lower === "ballkorb" || lower === "ball basket") {
      return t("equipment.ballBasket", "Ballkorb");
    }
    if (
      lower === "markierungshütchen" ||
      lower === "cones" ||
      lower === "training cones"
    ) {
      return t("equipment.cones", "Markierungshütchen");
    }
    return name;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(dateLocale, {
      style: "currency",
      currency: "EUR",
    }).format(val);
  };

  const years = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(new Date().getFullYear()); // Always allow current year
    bookings.forEach((b) => {
      if (b.date) {
        const d = new Date(b.date);
        const yr = d.getFullYear();
        if (!isNaN(yr)) {
          const isPlayerBooking =
            !b.isLocked && Array.isArray(b.players) && b.players.length > 0;
          if (isPlayerBooking) {
            yearsSet.add(yr);
          }
        }
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [bookings]);

  const courtList = useMemo(() => {
    return courts && courts.length > 0 ? courts : ["Platz 1", "Platz 2"];
  }, [courts]);

  const activeEquipmentList = useMemo(() => {
    const rawList =
      equipmentList && equipmentList.length > 0
        ? equipmentList
        : ["Ballmaschine", "Ballkorb"];

    return rawList.map((item, idx) => {
      const lower = item.toLowerCase();
      const slug = `eq_${idx}_${lower.replace(/[^a-z0-9]/g, "_")}`;
      const isBallMachine =
        lower.includes("ballmaschine") || lower.includes("ball machine");
      return {
        id: slug,
        name: item,
        nameKey: item,
        isBallMachine,
      };
    });
  }, [equipmentList]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const d = new Date(b.date);
      const isPlayerBooking =
        !b.isLocked && Array.isArray(b.players) && b.players.length > 0;
      return d.getFullYear() === reportYear && isPlayerBooking;
    });
  }, [bookings, reportYear]);

  const monthlyStats = useMemo(() => {
    const monthKeys = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ] as const;

    return monthKeys.map((mKey, index) => {
      const monthBookings = filteredBookings.filter((b) => {
        const d = new Date(b.date);
        return d.getMonth() === index;
      });

      const courtHours: Record<string, number> = {};
      let total = 0;

      courtList.forEach((courtName) => {
        const hours = monthBookings
          .filter((b) => b.court === courtName)
          .reduce((sum, b) => sum + (b.hours || 1), 0);
        courtHours[courtName] = hours;
        total += hours;
      });

      const localizedMonthName = t(
        `reports.${mKey}`,
        new Date(reportYear, index, 1).toLocaleDateString(dateLocale, {
          month: "long",
        })
      );

      return {
        month: localizedMonthName,
        courtHours,
        total,
      };
    });
  }, [filteredBookings, courtList, t, reportYear, dateLocale]);

  const activityStats = useMemo(() => {
    const playerHours: Record<
      string,
      { hours: number; equipmentHours: Record<string, number> }
    > = {};

    const yearCourtHours: Record<string, number> = {};
    courtList.forEach((c) => {
      yearCourtHours[c] = 0;
    });

    const equipmentStats: Record<string, number> = {};
    activeEquipmentList.forEach((eq) => {
      equipmentStats[eq.nameKey] = 0;
    });

    let totalGuestHours = 0;
    let adultGuestHours = 0;
    let youthGuestHours = 0;
    let totalGuestCount = 0;
    let adultGuestCount = 0;
    let youthGuestCount = 0;
    let totalFeesCents = 0;
    let yearMachine = 0;

    filteredBookings.forEach((b) => {
      const durationHours = b.hours || 1;

      // 1. Platzauslastung
      if (b.court && yearCourtHours[b.court] !== undefined) {
        yearCourtHours[b.court] += durationHours;
      }

      // 2. Ausrüstung (dynamisch)
      let hasAnyMachineBooking = false;
      const bookedEquipmentInBooking: string[] = [];

      activeEquipmentList.forEach((eq) => {
        const lowerName = eq.name.toLowerCase();
        const matchesResourceId =
          Array.isArray(b.selectedResourceIds) &&
          b.selectedResourceIds.some(
            (id) =>
              id === eq.id ||
              id === eq.nameKey ||
              id.toLowerCase() === lowerName ||
              id.includes(lowerName.replace(/[^a-z0-9]/g, "_")) ||
              (eq.isBallMachine &&
                (id.includes("ballmachine") || id.includes("ballmaschine")))
          );

        // Fallback für legacy hasBallMachine
        const matchesLegacy = eq.isBallMachine && b.hasBallMachine === true;

        if (matchesResourceId || matchesLegacy) {
          equipmentStats[eq.nameKey] =
            (equipmentStats[eq.nameKey] || 0) + durationHours;
          bookedEquipmentInBooking.push(eq.nameKey);
          if (eq.isBallMachine) {
            hasAnyMachineBooking = true;
          }
        }
      });

      if (hasAnyMachineBooking || b.hasBallMachine) {
        yearMachine += durationHours;
      }

      // 3. Gaststunden (differenziert)
      let bAdults = 0;
      let bYouth = 0;
      let bTotalGuests = 0;

      if (
        typeof b.adultGuestCount === "number" ||
        typeof b.youthGuestCount === "number"
      ) {
        bAdults = Math.max(0, b.adultGuestCount || 0);
        bYouth = Math.max(0, b.youthGuestCount || 0);
        bTotalGuests = bAdults + bYouth;
      } else if (typeof b.guestCount === "number" && b.guestCount > 0) {
        bAdults = b.guestCount;
        bYouth = 0;
        bTotalGuests = b.guestCount;
      } else {
        const guestNamesCount = (b.players || []).filter((p) =>
          p.toLowerCase().includes("gast")
        ).length;
        bAdults = guestNamesCount;
        bYouth = 0;
        bTotalGuests = guestNamesCount;
      }

      if (bTotalGuests > 0) {
        totalGuestCount += bTotalGuests;
        adultGuestCount += bAdults;
        youthGuestCount += bYouth;

        totalGuestHours += bTotalGuests * durationHours;
        adultGuestHours += bAdults * durationHours;
        youthGuestHours += bYouth * durationHours;

        if (typeof b.calculatedFeeCents === "number") {
          totalFeesCents += b.calculatedFeeCents;
        } else if (typeof b.guestFee === "number") {
          totalFeesCents += Math.round(b.guestFee * 100);
        }
      }

      // 4. Spieler-Stunden
      (b.players || []).forEach((p) => {
        if (!p.toLowerCase().includes("gast")) {
          if (!playerHours[p]) {
            playerHours[p] = { hours: 0, equipmentHours: {} };
          }
          playerHours[p].hours += durationHours;
          bookedEquipmentInBooking.forEach((eqKey) => {
            playerHours[p].equipmentHours[eqKey] =
              (playerHours[p].equipmentHours[eqKey] || 0) + durationHours;
          });
        }
      });
    });

    const topPlayers = Object.entries(playerHours)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    const totalHours = Object.values(yearCourtHours).reduce(
      (sum, h) => sum + h,
      0
    );

    // Alle Ausrüstungen, die im Kalenderjahr tatsächlich gebucht wurden
    const bookedEquipmentList = activeEquipmentList.filter(
      (eq) => (equipmentStats[eq.nameKey] || 0) > 0
    );

    return {
      topPlayers,
      bookedEquipmentList,
      yearCourtHours,
      totalHours,
      yearMachine,
      equipmentStats,
      guestStats: {
        totalHours: totalGuestHours,
        adultHours: adultGuestHours,
        youthHours: youthGuestHours,
        totalGuests: totalGuestCount,
        adultCount: adultGuestCount,
        youthCount: youthGuestCount,
        totalFeesCents,
      },
    };
  }, [filteredBookings, courtList, activeEquipmentList]);

  const downloadCSV = () => {
    let csvContent =
      "\uFEFF" + t("reports.csvReport", "REPORT") + " " + reportYear + "\n\n";

    // 1. TOP SPIELER
    csvContent += t("reports.csvTopPlayers", "TOP SPIELER") + "\n";
    const eqHeaders = activityStats.bookedEquipmentList
      .map(
        (eq) =>
          `${getEquipmentDisplayName(eq.name)} ${t("reports.csvCourtHoursSuffix", "(Std)")}`
      )
      .join(",");
    csvContent += `${t("reports.member", "Mitglied")},${t("reports.csvTotalHours", "Gesamtstunden (Std)")}${eqHeaders ? `,${eqHeaders}` : ""}\n`;
    activityStats.topPlayers.forEach((p) => {
      const eqValues = activityStats.bookedEquipmentList
        .map((eq) => p.equipmentHours?.[eq.nameKey] || 0)
        .join(",");
      csvContent += `${p.name},${p.hours}${eqValues ? `,${eqValues}` : ""}\n`;
    });

    // 2. MONATLICHE AUSWERTUNG
    csvContent +=
      "\n" +
      t("reports.csvMonthlyUtilization", "MONATLICHE AUSWERTUNG (PLÄTZE)") +
      "\n";
    const courtHeaders = courtList
      .map((c) => `${c} ${t("reports.csvCourtHoursSuffix", "(Std)")}`)
      .join(",");
    csvContent += `${t("reports.month", "Monat")},${courtHeaders},${t("reports.total", "Gesamt")} ${t("reports.csvCourtHoursSuffix", "(Std)")}\n`;
    monthlyStats.forEach((m) => {
      const courtValues = courtList.map((c) => m.courtHours[c] || 0).join(",");
      csvContent += `${m.month},${courtValues},${m.total}\n`;
    });

    // 3. GASTSTUNDEN-AUSWERTUNG
    csvContent += "\n" + t("reports.csvGuestHours", "GASTSTUNDEN") + "\n";
    csvContent += `${t("reports.csvCategory", "Kategorie")},${t("reports.csvHours", "Stunden")},${t("reports.csvPersons", "Personen")}\n`;
    csvContent += `${t("reports.csvTotalGuestHoursRow", "Gesamt Gaststunden")},${activityStats.guestStats.totalHours},${activityStats.guestStats.totalGuests}\n`;
    csvContent += `${t("reports.csvAdultsRow", {
      age: youthAgeThreshold,
      defaultValue: `Gäste (ab ${youthAgeThreshold} J.)`,
    })},${activityStats.guestStats.adultHours},${activityStats.guestStats.adultCount}\n`;
    csvContent += `${t("reports.csvYouthRow", {
      age: youthAgeThreshold,
      defaultValue: `Kinder / Jugendliche (U${youthAgeThreshold})`,
    })},${activityStats.guestStats.youthHours},${activityStats.guestStats.youthCount}\n`;
    if (activityStats.guestStats.totalFeesCents > 0) {
      csvContent += `${t("reports.csvGuestFeeRevenue", "Gastgebühren Einnahmen")},${formatCurrency(
        activityStats.guestStats.totalFeesCents / 100
      )}\n`;
    }

    // 4. AUSRÜSTUNG
    csvContent += "\n" + t("reports.csvEquipment", "AUSRÜSTUNG") + "\n";
    csvContent += `${t("reports.csvDevice", "Gerät")},${t("reports.csvHours", "Stunden")}\n`;
    activeEquipmentList.forEach((eq) => {
      const h = activityStats.equipmentStats[eq.nameKey] || 0;
      csvContent += `${getEquipmentDisplayName(eq.name)},${h}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tennis_Club_Report_${reportYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-4 md:p-6">
        {/* Upper Dashboard header area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-0 md:gap-4 mb-3 pb-3 md:mb-6 md:pb-6 border-b border-slate-100">
          <div className="hidden md:flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)] animate-pulse-subtle">
              <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">
                {t("reports.title", "Auswertungen")}
              </h3>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                {t(
                  "reports.subtitle",
                  "Vereinsanalysen für das gewählte Kalenderjahr"
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto self-stretch md:self-auto justify-between md:justify-end mt-1 md:mt-0">
            <button
              onClick={downloadCSV}
              type="button"
              className="bg-[var(--color-primary)] text-white hover:bg-black uppercase tracking-widest px-3 md:px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer border border-transparent outline-none whitespace-nowrap text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />{" "}
              {t("reports.csvExport", "CSV EXPORT")}
            </button>
          </div>
        </div>

        {/* Filters and Search Bar Section */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-50/70 p-3 md:p-4 rounded-2xl border border-slate-150 mb-4 md:mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-[140px]">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {t("reports.yearLabel", "Jahr:")}
              </span>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] flex-1 min-w-[90px] shadow-sm cursor-pointer py-2 font-sans font-medium"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content Wrapper inside Card */}
        <div className="space-y-5 lg:space-y-6 mt-2">
          {/* ============================================================ */}
          {/* ABSCHNITT 1: GESAMT & PLÄTZE                                */}
          {/* ============================================================ */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 md:p-5">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  {t("reports.courtUtilization", "Platzauslastung")}
                </h4>
                <p className="text-[11px] text-slate-400 font-normal">
                  {t(
                    "reports.courtUtilizationSubtitle",
                    "Gesamtstunden und Aufteilung auf alle Plätze"
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Gesamtstunden hervorgehoben */}
              <div className="bg-white border-2 border-[var(--color-primary)]/40 p-3.5 rounded-xl shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
                <div>
                  <p className="text-[9px] font-black uppercase text-[var(--color-primary)] tracking-wider mb-1">
                    {t("reports.totalHours", "Gesamtstunden")}
                  </p>
                  <p className="text-lg font-black text-slate-900 leading-none">
                    {activityStats.totalHours} {t("reports.hoursUnit", "Std.")}
                  </p>
                </div>
              </div>

              {/* Kacheln für jeden Platz */}
              {courtList.map((courtName) => {
                const hours = activityStats.yearCourtHours[courtName] || 0;
                return (
                  <div
                    key={courtName}
                    className="bg-white border border-slate-200/90 p-3.5 rounded-xl shadow-3xs flex flex-col justify-between"
                  >
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">
                        {courtName}
                      </p>
                      <p className="text-base font-black text-slate-800 leading-none">
                        {hours} {t("reports.hoursUnit", "Std.")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============================================================ */}
          {/* 2-SPALTEN-LAYOUT: GASTSTUNDEN (LINKS) & AUSRÜSTUNG (RECHTS)   */}
          {/* ============================================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ABSCHNITT 2: GASTSTUNDEN */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 md:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {t("reports.guestHours", "Gaststunden")}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-normal">
                      {t(
                        "reports.guestHoursSubtitle",
                        "Aufschlüsselung nach Altersgruppen und Einnahmen"
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Gaststunden Gesamt */}
                  <div className="bg-white border border-slate-200/90 p-3 rounded-xl shadow-3xs flex flex-col justify-between">
                    <div>
                      <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">
                        {t("reports.totalGuestHours", "Gaststunden Gesamt")}
                      </p>
                      <p className="text-base font-black text-slate-800 leading-none">
                        {activityStats.guestStats.totalHours}{" "}
                        {t("reports.hoursUnit", "Std.")}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium">
                      {activityStats.guestStats.totalGuests}{" "}
                      {activityStats.guestStats.totalGuests === 1
                        ? t("reports.guestSingle", "Gast")
                        : t("reports.guestPlural", "Gäste")}{" "}
                      {t("reports.booked", "gebucht")}
                    </p>
                  </div>

                  {/* Erwachsene Gäste */}
                  <div className="bg-white border border-slate-200/90 p-3 rounded-xl shadow-3xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                          {t("reports.adults", "Erwachsene")}
                        </p>
                        <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.5 rounded leading-none">
                          {t("reports.fromAge", {
                            age: youthAgeThreshold,
                            defaultValue: `ab ${youthAgeThreshold} J.`,
                          })}
                        </span>
                      </div>
                      <p className="text-base font-black text-slate-800 leading-none">
                        {activityStats.guestStats.adultHours}{" "}
                        {t("reports.hoursUnit", "Std.")}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium">
                      {activityStats.guestStats.adultCount}{" "}
                      {activityStats.guestStats.adultCount === 1
                        ? t("reports.adultSingle", "Erwachsener")
                        : t("reports.adultPlural", "Erwachsene")}
                    </p>
                  </div>

                  {/* Kinder / Jugendliche */}
                  <div className="bg-white border border-slate-200/90 p-3 rounded-xl shadow-3xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                          {t("reports.childrenYouth", "Kinder / Jugend")}
                        </p>
                        <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded leading-none border border-emerald-100">
                          {t("reports.underAge", {
                            age: youthAgeThreshold,
                            defaultValue: `U${youthAgeThreshold}`,
                          })}
                        </span>
                      </div>
                      <p className="text-base font-black text-slate-800 leading-none">
                        {activityStats.guestStats.youthHours}{" "}
                        {t("reports.hoursUnit", "Std.")}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 font-medium">
                      {activityStats.guestStats.youthCount}{" "}
                      {activityStats.guestStats.youthCount === 1
                        ? t("reports.youthSingle", "Jugendlicher")
                        : t("reports.youthPlural", "Jugendliche")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Optional: Gebühreneinnahmen Footer */}
              {activityStats.guestStats.totalFeesCents > 0 && (
                <div className="mt-3.5 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    {t(
                      "reports.calculatedGuestFees",
                      "Berechnete Gastgebühren:"
                    )}
                  </span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(
                      activityStats.guestStats.totalFeesCents / 100
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* ABSCHNITT 3: AUSRÜSTUNG */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 md:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center shrink-0">
                    <Box className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {t("reports.equipment", "Ausrüstung")}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-normal">
                      {t(
                        "reports.equipmentSubtitle",
                        "Nutzungsstunden aller Vereinsgeräte"
                      )}
                    </p>
                  </div>
                </div>

                {activeEquipmentList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    {t(
                      "reports.noEquipmentConfigured",
                      "Keine Ausrüstungsgegenstände konfiguriert"
                    )}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {activeEquipmentList.map((eq) => {
                      const hours =
                        activityStats.equipmentStats[eq.nameKey] || 0;
                      const eqDisplayName = getEquipmentDisplayName(eq.name);
                      return (
                        <div
                          key={eq.id}
                          className="bg-white border border-slate-200/90 p-3 rounded-xl shadow-3xs flex flex-col justify-between"
                        >
                          <div>
                            <p
                              className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1 truncate"
                              title={eqDisplayName}
                            >
                              {eqDisplayName}
                            </p>
                            <p className="text-base font-black text-slate-800 leading-none">
                              {hours} {t("reports.hoursUnit", "Std.")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Monthly Chart Table */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black text-[var(--color-primary)] uppercase tracking-wider flex items-center gap-2 mb-4">
              <i className="fa-solid fa-calendar-days"></i>{" "}
              {t("reports.utilizationPerCourt", {
                year: reportYear,
                defaultValue: `Auslastung pro Platz ${reportYear}`,
              })}
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-sm">
              <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[25%]">
                      {t("reports.month", "Monat")}
                    </th>
                    {courtList.map((courtName) => (
                      <th
                        key={courtName}
                        className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center"
                      >
                        {courtName}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[18%]">
                      {t("reports.total", "Gesamt")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyStats.map((m) => (
                    <tr
                      key={m.month}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-normal text-slate-700">
                        {m.month}
                      </td>
                      {courtList.map((courtName) => {
                        const val = m.courtHours[courtName] || 0;
                        return (
                          <td
                            key={courtName}
                            className="px-4 py-3 text-center text-xs font-normal text-slate-800"
                          >
                            {val} {t("reports.hoursUnit", "Std.")}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center text-xs font-normal text-slate-800">
                        {m.total} {t("reports.hoursUnit", "Std.")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Player Table */}
          <div className="pt-4 border-t border-slate-100">
            <div className="mb-4">
              <h3 className="text-xs font-black text-[var(--color-primary)] uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-ranking-star"></i>{" "}
                {t("reports.topPlayers", {
                  year: reportYear,
                  defaultValue: `Top-Spieler ${reportYear}`,
                })}
              </h3>
              <p className="text-slate-400 text-xs font-normal mt-0.5">
                {t(
                  "reports.topPlayersSubtitle",
                  "Die 10 aktivsten Mitglieder des gewählten Jahres"
                )}
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-sm">
              <table className="w-full border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[8%]">
                      {t("reports.rank", "#")}
                    </th>
                    <th className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest text-left">
                      {t("reports.member", "Mitglied")}
                    </th>
                    <th className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center whitespace-nowrap">
                      {t("reports.totalHours", "Gesamtstunden")}
                    </th>
                    {activityStats.bookedEquipmentList.map((eq) => (
                      <th
                        key={eq.id}
                        className="px-4 py-3 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center whitespace-nowrap"
                      >
                        {getEquipmentDisplayName(eq.name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityStats.topPlayers.map((player, idx) => (
                    <tr
                      key={player.name + "-" + idx}
                      className="hover:bg-slate-50/50 transition-all text-xs"
                    >
                      <td className="px-4 py-3 font-normal text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-normal text-[var(--color-primary)] uppercase text-[11px] truncate">
                        {player.name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg text-[11px] font-normal text-slate-700 shadow-sm">
                          {player.hours} {t("reports.hoursUnit", "Std.")}
                        </span>
                      </td>
                      {activityStats.bookedEquipmentList.map((eq) => {
                        const eqHours =
                          player.equipmentHours?.[eq.nameKey] || 0;
                        return (
                          <td key={eq.id} className="px-4 py-3 text-center">
                            {eqHours > 0 ? (
                              <span className="bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg text-[11px] font-normal text-slate-700 shadow-sm">
                                {eqHours} {t("reports.hoursUnit", "Std.")}
                              </span>
                            ) : (
                              <span className="text-slate-350">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {activityStats.topPlayers.length === 0 && (
                    <tr>
                      <td
                        colSpan={3 + activityStats.bookedEquipmentList.length}
                        className="py-12 text-center text-slate-400 font-normal italic uppercase text-[10px]"
                      >
                        {t("reports.noBookingData", {
                          year: reportYear,
                          defaultValue: `Keine Spieldaten für ${reportYear} vorhanden`,
                        })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminReports;
