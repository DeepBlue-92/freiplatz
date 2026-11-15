import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  User,
  Role,
  Booking,
  RankingState,
  RegularLock,
  RangeLock,
  Tournament,
  ArbeitsEinsatz,
  DynamicLeague,
  ClubFeeSettings,
} from "../types";
import { GuestFeeSettingsEditor } from "./admin/GuestFeeSettingsEditor";
import { getDefaultFeeSettings, validateFeeSettings } from "../utils/guestFeeCalculator";
import {
  ClubSettings,
  TenantLanguageTranslations,
  DEFAULT_SETTINGS,
  DEFAULT_DYNAMIC_LEAGUES,
  savePublicBookings,
  saveClearBookings,
  listenToArbeitseinsaetze,
  saveArbeitseinsatz,
  isUsernameTakenGlobally,
} from "../services/db";
import { getUniqueLockReasons, getTenantTranslation } from "../services/tenantTranslations";
import { calculateAge } from "../utils/playerHelper";
import { RichTextRenderer, RichTextEditorToolbar } from "./RichText";
import firebaseConfig from "../firebase-applet-config.json";
import { TIME_SLOTS } from "../constants";
import AdminRankings from "./AdminRankings";
import { motion, AnimatePresence } from "motion/react";
import { Settings, Trophy, SlidersHorizontal, Shield } from "lucide-react";
import {
  findCandidateDuplicatesForAdmin,
  addExistingPersonToClub,
  PrivacySafeCandidate,
} from "../services/duplicateDetection";
import { UserAvatar } from "./UserAvatar";
import { isSuperAdmin as isUserSuperAdmin } from "../lib/userUtils";
import { AvatarUploader } from "./AvatarUploader";
import AdminOnboardingTab from "./AdminOnboardingTab";
import { ChampionshipAdminTab } from "../features/championship/ChampionshipAdminTab";
import { LandingPageEditor } from "./admin/LandingPageEditor";
import { saveLandingPageConfig } from "../services/landingPageService";
import { EmailTemplateManager } from "./admin/EmailTemplateManager";
import { AdminNotificationsManagement } from "./admin/AdminNotificationsManagement";
import {
  sendUserActivationApi,
  sendUserPasswordResetApi,
  bulkSendUserActivationApi,
  getLiveEmailPreview,
} from "../services/notificationClient";
import {
  loadClubEmailTemplatesData,
  getActiveTemplateForEvent,
} from "../services/emailTemplateStorage";
import { DEFAULT_EMAIL_TEMPLATES } from "../services/notificationTemplates";
import { EmailTemplate } from "../types/notifications";
import { useTranslation } from "react-i18next";

interface AdminSettingsProps {
  users: Record<string, User>;
  onUpdateUsers: (users: Record<string, User>) => void;
  bookings: Booking[];
  onUpdateBookings: (bookings: Booking[]) => void;
  currentUser: User;
  settings: ClubSettings;
  onUpdateSettings: (settings: ClubSettings) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  triggerSave?: number;
  rankings?: RankingState | null;
  onUpdateRankings?: (newData: RankingState) => void;
  tournaments: Tournament[];
  onAddTournament: (
    tournament: Omit<Tournament, "id" | "participants">,
  ) => void;
  onUpdateTournament: (id: string, updates: Partial<Tournament>) => void;
  onDeleteTournament: (id: string) => void;
  onActAsUser?: (user: User) => void;
  onSaveBooking?: (booking: Booking) => Promise<void> | void;
  onDeleteBooking?: (id: string | string[]) => Promise<void> | void;
  isSuperAdminImpersonating?: boolean;
  onNavigateToChampionship?: () => void;
  initialTab?: string;
  onUpdateLandingPageConfig?: (config: LandingPageConfig) => void;
}

const TABS = [
  { id: "allgemein", labelKey: "admin.tabs.allgemein", fallback: "Allgemein", icon: "fa-cubes" },
  { id: "landing_page", labelKey: "admin.tabs.landing_page", fallback: "Startseite", icon: "fa-table-cells-large" },
  { id: "rules", labelKey: "admin.tabs.rules", fallback: "Buchungsregeln", icon: "fa-clipboard-check" },
  { id: "sperren", labelKey: "admin.tabs.sperren", fallback: "Sperren", icon: "fa-ban" },
  { id: "layout", labelKey: "admin.tabs.layout", fallback: "Layout", icon: "fa-paint-roller" },
  { id: "translations", labelKey: "admin.tabs.translations", fallback: "Übersetzungen", icon: "fa-language" },
  { id: "users", labelKey: "admin.tabs.users", fallback: "Benutzer", icon: "fa-users" },
  { id: "onboarding", labelKey: "admin.tabs.onboarding", fallback: "Mitgliederonboarding", icon: "fa-user-check" },
  { id: "notifications", labelKey: "admin.tabs.notifications", fallback: "Benachrichtigungen", icon: "fa-bell" },
  { id: "database", labelKey: "admin.tabs.database", fallback: "Datenverwaltung", icon: "fa-database" },
  { id: "ranking", labelKey: "admin.tabs.ranking", fallback: "Rangliste", icon: "fa-medal" },
  { id: "championship", labelKey: "admin.tabs.championship", fallback: "Meisterschaft", icon: "fa-trophy" },
  { id: "arbeitseinsaetze", labelKey: "admin.tabs.arbeitseinsaetze", fallback: "Arbeitseinsätze", icon: "fa-briefcase" },
];

const DEFAULT_NAV_ORDER = [
  "landing_page",
  "reservation",
  "spielpartner",
  "tournaments",
  "ranking",
  "championship",
  "league",
  "guests",
  "arbeitseinsaetze",
];

const normalizeNavOrder = (existing?: string[]): string[] => {
  if (Array.isArray(existing) && existing.length > 0) {
    const list = existing.filter((id) => DEFAULT_NAV_ORDER.includes(id));
    for (const id of DEFAULT_NAV_ORDER) {
      if (!list.includes(id)) list.push(id);
    }
    return list;
  }
  return [...DEFAULT_NAV_ORDER];
};

interface GroupedCalendarLock {
  id: string;
  bookingIds: string[];
  date: string;
  reason: string;
  startTime: string;
  endTime: string;
  courts: string[];
  isEvent?: boolean;
}

function groupCalendarLocks(rawLocks: Booking[]): GroupedCalendarLock[] {
  if (!rawLocks || rawLocks.length === 0) return [];

  const explicitGroups = new Map<string, Booking[]>();
  const toCluster: Booking[] = [];

  rawLocks.forEach((b) => {
    const gId = b.lockGroupId || (b as any).parentLockId;
    if (gId) {
      if (!explicitGroups.has(gId)) {
        explicitGroups.set(gId, []);
      }
      explicitGroups.get(gId)!.push(b);
    } else {
      toCluster.push(b);
    }
  });

  const result: GroupedCalendarLock[] = [];

  // 1. Process explicit groups (created together via lockGroupId)
  explicitGroups.forEach((items, gId) => {
    if (items.length === 0) return;
    const dates = Array.from(new Set(items.map((b) => b.date))).sort();
    for (const d of dates) {
      const dateItems = items.filter((b) => b.date === d);
      const timeIndices = dateItems
        .map((b) => TIME_SLOTS.indexOf(b.time))
        .filter((idx) => idx !== -1);
      const minIdx = timeIndices.length > 0 ? Math.min(...timeIndices) : 0;
      const maxIdx = timeIndices.length > 0 ? Math.max(...timeIndices) : 0;
      const startTime = TIME_SLOTS[minIdx] || dateItems[0].time;
      const endTime = TIME_SLOTS[maxIdx + 1] || "22:00";
      const courts = Array.from(new Set(dateItems.map((b) => b.court))).sort();

      result.push({
        id: `${gId}_${d}`,
        bookingIds: dateItems.map((b) => b.id),
        date: d,
        reason: dateItems[0].reason || "",
        startTime,
        endTime,
        courts,
        isEvent: dateItems[0].isEvent,
      });
    }
  });

  // 2. Process items without explicit lockGroupId: cluster by date and normalized reason
  const buckets = new Map<string, Booking[]>();
  toCluster.forEach((b) => {
    const key = `${b.date}___${(b.reason || "").trim().toLowerCase()}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(b);
  });

  const finishCluster = (cluster: Booking[]) => {
    if (cluster.length === 0) return;
    const timeIndices = cluster
      .map((b) => TIME_SLOTS.indexOf(b.time))
      .filter((idx) => idx !== -1);
    const minIdx = timeIndices.length > 0 ? Math.min(...timeIndices) : 0;
    const maxIdx = timeIndices.length > 0 ? Math.max(...timeIndices) : 0;
    const startTime = TIME_SLOTS[minIdx] || cluster[0].time;
    const endTime = TIME_SLOTS[maxIdx + 1] || "22:00";
    const courts = Array.from(new Set(cluster.map((b) => b.court))).sort();

    result.push({
      id: cluster[0].id,
      bookingIds: cluster.map((b) => b.id),
      date: cluster[0].date,
      reason: cluster[0].reason || "",
      startTime,
      endTime,
      courts,
      isEvent: cluster[0].isEvent,
    });
  };

  buckets.forEach((items) => {
    items.sort(
      (a, b) => TIME_SLOTS.indexOf(a.time) - TIME_SLOTS.indexOf(b.time)
    );

    let currentCluster: Booking[] = [];
    let currentMaxIdx = -1;

    for (const item of items) {
      const idx = TIME_SLOTS.indexOf(item.time);
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        currentMaxIdx = idx;
      } else {
        if (idx <= currentMaxIdx + 1) {
          currentCluster.push(item);
          if (idx > currentMaxIdx) {
            currentMaxIdx = idx;
          }
        } else {
          finishCluster(currentCluster);
          currentCluster = [item];
          currentMaxIdx = idx;
        }
      }
    }
    if (currentCluster.length > 0) {
      finishCluster(currentCluster);
    }
  });

  return result.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return TIME_SLOTS.indexOf(a.startTime) - TIME_SLOTS.indexOf(b.startTime);
  });
}

const AdminSettings: React.FC<AdminSettingsProps> = ({
  users,
  onUpdateUsers,
  bookings,
  onUpdateBookings,
  currentUser,
  settings,
  onUpdateSettings,
  onDirtyChange,
  triggerSave,
  rankings,
  onUpdateRankings,
  tournaments,
  onAddTournament,
  onUpdateTournament,
  onDeleteTournament,
  onActAsUser,
  onSaveBooking,
  onDeleteBooking,
  isSuperAdminImpersonating = false,
  onNavigateToChampionship,
  initialTab,
  onUpdateLandingPageConfig,
}) => {
  const { t, i18n } = useTranslation();
  const translateCourt = (c: string) => getTenantTranslation(c, "courts", settings, i18n?.language);
  const currentClubId = settings?.vereinsId || settings?.id || currentUser.vereinsId || "sv-neuhausen";
  const [currentTab, setCurrentTab] = useState<
    | "allgemein"
    | "navigation"
    | "landing_page"
    | "rules"
    | "tournaments"
    | "sperren"
    | "layout"
    | "translations"
    | "users"
    | "onboarding"
    | "notifications"
    | "database"
    | "ranking"
    | "championship"
    | "arbeitseinsaetze"
  >((initialTab as any) || "allgemein");

  useEffect(() => {
    if (initialTab) {
      setCurrentTab(initialTab as any);
    }
  }, [initialTab]);
  const [pendingTab, setPendingTab] = useState<typeof currentTab | null>(null);

  const formatPlayerName = (name?: any): string => {
    if (!name || typeof name !== "string") return "";
    const trimmed = name.trim();
    if (!trimmed) return "";
    
    // Try finding the user by their ID / username in the users list
    let foundUser = users && typeof users === "object" ? users[trimmed] : null;
    
    if (!foundUser && users && typeof users === "object") {
      // Find user by scanning users values for matching username, klarname, or full name combinations
      foundUser = (Object.values(users) as User[]).find((u) => {
        if (!u) return false;
        const uName = (u.name || "").toLowerCase();
        const uKlarname = (u.klarname || "").toLowerCase();
        const full = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
        const reverseFull = `${u.lastName || ""}, ${u.firstName || ""}`.trim().replace(/^, |,$/, "").toLowerCase();
        const target = trimmed.toLowerCase();
        return (
          uName === target ||
          uKlarname === target ||
          full === target ||
          reverseFull === target
        );
      });
    }

    if (foundUser) {
      if (foundUser.firstName || foundUser.lastName) {
        const first = (foundUser.firstName || "").trim();
        const last = (foundUser.lastName || "").trim();
        if (first && last) return `${first} ${last}`;
        return first || last || foundUser.name || "";
      }
      if (foundUser.klarname) {
        if (foundUser.klarname.includes(",")) {
          const parts = foundUser.klarname.split(",").map((p) => p.trim());
          if (parts.length === 2) {
            return `${parts[1]} ${parts[0]}`;
          }
        }
        return foundUser.klarname;
      }
      return foundUser.name || "";
    }

    if (trimmed.includes(",")) {
      const parts = trimmed.split(",").map((p) => p.trim());
      if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
      }
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      return parts.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }
    return trimmed;
  };

  // --- Events (Tournaments) Form States ---
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(
    null,
  );
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventRegistrationStart, setEventRegistrationStart] = useState("");
  const [eventRegistrationEnd, setEventRegistrationEnd] = useState("");
  const [eventDeregistrationStart, setEventDeregistrationStart] = useState("");
  const [eventDeregistrationEnd, setEventDeregistrationEnd] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventHideExpired, setEventHideExpired] = useState(true);
  const [eventAllowComment, setEventAllowComment] = useState(false);
  const [eventMaxParticipants, setEventMaxParticipants] = useState<string>("");
  const [eventIsRegistrationBlocked, setEventIsRegistrationBlocked] =
    useState<boolean>(false);

  const resetEventForm = () => {
    setEditingTournamentId(null);
    setEventTitle("");
    setEventDate("");
    setEventStartTime("");
    setEventEndTime("");
    setEventRegistrationStart("");
    setEventRegistrationEnd("");
    setEventDeregistrationStart("");
    setEventDeregistrationEnd("");
    setEventDescription("");
    setEventHideExpired(true);
    setEventAllowComment(false);
    setEventMaxParticipants("");
    setEventIsRegistrationBlocked(false);
  };

  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) {
      setMessage({
        text: "Der Name der Veranstaltung ist ein Pflichtfeld.",
        type: "error",
      });
      return;
    }

    const eventData = {
      title: eventTitle.trim(),
      date: eventDate || null,
      startTime: eventStartTime || null,
      endTime: eventEndTime || null,
      registrationStart: eventRegistrationStart || null,
      registrationEnd: eventRegistrationEnd || null,
      deregistrationStart: eventDeregistrationStart || null,
      deregistrationEnd: eventDeregistrationEnd || null,
      description: eventDescription.trim() || null,
      hideExpired: eventHideExpired,
      allowComment: eventAllowComment,
      maxParticipants: eventMaxParticipants
        ? parseInt(eventMaxParticipants, 10)
        : null,
      isRegistrationBlocked: eventIsRegistrationBlocked || null,
    };

    if (editingTournamentId) {
      onUpdateTournament(editingTournamentId, eventData);
      setMessage({
        text: `Veranstaltung "${eventTitle}" erfolgreich aktualisiert.`,
        type: "success",
      });
    } else {
      onAddTournament(eventData);
      setMessage({
        text: `Veranstaltung "${eventTitle}" erfolgreich erstellt.`,
        type: "success",
      });
    }
    resetEventForm();
  };

  const handleStartEditEvent = (t: Tournament) => {
    setEditingTournamentId(t.id);
    setEventTitle(t.title);
    setEventDate(t.date || "");
    setEventStartTime(t.startTime || "");
    setEventEndTime(t.endTime || "");
    setEventRegistrationStart(t.registrationStart || "");
    setEventRegistrationEnd(t.registrationEnd || "");
    setEventDeregistrationStart(t.deregistrationStart || "");
    setEventDeregistrationEnd(t.deregistrationEnd || "");
    setEventDescription(t.description || "");
    setEventHideExpired(t.hideExpired ?? true);
    setEventAllowComment(t.allowComment || false);
    setEventMaxParticipants(t.maxParticipants ? String(t.maxParticipants) : "");
    setEventIsRegistrationBlocked(t.isRegistrationBlocked || false);
  };

  const [csvPreview, setCsvPreview] = useState<User[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const welcomeTextRef = useRef<HTMLTextAreaElement | null>(null);
  const impressumTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [activeActionMenuUserId, setActiveActionMenuUserId] = useState<string | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Authentication Mail Confirmation Modal State
  const [authMailModal, setAuthMailModal] = useState<{
    isOpen: boolean;
    mode: "single" | "bulk";
    type: "activation" | "reset";
    user?: User;
    userIds?: string[];
    usersList?: User[];
    loading?: boolean;
    previewOpen?: boolean;
    activeTemplate?: EmailTemplate | null;
  } | null>(null);

  // Club Email & Notification Status for Tenant
  const [clubEmailStatus, setClubEmailStatus] = useState<{
    isLoaded: boolean;
    isPaused: boolean;
    activationActive: boolean;
    resetActive: boolean;
  }>({
    isLoaded: false,
    isPaused: false,
    activationActive: true,
    resetActive: true,
  });

  useEffect(() => {
    let isMounted = true;
    loadClubEmailTemplatesData(settings.vereinsId || "sv-neuhausen")
      .then((data) => {
        if (!isMounted) return;
        setClubEmailStatus({
          isLoaded: true,
          isPaused: data.isGlobalEmailPaused === true,
          activationActive: data.systemwideActive?.USER_ACTIVATION !== false,
          resetActive: data.systemwideActive?.PASSWORD_RESET !== false,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setClubEmailStatus({
          isLoaded: true,
          isPaused: false,
          activationActive: true,
          resetActive: true,
        });
      });
    return () => {
      isMounted = false;
    };
  }, [settings.vereinsId, currentTab]);

  // Open Single Activation Modal
  const openSendActivationModal = async (u: User) => {
    setActiveActionMenuUserId(null);
    let tmpl: EmailTemplate | null = null;
    try {
      const clubData = await loadClubEmailTemplatesData(settings.vereinsId || "sv-neuhausen");
      tmpl = getActiveTemplateForEvent("USER_ACTIVATION", clubData.templates, clubData.assignments);
    } catch {}
    if (!tmpl) tmpl = DEFAULT_EMAIL_TEMPLATES.USER_ACTIVATION;

    setAuthMailModal({
      isOpen: true,
      mode: "single",
      type: "activation",
      user: u,
      activeTemplate: tmpl,
      previewOpen: false,
    });
  };

  // Open Single Reset Modal
  const openSendResetModal = async (u: User) => {
    setActiveActionMenuUserId(null);
    let tmpl: EmailTemplate | null = null;
    try {
      const clubData = await loadClubEmailTemplatesData(settings.vereinsId || "sv-neuhausen");
      tmpl = getActiveTemplateForEvent("PASSWORD_RESET", clubData.templates, clubData.assignments);
    } catch {}
    if (!tmpl) tmpl = DEFAULT_EMAIL_TEMPLATES.PASSWORD_RESET;

    setAuthMailModal({
      isOpen: true,
      mode: "single",
      type: "reset",
      user: u,
      activeTemplate: tmpl,
      previewOpen: false,
    });
  };

  // Open Bulk Activation Modal
  const openBulkActivationModal = async () => {
    if (selectedUserIds.size === 0) return;
    const targetUsers = Array.from(selectedUserIds)
      .map((id) => users[id])
      .filter(Boolean);

    let tmpl: EmailTemplate | null = null;
    try {
      const clubData = await loadClubEmailTemplatesData(settings.vereinsId || "sv-neuhausen");
      tmpl = getActiveTemplateForEvent("USER_ACTIVATION", clubData.templates, clubData.assignments);
    } catch {}
    if (!tmpl) tmpl = DEFAULT_EMAIL_TEMPLATES.USER_ACTIVATION;

    setAuthMailModal({
      isOpen: true,
      mode: "bulk",
      type: "activation",
      userIds: Array.from(selectedUserIds),
      usersList: targetUsers,
      activeTemplate: tmpl,
      previewOpen: false,
    });
  };

  // Live preview for Auth Mail Confirmation Modal
  const authMailPreview = useMemo(() => {
    if (!authMailModal?.isOpen || !authMailModal?.activeTemplate) return null;
    const targetUser = authMailModal.user || (authMailModal.usersList && authMailModal.usersList[0]);
    const memberName = targetUser?.lastName || targetUser?.firstName
      ? `${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim()
      : (targetUser?.name || "Alexander Becker");
    const payload = {
      user_name: memberName,
      club_name: settings.clubName || "Tennisclub e.V.",
      activation_link: `${window.location.origin}/#activate?token=act_sample_token&userId=${encodeURIComponent(targetUser?.id || targetUser?.name || "user123")}`,
      password_reset_link: `${window.location.origin}/#reset-password?token=rst_sample_token&userId=${encodeURIComponent(targetUser?.id || targetUser?.name || "user123")}`,
      link_validity_hours: authMailModal.type === "activation" ? "24" : "1",
    };
    try {
      return getLiveEmailPreview(authMailModal.activeTemplate, payload, settings.clubName || "Tennisclub e.V.");
    } catch (e) {
      return {
        subject: authMailModal.activeTemplate.subject,
        html: authMailModal.activeTemplate.bodyHtml,
        text: authMailModal.activeTemplate.subject,
      };
    }
  }, [authMailModal?.isOpen, authMailModal?.activeTemplate, authMailModal?.user, authMailModal?.usersList, authMailModal?.type, settings.clubName]);

  // Execute Sending from Confirmation Modal
  const handleConfirmSendAuthMail = async () => {
    if (!authMailModal) return;
    setAuthMailModal((prev) => (prev ? { ...prev, loading: true } : null));

    try {
      if (authMailModal.mode === "single" && authMailModal.user) {
        const u = authMailModal.user;
        const uid = u.id || u.name;

        if (authMailModal.type === "activation") {
          const res = await sendUserActivationApi(uid, {
            vereinsId: settings.vereinsId || "sv-neuhausen",
            clubName: settings.clubName || "Tennisclub e.V.",
            user: u,
          });

          if (!res.success) {
            setNotification({
              type: "error",
              text: res.message || "Fehler beim Versenden der Aktivierungs-E-Mail.",
            });
            return;
          }

          // Update local user state
          const updatedUser: User = {
            ...u,
            activationSentAt: res.sentAt || new Date().toISOString(),
          };
          const nextUsers = { ...users, [u.name]: updatedUser };
          onUpdateUsers(nextUsers);
          if (editingUser && (editingUser.id === u.id || editingUser.name === u.name)) {
            setEditingUser(updatedUser);
          }

          setNotification({
            type: "success",
            text: `Aktivierungs-E-Mail erfolgreich an ${u.email} versendet!`,
          });
        } else {
          // Password reset
          const res = await sendUserPasswordResetApi(uid, {
            vereinsId: settings.vereinsId || "sv-neuhausen",
            clubName: settings.clubName || "Tennisclub e.V.",
            user: u,
          });

          if (!res.success) {
            setNotification({
              type: "error",
              text: res.message || "Fehler beim Versenden der Passwortreset-E-Mail.",
            });
            return;
          }

          // Update local user state
          const updatedUser: User = {
            ...u,
            passwordResetSentAt: res.sentAt || new Date().toISOString(),
          };
          const nextUsers = { ...users, [u.name]: updatedUser };
          onUpdateUsers(nextUsers);
          if (editingUser && (editingUser.id === u.id || editingUser.name === u.name)) {
            setEditingUser(updatedUser);
          }

          setNotification({
            type: "success",
            text: `Passwortreset-E-Mail erfolgreich an ${u.email} versendet!`,
          });
        }
      } else if (authMailModal.mode === "bulk" && authMailModal.userIds) {
        const uids = authMailModal.userIds;
        const res = await bulkSendUserActivationApi(uids, {
          vereinsId: settings.vereinsId || "sv-neuhausen",
          clubName: settings.clubName || "Tennisclub e.V.",
          users,
        });

        // Update timestamps in local state
        if (res.updatedTimestamps) {
          const nextUsers = { ...users };
          for (const [uid, sentAt] of Object.entries(res.updatedTimestamps)) {
            const foundKey = Object.keys(nextUsers).find(
              (k) => nextUsers[k].id === uid || nextUsers[k].name === uid
            );
            if (foundKey) {
              nextUsers[foundKey] = {
                ...nextUsers[foundKey],
                activationSentAt: sentAt,
              };
            }
          }
          onUpdateUsers(nextUsers);
        }

        setSelectedUserIds(new Set());
        setNotification({
          type: res.success ? "success" : "error",
          text: res.message,
        });
      }

      setAuthMailModal(null);
    } catch (err: any) {
      console.error("handleConfirmSendAuthMail error:", err);
      setNotification({
        type: "error",
        text: err.message || "Ausnahmefehler beim E-Mail-Versand.",
      });
    } finally {
      setAuthMailModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  // Import States
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<
    "idle" | "parsing" | "ready" | "importing" | "success" | "error"
  >("idle");
  const [importErrorMsg, setImportErrorMsg] = useState<string>("");
  const [importPreview, setImportPreview] = useState<Booking[]>([]);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importProgress, setImportProgress] = useState(0);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const generateDemoBookings = (
    currentUserId: string,
    courtsList: string[] = ["Platz 1", "Platz 2", "Platz 3"],
  ): Booking[] => {
    const getRelativeDateStr = (days: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split("T")[0];
    };

    const court1 = courtsList[0] || "Platz 1";
    const court2 = courtsList[1] || "Platz 2";
    const court3 = courtsList[2] || "Platz 3";

    return [
      {
        id: `demo_today_1`,
        date: getRelativeDateStr(0),
        time: "09:00",
        court: court1,
        players: ["Maximilian Kraft", "Sebastian Becker"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: currentUserId,
        comment: "Spitzenspiel der Herrenmannschaft",
      },
      {
        id: `demo_today_2`,
        date: getRelativeDateStr(0),
        time: "10:00",
        court: court1,
        players: ["Maximilian Kraft", "Sebastian Becker"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: currentUserId,
        comment: "Spitzenspiel der Herrenmannschaft",
      },
      {
        id: `demo_today_3`,
        date: getRelativeDateStr(0),
        time: "14:00",
        court: court2,
        players: [],
        isLocked: true,
        hasBallMachine: false,
        reason: "Jugendclubtraining (Gesperrt)",
        bookedBy: currentUserId,
      },
      {
        id: `demo_today_4`,
        date: getRelativeDateStr(0),
        time: "15:00",
        court: court2,
        players: [],
        isLocked: true,
        hasBallMachine: false,
        reason: "Jugendclubtraining (Gesperrt)",
        bookedBy: currentUserId,
      },
      {
        id: `demo_today_5`,
        date: getRelativeDateStr(0),
        time: "17:00",
        court: court1,
        players: ["Anna Wagner", "Sabine Schmidt"],
        isLocked: false,
        hasBallMachine: true,
        bookedBy: "demo_user_anna",
        comment: "Aufschlagtraining mit Ballmaschine",
      },
      {
        id: `demo_today_6`,
        date: getRelativeDateStr(0),
        time: "18:00",
        court: court3,
        players: [
          "Christian Meyer",
          "Thomas Klein",
          "Dieter Fuchs",
          "Jonas Lang",
        ],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: "demo_user_chris",
        comment: "Senioren Doppelrunde",
      },
      {
        id: `demo_tomorrow_1`,
        date: getRelativeDateStr(1),
        time: "08:00",
        court: court1,
        players: [],
        isLocked: true,
        hasBallMachine: false,
        reason: "Regelmäßige Platzpflege & Bewässerung",
        bookedBy: currentUserId,
      },
      {
        id: `demo_tomorrow_2`,
        date: getRelativeDateStr(1),
        time: "10:00",
        court: court1,
        players: ["Michael Schumacher", "Ralf Schumacher"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: "demo_user_michael",
        comment: "Bruderduell am Vormittag",
      },
      {
        id: `demo_tomorrow_3`,
        date: getRelativeDateStr(1),
        time: "15:00",
        court: court2,
        players: ["Sabine Schmidt", "Elena Becker"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: "demo_user_sabine",
        comment: "Damenmannschaft Training",
      },
      {
        id: `demo_tomorrow_4`,
        date: getRelativeDateStr(1),
        time: "16:00",
        court: court1,
        players: [],
        isLocked: true,
        hasBallMachine: false,
        reason: "Punktspiel: Herren 50 (Gesperrt)",
        bookedBy: currentUserId,
      },
      {
        id: `demo_tomorrow_5`,
        date: getRelativeDateStr(1),
        time: "17:00",
        court: court1,
        players: [],
        isLocked: true,
        hasBallMachine: false,
        reason: "Punktspiel: Herren 50 (Gesperrt)",
        bookedBy: currentUserId,
      },
      {
        id: `demo_yesterday_1`,
        date: getRelativeDateStr(-1),
        time: "11:00",
        court: court1,
        players: ["Christian Meyer", "Sabine Schmidt"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: "demo_user_chris",
        comment: "Lockeres Einzel am Feiertag",
      },
      {
        id: `demo_yesterday_2`,
        date: getRelativeDateStr(-1),
        time: "16:00",
        court: court2,
        players: ["Thomas Klein", "Dieter Fuchs"],
        isLocked: false,
        hasBallMachine: true,
        bookedBy: "demo_user_thomas",
        comment: "Taktik- und Ballmaschinentraining",
      },
      {
        id: `demo_days2_1`,
        date: getRelativeDateStr(2),
        time: "18:00",
        court: court1,
        players: ["Lukas Haas", "David Wagner"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: currentUserId,
        comment: "Clubmeisterschaft Qualifikation",
      },
      {
        id: `demo_days2_2`,
        date: getRelativeDateStr(2),
        time: "19:00",
        court: court1,
        players: ["Lukas Haas", "David Wagner"],
        isLocked: false,
        hasBallMachine: false,
        bookedBy: currentUserId,
        comment: "Clubmeisterschaft Qualifikation",
      },
    ];
  };

  const initiateFileImport = (file: File) => {
    setImportFile(file);
    setImportStatus("parsing");
    setImportErrorMsg("");
    setImportPreview([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error(
              "Die JSON-Datei muss ein Array von Buchungen enthalten.",
            );
          }
          const validBookings = parsed.filter(
            (b: any) =>
              b && typeof b === "object" && b.date && b.time && b.court,
          );
          if (validBookings.length === 0) {
            throw new Error(
              "Keine gültigen Buchungsobjekte mit Datum, Uhrzeit und Platz gefunden.",
            );
          }
          const normalized: Booking[] = validBookings.map((b: any) => ({
            id: b.id || Math.random().toString(36).substr(2, 9),
            date: String(b.date),
            time: String(b.time),
            court: String(b.court),
            players: Array.isArray(b.players) ? b.players.map(String) : [],
            isLocked: !!b.isLocked,
            hasBallMachine: !!b.hasBallMachine,
            reason: b.reason || "",
            bookedBy: b.bookedBy || "",
            comment: b.comment || "",
          }));
          setImportPreview(normalized);
          setImportStatus("ready");
        } else if (file.name.endsWith(".csv")) {
          const lines = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length === 0) {
            throw new Error("Die CSV-Datei ist leer.");
          }
          const firstLine = lines[0];
          const separator = firstLine.includes(";") ? ";" : ",";

          const parseCSVLine = (line: string, sep: string) => {
            const result: string[] = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === sep && !inQuotes) {
                result.push(current.trim());
                current = "";
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          };

          const rawHeaders = parseCSVLine(firstLine, separator);
          const headers = rawHeaders.map((h) =>
            h.toLowerCase().replace(/["\s\-]/g, ""),
          );

          const idIdx = headers.findIndex(
            (h) => h.includes("id") || h.includes("buchungs"),
          );
          const dateIdx = headers.findIndex(
            (h) => h.includes("datum") || h === "date",
          );
          const timeIdx = headers.findIndex(
            (h) => h.includes("uhrzeit") || h.includes("time"),
          );
          const courtIdx = headers.findIndex(
            (h) => h.includes("platz") || h === "court",
          );
          const playersIdx = headers.findIndex(
            (h) => h.includes("spieler") || h === "players",
          );
          const isLockedIdx = headers.findIndex(
            (h) => h.includes("gesperrt") || h === "islocked" || h === "locked",
          );
          const reasonIdx = headers.findIndex(
            (h) =>
              h.includes("grund") || h.includes("sperre") || h === "reason",
          );
          const bookedByIdx = headers.findIndex(
            (h) => h.includes("gebucht") || h === "bookedby",
          );
          const ballMachineIdx = headers.findIndex(
            (h) => h.includes("ballmaschine") || h === "hasballmachine",
          );
          const commentIdx = headers.findIndex(
            (h) => h.includes("kommentar") || h === "comment",
          );

          if (dateIdx === -1 || timeIdx === -1 || courtIdx === -1) {
            throw new Error(
              'Erforderliche Spalten wie "Datum", "Uhrzeit" oder "Platz" konnten im CSV-Header nicht identifiziert werden.',
            );
          }

          const parsedBookings: Booking[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i], separator);
            if (cols.length < Math.max(dateIdx, timeIdx, courtIdx) + 1)
              continue;

            const id =
              idIdx !== -1 && cols[idIdx]
                ? cols[idIdx]
                : Math.random().toString(36).substr(2, 9);
            const date = cols[dateIdx];
            const time = cols[timeIdx];
            const court = cols[courtIdx];

            let playersList: string[] = [];
            if (playersIdx !== -1 && cols[playersIdx]) {
              playersList = cols[playersIdx]
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
            }

            const isLockedVal =
              isLockedIdx !== -1 ? cols[isLockedIdx].toLowerCase() : "nein";
            const isLocked =
              isLockedVal === "ja" ||
              isLockedVal === "true" ||
              isLockedVal === "1";

            const reason = reasonIdx !== -1 ? cols[reasonIdx] : "";
            const bookedBy = bookedByIdx !== -1 ? cols[bookedByIdx] : "";

            const ballMachineVal =
              ballMachineIdx !== -1
                ? cols[ballMachineIdx].toLowerCase()
                : "nein";
            const hasBallMachine =
              ballMachineVal === "ja" ||
              ballMachineVal === "true" ||
              ballMachineVal === "1";

            const comment = commentIdx !== -1 ? cols[commentIdx] : "";

            if (date && time && court) {
              parsedBookings.push({
                id,
                date,
                time,
                court,
                players: playersList,
                isLocked,
                hasBallMachine,
                reason,
                bookedBy,
                comment,
              });
            }
          }

          if (parsedBookings.length === 0) {
            throw new Error(
              "Es wurden keine gültigen Buchungszeilen im CSV gefunden.",
            );
          }

          setImportPreview(parsedBookings);
          setImportStatus("ready");
        } else {
          throw new Error(
            "Dateiformat wird nicht unterstützt. Bitte wählen Sie eine *.csv oder *.json Datei.",
          );
        }
      } catch (err: any) {
        setImportErrorMsg(
          err.message || "Fehler beim Lesen oder Parsen der Datei.",
        );
        setImportStatus("error");
      }
    };
    reader.onerror = () => {
      setImportErrorMsg("Fehler beim Laden der Datei.");
      setImportStatus("error");
    };
    reader.readAsText(file);
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    initiateFileImport(file);
  };

  const runFileImport = async () => {
    if (importPreview.length === 0) return;
    setImportStatus("importing");
    setImportProgress(0);

    try {
      const total = importPreview.length;

      // Safe merge only - adding without overwriting/replacing existing records
      for (let i = 0; i < total; i++) {
        if (onSaveBooking) {
          await onSaveBooking(importPreview[i]);
        }
        setImportProgress(Math.round(((i + 1) / total) * 100));
      }

      setImportStatus("success");
      setImportFile(null);
      setMessage({
        text: `${total} Buchungen wurden erfolgreich importiert (hinzugefügt).`,
        type: "success",
      });
    } catch (err: any) {
      setImportErrorMsg(
        err.message || "Fehler beim Speichern der Buchungen in der Datenbank.",
      );
      setImportStatus("error");
    }
  };

  // Deletion States
  const [showDeleteModal, setShowDeleteModal] = useState<
    "bookings" | "users" | null
  >(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteRange, setDeleteRange] = useState({
    start: "",
    end: "",
    court: "all",
  });

  // Export & Embed Widget States
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [widgetLinkCopied, setWidgetLinkCopied] = useState(false);
  const [widgetIframeCopied, setWidgetIframeCopied] = useState(false);

  // Settings State Drafts
  const [clubName, setClubName] = useState(settings.clubName || "");
  const [street, setStreet] = useState(settings.street || "");
  const [zip, setZip] = useState(settings.zip || "");
  const [city, setCity] = useState(settings.city || "");
  const [defaultLanguage, setDefaultLanguage] = useState<"de" | "en">(
    settings.i18n?.defaultLanguage || "de"
  );
  const [allowOtherLanguage, setAllowOtherLanguage] = useState<boolean>(() => {
    const def = settings.i18n?.defaultLanguage || "de";
    const supported = settings.i18n?.supportedLanguages || [def];
    const other = def === "de" ? "en" : "de";
    return supported.includes(other);
  });
  const [facilityPhotoUrl, setFacilityPhotoUrl] = useState(
    settings.facilityPhotoUrl || ""
  );
  const [customFacilityPhotoUrl, setCustomFacilityPhotoUrl] = useState(
    settings.customFacilityPhotoUrl ||
      (settings.facilityPhotoUrl ? settings.facilityPhotoUrl : "")
  );
  const [customAiInstructions, setCustomAiInstructions] = useState(
    settings.customAiInstructions || ""
  );
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || "");
  const [headerLogoUrl, setHeaderLogoUrl] = useState(
    settings.headerLogoUrl || settings.logoUrl || "",
  );
  const [faviconUrl, setFaviconUrl] = useState(
    settings.faviconUrl || "/favicon.svg",
  );
  const [customLogoUrl, setCustomLogoUrl] = useState(
    settings.customLogoUrl ||
      (settings.logoUrl !== DEFAULT_SETTINGS.logoUrl ? settings.logoUrl : ""),
  );
  const [customHeaderLogoUrl, setCustomHeaderLogoUrl] = useState(
    settings.customHeaderLogoUrl ||
      (settings.headerLogoUrl &&
      settings.headerLogoUrl !== DEFAULT_SETTINGS.headerLogoUrl
        ? settings.headerLogoUrl
        : ""),
  );
  const [customFaviconUrl, setCustomFaviconUrl] = useState(
    settings.customFaviconUrl ||
      (settings.faviconUrl !== DEFAULT_SETTINGS.faviconUrl
        ? settings.faviconUrl
        : ""),
  );
  const [faviconInputMode, setFaviconInputMode] = useState<"upload" | "url">(
    (settings.customFaviconUrl || "").startsWith("http") ? "url" : "upload",
  );
  const isNeuhausenClub = Boolean(
    settings.clubName?.toLowerCase().includes("neuhausen") ||
    (currentClubId || "").toLowerCase().includes("neuhausen")
  );
  const defaultBannerImg = DEFAULT_SETTINGS.bannerUrl;
  const defaultLoginBannerImg = DEFAULT_SETTINGS.loginBannerUrl || DEFAULT_SETTINGS.bannerUrl;

  const [useDefaultBanner, setUseDefaultBanner] = useState<boolean>(() => {
    if (settings.useDefaultBanner !== undefined) {
      return Boolean(settings.useDefaultBanner);
    }
    return Boolean(!settings.bannerUrl || settings.bannerUrl === defaultBannerImg);
  });
  const [bannerUrl, setBannerUrl] = useState(settings.bannerUrl || defaultBannerImg);
  const [customBannerUrl, setCustomBannerUrl] = useState(
    settings.customBannerUrl ||
      (settings.bannerUrl && settings.bannerUrl !== defaultBannerImg
        ? settings.bannerUrl
        : ""),
  );

  const [useDefaultLoginBanner, setUseDefaultLoginBanner] = useState<boolean>(() => {
    if (settings.useDefaultLoginBanner !== undefined) {
      return Boolean(settings.useDefaultLoginBanner);
    }
    return Boolean(
      !settings.loginBannerUrl ||
      settings.loginBannerUrl === defaultLoginBannerImg ||
      settings.loginBannerUrl === defaultBannerImg
    );
  });
  const [loginBannerUrl, setLoginBannerUrl] = useState(
    settings.loginBannerUrl || defaultLoginBannerImg,
  );
  const [customLoginBannerUrl, setCustomLoginBannerUrl] = useState(
    settings.customLoginBannerUrl ||
      (settings.loginBannerUrl &&
      settings.loginBannerUrl !== defaultLoginBannerImg &&
      settings.loginBannerUrl !== defaultBannerImg
        ? settings.loginBannerUrl
        : ""),
  );
  const [bannerPosition, setBannerPosition] = useState(
    settings.bannerPosition || "50% 50%",
  );
  const [bannerType, setBannerType] = useState<"image" | "color" | "gradient">(
    settings.bannerType || (isNeuhausenClub ? "image" : "gradient"),
  );
  const [bannerColor, setBannerColor] = useState<string>(
    settings.bannerColor || settings.primaryColor || "#1b4332",
  );
  const [bannerGradientStart, setBannerGradientStart] = useState<string>(
    settings.bannerGradientStart || settings.primaryColor || "#1b4332",
  );
  const [bannerGradientEnd, setBannerGradientEnd] = useState<string>(
    settings.bannerGradientEnd || settings.accentColor || "#2d6a4f",
  );
  const [showBannerPositionModal, setShowBannerPositionModal] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [accentColor, setAccentColor] = useState(
    settings.accentColor || "#c04d2b",
  );
  const [accentColor2, setAccentColor2] = useState(
    settings.accentColor2 || "#0f172a",
  );
  const [accentColor3, setAccentColor3] = useState(
    settings.accentColor3 || "#ccff00",
  );
  const [isCustomColors, setIsCustomColors] = useState(
    !(
      settings.primaryColor === DEFAULT_SETTINGS.primaryColor &&
      (settings.accentColor || "#c04d2b") === DEFAULT_SETTINGS.accentColor &&
      (settings.accentColor2 || "#0f172a") === DEFAULT_SETTINGS.accentColor2 &&
      (settings.accentColor3 || "#ccff00") === DEFAULT_SETTINGS.accentColor3
    ),
  );
  const [websiteUrl, setWebsiteUrl] = useState(
    settings.websiteUrl ||
      (settings.clubName?.toLowerCase().includes("neuhausen")
        ? "https://www.svneuhausen1947.de/tennis"
        : ""),
  );
  const [hideWebsiteLink, setHideWebsiteLink] = useState(
    settings.hideWebsiteLink ??
      !settings.clubName?.toLowerCase().includes("neuhausen"),
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    settings.welcomeMessage ||
      `Herzlich willkommen im modernisierten Reservierungssystem des ${settings.clubName || "Vereins"}! Organisiere deine Matches jetzt noch einfacher und behalte alle Events und Ranglisten stets im Blick.`,
  );
  const [courtsList, setCourtsList] = useState<string[]>(
    settings.courts || ["Platz 1", "Platz 2"],
  );
  const [newCourtName, setNewCourtName] = useState("");
  const [equipmentList, setEquipmentList] = useState<string[]>(() =>
    settings.equipmentList && settings.equipmentList.length > 0
      ? settings.equipmentList
      : ["Ballmaschine", "Ballkorb"]
  );
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [sollStunden, setSollStunden] = useState<number>(
    settings.arbeitseinsaetzeSettings?.sollStunden ?? 10
  );
  const [aeCategories, setAeCategories] = useState<string[]>(
    (settings.arbeitseinsaetzeSettings?.categories ?? ["Platzpflege", "Clubheimreinigung", "Bewirtung", "Sonstiges"]).slice().sort((a, b) => a.localeCompare(b, "de"))
  );
  const [newAeCategory, setNewAeCategory] = useState("");
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [aeVisibility, setAeVisibility] = useState<"full" | "active_only" | "hidden">(
    settings.arbeitseinsaetzeSettings?.visibility ?? "full"
  );
  const [aeInterval, setAeInterval] = useState<"0.25" | "0.5" | "1.0">(
    settings.arbeitseinsaetzeSettings?.interval ?? "0.5"
  );
  const [aeMaxDaysBack, setAeMaxDaysBack] = useState<number>(
    settings.arbeitseinsaetzeSettings?.maxDaysBack ?? 14
  );
  const [commentsRequired, setCommentsRequired] = useState<boolean>(
    settings.arbeitseinsaetzeSettings?.commentsRequired ?? false
  );
  const [showPlannedShifts, setShowPlannedShifts] = useState<boolean>(
    settings.arbeitseinsaetzeSettings?.show_planned_shifts ?? settings.show_planned_shifts ?? true
  );
  const [aeEntries, setAeEntries] = useState<ArbeitsEinsatz[]>([]);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [remapTargetCategory, setRemapTargetCategory] = useState<string>("");
  const [isRemapping, setIsRemapping] = useState<boolean>(false);
  const [aeRules, setAeRules] = useState<any[]>(
    settings.arbeitseinsatz_rules ?? settings.arbeitseinsaetzeSettings?.rules ?? []
  );
  const [isAddingAeRule, setIsAddingAeRule] = useState<boolean>(false);
  const [editingAeRuleId, setEditingAeRuleId] = useState<string | null>(null);
  const [newRuleYear, setNewRuleYear] = useState<number>(new Date().getFullYear() + 1);
  const [newRuleHours, setNewRuleHours] = useState<number>(10);

  useEffect(() => {
    const clubId = currentClubId;
    const unsubscribe = listenToArbeitseinsaetze(clubId, (entries) => {
      setAeEntries(entries);
    });
    return () => unsubscribe();
  }, [currentClubId]);

  const isSuperAdmin =
    currentUser?.role === Role.SUPER_ADMIN ||
    (currentUser?.role as any) === "super-admin" ||
    !!isSuperAdminImpersonating;

  const isLeagueEnabled = settings.modules?.league === true;

  const [modules, setModules] = useState({
    landing_page: settings.modules?.landing_page !== false,
    events: settings.modules?.events !== false,
    ranking: settings.modules?.ranking !== false,
    guests: settings.modules?.guests !== false,
    spielpartner: settings.modules?.spielpartner !== false,
    arbeitseinsaetze: settings.modules?.arbeitseinsaetze === true,
    league: settings.modules?.league === true,
    championship: settings.modules?.championship === true,
  });

  const [navOrder, setNavOrder] = useState<string[]>(() =>
    normalizeNavOrder(settings.navigationOrder),
  );

  const handleMoveNavModule = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= navOrder.length) return;
    const updated = [...navOrder];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setNavOrder(updated);
  };
  const [reservationRules, setReservationRules] = useState({
    maxAdvanceDays: 14,
    maxActiveBookings: 3,
    allowGuest: true,
    availableBallMachines: 1,
    guestFeePerHour: 2.5,
    maxBookingsPerDay: 2,
    maxBookingsPerWeek: 0,
    bypassRestrictionsForLeagueGames: false,
    cancellationDeadlineMinutes: 30,
    maxDurationMinutesSingle: 90,
    maxDurationMinutesDouble: 120,
    maxAdvanceWeeks: 2,
    allowPastBookings: true,
    requireCoplayer: false,
    allowParticipantsToEdit: false,
    openingHours: {
      "1": { start: "08:00", end: "21:00", closed: false },
      "2": { start: "08:00", end: "21:00", closed: false },
      "3": { start: "08:00", end: "21:00", closed: false },
      "4": { start: "08:00", end: "21:00", closed: false },
      "5": { start: "08:00", end: "21:00", closed: false },
      "6": { start: "08:00", end: "21:00", closed: false },
      "0": { start: "08:00", end: "21:00", closed: false },
    },
    ...(settings.reservationRules || {}),
  });
  const [guestFeeString, setGuestFeeString] = useState(
    (settings.reservationRules?.guestFeePerHour ?? 2.5)
      .toFixed(2)
      .replace(".", ","),
  );
  const [feeSettings, setFeeSettings] = useState<ClubFeeSettings>(() =>
    settings.feeSettings || getDefaultFeeSettings(settings.reservationRules)
  );
  const [isFeeSettingsValid, setIsFeeSettingsValid] = useState(true);
  const [localNews, setLocalNews] = useState(settings.news || "");
  const [impressum, setImpressum] = useState(settings.impressum || "");
  const [translations, setTranslations] = useState<Record<string, TenantLanguageTranslations>>(
    () => settings.i18n?.translations || {}
  );

  // --- Sperren / Lock Form States ---
  const [lockContext, setLockContext] = useState<"lock" | "event">("lock");
  const [newLockType, setNewLockType] = useState<"regular" | "range">(
    "regular",
  );
  const [newLockTitle, setNewLockTitle] = useState("");
  const [newLockCourts, setNewLockCourts] = useState<string[]>([]);
  const [newLockDay, setNewLockDay] = useState<number>(5); // default to Friday (5)
  const [newLockStartTime, setNewLockStartTime] = useState("15:00");
  const [newLockEndTime, setNewLockEndTime] = useState("21:00");
  const [newLockIsOngoing, setNewLockIsOngoing] = useState(true);
  const [newLockStartDate, setNewLockStartDate] = useState("");
  const [newLockEndDate, setNewLockEndDate] = useState("");
  const [newLockIsOpenOffer, setNewLockIsOpenOffer] = useState(false);
  const [newRangeStartDate, setNewRangeStartDate] = useState("");
  const [newRangeEndDate, setNewRangeEndDate] = useState("");
  const [newRangeStartTime, setNewRangeStartTime] = useState("08:00");
  const [newRangeEndTime, setNewRangeEndTime] = useState("22:00");
  const [editingLockId, setEditingLockId] = useState<string | null>(null);
  const [editingCalendarLock, setEditingCalendarLock] = useState<GroupedCalendarLock | null>(null);
  const [newLockColor, setNewLockColor] = useState("");
  const [isLockDrawerOpen, setIsLockDrawerOpen] = useState(false);
  const [isLockDrawerAnimatingIn, setIsLockDrawerAnimatingIn] = useState(false);
  const [isLockDrawerClosing, setIsLockDrawerClosing] = useState(false);

  const openLockDrawer = useCallback(() => {
    setIsLockDrawerClosing(false);
    setIsLockDrawerAnimatingIn(false);
    setIsLockDrawerOpen(true);
    setTimeout(() => setIsLockDrawerAnimatingIn(true), 10);
  }, []);

  const closeLockDrawer = useCallback((resetFields?: () => void) => {
    setIsLockDrawerClosing(true);
    setIsLockDrawerAnimatingIn(false);
    setTimeout(() => {
      setIsLockDrawerOpen(false);
      setIsLockDrawerClosing(false);
      if (resetFields) {
        resetFields();
      }
    }, 200);
  }, []);

  // Meisterschaft draft states

  const [editingUser, setEditingUser] = useState<Partial<User>>({
    name: "",
    password: "",
    role: Role.USER,
    gender: "m",
    showContactInfo: false,
    onboarding_pending: true,
  });
  const [showUserForm, setShowUserForm] = useState(false);
  const [inlineEditingUserId, setInlineEditingUserId] = useState<string | null>(
    null,
  );
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSortBy, setUserSortBy] = useState<"alphabetical" | "role">(
    "alphabetical",
  );
  const [userSortOrder, setUserSortOrder] = useState<"asc" | "desc">("asc");
  const [userToDeleteConfirm, setUserToDeleteConfirm] = useState<User | null>(
    null,
  );
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    setUserPage(1);
  }, [userSearchQuery, userSortBy, userSortOrder]);

  // --- Individual Booking Management States ---
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [bookingFilterType, setBookingFilterType] = useState<
    "all" | "future" | "past" | "bookings" | "locks"
  >("all");
  const [bookingFilterCourt, setBookingFilterCourt] = useState<string>("all");
  const [bookingPage, setBookingPage] = useState(1);
  const [editingAdminBooking, setEditingAdminBooking] =
    useState<Booking | null>(null);

  // States for the editing form inside the modal
  const [editBkDate, setEditBkDate] = useState("");
  const [editBkTime, setEditBkTime] = useState("");
  const [editBkCourt, setEditBkCourt] = useState("");
  const [editBkPlayers, setEditBkPlayers] = useState<string[]>([]);
  const [editBkHasBallMachine, setEditBkHasBallMachine] = useState(false);
  const [editBkComment, setEditBkComment] = useState("");
  const [editBkIsLocked, setEditBkIsLocked] = useState(false);
  const [editBkReason, setEditBkReason] = useState("");
  const [editBkNewPlayerQuery, setEditBkNewPlayerQuery] = useState("");
  const [editBkShowSuggestions, setEditBkShowSuggestions] = useState(false);

  useEffect(() => {
    setBookingPage(1);
  }, [bookingSearchQuery, bookingFilterType, bookingFilterCourt]);
  const [uploadingImage, setUploadingImage] = useState<{
    logo: boolean;
    headerLogo: boolean;
    favicon: boolean;
    banner: boolean;
    loginBanner: boolean;
    facilityPhoto: boolean;
  }>({
    logo: false,
    headerLogo: false,
    favicon: false,
    banner: false,
    loginBanner: false,
    facilityPhoto: false,
  });

  // --- Dynamic League Management States ---
  const [adminLeagues, setAdminLeagues] = useState<DynamicLeague[]>(() => {
    return settings.leagueSettings?.leagues && settings.leagueSettings.leagues.length > 0
      ? settings.leagueSettings.leagues
      : DEFAULT_DYNAMIC_LEAGUES;
  });
  const [newLeagueName, setNewLeagueName] = useState("");
  const [editingLeagueId, setEditingLeagueId] = useState<string | null>(null);
  const [editingLeagueName, setEditingLeagueName] = useState("");

  const handleToggleLeagueActive = (leagueId: string) => {
    const updated = adminLeagues.map((l) =>
      l.id === leagueId ? { ...l, active: !l.active } : l
    );
    setAdminLeagues(updated);
    onUpdateSettings({
      ...settings,
      leagueSettings: {
        ...(settings.leagueSettings || {
          enabled: true,
          minMatchDurationMinutes: 60,
          initialRankingPoints: 100,
          participationPoints: 5,
          maxBonusPoints: 45,
          logisticSteepnessK: 0.05,
          decayPointsPerWeek: 5,
        }),
        leagues: updated,
      },
    });
    setMessage({
      text: "Ligastatus erfolgreich aktualisiert.",
      type: "success",
    });
  };

  const handleAddLeague = () => {
    const trimmed = newLeagueName.trim();
    if (!trimmed) {
      setMessage({ text: "Bitte einen Namen für die neue Liga eingeben.", type: "error" });
      return;
    }
    const newId = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `league_${Date.now()}`;

    if (adminLeagues.some((l) => l.id === newId)) {
      setMessage({ text: "Eine Liga mit diesem Bezeichner existiert bereits.", type: "error" });
      return;
    }

    const newLeague: DynamicLeague = {
      id: newId,
      name: trimmed,
      active: true,
      displayOrder: adminLeagues.length + 1,
    };

    const updated = [...adminLeagues, newLeague];
    setAdminLeagues(updated);
    setNewLeagueName("");
    onUpdateSettings({
      ...settings,
      leagueSettings: {
        ...(settings.leagueSettings || {
          enabled: true,
          minMatchDurationMinutes: 60,
          initialRankingPoints: 100,
          participationPoints: 5,
          maxBonusPoints: 45,
          logisticSteepnessK: 0.05,
          decayPointsPerWeek: 5,
        }),
        leagues: updated,
      },
    });
    setMessage({
      text: `Liga "${trimmed}" erfolgreich angelegt.`,
      type: "success",
    });
  };

  const handleSaveEditLeagueName = (leagueId: string) => {
    const trimmed = editingLeagueName.trim();
    if (!trimmed) return;
    const updated = adminLeagues.map((l) =>
      l.id === leagueId ? { ...l, name: trimmed } : l
    );
    setAdminLeagues(updated);
    setEditingLeagueId(null);
    setEditingLeagueName("");
    onUpdateSettings({
      ...settings,
      leagueSettings: {
        ...(settings.leagueSettings || {
          enabled: true,
          minMatchDurationMinutes: 60,
          initialRankingPoints: 100,
          participationPoints: 5,
          maxBonusPoints: 45,
          logisticSteepnessK: 0.05,
          decayPointsPerWeek: 5,
        }),
        leagues: updated,
      },
    });
    setMessage({
      text: `Liganame auf "${trimmed}" geändert.`,
      type: "success",
    });
  };

  const handleDeleteLeague = (leagueId: string) => {
    if (adminLeagues.length <= 1) {
      setMessage({ text: "Es muss mindestens eine Liga im Verein verbleiben.", type: "error" });
      return;
    }
    const updated = adminLeagues.filter((l) => l.id !== leagueId);
    setAdminLeagues(updated);
    onUpdateSettings({
      ...settings,
      leagueSettings: {
        ...(settings.leagueSettings || {
          enabled: true,
          minMatchDurationMinutes: 60,
          initialRankingPoints: 100,
          participationPoints: 5,
          maxBonusPoints: 45,
          logisticSteepnessK: 0.05,
          decayPointsPerWeek: 5,
        }),
        leagues: updated,
      },
    });
    setMessage({
      text: "Liga erfolgreich entfernt.",
      type: "success",
    });
  };

  // Keep state drafts in sync with incoming settings
  useEffect(() => {
    setClubName(settings.clubName || "");
    setStreet(settings.street || "");
    setZip(settings.zip || "");
    setCity(settings.city || "");
    const incomingDef = settings.i18n?.defaultLanguage || "de";
    const incomingSupported = settings.i18n?.supportedLanguages || [incomingDef];
    setDefaultLanguage(incomingDef);
    setAllowOtherLanguage(incomingSupported.includes(incomingDef === "de" ? "en" : "de"));
    setFacilityPhotoUrl(settings.facilityPhotoUrl || "");
    setCustomFacilityPhotoUrl(
      settings.customFacilityPhotoUrl ||
        (settings.facilityPhotoUrl ? settings.facilityPhotoUrl : "")
    );
    setCustomAiInstructions(settings.customAiInstructions || "");
    setLogoUrl(settings.logoUrl || "");
    setHeaderLogoUrl(settings.headerLogoUrl || settings.logoUrl || "");
    setFaviconUrl(settings.faviconUrl || "/favicon.svg");
    setCustomLogoUrl(
      settings.customLogoUrl ||
        (settings.logoUrl !== DEFAULT_SETTINGS.logoUrl ? settings.logoUrl : ""),
    );
    setCustomHeaderLogoUrl(
      settings.customHeaderLogoUrl ||
        (settings.headerLogoUrl &&
        settings.headerLogoUrl !== DEFAULT_SETTINGS.headerLogoUrl
          ? settings.headerLogoUrl
          : ""),
    );
    setCustomFaviconUrl(
      settings.customFaviconUrl ||
        (settings.faviconUrl !== DEFAULT_SETTINGS.faviconUrl
          ? settings.faviconUrl
          : ""),
    );
    const isDefBanner = settings.useDefaultBanner !== undefined
      ? Boolean(settings.useDefaultBanner)
      : Boolean(!settings.bannerUrl || settings.bannerUrl === defaultBannerImg);
    setUseDefaultBanner(isDefBanner);
    setBannerUrl(isDefBanner ? defaultBannerImg : (settings.bannerUrl || defaultBannerImg));
    setCustomBannerUrl(
      settings.customBannerUrl ||
        (settings.bannerUrl && settings.bannerUrl !== defaultBannerImg
          ? settings.bannerUrl
          : ""),
    );

    const isDefLoginBanner = settings.useDefaultLoginBanner !== undefined
      ? Boolean(settings.useDefaultLoginBanner)
      : Boolean(
          !settings.loginBannerUrl ||
          settings.loginBannerUrl === defaultLoginBannerImg ||
          settings.loginBannerUrl === defaultBannerImg
        );
    setUseDefaultLoginBanner(isDefLoginBanner);
    setLoginBannerUrl(isDefLoginBanner ? defaultLoginBannerImg : (settings.loginBannerUrl || defaultLoginBannerImg));
    setCustomLoginBannerUrl(
      settings.customLoginBannerUrl ||
        (settings.loginBannerUrl &&
        settings.loginBannerUrl !== defaultLoginBannerImg &&
        settings.loginBannerUrl !== defaultBannerImg
          ? settings.loginBannerUrl
          : ""),
    );
    setBannerPosition(settings.bannerPosition || "50% 50%");
    setBannerType(settings.bannerType || (isNeuhausenClub ? "image" : "gradient"));
    setBannerColor(settings.bannerColor || settings.primaryColor || "#1b4332");
    setBannerGradientStart(settings.bannerGradientStart || settings.primaryColor || "#1b4332");
    setBannerGradientEnd(settings.bannerGradientEnd || settings.accentColor || "#2d6a4f");
    setPrimaryColor(settings.primaryColor);
    setAccentColor(settings.accentColor || "#c04d2b");
    setAccentColor2(settings.accentColor2 || "#0f172a");
    setAccentColor3(settings.accentColor3 || "#ccff00");
    setWebsiteUrl(
      settings.websiteUrl || "https://www.tennis-club.local",
    );
    setHideWebsiteLink(settings.hideWebsiteLink || false);
    setWelcomeMessage(
      settings.welcomeMessage ||
        "Herzlich willkommen im modernisierten Reservierungssystem! Organisiere deine Matches jetzt noch einfacher und behalte alle Events und Ranglisten stets im Blick.",
    );
    setCourtsList(settings.courts || ["Platz 1", "Platz 2"]);
    setEquipmentList(
      settings.equipmentList && settings.equipmentList.length > 0
        ? settings.equipmentList
        : ["Ballmaschine", "Ballkorb"]
    );
    setSollStunden(settings.arbeitseinsaetzeSettings?.sollStunden ?? 10);
    setAeCategories((settings.arbeitseinsaetzeSettings?.categories ?? ["Platzpflege", "Clubheimreinigung", "Bewirtung", "Sonstiges"]).slice().sort((a, b) => a.localeCompare(b, "de")));
    setCommentsRequired(settings.arbeitseinsaetzeSettings?.commentsRequired ?? false);
    setAeRules(settings.arbeitseinsatz_rules ?? settings.arbeitseinsaetzeSettings?.rules ?? []);
    setIsAddingAeRule(false);
    setEditingAeRuleId(null);
    setModules({
      landing_page: settings.modules?.landing_page !== false,
      events: settings.modules?.events !== false,
      ranking: settings.modules?.ranking !== false,
      guests: settings.modules?.guests !== false,
      spielpartner: settings.modules?.spielpartner !== false,
      arbeitseinsaetze: settings.modules?.arbeitseinsaetze === true,
      league: settings.modules?.league === true,
      championship: settings.modules?.championship === true,
    });
    setNavOrder(normalizeNavOrder(settings.navigationOrder));
    setReservationRules({
      maxAdvanceDays: 14,
      maxActiveBookings: 3,
      allowGuest: true,
      availableBallMachines: 1,
      guestFeePerHour: 2.5,
      maxBookingsPerDay: 2,
      maxBookingsPerWeek: 0,
      bypassRestrictionsForLeagueGames: false,
      cancellationDeadlineMinutes: 30,
      maxDurationMinutesSingle: 90,
      maxDurationMinutesDouble: 120,
      maxAdvanceWeeks: 2,
      allowPastBookings: true,
      requireCoplayer: false,
      openingHours: {
        "1": { start: "08:00", end: "21:00", closed: false },
        "2": { start: "08:00", end: "21:00", closed: false },
        "3": { start: "08:00", end: "21:00", closed: false },
        "4": { start: "08:00", end: "21:00", closed: false },
        "5": { start: "08:00", end: "21:00", closed: false },
        "6": { start: "08:00", end: "21:00", closed: false },
        "0": { start: "08:00", end: "21:00", closed: false },
      },
      ...(settings.reservationRules || {}),
    });
    const fee = settings.reservationRules?.guestFeePerHour ?? 2.5;
    setGuestFeeString(fee.toFixed(2).replace(".", ","));
    setFeeSettings(settings.feeSettings || getDefaultFeeSettings(settings.reservationRules));
    setLocalNews(settings.news || "");
    setImpressum(settings.impressum || "");
    setTranslations(settings.i18n?.translations || {});
  }, [settings]);

  // Evaluates if a given tab is dirty
  const isTabDirty = useCallback(
    (tab: string): boolean => {
      if (tab === "allgemein") {
        const expectedNavOrder = normalizeNavOrder(settings.navigationOrder);
        const savedDef = settings.i18n?.defaultLanguage || "de";
        const savedSupported = settings.i18n?.supportedLanguages || [savedDef];
        const savedAllowOther = savedSupported.includes(savedDef === "de" ? "en" : "de");

        return (
          clubName !== settings.clubName ||
          (street || "") !== (settings.street || "") ||
          (zip || "") !== (settings.zip || "") ||
          (city || "") !== (settings.city || "") ||
          (customFacilityPhotoUrl || "") !== (settings.customFacilityPhotoUrl || settings.facilityPhotoUrl || "") ||
          (customAiInstructions || "") !== (settings.customAiInstructions || "") ||
          defaultLanguage !== savedDef ||
          allowOtherLanguage !== savedAllowOther ||
          (modules.landing_page !== false) !== (settings.modules?.landing_page !== false) ||
          (modules.events !== false) !== (settings.modules?.events !== false) ||
          (modules.ranking !== false) !== (settings.modules?.ranking !== false) ||
          (modules.guests !== false) !== (settings.modules?.guests !== false) ||
          (modules.spielpartner !== false) !== (settings.modules?.spielpartner !== false) ||
          (modules.championship === true) !== (settings.modules?.championship === true) ||
          (modules.arbeitseinsaetze === true) !== (settings.modules?.arbeitseinsaetze === true) ||
          (modules.league === true) !== (settings.modules?.league === true) ||
          navOrder.join(",") !== expectedNavOrder.join(",")
        );
      }
      if (tab === "arbeitseinsaetze") {
        return (
          sollStunden !== (settings.arbeitseinsaetzeSettings?.sollStunden ?? 10) ||
          aeVisibility !== (settings.arbeitseinsaetzeSettings?.visibility ?? "full") ||
          aeInterval !== (settings.arbeitseinsaetzeSettings?.interval ?? "0.5") ||
          aeMaxDaysBack !== (settings.arbeitseinsaetzeSettings?.maxDaysBack ?? 14) ||
          commentsRequired !== (settings.arbeitseinsaetzeSettings?.commentsRequired ?? false) ||
          showPlannedShifts !== (settings.arbeitseinsaetzeSettings?.show_planned_shifts ?? settings.show_planned_shifts ?? true) ||
          aeCategories.join(",") !== (settings.arbeitseinsaetzeSettings?.categories ?? ["Platzpflege", "Clubheimreinigung", "Bewirtung", "Sonstiges"]).join(",") ||
          JSON.stringify(aeRules) !== JSON.stringify(settings.arbeitseinsatz_rules ?? settings.arbeitseinsaetzeSettings?.rules ?? [])
        );
      }
      if (tab === "rules") {
        return (
          (reservationRules.maxAdvanceDays ?? 14) !==
            (settings.reservationRules?.maxAdvanceDays ?? 14) ||
          (reservationRules.maxActiveBookings ?? 3) !==
            (settings.reservationRules?.maxActiveBookings ?? 3) ||
          (reservationRules.allowGuest ?? true) !==
            (settings.reservationRules?.allowGuest ?? true) ||
          (reservationRules.guestFeePerHour ?? 2.5) !==
            (settings.reservationRules?.guestFeePerHour ?? 2.5) ||
          (reservationRules.maxBookingsPerDay ?? 2) !==
            (settings.reservationRules?.maxBookingsPerDay ?? 2) ||
          (reservationRules.maxBookingsPerWeek ?? 0) !==
            (settings.reservationRules?.maxBookingsPerWeek ?? 0) ||
          (reservationRules.bypassRestrictionsForLeagueGames ?? false) !==
            (settings.reservationRules?.bypassRestrictionsForLeagueGames ?? false) ||
          (reservationRules.guestBillingMode ?? "per_player") !==
            (settings.reservationRules?.guestBillingMode ?? "per_player") ||
          (reservationRules.cancellationDeadlineMinutes ?? 30) !==
            (settings.reservationRules?.cancellationDeadlineMinutes ?? 30) ||
          (reservationRules.maxDurationMinutesSingle ?? 90) !==
            (settings.reservationRules?.maxDurationMinutesSingle ?? 90) ||
          (reservationRules.maxDurationMinutesDouble ?? 120) !==
            (settings.reservationRules?.maxDurationMinutesDouble ?? 120) ||
          (reservationRules.maxAdvanceWeeks ?? 2) !==
            (settings.reservationRules?.maxAdvanceWeeks ?? 2) ||
          (reservationRules.allowPastBookings ?? false) !==
            (settings.reservationRules?.allowPastBookings ?? false) ||
          (reservationRules.requireCoplayer ?? false) !==
            (settings.reservationRules?.requireCoplayer ?? false) ||
          JSON.stringify(reservationRules.openingHours) !==
            JSON.stringify(settings.reservationRules?.openingHours) ||
          JSON.stringify(courtsList) !==
            JSON.stringify(settings.courts || ["Platz 1", "Platz 2"]) ||
          JSON.stringify(equipmentList) !==
            JSON.stringify(
              settings.equipmentList && settings.equipmentList.length > 0
                ? settings.equipmentList
                : ["Ballmaschine", "Ballkorb"]
            ) ||
          JSON.stringify(feeSettings) !==
            JSON.stringify(settings.feeSettings || getDefaultFeeSettings(settings.reservationRules))
        );
      }
      if (tab === "layout") {
        return (
          (logoUrl || "") !== (settings.logoUrl || "") ||
          (headerLogoUrl || "") !==
            (settings.headerLogoUrl || settings.logoUrl || "") ||
          (faviconUrl || "") !== (settings.faviconUrl || "/favicon.svg") ||
          useDefaultBanner !==
            (settings.useDefaultBanner !== undefined
              ? Boolean(settings.useDefaultBanner)
              : Boolean(!settings.bannerUrl || settings.bannerUrl === defaultBannerImg)) ||
          useDefaultLoginBanner !==
            (settings.useDefaultLoginBanner !== undefined
              ? Boolean(settings.useDefaultLoginBanner)
              : Boolean(
                  !settings.loginBannerUrl ||
                  settings.loginBannerUrl === defaultLoginBannerImg ||
                  settings.loginBannerUrl === defaultBannerImg
                )) ||
          (!useDefaultBanner &&
            (customBannerUrl || "") !==
              (settings.customBannerUrl ||
                (settings.bannerUrl && settings.bannerUrl !== defaultBannerImg
                  ? settings.bannerUrl
                  : "") ||
                "")) ||
          (!useDefaultLoginBanner &&
            (customLoginBannerUrl || "") !==
              (settings.customLoginBannerUrl ||
                (settings.loginBannerUrl &&
                settings.loginBannerUrl !== defaultLoginBannerImg &&
                settings.loginBannerUrl !== defaultBannerImg
                  ? settings.loginBannerUrl
                  : "") ||
                "")) ||
          (customLogoUrl || "") !==
            (settings.customLogoUrl ||
              (settings.logoUrl !== DEFAULT_SETTINGS.logoUrl
                ? settings.logoUrl
                : "") ||
              "") ||
          (customHeaderLogoUrl || "") !==
            (settings.customHeaderLogoUrl ||
              (settings.headerLogoUrl &&
              settings.headerLogoUrl !== DEFAULT_SETTINGS.headerLogoUrl
                ? settings.headerLogoUrl
                : "") ||
              "") ||
          (customFaviconUrl || "") !==
            (settings.customFaviconUrl ||
              (settings.faviconUrl !== DEFAULT_SETTINGS.faviconUrl
                ? settings.faviconUrl
                : "") ||
              "") ||
          (bannerPosition || "50% 50%") !==
            (settings.bannerPosition || "50% 50%") ||
          bannerType !== (settings.bannerType || "image") ||
          (bannerType === "color" && (bannerColor || "") !== (settings.bannerColor || settings.primaryColor || "#1b4332")) ||
          (bannerType === "gradient" && (
            (bannerGradientStart || "") !== (settings.bannerGradientStart || settings.primaryColor || "#1b4332") ||
            (bannerGradientEnd || "") !== (settings.bannerGradientEnd || settings.accentColor || "#2d6a4f")
          )) ||
          (primaryColor || "") !== (settings.primaryColor || "") ||
          (accentColor || "") !== (settings.accentColor || "#c04d2b") ||
          (accentColor2 || "") !== (settings.accentColor2 || "#0f172a") ||
          (accentColor3 || "") !== (settings.accentColor3 || "#ccff00") ||
          websiteUrl !==
            (settings.websiteUrl ||
              (settings.clubName?.toLowerCase().includes("neuhausen")
                ? "https://www.svneuhausen1947.de/tennis"
                : "")) ||
          hideWebsiteLink !==
            (settings.hideWebsiteLink ??
              !settings.clubName?.toLowerCase().includes("neuhausen")) ||
          localNews !== (settings.news || "") ||
          impressum !== (settings.impressum || "") ||
          welcomeMessage !==
            (settings.welcomeMessage ||
              `Herzlich willkommen im modernisierten Reservierungssystem des ${settings.clubName || "Vereins"}! Organisiere deine Matches jetzt noch einfacher und behalte alle Events und Ranglisten stets im Blick.`)
        );
      }
      if (tab === "translations") {
        const savedTrans = settings.i18n?.translations || {};
        return JSON.stringify(translations) !== JSON.stringify(savedTrans);
      }
      return false;
    },
    [
      clubName,
      street,
      zip,
      city,
      customFacilityPhotoUrl,
      facilityPhotoUrl,
      customAiInstructions,
      defaultLanguage,
      allowOtherLanguage,
      settings,
      welcomeMessage,
      modules,
      reservationRules,
      courtsList,
      equipmentList,
      feeSettings,
      logoUrl,
      headerLogoUrl,
      faviconUrl,
      bannerUrl,
      useDefaultBanner,
      loginBannerUrl,
      useDefaultLoginBanner,
      customLogoUrl,
      customHeaderLogoUrl,
      customFaviconUrl,
      customBannerUrl,
      customLoginBannerUrl,
      bannerPosition,
      bannerType,
      bannerColor,
      bannerGradientStart,
      bannerGradientEnd,
      primaryColor,
      accentColor,
      accentColor2,
      accentColor3,
      websiteUrl,
      hideWebsiteLink,
      localNews,
      impressum,
      sollStunden,
      commentsRequired,
      aeVisibility,
      aeInterval,
      aeMaxDaysBack,
      showPlannedShifts,
      aeCategories,
      navOrder,
      isSuperAdmin,
      translations,
    ],
  );

  // Raise isDirty to parent App.tsx
  useEffect(() => {
    if (onDirtyChange) {
      const isDirty =
        isTabDirty("allgemein") || isTabDirty("rules") || isTabDirty("layout") || isTabDirty("arbeitseinsaetze") || isTabDirty("translations");
      onDirtyChange(isDirty);
    }
  }, [isTabDirty, onDirtyChange]);

  const handleSaveTab = (tab: string) => {
    if (tab === "allgemein") {
      onUpdateSettings({
        ...settings,
        clubName,
        street,
        zip,
        city,
        facilityPhotoUrl: customFacilityPhotoUrl,
        customFacilityPhotoUrl: customFacilityPhotoUrl,
        customAiInstructions,
        i18n: {
          defaultLanguage,
          supportedLanguages: allowOtherLanguage
            ? (defaultLanguage === "de" ? ["de", "en"] : ["en", "de"])
            : [defaultLanguage],
        },
        modules: {
          ...modules,
          landing_page: modules.landing_page !== false,
          spielpartner: modules.spielpartner !== false,
          league: modules.league === true,
        },
        enableLeague: modules.league === true,
        navigationOrder: navOrder,
      });
      saveLandingPageConfig(currentClubId, {
        is_enabled: modules.landing_page !== false,
        nav_order: navOrder,
      }, currentUser.name || currentUser.id).catch(console.warn);
      setMessage({
        text: "Allgemeine Einstellungen & Modulreihenfolge erfolgreich gespeichert.",
        type: "success",
      });
    } else if (tab === "arbeitseinsaetze") {
      onUpdateSettings({
        ...settings,
        arbeitseinsatz_rules: aeRules,
        show_planned_shifts: showPlannedShifts,
        arbeitseinsaetzeSettings: {
          sollStunden: Number(sollStunden) || 10,
          rules: aeRules,
          categories: aeCategories,
          visibility: aeVisibility,
          interval: aeInterval,
          maxDaysBack: aeMaxDaysBack,
          commentsRequired,
          show_planned_shifts: showPlannedShifts,
        }
      });
      setMessage({
        text: "Arbeitseinsätze Einstellungen erfolgreich gespeichert.",
        type: "success",
      });
    } else if (tab === "rules") {
      const currentCourts = settings.courts || ["Platz 1", "Platz 2"];
      const newCourts = courtsList.length > 0 ? courtsList : ["Platz 1"];
      const removedCourts = currentCourts.filter((c) => !newCourts.includes(c));

      if (removedCourts.length > 0) {
        const now = new Date();
        const hasFutureBookings = bookings.some((b) => {
          if (!removedCourts.includes(b.court)) return false;
          // Prüfen ob die Buchung in der Zukunft liegt oder gerade läuft
          const bookingEnd = new Date(b.date + "T" + b.endTime);
          return bookingEnd >= now;
        });

        if (hasFutureBookings) {
          setMessage({
            text: "Speichern fehlgeschlagen: Die entfernten Plätze haben noch offene/zukünftige Buchungen.",
            type: "error",
          });
          return;
        }
      }

      const feeValidation = validateFeeSettings(feeSettings);
      if (!feeValidation.isValid) {
        setMessage({
          text: "Speichern fehlgeschlagen: Bitte überprüfe die unvollständigen Gastgebührregeln.",
          type: "error",
        });
        return;
      }

      const syncedReservationRules = {
        ...reservationRules,
        guestFeePerHour:
          feeSettings.fee_calculation_mode === "SIMPLE" && feeSettings.simple_config
            ? feeSettings.simple_config.amount_cents / 100
            : reservationRules.guestFeePerHour,
        guestBillingMode:
          feeSettings.fee_calculation_mode === "SIMPLE" && feeSettings.simple_config
            ? feeSettings.simple_config.rate_type === "PER_COURT_HOUR"
              ? ("per_court" as const)
              : ("per_player" as const)
            : reservationRules.guestBillingMode,
      };

      onUpdateSettings({
        ...settings,
        reservationRules: syncedReservationRules,
        feeSettings,
        courts: newCourts,
        equipmentList: equipmentList.length > 0 ? equipmentList : [],
      });
      setMessage({
        text: "Buchungsregeln erfolgreich gespeichert.",
        type: "success",
      });
    } else if (tab === "layout") {
      const resolvedBannerUrl = useDefaultBanner
        ? defaultBannerImg
        : (customBannerUrl || (bannerUrl !== defaultBannerImg ? bannerUrl : "") || defaultBannerImg);
      const resolvedLoginBannerUrl = useDefaultLoginBanner
        ? defaultLoginBannerImg
        : (customLoginBannerUrl || (loginBannerUrl !== defaultLoginBannerImg ? loginBannerUrl : "") || defaultLoginBannerImg);

      onUpdateSettings({
        ...settings,
        useDefaultBanner: Boolean(useDefaultBanner),
        useDefaultLoginBanner: Boolean(useDefaultLoginBanner),
        bannerUrl: resolvedBannerUrl,
        loginBannerUrl: resolvedLoginBannerUrl,
        customBannerUrl: useDefaultBanner ? (customBannerUrl || "") : (customBannerUrl || bannerUrl || ""),
        customLoginBannerUrl: useDefaultLoginBanner ? (customLoginBannerUrl || "") : (customLoginBannerUrl || loginBannerUrl || ""),
        bannerType,
        bannerColor,
        bannerGradientStart,
        bannerGradientEnd,
        logoUrl,
        headerLogoUrl,
        faviconUrl,
        bannerPosition,
        primaryColor,
        accentColor,
        accentColor2,
        accentColor3,
        websiteUrl,
        hideWebsiteLink,
        news: localNews,
        impressum,
        welcomeMessage,
      });
      setMessage({
        text: "Design-, Impressums- & News-Einstellungen erfolgreich gespeichert.",
        type: "success",
      });
    } else if (tab === "translations") {
      onUpdateSettings({
        ...settings,
        i18n: {
          ...(settings.i18n || { defaultLanguage: "de", supportedLanguages: ["de"] }),
          translations,
        },
      });
      setMessage({
        text: "Übersetzungen erfolgreich gespeichert.",
        type: "success",
      });
    }
  };

  const handleDiscardTab = (tab: string) => {
    if (tab === "allgemein") {
      setClubName(settings.clubName);
      setStreet(settings.street || "");
      setZip(settings.zip || "");
      setCity(settings.city || "");
      const discDef = settings.i18n?.defaultLanguage || "de";
      const discSupported = settings.i18n?.supportedLanguages || [discDef];
      setDefaultLanguage(discDef);
      setAllowOtherLanguage(discSupported.includes(discDef === "de" ? "en" : "de"));
      setCustomAiInstructions(settings.customAiInstructions || "");
      setModules({
        landing_page: settings.modules?.landing_page !== false,
        events: settings.modules?.events !== false,
        ranking: settings.modules?.ranking !== false,
        guests: settings.modules?.guests !== false,
        spielpartner: settings.modules?.spielpartner !== false,
        arbeitseinsaetze: settings.modules?.arbeitseinsaetze === true,
        league: settings.modules?.league === true,
        championship: settings.modules?.championship === true,
      });
      setNavOrder(normalizeNavOrder(settings.navigationOrder));
    } else if (tab === "arbeitseinsaetze") {
      setSollStunden(settings.arbeitseinsaetzeSettings?.sollStunden ?? 10);
      setAeCategories((settings.arbeitseinsaetzeSettings?.categories ?? ["Platzpflege", "Clubheimreinigung", "Bewirtung", "Sonstiges"]).slice().sort((a, b) => a.localeCompare(b, "de")));
      setAeVisibility(settings.arbeitseinsaetzeSettings?.visibility ?? "full");
      setAeInterval(settings.arbeitseinsaetzeSettings?.interval ?? "0.5");
      setAeMaxDaysBack(settings.arbeitseinsaetzeSettings?.maxDaysBack ?? 14);
      setCommentsRequired(settings.arbeitseinsaetzeSettings?.commentsRequired ?? false);
      setShowPlannedShifts(settings.arbeitseinsaetzeSettings?.show_planned_shifts ?? settings.show_planned_shifts ?? true);
      setAeRules(settings.arbeitseinsatz_rules ?? settings.arbeitseinsaetzeSettings?.rules ?? []);
      setIsAddingAeRule(false);
      setEditingAeRuleId(null);
    } else if (tab === "rules") {
      const activeRules = settings.reservationRules || {
        maxAdvanceDays: 14,
        maxActiveBookings: 3,
        allowGuest: true,
        availableBallMachines: 1,
        guestFeePerHour: 2.5,
        maxBookingsPerDay: 2,
        maxBookingsPerWeek: 0,
        bypassRestrictionsForLeagueGames: false,
        cancellationDeadlineMinutes: 30,
        maxDurationMinutesSingle: 90,
        maxDurationMinutesDouble: 120,
        allowParticipantsToEdit: false,
      };
      setReservationRules(activeRules);
      setGuestFeeString(
        (activeRules.guestFeePerHour ?? 2.5).toFixed(2).replace(".", ","),
      );
      setFeeSettings(settings.feeSettings || getDefaultFeeSettings(settings.reservationRules));
      setCourtsList(settings.courts || ["Platz 1", "Platz 2"]);
      setEquipmentList(settings.equipmentList && settings.equipmentList.length > 0 ? settings.equipmentList : ["Ballmaschine", "Ballkorb"]);
      setNewEquipmentName("");
    } else if (tab === "layout") {
      setLogoUrl(settings.logoUrl);
      setHeaderLogoUrl(settings.headerLogoUrl || settings.logoUrl);
      setFaviconUrl(settings.faviconUrl || "/favicon.svg");
      const isDefBanner = settings.useDefaultBanner !== undefined
        ? Boolean(settings.useDefaultBanner)
        : Boolean(!settings.bannerUrl || settings.bannerUrl === defaultBannerImg);
      setUseDefaultBanner(isDefBanner);
      setBannerUrl(isDefBanner ? defaultBannerImg : (settings.bannerUrl || defaultBannerImg));
      setCustomBannerUrl(
        settings.customBannerUrl ||
          (settings.bannerUrl && settings.bannerUrl !== defaultBannerImg
            ? settings.bannerUrl
            : ""),
      );

      const isDefLoginBanner = settings.useDefaultLoginBanner !== undefined
        ? Boolean(settings.useDefaultLoginBanner)
        : Boolean(
            !settings.loginBannerUrl ||
            settings.loginBannerUrl === defaultLoginBannerImg ||
            settings.loginBannerUrl === defaultBannerImg
          );
      setUseDefaultLoginBanner(isDefLoginBanner);
      setLoginBannerUrl(isDefLoginBanner ? defaultLoginBannerImg : (settings.loginBannerUrl || defaultLoginBannerImg));
      setCustomLoginBannerUrl(
        settings.customLoginBannerUrl ||
          (settings.loginBannerUrl &&
          settings.loginBannerUrl !== defaultLoginBannerImg &&
          settings.loginBannerUrl !== defaultBannerImg
            ? settings.loginBannerUrl
            : ""),
      );
      setBannerPosition(settings.bannerPosition || "50% 50%");
      setBannerType(settings.bannerType || (isNeuhausenClub ? "image" : "gradient"));
      setBannerColor(settings.bannerColor || settings.primaryColor || "#1b4332");
      setBannerGradientStart(settings.bannerGradientStart || settings.primaryColor || "#1b4332");
      setBannerGradientEnd(settings.bannerGradientEnd || settings.accentColor || "#2d6a4f");
      setPrimaryColor(settings.primaryColor);
      setAccentColor(settings.accentColor || "#c04d2b");
      setAccentColor2(settings.accentColor2 || "#0f172a");
      setAccentColor3(settings.accentColor3 || "#ccff00");
      setWebsiteUrl(
        settings.websiteUrl ||
          (settings.clubName?.toLowerCase().includes("neuhausen")
            ? "https://www.svneuhausen1947.de/tennis"
            : ""),
      );
      setHideWebsiteLink(
        settings.hideWebsiteLink ??
          !settings.clubName?.toLowerCase().includes("neuhausen"),
      );
      setLocalNews(settings.news || "");
      setImpressum(settings.impressum || "");
      setWelcomeMessage(
        settings.welcomeMessage ||
          `Herzlich willkommen im modernisierten Reservierungssystem des ${settings.clubName || "Vereins"}! Organisiere deine Matches jetzt noch einfacher und behalte alle Events und Ranglisten stets im Blick.`,
      );
    } else if (tab === "translations") {
      setTranslations(settings.i18n?.translations || {});
    }
  };

  // --- Sperren / Lock Operations ---
  const handleAddLock = () => {
    if (!newLockTitle.trim()) {
      setMessage({
        type: "error",
        text: "Bitte geben Sie einen Namen/Titel für die Sperrung ein.",
      });
      return;
    }
    if (newLockCourts.length === 0) {
      setMessage({
        type: "error",
        text: "Bitte wählen Sie mindestens einen Platz aus.",
      });
      return;
    }

    if (newLockType === "regular") {
      const newReg: RegularLock = {
        id: Math.random().toString(36).substring(2, 11),
        title: newLockTitle,
        courts: [...newLockCourts],
        dayOfWeek: newLockDay,
        startTime: newLockStartTime,
        endTime: newLockEndTime,
        isOngoing: newLockIsOngoing,
        startDate: newLockIsOngoing ? undefined : newLockStartDate,
        endDate: newLockIsOngoing ? undefined : newLockEndDate,
        isEvent: lockContext === "event",
        isOpenOffer: lockContext === "event",
        color: newLockColor.trim() || undefined,
      };

      const updatedRegs = [...(settings.recurringLocks || []), newReg];
      onUpdateSettings({
        ...settings,
        recurringLocks: updatedRegs,
      });
      setMessage({
        type: "success",
        text:
          lockContext === "event"
            ? `Serientermin "${newLockTitle}" erfolgreich hinzugefügt.`
            : `Wöchentliche Sperre "${newLockTitle}" erfolgreich hinzugefügt.`,
      });
    } else {
      if (!newRangeStartDate || !newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Bitte geben Sie ein Start- und Enddatum ein.",
        });
        return;
      }
      if (newRangeStartDate > newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Das Startdatum darf nicht nach dem Enddatum liegen.",
        });
        return;
      }

      const newRange: RangeLock = {
        id: Math.random().toString(36).substring(2, 11),
        title: newLockTitle,
        startDate: newRangeStartDate,
        endDate: newRangeEndDate,
        startTime: newRangeStartTime,
        endTime: newRangeEndTime,
        courts: [...newLockCourts],
        isEvent: lockContext === "event",
        isOpenOffer: lockContext === "event",
      };

      const updatedRanges = [...(settings.rangeLocks || []), newRange];
      onUpdateSettings({
        ...settings,
        rangeLocks: updatedRanges,
      });
      setMessage({
        type: "success",
        text:
          lockContext === "event"
            ? `Termin-Bereich "${newLockTitle}" erfolgreich hinzugefügt.`
            : `Zeitbereichssperre "${newLockTitle}" erfolgreich hinzugefügt.`,
      });
    }

    // Reset fields & smoothly close drawer
    closeLockDrawer(() => {
      setNewLockTitle("");
      setNewLockColor("");
      setNewLockCourts([]);
      setNewLockIsOngoing(true);
      setNewLockStartDate("");
      setNewLockEndDate("");
      setNewLockIsOpenOffer(false);
      setNewRangeStartDate("");
      setNewRangeEndDate("");
      setNewRangeStartTime("08:00");
      setNewRangeEndTime("22:00");
    });
  };

  const handleSaveLockEdit = async () => {
    if (!editingLockId) return;
    if (!newLockTitle.trim()) {
      setMessage({
        type: "error",
        text: lockContext === "event"
          ? "Bitte geben Sie einen Namen/Titel für den Serientermin ein."
          : "Bitte geben Sie einen Namen/Titel für die Sperrung ein.",
      });
      return;
    }
    if (newLockCourts.length === 0) {
      setMessage({
        type: "error",
        text: "Bitte wählen Sie mindestens einen Platz aus.",
      });
      return;
    }

    if (editingCalendarLock) {
      if (!newRangeStartDate || !newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Bitte geben Sie ein Start- und Enddatum ein.",
        });
        return;
      }
      if (newRangeStartDate > newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Das Startdatum darf nicht nach dem Enddatum liegen.",
        });
        return;
      }

      // Delete old bookings from backend
      if (onDeleteBooking) {
        await onDeleteBooking(editingCalendarLock.bookingIds);
      }

      const startIndex = TIME_SLOTS.indexOf(newRangeStartTime);
      const endIndex = TIME_SLOTS.indexOf(newRangeEndTime);
      const slots =
        startIndex !== -1 && endIndex !== -1 && endIndex > startIndex
          ? TIME_SLOTS.slice(startIndex, endIndex)
          : [newRangeStartTime];

      const dates: string[] = [];
      const cur = new Date(newRangeStartDate);
      const endD = new Date(newRangeEndDate);
      while (cur <= endD) {
        dates.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }

      const lockGroupId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newBookings: Booking[] = [];
      for (const c of newLockCourts) {
        for (const dStr of dates) {
          for (const t of slots) {
            newBookings.push({
              id: Math.random().toString(36).substr(2, 9),
              lockGroupId,
              date: dStr,
              time: t,
              court: c,
              players: [],
              isLocked: true,
              isEvent: lockContext === "event",
              isOpenOffer: lockContext === "event",
              reason: newLockTitle,
              hasBallMachine: false,
              bookedBy: currentUser?.id,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      if (onSaveBooking) {
        for (const nb of newBookings) {
          await onSaveBooking(nb);
        }
      }
      const remaining = bookings.filter(
        (b) => !editingCalendarLock.bookingIds.includes(b.id)
      );
      onUpdateBookings([...remaining, ...newBookings]);

      setMessage({
        type: "success",
        text: lockContext === "event"
          ? `Serientermin "${newLockTitle}" erfolgreich aktualisiert.`
          : `Sperre "${newLockTitle}" erfolgreich aktualisiert.`,
      });
      setEditingCalendarLock(null);
    } else if (newLockType === "regular") {
      const updatedRegs = (settings.recurringLocks || []).map((l) => {
        if (l.id === editingLockId) {
          return {
            ...l,
            title: newLockTitle,
            courts: [...newLockCourts],
            dayOfWeek: newLockDay,
            startTime: newLockStartTime,
            endTime: newLockEndTime,
            isOngoing: newLockIsOngoing,
            startDate: newLockIsOngoing ? undefined : newLockStartDate,
            endDate: newLockIsOngoing ? undefined : newLockEndDate,
            isEvent: lockContext === "event",
            isOpenOffer: lockContext === "event",
            color: newLockColor.trim() || undefined,
          };
        }
        return l;
      });
      onUpdateSettings({
        ...settings,
        recurringLocks: updatedRegs,
      });
      setMessage({
        type: "success",
        text: lockContext === "event"
          ? `Änderungen am Serientermin "${newLockTitle}" gespeichert.`
          : `Änderungen an der Sperre "${newLockTitle}" gespeichert.`,
      });
    } else {
      if (!newRangeStartDate || !newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Bitte geben Sie ein Start- und Enddatum ein.",
        });
        return;
      }
      if (newRangeStartDate > newRangeEndDate) {
        setMessage({
          type: "error",
          text: "Das Startdatum darf nicht nach dem Enddatum liegen.",
        });
        return;
      }

      const updatedRanges = (settings.rangeLocks || []).map((l) => {
        if (l.id === editingLockId) {
          return {
            ...l,
            title: newLockTitle,
            startDate: newRangeStartDate,
            endDate: newRangeEndDate,
            startTime: newRangeStartTime,
            endTime: newRangeEndTime,
            isEvent: lockContext === "event",
            isOpenOffer: lockContext === "event",
            courts: [...newLockCourts],
          };
        }
        return l;
      });
      onUpdateSettings({
        ...settings,
        rangeLocks: updatedRanges,
      });
      setMessage({
        type: "success",
        text: lockContext === "event"
          ? `Änderungen am Serientermin "${newLockTitle}" gespeichert.`
          : `Änderungen an der Sperre "${newLockTitle}" gespeichert.`,
      });
    }

    // Reset editing states & smoothly close drawer
    closeLockDrawer(() => {
      setEditingLockId(null);
      setEditingCalendarLock(null);
      setNewLockTitle("");
      setNewLockColor("");
      setNewLockCourts([]);
      setNewLockIsOngoing(true);
      setNewLockStartDate("");
      setNewLockEndDate("");
      setNewLockIsOpenOffer(false);
      setNewRangeStartDate("");
      setNewRangeEndDate("");
      setNewRangeStartTime("08:00");
      setNewRangeEndTime("22:00");
    });
  };

  const handleDeleteRecurringLock = (id: string, isEvent?: boolean) => {
    const target = (settings.recurringLocks || []).find((l) => l.id === id);
    const isEv = isEvent !== undefined ? isEvent : (target?.isEvent ?? false);
    const updated = (settings.recurringLocks || []).filter((l) => l.id !== id);
    onUpdateSettings({
      ...settings,
      recurringLocks: updated,
    });
    setMessage({
      type: "success",
      text: isEv
        ? "Serientermin erfolgreich gelöscht."
        : "Regelmäßige Sperre erfolgreich gelöscht.",
    });
  };

  const handleDeleteRangeLock = (id: string, isEvent?: boolean) => {
    const target = (settings.rangeLocks || []).find((l) => l.id === id);
    const isEv = isEvent !== undefined ? isEvent : (target?.isEvent ?? false);
    const updated = (settings.rangeLocks || []).filter((l) => l.id !== id);
    onUpdateSettings({
      ...settings,
      rangeLocks: updated,
    });
    setMessage({
      type: "success",
      text: isEv
        ? "Termin-Bereich erfolgreich gelöscht."
        : "Zeitbereichssperre erfolgreich gelöscht.",
    });
  };

  const handleDeleteCalendarLock = async (bookingIdOrIds: string | string[], isEvent?: boolean) => {
    const ids = Array.isArray(bookingIdOrIds) ? bookingIdOrIds : [bookingIdOrIds];
    if (onDeleteBooking) {
      await onDeleteBooking(ids);
    } else {
      const updated = bookings.filter((b) => !ids.includes(b.id));
      onUpdateBookings(updated);
    }
    setMessage({
      type: "success",
      text: isEvent
        ? "Termin erfolgreich gelöscht."
        : "Sperre erfolgreich gelöscht.",
    });
  };

  const groupedCalendarLocks = useMemo(() => {
    return groupCalendarLocks(bookings.filter((b) => b.isLocked && !b.isEvent));
  }, [bookings]);

  const groupedCalendarEvents = useMemo(() => {
    return groupCalendarLocks(bookings.filter((b) => b.isLocked && b.isEvent));
  }, [bookings]);

  // --- Individual Booking Management Operations ---
  const handleStartEditAdminBooking = (b: Booking) => {
    setEditingAdminBooking(b);
    setEditBkDate(b.date);
    setEditBkTime(b.time);
    setEditBkCourt(b.court);
    setEditBkPlayers([...(b.players || [])]);
    setEditBkHasBallMachine(!!b.hasBallMachine);
    setEditBkComment(b.comment || "");
    setEditBkIsLocked(!!b.isLocked);
    setEditBkReason(b.reason || "");
    setEditBkNewPlayerQuery("");
    setEditBkShowSuggestions(false);
  };

  const handleSaveAdminBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdminBooking) return;

    if (!editBkDate || !editBkTime || !editBkCourt) {
      setMessage({
        type: "error",
        text: "Datum, Uhrzeit und Platz sind Pflichtangaben.",
      });
      return;
    }

    const updated: Booking = {
      ...editingAdminBooking,
      date: editBkDate,
      time: editBkTime,
      court: editBkCourt,
      players: editBkIsLocked ? [] : editBkPlayers,
      hasBallMachine: editBkIsLocked ? false : editBkHasBallMachine,
      isLocked: editBkIsLocked,
      comment: editBkIsLocked ? "" : editBkComment,
      reason: editBkIsLocked ? editBkReason : "",
    };

    try {
      if (onSaveBooking) {
        await onSaveBooking(updated);
        setMessage({
          type: "success",
          text: "Termin/Sperrung wurde erfolgreich aktualisiert.",
        });
        setEditingAdminBooking(null);
      } else {
        setMessage({
          type: "error",
          text: "Fehlende Speicherfunktion in den Props.",
        });
      }
    } catch (err: any) {
      console.error("Error saving booking:", err);
      setMessage({ type: "error", text: "Fehler beim Speichern des Termins." });
    }
  };

  const handleDeleteAdminBooking = async (id: string) => {
    if (
      window.confirm(
        "Bist du sicher, dass du diesen Termin oder diese Sperrung unwiderruflich löschen möchtest?",
      )
    ) {
      try {
        if (onDeleteBooking) {
          await onDeleteBooking(id);
          setMessage({
            type: "success",
            text: "Termin wurde erfolgreich gelöscht.",
          });
        } else {
          setMessage({
            type: "error",
            text: "Fehlende Löschfunktion in den Props.",
          });
        }
      } catch (err: any) {
        console.error("Error deleting booking:", err);
        setMessage({ type: "error", text: "Fehler beim Löschen des Termins." });
      }
    }
  };

  const handleAddPlayerToEditList = (playerName: string) => {
    if (!playerName.trim()) return;
    if (editBkPlayers.includes(playerName.trim())) return;
    setEditBkPlayers([...editBkPlayers, playerName.trim()]);
    setEditBkNewPlayerQuery("");
    setEditBkShowSuggestions(false);
  };

  const handleRemovePlayerFromEditList = (index: number) => {
    setEditBkPlayers(editBkPlayers.filter((_, idx) => idx !== index));
  };

  const handleStartEditRecurring = (lock: RegularLock, forcedContext?: "lock" | "event") => {
    openLockDrawer();
    setEditingLockId(lock.id);
    setNewLockType("regular");
    setLockContext(forcedContext || (lock.isEvent ? "event" : "lock"));
    setNewLockTitle(lock.title);
    setNewLockCourts([...lock.courts]);
    setNewLockDay(lock.dayOfWeek);
    setNewLockStartTime(lock.startTime);
    setNewLockEndTime(lock.endTime);
    setNewLockIsOngoing(lock.isOngoing);
    setNewLockStartDate(lock.startDate || "");
    setNewLockEndDate(lock.endDate || "");
    setNewLockColor(lock.color || "");
    setNewLockIsOpenOffer(lock.isOpenOffer || false);
  };

  const handleStartEditRange = (lock: RangeLock, forcedContext?: "lock" | "event") => {
    openLockDrawer();
    setEditingLockId(lock.id);
    setNewLockType("range");
    setLockContext(forcedContext || (lock.isEvent ? "event" : "lock"));
    setNewLockTitle(lock.title);
    setNewLockCourts([...lock.courts]);
    setNewRangeStartDate(lock.startDate);
    setNewRangeEndDate(lock.endDate);
    setNewRangeStartTime(lock.startTime || "08:00");
    setNewRangeEndTime(lock.endTime || "22:00");
    setNewLockIsOpenOffer(lock.isOpenOffer || false);
  };

  const handleStartEditCalendarLock = (lock: GroupedCalendarLock, forcedContext?: "lock" | "event") => {
    openLockDrawer();
    setEditingLockId("calendar_" + lock.id);
    setEditingCalendarLock(lock);
    setNewLockType("range");
    setLockContext(forcedContext || (lock.isEvent ? "event" : "lock"));
    setNewLockTitle(lock.reason || "");
    setNewLockCourts([...lock.courts]);
    setNewRangeStartDate(lock.date);
    setNewRangeEndDate(lock.date);
    setNewRangeStartTime(lock.startTime || "08:00");
    setNewRangeEndTime(lock.endTime || "22:00");
  };

  const handleCancelLockEdit = () => {
    closeLockDrawer(() => {
      setEditingLockId(null);
      setEditingCalendarLock(null);
      setNewLockTitle("");
      setNewLockColor("");
      setNewLockCourts([]);
      setNewLockIsOngoing(true);
      setNewLockStartDate("");
      setNewLockEndDate("");
      setNewRangeStartDate("");
      setNewRangeEndDate("");
      setNewLockIsOpenOffer(false);
      setNewRangeStartTime("08:00");
      setNewRangeEndTime("22:00");
    });
  };

  const handleTabClick = (tabId: typeof currentTab) => {
    if (currentTab === tabId) return;
    if (isTabDirty(currentTab)) {
      setPendingTab(tabId);
    } else {
      setCurrentTab(tabId);
    }
  };

  useEffect(() => {
    if (triggerSave && triggerSave > 0) {
      handleSaveTab(currentTab);
    }
  }, [triggerSave, currentTab]);

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "logo" | "headerLogo" | "favicon" | "banner" | "loginBanner" | "facilityPhoto",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage((prev) => ({ ...prev, [type]: true }));
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH =
            type === "banner" || type === "loginBanner" || type === "facilityPhoto" ? 1200 : 300;
          const MAX_HEIGHT =
            type === "banner" || type === "loginBanner" || type === "facilityPhoto" ? 1200 : 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/webp", 0.7);

          if (type === "logo") {
            setLogoUrl(dataUrl);
            setCustomLogoUrl(dataUrl);
          }
          if (type === "headerLogo") {
            setHeaderLogoUrl(dataUrl);
            setCustomHeaderLogoUrl(dataUrl);
          }
          if (type === "favicon") {
            setFaviconUrl(dataUrl);
            setCustomFaviconUrl(dataUrl);
          }
          if (type === "banner") {
            setBannerUrl(dataUrl);
            setCustomBannerUrl(dataUrl);
            setUseDefaultBanner(false);
          }
          if (type === "loginBanner") {
            setLoginBannerUrl(dataUrl);
            setCustomLoginBannerUrl(dataUrl);
            setUseDefaultLoginBanner(false);
          }
          if (type === "facilityPhoto") {
            setFacilityPhotoUrl(dataUrl);
            setCustomFacilityPhotoUrl(dataUrl);
          }

          setMessage({
            text: "Bild erfolgreich geladen und im Cache bereitgestellt. Bitte speichere den Bereich, um die Änderungen dauerhaft zu übernehmen.",
            type: "success",
          });
          setUploadingImage((prev) => ({ ...prev, [type]: false }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: "Fehler beim Upload.", type: "error" });
      setUploadingImage((prev) => ({ ...prev, [type]: false }));
    }
  };

  const handleAddCourt = () => {
    if (newCourtName.trim() && !courtsList.includes(newCourtName.trim())) {
      setCourtsList([...courtsList, newCourtName.trim()]);
      setNewCourtName("");
    }
  };

  const handleRemoveCourt = (index: number) => {
    const courtName = courtsList[index];
    const hasBookings = bookings.some((b) => b.court === courtName);

    if (hasBookings) {
      setMessage({
        text: `Der Platz "${courtName}" kann nicht gelöscht werden, da noch Buchungen darauf existieren. Bitte lösche diese zuerst.`,
        type: "error",
      });
      return;
    }

    const updated = [...courtsList];
    updated.splice(index, 1);
    setCourtsList(updated);
  };

  const handleMoveCourt = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === courtsList.length - 1) return;

    const updated = [...courtsList];
    const temp = updated[index];
    if (direction === "up") {
      updated[index] = updated[index - 1];
      updated[index - 1] = temp;
    } else {
      updated[index] = updated[index + 1];
      updated[index + 1] = temp;
    }
    setCourtsList(updated);
  };

  const handleAddEquipment = () => {
    if (newEquipmentName.trim() && !equipmentList.includes(newEquipmentName.trim())) {
      setEquipmentList([...equipmentList, newEquipmentName.trim()]);
      setNewEquipmentName("");
    }
  };

  const handleRemoveEquipment = (index: number) => {
    const updated = [...equipmentList];
    updated.splice(index, 1);
    setEquipmentList(updated);
  };

  const handleMoveEquipment = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === equipmentList.length - 1) return;

    const updated = [...equipmentList];
    const temp = updated[index];
    if (direction === "up") {
      updated[index] = updated[index - 1];
      updated[index - 1] = temp;
    } else {
      updated[index] = updated[index + 1];
      updated[index + 1] = temp;
    }
    setEquipmentList(updated);
  };

  const [duplicateCandidatesModal, setDuplicateCandidatesModal] = useState<{
    candidates: PrivacySafeCandidate[];
  } | null>(null);

  const [liveDuplicateCandidates, setLiveDuplicateCandidates] = useState<PrivacySafeCandidate[]>([]);
  const [isCheckingLiveDuplicates, setIsCheckingLiveDuplicates] = useState(false);

  useEffect(() => {
    if (!showUserForm || inlineEditingUserId) {
      setLiveDuplicateCandidates([]);
      return;
    }

    const fname = (editingUser.firstName || "").trim();
    const lname = (editingUser.lastName || "").trim();
    const em = (editingUser.email || "").trim();

    if (!fname && !lname && !em) {
      setLiveDuplicateCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingLiveDuplicates(true);
      try {
        const candidates = await findCandidateDuplicatesForAdmin(
          {
            firstName: fname,
            lastName: lname,
            email: em,
            phone: editingUser.phone,
          },
          currentClubId
        );
        setLiveDuplicateCandidates(candidates);
      } catch (err) {
        console.error("Error checking live duplicates:", err);
      } finally {
        setIsCheckingLiveDuplicates(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [editingUser.firstName, editingUser.lastName, editingUser.email, showUserForm, inlineEditingUserId, currentClubId]);

  const handleSaveUser = async (bypassDuplicateCheck = false) => {
    if (!editingUser.firstName?.trim() || !editingUser.lastName?.trim()) {
      setMessage({
        text: "Vorname und Nachname sind Pflichtfelder.",
        type: "error",
      });
      return;
    }

    if (!editingUser.name?.trim() || !editingUser.password) {
      setMessage({
        text: "Benutzername und Passwort sind erforderlich.",
        type: "error",
      });
      return;
    }


    // Check for potential duplicate person if creating a new member and not bypassing
    if (!inlineEditingUserId && !bypassDuplicateCheck) {
      const candidates = await findCandidateDuplicatesForAdmin(
        {
          firstName: editingUser.firstName || "",
          lastName: editingUser.lastName || "",
          email: editingUser.email,
          phone: editingUser.phone,
        },
        currentClubId
      );
      if (candidates.length > 0) {
        setDuplicateCandidatesModal({ candidates });
        return;
      }
    }

    let key = editingUser.name.toLowerCase().replace(/\s/g, "");
    let finalUsername = editingUser.name.trim();

    const targetKey = inlineEditingUserId
      ? inlineEditingUserId.toLowerCase().replace(/\s/g, "")
      : null;
    const existingUser = targetKey ? users[targetKey] : null;

    if (existingUser) {
      if (existingUser.hauptAdmin) {
        if (editingUser.role !== Role.ADMIN) {
          setMessage({
            text: "Der Haupt-Admin dieses Vereins darf nicht herabgestuft werden!",
            type: "error",
          });
          return;
        }
      }
      key = targetKey!;
      finalUsername = existingUser.name;
    } else {
      let suffix = 2;
      const baseKey = key;
      const baseName = finalUsername;
      while (users[key] || (await isUsernameTakenGlobally(finalUsername))) {
        key = `${baseKey}${suffix}`;
        finalUsername = `${baseName}${suffix}`;
        suffix++;
      }
    }

    const updatedUsers = { ...users };
    updatedUsers[key] = {
      id: existingUser?.id || "",
      name: finalUsername,
      klarname:
        editingUser.klarname ||
        `${editingUser.firstName?.trim() || ""} ${editingUser.lastName?.trim() || ""}`.trim() ||
        finalUsername,
      password: editingUser.password,
      mustChangePassword: !!editingUser.mustChangePassword,
      role: editingUser.role || Role.MITGLIED,
      firstName: editingUser.firstName?.trim(),
      lastName: editingUser.lastName?.trim(),
      email: editingUser.email?.trim() || "",
      is_placeholder_email: !editingUser.email?.trim(),
      phone: editingUser.phone?.trim() || "",
      showContactInfo: editingUser.showContactInfo !== undefined ? !!editingUser.showContactInfo : (existingUser ? existingUser.showContactInfo !== false : false),
      onboarding_pending: editingUser.onboarding_pending !== undefined ? !!editingUser.onboarding_pending : (existingUser ? !!(existingUser.onboarding_pending ?? existingUser.onboardingPending) : true),
      onboardingPending: editingUser.onboarding_pending !== undefined ? !!editingUser.onboarding_pending : (existingUser ? !!(existingUser.onboarding_pending ?? existingUser.onboardingPending) : true),
      isSuspended: !!editingUser.isSuspended,
      hauptAdmin: (() => {
        if (existingUser) return existingUser.hauptAdmin ?? false;
        if (editingUser.role === Role.ADMIN) {
          const hasAnyAdmin = (Object.values(users) as User[]).some(
            (u) => u.role === Role.ADMIN || u.hauptAdmin,
          );
          return !hasAnyAdmin;
        }
        return false;
      })(),
      createdAt: existingUser?.createdAt || new Date().toISOString(),
      gender: editingUser.gender || "m",
      birthDate: editingUser.birthDate ? editingUser.birthDate.trim() : null,
      language: editingUser.language || (existingUser ? existingUser.language : (settings.i18n?.defaultLanguage || "de")),
      avatarUrl: editingUser.avatarUrl !== undefined ? (editingUser.avatarUrl || null) : (existingUser?.avatarUrl || null),
      avatarIcon: editingUser.avatarIcon !== undefined ? (editingUser.avatarIcon || "initials") : (existingUser?.avatarIcon || "initials"),
      avatarColor: editingUser.avatarColor !== undefined ? (editingUser.avatarColor || null) : (existingUser?.avatarColor || null),
    };

    try {
      await onUpdateUsers(updatedUsers);

      setMessage({
        text: `Benutzer "${finalUsername}" erfolgreich gespeichert.`,
        type: "success",
      });

      setEditingUser({
        name: "",
        password: "",
        role: Role.USER,
        gender: "m",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        birthDate: "",
        showContactInfo: false,
        onboarding_pending: true,
        isSuspended: false,
      });
      setShowUserForm(false);
      setInlineEditingUserId(null);
    } catch (err: any) {
      setMessage({
        text: `Fehler beim Speichern: ${err.message}`,
        type: "error",
      });
    }
  };

  const executeDeleteUser = async (userToDelete: User) => {
    setIsDeletingUser(true);
    try {
      const userKey = userToDelete.name.toLowerCase().replace(/\s/g, "");
      const updatedUsers = { ...users };
      delete updatedUsers[userKey];
      await onUpdateUsers(updatedUsers);
      setUserToDeleteConfirm(null);
      setMessage({
        text: `Benutzer "${userToDelete.klarname || userToDelete.name}" gelöscht.`,
        type: "success",
      });
    } catch (err: any) {
      console.error("Fehler beim Löschen des Benutzers:", err);
      setMessage({
        text: `Fehler beim Löschen: ${err?.message || "Unbekannter Fehler"}`,
        type: "error",
      });
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleDeleteUser = (username: string) => {
    const userKey = username.toLowerCase().replace(/\s/g, "");
    const userToDelete = users[userKey];

    if (!userToDelete) {
      setMessage({
        text: "Benutzer konnte nicht gefunden werden.",
        type: "error",
      });
      return;
    }

    if (userToDelete.hauptAdmin && !isSuperAdminImpersonating) {
      setMessage({
        text: "Der Haupt-Admin dieses Vereins kann nicht gelöscht werden!",
        type: "error",
      });
      return;
    }

    if (userToDelete.id === currentUser.id && !isSuperAdminImpersonating) {
      setMessage({
        text: "Du kannst dich nicht selbst löschen!",
        type: "error",
      });
      return;
    }

    setUserToDeleteConfirm(userToDelete);
  };

  const processCsvFile = (file: File) => {
    if (!file) return;

    setSelectedFileName(file.name);
    setImportErrors([]);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      const newUsers: User[] = [];
      const errorsList: string[] = [];
      const existingNames = new Set(
        (Object.values(users) as User[]).map((u: any) => u.name.toLowerCase().trim()),
      );
      const parsedNames = new Set<string>();

      lines.forEach((line, index) => {
        const parts = line.includes(";") ? line.split(";") : line.split(",");
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const password = parts[1].trim();

          const nameLower = name.toLowerCase();
          if (
            nameLower === "benutzername" ||
            nameLower === "username" ||
            nameLower === "name"
          ) {
            // Is a header, skip silently
            return;
          }

          const role =
            parts[2]?.trim().toLowerCase() === "admin" ? Role.ADMIN : Role.USER;
          const firstName = parts[3]?.trim() || "";
          const lastName = parts[4]?.trim() || "";
          const email = parts[5]?.trim() || "";
          const phone = parts[6]?.trim() || "";
          const genderRaw = parts[7]?.trim().toLowerCase();
          const gender = genderRaw === "w" ? "w" : "m";
          const birthDate = parts[8]?.trim() || undefined;
          const id = nameLower.replace(/[^a-z0-9]/g, "");

          if (name && password) {
            if (existingNames.has(nameLower)) {
              errorsList.push(
                `Zeile ${index + 1}: Benutzername "${name}" existiert bereits.`,
              );
              return;
            }
            if (parsedNames.has(nameLower)) {
              errorsList.push(
                `Zeile ${index + 1}: Benutzername "${name}" ist doppelt in Datei.`,
              );
              return;
            }

            parsedNames.add(nameLower);
            newUsers.push({
              id,
              name,
              password,
              role,
              firstName,
              lastName,
              email,
              phone,
              gender,
              birthDate,
              showContactInfo: false,
              onboarding_pending: true,
            });
          }
        }
      });

      setCsvPreview(newUsers);
      setImportErrors(errorsList);
      if (newUsers.length === 0 && errorsList.length === 0) {
        setMessage({
          text: "Keine gültigen Daten gefunden. Format: Benutzername;Passwort;Rolle;Vorname;Nachname;Email;Telefon;Geschlecht;Geburtsdatum",
          type: "error",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  };

  const importUsers = () => {
    const updatedUsers = { ...users };
    csvPreview.forEach((u) => {
      updatedUsers[u.id] = u;
    });
    onUpdateUsers(updatedUsers);
    setMessage({
      text: `${csvPreview.length} Mitglieder erfolgreich importiert!`,
      type: "success",
    });
    setCsvPreview([]);
    setImportErrors([]);
    setSelectedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const executeBulkDelete = () => {
    if (deleteConfirmText !== "LÖSCHEN") return;

    if (showDeleteModal === "bookings") {
      const toDelete = bookings.filter((b) => {
        let inRange = true;
        if (deleteRange.start && b.date < deleteRange.start) inRange = false;
        if (deleteRange.end && b.date > deleteRange.end) inRange = false;
        if (
          deleteRange.court &&
          deleteRange.court !== "all" &&
          b.court !== deleteRange.court
        )
          inRange = false;
        return inRange;
      });

      if (onDeleteBooking) {
        const runDeletion = async () => {
          for (let i = 0; i < toDelete.length; i++) {
            await onDeleteBooking(toDelete[i].id);
          }
        };

        runDeletion()
          .then(() => {
            setMessage({
              text: `${toDelete.length} Reservierungen im gewählten Zeitraum bzw. Platz wurden gelöscht.`,
              type: "success",
            });
          })
          .catch((err) => {
            console.error("Error bulk deleting bookings:", err);
            setMessage({
              text: "Fehler beim Löschen der Reservierungen in der Cloud.",
              type: "error",
            });
          });
      } else {
        const filtered = bookings.filter((b) => !toDelete.includes(b));
        onUpdateBookings(filtered);
        setMessage({
          text: "Reservierungen im gewählten Zeitraum bzw. auf dem gewählten Platz wurden gelöscht.",
          type: "success",
        });
      }
    } else if (showDeleteModal === "users") {
      const updatedUsers: Record<string, User> = {};
      
      // Find the correct username key of the current logged-in admin
      const currentAdminKey = Object.keys(users).find(
        (key) => users[key].id === currentUser.id
      ) || currentUser.id;

      updatedUsers[currentAdminKey] = {
        ...currentUser,
      };

      onUpdateUsers(updatedUsers);
      setMessage({
        text: "Alle Spieler außer dem aktuell eingeloggten Administrator wurden erfolgreich gelöscht.",
        type: "success",
      });
    }

    setShowDeleteModal(null);
    setDeleteConfirmText("");
  };

  const downloadTemplate = () => {
    const content =
      "Benutzername;Passwort;Rolle;Vorname;Nachname;Email;Telefon;Geschlecht;Geburtsdatum\nmaxmustermann;tennis123;user;Max;Mustermann;max@beispiel.de;+49 170 1234567;m;1990-05-15\nerikamusterfrau;geheim;admin;Erika;Musterfrau;erika@beispiel.de;+49 171 7654321;w;1985-11-20\nfelixjunior;jugend123;user;Felix;Junior;felix@beispiel.de;;m;2012-08-10";
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Mitglieder_Vorlage.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportMembersCSV = () => {
    const header = "Benutzername;Passwort;Rolle;Vorname;Nachname;Email;Telefon;Geschlecht;Geburtsdatum\n";
    const rows = sortedAndFilteredUsers
      .map((u) => {
        const roleText = u.role || Role.USER;
        const firstName = u.firstName || "";
        const lastName = u.lastName || "";
        const email = u.email || "";
        const phone = u.phone || "";
        const password = u.password || "";
        const name = u.name || "";
        const geschlecht = u.gender || "m";
        const geburtsdatum = u.birthDate || "";
        return `${name};${password};${roleText};${firstName};${lastName};${email};${phone};${geschlecht};${geburtsdatum}`;
      })
      .join("\n");

    const content = header + rows;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Mitglieder_Export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportBookingsCSV = () => {
    let filtered = [...bookings];
    if (exportStartDate) {
      filtered = filtered.filter((b) => b.date >= exportStartDate);
    }
    if (exportEndDate) {
      filtered = filtered.filter((b) => b.date <= exportEndDate);
    }

    filtered.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.time.localeCompare(b.time);
    });

    const header =
      "Buchungs-ID;Datum;Uhrzeit;Platz;Spieler;Ist Gesperrt;Grund/Sperre;Gebucht von;Mit Ballmaschine;Kommentar\n";
    const rows = filtered
      .map((b) => {
        const id = b.id || "";
        const date = b.date || "";
        const time = b.time || "";
        const court = b.court || "";
        const players = Array.isArray(b.players) ? b.players.join(", ") : "";
        const isLocked = b.isLocked ? "Ja" : "Nein";
        const reason = b.reason ? b.reason.replace(/;/g, ",") : "";
        const bookedBy = b.bookedBy || "";
        const hasBallMachine = b.hasBallMachine ? "Ja" : "Nein";
        const comment = b.comment ? b.comment.replace(/;/g, ",") : "";

        return `"${id}";"${date}";"${time}";"${court}";"${players}";"${isLocked}";"${reason}";"${bookedBy}";"${hasBallMachine}";"${comment}"`;
      })
      .join("\n");

    const content = header + rows;
    const blob = new Blob(["\ufeff" + content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const fromText = exportStartDate || "Anfang";
    const toText = exportEndDate || "Ende";
    const filename =
      exportStartDate || exportEndDate
        ? `Buchungsexport_${fromText}_bis_${toText}.csv`
        : "Buchungsexport_Saemtlicher_Buchungen.csv";

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage({
      text: `${filtered.length} Buchungen wurden erfolgreich als CSV exportiert.`,
      type: "success",
    });
  };

  const exportBookingsJSON = () => {
    let filtered = [...bookings];
    if (exportStartDate) {
      filtered = filtered.filter((b) => b.date >= exportStartDate);
    }
    if (exportEndDate) {
      filtered = filtered.filter((b) => b.date <= exportEndDate);
    }

    filtered.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.time.localeCompare(b.time);
    });

    const content = JSON.stringify(filtered, null, 2);
    const blob = new Blob([content], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);

    const fromText = exportStartDate || "Anfang";
    const toText = exportEndDate || "Ende";
    const filename =
      exportStartDate || exportEndDate
        ? `Buchungsexport_${fromText}_bis_${toText}.json`
        : "Buchungsexport_Saemtlicher_Buchungen.json";

    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage({
      text: `${filtered.length} Buchungen wurden erfolgreich als JSON exportiert.`,
      type: "success",
    });
  };

  const getSevenDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const getAnonymizedBookingsList = () => {
    const sevenDaysAgo = getSevenDaysAgoStr();
    const filtered = bookings.filter((b) => b.date >= sevenDaysAgo);
    return filtered.map((b) => {
      const anonymizedPlayers = Array.isArray(b.players)
        ? b.players.map((_, idx) => `Spieler ${idx + 1}`)
        : [];
      return {
        id: b.id,
        date: b.date,
        time: b.time,
        court: b.court,
        isLocked: b.isLocked || false,
        hasBallMachine: b.hasBallMachine || false,
        players: anonymizedPlayers,
        reason: b.isLocked ? b.reason || "Sperre" : "Privatspiel",
      };
    });
  };

  const getClearBookingsList = () => {
    const sevenDaysAgo = getSevenDaysAgoStr();
    const filtered = bookings.filter((b) => b.date >= sevenDaysAgo);
    return filtered.map((b) => {
      return {
        id: b.id,
        date: b.date,
        time: b.time,
        court: b.court,
        isLocked: b.isLocked || false,
        hasBallMachine: b.hasBallMachine || false,
        players: Array.isArray(b.players) ? b.players : [],
        reason: b.isLocked ? b.reason || "Sperre" : "Privatspiel",
      };
    });
  };

  const publishAnonymizedFeed = async () => {
    try {
      const list = getAnonymizedBookingsList();
      await savePublicBookings(currentClubId, list);
      setMessage({
        text: "Der anonymisierte, öffentliche Feed wurde erfolgreich in die Clouddatenbank geladen!",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setMessage({
        text: `Fehler beim Veröffentlichen: ${err.message || err}`,
        type: "error",
      });
    }
  };

  const publishClearFeed = async () => {
    try {
      const list = getClearBookingsList();
      await saveClearBookings(currentClubId, list);
      setMessage({
        text: "Der öffentliche Feed mit Klarnamen wurde erfolgreich in die Clouddatenbank geladen!",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      setMessage({
        text: `Fehler beim Veröffentlichen: ${err.message || err}`,
        type: "error",
      });
    }
  };

  const downloadAnonymizedBookingsJSON = () => {
    const list = getAnonymizedBookingsList();
    const content = JSON.stringify(list, null, 2);
    const blob = new Blob([content], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Buchungen_Anonymisiert_${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage({
      text: `${list.length} anonymisierte Buchungen wurden erfolgreich als JSON-Datei heruntergeladen.`,
      type: "success",
    });
  };

  const downloadClearBookingsJSON = () => {
    const list = getClearBookingsList();
    const content = JSON.stringify(list, null, 2);
    const blob = new Blob([content], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Buchungen_Klarnamen_${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage({
      text: `${list.length} Buchungen mit Klarnamen wurden erfolgreich als JSON-Datei heruntergeladen.`,
      type: "success",
    });
  };

  const getEmbedWidgetURL = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const clubId = currentClubId;
    return `${origin}/?embed=courts&tenant=${encodeURIComponent(clubId)}`;
  };

  const getEmbedIframeCode = () => {
    const url = getEmbedWidgetURL();
    return `<iframe src="${url}" width="100%" height="720" style="border:none;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);width:100%;min-height:680px;" loading="lazy" title="Tennis Platzbelegung"></iframe>`;
  };

  const nonSuperAdminUsers = useMemo(() => {
    return ((Object.values(users) as User[]) as User[]).filter(
      (u) => !isUserSuperAdmin(u)
    );
  }, [users]);

  const editPlayerSuggestions = useMemo(() => {
    if (!editBkNewPlayerQuery.trim()) return [];
    const q = editBkNewPlayerQuery.toLowerCase();

    return nonSuperAdminUsers
      .filter((u) => {
        const fullName =
          u.lastName || u.firstName
            ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
            : u.name;
        return (
          u.name.toLowerCase().includes(q) ||
          (u.firstName || "").toLowerCase().includes(q) ||
          (u.lastName || "").toLowerCase().includes(q) ||
          fullName.toLowerCase().includes(q)
        );
      })
      .slice(0, 5);
  }, [nonSuperAdminUsers, editBkNewPlayerQuery]);

  const filteredAppointments = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];

    return (bookings || [])
      .filter((b) => {
        if (!b) return false;
        const bDate = b.date || "";
        const bCourt = b.court || "";
        const bReason = b.reason || "";
        const bComment = b.comment || "";
        const bPlayers = Array.isArray(b.players) ? b.players : [];

        // 1. Search Query filter (matches Date, Court, Player name, Comment, or Reason)
        if (bookingSearchQuery.trim()) {
          const q = bookingSearchQuery.toLowerCase();
          const matchesDate = bDate.toLowerCase().includes(q);
          const matchesCourt = bCourt.toLowerCase().includes(q);
          const matchesReason = bReason.toLowerCase().includes(q);
          const matchesComment = bComment.toLowerCase().includes(q);
          const matchesPlayers = bPlayers.some((p) => typeof p === "string" && p.toLowerCase().includes(q));

          if (
            !matchesDate &&
            !matchesCourt &&
            !matchesReason &&
            !matchesComment &&
            !matchesPlayers
          ) {
            return false;
          }
        }

        // 2. Type filter
        if (bookingFilterType === "future") {
          if (bDate < todayStr) return false;
        } else if (bookingFilterType === "past") {
          if (bDate >= todayStr) return false;
        } else if (bookingFilterType === "bookings") {
          if (b.isLocked) return false;
        } else if (bookingFilterType === "locks") {
          if (!b.isLocked) return false;
        }

        // 3. Court filter
        if (bookingFilterCourt !== "all") {
          if (bCourt !== bookingFilterCourt) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by Date desc, then Time desc (newest/most recent first)
        const aDate = a.date || "";
        const bDate = b.date || "";
        const dateCompare = bDate.localeCompare(aDate);
        if (dateCompare !== 0) return dateCompare;
        const aTime = a.time || "";
        const bTime = b.time || "";
        return bTime.localeCompare(aTime);
      });
  }, [bookings, bookingSearchQuery, bookingFilterType, bookingFilterCourt]);

  const bkItemsPerPage = 10;
  const bkTotalPages = useMemo(() => {
    return Math.ceil(filteredAppointments.length / bkItemsPerPage) || 1;
  }, [filteredAppointments]);

  const paginatedAppointments = useMemo(() => {
    const page = Math.min(bookingPage, bkTotalPages);
    const startIndex = (page - 1) * bkItemsPerPage;
    return filteredAppointments.slice(startIndex, startIndex + bkItemsPerPage);
  }, [filteredAppointments, bookingPage, bkTotalPages]);

  const sortedAndFilteredUsers = useMemo(() => {
    const rolePriority: Record<string, number> = {
      admin: 1,
      user: 2,
      mitglied: 3,
    };

    return nonSuperAdminUsers
      .filter(
        (u) =>
          u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
          (u.firstName || "")
            .toLowerCase()
            .includes(userSearchQuery.toLowerCase()) ||
          (u.lastName || "")
            .toLowerCase()
            .includes(userSearchQuery.toLowerCase()) ||
          u.role.toLowerCase().includes(userSearchQuery.toLowerCase()),
      )
      .sort((a, b) => {
        let result = 0;
        if (userSortBy === "role") {
          const roleA = a.role || "";
          const roleB = b.role || "";
          const prioA = rolePriority[roleA] || 99;
          const prioB = rolePriority[roleB] || 99;
          if (prioA !== prioB) {
            result = prioA - prioB;
          }
        }

        if (result === 0) {
          // Sort alphabetically by LastName, FirstName (nach nachname vorname)
          const lnA = (a.lastName || "")
            .trim()
            .localeCompare((b.lastName || "").trim(), "de", {
              sensitivity: "base",
            });
          if (lnA !== 0) {
            result = lnA;
          } else {
            const fnA = (a.firstName || "")
              .trim()
              .localeCompare((b.firstName || "").trim(), "de", {
                sensitivity: "base",
              });
            if (fnA !== 0) {
              result = fnA;
            } else {
              result = a.name
                .trim()
                .localeCompare(b.name.trim(), "de", { sensitivity: "base" });
            }
          }
        }

        return userSortOrder === "asc" ? result : -result;
      });
  }, [nonSuperAdminUsers, userSearchQuery, userSortBy, userSortOrder]);

  const itemsPerPage = 30;
  const totalUserPages = Math.ceil(
    sortedAndFilteredUsers.length / itemsPerPage,
  );
  const paginatedUsers = useMemo(() => {
    const startIndex = (userPage - 1) * itemsPerPage;
    return sortedAndFilteredUsers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAndFilteredUsers, userPage]);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      <div className="transition-all duration-300 bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200/80">
        {/* Upper Dashboard header area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-0 md:gap-4 mb-3 pb-3 md:mb-6 md:pb-6 border-b border-slate-100">
          <div className="hidden md:flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)]">
              <Settings className="w-5 h-5 text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">
                {t("admin.systemSettings", "Einstellungen")}
              </h3>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                {t("admin.systemSettingsSubtitle", "Vereinskonfiguration, Buchungsregeln und Systemverwaltung")}
              </p>
            </div>
          </div>
        </div>

        {/* Categories Tab Navigation */}
        <div className="flex flex-wrap p-1 gap-1 bg-slate-100/80 rounded-xl mb-8 relative">
          {TABS.map((tab) => {
            const isActive = currentTab === tab.id;
            const isDirty = isTabDirty(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id as any)}
                className={`flex items-center gap-2 py-2.5 px-4 rounded-lg font-black text-[10px] uppercase tracking-wider relative transition-all duration-300 ease-in-out whitespace-nowrap shrink-0 z-10 ${
                  isActive
                    ? "text-[var(--color-primary)] font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeAdminTab"
                    className="absolute inset-0 bg-white rounded-lg shadow-sm z-[-1]"
                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                  />
                )}
                <i
                  className={`fa-solid ${tab.icon} text-sm ${isActive ? "text-[var(--color-primary)]" : "text-slate-500"}`}
                ></i>
                <span>{t(tab.labelKey, tab.fallback)}</span>
                {isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-orange-600 animate-pulse border border-white absolute -top-1 -right-1 z-20"
                    title={t("admin.unsavedChanges")}
                  ></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Notifications/Messages */}
        {message && (
          <div
            className={`mb-8 p-4 rounded-2xl border-2 font-black text-xs flex items-center gap-3 animate-in slide-in-from-top-2 ${
              message.type === "success"
                ? "bg-green-50 border-green-100 text-green-700"
                : "bg-red-50 border-red-100 text-red-700"
            }`}
          >
            <i
              className={`fa-solid ${message.type === "success" ? "fa-circle-check" : "fa-circle-exclamation"}`}
            ></i>
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="hover:opacity-75 transition-opacity"
            >
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
        )}

        {/* Active Sub-Panel Area */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.16, ease: "easeInOut" }}
              className="w-full"
            >
              {/* TAB 1: ALLGEMEIN */}
              {currentTab === "allgemein" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                    {/* Modules Segment */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-toggle-on text-[var(--color-primary)]"></i> {t("admin.modulesConfig.title")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.modulesConfig.subtitle")}
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {navOrder.map((id, index) => {
                          const isStartPage = id === "landing_page";
                          const isReservation = id === "reservation";
                          const isSpielpartner = id === "spielpartner";
                          const isEvents = id === "tournaments";
                          const isRanking = id === "ranking";
                          const isChampionship = id === "championship";
                          const isLeague = id === "league";
                          const isGuests = id === "guests";
                          const isArbeit = id === "arbeitseinsaetze";

                          let isChecked = true;
                          let onToggle: ((val: boolean) => void) | null = null;
                          let label = "";
                          let desc = "";

                          if (isStartPage) {
                            label = t("admin.modulesConfig.startpage.label");
                            desc = t("admin.modulesConfig.startpage.desc");
                            isChecked = modules.landing_page !== false;
                            onToggle = (val) => setModules({ ...modules, landing_page: val });
                          } else if (isReservation) {
                            label = t("admin.modulesConfig.courts.label");
                            desc = t("admin.modulesConfig.courts.desc");
                            isChecked = true;
                          } else if (isSpielpartner) {
                            label = t("admin.modulesConfig.spielpartner.label");
                            desc = t("admin.modulesConfig.spielpartner.desc");
                            isChecked = modules.spielpartner !== false;
                            onToggle = (val) => setModules({ ...modules, spielpartner: val });
                          } else if (isEvents) {
                            label = t("admin.modulesConfig.events.label");
                            desc = t("admin.modulesConfig.events.desc");
                            isChecked = !!modules.events;
                            onToggle = (val) => setModules({ ...modules, events: val });
                          } else if (isRanking) {
                            label = t("admin.modulesConfig.ranking.label");
                            desc = t("admin.modulesConfig.ranking.desc");
                            isChecked = !!modules.ranking;
                            onToggle = (val) => setModules({ ...modules, ranking: val });
                          } else if (isChampionship) {
                            label = t("admin.modulesConfig.championship.label");
                            desc = t("admin.modulesConfig.championship.desc");
                            isChecked = !!modules.championship;
                            onToggle = (val) => setModules({ ...modules, championship: val });
                          } else if (isLeague) {
                            label = t("admin.modulesConfig.league.label");
                            desc = t("admin.modulesConfig.league.desc");
                            isChecked = !!modules.league;
                            onToggle = (val) => setModules({ ...modules, league: val });
                          } else if (isGuests) {
                            label = t("admin.modulesConfig.guests.label");
                            desc = t("admin.modulesConfig.guests.desc");
                            isChecked = modules.guests !== false;
                            onToggle = (val) => setModules({ ...modules, guests: val });
                          } else if (isArbeit) {
                            label = t("admin.modulesConfig.service.label");
                            desc = t("admin.modulesConfig.service.desc");
                            isChecked = !!modules.arbeitseinsaetze;
                            onToggle = (val) => setModules({ ...modules, arbeitseinsaetze: val });
                          }

                          return (
                            <div
                              key={id}
                              className="flex items-center justify-between p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors"
                            >
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="font-semibold text-xs text-slate-800">
                                  {label}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                  {desc}
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                {/* Up / Down arrows for ordering */}
                                <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
                                  <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => handleMoveNavModule(index, "up")}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                    title={t("admin.modulesConfig.moveUp")}
                                  >
                                    <i className="fa-solid fa-arrow-up"></i>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={index === navOrder.length - 1}
                                    onClick={() => handleMoveNavModule(index, "down")}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                    title={t("admin.modulesConfig.moveDown")}
                                  >
                                    <i className="fa-solid fa-arrow-down"></i>
                                  </button>
                                </div>

                                {/* Checkbox */}
                                {isReservation ? (
                                  <input
                                    type="checkbox"
                                    checked={true}
                                    disabled
                                    className="w-4 h-4 accent-[var(--color-primary)] opacity-70 cursor-not-allowed shrink-0 rounded"
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => onToggle && onToggle(e.target.checked)}
                                    className="w-4 h-4 accent-[var(--color-primary)] shrink-0 cursor-pointer rounded"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Club Context / Basic Configurations */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-circle-info text-[var(--color-primary)]"></i> {t("admin.generalSettings.title")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.generalSettings.subtitle")}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.generalSettings.clubName")}
                          </label>
                          <input 
                            type="text"
                            value={clubName || ""}
                            onChange={(e) => setClubName(e.target.value)}
                            placeholder={t("admin.generalSettings.clubNamePlaceholder")}
                            className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                          />
                        </div>

                        {/* Standort der Platzanlage (Strukturierte Adressfelder) */}
                        <div className="pt-3 border-t border-slate-200/60 space-y-3.5">
                          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                            <i className="fa-solid fa-location-dot text-[var(--color-primary)]"></i>
                            {t("admin.generalSettings.facilityLocation")}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {t("admin.generalSettings.street")}
                              </label>
                              <input 
                                type="text"
                                value={street || ""}
                                onChange={(e) => setStreet(e.target.value)}
                                placeholder={t("admin.generalSettings.streetPlaceholder")}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-1">
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  {t("admin.generalSettings.zip")}
                                </label>
                                <input 
                                  type="text"
                                  value={zip || ""}
                                  onChange={(e) => setZip(e.target.value)}
                                  placeholder={t("admin.generalSettings.zipPlaceholder")}
                                  className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  {t("admin.generalSettings.city")}
                                </label>
                                <input 
                                  type="text"
                                  value={city || ""}
                                  onChange={(e) => setCity(e.target.value)}
                                  placeholder={t("admin.generalSettings.cityPlaceholder")}
                                  className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                                />
                              </div>
                            </div>
                            
                            <div className="pt-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                {t("admin.generalSettings.facilityPhoto")}
                              </label>
                              <div className="flex flex-col gap-2.5">
                                {(customFacilityPhotoUrl || headerLogoUrl) ? (
                                  <div className="relative h-24 w-40 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                                    <img 
                                      src={customFacilityPhotoUrl || headerLogoUrl} 
                                      alt="Anlagen Vorschau" 
                                      className="w-full h-full object-cover"
                                    />
                                    {customFacilityPhotoUrl && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFacilityPhotoUrl("");
                                          setCustomFacilityPhotoUrl("");
                                        }}
                                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center text-red-500 shadow-xs hover:bg-red-50 transition-colors"
                                        title={t("admin.generalSettings.removePhoto")}
                                      >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                      </button>
                                    )}
                                  </div>
                                ) : null}
                                <div className="flex flex-col gap-1.5">
                                  <label className="cursor-pointer flex items-center justify-center gap-2 w-full h-10 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all border border-slate-200 shadow-2xs">
                                    <i className="fa-solid fa-upload"></i> {t("admin.generalSettings.uploadPhoto")}
                                    <input 
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImageUpload(e as any, "facilityPhoto");
                                      }}
                                    />
                                  </label>
                                  <p className="text-xs text-slate-400 leading-normal">
                                    {t("admin.generalSettings.photoDesc")}
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                          </div>
                        </div>

                        {/* Sprache & Internationalisierung */}
                        <div className="pt-3 border-t border-slate-200/60 space-y-3">
                          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                            <i className="fa-solid fa-language text-[var(--color-primary)]"></i>
                            {t("admin.generalSettings.langSection")}
                          </div>

                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-4">
                            {/* 1. Standardsprache des Vereins */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/60">
                              <div className="pr-3">
                                <label className="text-xs font-semibold text-slate-800 block">
                                  {t("admin.generalSettings.defaultLang")}
                                </label>
                                <span className="text-[11px] text-slate-500 block leading-snug">
                                  {t("admin.generalSettings.defaultLangDesc")}
                                </span>
                              </div>
                              <select
                                value={defaultLanguage}
                                onChange={(e) => {
                                  const newDef = e.target.value as "de" | "en";
                                  setDefaultLanguage(newDef);
                                }}
                                className="h-9 px-3 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 outline-none focus:border-[var(--color-primary)] cursor-pointer"
                              >
                                <option value="de">Deutsch (DE)</option>
                                <option value="en">English (EN)</option>
                              </select>
                            </div>

                            {/* 2. Sprach-Verfügbarkeit */}
                            <div className="space-y-2.5">
                              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                {t("admin.generalSettings.availLangs")}
                              </div>

                              {/* Primäre Standardsprache (Fest aktiv / locked) */}
                              <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/70 text-slate-700">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800">
                                    {defaultLanguage === "de" ? "🇩🇪 Deutsch (DE)" : "🇬🇧 English (EN)"}
                                  </span>
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    {t("admin.generalSettings.alwaysActive")}
                                  </span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={true}
                                  disabled
                                  className="w-4 h-4 accent-[var(--color-primary)] opacity-60 cursor-not-allowed rounded"
                                />
                              </div>

                              {/* Optionale Zweitsprache (Frei konfigurierbar) */}
                              <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/70 hover:border-slate-300 transition-colors cursor-pointer text-slate-700">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-800">
                                    {defaultLanguage === "de" ? "🇬🇧 English (EN)" : "🇩🇪 Deutsch (DE)"}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {t("admin.generalSettings.allowOptionalLang")}
                                  </span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={allowOtherLanguage}
                                  onChange={(e) => setAllowOtherLanguage(e.target.checked)}
                                  className="w-4 h-4 accent-[var(--color-primary)] shrink-0 cursor-pointer rounded"
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Zusatz-Wissen für KI-Assistent Ace */}
                        <div className="pt-3 border-t border-slate-200/60 space-y-2">
                          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                            <i className="fa-solid fa-robot text-[var(--color-primary)]"></i>
                            {t("admin.generalSettings.aceKnowledge")}
                          </div>
                          <textarea
                            value={customAiInstructions}
                            onChange={(e) => setCustomAiInstructions(e.target.value)}
                            placeholder={t("admin.generalSettings.acePlaceholder")}
                            rows={3}
                            className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 leading-relaxed font-sans"
                          />
                          <p className="text-[11px] text-slate-400">
                            {t("admin.generalSettings.aceHelp")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tab Category Actions */}
                  <div className="border-t border-slate-200/80 pt-5 flex justify-end">
                    <button
                      type="button"
                      disabled={!isTabDirty("allgemein")}
                      onClick={() => handleSaveTab("allgemein")}
                      className={`h-10 px-6 rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                        isTabDirty("allgemein")
                          ? "bg-[var(--color-primary)] text-white hover:brightness-110"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      }`}
                    >
                      <i className="fa-solid fa-floppy-disk"></i> {t("common.save")}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: STARTSEITE BEARBEITEN */}
              {currentTab === "landing_page" && (
                <div className="animate-in fade-in duration-300">
                  <LandingPageEditor
                    vereinsId={currentClubId}
                    authorName={currentUser.name || currentUser.id}
                    clubName={settings?.clubName || "Verein"}
                    primaryColor={settings?.primaryColor}
                    onSaved={(newCfg) => {
                      if (onUpdateLandingPageConfig) {
                        onUpdateLandingPageConfig(newCfg);
                      }
                    }}
                  />
                </div>
              )}

              {/* TAB: ARBEITSEINSÄTZE */}
              {currentTab === "arbeitseinsaetze" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
                    {/* Einstellungen */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-briefcase text-[var(--color-primary)]"></i> {t("admin.arbeitseinsaetze.moduleParamsTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.arbeitseinsaetze.moduleParamsSubtitle")}
                        </p>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.arbeitseinsaetze.memberListVisibility")}
                          </label>
                          <div className="relative">
                            <select
                              value={aeVisibility}
                              onChange={(e) => setAeVisibility(e.target.value as any)}
                              className="w-full h-10 px-3.5 pr-10 bg-white text-sm text-slate-800 rounded-xl border border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all appearance-none outline-none font-normal"
                            >
                              <option value="full">{t("admin.arbeitseinsaetze.visibilityFull")}</option>
                              <option value="active_only">{t("admin.arbeitseinsaetze.visibilityActiveOnly")}</option>
                              <option value="hidden">{t("admin.arbeitseinsaetze.visibilityHidden")}</option>
                            </select>
                            <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.arbeitseinsaetze.bookingInterval")}
                          </label>
                          <div className="relative">
                            <select
                              value={aeInterval}
                              onChange={(e) => setAeInterval(e.target.value as any)}
                              className="w-full h-10 px-3.5 pr-10 bg-white text-sm text-slate-800 rounded-xl border border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all appearance-none outline-none font-normal"
                            >
                              <option value="0.25">{t("admin.arbeitseinsaetze.intervalQuarter")}</option>
                              <option value="0.5">{t("admin.arbeitseinsaetze.intervalHalf")}</option>
                              <option value="1.0">{t("admin.arbeitseinsaetze.intervalHour")}</option>
                            </select>
                            <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 space-y-3">
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              id="aeCommentsRequired"
                              checked={commentsRequired}
                              onChange={(e) => setCommentsRequired(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                {t("admin.arbeitseinsaetze.commentsRequired")}
                              </span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {t("admin.arbeitseinsaetze.commentsRequiredDesc")}
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Kategorien CRUD */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-tags text-[var(--color-primary)]"></i> {t("admin.arbeitseinsaetze.manageCategoriesTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.arbeitseinsaetze.manageCategoriesSubtitle")}
                        </p>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={t("admin.arbeitseinsaetze.newCategoryPlaceholder")}
                            value={newAeCategory}
                            onChange={(e) => setNewAeCategory(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newAeCategory.trim()) {
                                e.preventDefault();
                                if (!aeCategories.includes(newAeCategory.trim())) {
                                  setAeCategories([...aeCategories, newAeCategory.trim()].sort((a, b) => a.localeCompare(b, "de")));
                                }
                                setNewAeCategory("");
                              }
                            }}
                            className="flex-1 h-10 px-3.5 bg-white text-sm text-slate-800 rounded-xl border border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all font-normal placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newAeCategory.trim() && !aeCategories.includes(newAeCategory.trim())) {
                                setAeCategories([...aeCategories, newAeCategory.trim()].sort((a, b) => a.localeCompare(b, "de")));
                                setNewAeCategory("");
                              }
                            }}
                            disabled={!newAeCategory.trim()}
                            className="h-10 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <i className="fa-solid fa-plus text-xs"></i> {t("admin.arbeitseinsaetze.addCategory")}
                          </button>
                        </div>

                        <div className="flex flex-col gap-1.5 bg-slate-50/70 border border-slate-200/80 rounded-xl p-2 max-h-[300px] overflow-y-auto">
                          {aeCategories.length === 0 ? (
                            <div className="p-4 text-center text-xs font-normal text-slate-400">
                              {t("admin.arbeitseinsaetze.noCategories")}
                            </div>
                          ) : (
                            aeCategories.map((cat, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/60 hover:border-slate-300 group transition-colors">
                                {editingCategoryIndex === idx ? (
                                  <div className="flex items-center gap-2 w-full">
                                    <input
                                      type="text"
                                      value={editingCategoryValue}
                                      onChange={(e) => setEditingCategoryValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          const val = editingCategoryValue.trim();
                                          if (val && (!aeCategories.includes(val) || val === cat)) {
                                            const updated = [...aeCategories];
                                            updated[idx] = val;
                                            setAeCategories(updated.sort((a, b) => a.localeCompare(b, "de")));
                                            setEditingCategoryIndex(null);
                                          }
                                        } else if (e.key === "Escape") {
                                          setEditingCategoryIndex(null);
                                        }
                                      }}
                                      className="flex-1 h-8 px-2.5 bg-white text-xs text-slate-800 rounded-lg border border-slate-300 focus:border-[var(--color-primary)] outline-none font-normal"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = editingCategoryValue.trim();
                                        if (val && (!aeCategories.includes(val) || val === cat)) {
                                          const updated = [...aeCategories];
                                          updated[idx] = val;
                                          setAeCategories(updated.sort((a, b) => a.localeCompare(b, "de")));
                                          setEditingCategoryIndex(null);
                                        }
                                      }}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                                      title={t("admin.arbeitseinsaetze.saveCategory")}
                                    >
                                      <i className="fa-solid fa-check text-[10px]"></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCategoryIndex(null)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors cursor-pointer"
                                      title={t("admin.arbeitseinsaetze.cancel")}
                                    >
                                      <i className="fa-solid fa-xmark text-[10px]"></i>
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-xs font-semibold text-slate-700">{cat}</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCategoryIndex(idx);
                                          setEditingCategoryValue(cat);
                                        }}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-[var(--color-primary)] hover:bg-slate-100 transition-colors cursor-pointer"
                                        title={t("admin.arbeitseinsaetze.renameCategory")}
                                      >
                                        <i className="fa-solid fa-pen-to-square text-xs"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const matchingEntries = aeEntries.filter(
                                            (e) => e.category.trim().toLowerCase() === cat.trim().toLowerCase()
                                          );
                                          if (matchingEntries.length > 0) {
                                            setCategoryToDelete(cat);
                                            const otherCategories = aeCategories.filter(c => c !== cat);
                                            setRemapTargetCategory(otherCategories[0] || "");
                                          } else {
                                            if (window.confirm(t("admin.arbeitseinsaetze.deleteConfirm", { cat }))) {
                                              setAeCategories(aeCategories.filter(c => c !== cat));
                                              if (editingCategoryIndex === idx) {
                                                setEditingCategoryIndex(null);
                                              }
                                            }
                                          }
                                        }}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                                        title={t("admin.arbeitseinsaetze.deleteCategory")}
                                      >
                                        <i className="fa-solid fa-trash-can text-xs"></i>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {categoryToDelete && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
                      <div className="border-none outline-none bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                          <i className="fa-solid fa-triangle-exclamation text-amber-500 text-lg"></i>
                          {t("admin.arbeitseinsaetze.cannotDeleteTitle")}
                        </h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                          {t("admin.arbeitseinsaetze.cannotDeleteDesc", {
                            cat: categoryToDelete,
                            count: aeEntries.filter(e => e.category.trim().toLowerCase() === categoryToDelete.trim().toLowerCase()).length
                          })}
                        </p>

                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mb-4">
                          <label className="block text-xs font-semibold text-slate-700 mb-2">
                            {t("admin.arbeitseinsaetze.remapLabel")}
                          </label>
                          {aeCategories.filter(c => c !== categoryToDelete).length > 0 ? (
                            <div className="relative">
                              <select
                                value={remapTargetCategory}
                                onChange={(e) => setRemapTargetCategory(e.target.value)}
                                className="w-full h-10 px-3.5 pr-10 bg-white text-sm text-slate-800 rounded-xl border border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all appearance-none outline-none cursor-pointer font-normal"
                              >
                                {aeCategories
                                  .filter(c => c !== categoryToDelete)
                                  .map(c => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))
                                }
                              </select>
                              <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                            </div>
                          ) : (
                            <p className="text-xs text-rose-600 font-medium">
                              {t("admin.arbeitseinsaetze.noOtherCategory")}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setCategoryToDelete(null)}
                            className="flex-1 h-10 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl font-semibold text-xs text-slate-700 transition-all cursor-pointer"
                          >
                            {t("admin.arbeitseinsaetze.discard")}
                          </button>
                          
                          {aeCategories.filter(c => c !== categoryToDelete).length > 0 && (
                            <button
                              type="button"
                              disabled={isRemapping}
                              onClick={async () => {
                                try {
                                  setIsRemapping(true);
                                  const entriesToUpdate = aeEntries.filter(
                                    e => e.category.trim().toLowerCase() === categoryToDelete.trim().toLowerCase()
                                  );
                                  
                                  const clubId = currentClubId;
                                  
                                  for (const entry of entriesToUpdate) {
                                    await saveArbeitseinsatz(clubId, {
                                      ...entry,
                                      category: remapTargetCategory
                                    });
                                  }

                                  const newCats = aeCategories.filter(c => c !== categoryToDelete);
                                  setAeCategories(newCats);
                                  
                                  setCategoryToDelete(null);
                                } catch (err) {
                                  console.error("Fehler beim Umgruppieren:", err);
                                } finally {
                                  setIsRemapping(false);
                                }
                              }}
                              className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {isRemapping ? (
                                <>
                                  <i className="fa-solid fa-spinner animate-spin"></i>
                                  {t("admin.arbeitseinsaetze.remapping")}
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-arrows-spin"></i>
                                  {t("admin.arbeitseinsaetze.remapAndAction")}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Zielwerte */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-6">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-clock text-[var(--color-primary)]"></i> Zielwerte
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Festlegung des regulären Jahres-Solls sowie jahresspezifischer Anpassungen.
                      </p>
                    </div>

                    {/* Standardregel */}
                    <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">Standardregel</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 max-w-xl">
                            Gilt als Standardwert bis zu dem Jahr, ab dem die erste abweichende Regel aktiv wird. Jede abweichende Regel gilt ab dem jeweiligen Jahr fortlaufend.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-xs font-medium text-slate-600">Soll-Stunden:</label>
                          <div className="relative w-28">
                            <input
                              type="number"
                              min="1"
                              max="200"
                              step="0.5"
                              value={sollStunden}
                              onChange={(e) => setSollStunden(Number(e.target.value) || 0)}
                              className="w-full h-9 px-3 pr-8 bg-white text-xs font-bold text-slate-800 rounded-xl border border-slate-200 focus:border-[var(--color-primary)] focus:outline-none"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">Std.</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Abweichende Jahresregeln */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Abweichende Jahresregeln
                          </h4>
                        </div>

                        {!isAddingAeRule && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingAeRule(true);
                              setEditingAeRuleId(null);
                              setNewRuleYear(new Date().getFullYear() + 1);
                              setNewRuleHours(sollStunden);
                            }}
                            className="h-8 px-3 rounded-lg bg-[var(--color-primary)] text-white hover:brightness-110 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
                          >
                            <i className="fa-solid fa-plus text-[10px]"></i> Regel hinzufügen
                          </button>
                        )}
                      </div>

                      {/* Inline form for adding / editing a rule */}
                      {isAddingAeRule && (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold text-slate-700">Gültig ab Jahr:</label>
                              <input
                                type="number"
                                min="2020"
                                max="2050"
                                value={newRuleYear}
                                onChange={(e) => setNewRuleYear(Number(e.target.value))}
                                className="w-24 h-8 px-2.5 bg-white text-xs font-bold text-slate-800 rounded-lg border border-slate-200 focus:border-[var(--color-primary)] outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-semibold text-slate-700">Soll-Stunden:</label>
                              <div className="relative w-24">
                                <input
                                  type="number"
                                  min="0.5"
                                  max="200"
                                  step="0.5"
                                  value={newRuleHours}
                                  onChange={(e) => setNewRuleHours(Number(e.target.value))}
                                  className="w-full h-8 px-2.5 pr-7 bg-white text-xs font-bold text-slate-800 rounded-lg border border-slate-200 focus:border-[var(--color-primary)] outline-none"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">Std.</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingAeRule(false);
                                setEditingAeRuleId(null);
                              }}
                              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!newRuleYear || newRuleHours <= 0) return;
                                let updated = [...aeRules];
                                if (editingAeRuleId) {
                                  updated = updated.map(r => r.id === editingAeRuleId ? { ...r, gueltig_ab_jahr: newRuleYear, soll_stunden: newRuleHours } : r);
                                } else {
                                  if (updated.some(r => r.gueltig_ab_jahr === newRuleYear)) {
                                    alert(`Für das Jahr ${newRuleYear} existiert bereits eine Regel.`);
                                    return;
                                  }
                                  updated.push({
                                    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                    gueltig_ab_jahr: newRuleYear,
                                    soll_stunden: newRuleHours,
                                  });
                                }
                                updated.sort((a, b) => b.gueltig_ab_jahr - a.gueltig_ab_jahr);
                                setAeRules(updated);
                                setIsAddingAeRule(false);
                                setEditingAeRuleId(null);
                              }}
                              className="h-8 px-3.5 rounded-lg bg-[var(--color-primary)] text-white hover:brightness-110 text-xs font-semibold cursor-pointer shadow-xs"
                            >
                              Übernehmen
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Rules List / Table */}
                      {aeRules.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          Keine abweichenden Jahresregeln hinterlegt. Es gilt durchgehend die Standardregel ({sollStunden} Std.).
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                                <th className="py-2.5 px-3.5">Gültig ab Jahr</th>
                                <th className="py-2.5 px-3.5">Soll-Vorgabe</th>
                                <th className="py-2.5 px-3.5">Geltungsbereich</th>
                                <th className="py-2.5 px-3 text-right">Aktionen</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(() => {
                                const sortedRulesAsc = [...aeRules].sort((a, b) => a.gueltig_ab_jahr - b.gueltig_ab_jahr);
                                return aeRules.map((rule) => {
                                  const idx = sortedRulesAsc.findIndex(r => r.id === rule.id);
                                  const nextRule = sortedRulesAsc[idx + 1];
                                  const rangeText = nextRule 
                                    ? `Gilt ${rule.gueltig_ab_jahr} – ${nextRule.gueltig_ab_jahr - 1}`
                                    : `Gilt ab ${rule.gueltig_ab_jahr} fortlaufend`;

                                  return (
                                    <tr key={rule.id} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="py-2.5 px-3.5 font-bold text-slate-800">
                                        Ab {rule.gueltig_ab_jahr}
                                      </td>
                                      <td className="py-2.5 px-3.5 font-semibold text-slate-700">
                                        {rule.soll_stunden} Std.
                                      </td>
                                      <td className="py-2.5 px-3.5 text-slate-500 text-[11px]">
                                        {rangeText}
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingAeRuleId(rule.id);
                                              setNewRuleYear(rule.gueltig_ab_jahr);
                                              setNewRuleHours(rule.soll_stunden);
                                              setIsAddingAeRule(true);
                                            }}
                                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                                            title="Regel bearbeiten"
                                          >
                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (window.confirm(`Soll die Regel ab ${rule.gueltig_ab_jahr} gelöscht werden?`)) {
                                                setAeRules(prev => prev.filter(r => r.id !== rule.id));
                                              }
                                            }}
                                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                                            title="Regel löschen"
                                          >
                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save/Discard Actions */}
                  <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-200/80">
                    {isTabDirty("arbeitseinsaetze") && (
                      <button
                        type="button"
                        onClick={() => handleDiscardTab("arbeitseinsaetze")}
                        className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all cursor-pointer"
                      >
                        {t("admin.arbeitseinsaetze.discard")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!isTabDirty("arbeitseinsaetze")}
                      onClick={() => handleSaveTab("arbeitseinsaetze")}
                      className={`h-10 px-6 rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                        isTabDirty("arbeitseinsaetze")
                          ? "bg-[var(--color-primary)] text-white hover:brightness-110"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      }`}
                    >
                      <i className="fa-solid fa-floppy-disk"></i> {t("admin.arbeitseinsaetze.save")}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: BUCHUNGS-REGELN */}
              {currentTab === "rules" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                    {/* Rule Limits Segment */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                          <span>{t("admin.rules.limitsTitle")}</span>
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.rules.limitsSubtitle")}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.rules.maxActiveBookings")}
                            </label>
                            <input 
                              type="number"
                              min="0"
                              value={reservationRules.maxActiveBookings}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setReservationRules({
                                  ...reservationRules,
                                  maxActiveBookings: isNaN(val) ? 0 : val,
                                });
                              }}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{t("admin.rules.unlimitedHint")}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.rules.maxBookingsPerDay")}
                            </label>
                            <input 
                              type="number"
                              min="0"
                              value={reservationRules.maxBookingsPerDay ?? 2}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setReservationRules({
                                  ...reservationRules,
                                  maxBookingsPerDay: isNaN(val) ? 0 : val,
                                });
                              }}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{t("admin.rules.unlimitedHint")}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.rules.maxBookingsPerWeek")}
                            </label>
                            <input 
                              type="number"
                              min="0"
                              value={reservationRules.maxBookingsPerWeek ?? 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setReservationRules({
                                  ...reservationRules,
                                  maxBookingsPerWeek: isNaN(val) ? 0 : val,
                                });
                              }}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{t("admin.rules.unlimitedHint")}</p>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.rules.cancellationDeadline")}
                            </label>
                            <input 
                              type="number"
                              min="0"
                              value={
                                reservationRules.cancellationDeadlineMinutes ?? 30
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setReservationRules({
                                  ...reservationRules,
                                  cancellationDeadlineMinutes: isNaN(val) ? 0 : val,
                                });
                              }}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{t("admin.rules.beforeMatchStart")}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.rules.advanceBookingWeeks")}
                            </label>
                            <input 
                              type="number"
                              min="0"
                              max="52"
                              value={reservationRules.maxAdvanceWeeks ?? 2}
                              onChange={(e) => {
                                const val = isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value);
                                setReservationRules({
                                  ...reservationRules,
                                  maxAdvanceWeeks: val,
                                  maxAdvanceDays: val * 7,
                                });
                              }}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">{t("admin.rules.unlimitedHint")}</p>
                          </div>
                        </div>
                        
                        <div className="pt-2 border-t border-slate-100 space-y-3">
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={reservationRules.bypassRestrictionsForLeagueGames ?? false}
                              onChange={(e) =>
                                setReservationRules({
                                  ...reservationRules,
                                  bypassRestrictionsForLeagueGames: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                {t("admin.rules.bypassForLeague")}
                              </span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {t("admin.rules.bypassForLeagueDesc")}
                              </p>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={reservationRules.allowPastBookings ?? true}
                              onChange={(e) =>
                                setReservationRules({
                                  ...reservationRules,
                                  allowPastBookings: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                {t("admin.rules.allowPastBookings")}
                              </span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {t("admin.rules.allowPastBookingsDesc")}
                              </p>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={reservationRules.requireCoplayer ?? false}
                              onChange={(e) =>
                                setReservationRules({
                                  ...reservationRules,
                                  requireCoplayer: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                {t("admin.rules.requireCoplayer")}
                              </span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {t("admin.rules.requireCoplayerDesc")}
                              </p>
                            </div>
                          </label>

                          <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={reservationRules.allowParticipantsToEdit ?? false}
                              onChange={(e) =>
                                setReservationRules({
                                  ...reservationRules,
                                  allowParticipantsToEdit: e.target.checked,
                                })
                              }
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                {t("admin.rules.allowParticipantsToEdit")}
                              </span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {t("admin.rules.allowParticipantsToEditDesc")}
                              </p>
                            </div>
                          </label>
                        </div>

                        {/* Opening Hours */}
                        <div className="pt-3 border-t border-slate-100">
                          <div className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3 flex items-center gap-1.5">
                            <i className="fa-solid fa-clock text-[var(--color-primary)]"></i> {t("admin.rules.openingHoursTitle")}
                          </div>
                          <div className="space-y-2 bg-slate-50/70 p-3 sm:p-4 rounded-xl border border-slate-200/80">
                            {[
                              { value: 1, label: t("admin.closures.weekdayMonday", "Montag") },
                              { value: 2, label: t("admin.closures.weekdayTuesday", "Dienstag") },
                              { value: 3, label: t("admin.closures.weekdayWednesday", "Mittwoch") },
                              { value: 4, label: t("admin.closures.weekdayThursday", "Donnerstag") },
                              { value: 5, label: t("admin.closures.weekdayFriday", "Freitag") },
                              { value: 6, label: t("admin.closures.weekdaySaturday", "Samstag") },
                              { value: 0, label: t("admin.closures.weekdaySunday", "Sonntag") },
                            ].map((day) => {
                              const key = String(day.value);
                              const dayConfig = reservationRules.openingHours?.[
                                key
                              ] || {
                                start: "08:00",
                                end: "21:00",
                                closed: false,
                              };
                              return (
                                <div
                                  key={key}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 last:border-b-0 last:pb-0"
                                >
                                  <span className="font-semibold text-xs text-slate-700 min-w-[90px]">
                                    {day.label}
                                  </span>
                                  <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={dayConfig.closed ?? false}
                                        onChange={(e) => {
                                          const updatedHours = {
                                            ...(reservationRules.openingHours ||
                                              {}),
                                          };
                                          updatedHours[key] = {
                                            ...dayConfig,
                                            closed: e.target.checked,
                                          };
                                          setReservationRules({
                                            ...reservationRules,
                                            openingHours: updatedHours,
                                          });
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                                      />
                                      <span className="text-xs font-medium text-slate-500">
                                        {t("admin.rules.closed")}
                                      </span>
                                    </label>
                                    {!dayConfig.closed && (
                                      <div className="flex items-center gap-1.5">
                                        <select 
                                          value={dayConfig.start || "08:00"}
                                          onChange={(e) => {
                                            const updatedHours = {
                                              ...(reservationRules.openingHours ||
                                                {}),
                                            };
                                            updatedHours[key] = {
                                              ...dayConfig,
                                              start: e.target.value,
                                            };
                                            setReservationRules({
                                              ...reservationRules,
                                              openingHours: updatedHours,
                                            });
                                          }}
                                          className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-700 outline-none font-normal"
                                        >
                                          {TIME_SLOTS.slice(0, -1).map((tSlot) => (
                                            <option key={tSlot} value={tSlot}>
                                              {tSlot} {t("admin.rules.oclock")}
                                            </option>
                                          ))}
                                        </select>
                                        <span className="text-slate-400 text-xs">
                                          {t("admin.rules.to")}
                                        </span>
                                        <select 
                                          value={dayConfig.end || "21:00"}
                                          onChange={(e) => {
                                            const updatedHours = {
                                              ...(reservationRules.openingHours ||
                                                {}),
                                            };
                                            updatedHours[key] = {
                                              ...dayConfig,
                                              end: e.target.value,
                                            };
                                            setReservationRules({
                                              ...reservationRules,
                                              openingHours: updatedHours,
                                            });
                                          }}
                                          className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-700 outline-none font-normal"
                                        >
                                          {TIME_SLOTS.slice(1).map((tSlot) => (
                                            <option key={tSlot} value={tSlot}>
                                              {tSlot} {t("admin.rules.oclock")}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Plätze & Ausrüstung */}
                    <div className="space-y-5 lg:space-y-6">
                      {/* Courts/Tennisplätze segments */}
                      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-list-ol text-[var(--color-primary)]"></i> {t("admin.rules.manageCourtsTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.rules.manageCourtsSubtitle")}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 bg-slate-50/70 p-3 sm:p-4 rounded-xl border border-slate-200/80">
                          {courtsList.map((c, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs"
                            >
                              <input 
                                type="text"
                                value={c}
                                onChange={(e) => {
                                  const updated = [...courtsList];
                                  updated[i] = e.target.value;
                                  setCourtsList(updated);
                                }}
                                className="text-xs font-semibold text-slate-800 flex-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 rounded px-2 py-1 transition-all"
                              />
                              <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
                                <button
                                  type="button"
                                  onClick={() => handleMoveCourt(i, "up")}
                                  disabled={i === 0}
                                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                  title={t("admin.rules.moveUp")}
                                >
                                  <i className="fa-solid fa-arrow-up"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveCourt(i, "down")}
                                  disabled={i === courtsList.length - 1}
                                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                  title={t("admin.rules.moveDown")}
                                >
                                  <i className="fa-solid fa-arrow-down"></i>
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCourt(i)}
                                className="w-7 h-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center cursor-pointer"
                                title={t("admin.rules.removeCourt")}
                              >
                                <i className="fa-solid fa-trash-can text-xs"></i>
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <input 
                            type="text"
                            value={newCourtName}
                            onChange={(e) => setNewCourtName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newCourtName.trim()) {
                                e.preventDefault();
                                handleAddCourt();
                              }
                            }}
                            placeholder={t("admin.rules.newCourtPlaceholder")}
                            className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={handleAddCourt}
                            disabled={!newCourtName.trim()}
                            className="h-10 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <i className="fa-solid fa-plus text-xs"></i> {t("admin.rules.addCourt")}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Geräte & Ausrüstung verwalten */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-boxes-stacked text-[var(--color-primary)]"></i> {t("admin.rules.manageEquipmentTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.rules.manageEquipmentSubtitle")}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 bg-slate-50/70 p-3 sm:p-4 rounded-xl border border-slate-200/80">
                          {equipmentList.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-2 text-center">
                              {t("admin.rules.noEquipmentYet")}
                            </p>
                          ) : (
                            equipmentList.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2.5 bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs"
                              >
                                <input 
                                  type="text"
                                  value={item}
                                  onChange={(e) => {
                                    const updated = [...equipmentList];
                                    updated[i] = e.target.value;
                                    setEquipmentList(updated);
                                  }}
                                  className="text-xs font-semibold text-slate-800 flex-1 bg-transparent border-none outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 rounded px-2 py-1 transition-all"
                                />
                                <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveEquipment(i, "up")}
                                    disabled={i === 0}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                    title={t("admin.rules.moveUp")}
                                  >
                                    <i className="fa-solid fa-arrow-up"></i>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveEquipment(i, "down")}
                                    disabled={i === equipmentList.length - 1}
                                    className="w-7 h-7 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-slate-600 transition-colors cursor-pointer text-xs"
                                    title={t("admin.rules.moveDown")}
                                  >
                                    <i className="fa-solid fa-arrow-down"></i>
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEquipment(i)}
                                  className="w-7 h-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center cursor-pointer"
                                  title={t("admin.rules.removeEquipment")}
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <input 
                            type="text"
                            value={newEquipmentName}
                            onChange={(e) => setNewEquipmentName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newEquipmentName.trim()) {
                                e.preventDefault();
                                handleAddEquipment();
                              }
                            }}
                            placeholder={t("admin.rules.newEquipmentPlaceholder")}
                            className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-sm text-slate-800 outline-none transition-all font-normal placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            onClick={handleAddEquipment}
                            disabled={!newEquipmentName.trim()}
                            className="h-10 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <i className="fa-solid fa-plus text-xs"></i> {t("admin.rules.addEquipment")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                  {modules.guests !== false && (
                    <div className="pt-2">
                      <GuestFeeSettingsEditor
                        feeSettings={feeSettings}
                        onChange={(newFeeSettings) => {
                          setFeeSettings(newFeeSettings);
                          if (newFeeSettings.fee_calculation_mode === "SIMPLE" && newFeeSettings.simple_config) {
                            const euro = newFeeSettings.simple_config.amount_cents / 100;
                            const bMode =
                              newFeeSettings.simple_config.rate_type === "PER_COURT_HOUR"
                                ? ("per_court" as const)
                                : ("per_player" as const);
                            setReservationRules((prev) => ({
                              ...prev,
                              guestFeePerHour: euro,
                              guestBillingMode: bMode,
                            }));
                            setGuestFeeString(euro.toFixed(2).replace(".", ","));
                          }
                        }}
                        onValidationChange={setIsFeeSettingsValid}
                      />
                    </div>
                  )}

                  {/* Tab Category Actions */}
                  <div className="border-t border-slate-200/80 pt-5 flex justify-end">
                    <button
                      type="button"
                      disabled={!isTabDirty("rules") || !isFeeSettingsValid}
                      onClick={() => handleSaveTab("rules")}
                      className={`h-10 px-6 rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                        isTabDirty("rules") && isFeeSettingsValid
                          ? "bg-[var(--color-primary)] text-white hover:brightness-110"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      }`}
                    >
                      <i className="fa-solid fa-floppy-disk"></i> {t("admin.rules.save")}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: SPERREN */}
              {currentTab === "sperren" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                      <i className="fa-solid fa-ban text-[var(--color-primary)]"></i> {t("admin.closures.title")}
                    </h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      {t("admin.closures.subtitle")}
                    </p>
                  </div>

                  <div className="flex flex-col gap-6 w-full">
                    {/* LISTING COLUMN */}
                    <div className="space-y-6 w-full">
                      {/* Category 1: Sperren & Öffnungszeiten */}
                      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                              <i className="fa-solid fa-ban text-rose-500"></i> {t("admin.closures.closuresHeading")}
                            </h4>
                            <p className="text-xs text-slate-500 font-normal mt-0.5">
                              {t("admin.closures.closuresDesc")}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLockId(null);
                              setEditingCalendarLock(null);
                              setNewLockTitle("");
                              setNewLockCourts([...(settings.courts || ["Platz 1", "Platz 2"])]);
                              setNewLockType("range");
                              setLockContext("lock");
                              openLockDrawer();
                            }}
                            className="h-9 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
                          >
                            <i className="fa-solid fa-plus text-xs"></i> {t("admin.closures.newClosure")}
                          </button>
                        </div>

                        {(
                          [
                            ...(settings.recurringLocks || [])
                              .filter((l) => !l.isEvent)
                              .map((l) => ({ ...l, _type: "recurring" })),
                            ...(settings.rangeLocks || [])
                              .filter((l) => !l.isEvent)
                              .map((l) => ({ ...l, _type: "range" })),
                            ...groupedCalendarLocks,
                          ] as any[]
                        ).length === 0 ? (
                          <div className="p-4 text-center text-xs font-normal text-slate-400 bg-slate-50/70 rounded-xl border border-slate-200/60">
                            {t("admin.closures.noClosures")}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Render Recurring Locks (not Events) */}
                            {(settings.recurringLocks || [])
                              .filter((l) => !l.isEvent)
                              .map((lock: RegularLock) => {
                                const weekdayLabel = [
                                  t("admin.closures.weekdaySun"),
                                  t("admin.closures.weekdayMon"),
                                  t("admin.closures.weekdayTue"),
                                  t("admin.closures.weekdayWed"),
                                  t("admin.closures.weekdayThu"),
                                  t("admin.closures.weekdayFri"),
                                  t("admin.closures.weekdaySat"),
                                ][lock.dayOfWeek];
                                return (
                                  <div
                                    key={lock.id}
                                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:border-slate-300 transition-colors"
                                  >
                                    <div>
                                      <h5 className="text-xs font-semibold text-slate-800">
                                        {lock.title}
                                      </h5>
                                      <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2 items-center">
                                        <span className="bg-slate-200/80 px-2 py-0.5 rounded-md text-slate-700 text-[10px] font-semibold">
                                          {weekdayLabel}
                                        </span>
                                        <span>
                                          <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                                          {lock.startTime} – {lock.endTime}
                                        </span>
                                        <span>
                                          <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                          {lock.courts.join(", ")}
                                        </span>
                                        {lock.isOngoing ? (
                                          <span className="text-slate-600">
                                            <i className="fa-solid fa-calendar-check mr-1 text-slate-400"></i>
                                            {t("admin.closures.permanent")}
                                          </span>
                                        ) : (
                                          <span className="text-slate-600">
                                            <i className="fa-solid fa-calendar-days mr-1 text-slate-400"></i>
                                            {lock.startDate
                                              ? `${new Date(lock.startDate).toLocaleDateString("de-DE")} ${t("admin.closures.to")} ${lock.endDate ? new Date(lock.endDate).toLocaleDateString("de-DE") : ""}`
                                              : ""}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t sm:border-0 border-slate-200 sm:pt-0 pt-2.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditRecurring(lock, "lock")
                                        }
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.edit")}
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteRecurringLock(lock.id, false)
                                        }
                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.delete")}
                                      >
                                        <i className="fa-solid fa-trash-can"></i>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                            {/* Render Range Locks (not Events) */}
                            {(settings.rangeLocks || [])
                              .filter((l) => !l.isEvent)
                              .map((lock: RangeLock) => {
                                const start = new Date(
                                  lock.startDate,
                                ).toLocaleDateString("de-DE");
                                const end = new Date(
                                  lock.endDate,
                                ).toLocaleDateString("de-DE");
                                return (
                                  <div
                                    key={lock.id}
                                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:border-slate-300 transition-colors"
                                  >
                                    <div>
                                      <h5 className="text-xs font-semibold text-rose-800 flex items-center gap-1.5">
                                        <i className="fa-solid fa-snowflake text-rose-500"></i>
                                        {lock.title}
                                      </h5>
                                      <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2.5 items-center">
                                        <span>
                                          <i className="fa-regular fa-calendar-days mr-1 text-slate-400"></i>
                                          {start} {t("admin.closures.to")} {end}
                                        </span>
                                        <span>
                                          <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                          {lock.courts.join(", ")}
                                        </span>
                                        <span className="text-rose-600 font-semibold text-[10px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200/60">
                                          {t("admin.closures.allDayBlocked")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t border-slate-200 sm:border-0 sm:pt-0 pt-2.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditRange(lock, "lock")
                                        }
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.edit")}
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteRangeLock(lock.id, false)
                                        }
                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.delete")}
                                      >
                                        <i className="fa-solid fa-trash-can"></i>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                            {/* Render Calendar Locks (not Events) */}
                            {groupedCalendarLocks.map((lock: GroupedCalendarLock) => {
                              const dateFmt = new Date(
                                lock.date,
                              ).toLocaleDateString("de-DE", {
                                weekday: "short",
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              });
                              const allCourtsList = settings.courts || ["Platz 1", "Platz 2"];
                              const isAllCourts =
                                allCourtsList.length > 0 &&
                                lock.courts.length >= allCourtsList.length &&
                                allCourtsList.every((c) => lock.courts.includes(c));
                              const courtsDisplay = isAllCourts
                                ? t("dashboard.allCourts", "Alle Plätze")
                                : lock.courts.map(translateCourt).join(", ");
                              const timeDisplay =
                                lock.startTime !== lock.endTime
                                  ? `${lock.startTime} – ${lock.endTime}`
                                  : lock.startTime;

                              return (
                                <div
                                  key={lock.id}
                                  className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-100 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:bg-rose-50 transition-colors"
                                >
                                  <div>
                                    <h5 className="text-xs font-semibold text-rose-800">
                                      {lock.reason || t("admin.closures.defaultReason")}
                                    </h5>
                                    <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2.5 items-center">
                                      <span>
                                        <i className="fa-regular fa-calendar mr-1 text-slate-400"></i>
                                        {dateFmt}
                                      </span>
                                      <span>
                                        <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                                        {timeDisplay}
                                      </span>
                                      <span>
                                        <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                        {courtsDisplay}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t border-rose-100 sm:border-0 sm:pt-0 pt-2.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartEditCalendarLock(lock, "lock")
                                      }
                                      className="w-8 h-8 rounded-lg bg-white border border-rose-200 text-slate-600 hover:bg-rose-100 flex items-center justify-center transition-colors text-xs cursor-pointer shadow-2xs"
                                      title={t("admin.closures.edit")}
                                    >
                                      <i className="fa-solid fa-pen"></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteCalendarLock(lock.bookingIds, false)
                                      }
                                      className="w-8 h-8 rounded-lg bg-red-100/70 text-red-600 hover:bg-red-200 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                      title={t("admin.closures.delete")}
                                    >
                                      <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Category 2: Regelmäßige Serientermine */}
                      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                              <i className="fa-solid fa-calendar-check text-[var(--color-primary)]"></i> {t("admin.closures.recurringEventsHeading")}
                            </h4>
                            <p className="text-xs text-slate-500 font-normal mt-0.5">
                              {t("admin.closures.recurringEventsDesc")}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLockId(null);
                              setEditingCalendarLock(null);
                              setNewLockTitle("");
                              setNewLockCourts([...(settings.courts || ["Platz 1", "Platz 2"])]);
                              setNewLockType("regular");
                              setLockContext("event");
                              openLockDrawer();
                            }}
                            className="h-9 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
                          >
                            <i className="fa-solid fa-plus text-xs"></i> {t("admin.closures.newRecurringEvent")}
                          </button>
                        </div>

                        {(
                          [
                            ...(settings.recurringLocks || [])
                              .filter((l) => l.isEvent)
                              .map((l) => ({ ...l, _type: "recurring" })),
                            ...(settings.rangeLocks || [])
                              .filter((l) => l.isEvent)
                              .map((l) => ({ ...l, _type: "range" })),
                            ...groupedCalendarEvents,
                          ] as any[]
                        ).length === 0 ? (
                          <div className="p-4 text-center text-xs font-normal text-slate-400 bg-slate-50/70 rounded-xl border border-slate-200/60">
                            {t("admin.closures.noRecurringEvents")}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Render Recurring Locks (Events) */}
                            {(settings.recurringLocks || [])
                              .filter((l) => l.isEvent)
                              .map((lock: RegularLock) => {
                                const weekdayLabel = [
                                  t("admin.closures.weekdaySun"),
                                  t("admin.closures.weekdayMon"),
                                  t("admin.closures.weekdayTue"),
                                  t("admin.closures.weekdayWed"),
                                  t("admin.closures.weekdayThu"),
                                  t("admin.closures.weekdayFri"),
                                  t("admin.closures.weekdaySat"),
                                ][lock.dayOfWeek];
                                return (
                                  <div
                                    key={lock.id}
                                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:border-slate-300 transition-colors"
                                  >
                                    <div>
                                      <h5 className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                                        {lock.color && (
                                          <span
                                            className="w-2.5 h-2.5 rounded-full inline-block border border-black/10 shrink-0"
                                            style={{ backgroundColor: lock.color }}
                                          />
                                        )}
                                        <span>{lock.title}</span>
                                      </h5>
                                      <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2 items-center">
                                        <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                                          {weekdayLabel}
                                        </span>
                                        <span>
                                          <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                                          {lock.startTime} – {lock.endTime}
                                        </span>
                                        <span>
                                          <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                          {lock.courts.join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t border-slate-200 sm:border-0 sm:pt-0 pt-2.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditRecurring(lock, "event")
                                        }
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.edit")}
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteRecurringLock(lock.id, true)
                                        }
                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.delete")}
                                      >
                                        <i className="fa-solid fa-trash-can"></i>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                            {/* Render Range Locks (Events) */}
                            {(settings.rangeLocks || [])
                              .filter((l) => l.isEvent)
                              .map((lock: RangeLock) => {
                                const start = new Date(
                                  lock.startDate,
                                ).toLocaleDateString("de-DE");
                                const end = new Date(
                                  lock.endDate,
                                ).toLocaleDateString("de-DE");
                                return (
                                  <div
                                    key={lock.id}
                                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:border-slate-300 transition-colors"
                                  >
                                    <div>
                                      <h5 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                        <i className="fa-solid fa-calendar-week text-[var(--color-primary)]"></i>
                                        {lock.title}
                                      </h5>
                                      <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2.5 items-center">
                                        <span>
                                          <i className="fa-regular fa-calendar-days mr-1 text-slate-400"></i>
                                          {start} {t("admin.closures.to")} {end}
                                        </span>
                                        <span>
                                          <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                          {lock.courts.join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t border-slate-200 sm:border-0 sm:pt-0 pt-2.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditRange(lock, "event")
                                        }
                                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.edit")}
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteRangeLock(lock.id, true)
                                        }
                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                        title={t("admin.closures.delete")}
                                      >
                                        <i className="fa-solid fa-trash-can"></i>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}

                            {/* Render Calendar Locks (Events) */}
                            {groupedCalendarEvents.map((lock: GroupedCalendarLock) => {
                              const dateFmt = new Date(
                                lock.date,
                              ).toLocaleDateString("de-DE", {
                                weekday: "short",
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              });
                              const allCourtsList = settings.courts || ["Platz 1", "Platz 2"];
                              const isAllCourts =
                                allCourtsList.length > 0 &&
                                lock.courts.length >= allCourtsList.length &&
                                allCourtsList.every((c) => lock.courts.includes(c));
                              const courtsDisplay = isAllCourts
                                ? t("dashboard.allCourts", "Alle Plätze")
                                : lock.courts.map(translateCourt).join(", ");
                              const timeDisplay =
                                lock.startTime !== lock.endTime
                                  ? `${lock.startTime} – ${lock.endTime}`
                                  : lock.startTime;

                              return (
                                <div
                                  key={lock.id}
                                  className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center hover:border-slate-300 transition-colors"
                                >
                                  <div>
                                    <h5 className="text-xs font-semibold text-slate-800">
                                      {lock.reason || t("admin.closures.defaultReason")}
                                    </h5>
                                    <div className="text-[11px] text-slate-500 font-normal mt-1 flex flex-wrap gap-2.5 items-center">
                                      <span>
                                        <i className="fa-regular fa-calendar mr-1 text-slate-400"></i>
                                        {dateFmt}
                                      </span>
                                      <span>
                                        <i className="fa-regular fa-clock mr-1 text-slate-400"></i>
                                        {timeDisplay}
                                      </span>
                                      <span>
                                        <i className="fa-solid fa-circle-nodes mr-1 text-slate-400"></i>
                                        {courtsDisplay}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto justify-end border-t border-slate-200 sm:border-0 sm:pt-0 pt-2.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartEditCalendarLock(lock, "event")
                                      }
                                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors text-xs cursor-pointer shadow-2xs"
                                      title={t("admin.closures.edit")}
                                    >
                                      <i className="fa-solid fa-pen"></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteCalendarLock(lock.bookingIds, true)
                                      }
                                      className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors text-xs cursor-pointer"
                                      title={t("admin.closures.delete")}
                                    >
                                      <i className="fa-solid fa-trash-can"></i>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* LOCK FORM DRAWER */}
                  {isLockDrawerOpen && createPortal(
                    <div
                      className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/60 backdrop-blur-[2px] transition-opacity"
                      onClick={handleCancelLockEdit}
                      onWheel={(e) => {
                        if (e.target === e.currentTarget) {
                          e.preventDefault();
                        }
                      }}
                      style={{
                        opacity: !isLockDrawerAnimatingIn || isLockDrawerClosing ? 0 : 1,
                        transitionDuration: isLockDrawerClosing ? "200ms" : "250ms",
                        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                        pointerEvents: isLockDrawerClosing ? "none" : "auto",
                      }}
                    >
                      {/* Drawer Panel */}
                      <div
                        className="w-[450px] max-w-[100vw] h-[100vh] bg-white shadow-2xl flex flex-col transform transition-transform pointer-events-auto overscroll-contain z-10"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          transform:
                            !isLockDrawerAnimatingIn || isLockDrawerClosing
                              ? "translateX(100%)"
                              : "translateX(0)",
                          transitionDuration: isLockDrawerClosing ? "200ms" : "250ms",
                          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                      >
                        {/* Drawer Header (Matching Court Booking Drawer style) */}
                        <div className="bg-[var(--color-primary)] p-4 px-5 text-white flex justify-between items-start relative shrink-0 shadow-md overflow-hidden">
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
                            <h3 className="text-xl font-bold uppercase tracking-tight leading-none mb-1 text-white">
                              {editingLockId
                                ? lockContext === "event"
                                  ? t("admin.closures.editRecurring", "Serientermin bearbeiten")
                                  : t("admin.closures.editClosure", "Sperre bearbeiten")
                                : lockContext === "event"
                                  ? t("admin.closures.newRecurringEvent", "Neuer Serientermin")
                                  : t("admin.closures.newClosure", "Neue Sperre")}
                            </h3>
                            <p className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
                              <i className={`fa-solid ${lockContext === "event" ? "fa-calendar-week" : "fa-ban"} opacity-75`}></i>
                              {lockContext === "event"
                                ? t("admin.closures.drawerEventSubtitle", "Termindetails und Zeiten für Serientermine")
                                : t("admin.closures.drawerClosureSubtitle", "Zeitraum und Plätze für die Sperre")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={handleCancelLockEdit}
                            className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0 relative z-10 text-sm font-medium cursor-pointer"
                          >
                            <i className="fa-solid fa-xmark text-base"></i>
                          </button>
                        </div>

                        {/* Lock Type Mode Switcher (Sticky segmented bar, matching booking drawer) */}
                        {!editingLockId && (
                          <div className="px-5 py-3.5 border-b-2 border-slate-200 bg-slate-50 shrink-0 shadow-[0_4px_15px_-5px_rgba(0,0,0,0.05)] z-10">
                            <div className="relative flex p-1 bg-slate-200 rounded-xl border border-slate-300 select-none shadow-sm">
                              <div
                                className="absolute top-1 bottom-1 rounded-lg shadow-sm transition-all duration-300 ease-out z-0 bg-white"
                                style={{
                                  width: "calc(50% - 4px)",
                                  left: newLockType === "range" ? "2px" : "calc(50% + 2px)",
                                  backgroundColor: settings?.primaryColor || "var(--color-primary)",
                                }}
                              ></div>
                              <button
                                type="button"
                                onClick={() => setNewLockType("range")}
                                className={`relative z-10 flex-1 py-1.5 rounded-lg transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 font-bold ${
                                  newLockType === "range"
                                    ? "text-white font-medium"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                <i className="fa-solid fa-calendar-day text-[11px]"></i>
                                {t("admin.closures.singleRange", "Einmaliger Zeitraum")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewLockType("regular")}
                                className={`relative z-10 flex-1 py-1.5 rounded-lg transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 font-bold ${
                                  newLockType === "regular"
                                    ? "text-white font-medium"
                                    : "text-slate-500 hover:text-slate-800"
                                }`}
                              >
                                <i className="fa-solid fa-arrows-rotate text-[11px]"></i>
                                {t("admin.closures.weeklySeries", "Wöchentliche Serie")}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Body / Scrollable Form */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50" style={{ isolation: "isolate" }}>
                          {/* Title / Description */}
                          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1.5">
                            <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                              <i className="fa-solid fa-pen text-slate-400 text-[10px]"></i>
                              {t("admin.closures.titleLabel", "Bezeichnung / Titel")}
                            </label>
                            <input 
                              type="text"
                              value={newLockTitle}
                              onChange={(e) => setNewLockTitle(e.target.value)}
                              placeholder={
                                lockContext === "event"
                                  ? t("admin.closures.placeholderEvent", "z. B. Freitagsdoppel, Mannschaftstraining...")
                                  : t("admin.closures.placeholderLock", "z. B. Platzpflege, Turnier, Regen...")
                              }
                              className="w-full h-9 px-3 border-2 border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium placeholder:text-slate-400 placeholder:font-normal"
                            />
                          </div>

                          {/* Farbe (Hex-Code, optional for recurring events) */}
                          {lockContext === "event" && newLockType === "regular" && (
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-1.5">
                              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <i className="fa-solid fa-palette text-slate-400 text-[10px]"></i>
                                {t("admin.closures.colorOptional", "Farbe (Hex-Code, optional)")}
                              </label>
                              <div className="flex gap-2 items-center">
                                <input 
                                  type="text"
                                  value={newLockColor}
                                  onChange={(e) => setNewLockColor(e.target.value)}
                                  placeholder={settings.primaryColor || "#1b4332"}
                                  className="flex-1 h-9 px-3 border-2 border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium placeholder:text-slate-400 uppercase"
                                />
                                <div className="relative flex items-center justify-center w-9 h-9 border-2 border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-slate-400 bg-white shadow-2xs shrink-0">
                                  <input
                                    type="color"
                                    value={newLockColor && /^#[0-9A-F]{6}$/i.test(newLockColor) ? newLockColor : (settings.primaryColor || "#1b4332")}
                                    onChange={(e) => setNewLockColor(e.target.value.toLowerCase())}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div 
                                    className="w-6 h-6 rounded-lg shadow-inner border border-black/10"
                                    style={{ backgroundColor: newLockColor || settings.primaryColor || "#1b4332" }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Affected Courts */}
                          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                {t("admin.closures.affectedCourts", "Betroffene Plätze")}
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  const all = settings.courts || [
                                    "Platz 1",
                                    "Platz 2",
                                  ];
                                  if (newLockCourts.length === all.length) {
                                    setNewLockCourts([]);
                                  } else {
                                    setNewLockCourts([...all]);
                                  }
                                }}
                                className="text-[10px] font-bold text-[var(--color-primary)] hover:underline cursor-pointer"
                              >
                                {newLockCourts.length === (settings.courts || []).length
                                  ? t("common.deselectAll", "Alle abwählen")
                                  : t("dashboard.allCourts", "Alle Plätze")}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {(
                                settings.courts || [
                                  "Platz 1",
                                  "Platz 2",
                                  "Platz 3",
                                  "Platz 4",
                                ]
                              ).map((court) => {
                                const isSel = newLockCourts.includes(court);
                                return (
                                  <button
                                    key={court}
                                    type="button"
                                    onClick={() => {
                                      if (isSel) {
                                        setNewLockCourts(
                                          newLockCourts.filter(
                                            (c) => c !== court,
                                          ),
                                        );
                                      } else {
                                        setNewLockCourts([
                                          ...newLockCourts,
                                          court,
                                        ]);
                                      }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                                      isSel
                                        ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs"
                                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                    }`}
                                  >
                                    <i className={`fa-solid ${isSel ? "fa-circle-check" : "fa-circle text-slate-300"} text-[10px]`}></i>
                                    {court}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Type specific fields */}
                          {newLockType === "regular" ? (
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
                              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                                <i className="fa-solid fa-circle-info text-[var(--color-primary)] text-sm shrink-0 mt-0.5"></i>
                                <span>
                                  {lockContext === "event"
                                    ? t("admin.closures.recurringEventHelp", "Wiederkehrende Termine werden wöchentlich für den gewählten Wochentag im Kalender als Serientermin eingetragen.")
                                    : t("admin.closures.recurringHelp", "Wiederkehrende Termine werden wöchentlich für den gewählten Wochentag im Kalender geblockt.")}
                                </span>
                              </div>
                              
                              {/* Wochentag */}
                              <div>
                                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                  <i className="fa-solid fa-calendar-day text-slate-400 text-[10px]"></i>
                                  {t("admin.closures.weekday", "Wochentag")}
                                </label>
                                <div className="relative">
                                  <select 
                                    value={newLockDay}
                                    onChange={(e) =>
                                      setNewLockDay(parseInt(e.target.value))
                                    }
                                    className="w-full h-9 px-3 pr-8 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all appearance-none cursor-pointer font-sans font-medium"
                                  >
                                    <option value={1}>{t("admin.closures.weekdayMon")}</option>
                                    <option value={2}>{t("admin.closures.weekdayTue")}</option>
                                    <option value={3}>{t("admin.closures.weekdayWed")}</option>
                                    <option value={4}>{t("admin.closures.weekdayThu")}</option>
                                    <option value={5}>{t("admin.closures.weekdayFri")}</option>
                                    <option value={6}>{t("admin.closures.weekdaySat")}</option>
                                    <option value={0}>{t("admin.closures.weekdaySun")}</option>
                                  </select>
                                  <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                              </div>

                              {/* Uhrzeiten */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.fromTime", "Von")}
                                  </label>
                                  <div className="relative">
                                    <select 
                                      value={newLockStartTime}
                                      onChange={(e) => {
                                        setNewLockStartTime(e.target.value);
                                        const idx = TIME_SLOTS.indexOf(
                                          e.target.value,
                                        );
                                        if (
                                          TIME_SLOTS.indexOf(newLockEndTime) <=
                                          idx
                                        ) {
                                          setNewLockEndTime(
                                            TIME_SLOTS[idx + 1] || e.target.value,
                                          );
                                        }
                                      }}
                                      className="w-full h-9 px-3 pr-8 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all appearance-none cursor-pointer font-sans font-medium"
                                    >
                                      {TIME_SLOTS.slice(0, -1).map((h) => (
                                        <option key={h} value={h}>
                                          {h} {t("admin.rules.oclock")}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.toTime", "Bis")}
                                  </label>
                                  <div className="relative">
                                    <select 
                                      value={newLockEndTime}
                                      onChange={(e) =>
                                        setNewLockEndTime(e.target.value)
                                      }
                                      className="w-full h-9 px-3 pr-8 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all appearance-none cursor-pointer font-sans font-medium"
                                    >
                                      {TIME_SLOTS.slice(
                                        TIME_SLOTS.indexOf(newLockStartTime) + 1,
                                      ).map((h) => (
                                        <option key={h} value={h}>
                                          {h} {t("admin.rules.oclock")}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                  </div>
                                </div>
                              </div>

                              {/* Dauerhaft oder Datum */}
                              <div className="pt-2 border-t border-slate-100 space-y-3">
                                <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={newLockIsOngoing}
                                    onChange={(e) =>
                                      setNewLockIsOngoing(e.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                                  />
                                  <span className="text-xs font-bold text-slate-700">
                                    {t("admin.closures.permanentCheckbox", "Dauerhaft (Unbegrenzt)")}
                                  </span>
                                </label>

                                {!newLockIsOngoing && (
                                  <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div>
                                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                                        {t("admin.closures.validFrom", "Gültig ab")}
                                      </label>
                                      <input 
                                        type="date"
                                        value={newLockStartDate}
                                        onChange={(e) =>
                                          setNewLockStartDate(e.target.value)
                                        }
                                        className="w-full h-9 px-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                                        {t("admin.closures.validTo", "Gültig bis")}
                                      </label>
                                      <input 
                                        type="date"
                                        value={newLockEndDate}
                                        onChange={(e) =>
                                          setNewLockEndDate(e.target.value)
                                        }
                                        className="w-full h-9 px-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
                              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                                <i className="fa-solid fa-circle-info text-[var(--color-primary)] text-sm shrink-0 mt-0.5"></i>
                                <span>{t("admin.closures.rangeHelp", "Sperrt die ausgewählten Plätze im angegebenen Zeitraum durchgehend oder zu bestimmten Uhrzeiten.")}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-calendar text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.startDate", "Start-Datum")}
                                  </label>
                                  <input 
                                    type="date"
                                    value={newRangeStartDate}
                                    onChange={(e) =>
                                      setNewRangeStartDate(e.target.value)
                                    }
                                    className="w-full h-9 px-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-calendar text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.endDate", "End-Datum")}
                                  </label>
                                  <input 
                                    type="date"
                                    value={newRangeEndDate}
                                    onChange={(e) =>
                                      setNewRangeEndDate(e.target.value)
                                    }
                                    className="w-full h-9 px-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all font-sans font-medium"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.fromTimeDetailed", "Von (Uhrzeit)")}
                                  </label>
                                  <div className="relative">
                                    <select 
                                      value={newRangeStartTime}
                                      onChange={(e) =>
                                        setNewRangeStartTime(e.target.value)
                                      }
                                      className="w-full h-9 px-3 pr-8 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all appearance-none cursor-pointer font-sans font-medium"
                                    >
                                      {TIME_SLOTS.map((slot) => (
                                        <option key={slot} value={slot}>
                                          {slot} {t("admin.rules.oclock")}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-slate-400 text-[10px]"></i>
                                    {t("admin.closures.toTimeDetailed", "Bis (Uhrzeit)")}
                                  </label>
                                  <div className="relative">
                                    <select 
                                      value={newRangeEndTime}
                                      onChange={(e) =>
                                        setNewRangeEndTime(e.target.value)
                                      }
                                      className="w-full h-9 px-3 pr-8 border-2 border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white text-slate-800 outline-none focus:border-[var(--color-primary)] transition-all appearance-none cursor-pointer font-sans font-medium"
                                    >
                                      {TIME_SLOTS.map((slot) => (
                                        <option key={slot} value={slot}>
                                          {slot} {t("admin.rules.oclock")}
                                        </option>
                                      ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer / Buttons */}
                        <div className="p-4 sm:p-5 border-t border-slate-200 bg-white shrink-0 shadow-[0_-4px_15px_-5px_rgba(0,0,0,0.05)]">
                          {editingLockId ? (
                            <button
                              type="button"
                              onClick={handleSaveLockEdit}
                              className="w-full h-11 bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <i className="fa-solid fa-floppy-disk text-xs"></i>{" "}
                              {lockContext === "event"
                                ? t("admin.closures.saveEvent", "Serientermin speichern")
                                : t("admin.closures.saveClosure", "Sperre speichern")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleAddLock}
                              className="w-full h-11 bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <i className="fa-solid fa-plus text-xs"></i>{" "}
                              {lockContext === "event" ? t("admin.closures.saveEvent") : t("admin.closures.saveClosure")}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
              )}

              {/* TAB 3: LAYOUT & NEWS */}
              {currentTab === "layout" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                    {/* Branding configuration fields */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-palette text-[var(--color-primary)]"></i> {t("admin.layout.appearanceTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.layout.appearanceSubtitle")}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                              {t("admin.layout.colorsHeading")}
                            </span>
                            <label className="cursor-pointer select-none inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)] font-normal"
                                checked={!isCustomColors}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setIsCustomColors(false);
                                    setPrimaryColor(
                                      DEFAULT_SETTINGS.primaryColor,
                                    );
                                    setAccentColor(
                                      DEFAULT_SETTINGS.accentColor || "#c04d2b",
                                    );
                                    setAccentColor2(
                                      DEFAULT_SETTINGS.accentColor2 ||
                                        "#0f172a",
                                    );
                                    setAccentColor3(
                                      DEFAULT_SETTINGS.accentColor3 ||
                                        "#ccff00",
                                    );
                                  } else {
                                    setIsCustomColors(true);
                                  }
                                }}
                              />
                              <span className="text-xs font-medium text-slate-600">
                                {t("admin.layout.useDefault")}
                              </span>
                            </label>
                          </div>

                          <div
                            className={`space-y-3.5 transition-opacity ${!isCustomColors ? "opacity-50 pointer-events-none" : ""}`}
                          >
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.layout.primaryColor")}
                              </label>
                              <div className="flex gap-2.5">
                                <div className="relative flex items-center justify-center w-10 h-10 border border-slate-200 rounded-xl overflow-hidden cursor-pointer bg-white shrink-0 shadow-2xs">
                                  <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) =>
                                      setPrimaryColor(e.target.value)
                                    }
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div 
                                    className="w-6 h-6 rounded-lg shadow-inner border border-black/10"
                                    style={{ backgroundColor: primaryColor }}
                                  />
                                </div>
                                <input 
                                  type="text"
                                  value={primaryColor}
                                  onChange={(e) =>
                                    setPrimaryColor(e.target.value)
                                  }
                                  className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all uppercase text-sm font-normal text-slate-800"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.layout.accentColor")}
                              </label>
                              <div className="flex gap-2.5">
                                <div className="relative flex items-center justify-center w-10 h-10 border border-slate-200 rounded-xl overflow-hidden cursor-pointer bg-white shrink-0 shadow-2xs">
                                  <input
                                    type="color"
                                    value={accentColor}
                                    onChange={(e) =>
                                      setAccentColor(e.target.value)
                                    }
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div 
                                    className="w-6 h-6 rounded-lg shadow-inner border border-black/10"
                                    style={{ backgroundColor: accentColor }}
                                  />
                                </div>
                                <input 
                                  type="text"
                                  value={accentColor}
                                  onChange={(e) =>
                                    setAccentColor(e.target.value)
                                  }
                                  className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all uppercase text-sm font-normal text-slate-800"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.layout.accentColor2")}
                              </label>
                              <div className="flex gap-2.5">
                                <div className="relative flex items-center justify-center w-10 h-10 border border-slate-200 rounded-xl overflow-hidden cursor-pointer bg-white shrink-0 shadow-2xs">
                                  <input
                                    type="color"
                                    value={accentColor2}
                                    onChange={(e) =>
                                      setAccentColor2(e.target.value)
                                    }
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div 
                                    className="w-6 h-6 rounded-lg shadow-inner border border-black/10"
                                    style={{ backgroundColor: accentColor2 }}
                                  />
                                </div>
                                <input 
                                  type="text"
                                  value={accentColor2}
                                  onChange={(e) =>
                                    setAccentColor2(e.target.value)
                                  }
                                  className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all uppercase text-sm font-normal text-slate-800"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.layout.accentColor3")}
                              </label>
                              <div className="flex gap-2.5">
                                <div className="relative flex items-center justify-center w-10 h-10 border border-slate-200 rounded-xl overflow-hidden cursor-pointer bg-white shrink-0 shadow-2xs">
                                  <input
                                    type="color"
                                    value={accentColor3}
                                    onChange={(e) =>
                                      setAccentColor3(e.target.value)
                                    }
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div 
                                    className="w-6 h-6 rounded-lg shadow-inner border border-black/10"
                                    style={{ backgroundColor: accentColor3 }}
                                  />
                                </div>
                                <input 
                                  type="text"
                                  value={accentColor3}
                                  onChange={(e) =>
                                    setAccentColor3(e.target.value)
                                  }
                                  className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all uppercase text-sm font-normal text-slate-800"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          {/* Logo Anmelde- und Ladebildschirm */}
                          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                                {t("admin.layout.logoLogin")}
                              </label>
                              <label className="cursor-pointer select-none inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)] font-normal"
                                  checked={logoUrl === DEFAULT_SETTINGS.logoUrl}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setLogoUrl(DEFAULT_SETTINGS.logoUrl);
                                    } else {
                                      if (
                                        !customLogoUrl ||
                                        customLogoUrl ===
                                          DEFAULT_SETTINGS.logoUrl
                                      ) {
                                        setLogoUrl("");
                                        setCustomLogoUrl("");
                                      } else {
                                        setLogoUrl(customLogoUrl);
                                      }
                                    }
                                  }}
                                />
                                <span className="text-xs font-medium text-slate-600">
                                  {t("admin.layout.useDefault")}
                                </span>
                              </label>
                            </div>

                            <div
                              className={`transition-opacity ${logoUrl === DEFAULT_SETTINGS.logoUrl ? "opacity-50 pointer-events-none" : ""}`}
                            >
                              {!customLogoUrl ? (
                                <div className="flex gap-2">
                                  <input 
                                    type="text"
                                    value={customLogoUrl}
                                    onChange={(e) => {
                                      setLogoUrl(e.target.value);
                                      setCustomLogoUrl(e.target.value);
                                    }}
                                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-normal text-slate-800 placeholder:text-slate-400"
                                    placeholder="https://example.com/logo.png"
                                  />
                                  <label className="bg-white border border-slate-200 hover:bg-slate-50 rounded-xl px-4 flex items-center justify-center cursor-pointer transition-colors h-10 shrink-0 shadow-2xs">
                                    {uploadingImage.logo ? (
                                      <i className="fa-solid fa-spinner fa-spin text-sm text-[var(--color-primary)]"></i>
                                    ) : (
                                      <i className="fa-solid fa-cloud-arrow-up text-sm text-slate-600"></i>
                                    )}
                                    <input 
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handleImageUpload(e, "logo")
                                      }
                                      disabled={uploadingImage.logo}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="relative group w-24 h-24 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center shadow-2xs">
                                  <img
                                    src={customLogoUrl}
                                    alt="Logo"
                                    className="w-full h-full object-contain p-2"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                                    <label className="bg-white text-slate-800 px-2.5 py-1 rounded-lg font-semibold text-xs cursor-pointer hover:bg-slate-100 shadow-xs">
                                      <i className="fa-solid fa-upload mr-1"></i> {t("admin.layout.changeImage")}
                                      <input 
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) =>
                                          handleImageUpload(e, "logo")
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLogoUrl("");
                                        setCustomLogoUrl("");
                                      }}
                                      className="text-white text-[10px] font-medium hover:underline cursor-pointer"
                                    >
                                      URL
                                    </button>
                                  </div>
                                  {uploadingImage.logo && (
                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                      <i className="fa-solid fa-spinner fa-spin text-xl text-[var(--color-primary)]"></i>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Logo Kopfzeile */}
                          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                                {t("admin.layout.logoHeader")}
                              </label>
                              <label className="cursor-pointer select-none inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)] font-normal"
                                  checked={
                                    headerLogoUrl ===
                                    (DEFAULT_SETTINGS.headerLogoUrl ||
                                      DEFAULT_SETTINGS.logoUrl)
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setHeaderLogoUrl(
                                        DEFAULT_SETTINGS.headerLogoUrl ||
                                          DEFAULT_SETTINGS.logoUrl,
                                      );
                                    } else {
                                      const defHdr =
                                        DEFAULT_SETTINGS.headerLogoUrl ||
                                        DEFAULT_SETTINGS.logoUrl;
                                      if (
                                        !customHeaderLogoUrl ||
                                        customHeaderLogoUrl === defHdr
                                      ) {
                                        setHeaderLogoUrl("");
                                        setCustomHeaderLogoUrl("");
                                      } else {
                                        setHeaderLogoUrl(customHeaderLogoUrl);
                                      }
                                    }
                                  }}
                                />
                                <span className="text-xs font-medium text-slate-600">
                                  {t("admin.layout.useDefault")}
                                </span>
                              </label>
                            </div>

                            <div
                              className={`transition-opacity ${headerLogoUrl === (DEFAULT_SETTINGS.headerLogoUrl || DEFAULT_SETTINGS.logoUrl) ? "opacity-50 pointer-events-none" : ""}`}
                            >
                              {!customHeaderLogoUrl ? (
                                <div className="flex gap-2">
                                  <input 
                                    type="text"
                                    value={customHeaderLogoUrl}
                                    onChange={(e) => {
                                      setHeaderLogoUrl(e.target.value);
                                      setCustomHeaderLogoUrl(e.target.value);
                                    }}
                                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-normal text-slate-800 placeholder:text-slate-400"
                                    placeholder="https://example.com/header-logo.png"
                                  />
                                  <label className="bg-white border border-slate-200 hover:bg-slate-50 rounded-xl px-4 flex items-center justify-center cursor-pointer transition-colors h-10 shrink-0 shadow-2xs">
                                    {uploadingImage.headerLogo ? (
                                      <i className="fa-solid fa-spinner fa-spin text-sm text-[var(--color-primary)]"></i>
                                    ) : (
                                      <i className="fa-solid fa-cloud-arrow-up text-sm text-slate-600"></i>
                                    )}
                                    <input 
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handleImageUpload(e, "headerLogo")
                                      }
                                      disabled={uploadingImage.headerLogo}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="relative group w-24 h-24 rounded-xl border border-slate-200 overflow-hidden bg-white flex items-center justify-center shadow-2xs">
                                  <img
                                    src={customHeaderLogoUrl}
                                    alt="Header Logo"
                                    className="w-full h-full object-contain p-2 drop-shadow-xs"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                                    <label className="bg-white text-slate-800 px-2.5 py-1 rounded-lg font-semibold text-xs cursor-pointer hover:bg-slate-100 shadow-xs">
                                      <i className="fa-solid fa-upload mr-1"></i> {t("admin.layout.changeImage")}
                                      <input 
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) =>
                                          handleImageUpload(e, "headerLogo")
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHeaderLogoUrl("");
                                        setCustomHeaderLogoUrl("");
                                      }}
                                      className="text-white text-[10px] font-medium hover:underline cursor-pointer"
                                    >
                                      URL
                                    </button>
                                  </div>
                                  {uploadingImage.headerLogo && (
                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                      <i className="fa-solid fa-spinner fa-spin text-xl text-[var(--color-primary)]"></i>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Favicon */}
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider block">
                                {t("admin.layout.faviconHeading")}
                              </label>
                            </div>
                            <label className="cursor-pointer select-none inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)] font-normal"
                                checked={
                                  faviconUrl ===
                                  (DEFAULT_SETTINGS.faviconUrl ||
                                    "/favicon.svg")
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFaviconUrl(
                                      DEFAULT_SETTINGS.faviconUrl ||
                                        "/favicon.svg",
                                    );
                                  } else {
                                    const defFav =
                                      DEFAULT_SETTINGS.faviconUrl ||
                                      "/favicon.svg";
                                    if (
                                      !customFaviconUrl ||
                                      customFaviconUrl === defFav
                                    ) {
                                      setFaviconUrl("");
                                      setCustomFaviconUrl("");
                                    } else {
                                      setFaviconUrl(customFaviconUrl);
                                    }
                                  }
                                }}
                              />
                              <span className="text-xs font-medium text-slate-600">
                                {t("admin.layout.useDefault")}
                              </span>
                            </label>
                          </div>

                          {/* Live Tab Preview */}
                          <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-500">
                                {t("admin.layout.livePreviewTab")}
                              </span>
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                {faviconUrl ===
                                (DEFAULT_SETTINGS.faviconUrl || "/favicon.svg")
                                  ? t("admin.layout.defaultActive")
                                  : t("admin.layout.customActive")}
                              </span>
                            </div>

                            <div className="bg-slate-100 rounded-xl p-2.5 flex items-center gap-2 h-12 overflow-hidden select-none">
                              <div className="flex gap-1 pr-2 pl-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                              </div>

                              <div className="bg-white px-3 py-1.5 rounded-lg flex items-center gap-2 max-w-[170px] shadow-xs border border-slate-200/60">
                                <img
                                  src={faviconUrl || "/favicon.svg"}
                                  alt="Favicon Tab Vorschau"
                                  className="w-4 h-4 object-contain shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      "/favicon.svg";
                                  }}
                                />
                                <span className="text-xs font-semibold text-slate-700 truncate">
                                  {clubName || "Tennisclub"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div
                            className={`transition-all duration-300 ${faviconUrl === (DEFAULT_SETTINGS.faviconUrl || "/favicon.svg") ? "opacity-40 pointer-events-none" : ""}`}
                          >
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-200/80 rounded-xl mb-3">
                              <button
                                type="button"
                                onClick={() => setFaviconInputMode("upload")}
                                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                  faviconInputMode === "upload"
                                    ? "bg-white text-slate-900 shadow-xs"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                              >
                                <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                                <span>{t("admin.layout.uploadImage")}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setFaviconInputMode("url")}
                                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                  faviconInputMode === "url"
                                    ? "bg-white text-slate-900 shadow-xs"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                              >
                                <i className="fa-solid fa-link text-xs"></i>
                                <span>{t("admin.layout.viaUrl")}</span>
                              </button>
                            </div>

                            {faviconInputMode === "upload" ? (
                              <div>
                                {customFaviconUrl &&
                                customFaviconUrl.startsWith("data:") ? (
                                  <div className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl shadow-2xs">
                                    <div className="w-12 h-12 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                                      <img
                                        src={customFaviconUrl}
                                        alt="Favicon"
                                        className="w-full h-full object-contain p-1"
                                      />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-semibold text-slate-800 truncate">
                                        {t("admin.layout.customFaviconUploaded")}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1.5">
                                        <label className="text-xs font-semibold text-[var(--color-primary)] hover:underline cursor-pointer">
                                          {t("admin.layout.changeImage")}
                                          <input 
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) =>
                                              handleImageUpload(e, "favicon")
                                            }
                                            disabled={uploadingImage.favicon}
                                          />
                                        </label>
                                        <span className="text-slate-300">•</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFaviconUrl("");
                                            setCustomFaviconUrl("");
                                          }}
                                          className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                                        >
                                          {t("admin.layout.remove")}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <label className="border border-dashed border-slate-300 hover:border-[var(--color-primary)] bg-white hover:bg-slate-50/70 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all shadow-2xs">
                                    <input 
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handleImageUpload(e, "favicon")
                                      }
                                      disabled={uploadingImage.favicon}
                                    />
                                    <i className="fa-solid fa-cloud-arrow-up text-lg text-slate-500 mb-1"></i>
                                    <span className="text-xs font-semibold text-slate-700">{t("admin.layout.chooseSquareImage")}</span>
                                  </label>
                                )}
                              </div>
                            ) : (
                              <div>
                                <input 
                                  type="text"
                                  value={customFaviconUrl}
                                  onChange={(e) => {
                                    setFaviconUrl(e.target.value);
                                    setCustomFaviconUrl(e.target.value);
                                  }}
                                  className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-normal text-slate-800 placeholder:text-slate-400"
                                  placeholder="z. B. https://example.com/favicon.png"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Banner */}
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                              {t("admin.layout.bannerHeading")}
                            </label>
                            {bannerType === "image" && (
                              <label className="cursor-pointer select-none inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded cursor-pointer accent-[var(--color-primary)] font-normal"
                                  checked={Boolean(
                                    useDefaultBanner ||
                                    !bannerUrl ||
                                    bannerUrl === defaultBannerImg
                                  )}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setUseDefaultBanner(isChecked);
                                    if (isChecked) {
                                      setBannerUrl(defaultBannerImg);
                                    } else {
                                      const fallback =
                                        customBannerUrl &&
                                        customBannerUrl !== defaultBannerImg
                                          ? customBannerUrl
                                          : "";
                                      setBannerUrl(fallback);
                                      setCustomBannerUrl(fallback);
                                    }
                                  }}
                                />
                                <span className="text-xs font-medium text-slate-600">
                                  {t("admin.layout.useDefault")}
                                </span>
                              </label>
                            )}
                          </div>

                          {/* Banner Type Selection Tabs */}
                          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/60 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setBannerType("image")}
                              className={`py-2 px-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                bannerType === "image"
                                  ? "bg-white text-[var(--color-primary)] shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <i className="fa-regular fa-image"></i>
                              <span>{t("admin.layout.bannerTypeImage")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBannerType("color")}
                              className={`py-2 px-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                bannerType === "color"
                                  ? "bg-white text-[var(--color-primary)] shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <i className="fa-solid fa-fill-drip"></i>
                              <span>{t("admin.layout.bannerTypeColor")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBannerType("gradient")}
                              className={`py-2 px-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                bannerType === "gradient"
                                  ? "bg-white text-[var(--color-primary)] shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <i className="fa-solid fa-circle-half-stroke"></i>
                              <span>{t("admin.layout.bannerTypeGradient")}</span>
                            </button>
                          </div>

                          {/* Mode: Image */}
                          {bannerType === "image" && (
                            <div
                              className={`transition-opacity ${useDefaultBanner ? "opacity-60" : ""}`}
                            >
                              {useDefaultBanner || !customBannerUrl ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    disabled={useDefaultBanner}
                                    value={useDefaultBanner ? "" : customBannerUrl}
                                    onChange={(e) => {
                                      setBannerUrl(e.target.value);
                                      setCustomBannerUrl(e.target.value);
                                      if (useDefaultBanner) setUseDefaultBanner(false);
                                    }}
                                    className={`flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-normal text-slate-800 placeholder:text-slate-400 ${
                                      useDefaultBanner
                                        ? "opacity-50 cursor-not-allowed bg-slate-50"
                                        : ""
                                    }`}
                                    placeholder={
                                      useDefaultBanner
                                        ? (isNeuhausenClub ? t("admin.layout.defaultBannerActive") : t("admin.layout.noImageDefaultBanner"))
                                        : "https://example.com/banner.jpg"
                                    }
                                  />
                                  <label
                                    className={`border border-slate-200 rounded-xl px-4 flex items-center justify-center h-10 shrink-0 shadow-2xs ${
                                      useDefaultBanner
                                        ? "bg-slate-100 opacity-50 cursor-not-allowed pointer-events-none"
                                        : "bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                                    }`}
                                  >
                                    {uploadingImage.banner ? (
                                      <i className="fa-solid fa-spinner fa-spin text-sm text-[var(--color-primary)]"></i>
                                    ) : (
                                      <i className="fa-solid fa-cloud-arrow-up text-sm text-slate-600"></i>
                                    )}
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*"
                                      onChange={(e) =>
                                        handleImageUpload(e, "banner")
                                      }
                                      disabled={useDefaultBanner || uploadingImage.banner}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="relative group w-full h-28 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center shadow-2xs">
                                  <img
                                    src={customBannerUrl}
                                    alt="Banner"
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition: bannerPosition }}
                                  />
                                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <label className="bg-white text-slate-800 px-3 py-1.5 rounded-lg font-semibold text-xs cursor-pointer hover:bg-slate-100 shadow-xs flex items-center gap-1.5">
                                      <i className="fa-solid fa-upload"></i> {t("admin.layout.changePicture")}
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={(e) =>
                                          handleImageUpload(e, "banner")
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowBannerPositionModal(true)
                                      }
                                      className="bg-white text-slate-800 px-3 py-1.5 rounded-lg font-semibold text-xs cursor-pointer shadow-xs hover:bg-slate-100 flex items-center gap-1.5"
                                    >
                                      <i className="fa-solid fa-crop-simple"></i> {t("admin.layout.cropBanner")}
                                    </button>
                                  </div>
                                  {uploadingImage.banner && (
                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                      <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--color-primary)]"></i>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Mode: Solid Color */}
                          {bannerType === "color" && (
                            <div className="space-y-3.5 animate-in fade-in duration-200">
                              <div
                                className="w-full h-16 sm:h-20 rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex items-center justify-between px-4 text-white relative transition-all"
                                style={{ backgroundColor: bannerColor }}
                              >
                                <div className="flex items-center gap-2 drop-shadow-md">
                                  {headerLogoUrl || logoUrl ? (
                                    <img src={headerLogoUrl || logoUrl} alt="Logo" className="w-7 h-7 object-contain" />
                                  ) : null}
                                  <span className="font-bold text-sm" style={{ fontFamily: "Georgia, serif" }}>
                                    {clubName || "Verein"}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-md text-white/95 uppercase font-semibold">
                                  {bannerColor.toUpperCase()}
                                </span>
                              </div>

                              <div className="space-y-2">
                                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                  {t("admin.layout.bannerColorLabel")}
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="color"
                                    value={bannerColor.startsWith("#") && bannerColor.length === 7 ? bannerColor : "#1b4332"}
                                    onChange={(e) => setBannerColor(e.target.value)}
                                    className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-1 bg-white hover:border-[var(--color-primary)] transition-colors shrink-0"
                                  />
                                  <input
                                    type="text"
                                    value={bannerColor}
                                    onChange={(e) => setBannerColor(e.target.value)}
                                    maxLength={7}
                                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-mono uppercase text-slate-800"
                                    placeholder="#1B4332"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  <span className="text-[10px] text-slate-400 font-medium mr-0.5">{t("admin.layout.quickSelect")}</span>
                                  <button
                                    type="button"
                                    onClick={() => setBannerColor(primaryColor)}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {t("admin.layout.quickPrimary")} ({primaryColor})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBannerColor(accentColor || "#c04d2b")}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {t("admin.layout.quickAccent")} ({accentColor || "#c04d2b"})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBannerColor("#1b4332")}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {t("admin.layout.quickDarkGreen")} (#1B4332)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setBannerColor("#0f172a")}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                  >
                                    {t("admin.layout.quickNavy")} (#0F172A)
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Mode: Gradient */}
                          {bannerType === "gradient" && (
                            <div className="space-y-3.5 animate-in fade-in duration-200">
                              <div
                                className="w-full h-16 sm:h-20 rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex items-center justify-between px-4 text-white relative transition-all"
                                style={{
                                  background: `linear-gradient(to right, ${bannerGradientStart || primaryColor}, ${bannerGradientEnd || "#2d6a4f"})`,
                                }}
                              >
                                <div className="flex items-center gap-2 drop-shadow-md">
                                  {headerLogoUrl || logoUrl ? (
                                    <img src={headerLogoUrl || logoUrl} alt="Logo" className="w-7 h-7 object-contain" />
                                  ) : null}
                                  <span className="font-bold text-sm" style={{ fontFamily: "Georgia, serif" }}>
                                    {clubName || "Verein"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[9px] font-mono bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-md text-white/95 uppercase font-semibold">
                                  <span>{bannerGradientStart.toUpperCase()}</span>
                                  <i className="fa-solid fa-arrow-right text-[8px] opacity-70"></i>
                                  <span>{bannerGradientEnd.toUpperCase()}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-0.5">
                                {/* Color 1 (Left) */}
                                <div className="space-y-1.5">
                                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                                    <span>{t("admin.layout.colorLeft")}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{t("admin.layout.startLabel")}</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="color"
                                      value={bannerGradientStart.startsWith("#") && bannerGradientStart.length === 7 ? bannerGradientStart : "#1b4332"}
                                      onChange={(e) => setBannerGradientStart(e.target.value)}
                                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-1 bg-white hover:border-[var(--color-primary)] transition-colors shrink-0"
                                    />
                                    <input
                                      type="text"
                                      value={bannerGradientStart}
                                      onChange={(e) => setBannerGradientStart(e.target.value)}
                                      maxLength={7}
                                      className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-mono uppercase text-slate-800"
                                      placeholder="#1B4332"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setBannerGradientStart(primaryColor)}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                    >
                                      {t("admin.layout.quickPrimary")} ({primaryColor})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBannerGradientStart("#0f172a")}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                    >
                                      {t("admin.layout.quickNavy")}
                                    </button>
                                  </div>
                                </div>

                                {/* Color 2 (Right) */}
                                <div className="space-y-1.5">
                                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                                    <span>{t("admin.layout.colorRight")}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{t("admin.layout.endLabel")}</span>
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="color"
                                      value={bannerGradientEnd.startsWith("#") && bannerGradientEnd.length === 7 ? bannerGradientEnd : "#2d6a4f"}
                                      onChange={(e) => setBannerGradientEnd(e.target.value)}
                                      className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-1 bg-white hover:border-[var(--color-primary)] transition-colors shrink-0"
                                    />
                                    <input
                                      type="text"
                                      value={bannerGradientEnd}
                                      onChange={(e) => setBannerGradientEnd(e.target.value)}
                                      maxLength={7}
                                      className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all text-sm font-mono uppercase text-slate-800"
                                      placeholder="#2D6A4F"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setBannerGradientEnd(accentColor || "#c04d2b")}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                    >
                                      {t("admin.layout.quickAccent")} ({accentColor || "#c04d2b"})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBannerGradientEnd("#2d6a4f")}
                                      className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                                    >
                                      {t("admin.layout.quickMidGreen")}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const temp = bannerGradientStart;
                                    setBannerGradientStart(bannerGradientEnd);
                                    setBannerGradientEnd(temp);
                                  }}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  <i className="fa-solid fa-arrow-right-arrow-left text-[10px]"></i>
                                  {t("admin.layout.swapColors")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Webseiten-Link */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.layout.websiteLink")}
                          </label>
                          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                            <input 
                              type="text"
                              value={websiteUrl}
                              onChange={(e) => setWebsiteUrl(e.target.value)}
                              disabled={hideWebsiteLink}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none transition-all disabled:opacity-50 text-sm font-normal text-slate-800 placeholder:text-slate-400"
                              placeholder="https://www.tennis-club.de"
                            />
                            <label
                              className="flex items-center gap-3 cursor-pointer group select-none"
                              onClick={() =>
                                setHideWebsiteLink(!hideWebsiteLink)
                              }
                            >
                              <div
                                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${hideWebsiteLink ? "bg-[var(--color-primary)]" : "bg-slate-300"}`}
                              >
                                <div
                                  className={`w-4 h-4 bg-white rounded-full shadow-xs transition-transform ${hideWebsiteLink ? "translate-x-4" : ""}`}
                                ></div>
                              </div>
                              <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900">
                                {t("admin.layout.hideWebsiteLink")}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right column: News, Welcome message, Impressum */}
                    <div className="space-y-6">
                      {/* Vereinsnews */}
                      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <i className="fa-solid fa-bullhorn text-[var(--color-primary)]"></i> {t("admin.layout.newsTitle")}
                          </h3>
                          <p className="text-xs text-slate-500 font-normal mt-0.5">
                            {t("admin.layout.newsSubtitle")}
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.layout.currentNewsLabel")}
                            </label>
                            <textarea
                              value={localNews}
                              onChange={(e) => setLocalNews(e.target.value)}
                              placeholder={t("admin.layout.newsPlaceholder")}
                              className="w-full p-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 min-h-[100px] resize-y placeholder:text-slate-400 font-normal"
                            />
                          </div>

                          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {t("admin.layout.newsPreview")}
                            </span>
                            {localNews.trim() ? (
                              <div className="bg-[var(--color-accent)] py-2.5 px-4 rounded-xl text-center text-white text-xs font-semibold shadow-2xs">
                                <i className="fa-solid fa-bullhorn mr-2"></i> {localNews}
                              </div>
                            ) : (
                              <div className="py-3 text-center bg-white border border-dashed border-slate-200 rounded-xl">
                                <span className="text-slate-400 text-xs font-normal">
                                  {t("admin.layout.noActiveNews")}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Willkommensnachricht */}
                      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <i className="fa-solid fa-comment-dots text-[var(--color-primary)]"></i> {t("admin.layout.welcomeTitle")}
                          </h3>
                          <p className="text-xs text-slate-500 font-normal mt-0.5">
                            {t("admin.layout.welcomeSubtitle")}
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.layout.welcomeTextLabel")}
                            </label>
                            <RichTextEditorToolbar
                              textareaRef={welcomeTextRef}
                              value={welcomeMessage}
                              onChange={setWelcomeMessage}
                            />
                            <textarea
                              ref={welcomeTextRef}
                              value={welcomeMessage}
                              onChange={(e) => setWelcomeMessage(e.target.value)}
                              placeholder="Herzlich willkommen..."
                              className="w-full p-3 rounded-b-xl bg-white border border-slate-200 border-t-0 text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] min-h-[120px] resize-y placeholder:text-slate-400 font-normal"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                              {t("admin.layout.welcomeHelp")}
                            </p>
                          </div>

                          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {t("admin.layout.livePreview")}
                            </span>
                            <div className="p-3 bg-white rounded-xl border border-slate-200/80 max-h-[140px] overflow-y-auto text-xs text-slate-700">
                              <RichTextRenderer text={welcomeMessage} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Impressum */}
                      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <i className="fa-solid fa-scale-balanced text-[var(--color-primary)]"></i> {t("admin.layout.impressumTitle")}
                          </h3>
                          <p className="text-xs text-slate-500 font-normal mt-0.5">
                            {t("admin.layout.impressumSubtitle")}
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.layout.impressumContentLabel")}
                            </label>
                            <RichTextEditorToolbar
                              textareaRef={impressumTextRef}
                              value={impressum}
                              onChange={setImpressum}
                            />
                            <textarea
                              ref={impressumTextRef}
                              value={impressum}
                              onChange={(e) => setImpressum(e.target.value)}
                              placeholder="Angaben gemäß § 5 TMG..."
                              className="w-full p-3 rounded-b-xl bg-white border border-slate-200 border-t-0 text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] min-h-[140px] resize-y placeholder:text-slate-400 font-normal"
                            />
                          </div>

                          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {t("admin.layout.livePreview")}
                            </span>
                            <div className="p-3 bg-white rounded-xl border border-slate-200/80 max-h-[140px] overflow-y-auto text-xs text-slate-700">
                              <RichTextRenderer text={impressum} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tab Category Actions */}
                  <div className="border-t border-slate-200/80 pt-5 flex justify-end">
                    <button
                      type="button"
                      disabled={!isTabDirty("layout")}
                      onClick={() => handleSaveTab("layout")}
                      className={`h-10 px-6 rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                        isTabDirty("layout")
                          ? "bg-[var(--color-primary)] text-white hover:brightness-110"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      }`}
                    >
                      <i className="fa-solid fa-floppy-disk"></i> {t("admin.layout.save")}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: TRANSLATION HUB */}
              {currentTab === "translations" && (() => {
                const masterLang = settings.i18n?.defaultLanguage || "de";
                const targetLang = masterLang === "de" ? "en" : "de";
                const isSecondaryLangActive = (settings.i18n?.supportedLanguages || [masterLang]).includes(targetLang);
                const targetTrans = translations[targetLang] || {};
                const uniqueLockReasons = getUniqueLockReasons(settings.recurringLocks, settings.rangeLocks);
                const activeCourtsList = courtsList.length > 0 ? courtsList : (settings.courts || ["Platz 1", "Platz 2"]);
                const activeEquipmentList = equipmentList.length > 0 ? equipmentList : (settings.equipmentList || ["Ballmaschine", "Ballkorb"]);
                const activeLeagues = (settings.leagueSettings?.leagues && settings.leagueSettings.leagues.length > 0)
                  ? settings.leagueSettings.leagues
                  : DEFAULT_DYNAMIC_LEAGUES;

                const handleUpdateCategory = (category: "courts" | "equipment" | "lockReasons" | "categories" | "leagues", key: string, value: string) => {
                  setTranslations((prev) => {
                    const currentLangTrans = prev[targetLang] || {};
                    const catMap = { ...((currentLangTrans[category] as Record<string, string>) || {}) };
                    if (value.trim()) {
                      catMap[key] = value;
                    } else {
                      delete catMap[key];
                    }
                    return {
                      ...prev,
                      [targetLang]: {
                        ...currentLangTrans,
                        [category]: catMap,
                      },
                    };
                  });
                };

                const handleUpdateField = (field: "welcomeMessage" | "news", value: string) => {
                  setTranslations((prev) => {
                    const currentLangTrans = prev[targetLang] || {};
                    return {
                      ...prev,
                      [targetLang]: {
                        ...currentLangTrans,
                        [field]: value,
                      },
                    };
                  });
                };

                return (
                  <div className="space-y-5 lg:space-y-6 animate-in fade-in duration-300">
                    {/* Header Card */}
                    <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <i className="fa-solid fa-language text-[var(--color-primary)]"></i>{" "}
                            {t("admin.translationHub.title")}
                          </h3>
                          <p className="text-xs text-slate-500 font-normal mt-0.5">
                            {t("admin.translationHub.subtitle")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {t("admin.translationHub.master")}{" "}
                            <strong className="uppercase">{masterLang}</strong>
                          </span>
                          <i className="fa-solid fa-arrow-right text-slate-400 text-xs"></i>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
                            {t("admin.translationHub.targetLanguage")}{" "}
                            <strong className="uppercase">{targetLang}</strong>
                          </span>
                        </div>
                      </div>

                      {!isSecondaryLangActive && (
                        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-800">
                          <div className="flex items-center gap-2">
                            <i className="fa-solid fa-circle-info text-amber-600 shrink-0"></i>
                            <span>
                              {t("admin.translationHub.targetLangNotice", { lang: targetLang.toUpperCase() })}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAllowOtherLanguage(true);
                              setMessage({
                                text: t("admin.translationHub.secondaryActivatedToast"),
                                type: "success",
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition shadow-xs cursor-pointer shrink-0"
                          >
                            {t("admin.translationHub.activateNow")}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* SECTION 1: COURTS */}
                    <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <i className="fa-solid fa-layer-group text-[var(--color-primary)] text-xs"></i>
                          {t("admin.translationHub.courtsTitle")} ({activeCourtsList.length})
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("admin.translationHub.courtsSubtitle")}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeCourtsList.map((court) => {
                          const translatedVal = targetTrans.courts?.[court] || "";
                          return (
                            <div
                              key={court}
                              className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-bold text-slate-800 truncate block">
                                  {court}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {t("admin.translationHub.original")} ({masterLang.toUpperCase()})
                                </span>
                              </div>
                              <div className="w-full sm:w-56 shrink-0">
                                <input
                                  type="text"
                                  value={translatedVal}
                                  placeholder={court}
                                  onChange={(e) => handleUpdateCategory("courts", court, e.target.value)}
                                  className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SECTION: EQUIPMENT */}
                    <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <i className="fa-solid fa-boxes-stacked text-[var(--color-primary)] text-xs"></i>
                          {t("admin.translationHub.equipmentTitle")} ({activeEquipmentList.length})
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("admin.translationHub.equipmentSubtitle")}
                        </p>
                      </div>

                      {activeEquipmentList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          {t("admin.translationHub.noEquipment")}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {activeEquipmentList.map((item) => {
                            const translatedVal = targetTrans.equipment?.[item] || "";
                            return (
                              <div
                                key={item}
                                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-bold text-slate-800 truncate block">
                                    {item}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {t("admin.translationHub.original")} ({masterLang.toUpperCase()})
                                  </span>
                                </div>
                                <div className="w-full sm:w-56 shrink-0">
                                  <input
                                    type="text"
                                    value={translatedVal}
                                    placeholder={item}
                                    onChange={(e) => handleUpdateCategory("equipment", item, e.target.value)}
                                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* SECTION 2: LOCK REASONS */}
                    <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <i className="fa-solid fa-ban text-[var(--color-primary)] text-xs"></i>
                          {t("admin.translationHub.lockReasonsTitle")} ({uniqueLockReasons.length})
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("admin.translationHub.lockReasonsSubtitle")}
                        </p>
                      </div>

                      {uniqueLockReasons.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          {t("admin.translationHub.noLockReasons")}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {uniqueLockReasons.map((reason) => {
                            const translatedVal = targetTrans.lockReasons?.[reason] || "";
                            return (
                              <div
                                key={reason}
                                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-bold text-slate-800 truncate block">
                                    {reason}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {t("admin.translationHub.original")} ({masterLang.toUpperCase()})
                                  </span>
                                </div>
                                <div className="w-full sm:w-56 shrink-0">
                                  <input
                                    type="text"
                                    value={translatedVal}
                                    placeholder={reason}
                                    onChange={(e) => handleUpdateCategory("lockReasons", reason, e.target.value)}
                                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* SECTION 3: ARBEITSEINSATZ KATEGORIEN */}
                    {modules.arbeitseinsaetze && (
                      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <i className="fa-solid fa-briefcase text-[var(--color-primary)] text-xs"></i>
                            {t("admin.translationHub.aeCategoriesTitle")} ({aeCategories.length})
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t("admin.translationHub.aeCategoriesSubtitle")}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {aeCategories.map((cat) => {
                            const translatedVal = targetTrans.categories?.[cat] || "";
                            return (
                              <div
                                key={cat}
                                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-bold text-slate-800 truncate block">
                                    {cat}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {t("admin.translationHub.original")} ({masterLang.toUpperCase()})
                                  </span>
                                </div>
                                <div className="w-full sm:w-56 shrink-0">
                                  <input
                                    type="text"
                                    value={translatedVal}
                                    placeholder={cat}
                                    onChange={(e) => handleUpdateCategory("categories", cat, e.target.value)}
                                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SECTION 4: LEAGUES */}
                    {modules.league && (
                      <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <i className="fa-solid fa-trophy text-[var(--color-primary)] text-xs"></i>
                            {t("admin.translationHub.leaguesTitle")} ({activeLeagues.length})
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t("admin.translationHub.leaguesSubtitle")}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {activeLeagues.map((lg) => {
                            const translatedVal = targetTrans.leagues?.[lg.name] || "";
                            return (
                              <div
                                key={lg.id || lg.name}
                                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-bold text-slate-800 truncate block">
                                    {lg.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {t("admin.translationHub.original")} ({masterLang.toUpperCase()})
                                  </span>
                                </div>
                                <div className="w-full sm:w-56 shrink-0">
                                  <input
                                    type="text"
                                    value={translatedVal}
                                    placeholder={lg.name}
                                    onChange={(e) => handleUpdateCategory("leagues", lg.name, e.target.value)}
                                    className="w-full h-8 px-2.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SECTION 5: GENERAL TEXTS */}
                    <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <i className="fa-solid fa-newspaper text-[var(--color-primary)] text-xs"></i>
                          {t("admin.translationHub.generalTextsTitle")}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {t("admin.translationHub.generalTextsSubtitle")}
                        </p>
                      </div>

                      {/* Welcome Message */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 block">
                          {t("admin.translationHub.welcomeMessageLabel")} ({targetLang.toUpperCase()})
                        </label>
                        <p className="text-[11px] text-slate-400">
                          {t("admin.translationHub.original")} ({masterLang.toUpperCase()}): {welcomeMessage || settings.welcomeMessage || t("admin.translationHub.noText")}
                        </p>
                        <textarea
                          rows={3}
                          value={targetTrans.welcomeMessage || ""}
                          placeholder={t("admin.translationHub.welcomePlaceholder")}
                          onChange={(e) => handleUpdateField("welcomeMessage", e.target.value)}
                          className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800 leading-relaxed"
                        />
                      </div>

                      {/* News */}
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-700 block">
                          {t("admin.translationHub.newsLabel")} ({targetLang.toUpperCase()})
                        </label>
                        <p className="text-[11px] text-slate-400">
                          {t("admin.translationHub.original")} ({masterLang.toUpperCase()}): {localNews || settings.news || t("admin.translationHub.noNews")}
                        </p>
                        <input
                          type="text"
                          value={targetTrans.news || ""}
                          placeholder={t("admin.translationHub.newsPlaceholder")}
                          onChange={(e) => handleUpdateField("news", e.target.value)}
                          className="w-full h-9 px-2.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Tab Save Action */}
                    <div className="border-t border-slate-200/80 pt-5 flex justify-end gap-3">
                      {isTabDirty("translations") && (
                        <button
                          type="button"
                          onClick={() => handleDiscardTab("translations")}
                          className="h-10 px-4 rounded-xl font-semibold text-xs border border-slate-300 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                        >
                          {t("admin.translationHub.discard")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!isTabDirty("translations")}
                        onClick={() => handleSaveTab("translations")}
                        className={`h-10 px-6 rounded-xl font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                          isTabDirty("translations")
                            ? "bg-[var(--color-primary)] text-white hover:brightness-110"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                        }`}
                      >
                        <i className="fa-solid fa-floppy-disk"></i> {t("admin.translationHub.save")}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* TAB 4: BENUTZER (Spielerverwaltung) */}
              {currentTab === "users" && (
                <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-300">
                  {/* Member List & Search */}
                  <div className="bg-white p-5 sm:p-6 lg:p-7 rounded-2xl border border-slate-200/80 space-y-6 shadow-xs">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-users text-[var(--color-primary)]"></i>{" "}
                          {t("admin.users.title")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {nonSuperAdminUsers.length}{" "}
                          {nonSuperAdminUsers.length === 1
                            ? t("admin.users.memberSingular")
                            : t("admin.users.memberPlural")}{" "}
                          {t("admin.users.registered")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser({
                            name: "",
                            password: "",
                            role: Role.USER,
                            gender: "m",
                            firstName: "",
                            lastName: "",
                            email: "",
                            phone: "",
                            birthDate: "",
                            showContactInfo: false,
                            onboarding_pending: true,
                            isSuspended: false,
                          });
                          setInlineEditingUserId(null);
                          setShowUserForm(!showUserForm);
                        }}
                        className="h-10 px-4 bg-[var(--color-primary)] hover:brightness-110 text-white font-semibold text-xs rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-2 cursor-pointer"
                      >
                        <i
                          className={`fa-solid ${showUserForm ? "fa-xmark" : "fa-user-plus"}`}
                        ></i>{" "}
                        {showUserForm
                          ? t("common.cancel")
                          : t("admin.users.addMember")}
                      </button>
                    </div>

                    {/* Inline Add Form */}
                    {showUserForm && (
                      <div className="bg-slate-50/70 p-5 sm:p-6 rounded-2xl border border-slate-200/80 space-y-6 shadow-2xs animate-in fade-in slide-in-from-top-3 mb-6 text-left">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                            <i className="fa-solid fa-user-plus text-[var(--color-primary)]"></i>
                            <span>{t("admin.users.addMember")}</span>
                          </div>
                        </div>

                        {/* Profilbild & Avatar (Hard-Bandwidth-Protection & 0-Byte Fallback) */}
                        <AvatarUploader
                          user={editingUser}
                          userId={editingUser.id || editingUser.name || "new_user"}
                          avatarUrl={editingUser.avatarUrl}
                          avatarIcon={editingUser.avatarIcon}
                          avatarColor={editingUser.avatarColor}
                          onChange={({ avatarUrl, avatarIcon, avatarColor }) => {
                            setEditingUser((prev) => ({
                              ...prev,
                              ...(avatarUrl !== undefined ? { avatarUrl } : {}),
                              ...(avatarIcon !== undefined ? { avatarIcon } : {}),
                              ...(avatarColor !== undefined ? { avatarColor } : {}),
                            }));
                          }}
                        />

                        {/* 1. PERSÖNLICHE DATEN */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-address-card text-xs"></i>
                            {t("admin.users.formSection1")}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldFirstName")} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editingUser.firstName || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    firstName: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm outline-none text-slate-800 font-normal placeholder:text-slate-400"
                                placeholder="Z.B. Max"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldLastName")} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editingUser.lastName || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    lastName: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm outline-none text-slate-800 font-normal placeholder:text-slate-400"
                                placeholder="Z.B. Mustermann"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldGender")} <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={editingUser.gender || "m"}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    gender: e.target.value as "m" | "w",
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 bg-white rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all cursor-pointer text-sm text-slate-800 font-normal"
                              >
                                <option value="m">{t("admin.users.fieldGenderMale")}</option>
                                <option value="w">{t("admin.users.fieldGenderFemale")}</option>
                              </select>
                            </div>
                            <div>
                              <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                                <span>{t("admin.users.fieldBirthDate")}</span>
                                {editingUser.birthDate && calculateAge(editingUser.birthDate) !== null && (
                                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                    {calculateAge(editingUser.birthDate)} {t("admin.users.ageYears")} {calculateAge(editingUser.birthDate)! < 18 ? t("admin.users.ageYouth") : t("admin.users.ageAdult")}
                                  </span>
                                )}
                              </label>
                              <input
                                type="date"
                                min="1900-01-01"
                                max="2099-12-31"
                                value={editingUser.birthDate || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.length <= 10) {
                                    setEditingUser({
                                      ...editingUser,
                                      birthDate: val,
                                    });
                                  }
                                }}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldLanguage")}
                              </label>
                              <select
                                value={editingUser.language || settings.i18n?.defaultLanguage || "de"}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    language: e.target.value as "de" | "en",
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 bg-white rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all cursor-pointer text-sm text-slate-800 font-normal"
                              >
                                <option value="de">Deutsch (DE)</option>
                                <option value="en">English (EN)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* 2. KONTAKTINFORMATIONEN */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-address-book text-xs"></i>
                            {t("admin.users.formSection2")}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldEmail")} <span className="text-slate-400 font-normal normal-case">({t("common.optional")})</span>
                              </label>
                              <input
                                type="email"
                                value={editingUser.email || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    email: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm bg-white text-slate-800"
                                placeholder="name@beispiel.de"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldPhone")} <span className="text-slate-400 font-normal normal-case">({t("common.optional")})</span>
                              </label>
                              <input
                                type="tel"
                                value={editingUser.phone || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    phone: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal placeholder:text-slate-400"
                                placeholder="+49 170 1234567"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 3. ZUGANGSDATEN & PASSWORT */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-key text-xs"></i>
                            {t("admin.users.formSection3")}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldUsername")} <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={editingUser.name || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    name: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal placeholder:text-slate-400"
                                placeholder="z. B. maxmustermann"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldRole")} <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={editingUser.role || Role.USER}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    role: e.target.value as Role,
                                  })
                                }
                                className="w-full h-10 px-3.5 border border-slate-200 bg-white rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all cursor-pointer text-sm text-slate-800 font-normal"
                              >
                                <option value={Role.MITGLIED}>{t("admin.users.roleStandard")}</option>
                                <option value={Role.ADMIN}>{t("admin.users.roleClubAdmin")}</option>
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {t("admin.users.fieldPassword")} <span className="text-red-500">*</span>
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingUser.password || ""}
                                  onChange={(e) =>
                                    setEditingUser({
                                      ...editingUser,
                                      password: e.target.value,
                                      mustChangePassword: false,
                                    })
                                  }
                                  className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400"
                                  placeholder={t("admin.users.passwordPlaceholder")}
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                                    let pwd = "";
                                    for (let i = 0; i < 8; i++) {
                                      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
                                    }
                                    setEditingUser({
                                      ...editingUser,
                                      password: pwd,
                                      mustChangePassword: true,
                                    });
                                  }}
                                  className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                                  title={t("admin.users.passwordGenerateTitle")}
                                >
                                  <i className="fa-solid fa-key"></i>
                                  <span>{t("admin.users.passwordGenerate")}</span>
                                </button>
                              </div>
                              {editingUser.mustChangePassword && (
                                <p className="text-xs text-amber-700 mt-1.5 font-medium flex items-center gap-1">
                                  <i className="fa-solid fa-circle-info text-[11px]"></i>
                                  {t("admin.users.passwordMustChange")}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 4. PRIVATSPHÄRE & APP-ANZEIGE */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-user-shield text-xs"></i>
                            {t("admin.users.formSection4")}
                          </h4>
                          <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200/80">
                            <label className="flex items-center gap-3 cursor-pointer group select-none">
                              <input
                                type="checkbox"
                                checked={!!editingUser.showContactInfo}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    showContactInfo: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 block">
                                  {t("admin.users.privacyShareContact")}
                                </span>
                                <span className="text-xs text-slate-500 block font-normal">
                                  {t("admin.users.privacyShareContactDesc")}
                                </span>
                              </div>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group select-none">
                              <input
                                type="checkbox"
                                id="user-form-onboarding-pending"
                                checked={!!editingUser.onboarding_pending}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    onboarding_pending: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                              />
                              <div>
                                <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 flex items-center gap-1.5">
                                  <span>{t("admin.users.privacyOnboardingPending")}</span>
                                  {editingUser.onboarding_pending && (
                                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                                      {t("common.active")}
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-slate-500 block font-normal">
                                  {t("admin.users.privacyOnboardingPendingDesc")}
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>

                        {/* Background Duplicate Check Info Box */}
                        {liveDuplicateCandidates.length > 0 && !inlineEditingUserId && (
                          <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 space-y-3 shadow-xs animate-in fade-in duration-200 my-2">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 text-sm font-bold shadow-xs">
                                <i className="fa-solid fa-user-shield"></i>
                              </div>
                              <div className="space-y-0.5">
                                <h5 className="font-bold text-amber-950 text-xs sm:text-sm leading-tight">
                                  {t("admin.users.duplicateTitle")}
                                </h5>
                                <p className="text-xs text-amber-800 font-normal">
                                  {t("admin.users.duplicateDesc")}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2.5 pt-1">
                              {liveDuplicateCandidates.map((cand) => (
                                <div
                                  key={cand.personId}
                                  className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2.5 shadow-xs"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                      <span className="font-bold text-slate-900 text-xs block">
                                        {cand.firstName} {cand.lastName}
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono">
                                        System-ID: {cand.personId}
                                      </span>
                                    </div>

                                    {cand.hasAdminInOtherClub && (
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100/90 border border-amber-300 rounded-lg text-amber-950 font-semibold text-xs">
                                        <i className="fa-solid fa-shield-halved text-amber-600"></i>
                                        <span>{t("admin.users.duplicateAdminWarning")}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await addExistingPersonToClub(
                                            cand.personId,
                                            currentClubId,
                                            Role.MITGLIED
                                          );
                                          setMessage({
                                            text: `Bestehender Benutzer "${cand.firstName} ${cand.lastName}" wurde erfolgreich mit diesem Verein verknüpft (Standard-Rolle: Mitglied).`,
                                            type: "success",
                                          });
                                          setEditingUser({
                                            name: "",
                                            password: "",
                                            role: Role.USER,
                                            gender: "m",
                                            firstName: "",
                                            lastName: "",
                                            email: "",
                                            phone: "",
                                            birthDate: "",
                                            showContactInfo: false,
                                            onboarding_pending: true,
                                            isSuspended: false,
                                          });
                                          setShowUserForm(false);
                                          setLiveDuplicateCandidates([]);
                                        } catch (err: any) {
                                          setMessage({
                                            text: err.message || "Fehler beim Verknüpfen des Benutzers.",
                                            type: "error",
                                          });
                                        }
                                      }}
                                      className="flex-1 bg-[var(--color-primary)] hover:brightness-110 text-white px-4 h-10 rounded-xl font-semibold text-xs transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <i className="fa-solid fa-link"></i>
                                      {t("admin.users.duplicateLink")}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLiveDuplicateCandidates([]);
                                        handleSaveUser(true);
                                      }}
                                      className="h-10 px-4 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition-colors border border-slate-200 text-center cursor-pointer"
                                    >
                                      {t("admin.users.duplicateCreate")}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-3 justify-end border-t border-slate-200/60">
                          <button
                            type="button"
                            onClick={() => setShowUserForm(false)}
                            className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveUser()}
                            className="h-10 px-5 bg-[var(--color-primary)] text-white hover:brightness-110 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                          >
                            <i className="fa-solid fa-user-plus"></i>
                            <span>{t("admin.users.addMemberSubmit")}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Search Bar & Sorting Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                      <div className="relative flex-grow">
                        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input 
                          type="text"
                          placeholder={t("admin.users.searchPlaceholder")}
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          className="w-full h-10 pl-10 pr-9 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none text-sm transition-all shadow-2xs font-normal placeholder:text-slate-400 text-slate-800"
                        />
                        {userSearchQuery && (
                          <button
                            onClick={() => setUserSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            <i className="fa-solid fa-xmark text-sm"></i>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 h-10 shrink-0 shadow-2xs">
                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 pl-1">
                          <i className="fa-solid fa-arrow-down-a-z text-slate-400"></i>
                          <span>{t("admin.users.sortBy")}</span>
                        </span>
                        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setUserSortBy("alphabetical")}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
                              userSortBy === "alphabetical"
                                ? "bg-white text-[var(--color-primary)] shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {t("admin.users.sortAlpha")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setUserSortBy("role")}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
                              userSortBy === "role"
                                ? "bg-white text-[var(--color-primary)] shadow-xs"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            {t("admin.users.sortByType")}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setUserSortOrder((prev) =>
                            prev === "asc" ? "desc" : "asc",
                          )
                        }
                        title={
                          userSortOrder === "asc"
                            ? t("admin.users.sortAscTitle")
                            : t("admin.users.sortDescTitle")
                        }
                        className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                      >
                        {userSortOrder === "asc" ? (
                          <>
                            <i className="fa-solid fa-arrow-up-wide-short text-[var(--color-primary)]"></i>
                            <span>{t("admin.users.sortAsc")}</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-arrow-down-wide-short text-[var(--color-primary)]"></i>
                            <span>{t("admin.users.sortDesc")}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedUserIds.size > 0 && (
                      <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                            {selectedUserIds.size}
                          </span>
                          <div>
                            <h4 className="text-xs font-black uppercase text-emerald-900 tracking-wider">
                              {selectedUserIds.size} {t("admin.users.bulkSelected")}
                            </h4>
                            <p className="text-[10px] text-emerald-700 font-medium">
                              {t("admin.users.bulkAction")}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={openBulkActivationModal}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                          >
                            <i className="fa-solid fa-paper-plane text-xs"></i>
                            <span>{t("admin.users.actionSendActivation")} ({selectedUserIds.size})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedUserIds(new Set())}
                            className="px-3.5 py-2.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                          >
                            {t("admin.users.bulkDeselect")}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* User List */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
                      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 font-semibold text-xs uppercase tracking-wider text-slate-500 items-center">
                        <div className="col-span-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={
                              paginatedUsers.length > 0 &&
                              paginatedUsers.every((u) => selectedUserIds.has(u.name))
                            }
                            onChange={(e) => {
                              const next = new Set(selectedUserIds);
                              if (e.target.checked) {
                                paginatedUsers.forEach((u) => next.add(u.name));
                              } else {
                                paginatedUsers.forEach((u) => next.delete(u.name));
                              }
                              setSelectedUserIds(next);
                            }}
                            className="w-4 h-4 text-[var(--color-primary)] bg-white border-slate-300 rounded focus:ring-[var(--color-primary)] cursor-pointer accent-[var(--color-primary)]"
                            title={t("admin.users.selectAll")}
                          />
                        </div>
                        <div className="col-span-3">{t("admin.users.colName")}</div>
                        <div className="col-span-2">{t("admin.users.colUsername")}</div>
                        <div className="col-span-2">{t("admin.users.colEmail")}</div>
                        <div className="col-span-2">{t("admin.users.colRole")}</div>
                        <div className="col-span-2 text-right">{t("admin.users.colActions")}</div>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {paginatedUsers.map((u, idx) => {
                          const isEditingInline =
                            inlineEditingUserId === u.name;
                          if (isEditingInline) {
                            return (
                              <div
                                key={u.id || u.name + "-" + idx}
                                className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-200/80 space-y-5 text-left animate-in fade-in duration-200"
                              >
                                <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                                  <div className="flex items-center gap-2.5 text-slate-900 font-bold text-sm">
                                    <i className="fa-solid fa-user-pen text-[var(--color-primary)]"></i>
                                    <span>{t("admin.users.editMember")}: {u.klarname || u.name}</span>
                                    {editingUser.isSuspended ? (
                                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200/80 text-[11px] font-semibold rounded-full flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                        Gesperrt
                                      </span>
                                    ) : (editingUser.lastLogin || editingUser.last_login || editingUser.lastLoginAt) ? (
                                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-semibold rounded-full flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Aktiv
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditingUserId(null)}
                                      className="h-10 px-4 min-w-[105px] justify-center bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-semibold text-xs text-slate-700 transition-colors cursor-pointer shadow-2xs flex items-center"
                                    >
                                      Abbrechen
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveUser()}
                                      className="h-10 px-5 min-w-[175px] justify-center bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                      <i className="fa-solid fa-floppy-disk text-xs"></i>
                                      <span>Änderungen speichern</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Profilbild & Avatar (Hard-Bandwidth-Protection & 0-Byte Fallback) */}
                                <AvatarUploader
                                  user={editingUser}
                                  userId={editingUser.id || editingUser.name || u.name}
                                  avatarUrl={editingUser.avatarUrl}
                                  avatarIcon={editingUser.avatarIcon}
                                  avatarColor={editingUser.avatarColor}
                                  onChange={({ avatarUrl, avatarIcon, avatarColor }) => {
                                    setEditingUser((prev) => ({
                                      ...prev,
                                      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
                                      ...(avatarIcon !== undefined ? { avatarIcon } : {}),
                                      ...(avatarColor !== undefined ? { avatarColor } : {}),
                                    }));
                                  }}
                                />

                                {/* 1. PERSÖNLICHE DATEN */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                                    <i className="fa-solid fa-address-card text-xs"></i>
                                    1. Persönliche Daten (Pflichtfelder)
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Vorname <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={editingUser.firstName || ""}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            firstName: e.target.value,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm outline-none text-slate-800 font-normal placeholder:text-slate-400"
                                        placeholder="Z.B. Max"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Nachname <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={editingUser.lastName || ""}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            lastName: e.target.value,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm outline-none text-slate-800 font-normal placeholder:text-slate-400"
                                        placeholder="Z.B. Mustermann"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Geschlecht <span className="text-red-500">*</span>
                                      </label>
                                      <select
                                        value={editingUser.gender || "m"}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            gender: e.target.value as "m" | "w",
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 bg-white rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all cursor-pointer text-sm text-slate-800 font-normal"
                                      >
                                        <option value="m">männlich</option>
                                        <option value="w">weiblich</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                                        <span>Geburtsdatum</span>
                                        {editingUser.birthDate && calculateAge(editingUser.birthDate) !== null && (
                                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                            {calculateAge(editingUser.birthDate)} J. {calculateAge(editingUser.birthDate)! < 18 ? "(Jugend/U18)" : "(Erwachsen)"}
                                          </span>
                                        )}
                                      </label>
                                      <input
                                        type="date"
                                        min="1900-01-01"
                                        max="2099-12-31"
                                        value={editingUser.birthDate || ""}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val.length <= 10) {
                                            setEditingUser({
                                              ...editingUser,
                                              birthDate: val,
                                            });
                                          }
                                        }}
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* 2. KONTAKTINFORMATIONEN */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                                    <i className="fa-solid fa-address-book text-xs"></i>
                                    2. Kontaktinformationen (Optional)
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        E-Mail-Adresse <span className="text-slate-400 font-normal normal-case">(optional)</span>
                                      </label>
                                      <input
                                        type="email"
                                        value={editingUser.email || ""}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            email: e.target.value,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm bg-white text-slate-800"
                                        placeholder="name@beispiel.de"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Telefonnummer <span className="text-slate-400 font-normal normal-case">(optional)</span>
                                      </label>
                                      <input
                                        type="tel"
                                        value={editingUser.phone || ""}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            phone: e.target.value,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal placeholder:text-slate-400"
                                        placeholder="+49 170 1234567"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* 3. ZUGANGSDATEN & PASSWORT */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                                    <i className="fa-solid fa-key text-xs"></i>
                                    3. Zugangsdaten &amp; Passwort
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Benutzername <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={editingUser.name || ""}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            name: e.target.value,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 rounded-xl bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all text-sm text-slate-800 font-normal placeholder:text-slate-400"
                                        placeholder="z. B. maxmustermann"
                                        required
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Rolle <span className="text-red-500">*</span>
                                      </label>
                                      <select
                                        value={editingUser.role || Role.USER}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            role: e.target.value as Role,
                                          })
                                        }
                                        className="w-full h-10 px-3.5 border border-slate-200 bg-white rounded-xl outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all cursor-pointer text-sm text-slate-800 font-normal"
                                      >
                                        <option value={Role.MITGLIED}>{t("admin.users.roleStandard")}</option>
                                        <option value={Role.ADMIN}>Vereinsadministrator</option>
                                      </select>
                                    </div>
                                    <div className="md:col-span-2">
                                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Passwort <span className="text-red-500">*</span>
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          value={editingUser.password || ""}
                                          onChange={(e) =>
                                            setEditingUser({
                                              ...editingUser,
                                              password: e.target.value,
                                              mustChangePassword: false,
                                            })
                                          }
                                          disabled={u.name === "superadmin"}
                                          className={`flex-1 h-10 px-3.5 border rounded-xl transition-all text-sm font-mono ${
                                            u.name === "superadmin"
                                              ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                                              : "bg-white border-slate-200 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 placeholder:font-sans"
                                          }`}
                                          placeholder="Passwort eingeben..."
                                          title={
                                            u.name === "superadmin"
                                              ? "Das Passwort des Super-Admins kann hier nicht geändert werden."
                                              : ""
                                          }
                                          required
                                        />
                                        {u.name !== "superadmin" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                                              let pwd = "";
                                              for (let i = 0; i < 8; i++) {
                                                pwd += chars.charAt(Math.floor(Math.random() * chars.length));
                                              }
                                              setEditingUser({
                                                ...editingUser,
                                                password: pwd,
                                                mustChangePassword: true,
                                              });
                                            }}
                                            className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                                            title="Einmalpasswort generieren"
                                          >
                                            <i className="fa-solid fa-key"></i>
                                            <span>Generieren</span>
                                          </button>
                                        )}
                                      </div>
                                      {editingUser.mustChangePassword && (
                                        <p className="text-xs text-amber-700 mt-1.5 font-medium flex items-center gap-1">
                                          <i className="fa-solid fa-circle-info text-[11px]"></i>
                                          Benutzer wird beim nächsten Login zur Passwortänderung aufgefordert.
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* E-Mail-Zugangslinks & Schnellauslöser */}
                                  {(() => {
                                    const trimmedEmail = (editingUser.email || "").trim();
                                    const hasEmail = Boolean(trimmedEmail.length > 0 && trimmedEmail.includes("@"));

                                    let activationDisabled = false;
                                    let activationReason = "";
                                    let resetDisabled = false;
                                    let resetReason = "";
                                    let commonReason = "";

                                    if (!hasEmail) {
                                      activationDisabled = true;
                                      resetDisabled = true;
                                      commonReason = "E-Mail-Adresse erforderlich";
                                      activationReason = "E-Mail-Adresse erforderlich";
                                      resetReason = "E-Mail-Adresse erforderlich";
                                    } else if (clubEmailStatus.isPaused) {
                                      activationDisabled = true;
                                      resetDisabled = true;
                                      commonReason = "E-Mail-System im Verein pausiert";
                                      activationReason = "E-Mail-System im Verein pausiert";
                                      resetReason = "E-Mail-System im Verein pausiert";
                                    } else {
                                      if (!clubEmailStatus.activationActive) {
                                        activationDisabled = true;
                                        activationReason = "Aktivierungsmails im Verein deaktiviert";
                                      }
                                      if (!clubEmailStatus.resetActive) {
                                        resetDisabled = true;
                                        resetReason = "Passwortreset im Verein deaktiviert";
                                      }
                                      if (activationDisabled && resetDisabled) {
                                        commonReason = "E-Mail-Vorlagen im Verein deaktiviert";
                                      } else if (activationDisabled) {
                                        commonReason = activationReason;
                                      } else if (resetDisabled) {
                                        commonReason = resetReason;
                                      }
                                    }

                                    const targetUserForMail: User = {
                                      ...u,
                                      ...editingUser,
                                      email: editingUser.email,
                                    };

                                    return (
                                      <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                        <div className="flex flex-col">
                                          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                            <i className="fa-regular fa-paper-plane text-slate-400 text-xs"></i>
                                            <span>Zugangslinks per E-Mail:</span>
                                          </span>
                                          {commonReason && (
                                            <span className="text-[11px] text-slate-400 font-normal mt-0.5">
                                              Hinweis: {commonReason}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={activationDisabled}
                                            onClick={() => openSendActivationModal(targetUserForMail)}
                                            title={activationReason ? `Aktivierungsmail: ${activationReason}` : "Aktivierungsmail an Mitglied senden"}
                                            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                              activationDisabled
                                                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                                                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 shadow-2xs cursor-pointer"
                                            }`}
                                          >
                                            <i className="fa-regular fa-envelope text-[11px]"></i>
                                            <span>Aktivierungsmail</span>
                                          </button>

                                          <button
                                            type="button"
                                            disabled={resetDisabled}
                                            onClick={() => openSendResetModal(targetUserForMail)}
                                            title={resetReason ? `Passwortreset: ${resetReason}` : "Passwortreset-Mail an Mitglied senden"}
                                            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                              resetDisabled
                                                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                                                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 shadow-2xs cursor-pointer"
                                            }`}
                                          >
                                            <i className="fa-solid fa-arrows-rotate text-[11px]"></i>
                                            <span>Passwort-Reset</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* 4. PRIVATSPHÄRE & APP-ANZEIGE */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider border-b border-slate-200/60 pb-1.5 flex items-center gap-1.5">
                                    <i className="fa-solid fa-user-shield text-xs"></i>
                                    4. Privatsphäre &amp; App-Anzeige
                                  </h4>
                                  <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200/80">
                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                      <input
                                        type="checkbox"
                                        checked={!!editingUser.showContactInfo}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            showContactInfo: e.target.checked,
                                          })
                                        }
                                        className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                                      />
                                      <div>
                                        <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 block">
                                          Kontaktdaten freigeben
                                        </span>
                                        <span className="text-xs text-slate-500 block font-normal">
                                          Meine E-Mail und Telefonnummer in Börse/Rangliste für Vereinsmitglieder anzeigen
                                        </span>
                                      </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                                      <input
                                        type="checkbox"
                                        id="inline-user-onboarding-pending"
                                        checked={!!editingUser.onboarding_pending}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            onboarding_pending: e.target.checked,
                                          })
                                        }
                                        className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                                      />
                                      <div>
                                        <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 flex items-center gap-1.5">
                                          <span>Onboarding ausstehend</span>
                                          {editingUser.onboarding_pending && (
                                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                                              Aktiv
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-xs text-slate-500 block font-normal">
                                          Beim nächsten Login des Mitglieds wird das Onboardingmodal automatisch angezeigt
                                        </span>
                                      </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group select-none pt-2 border-t border-slate-100">
                                      <input
                                        type="checkbox"
                                        id="inline-user-is-suspended"
                                        checked={!!editingUser.isSuspended}
                                        onChange={(e) =>
                                          setEditingUser({
                                            ...editingUser,
                                            isSuspended: e.target.checked,
                                          })
                                        }
                                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-600"
                                      />
                                      <div>
                                        <span className="text-xs font-semibold text-slate-800 group-hover:text-rose-700 flex items-center gap-1.5">
                                          <span>Benutzerkonto sperren</span>
                                          {editingUser.isSuspended && (
                                            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] font-bold rounded">
                                              Gesperrt
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-xs text-slate-500 block font-normal">
                                          Anmeldung für dieses Mitglied vorübergehend deaktivieren
                                        </span>
                                      </div>
                                    </label>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/60">
                                  <div>
                                    {editingUser && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setInlineEditingUserId(null);
                                          handleDeleteUser(editingUser.name);
                                        }}
                                        className="h-10 px-4 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200/80 rounded-xl font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                                      >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                        <span>Mitglied löschen</span>
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditingUserId(null)}
                                      className="h-10 px-4 min-w-[105px] justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer shadow-2xs flex items-center"
                                    >
                                      Abbrechen
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveUser()}
                                      className="h-10 px-5 min-w-[175px] justify-center bg-[var(--color-primary)] text-white hover:brightness-110 rounded-xl font-semibold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                                    >
                                      <i className="fa-solid fa-floppy-disk text-xs"></i>
                                      <span>Änderungen speichern</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          const isInvitedOrNeverLoggedIn = !(u.lastLogin || u.last_login || u.lastLoginAt);

                          return (
                            <div
                              key={u.id || u.name + "-" + idx}
                              className={`grid grid-cols-1 md:grid-cols-12 gap-3 p-4 items-center transition-colors border-b border-slate-100 ${
                                selectedUserIds.has(u.name) ? "bg-emerald-50/50" : "hover:bg-slate-50"
                              }`}
                            >
                              {/* 1. Checkbox */}
                              <div className="col-span-1 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.has(u.name)}
                                  onChange={(e) => {
                                    const next = new Set(selectedUserIds);
                                    if (e.target.checked) next.add(u.name);
                                    else next.delete(u.name);
                                    setSelectedUserIds(next);
                                  }}
                                  className="w-4 h-4 text-emerald-600 bg-white border-slate-300 rounded focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                />
                              </div>

                              {/* 2. Name */}
                              <div className="md:col-span-3 flex items-center gap-3 min-w-0">
                                <UserAvatar user={u} size="md" />
                                <div className="flex flex-col justify-center min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`font-semibold text-sm truncate ${
                                        u.isSuspended ? "text-slate-400 line-through" : "text-slate-900"
                                      }`}
                                    >
                                      {u.lastName || u.firstName
                                        ? `${u.lastName || ""}, ${u.firstName || ""}`
                                            .trim()
                                            .replace(/^,|,$/, "")
                                        : u.name}
                                    </span>
                                    <span className="text-xs text-slate-400 font-normal">
                                      ({u.gender === "w" ? "Damen" : "Herren"})
                                    </span>
                                    {(() => {
                                      const age = calculateAge(u.birthDate);
                                      if (age !== null) {
                                        return (
                                          <span
                                            className="text-xs text-slate-400 font-normal"
                                            title={`Geburtsdatum: ${u.birthDate}`}
                                          >
                                            • {age} {t("admin.users.ageYears")} {age < 18 ? `(U${age < 14 ? "14" : "18"})` : ""}
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                              </div>

                              {/* 3. Benutzername & Passwort */}
                              <div className="md:col-span-2 flex flex-col justify-center min-w-0">
                                <span className="text-sm text-slate-600 font-normal truncate" title={u.name}>
                                  {u.name}
                                </span>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-normal mt-0.5">
                                  <span className="font-mono">
                                    {revealedPasswords[u.name] ? u.password || t("admin.users.passwordNone") : "••••••••"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRevealedPasswords((prev) => ({
                                        ...prev,
                                        [u.name]: !prev[u.name],
                                      }));
                                    }}
                                    className="text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer p-0.5 transition-colors"
                                    title={
                                      revealedPasswords[u.name]
                                        ? t("admin.users.passwordHide")
                                        : t("admin.users.passwordShow")
                                    }
                                  >
                                    <i
                                      className={`fa-solid ${revealedPasswords[u.name] ? "fa-eye-slash" : "fa-eye"} text-[10px]`}
                                    ></i>
                                  </button>
                                </div>
                              </div>

                              {/* 4. E-Mail */}
                              <div className="md:col-span-2 flex items-center min-w-0">
                                {u.is_placeholder_email ||
                                (u.email && u.email.startsWith("no-email.") && u.email.endsWith("@internal.app")) ||
                                !u.email ? (
                                  <span className="text-sm text-slate-400 italic truncate">
                                    {t("admin.users.noEmail")}
                                  </span>
                                ) : (
                                  <span className="text-sm text-slate-600 font-normal truncate" title={u.email}>
                                    {u.email}
                                  </span>
                                )}
                              </div>

                              {/* 5. Rolle */}
                              <div className="md:col-span-2 flex flex-col justify-center min-w-0">
                                <span className="font-medium text-sm text-slate-900 truncate">
                                  {u.role === Role.ADMIN ? t("admin.users.roleAdmin") : t("admin.users.roleMember")}
                                </span>
                                {u.isSuspended && (
                                  <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                    <span>{t("admin.users.statusSuspended")}</span>
                                  </div>
                                )}
                              </div>

                              {/* 6. Aktionen */}
                              <div className="md:col-span-2 flex justify-end items-center gap-1.5">
                                {((u.id !== currentUser.id && u.name !== currentUser.name) ||
                                  (currentUser.id && currentUser.id.startsWith("temp-admin-"))) &&
                                  onActAsUser && (
                                    <button
                                      type="button"
                                      onClick={() => onActAsUser(u)}
                                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                      title={t("admin.users.actionActAs")}
                                    >
                                      <i className="fa-solid fa-user-secret text-xs text-slate-500"></i>
                                      <span className="hidden xl:inline">{t("admin.users.actionActAs")}</span>
                                    </button>
                                  )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser({
                                      ...u,
                                      showContactInfo: u.showContactInfo !== false,
                                      onboarding_pending: !!(u.onboarding_pending ?? u.onboardingPending),
                                      onboardingPending: !!(u.onboarding_pending ?? u.onboardingPending),
                                      gender: u.gender || "m",
                                    });
                                    setInlineEditingUserId(u.name);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                                  title={t("common.edit")}
                                >
                                  <i className="fa-solid fa-pen-to-square text-xs"></i>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {sortedAndFilteredUsers.length === 0 && (
                          <div className="p-8 text-center text-slate-400 font-bold text-sm">
                            {t("admin.users.noMembersFound")}{" "}
                            {userSearchQuery && `für "${userSearchQuery}"`}
                          </div>
                        )}
                      </div>

                      {totalUserPages > 1 && (
                        <div className="flex justify-between items-center bg-slate-50 h-8 px-3 py-1 border-t border-slate-100 font-sans font-medium">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {t("admin.users.pageOf").replace("{page}", String(userPage)).replace("{total}", String(totalUserPages))} ({sortedAndFilteredUsers.length} {t("admin.users.memberPlural")})
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={userPage === 1}
                              onClick={() =>
                                setUserPage((prev) => Math.max(prev - 1, 1))
                              }
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
                            >
                              <i className="fa-solid fa-chevron-left mr-1"></i>{" "}
                              {t("admin.users.pagePrev")}
                            </button>
                            <button
                              type="button"
                              disabled={userPage === totalUserPages}
                              onClick={() =>
                                setUserPage((prev) =>
                                  Math.min(prev + 1, totalUserPages),
                                )
                              }
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
                            >
                              {t("admin.users.pageNext")}{" "}
                              <i className="fa-solid fa-chevron-right ml-1"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CSV Mass Import */}
                  <div className="bg-slate-50 p-6 sm:p-8 rounded-[1rem] border border-slate-100 space-y-6 shadow-sm">
                    <div>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="text-sm font-black text-[var(--color-primary)] uppercase flex items-center gap-2">
                          <i className="fa-solid fa-file-import"></i>{" "}
                          Massenupload (CSV)
                        </h3>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={exportMembersCSV}
                            className="text-blue-800 uppercase border-b-2 border-blue-500 hover:bg-blue-50 px-2.5 py-1.5 transition-colors flex items-center gap-1.5 rounded-lg text-sm font-medium"
                            title="Aktuelle Mitgliederliste herunterladen"
                          >
                            Exportieren (CSV){" "}
                            <i className="fa-solid fa-file-csv text-blue-600"></i>
                          </button>
                          <button
                            type="button"
                            onClick={downloadTemplate}
                            className="text-[var(--color-primary)] uppercase border-b-2 border-orange-500 hover:bg-orange-50 px-2.5 py-1.5 transition-colors flex items-center gap-1.5 rounded-lg text-sm font-medium"
                          >
                            Muster Herunterladen{" "}
                            <i className="fa-solid fa-download text-orange-500"></i>
                          </button>
                        </div>
                      </div>

                      {importErrors.length > 0 && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-[10px] text-red-700 font-medium space-y-1">
                          <p className="font-extrabold uppercase text-red-800 flex items-center gap-1.5 mb-1 tracking-wider">
                            <i className="fa-solid fa-triangle-exclamation"></i>{" "}
                            Einige Zeilen wurden wegen Problemen skipped:
                          </p>
                          <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto font-semibold">
                            {importErrors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="relative">
                        <input
                          type="file"
                          id="csv-upload"
                          ref={fileInputRef}
                          className="hidden"
                          accept=".csv,text/csv,text/plain"
                          onChange={handleFileUpload}
                          onClick={(e) => {
                            (e.target as HTMLInputElement).value = "";
                          }}
                        />
                        <label
                          htmlFor="csv-upload"
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingCsv(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            setIsDraggingCsv(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingCsv(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                              processCsvFile(file);
                            }
                          }}
                          className={`flex flex-col items-center justify-center gap-4 w-full p-8 border-2 rounded-3xl hover:border-[var(--color-primary)] hover:bg-white transition-all cursor-pointer group bg-white/50 ${
                            selectedFileName
                              ? "border-[#10b981] bg-emerald-50 border-solid ring-4 ring-emerald-500/10"
                              : isDraggingCsv
                              ? "border-[var(--color-primary)] bg-orange-50/50 border-dashed ring-4 ring-orange-500/10"
                              : "border-dashed border-slate-300"
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              selectedFileName
                                ? "fa-file-circle-check text-[#10b981] animate-bounce"
                                : isDraggingCsv
                                ? "fa-cloud-arrow-up text-[var(--color-primary)] scale-110"
                                : "fa-cloud-arrow-up text-slate-400 group-hover:text-[var(--color-primary)]"
                            } text-3xl transition-transform`}
                          ></i>
                          <div className="text-center">
                            <span
                              className={`block font-black text-[10px] uppercase tracking-widest ${
                                selectedFileName
                                  ? "text-[#10b981]"
                                  : isDraggingCsv
                                  ? "text-[var(--color-primary)] font-bold"
                                  : "text-slate-500 group-hover:text-[var(--color-primary)]"
                              }`}
                            >
                              {selectedFileName
                                ? "✓ DATEI ERFOLGREICH GEWÄHLT"
                                : isDraggingCsv
                                ? "CSV-DATEI HIER LOSLASSEN"
                                : "Mitglieder-CSV zur Einrichtung hochladen"}
                            </span>
                            {selectedFileName ? (
                              <span className="block mt-1.5 text-xs text-slate-700 font-extrabold uppercase tracking-tight">
                                {selectedFileName}
                              </span>
                            ) : (
                              <span className="block mt-1 text-[11px] text-slate-400 font-normal">
                                Klicken, um Datei auszuwählen oder per Drag & Drop ablegen
                              </span>
                            )}
                          </div>
                        </label>
                      </div>

                      {csvPreview.length > 0 && (
                        <div className="mt-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm animate-in zoom-in duration-300">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-3">
                            {csvPreview.length} gültige Mitgliederzeilen erkannt
                          </p>
                          <button
                            type="button"
                            onClick={importUsers}
                            className="w-full bg-[var(--color-primary)] text-white hover:bg-black rounded-xl uppercase tracking-wide shadow-md active:scale-95 transition-all flex items-center justify-center h-10 text-sm font-semibold"
                          >
                            Import Jetzt Starten
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-[var(--color-accent-3)]/10 border border-[var(--color-accent-3)]/20 rounded-2xl text-[11px] font-semibold text-slate-700 mt-6 leading-relaxed">
                      <p className="uppercase font-black text-[var(--color-primary)] mb-1 text-xs">
                        <i className="fa-solid fa-lightbulb"></i> CSV-IMPORT FORMAT HINWEIS
                      </p>
                      Die Datei muss eine Tabellen-CSV sein mit dem Header{" "}
                      <code className="bg-white/80 px-1.5 py-0.5 rounded text-slate-900 font-mono text-[11px]">
                        Benutzername;Passwort;Rolle;Vorname;Nachname;Email;Telefon;Geschlecht
                      </code>{" "}
                      (Spaltentrennung via Komma oder Semikolon). Als Rolle sind{" "}
                      <code className="bg-white/80 px-1.5 py-0.5 rounded text-slate-900 font-mono text-[11px]">
                        user
                      </code>{" "}
                      und{" "}
                      <code className="bg-white/80 px-1.5 py-0.5 rounded text-slate-900 font-mono text-[11px]">
                        admin
                      </code>{" "}
                      erlaubt.
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: MITGLIEDER-ONBOARDING */}
              {currentTab === "onboarding" && (
                <div className="animate-in fade-in duration-300">
                  <AdminOnboardingTab
                    settings={settings}
                    currentClubId={currentClubId}
                    users={users}
                    onUpdateSettings={onUpdateSettings}
                    onUpdateUsers={onUpdateUsers}
                    primaryColor={primaryColor}
                  />
                </div>
              )}

              {/* TAB: BENACHRICHTIGUNGEN & MASSENVERWALTUNG */}
              {currentTab === "notifications" && (
                <div className="animate-in fade-in duration-300">
                  <AdminNotificationsManagement
                    users={users}
                    currentUser={currentUser}
                    currentClubId={settings?.vereinsId || "sv-neuhausen"}
                    clubName={settings?.clubName || settings?.name || "Tennisclub e.V."}
                    onUpdateUsers={onUpdateUsers}
                    tenantColors={[
                      primaryColor || settings?.primaryColor || "#1b4332",
                      accentColor || settings?.accentColor || "#c04d2b",
                      accentColor2 || settings?.accentColor2 || "#0f172a",
                      accentColor3 || settings?.accentColor3 || "#ccff00",
                    ].filter(Boolean) as string[]}
                  />
                </div>
              )}

              {/* TAB 5: DATENVERWALTUNG */}
              {currentTab === "database" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  {/* EINZELNE BUCHUNGEN VERWALTEN (APPOINTMENTS MANAGER) */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div className="text-left">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-calendar-check text-[var(--color-primary)]"></i> {t("admin.database.appointmentsTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.database.appointmentsSubtitle")}
                        </p>
                      </div>

                      {/* Summary Metric */}
                      <div className="px-3.5 py-1.5 bg-slate-100 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700">
                        {t("admin.database.totalEntries").replace("{count}", String(filteredAppointments.length))}
                      </div>
                    </div>

                    {/* Search & Filter Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                      {/* Search query */}
                      <div className="md:col-span-5 space-y-1 text-left">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t("admin.database.searchAppointments")}
                        </label>
                        <div className="relative">
                          <input 
                            type="text"
                            value={bookingSearchQuery}
                            onChange={(e) =>
                              setBookingSearchQuery(e.target.value)
                            }
                            placeholder={t("admin.database.searchAppointmentsPlaceholder")}
                            className="w-full h-10 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all font-normal placeholder:text-slate-400"
                          />
                          <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        </div>
                      </div>

                      {/* Filter by Type */}
                      <div className="md:col-span-4 space-y-1 text-left">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t("admin.database.categoryPeriod")}
                        </label>
                        <select 
                          value={bookingFilterType}
                          onChange={(e: any) =>
                            setBookingFilterType(e.target.value)
                          }
                          className="w-full h-10 px-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 cursor-pointer font-normal"
                        >
                          <option value="all">{t("admin.database.filterAll")}</option>
                          <option value="future">{t("admin.database.filterFuture")}</option>
                          <option value="past">{t("admin.database.filterPast")}</option>
                          <option value="bookings">
                            {t("admin.database.filterBookings")}
                          </option>
                          <option value="locks">{t("admin.database.filterLocks")}</option>
                        </select>
                      </div>

                      {/* Filter by Court */}
                      <div className="md:col-span-3 space-y-1 text-left">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          {t("admin.database.specificCourt")}
                        </label>
                        <select 
                          value={bookingFilterCourt}
                          onChange={(e) =>
                            setBookingFilterCourt(e.target.value)
                          }
                          className="w-full h-10 px-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 cursor-pointer font-normal"
                        >
                          <option value="all">{t("admin.database.allCourts")}</option>
                          {settings.courts?.map((court) => (
                            <option key={court} value={court}>
                              {court}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Appointments List */}
                    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                      {/* Table header (hidden on mobile) */}
                      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 text-left">
                        <div className="col-span-3">{t("admin.database.colDateTime")}</div>
                        <div className="col-span-2">{t("admin.database.colCourt")}</div>
                        <div className="col-span-5">{t("admin.database.colDetails")}</div>
                        <div className="col-span-2 text-right">{t("admin.database.colActions")}</div>
                      </div>

                      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                        {paginatedAppointments.map((bk) => {
                          if (!bk) return null;
                          let dateFmt = bk.date || "";
                          try {
                            if (bk.date) {
                              dateFmt = new Date(bk.date).toLocaleDateString(
                                "de-DE",
                                {
                                  weekday: "short",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                },
                              );
                            }
                          } catch {
                            dateFmt = bk.date || "";
                          }

                          // Identify creator
                          const creatorUser = bk.bookedBy && users ? users[bk.bookedBy] : null;
                          const creatorName = creatorUser ? formatPlayerName(creatorUser.name || creatorUser.id || "") : "";

                          return (
                            <div
                              key={bk.id}
                              className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-3 hover:bg-slate-50/70 transition-colors items-center text-left"
                            >
                              {/* Date and time column */}
                              <div className="col-span-3 flex flex-col justify-center">
                                <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                                  <i className="fa-regular fa-calendar text-[var(--color-primary)]"></i>{" "}
                                  {dateFmt}
                                </span>
                                <span className="font-mono text-xs text-slate-500 font-medium tracking-tight mt-0.5">
                                  <i className="fa-regular fa-clock text-slate-400"></i>{" "}
                                  {bk.time} Uhr
                                </span>
                              </div>

                              {/* Court column */}
                              <div className="col-span-2 md:block flex justify-between items-center bg-slate-50 md:bg-transparent px-2.5 py-1.5 md:p-0 rounded-lg">
                                <span className="block md:hidden text-xs font-semibold text-slate-500">
                                  {t("admin.database.colCourt")}
                                </span>
                                <span className="font-semibold text-xs text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                                  {bk.court}
                                </span>
                              </div>

                              {/* Details column (Players or Lock description) */}
                              <div className="col-span-5 space-y-1.5 text-left py-2 md:py-0">
                                {bk.isLocked ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                      <i className="fa-solid fa-lock"></i>{" "}
                                      {t("admin.database.adminLock")}
                                    </span>
                                    <p className="text-xs font-semibold text-rose-800 mt-1">
                                      {bk.reason || t("admin.database.courtLocked")}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <i className="fa-solid fa-users"></i>{" "}
                                      {t("admin.database.memberBooking")}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {bk.players && bk.players.length > 0 ? (
                                        bk.players.map((p, idx) => (
                                          <span
                                            key={idx}
                                            className="inline-block bg-slate-100 px-2 py-0.5 rounded-md text-xs text-slate-700 font-medium"
                                          >
                                            {formatPlayerName(p)}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs text-slate-400 italic">
                                          {t("admin.database.noPlayersEntered")}
                                        </span>
                                      )}
                                    </div>
                                    {creatorName && (
                                      <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                                        {t("admin.database.bookedBy")} {creatorName}
                                      </p>
                                    )}
                                    {bk.hasBallMachine && (
                                      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md mt-1 border border-emerald-200/60">
                                        <i className="fa-solid fa-microchip"></i>{" "}
                                        {t("admin.database.withBallMachine")}
                                      </div>
                                    )}
                                    {bk.comment && (
                                      <p className="text-xs text-slate-600 italic mt-1 border-l-2 border-slate-300 pl-2">
                                        "{bk.comment}"
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Actions column */}
                              <div className="col-span-2 flex justify-end gap-1.5 items-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartEditAdminBooking(bk)
                                  }
                                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 hover:bg-[var(--color-primary)] hover:text-white transition-all flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                                  title={t("admin.database.editBooking")}
                                >
                                  <i className="fa-solid fa-pen text-xs"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteAdminBooking(bk.id)
                                  }
                                  className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center shadow-2xs shrink-0 border border-rose-100 cursor-pointer"
                                  title={t("admin.database.deleteBooking")}
                                >
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {paginatedAppointments.length === 0 && (
                          <div className="p-8 text-center text-slate-400 font-medium text-xs italic">
                            {t("admin.database.noAppointmentsFound")}
                          </div>
                        )}
                      </div>

                      {/* Pagination control block */}
                      {bkTotalPages > 1 && (
                        <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 border-t border-slate-200">
                          <div className="text-xs text-slate-500 font-medium text-left">
                            {t("admin.users.pageOf").replace("{page}", String(bookingPage)).replace("{total}", String(bkTotalPages))} (
                            {t("admin.database.appointmentsFound").replace("{count}", String(filteredAppointments.length))})
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={bookingPage === 1}
                              onClick={() =>
                                setBookingPage((prev) => Math.max(prev - 1, 1))
                              }
                              className="h-8 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors cursor-pointer"
                            >
                              <i className="fa-solid fa-chevron-left mr-1"></i>{" "}
                              {t("common.back")}
                            </button>
                            <button
                              type="button"
                              disabled={bookingPage === bkTotalPages}
                              onClick={() =>
                                setBookingPage((prev) =>
                                  Math.min(prev + 1, bkTotalPages),
                                )
                              }
                              className="h-8 px-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors cursor-pointer"
                            >
                              {t("admin.users.pageNext")}{" "}
                              <i className="fa-solid fa-chevron-right ml-1"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* EDIT SINGLE BOOKING MODAL */}
                  {editingAdminBooking && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl w-full max-w-lg overflow-hidden my-8 text-left animate-in zoom-in duration-200">
                        {/* Header */}
                        <div className="bg-slate-900 p-5 sm:p-6 text-white flex justify-between items-center">
                          <div className="text-left">
                            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                              <i className="fa-solid fa-edit text-[var(--color-primary)]"></i> {t("admin.database.editModalTitle")}
                            </h3>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                              ID: {editingAdminBooking.id}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingAdminBooking(null)}
                            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors cursor-pointer"
                          >
                            <i className="fa-solid fa-xmark text-sm"></i>
                          </button>
                        </div>

                        {/* Form body */}
                        <form
                          onSubmit={handleSaveAdminBooking}
                          className="p-5 sm:p-6 space-y-4 text-left"
                        >
                          {/* Booking/Lock Type Switcher Toggle */}
                          <div className="space-y-1.5 text-left">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {t("admin.database.bookingType")}
                            </label>
                            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                              <button
                                type="button"
                                onClick={() => setEditBkIsLocked(false)}
                                className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  !editBkIsLocked
                                    ? "bg-[var(--color-primary)] text-white shadow-2xs"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                              >
                                <i className="fa-solid fa-users"></i>{" "}
                                {t("admin.database.matchSlot")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditBkIsLocked(true)}
                                className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  editBkIsLocked
                                    ? "bg-rose-600 text-white shadow-2xs"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                              >
                                <i className="fa-solid fa-lock"></i> {t("admin.database.adminLockSlot")}
                              </button>
                            </div>
                          </div>

                          {/* Date, Time, Court Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left">
                            {/* Date */}
                            <div className="space-y-1 text-left">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("common.date")}
                              </label>
                              <input 
                                type="date"
                                required
                                value={editBkDate}
                                onChange={(e) => setEditBkDate(e.target.value)}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none text-slate-800 transition-all font-normal"
                              />
                            </div>

                            {/* Start Time */}
                            <div className="space-y-1 text-left">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("common.time")}
                              </label>
                              <select 
                                value={editBkTime}
                                onChange={(e) => setEditBkTime(e.target.value)}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none cursor-pointer text-slate-800 transition-all font-normal"
                              >
                                {TIME_SLOTS.map((slot) => (
                                  <option key={slot} value={slot}>
                                    {slot}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Court selection */}
                            <div className="space-y-1 text-left">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("common.court")}
                              </label>
                              <select 
                                value={editBkCourt}
                                onChange={(e) => setEditBkCourt(e.target.value)}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none cursor-pointer text-slate-800 transition-all font-normal"
                              >
                                {settings.courts?.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* LOCK FIELDS (Is Locked) */}
                          {editBkIsLocked ? (
                            <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200 text-left">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("admin.database.lockReason")}{" "}
                                <span className="text-rose-500">*</span>
                              </label>
                              <input 
                                type="text"
                                required={editBkIsLocked}
                                value={editBkReason}
                                onChange={(e) =>
                                  setEditBkReason(e.target.value)
                                }
                                placeholder={t("admin.database.lockReasonPlaceholder")}
                                className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all font-normal placeholder:text-slate-400"
                              />
                            </div>
                          ) : (
                            /* USER BOOKING SPECIFIC FIELDS */
                            <div className="space-y-3.5 animate-in slide-in-from-top-2 duration-200 text-left">
                              {/* Players List with Suggestion Autocomplete */}
                              <div className="space-y-1.5 relative text-left">
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t("admin.database.registeredPlayers")} ({editBkPlayers.length})
                                </label>

                                {/* Existing Players List visual tags */}
                                <div className="flex flex-wrap gap-1.5 p-2.5 border border-slate-200 rounded-xl bg-slate-50/70 mb-2">
                                  {editBkPlayers.map((player, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg text-xs font-semibold border border-emerald-200/80"
                                    >
                                      {player}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemovePlayerFromEditList(idx)
                                        }
                                        className="text-emerald-600 hover:text-rose-600 font-bold focus:outline-none ml-0.5 cursor-pointer"
                                        title="Spieler entfernen"
                                      >
                                        &times;
                                      </button>
                                    </span>
                                  ))}
                                  {editBkPlayers.length === 0 && (
                                    <span className="text-xs text-slate-400 italic">
                                      {t("admin.database.noPlayersYet")}
                                    </span>
                                  )}
                                </div>

                                {/* Add player manual input / suggestion search */}
                                <div className="flex gap-2">
                                  <input 
                                    type="text"
                                    value={editBkNewPlayerQuery}
                                    onChange={(e) => {
                                      setEditBkNewPlayerQuery(e.target.value);
                                      setEditBkShowSuggestions(true);
                                    }}
                                    onFocus={() =>
                                      setEditBkShowSuggestions(true)
                                    }
                                    placeholder={t("admin.database.searchPlayerPlaceholder")}
                                    className="flex-1 h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddPlayerToEditList(
                                        editBkNewPlayerQuery,
                                      )
                                    }
                                    disabled={!editBkNewPlayerQuery.trim()}
                                    className="h-10 px-4 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-[var(--color-primary)] disabled:opacity-40 select-none active:scale-95 transition-all cursor-pointer"
                                  >
                                    {t("common.confirm")}
                                  </button>
                                </div>

                                {/* Suggestion list overlay */}
                                {editBkShowSuggestions &&
                                  editPlayerSuggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-[100] overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                      {editPlayerSuggestions.map((u, idx) => {
                                        const fullName =
                                          u.lastName || u.firstName
                                            ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
                                            : u.name;
                                        return (
                                          <button
                                            key={u.id || u.name + "-" + idx}
                                            type="button"
                                            onClick={() =>
                                              handleAddPlayerToEditList(
                                                fullName,
                                              )
                                            }
                                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-xs font-semibold text-slate-700 block transition-colors cursor-pointer"
                                          >
                                            {fullName}{" "}
                                            <span className="text-[11px] text-slate-400 font-normal italic">
                                              ({u.name})
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                              </div>

                              {/* Extra user details (Ballmachine & Comment) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 text-left">
                                {/* Comment */}
                                <div className="space-y-1">
                                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    {t("admin.database.commentNote")}
                                  </label>
                                  <input 
                                    type="text"
                                    value={editBkComment}
                                    onChange={(e) =>
                                      setEditBkComment(e.target.value)
                                    }
                                    placeholder={t("admin.database.commentPlaceholder")}
                                    className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                                  />
                                </div>

                                {/* Ballmachine usage */}
                                {(settings?.reservationRules
                                  ?.availableBallMachines ?? 1) > 0 && (
                                  <div className="flex items-center gap-3 pt-6">
                                    <input
                                      type="checkbox"
                                      id="editBkHasBallMachine"
                                      checked={editBkHasBallMachine}
                                      onChange={(e) =>
                                        setEditBkHasBallMachine(
                                          e.target.checked,
                                        )
                                      }
                                      className="w-4 h-4 text-[var(--color-primary)] border-slate-300 rounded focus:ring-[var(--color-primary)] cursor-pointer"
                                    />
                                    <label
                                      htmlFor="editBkHasBallMachine"
                                      className="text-xs font-semibold text-slate-800 cursor-pointer user-select-none flex items-center gap-1.5"
                                    >
                                      <i className="fa-solid fa-microchip text-[var(--color-primary)] text-xs"></i>{" "}
                                      {t("admin.database.useBallMachine")}
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Modal Footer Controls */}
                          <div className="pt-4 border-t border-slate-100 flex gap-3">
                            <button
                              type="button"
                              onClick={() => setEditingAdminBooking(null)}
                              className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all text-center cursor-pointer flex items-center justify-center"
                            >
                              {t("common.cancel")}
                            </button>
                            <button
                              type="submit"
                              className={`flex-1 h-10 rounded-xl text-white text-xs font-semibold transition-all active:scale-95 text-center cursor-pointer flex items-center justify-center gap-2 shadow-xs ${
                                editBkIsLocked
                                  ? "bg-rose-600 hover:bg-rose-700"
                                  : "bg-[var(--color-primary)] hover:brightness-110"
                              }`}
                            >
                              <i className="fa-solid fa-check"></i>
                              <span>{editBkIsLocked ? t("admin.database.saveLock") : t("admin.database.saveBooking")}</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* PUBLIC CALENDAR SHARE WIDGET */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-slate-100 pb-4">
                      <div className="text-left">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                          <i className="fa-solid fa-share-nodes text-[var(--color-primary)]"></i> {t("admin.database.calendarShareTitle")}
                        </h3>
                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                          {t("admin.database.calendarShareSubtitle")}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                        <div className="text-left">
                          <h4 className="text-xs font-semibold text-slate-900">
                            {t("admin.database.enableDirectLink")}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t("admin.database.enableDirectLinkDesc")}
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings?.publicCalendar?.enabled || false}
                            onChange={(e) => {
                              let token = settings?.publicCalendar?.token;
                              if (e.target.checked && !token) {
                                // generate a random token
                                token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                              }
                              onUpdateSettings({
                                publicCalendar: {
                                  enabled: e.target.checked,
                                  showNames: settings?.publicCalendar?.showNames || false,
                                  token: token || "",
                                }
                              });
                              onDirtyChange?.();
                            }}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                        <div className="text-left">
                          <h4 className="text-xs font-semibold text-slate-900">
                            {t("admin.database.showNamesPublic")}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {settings?.publicCalendar?.showNames ? (
                              <span className="text-rose-600 font-semibold">DSGVO-Hinweis: Namen sind aktuell für jedermann sichtbar!</span>
                            ) : (
                              <span>Alle Buchungen werden als „Belegt“ anonymisiert dargestellt.</span>
                            )}
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings?.publicCalendar?.showNames || false}
                            onChange={(e) => {
                              onUpdateSettings({
                                publicCalendar: {
                                  enabled: settings?.publicCalendar?.enabled || false,
                                  showNames: e.target.checked,
                                  token: settings?.publicCalendar?.token || "",
                                }
                              });
                              onDirtyChange?.();
                            }}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                        </label>
                      </div>

                      {settings?.publicCalendar?.enabled && settings?.publicCalendar?.token ? (
                        <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-xl border border-emerald-200/80 space-y-3.5 text-left">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-xs font-semibold text-emerald-900">
                                {t("admin.database.directLink")}
                              </label>
                              <a
                                href={`${window.location.origin}/public/calendar/woche/${settings.publicCalendar.token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                              >
                                {t("admin.database.testLink")} <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                              </a>
                            </div>
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}/public/calendar/woche/${settings.publicCalendar.token}`}
                              className="w-full h-10 px-3.5 bg-white border border-emerald-200 rounded-xl text-xs font-mono text-emerald-900 select-all outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-emerald-900 mb-1.5">
                              {t("admin.database.iframeCode")}
                            </label>
                            <textarea
                              readOnly
                              rows={3}
                              value={`<iframe src="${window.location.origin}/public/calendar/woche/${settings.publicCalendar.token}" width="100%" height="800px" frameborder="0" style="border:none; border-radius:12px;"></iframe>`}
                              className="w-full p-3 bg-white border border-emerald-200 rounded-xl text-xs font-mono text-emerald-900 select-all outline-none resize-none leading-relaxed"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 text-left text-xs font-medium text-slate-500 flex items-center gap-3">
                          <i className="fa-solid fa-eye-slash text-slate-400 text-base shrink-0"></i>
                          <p className="text-xs text-slate-500">
                            Öffentliche Freigabe ist aktuell <span className="font-semibold text-slate-700">deaktiviert</span>. Aktiviere den Schalter oben, um den Direktlink und iFrame-Code zu generieren.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SAFETY CLEANSING CARD */}
                  <div className="bg-white rounded-2xl border border-rose-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-rose-100 pb-4 text-left">
                      <h3 className="text-base font-bold text-rose-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-triangle-exclamation text-rose-600"></i> {t("admin.database.safetyTitle")}
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {t("admin.database.safetySubtitle")}
                      </p>
                    </div>

                    <div className="space-y-4 text-left">
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        {t("admin.database.safetyDesc")}
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <button
                          type="button"
                          onClick={() => setShowDeleteModal("bookings")}
                          className="w-full text-left p-4 bg-rose-50/60 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-xl text-rose-700 hover:text-white transition-all group flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <i className="fa-solid fa-calendar-xmark text-lg text-rose-500 group-hover:text-white shrink-0"></i>
                            <span className="text-xs font-semibold">
                              {t("admin.database.cleansePeriod")}
                            </span>
                          </div>
                          <i className="fa-solid fa-arrow-right text-xs opacity-50 group-hover:opacity-100 transition-opacity"></i>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowDeleteModal("users")}
                          className="w-full text-left p-4 bg-rose-50/60 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-xl text-rose-700 hover:text-white transition-all group flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <i className="fa-solid fa-users-slash text-lg text-rose-500 group-hover:text-white shrink-0"></i>
                            <span className="text-xs font-semibold">
                              {t("admin.database.cleanseUsers")}
                            </span>
                          </div>
                          <i className="fa-solid fa-arrow-right text-xs opacity-50 group-hover:opacity-100 transition-opacity"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* BOOKINGS EXPORT CARD */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-slate-100 pb-4 text-left">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-file-export text-[var(--color-primary)]"></i> {t("admin.database.exportTitle")}
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {t("admin.database.exportSubtitle")}
                      </p>
                    </div>

                    <div className="space-y-4 text-left">
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        Exportieren Sie sämtliche im System hinterlegten Reservierungen. Sie können optional einen Zeitraum (von/bis Datum) angeben, um den Export einzugrenzen.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.database.fromDate")}
                          </label>
                          <input 
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none text-slate-800 transition-all font-normal"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.database.toDate")}
                          </label>
                          <input 
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 outline-none text-slate-800 transition-all font-normal"
                          />
                        </div>
                      </div>

                      {/* RESET BUTTON */}
                      {(exportStartDate || exportEndDate) && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setExportStartDate("");
                              setExportEndDate("");
                            }}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1.5 cursor-pointer"
                          >
                            <i className="fa-solid fa-circle-xmark"></i>{" "}
                            {t("admin.database.resetPeriod")}
                          </button>
                        </div>
                      )}

                      <div className="pt-2 flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={exportBookingsCSV}
                          className="flex-1 h-10 px-5 rounded-xl bg-[var(--color-primary)] hover:brightness-110 text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <i className="fa-solid fa-file-csv text-sm"></i>
                          {t("admin.database.downloadCsv")}
                        </button>
                        <button
                          type="button"
                          onClick={exportBookingsJSON}
                          className="flex-1 h-10 px-5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <i className="fa-solid fa-file-code text-sm text-blue-600"></i>
                          {t("admin.database.downloadJson")}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* BOOKINGS IMPORT CARD */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-slate-100 pb-4 text-left">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-file-import text-[var(--color-primary)]"></i> Buchungsimport &amp; Testdaten
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        Reservierungsdaten einspielen &amp; Dummydaten verwalten
                      </p>
                    </div>

                    <div className="space-y-4 text-left">
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        Importieren Sie reservierte Stunden und Belegungen aus einer vorherigen CSV- oder JSON-Sicherungsdatei.
                      </p>

                      <>
                        {importStatus === "idle" && (
                          <div className="space-y-4">
                            {/* Dropzone */}
                            <div
                              className="border-2 border-dashed border-slate-200 hover:border-[var(--color-primary)] rounded-xl p-8 text-center bg-slate-50/70 hover:bg-slate-100/50 transition-all cursor-pointer"
                              onClick={() =>
                                importFileInputRef.current?.click()
                              }
                            >
                              <input
                                type="file"
                                ref={importFileInputRef}
                                className="hidden"
                                accept=".csv,.json"
                                onChange={handleImportFileChange}
                              />
                              <i className="fa-solid fa-cloud-arrow-up text-3xl text-slate-400 mb-2"></i>
                              <p className="text-xs font-semibold text-slate-800">
                                CSV- oder JSON-Datei hier hochladen
                              </p>
                              <p className="text-xs text-slate-400 mt-1 font-normal">
                                Klicken, um Datei auszuwählen (*.csv, *.json)
                              </p>
                            </div>
                          </div>
                        )}

                        {importStatus === "parsing" && (
                          <div className="py-8 text-center space-y-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)] mx-auto"></div>
                            <p className="text-xs font-semibold text-slate-600">
                              Datei wird analysiert...
                            </p>
                          </div>
                        )}

                        {(importStatus === "ready" ||
                          importStatus === "importing" ||
                          importStatus === "success") && (
                          <div className="space-y-4">
                            <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2">
                              <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                                <i className="fa-solid fa-circle-info text-[var(--color-primary)]"></i>{" "}
                                Import-Vorschau
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="font-medium text-slate-400">
                                    Dateiname:
                                  </span>{" "}
                                  <span className="font-semibold text-slate-700 block truncate">
                                    {importFile?.name || "Demo-Vorschau"}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-medium text-slate-400">
                                    Gefundene Buchungen:
                                  </span>{" "}
                                  <span className="font-bold text-slate-900 block text-lg">
                                    {importPreview.length}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {importStatus === "ready" && (
                              <div className="space-y-4">
                                <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-left space-y-1">
                                  <h4 className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                                    <i className="fa-solid fa-circle-check text-emerald-600"></i>{" "}
                                    Import-Modus: Hinzufügen (Merge)
                                  </h4>
                                  <p className="text-xs text-emerald-700 leading-relaxed font-normal">
                                    Die geladenen {importPreview.length}{" "}
                                    Buchungseinträge werden in die Spieldatenbank eingepflegt.
                                  </p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setImportStatus("idle");
                                      setImportFile(null);
                                      setImportPreview([]);
                                    }}
                                    className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                  >
                                    Abbrechen
                                  </button>
                                  <button
                                    type="button"
                                    onClick={runFileImport}
                                    className="flex-1 h-10 rounded-xl text-white text-xs font-semibold transition-all shadow-xs bg-[var(--color-primary)] hover:brightness-110 flex items-center justify-center cursor-pointer"
                                  >
                                    Import starten
                                  </button>
                                </div>
                              </div>
                            )}

                            {importStatus === "importing" && (
                              <div className="space-y-3 py-4">
                                <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                                  <span>Importiere Daten...</span>
                                  <span>{importProgress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-[var(--color-primary)] h-full rounded-full transition-all duration-300"
                                    style={{ width: `${importProgress}%` }}
                                  ></div>
                                </div>
                                <p className="text-xs text-slate-400 text-center font-normal">
                                  Bitte haben Sie einen Moment Geduld – die Datenbank wird synchronisiert.
                                </p>
                              </div>
                            )}

                            {importStatus === "success" && (
                              <div className="space-y-4 text-center py-2">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-2xs text-xl">
                                  <i className="fa-solid fa-circle-check"></i>
                                </div>
                                <div className="space-y-1">
                                  <h4 className="text-sm font-bold text-slate-900">
                                    Daten erfolgreich eingespielt!
                                  </h4>
                                  <p className="text-xs text-slate-500 font-normal">
                                    {importPreview.length} Buchungen wurden geladen und stehen im Buchungskalender bereit.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImportStatus("idle");
                                    setImportFile(null);
                                    setImportPreview([]);
                                  }}
                                  className="h-10 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center justify-center"
                                >
                                  Fertigstellen &amp; Zurück
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {importStatus === "error" && (
                          <div className="space-y-4">
                            <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-xl text-left space-y-1">
                              <h4 className="text-xs font-semibold text-rose-900 flex items-center gap-1.5">
                                <i className="fa-solid fa-circle-exclamation text-rose-600"></i>{" "}
                                Import-Fehler
                              </h4>
                              <p className="text-xs text-rose-700 leading-relaxed font-normal">
                                {importErrorMsg ||
                                  "Ein unbekannter Fehler ist beim Import aufgetreten."}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setImportStatus("idle");
                                setImportFile(null);
                                setImportPreview([]);
                              }}
                              className="w-full h-10 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-semibold text-xs cursor-pointer flex items-center justify-center"
                            >
                              Erneut versuchen
                            </button>
                          </div>
                        )}
                      </>
                    </div>
                  </div>

                  {/* WEBSITE-WIDGET & EMBEDDED MODE CARD */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-slate-100 pb-4 text-left">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-code text-[var(--color-primary)]"></i> Website-Widget &amp; Einbettung (iFrame)
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        Live-Belegungsplan nahtlos in die eigene Vereinshomepage einbinden
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-left">
                      {/* OPTION 1: HTML IFRAME EMBED CODE */}
                      <div className="bg-slate-50/70 p-5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-4">
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-slate-900">
                            HTML-Einbettungscode (iFrame)
                          </h4>
                          <p className="text-xs text-slate-500 font-normal leading-relaxed">
                            Fügen Sie diesen Code-Schnipsel in Ihre Vereinswebsite ein. Das Widget übernimmt automatisch die Vereinsfarben.
                          </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200/80">
                          <div className="p-3 bg-slate-900 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto select-all leading-relaxed">
                            {getEmbedIframeCode()}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(getEmbedIframeCode());
                              setWidgetIframeCopied(true);
                              setTimeout(() => setWidgetIframeCopied(false), 2000);
                            }}
                            className={`w-full h-10 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs ${
                              widgetIframeCopied
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-900 hover:bg-slate-800 text-white"
                            }`}
                          >
                            <i className={`fa-solid ${widgetIframeCopied ? "fa-check" : "fa-copy"}`}></i>
                            <span>{widgetIframeCopied ? "HTML-Code kopiert!" : "HTML-Code kopieren"}</span>
                          </button>
                        </div>
                      </div>

                      {/* OPTION 2: DIRECT STANDALONE URL */}
                      <div className="bg-slate-50/70 p-5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-4">
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold text-slate-900">
                            Standalone-Widget URL
                          </h4>
                          <p className="text-xs text-slate-500 font-normal leading-relaxed">
                            Direkte URL für Popups, externe Verlinkungen oder eigene Web-Viewer ohne übergeordnete Menüleisten.
                          </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200/80">
                          <input
                            type="text"
                            readOnly
                            value={getEmbedWidgetURL()}
                            className="w-full h-10 px-3.5 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-700 outline-none select-all"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(getEmbedWidgetURL());
                                setWidgetLinkCopied(true);
                                setTimeout(() => setWidgetLinkCopied(false), 2000);
                              }}
                              className={`flex-1 h-10 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs ${
                                widgetLinkCopied
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-900 hover:bg-slate-800 text-white"
                              }`}
                            >
                              <i className={`fa-solid ${widgetLinkCopied ? "fa-check" : "fa-copy"}`}></i>
                              <span>{widgetLinkCopied ? "URL kopiert!" : "URL kopieren"}</span>
                            </button>
                            <a
                              href={getEmbedWidgetURL()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-10 px-4 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 hover:bg-emerald-100 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                            >
                              <span>Öffnen</span>
                              <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* GLOBAL COLLECTION POLICIES CARD */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs space-y-5">
                    <div className="border-b border-slate-100 pb-4 text-left">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-user-shield text-[var(--color-primary)]"></i> Globale Erfassungsrichtlinien
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        Steuerung der Erfassung von Kontaktdaten der Mitglieder
                      </p>
                    </div>

                    <div className="space-y-4 text-left">
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        Hier können Sie festlegen, ob E-Mail-Adressen und Telefonnummern von Mitgliedern erfasst und angezeigt werden sollen.
                      </p>

                      <div className="space-y-3">
                        {/* Toggle Email Collection */}
                        <div className="flex items-center justify-between p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                          <div className="text-left">
                            <h4 className="text-xs font-semibold text-slate-900">
                              E-Mail-Adressen erfassen
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Schaltet die Erfassung und Anzeige von E-Mail-Adressen für Mitglieder an oder aus.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={settings.collectEmail !== false}
                              onChange={(e) => {
                                onUpdateSettings({
                                  ...settings,
                                  collectEmail: e.target.checked,
                                });
                                setMessage({
                                  text: `Erfassung von E-Mail-Adressen wurde ${e.target.checked ? "aktiviert" : "deaktiviert"}.`,
                                  type: "success",
                                });
                                onDirtyChange?.();
                              }}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                          </label>
                        </div>

                        {/* Toggle Phone Collection */}
                        <div className="flex items-center justify-between p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                          <div className="text-left">
                            <h4 className="text-xs font-semibold text-slate-900">
                              Telefonnummern erfassen
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Schaltet die Erfassung und Anzeige von Telefonnummern für Mitglieder an oder aus.
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={settings.collectPhone !== false}
                              onChange={(e) => {
                                onUpdateSettings({
                                  ...settings,
                                  collectPhone: e.target.checked,
                                });
                                setMessage({
                                  text: `Erfassung von Telefonnummern wurde ${e.target.checked ? "aktiviert" : "deaktiviert"}.`,
                                  type: "success",
                                });
                                onDirtyChange?.();
                              }}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                          </label>
                        </div>
                      </div>

                      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl text-left">
                        <p className="text-xs font-normal text-amber-900 leading-relaxed">
                          Hinweis: Wenn Sie die Erfassung deaktivieren, werden diese Felder in der gesamten App für Mitglieder ausgeblendet. Bereits erfasste Daten bleiben in der Datenbank erhalten.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: MEISTERSCHAFT */}
              {currentTab === "championship" && (
                <ChampionshipAdminTab
                  clubId={currentClubId}
                  users={users}
                  currentUser={currentUser}
                  onNavigateToPlayerView={() => {
                    if (onNavigateToChampionship) {
                      onNavigateToChampionship();
                    }
                  }}
                />
              )}

              {/* TAB: VERANSTALTUNGEN */}
              {currentTab === "tournaments" && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 lg:p-7 shadow-xs">
                    <div className="text-left">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <i className="fa-solid fa-calendar-days text-[var(--color-primary)]"></i>{" "}
                        {t("admin.tournaments.title")}
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {t("admin.tournaments.subtitle")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* FORM COLUMN */}
                    <div className="lg:col-span-1 space-y-6">
                      <form
                        onSubmit={handleEventSubmit}
                        className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 text-left"
                      >
                        <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                          <i className="fa-solid fa-pen-to-square text-[var(--color-primary)]"></i>
                          {editingTournamentId
                            ? t("admin.tournaments.editEvent")
                            : t("admin.tournaments.newEvent")}
                        </h4>

                        {/* Titel (Pflichtfeld) */}
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.tournaments.eventName")}{" "}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input 
                            type="text"
                            required
                            value={eventTitle}
                            onChange={(e) => setEventTitle(e.target.value)}
                            placeholder={t("admin.tournaments.eventNamePlaceholder")}
                            className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                          />
                        </div>

                        {/* Datum (Optional) */}
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.tournaments.dateOptional")}
                          </label>
                          <input 
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                          />
                        </div>

                        {/* Uhrzeit (Optional) */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.tournaments.startTime")}
                            </label>
                            <input 
                              type="time"
                              value={eventStartTime}
                              onChange={(e) =>
                                setEventStartTime(e.target.value)
                              }
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              {t("admin.tournaments.endTime")}
                            </label>
                            <input 
                              type="time"
                              value={eventEndTime}
                              onChange={(e) => setEventEndTime(e.target.value)}
                              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal placeholder:text-slate-400"
                            />
                          </div>
                        </div>

                        {/* An- & Abmeldefristen (Optional) in einer gemeinsamen Karte */}
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("admin.tournaments.regStart")}
                              </label>
                              <input 
                                type="date"
                                value={eventRegistrationStart}
                                onChange={(e) =>
                                  setEventRegistrationStart(e.target.value)
                                }
                                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {t("admin.tournaments.regEnd")}
                              </label>
                              <input 
                                type="date"
                                value={eventRegistrationEnd}
                                onChange={(e) =>
                                  setEventRegistrationEnd(e.target.value)
                                }
                                className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal"
                              />
                            </div>
                          </div>

                          <div className="border-t border-slate-200/80 pt-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t("admin.tournaments.deregStart")}
                                </label>
                                <input 
                                  type="date"
                                  value={eventDeregistrationStart}
                                  onChange={(e) =>
                                    setEventDeregistrationStart(e.target.value)
                                  }
                                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  {t("admin.tournaments.deregEnd")}
                                </label>
                                <input 
                                  type="date"
                                  value={eventDeregistrationEnd}
                                  onChange={(e) =>
                                    setEventDeregistrationEnd(e.target.value)
                                  }
                                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 transition-all font-normal"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Beschreibung (Optional) */}
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            {t("admin.tournaments.description")}
                          </label>
                          <textarea
                            value={eventDescription}
                            onChange={(e) =>
                              setEventDescription(e.target.value)
                            }
                            placeholder={t("admin.tournaments.descriptionPlaceholder")}
                            rows={3}
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 resize-y placeholder:font-normal placeholder:text-slate-400 font-normal transition-all"
                          />
                        </div>

                        {/* Hide expired events (optional, default: true) */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-700">
                            {t("admin.tournaments.archiveHeading")}
                          </label>
                          <span className="block text-xs text-slate-500 font-normal leading-normal">
                            {t("admin.tournaments.archiveDesc")}
                          </span>
                          <div className="flex gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventHideExpired"
                                checked={eventHideExpired === true}
                                onChange={() => setEventHideExpired(true)}
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.yesDefault")}</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventHideExpired"
                                checked={eventHideExpired === false}
                                onChange={() => setEventHideExpired(false)}
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.no")}</span>
                            </label>
                          </div>
                        </div>

                        {/* Allow registration comments (optional, default: false) */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-700">
                            {t("admin.tournaments.commentHeading")}
                          </label>
                          <span className="block text-xs text-slate-500 font-normal leading-normal">
                            {t("admin.tournaments.commentDesc")}
                          </span>
                          <div className="flex gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventAllowComment"
                                checked={eventAllowComment === true}
                                onChange={() => setEventAllowComment(true)}
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.yes")}</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventAllowComment"
                                checked={eventAllowComment === false}
                                onChange={() => setEventAllowComment(false)}
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.noDefault")}</span>
                            </label>
                          </div>
                        </div>

                        {/* Maximale Teilnehmerzahl (optional) */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-700">
                            {t("admin.tournaments.maxParticipants")}
                          </label>
                          <input 
                            type="number"
                            min="1"
                            placeholder={t("admin.tournaments.noLimit")}
                            value={eventMaxParticipants}
                            onChange={(e) =>
                              setEventMaxParticipants(e.target.value)
                            }
                            className="w-full max-w-[200px] h-10 px-3.5 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 text-slate-800 font-normal transition-all"
                          />
                        </div>

                        {/* Anmeldungen sperren */}
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-700">
                            {t("admin.tournaments.blockRegHeading")}
                          </label>
                          <span className="block text-xs text-slate-500 font-normal leading-normal">
                            {t("admin.tournaments.blockRegDesc")}
                          </span>
                          <div className="flex gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventIsRegistrationBlocked"
                                checked={eventIsRegistrationBlocked === true}
                                onChange={() =>
                                  setEventIsRegistrationBlocked(true)
                                }
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.yes")}</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="eventIsRegistrationBlocked"
                                checked={eventIsRegistrationBlocked === false}
                                onChange={() =>
                                  setEventIsRegistrationBlocked(false)
                                }
                                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                              />
                              <span>{t("admin.tournaments.noDefault")}</span>
                            </label>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-3 border-t border-slate-100">
                          <button
                            type="submit"
                            className="flex-1 h-10 px-5 rounded-xl bg-[var(--color-primary)] hover:brightness-110 text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <i className="fa-solid fa-check"></i>{" "}
                            {editingTournamentId
                              ? t("admin.tournaments.save")
                              : t("admin.tournaments.create")}
                          </button>
                          {(editingTournamentId ||
                            eventTitle ||
                            eventDate ||
                            eventDescription) && (
                            <button
                              type="button"
                              onClick={resetEventForm}
                              className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all flex items-center justify-center cursor-pointer"
                            >
                              {t("admin.tournaments.cancel")}
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {/* LISTING COLUMN */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 text-left">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                          <i className="fa-solid fa-list text-[var(--color-primary)]"></i> {t("admin.tournaments.scheduledEventsCount", { count: tournaments.length })}
                        </h4>

                        {tournaments.length === 0 ? (
                          <p className="text-xs text-slate-400 py-8 italic text-center font-medium">
                            {t("admin.tournaments.noEvents")}
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {tournaments.map((t) => {
                              const hasDate = !!t.date;
                              const formattedDate = hasDate
                                ? new Date(t.date!).toLocaleDateString(
                                    "de-DE",
                                    {
                                      weekday: "long",
                                      day: "2-digit",
                                      month: "long",
                                      year: "numeric",
                                    },
                                  )
                                : null;
                              const hasTime = !!t.startTime;

                              return (
                                <div
                                  key={t.id}
                                  className="p-4 sm:p-5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between gap-4"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div className="space-y-2">
                                      <h5 className="text-sm font-bold text-slate-900">
                                        {t.title}
                                      </h5>

                                      <div className="text-xs text-slate-500 font-medium flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                                        {formattedDate ? (
                                          <span className="flex items-center gap-1 bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-md text-xs font-semibold">
                                            <i className="fa-solid fa-calendar-day text-[11px]"></i>{" "}
                                            {formattedDate}
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-xs font-medium">
                                            {t("admin.tournaments.noFixedDate")}
                                          </span>
                                        )}

                                        {hasTime && (
                                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                                            <i className="fa-regular fa-clock text-slate-400"></i>{" "}
                                            {t.startTime}{" "}
                                            {t.endTime ? `- ${t.endTime}` : ""}{" "}
                                            {t("admin.rules.oclock")}
                                          </span>
                                        )}

                                        {t.maxParticipants &&
                                        t.maxParticipants > 0 ? (
                                          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md text-xs font-semibold border border-emerald-200/80">
                                            <i className="fa-solid fa-users text-[11px]"></i>{" "}
                                            {t("admin.tournaments.maxCount", { count: t.maxParticipants })}
                                          </span>
                                        ) : null}

                                        {t.isRegistrationBlocked && (
                                          <span className="flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md text-xs font-semibold border border-rose-200">
                                            <i className="fa-solid fa-lock text-[11px]"></i>{" "}
                                            {t("admin.tournaments.registrationsBlocked")}
                                          </span>
                                        )}
                                      </div>

                                      {t.description && (
                                        <p className="text-slate-600 text-xs leading-relaxed pt-1 bg-white p-3 rounded-lg border border-slate-200/60 font-normal">
                                          {t.description}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex gap-2 self-start">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditEvent(t)}
                                        className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 hover:bg-[var(--color-primary)] hover:text-white flex items-center justify-center transition-colors text-xs shadow-2xs cursor-pointer"
                                        title={t("admin.tournaments.edit")}
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (
                                            confirm(
                                              t("admin.tournaments.deleteConfirm", { title: t.title })
                                            )
                                          ) {
                                            onDeleteTournament(t.id);
                                            setMessage({
                                              text: t("admin.tournaments.deleteSuccess", { title: t.title }),
                                              type: "success",
                                            });
                                          }
                                        }}
                                        className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center justify-center transition-colors text-xs shadow-2xs border border-rose-100 cursor-pointer"
                                        title={t("admin.tournaments.delete")}
                                      >
                                        <i className="fa-solid fa-trash-can"></i>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="border-t border-slate-200/80 pt-3 flex flex-col gap-3">
                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-2">
                                      <span
                                        className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border ${(t.hideExpired ?? true) ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-amber-50 border-amber-200 text-amber-700"}`}
                                      >
                                        {(t.hideExpired ?? true)
                                          ? t("admin.tournaments.hideExpiredYes")
                                          : t("admin.tournaments.hideExpiredNo")}
                                      </span>
                                      <span
                                        className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md border ${t.allowComment ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-100 border-slate-200 text-slate-600"}`}
                                      >
                                        {t.allowComment
                                          ? t("admin.tournaments.commentsAllowedYes")
                                          : t("admin.tournaments.commentsAllowedNo")}
                                      </span>
                                    </div>

                                    {/* Participants lists */}
                                    <div>
                                      <span className="block text-xs font-semibold text-slate-700 mb-2">
                                        {t("admin.tournaments.registeredPlayersCount", { count: t.participants?.length || 0 })}
                                      </span>
                                      {!t.participants ||
                                      t.participants.length === 0 ? (
                                        <span className="text-xs text-slate-400 italic">
                                          {t("admin.tournaments.noRegistrations")}
                                        </span>
                                      ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          {t.participants.map((player, idx) => {
                                            const comment =
                                              t.registrationComments?.[player];
                                            return (
                                              <div
                                                key={idx}
                                                className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-800 flex flex-col gap-1 font-medium"
                                              >
                                                <div className="flex items-center gap-1.5 text-slate-900 font-semibold">
                                                  <span>{player}</span>
                                                </div>
                                                {comment && (
                                                  <div className="bg-slate-50 p-1.5 rounded-md border border-slate-100 text-[11px] text-[var(--color-primary)] italic font-normal">
                                                    <i className="fa-regular fa-comment-dots mr-1"></i>
                                                    "{comment}"
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: RANGLISTE */}
              {currentTab === "ranking" && (
                <AdminRankings
                  rankings={rankings || null}
                  users={users}
                  onUpdateRankings={onUpdateRankings || (() => {})}
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* WARNING POPUP: CHANGING TABS WITH UNSAVED CHANGES */}
      {pendingTab && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-sm w-full shadow-xl border border-slate-200/80 animate-in zoom-in duration-200 text-left">
            <h3 className="text-amber-600 font-bold text-base flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation"></i> {t("admin.unsavedModal.title")}
            </h3>
            <p className="text-xs text-slate-600 my-4 leading-relaxed font-normal">
              {t("admin.unsavedModal.desc")}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleSaveTab(currentTab);
                  setCurrentTab(pendingTab);
                  setPendingTab(null);
                }}
                className="w-full h-10 bg-[var(--color-primary)] hover:brightness-110 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center shadow-xs"
              >
                {t("admin.unsavedModal.saveAndSwitch")}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDiscardTab(currentTab);
                  setCurrentTab(pendingTab);
                  setPendingTab(null);
                }}
                className="w-full h-10 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center"
              >
                {t("admin.unsavedModal.discardAndSwitch")}
              </button>
              <button
                type="button"
                onClick={() => setPendingTab(null)}
                className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center"
              >
                {t("admin.unsavedModal.stay")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: RESERVATIONS PURGE */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200 text-left my-8">
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-base font-bold flex items-center gap-2.5">
                <i className="fa-solid fa-shield-virus text-lg"></i>{" "}
                {t("admin.deleteModal.securityConfirmation")}
              </h3>
              <p className="text-xs text-rose-100 mt-1 font-normal">
                {showDeleteModal === "bookings"
                  ? t("admin.deleteModal.bookingsPurge")
                  : t("admin.deleteModal.membersPurge")}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-200/80 flex items-start gap-3">
                <i className="fa-solid fa-circle-exclamation text-rose-600 text-base mt-0.5 shrink-0"></i>
                <p className="text-xs font-medium text-rose-900 leading-relaxed">
                  {showDeleteModal === "bookings"
                    ? t("admin.deleteModal.bookingsWarning")
                    : t("admin.deleteModal.membersWarning")}
                </p>
              </div>

              {showDeleteModal === "bookings" && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t("admin.deleteModal.fromDate")}
                    </label>
                    <input 
                      type="date"
                      value={deleteRange.start}
                      onChange={(e) =>
                        setDeleteRange((prev) => ({
                          ...prev,
                          start: e.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 text-slate-800 transition-all font-normal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t("admin.deleteModal.toDate")}
                    </label>
                    <input 
                      type="date"
                      value={deleteRange.end}
                      onChange={(e) =>
                        setDeleteRange((prev) => ({
                          ...prev,
                          end: e.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 text-slate-800 transition-all font-normal"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {t("admin.deleteModal.selectCourt")}
                    </label>
                    <select 
                      value={deleteRange.court}
                      onChange={(e) =>
                        setDeleteRange((prev) => ({
                          ...prev,
                          court: e.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 text-slate-800 cursor-pointer transition-all font-normal"
                    >
                      <option value="all">{t("admin.deleteModal.allCourts")}</option>
                      {courtsList.map((court, i) => (
                        <option key={i} value={court}>
                          {court}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 text-center pt-2">
                <label className="block text-xs font-semibold text-slate-700">
                  {t("admin.deleteModal.confirmPrompt")}{" "}
                  <span className="text-rose-600 font-bold tracking-wider">
                    {t("admin.deleteModal.confirmWord")}
                  </span>
                </label>
                <input 
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={t("admin.deleteModal.confirmWord")}
                  className="w-full h-10 px-4 border-2 border-rose-200 rounded-xl text-center text-rose-600 tracking-widest outline-none focus:border-rose-600 focus:bg-rose-50/50 transition-all uppercase font-semibold text-sm"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  disabled={
                    deleteConfirmText.trim().toUpperCase() !== "LÖSCHEN" &&
                    deleteConfirmText.trim().toUpperCase() !== t("admin.deleteModal.confirmWord").toUpperCase()
                  }
                  onClick={executeBulkDelete}
                  className="flex-1 h-10 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs font-semibold text-xs active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center cursor-pointer"
                >
                  {t("admin.deleteModal.purgeSubmit")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(null);
                    setDeleteConfirmText("");
                  }}
                  className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center"
                >
                  {t("admin.deleteModal.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: DELETE SINGLE USER CONFIRMATION */}
      {userToDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[99999] flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm transition-opacity"
            onClick={() => setUserToDeleteConfirm(null)}
          ></div>

          {/* Drawer Panel */}
          <div className="relative w-full md:max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 z-10 text-left">
            {/* Header */}
            <div className="bg-slate-950 px-6 py-5 flex items-center justify-between text-white shrink-0">
              <div>
                <h3 className="font-black tracking-widest uppercase text-xs sm:text-sm">
                  {t("admin.users.deleteTitle")}
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {t("admin.users.deleteManageTitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUserToDeleteConfirm(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 active:scale-95 transition-all outline-none flex items-center justify-center border border-white/10 shrink-0 cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-white text-xs"></i>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Caution Callout */}
              <div className="bg-red-50 border border-red-200/60 p-4 rounded-xl flex items-start gap-3">
                <i className="fa-solid fa-triangle-exclamation text-red-600 text-lg mt-0.5"></i>
                <div>
                  <h4 className="text-xs font-black text-red-800 uppercase tracking-wider">
                    Achtung: Unwiderruflich!
                  </h4>
                  <p className="text-[11px] text-red-700 font-semibold leading-relaxed mt-1">
                    {t("admin.users.deleteConfirm")}
                  </p>
                </div>
              </div>

              {/* Member Details */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {t("admin.users.deleteMemberDetails")}
                </h4>

                <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.users.colName")}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {userToDeleteConfirm.klarname || userToDeleteConfirm.name}
                    </span>
                  </div>

                  {/* Username */}
                  <div className="space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.users.fieldUsername")}
                    </span>
                    <span className="inline-block font-mono bg-slate-200 rounded px-2 py-0.5 text-[10px] font-black text-slate-700">
                      {userToDeleteConfirm.name}
                    </span>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.users.fieldEmail")}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {userToDeleteConfirm.email || (
                        <span className="italic text-slate-400">{t("admin.users.noEmail")}</span>
                      )}
                    </span>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.users.fieldPhone")}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {userToDeleteConfirm.phone || (
                        <span className="italic text-slate-400">{t("admin.users.noEmail")}</span>
                      )}
                    </span>
                  </div>

                  {/* Role */}
                  <div className="space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.users.fieldRole")}
                    </span>
                    <span className="inline-block text-xs font-bold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-full capitalize">
                      {userToDeleteConfirm.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informative text */}
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {t("admin.users.deleteWarning")}
              </p>
            </div>

            {/* Bottom Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex shrink-0">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => {
                  executeDeleteUser(userToDeleteConfirm);
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer text-center disabled:opacity-50"
              >
                {isDeletingUser ? (
                  <span className="flex items-center justify-center gap-2">
                    <i className="fa-solid fa-spinner animate-spin"></i>
                    <span>Wird gelöscht...</span>
                  </span>
                ) : (
                  t("admin.users.deleteSubmit")
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBannerPositionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="border-none outline-none bg-white rounded-2xl shadow-sm max-w-4xl w-full -200/80 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[var(--color-primary)] text-white p-6 flex justify-between items-center z-10 shadow-md">
              <h3 className="font-black tracking-widest uppercase text-lg flex items-center gap-3">
                <i className="fa-solid fa-crop-simple"></i> {t("admin.layout.bannerPositionTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowBannerPositionModal(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="p-8 flex flex-col gap-8">
              <div className="w-full h-32 relative rounded-2xl border-4 border-[var(--color-accent)] overflow-hidden shadow-sm">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt="Banner Preview"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: bannerPosition }}
                  />
                ) : null}
                <div className="absolute inset-0 border-2 border-white/20 pointer-events-none"></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  "0% 0%",
                  "50% 0%",
                  "100% 0%",
                  "0% 50%",
                  "50% 50%",
                  "100% 50%",
                  "0% 100%",
                  "50% 100%",
                  "100% 100%",
                ].map((pos) => {
                  const labelMap: Record<string, string> = {
                    "0% 0%": t("admin.layout.posTopLeft"),
                    "50% 0%": t("admin.layout.posTopCenter"),
                    "100% 0%": t("admin.layout.posTopRight"),
                    "0% 50%": t("admin.layout.posCenterLeft"),
                    "50% 50%": t("admin.layout.posCenter"),
                    "100% 50%": t("admin.layout.posCenterRight"),
                    "0% 100%": t("admin.layout.posBottomLeft"),
                    "50% 100%": t("admin.layout.posBottomCenter"),
                    "100% 100%": t("admin.layout.posBottomRight"),
                  };
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setBannerPosition(pos)}
                      className={`py-4 px-2 rounded-xl font-bold text-[10px] uppercase tracking-wider border-2 transition-all ${bannerPosition === pos ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-lg scale-105" : "border-slate-200 bg-white text-slate-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"}`}
                    >
                      {labelMap[pos]}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowBannerPositionModal(false)}
                className="w-full py-2.5 rounded-xl bg-[var(--color-accent-2)] text-white font-black uppercase tracking-widest shadow-md hover:bg-black transition-colors"
              >
                {t("admin.layout.bannerPositionApply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateCandidatesModal && (
        <div className="fixed inset-0 bg-[#1b4332]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="border-none outline-none bg-white rounded-2xl w-full max-w-xl shadow-xl p-6 sm:p-8 -200 space-y-5">
            <h2 className="text-base font-black text-[#1b4332] uppercase tracking-tight flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="fa-solid fa-user-shield text-amber-600"></i>
                {t("admin.duplicateModal.title")}
              </span>
              <button
                onClick={() => setDuplicateCandidatesModal(null)}
                className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </h2>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed font-semibold">
              {t("admin.duplicateModal.alert")}
            </div>

            <div className="space-y-3">
              {duplicateCandidatesModal.candidates.map((cand) => (
                <div
                  key={cand.personId}
                  className="bg-slate-50 border border-amber-200 rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">
                        {cand.firstName} {cand.lastName}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {t("admin.duplicateModal.systemId")} {cand.personId}
                      </span>
                    </div>

                    {cand.hasAdminInOtherClub && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-300 rounded-lg text-amber-900 font-bold text-[10px]">
                        <i className="fa-solid fa-shield-halved text-amber-600"></i>
                        <span>{t("admin.duplicateModal.adminInOtherClub")}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await addExistingPersonToClub(
                          cand.personId,
                          currentClubId,
                          Role.MITGLIED
                        );
                        setMessage({
                          text: t("admin.duplicateModal.linkSuccess", { name: `${cand.firstName} ${cand.lastName}` }),
                          type: "success",
                        });
                        setEditingUser({
                          name: "",
                          password: "",
                          role: Role.MITGLIED,
                          firstName: "",
                          lastName: "",
                          email: "",
                          phone: "",
                          showContactInfo: false,
                          onboarding_pending: true,
                        });
                        setShowUserForm(false);
                        setDuplicateCandidatesModal(null);
                      } catch (err: any) {
                        setMessage({
                          text: err.message || t("admin.duplicateModal.linkError"),
                          type: "error",
                        });
                      }
                    }}
                    className="w-full bg-[#1b4332] hover:bg-[#153326] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-link text-emerald-300"></i>
                    {t("admin.duplicateModal.linkBtn")}
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setDuplicateCandidatesModal(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors border border-slate-200 cursor-pointer"
              >
                {t("admin.duplicateModal.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateCandidatesModal(null);
                  handleSaveUser(true);
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors border border-slate-800 cursor-pointer"
              >
                {t("admin.duplicateModal.createAnyway")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authentication Mail Confirmation Modal */}
      {authMailModal && authMailModal.isOpen && (
        <div className="fixed inset-0 bg-[#1b4332]/50 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-5 font-sans overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div
              className={`p-5 sm:p-6 border-b flex items-start justify-between gap-4 ${
                authMailModal.type === "activation"
                  ? "bg-emerald-50/70 border-emerald-100"
                  : "bg-blue-50/70 border-blue-100"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                    authMailModal.type === "activation"
                      ? "bg-emerald-600 text-white shadow-emerald-200"
                      : "bg-blue-600 text-white shadow-blue-200"
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      authMailModal.type === "activation" ? "fa-paper-plane" : "fa-key"
                    } text-lg`}
                  ></i>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    {authMailModal.mode === "bulk"
                      ? t("admin.authMailModal.bulkTitle", { count: authMailModal.userIds?.length || 0 })
                      : authMailModal.type === "activation"
                      ? t("admin.authMailModal.activationTitle")
                      : t("admin.authMailModal.resetTitle")}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {authMailModal.mode === "bulk"
                      ? t("admin.authMailModal.bulkDesc")
                      : authMailModal.type === "activation"
                      ? t("admin.authMailModal.activationDesc")
                      : t("admin.authMailModal.resetDesc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthMailModal(null)}
                className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200/80 shadow-2xs shrink-0"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Empfängerbereich Single */}
              {authMailModal.mode === "single" && authMailModal.user && (() => {
                const u = authMailModal.user;
                const memberName =
                  u.lastName || u.firstName
                    ? `${u.lastName || ""}, ${u.firstName || ""}`.trim().replace(/^,|,$/, "")
                    : u.name;
                const hasValidEmail =
                  u.email &&
                  u.email.includes("@") &&
                  !u.is_placeholder_email &&
                  !u.email.endsWith("@internal.app") &&
                  !u.email.startsWith("no-email.");
                const isInvitedOrNeverLoggedIn = !(u.lastLogin || u.last_login || u.lastLoginAt);

                return (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.authMailModal.recipients")}
                    </label>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={u} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{memberName}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white ${
                                u.role === Role.ADMIN ? "bg-[var(--color-accent)]" : "bg-slate-500"
                              }`}
                            >
                              {u.role === Role.ADMIN ? t("admin.authMailModal.adminRole") : t("admin.authMailModal.memberRole")}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>
                              {t("admin.authMailModal.loginLabel")}{" "}
                              <span className="font-semibold text-slate-700 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {u.name}
                              </span>
                            </span>
                            <span>•</span>
                            <span
                              className={
                                hasValidEmail ? "font-medium text-slate-700" : "text-rose-600 font-bold"
                              }
                            >
                              {u.email || t("admin.authMailModal.noEmailSet")}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 flex flex-col items-start sm:items-end justify-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isInvitedOrNeverLoggedIn
                              ? "text-amber-800 bg-amber-100 border border-amber-200"
                              : "text-emerald-800 bg-emerald-100 border border-emerald-200"
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              isInvitedOrNeverLoggedIn ? "fa-clock" : "fa-check"
                            } text-[9px]`}
                          ></i>
                          {isInvitedOrNeverLoggedIn ? t("admin.authMailModal.neverLoggedIn") : t("admin.authMailModal.active")}
                        </span>
                        {u.activationSentAt && (
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {t("admin.authMailModal.lastSent", { date: new Date(u.activationSentAt).toLocaleDateString() })}
                          </span>
                        )}
                      </div>
                    </div>

                    {!hasValidEmail && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2.5">
                        <i className="fa-solid fa-triangle-exclamation text-rose-600 text-sm shrink-0"></i>
                        <span>
                          {t("admin.authMailModal.invalidEmailWarning")}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Empfängerbereich Bulk */}
              {authMailModal.mode === "bulk" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {t("admin.authMailModal.recipientsSelected", { count: authMailModal.userIds?.length || 0 })}
                    </label>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      {t("admin.authMailModal.bulkBadge")}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-2xl p-2 divide-y divide-slate-100">
                    {(authMailModal.usersList || []).map((u) => {
                      const memberName =
                        u.lastName || u.firstName
                          ? `${u.lastName || ""}, ${u.firstName || ""}`.trim().replace(/^,|,$/, "")
                          : u.name;
                      const hasValidEmail =
                        u.email &&
                        u.email.includes("@") &&
                        !u.is_placeholder_email &&
                        !u.email.endsWith("@internal.app") &&
                        !u.email.startsWith("no-email.");
                      return (
                        <div key={u.id || u.name} className="p-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{memberName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({u.name})</span>
                          </div>
                          <span
                            className={
                              hasValidEmail ? "text-slate-600 text-[11px]" : "text-rose-600 text-[11px] font-bold"
                            }
                          >
                            {u.email || t("admin.authMailModal.noEmailSet")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Zugewiesene System-Vorlage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {t("admin.authMailModal.templateTitle")}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setAuthMailModal((prev) =>
                        prev ? { ...prev, previewOpen: !prev.previewOpen } : null
                      )
                    }
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <i
                      className={`fa-solid ${
                        authMailModal.previewOpen ? "fa-eye-slash" : "fa-eye"
                      } text-[10px]`}
                    ></i>
                    <span>{authMailModal.previewOpen ? t("admin.authMailModal.closePreview") : t("admin.authMailModal.showPreview")}</span>
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-200/80 text-slate-700 flex items-center justify-center font-bold text-xs">
                        <i className="fa-solid fa-envelope"></i>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">
                            {authMailModal.activeTemplate?.name ||
                              (authMailModal.type === "activation"
                                ? t("admin.authMailModal.defaultActivationTemplate")
                                : t("admin.authMailModal.defaultResetTemplate"))}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-600 bg-white border border-slate-200">
                            {t("admin.authMailModal.systemBadge")}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium block">
                          {t("admin.authMailModal.eventLabel")}{" "}
                          {authMailModal.type === "activation"
                            ? t("admin.authMailModal.eventActivation")
                            : t("admin.authMailModal.eventReset")}
                        </span>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-emerald-100/70 border border-emerald-200 text-emerald-900 text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span>{t("admin.authMailModal.activelyAssigned")}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 text-xs text-slate-700 flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">{t("admin.authMailModal.subjectLabel")}</span>
                    <span className="font-semibold text-slate-800 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                      {authMailModal.activeTemplate?.subject ||
                        (authMailModal.type === "activation"
                          ? `Willkommen bei ${settings.clubName || "Tennisclub e.V."}! Bitte erstelle dein persönliches Passwort`
                          : `Passwort zurücksetzen für dein ${settings.clubName || "Tennisclub e.V."}-Konto`)}
                    </span>
                  </div>

                  {/* Dynamic Token notice */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200">
                    <i className="fa-solid fa-link text-emerald-600 text-xs"></i>
                    <span>
                      {t("admin.authMailModal.dynamicTokenNotice")}{" "}
                      <code className="font-mono text-emerald-800 font-bold bg-emerald-50 px-1 rounded">
                        {authMailModal.type === "activation"
                          ? "{{activation_link}}"
                          : "{{password_reset_link}}"}
                      </code>{" "}
                      {authMailModal.type === "activation" ? t("admin.authMailModal.validity24h") : t("admin.authMailModal.validity1h")}
                    </span>
                  </div>
                </div>

                {/* Live Preview Display */}
                {authMailModal.previewOpen && (
                  <div className="mt-3 bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-inner animate-in fade-in duration-150">
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
                      <span>{t("admin.authMailModal.previewHeader")}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">HTML & Text</span>
                    </div>
                    <div className="p-4 max-h-72 overflow-y-auto bg-slate-50/50">
                      {authMailPreview?.html ? (
                        <div
                          className="prose prose-sm max-w-none text-slate-800"
                          dangerouslySetInnerHTML={{ __html: authMailPreview.html }}
                        />
                      ) : (
                        <div className="text-xs text-slate-600 whitespace-pre-wrap font-sans">
                          {authMailPreview?.text || t("admin.authMailModal.loadingPreview")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAuthMailModal(null)}
                disabled={authMailModal.loading}
                className="w-full sm:w-auto px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                {t("admin.authMailModal.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSendAuthMail}
                disabled={
                  authMailModal.loading ||
                  (authMailModal.mode === "single" &&
                    (!authMailModal.user?.email ||
                      !authMailModal.user.email.includes("@") ||
                      authMailModal.user.is_placeholder_email ||
                      authMailModal.user.email.endsWith("@internal.app") ||
                      authMailModal.user.email.startsWith("no-email.")))
                }
                className={`w-full sm:w-auto px-6 py-2.5 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  authMailModal.type === "activation"
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                }`}
              >
                {authMailModal.loading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                    <span>{t("admin.authMailModal.sending")}</span>
                  </>
                ) : (
                  <>
                    <i
                      className={`fa-solid ${
                        authMailModal.type === "activation" ? "fa-paper-plane" : "fa-key"
                      } text-sm`}
                    ></i>
                    <span>
                      {authMailModal.mode === "bulk"
                        ? t("admin.authMailModal.sendBulkSubmit", { count: authMailModal.userIds?.length || 0 })
                        : t("admin.authMailModal.sendSingleSubmit")}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
