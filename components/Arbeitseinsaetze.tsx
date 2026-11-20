import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { User, Role, ArbeitsEinsatz, ArbeitsEinsatzAuditEntry } from "../types";
import {
  listenToArbeitseinsaetze,
  saveArbeitseinsatz,
  updateArbeitseinsatzParticipation,
  deleteArbeitseinsatz,
} from "../services/db";
import { motion, AnimatePresence } from "motion/react";
import { Briefcase, Search } from "lucide-react";

interface ArbeitseinsaetzeProps {
  currentUser: User;
  users: Record<string, User>;
  settings: any;
  onSaveSettings: (settings: any) => Promise<void>;
  primaryColor?: string;
  accentColor?: string;
}

const ITEMS_PER_PAGE = 25;

const Arbeitseinsaetze: React.FC<ArbeitseinsaetzeProps> = ({
  currentUser,
  users,
  settings,
  onSaveSettings,
  primaryColor = "#1b4332",
  accentColor = "#c04d2b",
}) => {
  const currentClubId = settings?.vereinsId || settings?.id || currentUser.vereinsId || "sv-neuhausen";
  const currentYearNum = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);
  const [entries, setEntries] = useState<ArbeitsEinsatz[]>([]);

  const defaultSoll = Number(settings?.arbeitseinsaetzeSettings?.sollStunden ?? settings?.default_soll_stunden ?? 10);
  const rules = settings?.arbeitseinsatz_rules ?? settings?.arbeitseinsaetzeSettings?.rules ?? [];
  
  const getRuleForYear = (year: number) => {
    const sorted = [...rules].sort((a: any, b: any) => b.gueltig_ab_jahr - a.gueltig_ab_jahr);
    const rule = sorted.find((r: any) => r.gueltig_ab_jahr <= year);
    if (rule) {
      return { gueltig_ab_jahr: rule.gueltig_ab_jahr, soll_stunden: Number(rule.soll_stunden) };
    }
    return { gueltig_ab_jahr: year, soll_stunden: defaultSoll };
  };

  const ruleYears = rules.map((r: any) => r.gueltig_ab_jahr);
  const entryYears = entries.map(e => parseInt(e.date.split("-")[0])).filter(y => !isNaN(y));
  const allYearsSet = new Set<number>([currentYearNum, ...ruleYears, ...entryYears]);
  const availableYears = Array.from(allYearsSet).sort((a, b) => b - a);

  const activeRule = getRuleForYear(selectedYear);
  const sollStunden = activeRule.soll_stunden;

  const entriesForSaison = entries.filter(e => {
    return e.date.startsWith(selectedYear.toString());
  });

  const categories = [...(settings?.arbeitseinsaetzeSettings?.categories ?? ["Platzpflege", "Clubheimreinigung", "Bewirtung", "Sonstiges"])].sort((a, b) => a.localeCompare(b, "de"));
  const visibility = settings?.arbeitseinsaetzeSettings?.visibility ?? "full";
  const interval = settings?.arbeitseinsaetzeSettings?.interval ?? "0.5";
  const commentsRequired = settings?.arbeitseinsaetzeSettings?.commentsRequired ?? false;

  const isAdmin = currentUser.role === Role.ADMIN || currentUser.role === Role.SUPER_ADMIN;
  const isListHidden = !isAdmin && visibility === "hidden";
  const showActiveOnly = !isAdmin && visibility === "active_only";

  const getUserSortName = (u: any) => {
    if (!u) return { last: "", first: "" };
    if (u.lastName || u.firstName) {
      return {
        last: (u.lastName || "").trim(),
        first: (u.firstName || "").trim()
      };
    }
    const fullName = (u.klarname || u.name || "").trim();
    const parts = fullName.split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, parts.length - 1).join(" ");
      return { last, first };
    }
    return { last: fullName, first: "" };
  };

  const compareUsersByLastName = (a: any, b: any) => {
    const nameA = getUserSortName(a);
    const nameB = getUserSortName(b);
    const cmp = nameA.last.localeCompare(nameB.last, "de");
    if (cmp !== 0) return cmp;
    return nameA.first.localeCompare(nameB.first, "de");
  };

  const getUserDisplayName = (uOrId: any): string => {
    if (!uOrId) return "Mitglied";
    if (typeof uOrId === "object") {
      const u = uOrId;
      if (u.firstName || u.lastName) {
        return `${u.firstName || ""} ${u.lastName || ""}`.trim();
      }
      return u.klarname || u.name || "Mitglied";
    }
    if (typeof uOrId === "string") {
      if (currentUser && (currentUser.id === uOrId || (currentUser as any).uid === uOrId || (currentUser as any).personId === uOrId)) {
        return getUserDisplayName(currentUser);
      }
      let u: User | undefined = users[uOrId] || (Object.values(users) as User[]).find(x => x.id === uOrId || (x as any).uid === uOrId || (x as any).personId === uOrId);

      // Check by username or name in users
      if (!u) {
        u = (Object.values(users) as User[]).find(x => x.username === uOrId || x.name === uOrId);
      }

      // If still not found, check if editingEntry has this userId
      if (!u && editingEntry && (editingEntry.userId === uOrId || (editingEntry as any).uid === uOrId)) {
        if (editingEntry.userName) {
          u = (Object.values(users) as User[]).find(x => x.username === editingEntry.userName || x.name === editingEntry.userName);
        }
        if (!u && editingEntry.userFullName) {
          return editingEntry.userFullName;
        }
        if (!u && editingEntry.userName) {
          return editingEntry.userName;
        }
      }

      // Check all entries in the logbook
      if (!u) {
        const matchingEntry = entries.find(e => e.userId === uOrId || (e as any).uid === uOrId);
        if (matchingEntry) {
          if (matchingEntry.userName) {
            u = (Object.values(users) as User[]).find(x => x.username === matchingEntry.userName || x.name === matchingEntry.userName);
          }
          if (!u && matchingEntry.userFullName) {
            return matchingEntry.userFullName;
          }
          if (!u && matchingEntry.userName) {
            return matchingEntry.userName;
          }
        }
      }

      if (u) {
        if (u.firstName || u.lastName) {
          return `${u.firstName || ""} ${u.lastName || ""}`.trim();
        }
        return u.klarname || u.name || "Mitglied";
      }
      return uOrId;
    }
    return "Mitglied";
  };

  // Helper to determine presentation of each audit log entry (matching Events module)
  const getAuditLogPresentation = (log: ArbeitsEinsatzAuditEntry) => {
    const act = (log.action || "").toLowerCase();
    if (
      act.includes("ausgetragen") ||
      act.includes("entfernt") ||
      act.includes("gelöscht") ||
      act.includes("abgemeldet") ||
      act.includes("unregister")
    ) {
      return {
        label: "AUSGETRAGEN",
        icon: "fa-user-minus",
        circleBg: "bg-red-500",
        pillBg: "bg-red-100 text-red-600",
      };
    }
    if (
      act.includes("mitwirkender") ||
      act.includes("mitgeholfen") ||
      act.includes("dabei") ||
      act.includes("angemeldet") ||
      act.includes("eingetragen") ||
      act.includes("register")
    ) {
      return {
        label: "EINGETRAGEN",
        icon: "fa-user-check",
        circleBg: "bg-[#1b4332]",
        pillBg: "bg-green-100 text-green-700",
      };
    }
    if (
      act.includes("erstellt") ||
      act.includes("erfasst") ||
      act.includes("angelegt") ||
      act.includes("create")
    ) {
      return {
        label: "ERSTELLT",
        icon: "fa-plus",
        circleBg: "bg-blue-500",
        pillBg: "bg-blue-100 text-blue-600",
      };
    }
    return {
      label: "BEARBEITET",
      icon: "fa-pen",
      circleBg: "bg-amber-500",
      pillBg: "bg-amber-100 text-amber-800",
    };
  };

  // State for Upper Table (Logbook entries)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [viewScope, setViewScope] = useState<"all" | "mine">("all");
  const [sortCol, setSortCol] = useState<"date" | "member" | "createdBy" | "category" | "task" | "hours">("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entrySearchQuery, setEntrySearchQuery] = useState("");

  // State for Audit Log Drawer (Matches Events Audit Log Drawer)
  const [auditModalEntry, setAuditModalEntry] = useState<ArbeitsEinsatz | null>(null);
  const [isAuditAnimatingIn, setIsAuditAnimatingIn] = useState(false);
  const [isAuditClosing, setIsAuditClosing] = useState(false);

  const handleOpenAudit = (entry: ArbeitsEinsatz) => {
    setAuditModalEntry(entry);
    setIsAuditClosing(false);
    setIsAuditAnimatingIn(false);
    setTimeout(() => setIsAuditAnimatingIn(true), 10);
  };

  const handleCloseAudit = () => {
    setIsAuditClosing(true);
    setTimeout(() => {
      setAuditModalEntry(null);
      setIsAuditAnimatingIn(false);
      setIsAuditClosing(false);
    }, 250);
  };

  const handleSort = (col: "date" | "member" | "createdBy" | "category" | "task" | "hours") => {
    if (sortCol === col) setSortDesc(!sortDesc);
    else { setSortCol(col); setSortDesc(true); }
    setEntriesPage(1);
  };

  // State for Lower Table (Users / Leaderboard)
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "fulfilled" | "pending">("all");
  const [userSortCol, setUserSortCol] = useState<"name" | "hours">("name");
  const [userSortDesc, setUserSortDesc] = useState(false);
  const [usersPage, setUsersPage] = useState(1);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleUserSort = (col: "name" | "hours") => {
    if (userSortCol === col) setUserSortDesc(!userSortDesc);
    else { setUserSortCol(col); setUserSortDesc(true); }
    setUsersPage(1);
  };

  // Subscribe to work hours entries
  useEffect(() => {
    const unsubscribe = listenToArbeitseinsaetze(currentClubId, (data) => {
      setEntries(data);
    });
    return () => {
      unsubscribe();
    };
  }, [currentClubId]);

  // Actions State
  const [showDeleteConfirmFor, setShowDeleteConfirmFor] = useState<string | null>(null);

  // Edit Entry State (Admin)
  const [editingEntry, setEditingEntry] = useState<ArbeitsEinsatz | null>(null);
  const [isEditAnimatingIn, setIsEditAnimatingIn] = useState(false);
  const [isEditClosing, setIsEditClosing] = useState(false);
  const [editDate, setEditDate] = useState<string>("");
  const [editHours, setEditHours] = useState<number>(1);
  const [editCategory, setEditCategory] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editSelectedUserIds, setEditSelectedUserIds] = useState<string[]>([]);
  const [editMemberSearchQuery, setEditMemberSearchQuery] = useState<string>("");
  const [editErrorMsg, setEditErrorMsg] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Slider State (New Entry)
  const [isSliderOpen, setIsSliderOpen] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Form State
  const [formDate, setFormDate] = useState("");
  const [formHours, setFormHours] = useState(1);
  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSelectedUserIds, setFormSelectedUserIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Open slider for a new entry
  const handleOpenSlider = () => {
    setErrorMsg("");
    setSuccessMsg("");
    
    const today = new Date().toISOString().split("T")[0];
    setFormDate(today);
    setFormHours(Number(interval) || 1);
    setFormCategory(categories[0] || "Platzpflege");
    setFormDescription("");
    setFormSelectedUserIds(isAdmin ? [currentUser.id] : [currentUser.id]);
    setMemberSearchQuery("");
    
    setIsClosing(false);
    setIsAnimatingIn(false);
    setIsSliderOpen(true);
    setTimeout(() => setIsAnimatingIn(true), 10);
  };

  const handleCloseSlider = () => {
    setIsClosing(true);
    setIsAnimatingIn(false);
    setTimeout(() => {
      setIsSliderOpen(false);
      setIsClosing(false);
    }, 200);
  };

  // "Ich war auch dabei" Handler
  const handleJoinShift = async (entry: ArbeitsEinsatz) => {
    const now = new Date().toISOString();
    const currentCoWorkers = entry.coWorkers || [];
    const isPrimaryUser = entry.userId === currentUser.id ||
      ((currentUser as any).uid && entry.userId === (currentUser as any).uid) ||
      (currentUser.username && (entry.userName === currentUser.username || (entry as any).name === currentUser.username));
    const alreadyJoined = currentCoWorkers.includes(currentUser.id) ||
      ((currentUser as any).uid && currentCoWorkers.includes((currentUser as any).uid));
    if (isPrimaryUser || alreadyJoined) return;

    const myName = getUserDisplayName(currentUser);
    const updatedCoWorkers = Array.from(new Set([...currentCoWorkers, currentUser.id]));
    const newAuditEntry: ArbeitsEinsatzAuditEntry = {
      timestamp: now,
      userId: currentUser.id,
      userName: myName,
      action: `${myName} hat sich als Mitwirkender hinzugefügt („Ich war auch dabei“)`
    };
    const updatedAuditLog = [...(entry.auditLog || []), newAuditEntry];

    const updatedEntry: ArbeitsEinsatz = {
      ...entry,
      coWorkers: updatedCoWorkers,
      auditLog: updatedAuditLog,
    };

    // Optimistic UI update
    setEntries(prev => prev.map(item => item.id === entry.id ? updatedEntry : item));

    try {
      await updateArbeitseinsatzParticipation(currentClubId, entry.id, updatedCoWorkers, updatedAuditLog);
    } catch (err) {
      console.error("Fehler beim Hinzufügen:", err);
      // Rollback
      setEntries(prev => prev.map(item => item.id === entry.id ? entry : item));
    }
  };

  // "Austragen" Handler
  const handleLeaveShift = async (entry: ArbeitsEinsatz) => {
    const now = new Date().toISOString();
    const currentCoWorkers = entry.coWorkers || [];
    const isCoWorker = currentCoWorkers.includes(currentUser.id) ||
      ((currentUser as any).uid && currentCoWorkers.includes((currentUser as any).uid));
    if (!isCoWorker) return;

    const myName = getUserDisplayName(currentUser);
    const updatedCoWorkers = currentCoWorkers.filter(
      id => id !== currentUser.id && id !== (currentUser as any).uid
    );
    const newAuditEntry: ArbeitsEinsatzAuditEntry = {
      timestamp: now,
      userId: currentUser.id,
      userName: myName,
      action: `${myName} hat sich als Mitwirkender ausgetragen`
    };
    const updatedAuditLog = [...(entry.auditLog || []), newAuditEntry];

    const updatedEntry: ArbeitsEinsatz = {
      ...entry,
      coWorkers: updatedCoWorkers,
      auditLog: updatedAuditLog,
    };

    // Optimistic UI update
    setEntries(prev => prev.map(item => item.id === entry.id ? updatedEntry : item));

    try {
      await updateArbeitseinsatzParticipation(currentClubId, entry.id, updatedCoWorkers, updatedAuditLog);
    } catch (err) {
      console.error("Fehler beim Austragen:", err);
      // Rollback
      setEntries(prev => prev.map(item => item.id === entry.id ? entry : item));
    }
  };

  // Handle Save (Form Submit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!formDate) {
      setErrorMsg("Bitte ein gültiges Datum auswählen.");
      return;
    }
    if (formHours <= 0) {
      setErrorMsg("Die Arbeitsstunden müssen größer als 0 sein.");
      return;
    }
    const step = Number(interval);
    if (Math.round(formHours * 100) % Math.round(step * 100) !== 0) {
      setErrorMsg(`Bitte erfassen Sie die Stunden im ${interval}-Stundentakt.`);
      return;
    }

    if (!formCategory) {
      setErrorMsg("Bitte eine Kategorie auswählen.");
      return;
    }
    if (commentsRequired && !formDescription.trim()) {
      setErrorMsg("Bitte eine kurze Beschreibung der ausgeführten Arbeiten angeben.");
      return;
    }

    if (isAdmin && formSelectedUserIds.length === 0) {
      setErrorMsg("Bitte mindestens ein Mitglied auswählen.");
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const targetUids = isAdmin ? formSelectedUserIds : [currentUser.id];
      const primaryUid = targetUids[0];
      const primaryUser = (typeof primaryUid === "string" ? ((Object.values(users) as User[]).find(x => x.id === primaryUid || (x as any).uid === primaryUid || (x as any).personId === primaryUid) || users[primaryUid]) : primaryUid) || currentUser;
      const coWorkersUids = targetUids.slice(1);
      const actorName = getUserDisplayName(currentUser);

      let auditAction = "";
      if (isAdmin) {
        if (coWorkersUids.length > 0) {
          auditAction = `Durch Admin ${actorName} für das Team angelegt (${targetUids.length} Teilnehmer)`;
        } else {
          auditAction = `Durch Admin ${actorName} für ${getUserDisplayName(primaryUser)} angelegt`;
        }
      } else {
        auditAction = `Einsatz durch ${actorName} erfasst`;
      }

      const newEntry: ArbeitsEinsatz = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${primaryUid}`,
        date: formDate,
        hours: formHours,
        category: formCategory,
        description: formDescription.trim(),
        userId: primaryUid,
        userName: primaryUser.name,
        userFullName: getUserDisplayName(primaryUser),
        createdBy: currentUser.name,
        createdAt: timestamp,
        coWorkers: coWorkersUids,
        auditLog: [
          {
            timestamp,
            userId: currentUser.id,
            userName: actorName,
            action: auditAction
          }
        ]
      };

      // Optimistic update
      setEntries(prev => [newEntry, ...prev]);

      await saveArbeitseinsatz(currentClubId, newEntry);

      setSuccessMsg("Einsatz erfolgreich im Logbuch gespeichert!");
      setTimeout(() => {
        handleCloseSlider();
      }, 700);
    } catch (err) {
      console.error("Error saving entry:", err);
      setErrorMsg("Fehler beim Speichern. Bitte versuche es erneut.");
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteArbeitseinsatz(currentClubId, entryId);
      setShowDeleteConfirmFor(null);
      setEntries(prev => prev.filter(e => e.id !== entryId));
    } catch (err) {
      console.error("Error deleting entry:", err);
    }
  };

  const handleStartEdit = (entry: ArbeitsEinsatz) => {
    setEditingEntry(entry);
    setEditDate(entry.date);
    setEditHours(entry.hours);
    setEditCategory(entry.category);
    setEditDescription(entry.description || "");

    const resolveToKnownUserId = (uid: string): string => {
      if (users[uid]) return users[uid].id || uid;
      const byUidOrId = (Object.values(users) as User[]).find(
        (u) => u.id === uid || (u as any).uid === uid || (u as any).personId === uid
      );
      if (byUidOrId) return byUidOrId.id;

      // If uid matches entry.userId, match by entry.userName or entry.userFullName
      if (uid === entry.userId) {
        if (entry.userName) {
          const byUserName = (Object.values(users) as User[]).find(
            (u) => u.username === entry.userName || u.name === entry.userName
          );
          if (byUserName) return byUserName.id;
        }
        if (entry.userFullName) {
          const byFullName = (Object.values(users) as User[]).find(
            (u) => getUserDisplayName(u).toLowerCase().trim() === entry.userFullName!.toLowerCase().trim()
          );
          if (byFullName) return byFullName.id;
        }
      }

      // Check all entries in case another entry recorded this uid with userFullName / userName
      const knownEntry = entries.find((e) => e.userId === uid && (e.userName || e.userFullName));
      if (knownEntry) {
        if (knownEntry.userName) {
          const byUserName = (Object.values(users) as User[]).find(
            (u) => u.username === knownEntry.userName || u.name === knownEntry.userName
          );
          if (byUserName) return byUserName.id;
        }
        if (knownEntry.userFullName) {
          const byFullName = (Object.values(users) as User[]).find(
            (u) => getUserDisplayName(u).toLowerCase().trim() === knownEntry.userFullName!.toLowerCase().trim()
          );
          if (byFullName) return byFullName.id;
        }
      }

      return uid;
    };

    const rawParticipants = Array.from(new Set([entry.userId, ...(entry.coWorkers || [])])).filter(Boolean);
    const initialParticipants = Array.from(new Set(rawParticipants.map(resolveToKnownUserId)));
    setEditSelectedUserIds(initialParticipants);
    setEditMemberSearchQuery("");
    setEditErrorMsg("");
    setIsSavingEdit(false);
    setIsEditClosing(false);
    setIsEditAnimatingIn(false);
    setTimeout(() => setIsEditAnimatingIn(true), 10);
  };

  const handleCloseEdit = () => {
    setIsEditClosing(true);
    setIsEditAnimatingIn(false);
    setTimeout(() => {
      setEditingEntry(null);
      setIsEditClosing(false);
      setEditErrorMsg("");
      setEditMemberSearchQuery("");
      setIsSavingEdit(false);
    }, 200);
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingEntry) return;

    setEditErrorMsg("");

    if (!editDate) {
      setEditErrorMsg("Bitte ein gültiges Datum auswählen.");
      return;
    }
    if (editHours <= 0) {
      setEditErrorMsg("Die Arbeitsstunden müssen größer als 0 sein.");
      return;
    }
    const step = Number(interval);
    if (Math.round(editHours * 100) % Math.round(step * 100) !== 0) {
      setEditErrorMsg(`Bitte erfassen Sie die Stunden im ${interval}-Stundentakt.`);
      return;
    }
    if (!editCategory) {
      setEditErrorMsg("Bitte eine Kategorie auswählen.");
      return;
    }
    if (commentsRequired && !editDescription.trim()) {
      setEditErrorMsg("Bitte eine kurze Beschreibung der ausgeführten Arbeiten angeben.");
      return;
    }
    if (editSelectedUserIds.length === 0) {
      setEditErrorMsg("Bitte mindestens ein teilnehmendes Mitglied auswählen.");
      return;
    }

    try {
      setIsSavingEdit(true);
      const timestamp = new Date().toISOString();
      const actorName = getUserDisplayName(currentUser);

      const changes: string[] = [];
      if (editDate !== editingEntry.date) {
        changes.push(`Datum: ${editingEntry.date} → ${editDate}`);
      }
      if (editHours !== editingEntry.hours) {
        changes.push(`Stunden: ${editingEntry.hours} → ${editHours}`);
      }
      if (editCategory !== editingEntry.category) {
        changes.push(`Kategorie: „${editingEntry.category}“ → „${editCategory}“`);
      }
      if (editDescription.trim() !== (editingEntry.description || "").trim()) {
        changes.push(`Tätigkeit aktualisiert`);
      }

      const oldParticipants = Array.from(new Set([editingEntry.userId, ...(editingEntry.coWorkers || [])])).filter(Boolean);
      const addedUids = editSelectedUserIds.filter(id => !oldParticipants.includes(id));
      const removedUids = oldParticipants.filter(id => !editSelectedUserIds.includes(id));

      if (addedUids.length > 0) {
        const addedNames = addedUids.map(id => getUserDisplayName(id)).join(", ");
        changes.push(`Teilnehmer hinzugefügt: ${addedNames}`);
      }
      if (removedUids.length > 0) {
        const removedNames = removedUids.map(id => getUserDisplayName(id)).join(", ");
        changes.push(`Teilnehmer entfernt: ${removedNames}`);
      }

      const actionText = changes.length > 0
        ? `Durch Admin ${actorName} bearbeitet (${changes.join(", ")})`
        : `Durch Admin ${actorName} bearbeitet`;

      const auditEntry: ArbeitsEinsatzAuditEntry = {
        timestamp,
        userId: currentUser.id,
        userName: actorName,
        action: actionText
      };

      // Determine primary userId and coWorkers
      let primaryUid = editingEntry.userId;
      const matchingPrimaryInSelected = editSelectedUserIds.find(id => {
        if (id === primaryUid) return true;
        const u = users[id] || (Object.values(users) as User[]).find(x => x.id === id);
        if (u && (u.username === editingEntry.userName || u.name === editingEntry.userName)) return true;
        return false;
      });

      if (matchingPrimaryInSelected) {
        primaryUid = matchingPrimaryInSelected;
      } else {
        primaryUid = editSelectedUserIds[0];
      }
      const coWorkersUids = editSelectedUserIds.filter(id => id !== primaryUid);

      const primaryUser = (typeof primaryUid === "string" 
        ? (users[primaryUid] || (Object.values(users) as User[]).find(x => x.id === primaryUid || (x as any).uid === primaryUid || (x as any).personId === primaryUid || x.username === primaryUid || x.name === primaryUid)) 
        : primaryUid) || currentUser;

      const updated: ArbeitsEinsatz = {
        ...editingEntry,
        date: editDate,
        hours: editHours,
        category: editCategory,
        description: editDescription.trim(),
        userId: primaryUser?.id || primaryUid,
        userName: primaryUser?.username || primaryUser?.name || getUserDisplayName(primaryUser),
        userFullName: getUserDisplayName(primaryUser),
        coWorkers: coWorkersUids,
        auditLog: [...(editingEntry.auditLog || []), auditEntry]
      };

      // Optimistic update
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      await saveArbeitseinsatz(currentClubId, updated);
      handleCloseEdit();
    } catch (err) {
      console.error("Error editing entry:", err);
      setEditErrorMsg("Fehler beim Speichern. Bitte versuche es erneut.");
      setIsSavingEdit(false);
    }
  };

  const isExcludedRole = (u: User) => {
    const roleStr = (u.role || "").toString().toLowerCase().trim();
    if (roleStr === "admin" || roleStr === "super-admin" || roleStr === "superadmin" || roleStr === "super_admin") return true;
    if (u.role === Role.ADMIN || u.role === Role.SUPER_ADMIN) return true;
    if ((u as any).hauptAdmin || (u as any).isSuperAdmin || (u as any).isAdmin) return true;
    const nameStr = (getUserDisplayName(u) || "").toLowerCase().trim();
    if (nameStr === "admin" || nameStr === "super-admin" || nameStr === "superadmin") return true;
    return false;
  };

  // Calculate totals per user (including coWorkers!)
  const userStats = (Object.values(users) as User[])
    .filter((u) => !isExcludedRole(u) && !u.isSuspended)
    .map((user) => {
      const userEntries = entriesForSaison.filter(
        (e) => e.userId === user.id || (e.coWorkers && e.coWorkers.includes(user.id))
      );
      const totalHours = userEntries.reduce((sum, e) => sum + e.hours, 0);
      const progress = sollStunden > 0 ? Math.min((totalHours / sollStunden) * 100, 100) : 100;
      const isCompleted = totalHours >= sollStunden;
      const displayName = getUserDisplayName(user);
      
      return {
        user,
        displayName,
        totalHours,
        progress,
        isCompleted,
        entriesCount: userEntries.length,
      };
    })
    .filter(s => {
      if (showActiveOnly && s.totalHours === 0) return false;
      if (userStatusFilter === "fulfilled" && !s.isCompleted) return false;
      if (userStatusFilter === "pending" && s.isCompleted) return false;
      if (userSearchQuery && !s.displayName.toLowerCase().includes(userSearchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (userSortCol === "name") {
        cmp = compareUsersByLastName(a.user, b.user);
      } else if (userSortCol === "hours") {
        cmp = a.totalHours - b.totalHours;
        if (cmp === 0) cmp = compareUsersByLastName(a.user, b.user);
      }
      return userSortDesc ? -cmp : cmp;
    });

  // Current user's total hours (primary author + co-worker)
  const currentUserTotalHours = entriesForSaison
    .filter((e) => e.userId === currentUser.id || (e.coWorkers && e.coWorkers.includes(currentUser.id)))
    .reduce((sum, e) => sum + e.hours, 0);

  // Filtered list of individual logbook entries
  const filteredEntries = entriesForSaison.filter((e) => {
    const matchesCategory = selectedCategoryFilter === "all" || e.category === selectedCategoryFilter;
    
    // Scope filtering: All vs Mine
    let matchesScope = true;
    if (viewScope === "mine") {
      matchesScope = e.userId === currentUser.id || (e.coWorkers && e.coWorkers.includes(currentUser.id));
    }

    // Task search filtering (Tätigkeit suchen...)
    const query = entrySearchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      (e.description && e.description.toLowerCase().includes(query)) ||
      (e.category && e.category.toLowerCase().includes(query));

    return matchesCategory && matchesScope && matchesSearch;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortCol === "date") cmp = a.date.localeCompare(b.date);
    else if (sortCol === "member") {
      const uA = users[a.userId];
      const uB = users[b.userId];
      if (uA && uB) {
        cmp = compareUsersByLastName(uA, uB);
      } else {
        cmp = a.userFullName.localeCompare(b.userFullName);
      }
    }
    else if (sortCol === "createdBy") {
      cmp = (a.createdBy || "").localeCompare(b.createdBy || "");
    }
    else if (sortCol === "category") cmp = a.category.localeCompare(b.category);
    else if (sortCol === "task") cmp = a.description.localeCompare(b.description);
    else if (sortCol === "hours") cmp = a.hours - b.hours;
    return sortDesc ? -cmp : cmp;
  });

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full select-none font-sans flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-6 space-y-5 lg:space-y-6 flex flex-col">
        {/* Integrated Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-4 md:pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-2xl items-center justify-center shrink-0 text-[var(--color-primary)]">
              <Briefcase className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="text-xl font-sans font-bold text-slate-900 uppercase tracking-wider">
                  Arbeitseinsätze
                </h3>
              </div>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                Dokumentation der eingebrachten Vereinsstunden
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              type="button"
              onClick={handleOpenSlider}
              style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
              className="bg-[var(--color-primary)] text-white hover:bg-black uppercase tracking-widest px-3.5 md:px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer border border-transparent outline-none whitespace-nowrap text-xs font-bold"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>EINSATZ EINTRAGEN</span>
            </button>
          </div>
        </div>

        {/* Work Hours Progress Bar for the logged-in User */}
        <div className="bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80">
          <div className="flex flex-row items-center justify-between gap-2 mb-2 sm:mb-2.5">
            <h2 className="text-sm font-bold text-slate-800">
              Dein Arbeitsstundenfortschritt ({selectedYear})
            </h2>
            <div className="flex items-baseline gap-1 font-mono shrink-0">
              <span className="text-sm sm:text-lg font-black text-slate-800">
                {currentUserTotalHours.toFixed(1).replace(".0", "")}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-400">
                / {sollStunden} Std.
              </span>
            </div>
          </div>

          <div className="w-full bg-slate-200/70 h-2 sm:h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              style={{ width: `${sollStunden > 0 ? Math.min((currentUserTotalHours / sollStunden) * 100, 100) : 100}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                currentUserTotalHours >= sollStunden
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                  : "bg-emerald-600"
              }`}
            ></div>
          </div>

          {currentUserTotalHours >= sollStunden ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-100">
              <i className="fa-solid fa-circle-check text-emerald-600"></i>
              <span>Soll erfüllt! Vielen Dank für deinen starken Einsatz für unseren Verein!</span>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
              <span>
                {currentUserTotalHours > 0
                  ? "Weiter so! Jede Stunde trägt zu einer gepflegten Anlage bei."
                  : "Noch keine Stunden eingetragen. Trage deinen Einsatz ein oder klicke auf „Ich war auch dabei“!"}
              </span>
              {sollStunden > currentUserTotalHours && (
                <span className="font-semibold text-slate-600">
                  Noch {(sollStunden - currentUserTotalHours).toFixed(1).replace(".0", "")} Std. verbleibend
                </span>
              )}
            </div>
          )}
        </div>

        {/* Logbook Feed Section (Social Control) */}
        <div className="flex flex-col space-y-4">
          <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm xs:text-base md:text-lg font-bold text-slate-800">
                Einzelnachweise
              </h2>
            </div>

            {/* View Scope Tabs */}
            <div className="flex items-center gap-2">
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setViewScope("all");
                    setEntriesPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    viewScope === "all"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Alle Einsätze
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewScope("mine");
                    setEntriesPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    viewScope === "mine"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Meine Einsätze
                </button>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 p-3 md:p-4 rounded-2xl border border-slate-200/80">
            <div className="flex flex-wrap items-center gap-3">
              {/* Year Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                  Jahr:
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(Number(e.target.value));
                    setEntriesPage(1);
                  }}
                  className="h-9 px-3 bg-white text-xs text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-[var(--color-primary)] cursor-pointer font-sans font-medium shadow-xs"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="w-full sm:w-60">
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => {
                    setSelectedCategoryFilter(e.target.value);
                    setEntriesPage(1);
                  }}
                  className="w-full h-9 px-3 bg-white text-xs text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-[var(--color-primary)] cursor-pointer font-sans font-medium shadow-xs"
                >
                  <option value="all">Alle Bereiche</option>
                  {categories.map((c: string) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task Search Input */}
            <div className="relative w-full sm:w-64 sm:ml-auto">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={entrySearchQuery}
                onChange={(e) => {
                  setEntrySearchQuery(e.target.value);
                  setEntriesPage(1);
                }}
                placeholder="Tätigkeit suchen..."
                className="w-full h-9 pl-9 pr-8 bg-white text-xs text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-[var(--color-primary)] font-sans font-medium shadow-xs placeholder:text-slate-400"
              />
              {entrySearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setEntrySearchQuery("");
                    setEntriesPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Suche zurücksetzen"
                  aria-label="Suche löschen"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto border border-slate-200/80 rounded-2xl shadow-xs">
            <table className="w-full text-left border-collapse text-xs table-fixed min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[12%] min-w-[100px]" : "w-[12%] min-w-[100px]"} cursor-pointer hover:text-[var(--color-primary)] transition-colors whitespace-nowrap`} onClick={() => handleSort("date")}>
                    Datum {sortCol === "date" && <i className={`fa-solid fa-sort-${sortDesc ? "down" : "up"} ml-1`}></i>}
                  </th>
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[22%] min-w-[170px]" : "w-[22%] min-w-[180px]"} cursor-pointer hover:text-[var(--color-primary)] transition-colors whitespace-nowrap`} onClick={() => handleSort("member")}>
                    Mitwirkende {sortCol === "member" && <i className={`fa-solid fa-sort-${sortDesc ? "down" : "up"} ml-1`}></i>}
                  </th>
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[15%] min-w-[120px]" : "w-[15%] min-w-[130px]"} cursor-pointer hover:text-[var(--color-primary)] transition-colors whitespace-nowrap`} onClick={() => handleSort("category")}>
                    Kategorie {sortCol === "category" && <i className={`fa-solid fa-sort-${sortDesc ? "down" : "up"} ml-1`}></i>}
                  </th>
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[26%] min-w-[190px]" : "w-[28%] min-w-[220px]"} cursor-pointer hover:text-[var(--color-primary)] transition-colors`} onClick={() => handleSort("task")}>
                    Tätigkeit {sortCol === "task" && <i className={`fa-solid fa-sort-${sortDesc ? "down" : "up"} ml-1`}></i>}
                  </th>
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[8%] min-w-[80px]" : "w-[9%] min-w-[85px]"} text-center cursor-pointer hover:text-[var(--color-primary)] transition-colors whitespace-nowrap`} onClick={() => handleSort("hours")}>
                    Stunden {sortCol === "hours" && <i className={`fa-solid fa-sort-${sortDesc ? "down" : "up"} ml-1`}></i>}
                  </th>
                  <th className={`py-3 px-3.5 ${isAdmin ? "w-[10%] min-w-[120px]" : "w-[14%] min-w-[140px]"} text-center whitespace-nowrap`}>
                    Mitwirken
                  </th>
                  {isAdmin && (
                    <th className="py-3 px-3 w-[7%] min-w-[80px] text-right whitespace-nowrap">Aktionen</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.slice((entriesPage - 1) * ITEMS_PER_PAGE, entriesPage * ITEMS_PER_PAGE).map((e) => {
                  const participantIds = Array.from(new Set([e.userId, ...(e.coWorkers || [])]));
                  const participants = participantIds
                    .map((uid) => ({
                      id: uid,
                      name: users[uid] ? getUserDisplayName(users[uid]) : (uid === e.userId ? (e.userFullName || e.userName || getUserDisplayName(uid)) : getUserDisplayName(uid)),
                      isCurrentUser: uid === currentUser.id,
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name, "de"));

                  const coworkers = e.coWorkers || [];
                  const isPrimary = e.userId === currentUser.id ||
                    ((currentUser as any).uid && e.userId === (currentUser as any).uid) ||
                    (currentUser.username && (e.userName === currentUser.username || (e as any).name === currentUser.username));
                  const isCoWorker = coworkers.includes(currentUser.id) ||
                    ((currentUser as any).uid && coworkers.includes((currentUser as any).uid));
                  const isParticipant = isPrimary || isCoWorker;
                  const canDelete = isAdmin || isPrimary;

                  return (
                    <React.Fragment key={e.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">
                          {new Date(e.date).toLocaleDateString("de-DE")}
                        </td>
                        <td className="py-3 px-3.5 truncate">
                          <div className="flex flex-col gap-0.5">
                            {participants.map((p) => (
                              <span key={p.id} className="text-slate-600 flex items-center gap-1.5 truncate">
                                <span className="truncate">{p.name}</span>
                                {p.isCurrentUser && (
                                  <span className="text-[10px] font-semibold text-slate-400 font-sans shrink-0">(Du)</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 truncate">
                          {e.category}
                        </td>
                        <td className="py-3 px-3.5 truncate text-slate-600" title={e.description}>
                          {e.description || <span className="text-slate-300 italic">Keine Beschreibung</span>}
                        </td>
                        <td className="py-3 px-3.5 text-center text-slate-600 whitespace-nowrap">
                          {e.hours} Std.
                        </td>
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {!isParticipant ? (
                            <button
                              type="button"
                              onClick={() => handleJoinShift(e)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border border-emerald-200/80 transition-all shadow-xs active:scale-95 cursor-pointer"
                              title="Ich war auch dabei"
                            >
                              <i className="fa-solid fa-handshake-angle text-emerald-600 text-xs"></i>
                              <span>Ich war auch dabei</span>
                            </button>
                          ) : isCoWorker ? (
                            <button
                              type="button"
                              onClick={() => handleLeaveShift(e)}
                              className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline transition-colors cursor-pointer"
                              title="Aus diesem Einsatz austragen"
                            >
                              Austragen
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <i className="fa-solid fa-user-check text-slate-500 text-[10px]"></i>
                                <span>Ersteller</span>
                              </span>
                              {!isAdmin && isPrimary && (
                                <button
                                  type="button"
                                  onClick={() => setShowDeleteConfirmFor(e.id)}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 underline decoration-dotted transition-colors cursor-pointer"
                                  title="Einsatz löschen"
                                >
                                  Löschen
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(e)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-[var(--color-primary)] hover:bg-emerald-50 transition-colors flex items-center justify-center cursor-pointer"
                                title="Eintrag bearbeiten (Kategorie / Tätigkeit)"
                              >
                                <i className="fa-solid fa-pen-to-square text-xs"></i>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenAudit(e)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-[var(--color-primary)] hover:bg-emerald-50 transition-colors flex items-center justify-center cursor-pointer"
                                title="Auditlog öffnen"
                              >
                                <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setShowDeleteConfirmFor(e.id)}
                                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center cursor-pointer"
                                  title="Einsatz löschen"
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    </React.Fragment>
                  );
                })}

                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-slate-400 font-medium">
                      Keine Arbeitseinsätze gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-2.5">
            {filteredEntries.slice((entriesPage - 1) * ITEMS_PER_PAGE, entriesPage * ITEMS_PER_PAGE).map((e) => {
              const participantIds = Array.from(new Set([e.userId, ...(e.coWorkers || [])]));
              const participants = participantIds
                .map((uid) => ({
                  id: uid,
                  name: users[uid] ? getUserDisplayName(users[uid]) : (uid === e.userId ? (e.userFullName || e.userName || getUserDisplayName(uid)) : getUserDisplayName(uid)),
                  isCurrentUser: uid === currentUser.id,
                }))
                .sort((a, b) => a.name.localeCompare(b.name, "de"));

              const coworkers = e.coWorkers || [];
              const isPrimary = e.userId === currentUser.id ||
                ((currentUser as any).uid && e.userId === (currentUser as any).uid) ||
                (currentUser.username && (e.userName === currentUser.username || (e as any).name === currentUser.username));
              const isCoWorker = coworkers.includes(currentUser.id) ||
                ((currentUser as any).uid && coworkers.includes((currentUser as any).uid));
              const isParticipant = isPrimary || isCoWorker;
              const canDelete = isAdmin || isPrimary;

              return (
                <div
                  key={e.id}
                  className="p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex flex-col gap-2 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {participants.map((p) => (
                        <span key={p.id} className="text-slate-700 text-xs flex items-center gap-1 truncate">
                          {p.name}
                          {p.isCurrentUser && (
                            <span className="text-[10px] font-semibold text-slate-400 font-sans">(Du)</span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-600 text-xs font-medium">
                        {e.hours} Std.
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleStartEdit(e);
                          }}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-[var(--color-primary)] hover:bg-emerald-50 flex items-center justify-center cursor-pointer"
                          title="Einsatz bearbeiten"
                        >
                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleOpenAudit(e);
                          }}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-[var(--color-primary)] hover:bg-emerald-50 flex items-center justify-center cursor-pointer"
                          title="Auditlog öffnen"
                        >
                          <i className="fa-solid fa-clock-rotate-left text-xs"></i>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setShowDeleteConfirmFor(e.id);
                          }}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                          title="Einsatz löschen"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{new Date(e.date).toLocaleDateString("de-DE")}</span>
                    <span className="text-slate-600 font-medium">
                      {e.category}
                    </span>
                  </div>

                  {e.description && (
                    <p className="text-xs text-slate-600 truncate font-medium">
                      {e.description}
                    </p>
                  )}

                  {/* Mobile Participation Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {!isParticipant ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleJoinShift(e);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 active:scale-95"
                      >
                        <i className="fa-solid fa-handshake-angle text-emerald-600"></i>
                        <span>Ich war auch dabei</span>
                      </button>
                    ) : isCoWorker ? (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleLeaveShift(e);
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline transition-colors cursor-pointer"
                      >
                        Austragen
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <i className="fa-solid fa-user-check text-slate-400 text-xs"></i> Ersteller
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredEntries.length === 0 && (
              <div className="text-center py-8 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                Keine Arbeitseinsätze gefunden
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {filteredEntries.length > ITEMS_PER_PAGE && (
            <div className="flex justify-between items-center mt-2 px-1">
              <button 
                disabled={entriesPage === 1}
                onClick={() => setEntriesPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <i className="fa-solid fa-chevron-left mr-1"></i> Zurück
              </button>
              <div className="text-xs font-medium text-slate-500">
                Seite {entriesPage} von {Math.ceil(filteredEntries.length / ITEMS_PER_PAGE)}
              </div>
              <button 
                disabled={entriesPage >= Math.ceil(filteredEntries.length / ITEMS_PER_PAGE)}
                onClick={() => setEntriesPage(p => p + 1)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Weiter <i className="fa-solid fa-chevron-right ml-1"></i>
              </button>
            </div>
          )}
        </div>

        {/* Aggregated Members Section (Leaderboard / Overview) */}
        {!isListHidden && (
          <div className="flex flex-col mt-6 pt-6 border-t border-slate-100">
            <div className="mb-4 pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm xs:text-base md:text-lg font-bold text-slate-800">
                  Stundenkonten der Mitglieder
                </h2>
                <p className="text-xs text-slate-400 font-normal mt-0.5">
                  Aktueller Stand im Jahr {selectedYear}
                </p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="relative">
                <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Mitglied suchen..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setUsersPage(1);
                  }}
                  className="w-full h-9 pl-8 pr-3 bg-slate-50 text-xs text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white font-sans font-medium placeholder:font-normal placeholder:text-slate-400"
                />
              </div>

              <select
                value={userStatusFilter}
                onChange={(e) => {
                  setUserStatusFilter(e.target.value as any);
                  setUsersPage(1);
                }}
                className="w-full h-9 px-3 bg-slate-50 text-xs text-slate-700 rounded-xl border border-slate-200 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white cursor-pointer font-sans font-medium"
              >
                <option value="all">Alle Mitglieder</option>
                <option value="fulfilled">Soll erfüllt</option>
                <option value="pending">Soll ausstehend</option>
              </select>
            </div>

            {/* Members Table */}
            <div className="overflow-x-auto border border-slate-200/80 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-3 px-4 w-[58%] cursor-pointer hover:text-[var(--color-primary)] transition-colors" onClick={() => handleUserSort("name")}>
                      Mitglied {userSortCol === "name" && <i className={`fa-solid fa-sort-${userSortDesc ? "down" : "up"} ml-1`}></i>}
                    </th>
                    <th className="py-3 px-4 w-[42%] text-center cursor-pointer hover:text-[var(--color-primary)] transition-colors" onClick={() => handleUserSort("hours")}>
                      Stunden & Fortschritt {userSortCol === "hours" && <i className={`fa-solid fa-sort-${userSortDesc ? "down" : "up"} ml-1`}></i>}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userStats.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE).map(({ user, displayName, totalHours, progress, isCompleted }) => {
                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block truncate">
                            {displayName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1 max-w-[140px] mx-auto">
                            <span className="font-mono font-bold text-slate-800 text-xs">
                              {totalHours.toFixed(1).replace(".0", "")} / {sollStunden} Std.
                            </span>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${progress}%` }}
                                className={`h-full rounded-full ${
                                  isCompleted ? "bg-emerald-500" : totalHours > 0 ? "bg-amber-400" : "bg-rose-400"
                                }`}
                              ></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {userStats.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center py-8 text-slate-400 font-medium">
                        Keine Mitglieder gefunden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Members */}
            {userStats.length > ITEMS_PER_PAGE && (
              <div className="flex justify-between items-center mt-3 px-1">
                <button 
                  disabled={usersPage === 1}
                  onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <i className="fa-solid fa-chevron-left mr-1"></i> Zurück
                </button>
                <div className="text-xs font-medium text-slate-500">
                  Seite {usersPage} von {Math.ceil(userStats.length / ITEMS_PER_PAGE)}
                </div>
                <button 
                  disabled={usersPage >= Math.ceil(userStats.length / ITEMS_PER_PAGE)}
                  onClick={() => setUsersPage(p => p + 1)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 uppercase bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Weiter <i className="fa-solid fa-chevron-right ml-1"></i>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirmFor && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider mb-2">
              Löschen bestätigen
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Möchtest du diesen Arbeitseinsatz wirklich endgültig löschen? Die gutgeschriebenen Stunden werden für alle Teilnehmer abgezogen.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirmFor(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (showDeleteConfirmFor) {
                    handleDeleteEntry(showDeleteConfirmFor);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Slider / Drawer for Editing Entry (Admin) */}
      {editingEntry && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
          onClick={handleCloseEdit}
          style={{
            opacity: !isEditAnimatingIn || isEditClosing ? 0 : 1,
            transitionDuration: isEditClosing ? "200ms" : "250ms",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            pointerEvents: isEditClosing ? "none" : "auto",
          }}
        >
          <div
            className="w-[460px] max-w-[100vw] h-[100vh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
            style={{
              transform:
                !isEditAnimatingIn || isEditClosing
                  ? "translateX(100%)"
                  : "translateX(0)",
              transitionDuration: isEditClosing ? "200ms" : "250ms",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Drawer Header (Exact Booking Slider header design) */}
            <div 
              style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
              className="p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden"
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
                <h3 className="text-lg font-bold uppercase tracking-tight leading-none mb-1">
                  Einsatz bearbeiten
                </h3>
                <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                  <i className="fa-solid fa-pen-to-square text-white"></i>
                  Arbeitseinsatz anpassen
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex-1 flex flex-col min-h-0 bg-white">
              <div className="bg-white p-5 space-y-4 overflow-y-auto flex-1 text-slate-700">
                {editErrorMsg && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-xl border border-rose-200 text-xs font-bold flex items-start gap-2">
                    <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                    {editErrorMsg}
                  </div>
                )}

                {/* Multi-Select Teilnehmende Mitglieder */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Mitwirkende
                  </label>

                  {/* Member Search input */}
                  <div className="relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input
                      type="text"
                      placeholder="Mitglied suchen und hinzufügen..."
                      value={editMemberSearchQuery}
                      onChange={(e) => setEditMemberSearchQuery(e.target.value)}
                      className="w-full h-10 pl-9 pr-8 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-slate-800 focus:bg-white transition-all font-sans font-medium"
                    />
                    {editMemberSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setEditMemberSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}

                    {/* Dropdown Results */}
                    {editMemberSearchQuery.trim().length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                        {(() => {
                          const matches = (Object.values(users) as User[])
                            .filter((u) => u.role !== Role.SUPER_ADMIN && !u.isSuspended)
                            .filter((u) => !editSelectedUserIds.includes(u.id))
                            .filter((u) => {
                              const name = getUserDisplayName(u).toLowerCase();
                              return name.includes(editMemberSearchQuery.toLowerCase().trim());
                            })
                            .sort(compareUsersByLastName);

                          if (matches.length === 0) {
                            return (
                              <div className="px-3.5 py-3 text-xs text-slate-400 italic">
                                Kein passendes Mitglied gefunden
                              </div>
                            );
                          }

                          return matches.map((u) => {
                            const name = getUserDisplayName(u);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setEditSelectedUserIds(prev => [...prev, u.id]);
                                  setEditMemberSearchQuery("");
                                }}
                                className="w-full text-left h-9 px-3.5 py-1 hover:bg-slate-50 text-xs text-slate-800 flex items-center justify-between transition-colors cursor-pointer font-sans font-medium"
                              >
                                <span>{name}</span>
                                <i className="fa-solid fa-plus text-[10px] text-emerald-600"></i>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Selected Member Chips */}
                  {editSelectedUserIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                      {editSelectedUserIds.map((uid) => {
                        const name = getUserDisplayName(uid);
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl text-xs font-bold border bg-emerald-50 text-emerald-800 border-emerald-200"
                          >
                            <span>{name}</span>
                            <button
                              type="button"
                              onClick={() => setEditSelectedUserIds(prev => prev.filter(id => id !== uid))}
                              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-emerald-200/60 text-emerald-700 transition-all cursor-pointer"
                              title={`${name} entfernen`}
                            >
                              <i className="fa-solid fa-xmark text-[10px]"></i>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[11px] text-rose-500 italic bg-rose-50 p-2.5 rounded-xl border border-dashed border-rose-200 text-center font-sans font-medium">
                      Keine Mitglieder ausgewählt. Mindestens ein Mitglied erforderlich.
                    </div>
                  )}
                </div>

                {/* Date & Hours Inputs */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      Datum
                    </label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      required
                      className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:border-[var(--color-primary)] text-slate-900 cursor-text font-sans font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      Stunden
                    </label>
                    <input
                      type="number"
                      value={editHours || ""}
                      onChange={(e) => setEditHours(Number(e.target.value))}
                      step={interval}
                      min={interval}
                      required
                      className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:border-[var(--color-primary)] text-slate-900 cursor-text font-sans font-medium"
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Kategorie
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all cursor-pointer font-sans font-medium"
                  >
                    {categories.map((c: string) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Tätigkeit {commentsRequired ? "*" : "(Optional)"}
                  </label>
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Bsp. Platz 1 und 2 abgezogen, Linien befestigt, Clubhaus gereinigt..."
                    required={commentsRequired}
                    className="w-full p-3 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50 focus:border-[var(--color-primary)] focus:bg-white transition-all text-slate-700 resize-none font-sans font-medium"
                  ></textarea>
                </div>
              </div>

              {/* Action Button (Full Width) */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex shrink-0">
                <button
                  type="submit"
                  disabled={isSavingEdit || (commentsRequired && !editDescription.trim()) || editSelectedUserIds.length === 0}
                  style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
                  className="w-full text-white rounded-xl shadow-md hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-95 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <i className="fa-solid fa-spinner animate-spin"></i>
                      <span>Speichern...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check-circle"></i>
                      <span>Änderungen speichern</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Audit Modal Slider (Matches Events / Tournaments Audit Log) */}
      {auditModalEntry && createPortal(
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
                  AUDIT LOG
                </h3>
                <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                  <i className="fa-solid fa-clock-rotate-left opacity-75"></i>
                  Verlauf der Ein- und Austragungen
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAudit}
                className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>

            {/* Drawer Content */}
            <div
              className="p-5 overflow-y-auto flex-1 bg-white space-y-3"
              style={{ isolation: "isolate" }}
            >
              {(() => {
                const targetEntry = entries.find(e => e.id === auditModalEntry.id) || auditModalEntry;
                const logs = targetEntry.auditLog || [];
                if (logs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
                      <i className="fa-solid fa-receipt text-3xl opacity-20"></i>
                      <p className="text-sm font-bold uppercase tracking-wider text-center">
                        Keine Auditeinträge vorhanden
                      </p>
                    </div>
                  );
                }

                return logs.map((log, i) => {
                  const presentation = getAuditLogPresentation(log);
                  const displayName = log.userName || getUserDisplayName(log.userId);

                  return (
                    <div
                      key={i}
                      className="flex gap-3 min-h-[52px] px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl items-center shadow-xs font-sans font-medium"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center text-white text-sm shadow-xs ${presentation.circleBg}`}
                      >
                        <i className={`fa-solid ${presentation.icon} text-xs`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-xs text-slate-700 truncate">
                          {displayName}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">
                          {new Date(log.timestamp).toLocaleString("de-DE")}
                        </p>
                      </div>
                      <div
                        className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${presentation.pillBg}`}
                      >
                        {presentation.label}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Slider / Drawer for New Entry */}
      {isSliderOpen && createPortal(
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
            className="w-[460px] max-w-[100vw] h-[100vh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto"
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
              style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
              className="p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden"
            >
              <div className="relative z-10">
                <h3 className="text-lg font-bold uppercase tracking-tight leading-none mb-1">
                  Einsatz eintragen
                </h3>
                <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                  <i className="fa-solid fa-file-signature text-white"></i>
                  Arbeitseinsatz dokumentieren
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSlider}
                className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-white">
              <div className="bg-white p-5 space-y-4 overflow-y-auto flex-1 text-slate-700">
                {errorMsg && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-xl border border-rose-200 text-xs font-bold flex items-start gap-2">
                    <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
                    {errorMsg}
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-200 text-xs font-bold flex items-start gap-2">
                    <i className="fa-solid fa-check mt-0.5"></i>
                    {successMsg}
                  </div>
                )}
                
                {/* Admin Multi-Select Members */}
                {isAdmin ? (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      Mitwirkende
                    </label>

                    {/* Member Search input */}
                    <div className="relative">
                      <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                      <input
                        type="text"
                        placeholder="Mitglied suchen und hinzufügen..."
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        className="w-full h-10 pl-9 pr-8 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-slate-800 focus:bg-white transition-all font-sans font-medium"
                      />
                      {memberSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMemberSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}

                      {/* Dropdown Results */}
                      {memberSearchQuery.trim().length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto z-50 divide-y divide-slate-100">
                          {(() => {
                            const matches = (Object.values(users) as User[])
                              .filter((u) => u.role !== Role.SUPER_ADMIN && !u.isSuspended)
                              .filter((u) => !formSelectedUserIds.includes(u.id))
                              .filter((u) => {
                                const name = getUserDisplayName(u).toLowerCase();
                                return name.includes(memberSearchQuery.toLowerCase().trim());
                              })
                              .sort(compareUsersByLastName);

                            if (matches.length === 0) {
                              return (
                                <div className="px-3.5 py-3 text-xs text-slate-400 italic">
                                  Kein passendes Mitglied gefunden
                                </div>
                              );
                            }

                            return matches.map((u) => {
                              const name = getUserDisplayName(u);
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setFormSelectedUserIds(prev => [...prev, u.id]);
                                    setMemberSearchQuery("");
                                  }}
                                  className="w-full text-left h-9 px-3.5 py-1 hover:bg-slate-50 text-xs text-slate-800 flex items-center justify-between transition-colors cursor-pointer font-sans font-medium"
                                >
                                  <span>{name}</span>
                                  <i className="fa-solid fa-plus text-[10px] text-emerald-600"></i>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Selected Member Chips */}
                    {formSelectedUserIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                        {formSelectedUserIds.map((uid) => {
                          const name = getUserDisplayName(uid);
                          return (
                            <span
                              key={uid}
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl text-xs font-bold border bg-emerald-50 text-emerald-800 border-emerald-200"
                            >
                              <span>{name}</span>
                              <button
                                type="button"
                                onClick={() => setFormSelectedUserIds(prev => prev.filter(id => id !== uid))}
                                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-emerald-200/60 text-emerald-700 transition-all cursor-pointer"
                              >
                                <i className="fa-solid fa-xmark text-[10px]"></i>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-dashed border-slate-200 text-center font-sans font-medium">
                        Keine Mitglieder ausgewählt. Tippe oben einen Namen ein.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                    <div className="shrink-0">
                      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Einsatz für:
                      </span>
                      <span className="text-xs font-bold text-slate-800 whitespace-nowrap block">
                        {getUserDisplayName(currentUser)}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium leading-tight text-right flex-1">
                      Weitere Helfer können sich nach dem Speichern mit 1 Klick eintragen.
                    </span>
                  </div>
                )}
                
                {/* Date & Hours Inputs */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      Datum
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                      className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:border-[var(--color-primary)] text-slate-900 cursor-text font-sans font-medium"
                    />
                  </div>
  
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">
                      Stunden
                    </label>
                    <input
                      type="number"
                      value={formHours || ""}
                      onChange={(e) => setFormHours(Number(e.target.value))}
                      step={interval}
                      min={interval}
                      required
                      className="w-full h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:border-[var(--color-primary)] text-slate-900 cursor-text font-sans font-medium"
                    />
                    <span className="text-[10px] text-slate-400 font-bold block">
                      Takt: {interval} Std.
                    </span>
                  </div>
                </div>

                {/* Category Selector */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Kategorie
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all cursor-pointer font-sans font-medium"
                  >
                    {categories.map((c: string) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Tätigkeit {commentsRequired ? "*" : "(Optional)"}
                  </label>
                  <textarea
                    rows={4}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Bsp. Platz 1 und 2 abgezogen, Linien befestigt, Clubhaus gereinigt..."
                    required={commentsRequired}
                    className="w-full p-3 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50 focus:border-[var(--color-primary)] focus:bg-white transition-all text-slate-700 resize-none font-sans font-medium"
                  ></textarea>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex shrink-0">
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
                  className="w-full text-white rounded-xl shadow-md hover:bg-black transition-all flex items-center justify-center gap-1.5 active:scale-95 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer"
                >
                  <i className="fa-solid fa-check-circle"></i>
                  <span>Einsatz speichern</span>
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

export default Arbeitseinsaetze;
