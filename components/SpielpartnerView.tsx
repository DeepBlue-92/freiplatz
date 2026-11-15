import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { User, LeaguePartnerSearch, UserClub } from '../types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  getLeaguePartnerSearches,
  saveLeaguePartnerSearch,
  deleteLeaguePartnerSearch,
} from '../services/league';
import { resolvePlayerDisplayName, isRawUid } from '../utils/playerHelper';
import { resolveClubName } from '../services/clubHelper';
import { getCanonicalClubId } from '../lib/userUtils';
import { CreateAdModal } from './hobbyliga/CreateAdModal';
import { UserAvatar } from './UserAvatar';
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  RotateCw,
  Mail,
  Phone,
} from 'lucide-react';

interface SpielpartnerViewProps {
  currentUser: User;
  clubId?: string;
  users: Record<string, User> | User[];
  settings?: any;
  onSelectPartnerForBooking?: (partnerUser: User) => void;
  userClubs?: UserClub[];
}

export const SpielpartnerView: React.FC<SpielpartnerViewProps> = ({
  currentUser,
  clubId,
  users,
  settings,
  onSelectPartnerForBooking,
  userClubs = [],
}) => {
  const { t } = useTranslation();
  const [searches, setSearches] = useState<LeaguePartnerSearch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [searchToEdit, setSearchToEdit] = useState<LeaguePartnerSearch | null>(null);
  const [firestoreUsers, setFirestoreUsers] = useState<Record<string, User>>({});

  // Fetch all users across clubs to reliably resolve names and avatars
  useEffect(() => {
    let active = true;
    const fetchCrossClubUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        if (!active) return;
        const fetchedMap: Record<string, User> = {};
        snap.docs.forEach((d) => {
          const u = d.data() as User;
          fetchedMap[d.id] = { ...u, id: d.id };
        });
        setFirestoreUsers(fetchedMap);
      } catch (err) {
        console.error('Failed to fetch cross-club users for spielpartner:', err);
      }
    };
    fetchCrossClubUsers();
    return () => {
      active = false;
    };
  }, []);

  const usersMap = useMemo(() => {
    if (Array.isArray(users)) {
      const map: Record<string, User> = {};
      users.forEach((u) => {
        if (u.id) map[u.id] = u;
      });
      return map;
    }
    return users || {};
  }, [users]);

  const getUserObject = (userId: string): User | undefined => {
    if (!userId) return undefined;
    const trimmed = userId.trim();
    const trimmedLower = trimmed.toLowerCase();

    // Check currentUser first
    if (
      currentUser.id === trimmed ||
      (currentUser.name && currentUser.name.toLowerCase() === trimmedLower) ||
      (currentUser.klarname && currentUser.klarname.toLowerCase() === trimmedLower)
    ) {
      return currentUser;
    }

    // Direct lookup in usersMap
    if (usersMap[trimmed]) return usersMap[trimmed];
    if (usersMap[trimmedLower]) return usersMap[trimmedLower];

    // Lookup in firestore cross-club map
    if (firestoreUsers[trimmed]) return firestoreUsers[trimmed];
    if (firestoreUsers[trimmedLower]) return firestoreUsers[trimmedLower];

    // Search by username, klarname, or full name
    const allUsersList = [
      ...Object.values(usersMap),
      ...Object.values(firestoreUsers),
    ];
    return allUsersList.find((u) => {
      if (!u) return false;
      const fName = (u.firstName || '').toLowerCase();
      const lName = (u.lastName || '').toLowerCase();
      const kName = (u.klarname || '').toLowerCase();
      const uName = (u.name || '').toLowerCase();
      const full = `${fName} ${lName}`.trim();
      const reverseFull = `${lName} ${fName}`.trim();

      return (
        u.id === trimmed ||
        uName === trimmedLower ||
        kName === trimmedLower ||
        full === trimmedLower ||
        reverseFull === trimmedLower
      );
    });
  };

  const isUnlimitedDate = (expiresAt?: string): boolean => {
    if (!expiresAt) return true;
    const year = new Date(expiresAt).getFullYear();
    return year >= 2090 || year <= 1970;
  };

  const getDaysRemaining = (expiresAt?: string): number => {
    if (!expiresAt) return 99;
    const expiry = new Date(expiresAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = expiry.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const resolveTargetClub = (targetUser?: User, searchObj?: LeaguePartnerSearch): string => {
    const rawClub =
      (targetUser?.vereinsId && targetUser.vereinsId.toLowerCase() !== 'verein' ? targetUser.vereinsId : undefined) ||
      (searchObj?.clubId && searchObj.clubId.toLowerCase() !== 'verein' ? searchObj.clubId : undefined) ||
      (targetUser?.id === currentUser.id ? (currentUser.vereinsId || clubId) : undefined) ||
      clubId;

    if (rawClub && rawClub.toLowerCase() !== 'verein') {
      const resolved = resolveClubName(rawClub, undefined, userClubs);
      if (resolved && resolved.toLowerCase() !== 'verein') {
        return resolved;
      }
    }

    if (searchObj?.clubName && searchObj.clubName.toLowerCase() !== 'verein') {
      return searchObj.clubName;
    }

    if (settings?.clubName && settings.clubName.toLowerCase() !== 'verein') {
      return settings.clubName;
    }

    const canonicalCurrent = getCanonicalClubId(clubId || currentUser.vereinsId || 'sv-neuhausen');
    if (canonicalCurrent === 'sv-neuhausen') return 'SV Neuhausen';
    if (canonicalCurrent === 'djk-furth') return 'DJK Furth';
    if (canonicalCurrent === 'tcsportsgeist') return 'TC Sportsgeist';

    return 'SV Neuhausen';
  };

  const getSearchClubCanonicalId = (searchObj?: LeaguePartnerSearch, targetUser?: User): string => {
    const rawUserClub = targetUser?.vereinsId;
    if (rawUserClub && rawUserClub.toLowerCase() !== 'verein') {
      const canonical = getCanonicalClubId(rawUserClub);
      if (canonical && canonical.toLowerCase() !== 'verein') return canonical;
    }

    const rawSearchClub = searchObj?.clubId;
    if (rawSearchClub && rawSearchClub.toLowerCase() !== 'verein') {
      const canonical = getCanonicalClubId(rawSearchClub);
      if (canonical && canonical.toLowerCase() !== 'verein') return canonical;
    }

    if (searchObj?.clubName && searchObj.clubName.toLowerCase() !== 'verein') {
      const canonical = getCanonicalClubId(searchObj.clubName);
      if (canonical && canonical.toLowerCase() !== 'verein') return canonical;
    }

    const resolvedName = resolveTargetClub(targetUser, searchObj);
    if (resolvedName && resolvedName.toLowerCase() !== 'verein') {
      const canonical = getCanonicalClubId(resolvedName);
      if (canonical && canonical.toLowerCase() !== 'verein') return canonical;
    }

    return getCanonicalClubId(clubId || currentUser.vereinsId || 'sv-neuhausen');
  };

  const resolveTargetDisplayName = (targetUser?: User, searchObj?: LeaguePartnerSearch): string => {
    if (targetUser) {
      const full = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim();
      if (full) return full;
      const resolved = resolvePlayerDisplayName(targetUser);
      if (resolved && resolved.toLowerCase() !== 'mitglied' && !isRawUid(resolved)) {
        return resolved;
      }
    }

    const isOwner =
      (searchObj?.userId && currentUser.id === searchObj.userId) ||
      (searchObj?.id && currentUser.id === searchObj.id) ||
      (currentUser.name &&
        searchObj?.userName &&
        currentUser.name.toLowerCase() === searchObj.userName.toLowerCase());

    if (isOwner) {
      const curFull = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
      if (curFull) return curFull;
      if (currentUser.klarname) return currentUser.klarname;
      if (currentUser.name && !isRawUid(currentUser.name)) return currentUser.name;
    }

    if (searchObj?.userName) {
      const foundUser = getUserObject(searchObj.userName);
      if (foundUser) {
        const foundFull = `${foundUser.firstName || ''} ${foundUser.lastName || ''}`.trim();
        if (foundFull) return foundFull;
        const resolved = resolvePlayerDisplayName(foundUser);
        if (resolved && resolved.toLowerCase() !== 'mitglied' && !isRawUid(resolved)) {
          return resolved;
        }
      }
    }

    if (targetUser?.klarname) return targetUser.klarname;
    if (targetUser?.name && !isRawUid(targetUser.name)) return targetUser.name;

    if (
      searchObj?.userName &&
      searchObj.userName.toLowerCase() !== 'mitglied' &&
      !isRawUid(searchObj.userName)
    ) {
      return searchObj.userName;
    }

    return 'Spieler';
  };

  const loadSearches = async () => {
    try {
      setLoading(true);
      const data = await getLeaguePartnerSearches();
      setSearches(data);
    } catch (err) {
      console.error('Fehler beim Laden der Spielpartner:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSearches();
  }, [clubId]);

  const currentUserSearch = useMemo(() => {
    return searches.find(
      (s) =>
        s &&
        (s.userId === currentUser.id ||
          s.id === currentUser.id ||
          (currentUser.name && s.userId && currentUser.name.toLowerCase() === String(s.userId).toLowerCase()) ||
          (currentUser.name && s.userName && currentUser.name.toLowerCase() === String(s.userName).toLowerCase())),
    );
  }, [searches, currentUser]);

  // Auto-repair legacy search entries that have "Mitglied" or "Verein" saved
  useEffect(() => {
    if (currentUserSearch) {
      const needsNameRepair =
        !currentUserSearch.userName ||
        currentUserSearch.userName.toLowerCase() === 'mitglied' ||
        currentUserSearch.userName === currentUserSearch.userId;
      const needsClubRepair =
        !currentUserSearch.clubName ||
        currentUserSearch.clubName.toLowerCase() === 'verein';

      if (needsNameRepair || needsClubRepair) {
        const resolvedName =
          resolvePlayerDisplayName(currentUser) ||
          `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() ||
          currentUser.klarname ||
          currentUser.name ||
          'Patrick Taglinger';

        const currentCanonical = getCanonicalClubId(currentUser.vereinsId || clubId || 'sv-neuhausen');
        const resolvedClubId = currentUser.vereinsId || clubId || currentCanonical;
        const resolvedClubName =
          settings?.clubName ||
          resolveClubName(resolvedClubId, undefined, userClubs) ||
          (currentCanonical === 'sv-neuhausen' ? 'SV Neuhausen' : currentCanonical);

        saveLeaguePartnerSearch(
          currentUser.id,
          resolvedClubId,
          currentUserSearch.availabilityText,
          currentUserSearch.expiresAt,
          resolvedName,
          resolvedClubName,
          currentUserSearch.showContactInfo,
        ).then(() => {
          loadSearches();
        }).catch(console.error);
      }
    }
  }, [currentUserSearch, currentUser, clubId, settings, userClubs]);

  const handleSaveSearch = async (
    availabilityText: string,
    expiresAt: string,
    showContactInfo: boolean,
  ) => {
    const fullName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    const userName =
      fullName ||
      resolvePlayerDisplayName(currentUser) ||
      currentUser.klarname ||
      currentUser.name ||
      'Patrick Taglinger';

    const currentCanonical = getCanonicalClubId(currentUser.vereinsId || clubId || 'sv-neuhausen');
    const resolvedClubId = currentUser.vereinsId || clubId || currentCanonical;
    const resolvedClubName =
      settings?.clubName ||
      resolveClubName(resolvedClubId, undefined, userClubs) ||
      (currentCanonical === 'sv-neuhausen' ? 'SV Neuhausen' : currentCanonical);

    await saveLeaguePartnerSearch(
      currentUser.id,
      resolvedClubId,
      availabilityText,
      expiresAt,
      userName,
      resolvedClubName,
      showContactInfo,
    );
    await loadSearches();
  };

  const handleDeleteSearch = async (searchIdOrUserId: string) => {
    try {
      await deleteLeaguePartnerSearch(searchIdOrUserId);
      setSearches((prev) =>
        prev.filter((s) => s.id !== searchIdOrUserId && s.userId !== searchIdOrUserId),
      );
      setSearchToEdit(null);
      setIsModalOpen(false);
      await loadSearches();
    } catch (e) {
      console.error('Fehler beim Löschen der Spielanzeige:', e);
      throw e;
    }
  };

  // Filtered searches (strictly for the active club, own search always pinned at top)
  const filteredSearches = useMemo(() => {
    const activeCanonical = getCanonicalClubId(clubId || currentUser.vereinsId || 'sv-neuhausen');

    const list = searches.filter((s) => {
      const targetUser =
        getUserObject(s.userId) ||
        (s.userName ? getUserObject(s.userName) : undefined) ||
        (s.userId === currentUser.id ? currentUser : undefined);
      const searchCanonical = getSearchClubCanonicalId(s, targetUser);
      const resolvedClubName = resolveTargetClub(targetUser, s);
      const resolvedCanonical = getCanonicalClubId(resolvedClubName);
      const rawClub = targetUser?.vereinsId || s.clubId;
      const rawClubCanonical = rawClub ? getCanonicalClubId(rawClub) : '';

      return (
        searchCanonical.toLowerCase() === activeCanonical.toLowerCase() ||
        resolvedCanonical.toLowerCase() === activeCanonical.toLowerCase() ||
        (rawClubCanonical && rawClubCanonical.toLowerCase() === activeCanonical.toLowerCase())
      );
    });

    return [...list].sort((a, b) => {
      const aIsOwner =
        currentUser.id === a.userId ||
        currentUser.id === a.id ||
        (currentUser.name &&
          a.userName &&
          currentUser.name.toLowerCase() === a.userName.toLowerCase());
      const bIsOwner =
        currentUser.id === b.userId ||
        currentUser.id === b.id ||
        (currentUser.name &&
          b.userName &&
          currentUser.name.toLowerCase() === b.userName.toLowerCase());

      if (aIsOwner && !bIsOwner) return -1;
      if (!aIsOwner && bIsOwner) return 1;
      return 0;
    });
  }, [searches, usersMap, firestoreUsers, currentUser, userClubs, clubId]);

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-4 flex flex-col gap-3.5 sm:gap-4 w-full flex-grow lg:animate-in lg:fade-in lg:duration-500 min-h-0">
      {/* 1. TOP HEADER (eigenständiges Element direkt auf graum Hintergrund wie Veranstaltungen / Rangliste) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-2xl text-[var(--color-primary)] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">
                  {t('nav.spielpartner', 'SPIELPARTNER')}
                </h3>
              </div>
              <p className="text-xs text-slate-500 font-medium tracking-wide mt-1">
                {t(
                  'admin.modulesConfig.spielpartner.desc',
                  'Spielbereitschaft signalisieren und Mitspieler finden',
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end w-full sm:w-auto">
            {currentUserSearch ? (
              <button
                type="button"
                onClick={() => {
                  setSearchToEdit(currentUserSearch);
                  setIsModalOpen(true);
                }}
                style={{ backgroundColor: settings?.primaryColor || "var(--color-primary)" }}
                className="bg-[var(--color-primary)] text-white hover:brightness-95 uppercase tracking-widest px-3 md:px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer border border-transparent outline-none whitespace-nowrap text-xs font-bold h-10"
              >
                <Edit3 className="w-3.5 h-3.5 text-white" />
                <span>{t('spielpartner.manageMyAd', 'Meine Anzeige verwalten')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchToEdit(null);
                  setIsModalOpen(true);
                }}
                style={{ backgroundColor: settings?.primaryColor || "var(--color-primary)" }}
                className="bg-[var(--color-primary)] text-white hover:brightness-95 uppercase tracking-widest px-3 md:px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 md:gap-2 cursor-pointer border border-transparent outline-none whitespace-nowrap text-xs font-bold h-10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('spielpartner.postAd', 'Spielanzeige aufgeben')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. BENTO CARDS GRID */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-16 text-center text-slate-400 font-medium text-sm">
          <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          {t('spielpartner.loading', 'Spielpartner werden geladen...')}
        </div>
      ) : filteredSearches.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 items-stretch">
          {filteredSearches.map((search) => {
            const isOwner =
              currentUser.id === search.userId ||
              currentUser.id === search.id ||
              (currentUser.name &&
                search.userName &&
                currentUser.name.toLowerCase() === search.userName.toLowerCase());

            const targetUser =
              getUserObject(search.userId) ||
              (search.userName ? getUserObject(search.userName) : undefined) ||
              (isOwner ? currentUser : undefined);

            const isAdmin =
              currentUser.role === 'admin' ||
              currentUser.role === 'super-admin' ||
              !!currentUser.hauptAdmin;
            const canDelete = isOwner || isAdmin;
            const displayName = resolveTargetDisplayName(targetUser, search);
            const displayClub = resolveTargetClub(targetUser, search);

            const hasEmail = Boolean(
              targetUser?.email &&
                !targetUser.email.endsWith('.system.local') &&
                !targetUser.is_placeholder_email,
            );
            const hasPhone = Boolean(targetUser?.phone);
            const isGlobalAllowed = targetUser?.showContactInfo !== false;
            const showMail = hasEmail && search.showContactInfo && isGlobalAllowed;
            const showPhone = hasPhone && search.showContactInfo && isGlobalAllowed;

            return (
              <div
                key={search.id || search.userId}
                className={
                  'bg-white rounded-2xl border ' +
                  (isOwner
                    ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 shadow-sm'
                    : 'border-slate-200/80 shadow-sm') +
                  ' p-4 sm:p-5 flex flex-col justify-between space-y-4 relative'
                }
              >
                <div className="space-y-3.5">
                  {/* Header: Avatar, Name, Verein */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {targetUser ? (
                          <UserAvatar user={targetUser} name={displayName} size="md" />
                        ) : (
                          <UserAvatar name={displayName} size="md" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm leading-tight truncate flex items-center gap-1.5">
                          <span>{displayName}</span>
                          {isOwner && (
                            <span className="text-[9px] bg-[var(--color-primary)]/15 text-[var(--color-primary)] font-black px-1.5 py-0.5 rounded">
                              {t('spielpartner.youBadge', 'DU')}
                            </span>
                          )}
                        </h3>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {displayClub}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verfügbarkeitstext */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/60 text-slate-700 text-xs font-medium leading-relaxed italic min-h-[58px]">
                    "{search.availabilityText}"
                  </div>

                  {/* Kontaktdaten */}
                  {(showMail || showPhone) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {showMail && targetUser?.email && (
                        <a
                          href={`mailto:${targetUser.email}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold transition max-w-full truncate"
                          title={t('spielpartner.sendEmailTo', 'E-Mail senden an {{name}}', { name: displayName })}
                        >
                          <Mail className="w-3 h-3 text-blue-500 shrink-0" />
                          <span className="truncate">{targetUser.email}</span>
                        </a>
                      )}
                      {showPhone && targetUser?.phone && (
                        <a
                          href={`tel:${targetUser.phone.replace(/[^0-9+]/g, '')}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition"
                          title={t('spielpartner.callPhone', 'Anrufen: {{phone}}', { phone: targetUser.phone })}
                        >
                          <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>{targetUser.phone}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Bearbeiten / Löschen (wenn berechtigt) */}
                {(isOwner || canDelete) && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchToEdit(search);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition cursor-pointer"
                        title={t('spielpartner.editAd', 'Anzeige bearbeiten')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSearch(search.id || search.userId)}
                        className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg transition cursor-pointer"
                        title={isAdmin && !isOwner ? t('spielpartner.deleteAsAdmin', 'Als Admin löschen') : t('spielpartner.deleteAd', 'Löschen')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100">
            <Users className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">
            {t('spielpartner.emptyTitle', 'Noch keine Spielpartneranzeigen online')}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            {t(
              'spielpartner.emptyDesc',
              'Signalisiere deine Verfügbarkeit über den Button oben, um als Erster Mitspieler im Verein zu finden.',
            )}
          </p>
        </div>
      )}

      {/* 5. MODAL: CREATE / EDIT AD */}
      {isModalOpen && (
        <CreateAdModal
          currentUser={currentUser}
          existingSearch={searchToEdit || currentUserSearch}
          onClose={() => {
            setIsModalOpen(false);
            setSearchToEdit(null);
          }}
          onSave={handleSaveSearch}
          onDelete={() => {
            const target = searchToEdit || currentUserSearch;
            const targetId = target?.id || target?.userId || currentUser.id;
            return handleDeleteSearch(targetId);
          }}
        />
      )}
    </div>
  );
};
