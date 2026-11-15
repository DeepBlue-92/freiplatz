import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Booking, User, Role } from "../types";
import {
  ClubSettings,
  updateBookingPaidStatus,
  updateBookingPaidDate,
  saveBooking,
  deleteBooking,
} from "../services/db";
import {
  calculateBookingFee,
  buildBookingFeeContext,
} from "../utils/guestFeeCalculator";
import { TIME_SLOTS } from "../constants";
import {
  Search,
  Download,
  HelpCircle,
  FileText,
  Check,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Ticket,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

import { isClubAdmin, isSuperAdmin } from "../lib/userUtils";

export interface GroupedGuestBooking {
  id: string;
  slotIds: string[];
  allSlots: Booking[];
  primaryBooking: Booking;
  date: string;
  time: string;
  endTime: string;
  court: string;
  players: string[];
  bookedBy?: string;
  createdBy?: string;
  guestCount: number;
  adultGuestCount: number;
  youthGuestCount: number;
  hours: number;
  totalFee: number;
  guestBillingMode: "per_court" | "per_player";
  appliedFeeRuleId?: string;
  appliedFeeRuleName?: string;
  isPaid: boolean;
  paidDate?: string | null;
  comment?: string;
  isManualGuestEntry?: boolean;
}

interface AdminGuestsProps {
  bookings: Booking[];
  users: Record<string, User>;
  settings: any;
  currentUser: User;
  vereinsId: string;
  onSaveSettings?: (settings: any) => Promise<void>;
  isAdmin?: boolean;
}

const AdminGuests: React.FC<AdminGuestsProps> = ({
  bookings,
  users,
  settings,
  currentUser,
  vereinsId,
  onSaveSettings,
  isAdmin: propIsAdmin,
}) => {
  const { t, i18n } = useTranslation();
  const currentYearNum = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYearNum.toString());
  
  const rules = settings?.gastspiel_rules || [];
  
  const getRuleForYear = (year: number) => {
    if (rules.length === 0) return { gueltig_ab_jahr: year, guestFeePerHour: 5.0, berechnungsmodus: "PLATZBASIS" };
    const sorted = [...rules].sort((a, b) => b.gueltig_ab_jahr - a.gueltig_ab_jahr);
    const rule = sorted.find((r: any) => r.gueltig_ab_jahr <= year);
    return rule || sorted[sorted.length - 1];
  };

  const activeRule = getRuleForYear(parseInt(selectedYear));
  const guestFee = activeRule.guestFeePerHour;
  const berechnungsmodus = activeRule.berechnungsmodus;
  const defaultGlobalBillingMode = berechnungsmodus === "PLATZBASIS" ? "per_court" : "per_player";
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDateSearchOpen, setIsDateSearchOpen] = useState(false);
  const dateSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDateSearchOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dateSearchRef.current && !dateSearchRef.current.contains(event.target as Node)) {
        setIsDateSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDateSearchOpen]);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [updatingPaidId, setUpdatingPaidId] = useState<string | null>(null);
  const [expandedBookingIds, setExpandedBookingIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editingGroupEntry, setEditingGroupEntry] = useState<GroupedGuestBooking | null>(null);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleCloseModal = () => {
    setIsClosing(true);
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setEditingBooking(null);
      setEditingGroupEntry(null);
    }, 200);
  };

  // Form states
  const [bDate, setBDate] = useState("");
  const [bTime, setBTime] = useState("12:00");
  const [bEndTime, setBEndTime] = useState("13:00");
  const [bCourt, setBCourt] = useState("Ohne Termin");
  const [bUserId, setBUserId] = useState("");
  const [bGuestCount, setBGuestCount] = useState(1);
  const [bGuestFee, setBGuestFee] = useState(2.5);
  const [bBillingMode, setBBillingMode] = useState<"per_player" | "per_court">(
    "per_player",
  );
  const [bIsPaid, setBIsPaid] = useState(false);
  const [bPaidDate, setBPaidDate] = useState("");
  const [bComment, setBComment] = useState("");
  const [bIsManual, setBIsManual] = useState(true);

  const isAdmin = useMemo(() => {
    if (propIsAdmin !== undefined) return propIsAdmin;
    if (!currentUser) return false;
    if (isSuperAdmin(currentUser)) return true;
    return isClubAdmin(currentUser, vereinsId);
  }, [propIsAdmin, currentUser, vereinsId]);

  // Find overall years where guest games have taken place
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    bookings.forEach((b) => {
      const isGuest =
        (b.guestCount && b.guestCount > 0) ||
        b.players.some(
          (p) =>
            p.toLowerCase().includes("gastspieler") ||
            p.toLowerCase().includes("gast"),
        );
      if (isGuest && b.date) {
        try {
          const year = b.date.split("-")[0];
          if (year && !isNaN(Number(year))) {
            years.add(year);
          }
        } catch (e) {}
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [bookings]);

  // Base bookings for the year and role permissions (before search query)
  const baseBookings = useMemo(() => {
    let filtered = bookings.filter(
      (b) =>
        b.isManualGuestEntry ||
        (b.guestCount && b.guestCount > 0) ||
        b.players.some(
          (p) =>
            p.toLowerCase().includes("gastspieler") ||
            p.toLowerCase().includes("gast"),
        ),
    );

    if (selectedYear !== "all") {
      filtered = filtered.filter(
        (b) => b.date && b.date.startsWith(selectedYear),
      );
    }

    const currentUserFullName =
      currentUser.firstName || currentUser.lastName
        ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
        : currentUser.name;

    if (!isAdmin) {
      filtered = filtered.filter((b) => {
        return (
          b.bookedBy === currentUser.id ||
          b.createdBy === currentUser.name ||
          b.players.some(
            (p) => p === currentUser.name || p === currentUserFullName,
          )
        );
      });
    }

    return filtered;
  }, [bookings, selectedYear, isAdmin, currentUser]);

  // Helper function to resolve the slot's end time and duration
  const getEndAndHours = (startTime: string) => {
    const idx = TIME_SLOTS.indexOf(startTime);
    if (idx !== -1 && idx < TIME_SLOTS.length - 1) {
      return { endTime: TIME_SLOTS[idx + 1], hours: 1.0 };
    } else {
      try {
        const [hr, min] = startTime.split(":").map(Number);
        const nextHr = String((hr + 1) % 24).padStart(2, "0");
        const nextMin = String(min).padStart(2, "0");
        return { endTime: `${nextHr}:${nextMin}`, hours: 1.0 };
      } catch (e) {
        return { endTime: "13:00", hours: 1.0 };
      }
    }
  };

  const calculateHoursBetween = (
    startTime: string,
    endTime: string,
  ): number => {
    try {
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM))
        return 1.0;

      let diffInMinutes = endH * 60 + endM - (startH * 60 + startM);
      if (diffInMinutes <= 0) {
        diffInMinutes += 24 * 60; // Safe overnight transition
      }
      const computed = diffInMinutes / 60;
      return Math.round(computed * 100) / 100;
    } catch (e) {
      return 1.0;
    }
  };

  const addHoursToTime = (time: string, hours: number): string => {
    try {
      const [h, m] = time.split(":").map(Number);
      const totalMinutes = h * 60 + m + hours * 60;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = Math.round(totalMinutes % 60);
      return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    } catch (e) {
      return "13:00";
    }
  };

  // Group base bookings so that multi-hour slots of the same session are combined into one entry
  const groupedBaseBookings = useMemo<GroupedGuestBooking[]>(() => {
    const manualEntries: GroupedGuestBooking[] = [];
    const regularSlots: Booking[] = [];

    baseBookings.forEach((b) => {
      if (b.isManualGuestEntry) {
        const { endTime, hours } = getEndAndHours(b.time || "12:00");
        const resolvedHours = b.hours !== undefined ? b.hours : hours;
        const count = b.guestCount || 1;
        const countBillingMode = b.guestBillingMode || defaultGlobalBillingMode;
        const countGuestFee = b.guestFee !== undefined ? b.guestFee : guestFee;
        let fee = 0;
        if (b.calculatedFeeCents !== undefined) {
          fee = b.calculatedFeeCents / 100;
        } else if (count > 0) {
          if (countBillingMode === "per_court") {
            fee = countGuestFee * resolvedHours;
          } else {
            fee = countGuestFee * resolvedHours * count;
          }
        }
        manualEntries.push({
          id: b.id,
          slotIds: [b.id],
          allSlots: [b],
          primaryBooking: b,
          date: b.date,
          time: b.time || "12:00",
          endTime: addHoursToTime(b.time || "12:00", resolvedHours),
          court: b.court || "Ohne Termin",
          players: b.players || [],
          bookedBy: b.bookedBy,
          createdBy: b.createdBy,
          guestCount: count,
          adultGuestCount:
            typeof b.adultGuestCount === "number" ? b.adultGuestCount : count,
          youthGuestCount:
            typeof b.youthGuestCount === "number" ? b.youthGuestCount : 0,
          hours: resolvedHours,
          totalFee: fee,
          guestBillingMode: countBillingMode,
          appliedFeeRuleId: b.appliedFeeRuleId,
          appliedFeeRuleName: b.appliedFeeRuleName,
          isPaid: !!b.isPaid,
          paidDate: b.paidDate,
          comment: b.comment,
          isManualGuestEntry: true,
        });
      } else {
        regularSlots.push(b);
      }
    });

    const buildGroupedBooking = (slots: Booking[]): GroupedGuestBooking => {
      slots.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
      const primary = slots[0];
      const lastSlot = slots[slots.length - 1];
      const { endTime: lastSlotEndTime } = getEndAndHours(lastSlot.time || "12:00");

      let totalHours = 0;
      let totalFee = 0;

      slots.forEach((s) => {
        const { hours } = getEndAndHours(s.time || "12:00");
        const slotHours = s.hours !== undefined ? s.hours : hours;
        totalHours += slotHours;

        if (s.calculatedFeeCents !== undefined) {
          totalFee += s.calculatedFeeCents / 100;
        } else {
          const count = s.guestCount || 1;
          const mode = s.guestBillingMode || defaultGlobalBillingMode;
          const feeRate = s.guestFee !== undefined ? s.guestFee : guestFee;
          if (mode === "per_court") {
            totalFee += feeRate * slotHours;
          } else {
            totalFee += feeRate * slotHours * count;
          }
        }
      });

      const isPaid = slots.every((s) => !!s.isPaid);
      const paidDate = isPaid
        ? slots.find((s) => s.paidDate)?.paidDate || primary.paidDate || primary.date
        : null;

      const guestCount = primary.guestCount || 1;
      const adultGuestCount =
        typeof primary.adultGuestCount === "number"
          ? primary.adultGuestCount
          : guestCount;
      const youthGuestCount =
        typeof primary.youthGuestCount === "number" ? primary.youthGuestCount : 0;

      const comment =
        slots
          .map((s) => s.comment)
          .filter(Boolean)
          .filter((c) => !["gastspiel", "gastspieler"].includes(c!.toLowerCase().trim()))[0] || "";

      return {
        id: primary.group_token || primary.id,
        slotIds: slots.map((s) => s.id),
        allSlots: slots,
        primaryBooking: primary,
        date: primary.date,
        time: primary.time || "12:00",
        endTime: lastSlotEndTime,
        court: primary.court || "Ohne Termin",
        players: primary.players || [],
        bookedBy: primary.bookedBy,
        createdBy: primary.createdBy,
        guestCount,
        adultGuestCount,
        youthGuestCount,
        hours: totalHours,
        totalFee,
        guestBillingMode: primary.guestBillingMode || defaultGlobalBillingMode,
        appliedFeeRuleId: primary.appliedFeeRuleId,
        appliedFeeRuleName: primary.appliedFeeRuleName,
        isPaid,
        paidDate,
        comment,
        isManualGuestEntry: false,
      };
    };

    // 2. Regular court bookings
    const tokenGroups = new Map<string, Booking[]>();
    const ungroupedSlots: Booking[] = [];

    regularSlots.forEach((slot) => {
      if (slot.group_token && slot.group_token.trim() !== "") {
        if (!tokenGroups.has(slot.group_token)) {
          tokenGroups.set(slot.group_token, []);
        }
        tokenGroups.get(slot.group_token)!.push(slot);
      } else {
        ungroupedSlots.push(slot);
      }
    });

    const groupedRegular: GroupedGuestBooking[] = [];

    tokenGroups.forEach((slots) => {
      groupedRegular.push(buildGroupedBooking(slots));
    });

    // Partition ungrouped slots by date + court + primary member/booker + guestCount
    const partitionMap = new Map<string, Booking[]>();
    for (const slot of ungroupedSlots) {
      const primaryPlayer =
        slot.players?.find((p) => !p.toLowerCase().includes("gast")) ||
        slot.bookedBy ||
        slot.createdBy ||
        "unknown";
      const key = `${slot.date}_${slot.court || "unknown"}_${primaryPlayer}_${slot.guestCount || 0}`;
      if (!partitionMap.has(key)) {
        partitionMap.set(key, []);
      }
      partitionMap.get(key)!.push(slot);
    }

    partitionMap.forEach((slots) => {
      slots.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

      let currentChain: Booking[] = [];
      let currentChainEndTime = "";

      for (const slot of slots) {
        const slotTime = slot.time || "00:00";
        const { endTime } = getEndAndHours(slotTime);

        if (currentChain.length === 0) {
          currentChain.push(slot);
          currentChainEndTime = endTime;
        } else {
          if (slotTime === currentChainEndTime) {
            currentChain.push(slot);
            currentChainEndTime = endTime;
          } else {
            groupedRegular.push(buildGroupedBooking(currentChain));
            currentChain = [slot];
            currentChainEndTime = endTime;
          }
        }
      }

      if (currentChain.length > 0) {
        groupedRegular.push(buildGroupedBooking(currentChain));
      }
    });

    return [...manualEntries, ...groupedRegular];
  }, [baseBookings, defaultGlobalBillingMode, guestFee]);

  // Compute guest bookings with search query and sort applied
  const guestBookings = useMemo<GroupedGuestBooking[]>(() => {
    let filtered = [...groupedBaseBookings];

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => {
        const memberName =
          b.players.find((p) => !p.toLowerCase().includes("gast")) ||
          b.bookedBy ||
          "Unbekannt";
        const bookingOwner =
          users[b.bookedBy || ""] ||
          (Object.values(users) as User[]).find((u) => u.name === b.createdBy);

        const klarname = bookingOwner?.klarname || "";
        const firstName = bookingOwner?.firstName || "";
        const lastName = bookingOwner?.lastName || "";
        const email = bookingOwner?.email || "";
        const court = b.court || "";
        const date = b.date || "";

        return (
          memberName.toLowerCase().includes(query) ||
          b.players.some((p) => p.toLowerCase().includes(query)) ||
          klarname.toLowerCase().includes(query) ||
          firstName.toLowerCase().includes(query) ||
          lastName.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          court.toLowerCase().includes(query) ||
          date.includes(query)
        );
      });
    }

    // Sort by date and time
    return filtered.sort((a, b) => {
      if (a.date !== b.date) {
        const compareVal =
          new Date(a.date).getTime() - new Date(b.date).getTime();
        return sortOrder === "desc" ? -compareVal : compareVal;
      }
      const aTime = a.time || "00:00";
      const bTime = b.time || "00:00";
      const compareTime = aTime.localeCompare(bTime);
      return sortOrder === "desc" ? -compareTime : compareTime;
    });
  }, [
    groupedBaseBookings,
    searchQuery,
    sortOrder,
    users,
  ]);

  const handlePaidChange = async (
    entry: GroupedGuestBooking,
    isPaid: boolean,
  ) => {
    if (!isAdmin) {
      console.warn("Only admins are allowed to update paid status");
      return;
    }
    setUpdatingPaidId(entry.id);
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      await Promise.all(
        entry.slotIds.map((slotId) =>
          updateBookingPaidStatus(
            vereinsId,
            slotId,
            isPaid,
            isPaid ? todayStr : null,
          ),
        ),
      );
    } catch (error) {
      console.error("Error updating paid status for guest booking:", error);
    } finally {
      setUpdatingPaidId(null);
    }
  };

  const handlePaidDateChange = async (
    entry: GroupedGuestBooking,
    newDate: string,
  ) => {
    if (!isAdmin) return;
    setUpdatingPaidId(entry.id);
    try {
      await Promise.all(
        entry.slotIds.map((slotId) =>
          updateBookingPaidDate(vereinsId, slotId, newDate || null),
        ),
      );
    } catch (error) {
      console.error("Error updating paid date for guest booking:", error);
    } finally {
      setUpdatingPaidId(null);
    }
  };

  const formatDisplayDate = (dStr?: string | null) => {
    if (!dStr) return "-";
    try {
      const parts = dStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      return new Date(dStr).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dStr;
    }
  };

  const getBookingRuleDetails = (
    b: GroupedGuestBooking,
    resolvedHours: number,
    count: number,
  ) => {
    const threshold = settings?.feeSettings?.youth_age_threshold ?? 18;
    const adults = b.adultGuestCount;
    const youth = b.youthGuestCount;

    let ruleSentenceText = "";
    let ruleName = b.appliedFeeRuleName || "";

    if (settings?.feeSettings) {
      try {
        const feeCtx = buildBookingFeeContext({
          players: b.players || [],
          durationMinutes: Math.round(resolvedHours * 60),
          time: b.time,
          guestCount: count,
          adultGuestCount: adults,
          youthGuestCount: youth,
          membersList: Object.values(users) as any[],
          youthAgeThreshold: threshold,
        });
        const feeRes = calculateBookingFee(
          feeCtx,
          settings.feeSettings,
          settings.reservationRules,
        );
        ruleSentenceText = feeRes.ruleSentence;
        if (!ruleName && feeRes.matchedRuleName) {
          ruleName = feeRes.matchedRuleName;
        }
      } catch (e) {
        console.warn("Could not calculate fee sentence:", e);
      }
    }

    if (!ruleSentenceText) {
      const modeDesc =
        b.guestBillingMode === "per_court"
          ? "pro Platzstunde"
          : "pro Gast";
      const unitRate =
        b.primaryBooking.guestFee !== undefined
          ? b.primaryBooking.guestFee
          : guestFee;
      ruleSentenceText = `WENN Buchung mit ${count} Gast/Gästen (${adults} Erw., ${youth} Jug.) für ${resolvedHours} Std., DANN berechne ${unitRate.toFixed(2).replace(".", ",")} € ${modeDesc}.`;
    }

    if (!ruleName || ruleName === "Standard-Regel") {
      ruleName =
        b.guestBillingMode === "per_court"
          ? "Pauschal pro Platzstunde"
          : "Standardregel";
    } else {
      ruleName = ruleName.replace(/Standard-Regel/g, "Standardregel");
    }

    if (ruleSentenceText) {
      ruleSentenceText = ruleSentenceText.replace(/Standard-Regel/g, "Standardregel");
    }

    return {
      threshold,
      adults,
      youth,
      ruleName,
      ruleSentenceText,
    };
  };

  const handleOpenAddModal = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setEditingBooking(null);
    setEditingGroupEntry(null);
    setBDate(todayStr);
    setBTime("12:00");
    setBEndTime("13:00");
    setBCourt("Ohne Termin");

    const userList = (Object.values(users) as User[]);
    if (userList.length > 0) {
      setBUserId(userList[0].id || userList[0].name);
    } else {
      setBUserId("");
    }

    setBGuestCount(1);
    setBGuestFee(guestFee);
    setBBillingMode(defaultGlobalBillingMode);
    setBIsPaid(false);
    setBPaidDate("");
    setBComment("");
    setBIsManual(true);
    
    setIsClosing(false);
    setIsAnimatingIn(false);
    setIsModalOpen(true);
    setTimeout(() => setIsAnimatingIn(true), 10);
  };

  const handleOpenEditModal = (entry: GroupedGuestBooking) => {
    setEditingGroupEntry(entry);
    setEditingBooking(entry.primaryBooking);
    setBDate(entry.date);
    setBTime(entry.time || "12:00");
    setBCourt(entry.court || "Ohne Termin");

    const matchedUser = (Object.values(users) as User[]).find((u) => {
      const uFullName =
        u.klarname ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.name;
      return (
        entry.bookedBy === u.id ||
        entry.players.includes(u.name) ||
        entry.players.includes(uFullName)
      );
    });

    if (matchedUser) {
      setBUserId(matchedUser.id || matchedUser.name);
    } else {
      const firstUser = (Object.values(users) as User[])[0];
      setBUserId(firstUser?.id || firstUser?.name || "");
    }

    setBEndTime(entry.endTime || "13:00");

    setBGuestCount(entry.guestCount || 1);
    setBGuestFee(
      entry.primaryBooking.guestFee !== undefined
        ? entry.primaryBooking.guestFee
        : guestFee,
    );
    setBBillingMode(
      entry.guestBillingMode || defaultGlobalBillingMode,
    );
    setBIsPaid(!!entry.isPaid);
    setBPaidDate(entry.paidDate || "");
    setBComment(entry.comment || "");
    setBIsManual(!!entry.isManualGuestEntry);
    
    setIsClosing(false);
    setIsAnimatingIn(false);
    setIsModalOpen(true);
    setTimeout(() => setIsAnimatingIn(true), 10);
  };

  const handleSaveModalBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bDate) {
      alert(t("guests.alertSelectDate", "Bitte ein Datum auswählen."));
      return;
    }

    let finalPlayerName = "";
    let finalBookedBy = "";

    const selectedUser = (Object.values(users) as User[]).find(
      (u) => u.id === bUserId || u.name === bUserId,
    );
    if (selectedUser) {
      finalPlayerName =
        selectedUser.klarname ||
        `${selectedUser?.firstName || ""} ${selectedUser?.lastName || ""}`.trim() ||
        selectedUser.name;
      finalBookedBy = selectedUser.id;
    } else {
      alert(t("guests.alertSelectMember", "Bitte einen Vereinsspieler / Einlader aus der Liste auswählen."));
      return;
    }

    // If editing a grouped court booking with multiple or single regular slots
    if (editingGroupEntry && !editingGroupEntry.isManualGuestEntry) {
      try {
        for (const slot of editingGroupEntry.allSlots) {
          const updatedSlot: Booking = {
            ...slot,
            players: [
              finalPlayerName,
              ...slot.players.filter((p) => p.toLowerCase().includes("gast")),
            ],
            guestCount: bGuestCount,
            bookedBy: finalBookedBy || slot.bookedBy,
            comment: bComment || undefined,
            isPaid: bIsPaid,
            paidDate: bIsPaid
              ? bPaidDate || new Date().toISOString().split("T")[0]
              : null,
            guestFee: bGuestFee,
            guestBillingMode: bBillingMode,
          };
          await saveBooking(vereinsId, updatedSlot);
        }
        handleCloseModal();
      } catch (err: any) {
        console.error("Error updating grouped guest booking:", err);
        alert(t("guests.errorSaving", "Fehler beim Speichern: ") + err.message);
      }
      return;
    }

    // Otherwise saving manual guest entry
    const calculatedHours = calculateHoursBetween(bTime, bEndTime);
    const bId =
      editingBooking?.id ||
      `manual_guest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const savedB: Booking = {
      id: bId,
      date: bDate,
      time: bTime,
      court: bCourt,
      players: [finalPlayerName],
      guestCount: bGuestCount,
      isLocked: false,
      hasBallMachine: false,
      bookedBy: finalBookedBy || undefined,
      comment: bComment || undefined,
      isPaid: bIsPaid,
      paidDate: bIsPaid
        ? bPaidDate || new Date().toISOString().split("T")[0]
        : null,
      guestFee: bGuestFee,
      guestBillingMode: bBillingMode,
      hours: calculatedHours,
      isManualGuestEntry: bIsManual,
      createdBy: editingBooking?.createdBy || currentUser.name || "unbekannt",
    };

    try {
      await saveBooking(vereinsId, savedB);
      handleCloseModal();
    } catch (err: any) {
      console.error("Error saving guest game:", err);
      alert(t("guests.errorSaving", "Fehler beim Speichern: ") + err.message);
    }
  };

  const handleDeleteBooking = async () => {
    if (!confirm(t("guests.confirmDelete", "Möchtest du dieses Gastspiel wirklich löschen?"))) return;
    try {
      if (editingGroupEntry) {
        for (const slotId of editingGroupEntry.slotIds) {
          await deleteBooking(vereinsId, slotId);
        }
      } else if (editingBooking) {
        await deleteBooking(vereinsId, editingBooking.id);
      }
      handleCloseModal();
    } catch (err: any) {
      console.error("Error deleting guest game:", err);
      alert(t("guests.errorDeleting", "Fehler beim Löschen: ") + err.message);
    }
  };

  const handleDownloadCSV = () => {
    if (!isAdmin) return;

    let csvContent =
      "\uFEFFDatum;Zeitraum;Platz;Vereinsspieler;Gaeste;Erwachsene;Jugendliche;Dauer (Std);Abrechnung;Gebuehr;Bezahlt;Bezahlt am\n";

    guestBookings.forEach((b) => {
      const member =
        b.players.find((p) => !p.toLowerCase().includes("gast")) ||
        b.bookedBy ||
        "Unbekannt";
      const count = b.guestCount || 1;
      const adults = b.adultGuestCount;
      const youth = b.youthGuestCount;
      const zeitraum = b.isManualGuestEntry
        ? "Ohne Termin"
        : `${b.time} - ${b.endTime}`;
      const countBillingMode = b.guestBillingMode || defaultGlobalBillingMode;

      const billingModeLabel =
        countBillingMode === "per_court" ? "pro Platzstunde" : "pro Gast";
      const paidStatus = b.isPaid ? "Ja" : "Nein";
      const paidDateStr = b.paidDate || (b.isPaid ? b.date : "");
      const row = `${b.date};${zeitraum};${b.court || "Ohne Termin"};${member};${count};${adults};${youth};${b.hours.toFixed(1).replace(".", ",")};${billingModeLabel};${b.totalFee.toFixed(2).replace(".", ",")} €;${paidStatus};${paidDateStr}`;
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `gastspiele_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      {/* 1. TOP HEADER CARD (Matches Ranking.tsx) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-5">
        <div className={`flex flex-row justify-between items-center gap-2 md:gap-4 ${!isAdmin ? "hidden md:flex" : "flex"}`}>
          <div className="hidden md:flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">
                  {t("guests.headerTitle", "Gastspiele")}
                </h3>
              </div>
              <p className="text-xs text-slate-500 font-medium tracking-wide mt-1">
                {isAdmin
                  ? t("guests.adminSubtitle", "Übersicht aller Spielstunden mit externen Gästen")
                  : t("guests.memberSubtitle", "Gaststunden im Überblick")}
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadCSV}
                className="bg-[var(--color-primary)] text-white hover:bg-black uppercase tracking-widest px-3 md:px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer border border-transparent outline-none whitespace-nowrap text-xs font-medium"
                title="CSV Export"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t("guests.csvExport", "CSV EXPORT")}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN CONTENT CARD (Matches Ranking.tsx) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-4 md:p-6 flex flex-col w-full min-h-[300px]">
        {/* Filters and Search Bar Section (nur anzeigen, wenn Gastspiele vorhanden sind) */}
        {baseBookings.length > 0 && (
          <div className="flex flex-col-reverse md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-50/70 p-3 md:p-4 rounded-2xl border border-slate-150 mb-4 md:mb-6">
            <div className="flex flex-wrap items-center gap-3">
              {availableYears.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                    className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-[var(--color-primary)] transition-colors flex items-center gap-1 bg-slate-200/50 hover:bg-slate-200/80 px-2 py-1 rounded-lg cursor-pointer select-none"
                    title={sortOrder === "desc" ? t("guests.sortToggleDesc", "Sortierung umkehren (Aktuell: Neueste zuerst)") : t("guests.sortToggleAsc", "Sortierung umkehren (Aktuell: Älteste zuerst)")}
                  >
                    {t("guests.year", "Jahr:")}
                    <i className={`fa-solid fa-arrow-${sortOrder === "desc" ? "down" : "up"}-long text-[10px] text-[var(--color-primary)]`} />
                  </button>
                  <select 
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] shadow-sm py-2 font-sans font-medium"
                  >
                    <option value="all">{t("guests.allYears", "Alle Jahre")}</option>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* Active search filter badge on desktop */}
              {searchQuery.trim() && (
                <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-medium shadow-3xs animate-in fade-in duration-150">
                  <Search className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>{t("guests.filterActive", "Filter:")} <strong className="font-bold">&quot;{searchQuery}&quot;</strong></span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="ml-1 text-emerald-700 hover:text-emerald-950 p-0.5 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer"
                    title={t("guests.clearFilter", "Filter zurücksetzen")}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Search Input for admins only */}
            {isAdmin && (
              <div className="relative flex-1 w-full md:hidden">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <input 
                  type="text"
                  value={searchQuery}
                  aria-label={t("guests.searchAria", "Gastspiele suchen")}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("guests.searchPlaceholderAdmin", "Datum, Spieler oder Platz...")}
                  className="w-full pl-9 pr-8 bg-white border border-slate-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] shadow-sm py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Table Content */}
        {baseBookings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <AlertCircle className="w-7 h-7" />
            </div>
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
              {t("guests.emptyTitle", "Keine Gastspiele registriert")}
            </p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {t("guests.emptyDesc", "Einträge erscheinen hier automatisch, sobald bei einer Platzbuchung Gastspieler hinzugefügt werden.")}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="overflow-x-auto rounded-2xl border border-slate-150 shadow-sm hidden md:block min-h-[220px]">
              <table className="w-full text-left border-collapse table-fixed min-w-[980px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[10%] relative">
                      <div className="flex items-center gap-1.5">
                        <span>{t("guests.colDate", "Datum")}</span>
                        {isAdmin && (
                          <div className="relative inline-flex items-center" ref={dateSearchRef}>
                            <button
                              type="button"
                              onClick={() => setIsDateSearchOpen((prev) => !prev)}
                              className={`p-1 rounded-md transition-all flex items-center justify-center cursor-pointer ${
                                searchQuery.trim()
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                                  : isDateSearchOpen
                                    ? "bg-slate-200 text-slate-800"
                                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
                              }`}
                              title={t("guests.filterDateTitle", "Gastspiele filtern")}
                              aria-label={t("guests.filterDateTitle", "Gastspiele filtern")}
                            >
                              <Search className="w-3 h-3" />
                            </button>

                            {searchQuery.trim() && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSearchQuery("");
                                }}
                                className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title={t("guests.clearFilter", "Filter zurücksetzen")}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}

                            {isDateSearchOpen && (
                              <div
                                className="absolute left-0 top-full mt-2 z-40 bg-white rounded-xl shadow-xl border border-slate-200 p-2.5 w-64 normal-case font-normal animate-in fade-in zoom-in-95 duration-150"
                              >
                                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    {t("guests.filterPopoverTitle", "Filter / Suche")}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setIsDateSearchOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="relative">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setIsDateSearchOpen(false);
                                    }}
                                    placeholder={t("guests.searchPlaceholderAdmin", "Datum, Spieler oder Platz...")}
                                    className="w-full pl-7 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] font-sans text-slate-800 placeholder:text-slate-400"
                                  />
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                                  {searchQuery && (
                                    <button
                                      type="button"
                                      onClick={() => setSearchQuery("")}
                                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {searchQuery && (
                                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                                    <span>
                                      {guestBookings.length} {guestBookings.length === 1 ? t("guests.matchSingular", "Eintrag") : t("guests.matchPlural", "Einträge")}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setSearchQuery("")}
                                      className="text-rose-600 hover:underline font-semibold cursor-pointer"
                                    >
                                      {t("guests.resetFilter", "Zurücksetzen")}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[11%]">
                      {t("guests.colTimeframe", "Zeitraum")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[8%]">
                      {t("guests.colCourt", "Platz")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest w-[16%]">
                      {t("guests.colMember", "Vereinsspieler")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[7%]">
                      {t("guests.colGuests", "Gäste")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[6%]">
                      {t("guests.colHours", "Stunden")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[11%]">
                      {t("guests.colBilling", "Abrechnung")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-right w-[7%]">
                      {t("guests.colFee", "Gebühr")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[5%]">
                      {t("guests.colPaid", "Bezahlt?")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[11%]">
                      {t("guests.colPaidDate", "Bezahlt am")}
                    </th>
                    <th className="p-4 text-[9px] font-black text-slate-600 uppercase tracking-widest text-center w-[8%]">
                      {t("guests.colDetails", "Details")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {guestBookings.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-medium text-xs">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Search className="w-6 h-6 text-slate-300 stroke-[1.5]" />
                          <p>
                            {t("guests.noSearchResults", "Keine Gastspiele für")} &quot;{searchQuery}&quot; {t("guests.found", "gefunden.")}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-xs text-[var(--color-primary)] font-bold hover:underline cursor-pointer"
                          >
                            {t("guests.resetFilter", "Filter zurücksetzen")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    guestBookings.map((b, i) => {
                    const isEn = (i18n.language || "de").startsWith("en");
                    const member =
                      b.players.find(
                        (p) => !p.toLowerCase().includes("gast"),
                      ) ||
                      b.bookedBy ||
                      t("common.unknown", "Unbekannt");
                    const count = b.guestCount || 1;
                    const resolvedHours = b.hours;

                    const zeitraum = b.isManualGuestEntry
                      ? t("guests.unscheduled", "Ohne Termin")
                      : b.time
                        ? (isEn ? `${b.time} - ${b.endTime}` : `${b.time} - ${b.endTime} Uhr`)
                        : t("common.unknown", "Unbekannt");

                    const countBillingMode =
                      b.guestBillingMode || defaultGlobalBillingMode;
                    const fee = b.totalFee;

                    const isUpdating =
                      updatingPaidId === b.id ||
                      b.slotIds.includes(updatingPaidId || "");
                    const isExpanded = expandedBookingIds.has(b.id);
                    const ruleDetails = getBookingRuleDetails(b, resolvedHours, count);

                    return (
                      <React.Fragment key={b.id || `guestb-${i}`}>
                        <tr
                          className={`hover:bg-slate-50/70 transition-colors ${isExpanded ? "bg-slate-50/50" : ""}`}
                        >
                          {/* 1. Datum */}
                          <td className="p-4 font-normal text-sm text-slate-600 font-sans whitespace-nowrap">
                            {new Date(b.date).toLocaleDateString(isEn ? "en-US" : "de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </td>

                          {/* 2. Zeitraum */}
                          <td className="p-4 font-normal text-sm text-slate-600 font-sans whitespace-nowrap">
                            {zeitraum}
                          </td>

                          {/* 3. Platz */}
                          <td className="p-4 font-normal text-sm text-slate-600 font-sans whitespace-nowrap">
                            {b.court || t("guests.unscheduled", "Ohne Termin")}
                          </td>

                          {/* 4. Vereinsspieler - font-medium für harmonische Hierarchie */}
                          <td className="p-4 font-medium text-sm text-slate-700 font-sans truncate" title={member}>
                            {member}
                          </td>

                          {/* 5. Gäste (mit Altersgruppen-Aufschlüsselung) */}
                          <td className="p-4 text-center font-sans">
                            <div className="font-normal text-sm text-slate-700">{count}</div>
                            <div className="text-[10px] text-slate-400 font-normal leading-tight mt-0.5 whitespace-nowrap">
                              {ruleDetails.adults} Erw. • {ruleDetails.youth} Jug.
                            </div>
                          </td>

                          {/* 6. Stunden */}
                          <td className="p-4 font-normal text-sm text-slate-600 text-center font-sans whitespace-nowrap">
                            {resolvedHours % 1 === 0 ? resolvedHours : resolvedHours.toFixed(1).replace(".", ",")} {t("guests.hoursShort", "Std.")}
                          </td>

                          {/* 7. Abrechnung */}
                          <td className="p-4 text-center font-sans">
                            <div className="font-normal text-sm text-slate-600">
                              {countBillingMode === "per_court"
                                ? t("guests.perCourtHour", "pro Platzstunde")
                                : t("guests.perGuestUnit", "pro Gast")}
                            </div>
                            {ruleDetails.ruleName && (
                              <div className="text-[11px] text-slate-400 font-normal mt-0.5 max-w-[140px] truncate mx-auto" title={ruleDetails.ruleName}>
                                {ruleDetails.ruleName}
                              </div>
                            )}
                          </td>

                          {/* 8. Gebühr - font-semibold zur optischen Hervorhebung */}
                          <td className="p-4 font-semibold text-sm text-slate-900 text-right font-sans whitespace-nowrap">
                            {fee.toFixed(2).replace(".", ",")} €
                          </td>

                          {/* 9. Bezahlt? */}
                          <td className="p-4 text-center align-middle whitespace-nowrap">
                            {isAdmin ? (
                              <div className="flex items-center justify-center">
                                <label className="relative flex items-center justify-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!b.isPaid}
                                    disabled={isUpdating}
                                    onChange={(e) =>
                                      handlePaidChange(b, e.target.checked)
                                    }
                                    className={`w-4 h-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)] shadow-sm transition-opacity ${isUpdating ? "opacity-30" : "opacity-100"}`}
                                  />
                                </label>
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                {b.isPaid ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100/80 border border-emerald-200 rounded-lg">
                                    <Check className="w-2.5 h-2.5 stroke-[3px]" />{" "}
                                    {t("guests.paid", "Bezahlt")}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black uppercase text-slate-500 bg-slate-100 border border-slate-200 rounded-lg">
                                    {t("guests.unpaid", "Offen")}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 10. Bezahlt am */}
                          <td className="px-2 py-4 text-center align-middle whitespace-nowrap font-normal text-sm text-slate-600">
                            {isAdmin ? (
                              b.isPaid ? (
                                <input
                                  type="date"
                                  value={b.paidDate || ""}
                                  onChange={(e) => handlePaidDateChange(b, e.target.value)}
                                  className="w-[118px] max-w-full bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] shadow-sm font-sans cursor-pointer"
                                  title={t("guests.editPaidDateTooltip", "Zahlungsdatum anpassen")}
                                />
                              ) : (
                                <span className="text-slate-300 text-xs font-mono">-</span>
                              )
                            ) : (
                              b.isPaid && b.paidDate ? (
                                <span className="text-xs text-slate-600 font-sans">
                                  {formatDisplayDate(b.paidDate)}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs font-mono">-</span>
                              )
                            )}
                          </td>

                          {/* 11. Details & Aktionen */}
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleExpand(b.id)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isExpanded ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:text-[var(--color-primary)] hover:bg-slate-100"}`}
                                title={isExpanded ? t("guests.collapseDetails", "Details ausblenden") : t("guests.expandDetails", "Details / Regelnotation anzeigen")}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(b)}
                                  className="p-1.5 text-slate-500 hover:text-[var(--color-primary)] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title={t("guests.editTooltip", "Bearbeiten / Stundensatz anpassen")}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Row for Details - ruhiger, leicht abgesetzter Bereich ohne Box-in-Box */}
                        {isExpanded && (
                          <tr className="bg-gray-50/50 border-b border-slate-200">
                            <td colSpan={11} className="px-6 pt-3 pb-4">
                              <div className="flex flex-col gap-1.5 font-sans">
                                {/* Aufschlüsselung der Gäste & Regel */}
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="font-medium text-slate-700">
                                    {ruleDetails.adults} {ruleDetails.adults === 1 ? "Erwachsener" : "Erwachsene"}, {ruleDetails.youth} {ruleDetails.youth === 1 ? "Jugendlicher" : "Jugendliche"}{ruleDetails.youth > 0 ? ` (< ${ruleDetails.threshold} J.)` : ""}
                                  </span>
                                  {ruleDetails.ruleName && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-slate-500">
                                        Regel: <span className="font-medium text-slate-700">{ruleDetails.ruleName}</span>
                                      </span>
                                    </>
                                  )}
                                  {b.comment && !["gastspiel", "gastspieler"].includes(b.comment.trim().toLowerCase()) && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="italic text-slate-500">
                                        „{b.comment}“
                                      </span>
                                    </>
                                  )}
                                </div>

                                {/* Reiner Erklärungstext der Regel als Fließtext */}
                                <p className="text-sm text-gray-600 pl-5.5 leading-relaxed">
                                  {ruleDetails.ruleSentenceText}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="flex flex-col gap-3 md:hidden">
              {guestBookings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-400 text-xs shadow-sm">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Search className="w-6 h-6 text-slate-300 stroke-[1.5]" />
                    <p>
                      {t("guests.noSearchResults", "Keine Gastspiele für")} &quot;{searchQuery}&quot; {t("guests.found", "gefunden.")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-xs text-[var(--color-primary)] font-bold hover:underline cursor-pointer"
                    >
                      {t("guests.resetFilter", "Filter zurücksetzen")}
                    </button>
                  </div>
                </div>
              ) : (
                guestBookings.map((b, i) => {
                const isEn = (i18n.language || "de").startsWith("en");
                const member =
                  b.players.find((p) => !p.toLowerCase().includes("gast")) ||
                  b.bookedBy ||
                  t("common.unknown", "Unbekannt");
                const count = b.guestCount || 1;
                const resolvedHours = b.hours;

                const zeitraum = b.isManualGuestEntry
                  ? t("guests.unscheduled", "Ohne Termin")
                  : b.time
                    ? (isEn ? `${b.time} - ${b.endTime}` : `${b.time} - ${b.endTime} Uhr`)
                    : t("common.unknown", "Unbekannt");

                const countBillingMode =
                  b.guestBillingMode || defaultGlobalBillingMode;
                const countGuestFee =
                  b.primaryBooking.guestFee !== undefined ? b.primaryBooking.guestFee : guestFee;

                const fee = b.totalFee;

                const isUpdating =
                  updatingPaidId === b.id ||
                  b.slotIds.includes(updatingPaidId || "");
                const isExpanded = expandedBookingIds.has(b.id);
                const ruleDetails = getBookingRuleDetails(b, resolvedHours, count);

                return (
                  <div
                    key={`mc-${b.id || i}`}
                    className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex flex-col gap-2.5"
                  >
                    <div className="flex justify-between items-center w-full">
                      <div className="font-black text-[13px] text-[var(--color-primary)]">
                        {new Date(b.date).toLocaleDateString(isEn ? "en-US" : "de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </div>
                      <div>
                        {b.isPaid ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <Check className="w-2.5 h-2.5 stroke-[3px]" />{" "}
                            {t("guests.paid", "Bezahlt")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                            {fee.toFixed(2).replace(".", ",")} € {t("guests.unpaidAmount", "offen")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] font-bold text-slate-600">
                      {zeitraum} • {resolvedHours % 1 === 0 ? resolvedHours : resolvedHours.toFixed(1).replace(".", ",")} {t("guests.hoursShort", "Std.")} • {b.court || t("guests.unscheduled", "Ohne Termin")}
                    </div>

                    <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                      <span>{count} {count === 1 ? t("guests.singleGuest", "Gast") : t("guests.multipleGuests", "Gäste")}:</span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                        {ruleDetails.adults} Erw. • {ruleDetails.youth} Jug.
                      </span>
                    </div>

                    <div className="text-[10px] font-semibold text-slate-400">
                      {t("guests.mode", "Modus:")}{" "}
                      {countBillingMode === "per_court"
                        ? t("guests.perCourtHour", "pro Platzstunde")
                        : t("guests.perGuestUnit", "pro Gast")}{" "}
                      ({countGuestFee.toFixed(2).replace(".", ",")} €/{t("guests.perHour", "Std.")})
                      {ruleDetails.ruleName && ` • ${ruleDetails.ruleName}`}
                    </div>

                    {/* Expandable details button for mobile */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExpand(b.id)}
                        className="text-[10px] font-bold text-slate-500 hover:text-[var(--color-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? t("guests.collapseDetails", "Details verbergen") : t("guests.expandDetails", "Details / Regelnotation")}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1.5 animate-in fade-in duration-150">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium text-[11px]">
                            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              {ruleDetails.adults} {ruleDetails.adults === 1 ? "Erwachsener" : "Erwachsene"}, {ruleDetails.youth} {ruleDetails.youth === 1 ? "Jugendlicher" : "Jugendliche"}
                            </span>
                            {ruleDetails.ruleName && (
                              <span className="text-slate-500 font-normal">
                                • Regel: <span className="font-medium text-slate-700">{ruleDetails.ruleName}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 pl-5 leading-relaxed">
                            {ruleDetails.ruleSentenceText}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Member and Payment Info */}
                    <div className="mt-2 pt-2.5 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <div className="text-[11px] font-bold text-slate-500">
                          {t("guests.player", "Spieler:")}{" "}
                          <span className="text-sm font-semibold text-[var(--color-primary)]">
                            {member}
                          </span>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(b)}
                            className="p-1.5 text-slate-500 hover:text-[var(--color-primary)] hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                            title={t("guests.editTooltip", "Bearbeiten / Stundensatz anpassen")}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {isAdmin ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-150">
                          <div className="flex items-center gap-1.5 cursor-pointer">
                            <label className="cursor-pointer text-[9px] uppercase font-black tracking-widest text-slate-500">
                              {t("guests.colPaid", "Bezahlt?")}
                            </label>
                            <input
                              type="checkbox"
                              checked={!!b.isPaid}
                              disabled={isUpdating}
                              onChange={(e) =>
                                handlePaidChange(b, e.target.checked)
                              }
                              className={`w-4 h-4 cursor-pointer rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)] shadow-sm transition-opacity ${isUpdating ? "opacity-30" : "opacity-100"}`}
                            />
                          </div>
                          {b.isPaid && (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] uppercase font-bold text-slate-400">Am:</span>
                              <input
                                type="date"
                                value={b.paidDate || ""}
                                onChange={(e) => handlePaidDateChange(b, e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] text-slate-700 outline-none font-sans"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        b.isPaid && b.paidDate && (
                          <div className="text-[10px] text-slate-500">
                            {t("guests.colPaidDate", "Bezahlt am")}: <span className="font-bold">{formatDisplayDate(b.paidDate)}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </>
        )}
      </div>

      {/* Polish Modal Popup for Manual Adding / Retroactive Editing as right-side slider */}
      {isModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
          onClick={handleCloseModal}
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
            <div 
              className="bg-[var(--color-primary)] p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden"
            >
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
                  {t("guests.drawerTitle", "Gastspiel Details")}
                </h3>
                <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 opacity-75" />
                  {t("guests.drawerSubtitle", "Gastspiel einsehen")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveModalBooking} className="flex-1 flex flex-col min-h-0 bg-white">
              <div className="bg-white p-5 pb-6 space-y-4 overflow-y-auto flex-1 text-slate-700">
                {/* Manual vs Scheduled Indication */}
                {editingBooking && !editingBooking.isManualGuestEntry && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-[10px] font-semibold leading-relaxed">
                    {t("guests.regularBookingNote", "Dieses Gastspiel stammt aus einer regulären Kalenderbuchung. Datum, Zeit und Platz sind schreibgeschützt und können im Kalender geändert werden.")}
                  </div>
                )}

                {/* Date, Time, Court Grid (Editable only if manual) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelDate", "Datum")}
                    </label>
                    <input 
                      type="date"
                      required
                      disabled={
                        editingBooking && !editingBooking.isManualGuestEntry
                      }
                      value={bDate}
                      onChange={(e) => setBDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelCourt", "Platz / Ort")}
                    </label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Ohne Termin"
                      disabled={
                        editingBooking && !editingBooking.isManualGuestEntry
                      }
                      value={bCourt}
                      onChange={(e) => setBCourt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Time inputs and calculated duration */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelStartTime", "Anfangszeit")}
                    </label>
                    <input 
                      type="time"
                      required
                      disabled={
                        editingBooking && !editingBooking.isManualGuestEntry
                      }
                      value={bTime}
                      onChange={(e) => setBTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelEndTime", "Endzeit")}
                    </label>
                    <input 
                      type="time"
                      required
                      disabled={
                        editingBooking && !editingBooking.isManualGuestEntry
                      }
                      value={bEndTime}
                      onChange={(e) => setBEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelDuration", "Dauer (Std.)")}
                    </label>
                    <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[11px] font-black text-emerald-800 text-center flex items-center justify-center min-h-[34px]">
                      {calculateHoursBetween(bTime, bEndTime)
                        .toFixed(2)
                        .replace(".", ",")}{" "}
                      {t("guests.hoursShort", "Std.")}
                    </div>
                  </div>
                </div>

                {/* Invitation Member Selection */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider">
                    {t("guests.labelMember", "Vereinsspieler / Einlader")}
                  </label>
                  <select 
                    value={bUserId}
                    onChange={(e) => setBUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] py-2 font-sans font-medium"
                  >
                    {(Object.values(users) as User[])
                      .sort((a, b) => {
                        const nameA =
                          a.klarname ||
                          `${a.firstName || ""} ${a.lastName || ""}`.trim() ||
                          a.name;
                        const nameB =
                          b.klarname ||
                          `${b.firstName || ""} ${b.lastName || ""}`.trim() ||
                          b.name;
                        return nameA.localeCompare(nameB);
                      })
                      .map((u) => {
                        const fullName =
                          u.klarname ||
                          `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                          u.name;
                        return (
                          <option key={u.id || u.name} value={u.id}>
                            {fullName} ({u.name})
                          </option>
                        );
                      })}
                  </select>
                </div>

                {/* Guest Counts and Pricing Modus */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelGuestCount", "Anzahl Gäste")}
                    </label>
                    <input 
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={bGuestCount}
                      onChange={(e) => setBGuestCount(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      {t("guests.labelHourlyRate", "Stundensatz pro Einheit (€)")}
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={bGuestFee}
                      onChange={(e) => setBGuestFee(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] font-mono py-2 font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Live Fee Calculation Preview */}
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex justify-between items-center select-none">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                    {t("guests.fee", "Gebühr")}
                  </span>
                  <span className="text-sm font-black text-[var(--color-accent)] font-mono">
                    {(() => {
                      const hours = calculateHoursBetween(bTime, bEndTime);
                      let fee = 0;
                      if (bGuestCount > 0) {
                        if (bBillingMode === "per_court") {
                          fee = bGuestFee * hours;
                        } else {
                          fee = bGuestFee * hours * bGuestCount;
                        }
                      }
                      return fee.toFixed(2).replace(".", ",");
                    })()}{" "}
                    €
                  </span>
                </div>

                {/* Payment and Comments */}
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                    {t("guests.billingNote", "Abrechnungs-Notiz")}
                  </label>
                  <textarea
                    rows={2}
                    maxLength={250}
                    placeholder={t("guests.billingNotePlaceholder", "Interner Vermerk (z.b. Clubabend, Training oder Gutschein)...")}
                    value={bComment}
                    onChange={(e) => setBComment(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] resize-none font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>

                {isAdmin ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="bIsPaidCheckbox"
                        checked={bIsPaid}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBIsPaid(checked);
                          if (checked && !bPaidDate) {
                            setBPaidDate(new Date().toISOString().split("T")[0]);
                          } else if (!checked) {
                            setBPaidDate("");
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)] shadow-sm font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                      />
                      <label
                        htmlFor="bIsPaidCheckbox"
                        className="text-xs font-bold text-slate-700 cursor-pointer select-none"
                      >
                        {t("guests.markAsPaid", 'Als "Bezahlt" markieren')}
                      </label>
                    </div>
                    {bIsPaid && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {t("guests.colPaidDate", "Bezahlt am")}
                        </label>
                        <input
                          type="date"
                          value={bPaidDate || new Date().toISOString().split("T")[0]}
                          onChange={(e) => setBPaidDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 text-[11px] text-slate-700 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] py-2 font-sans font-medium"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-500">{t("guests.statusLabel", "Status:")}</span>
                    {bIsPaid ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100/80 border border-emerald-200 rounded-lg">
                        <Check className="w-2.5 h-2.5 stroke-[3px]" /> {t("guests.paid", "Bezahlt")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black uppercase text-slate-500 bg-slate-100 border border-slate-200 rounded-lg">
                        {t("guests.unpaid", "Offen")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-3 shrink-0">
                <button
                  type="submit"
                  className="flex-1 bg-[var(--color-primary)] hover:bg-black text-white rounded-xl shadow hover:brightness-95 transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 py-2.5 text-sm font-semibold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> {t("guests.save", "Speichern")}
                </button>
                {(editingGroupEntry || (editingBooking && editingBooking.isManualGuestEntry)) && (
                  <button
                    type="button"
                    onClick={handleDeleteBooking}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer outline-none"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t("guests.delete", "LÖSCHEN")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-6 bg-white border border-slate-300 text-slate-700 font-bold py-2.5 rounded-xl shadow-sm transition-all uppercase tracking-wider text-xs active:scale-95 cursor-pointer"
                >
                  {t("guests.cancel", "Abbrechen")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminGuests;
