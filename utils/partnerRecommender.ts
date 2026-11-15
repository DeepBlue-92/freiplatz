import type { User } from '../types.ts';
import { resolvePlayerDisplayName } from './playerHelper.ts';

export interface RecommendedPartner {
  user: User;
  displayName: string;
  totalCount: number;
}

/**
 * Returns the top recommended partners for the current user based on
 * booking frequencies across currentYear and lastYear (currentYear - 1).
 *
 * Rules:
 * - 0 additional Firestore reads (uses in-memory currentUser & users dictionary).
 * - Sums currentYear + (currentYear - 1) counts.
 * - Filters out inactive/suspended users.
 * - Filters out currentUser and players already selected in additionalPlayers.
 * - Sorts descending by totalCount.
 * - Returns max `limit` results (e.g. 3 for mobile, 5 for desktop).
 */
export function getRecommendedPartners(
  currentUser: User | null | undefined,
  users: Record<string, User> | undefined,
  additionalPlayers: string[] = [],
  limit: number = 5,
  currentYearOverride?: number
): RecommendedPartner[] {
  if (!currentUser || !currentUser.id || !users) {
    return [];
  }

  // Resolve the most up-to-date user profile object
  const currentProfile = users[currentUser.id] || currentUser;
  const stats = currentProfile.partnerStats;
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  const currentYear = (currentYearOverride ?? new Date().getFullYear()).toString();
  const lastYear = ((currentYearOverride ?? new Date().getFullYear()) - 1).toString();

  const currentYearStats = stats[currentYear] || {};
  const lastYearStats = stats[lastYear] || {};

  // Collect all unique candidate partner IDs
  const allPartnerIds = new Set<string>([
    ...Object.keys(currentYearStats),
    ...Object.keys(lastYearStats),
  ]);

  if (allPartnerIds.size === 0) {
    return [];
  }

  // Set of normalized strings for already selected additional players
  const normalizedSelectedPlayers = new Set(
    additionalPlayers
      .filter((p) => p && typeof p === 'string' && p.trim() !== '')
      .map((p) => p.trim().toLowerCase())
  );

  const candidates: RecommendedPartner[] = [];

  for (const partnerId of allPartnerIds) {
    // Cannot recommend self
    if (partnerId === currentUser.id) continue;

    const countCurrent = Number(currentYearStats[partnerId]) || 0;
    const countLast = Number(lastYearStats[partnerId]) || 0;
    const totalCount = countCurrent + countLast;

    if (totalCount <= 0) continue;

    // Look up partner in active users directory
    const partnerUser = users[partnerId] || Object.values(users).find(
      (u) => u.id === partnerId || u.name?.toLowerCase() === partnerId.toLowerCase()
    );

    if (!partnerUser) continue;

    // Status filter: ignore inactive, deleted, or suspended users
    if (partnerUser.isSuspended === true) continue;
    if (partnerUser.status && partnerUser.status !== 'active') continue;

    const displayName = resolvePlayerDisplayName(partnerUser);

    // Check if partner is already in additionalPlayers (by id, username, or formatted display name)
    const isAlreadySelected =
      normalizedSelectedPlayers.has(partnerUser.id.toLowerCase()) ||
      (partnerUser.name && normalizedSelectedPlayers.has(partnerUser.name.toLowerCase())) ||
      (partnerUser.email && normalizedSelectedPlayers.has(partnerUser.email.toLowerCase())) ||
      normalizedSelectedPlayers.has(displayName.toLowerCase());

    if (isAlreadySelected) continue;

    candidates.push({
      user: partnerUser,
      displayName,
      totalCount,
    });
  }

  // Sort descending by total booking count; secondary sort by display name
  candidates.sort((a, b) => {
    if (b.totalCount !== a.totalCount) {
      return b.totalCount - a.totalCount;
    }
    return a.displayName.localeCompare(b.displayName, 'de');
  });

  return candidates.slice(0, Math.max(0, limit));
}

/**
 * Resolves player strings (from a booking's `players` array) to partner User IDs
 * excluding the booker and generic guest labels.
 */
export function extractPartnerUserIds(
  bookerId: string,
  players: string[] = [],
  users: Record<string, User> = {}
): string[] {
  if (!players || players.length === 0) return [];

  const partnerIds = new Set<string>();
  const normalizedBookerId = (bookerId || '').trim().toLowerCase();

  const allUsersList = Object.values(users);

  for (const rawPlayer of players) {
    if (!rawPlayer || typeof rawPlayer !== 'string') continue;
    const trimmed = rawPlayer.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    // Skip generic guests
    if (lower.startsWith('gast') || lower.includes('gastspieler')) continue;

    // Skip the booker
    if (lower === normalizedBookerId) continue;

    // 1. Direct match by key / ID
    if (users[trimmed] && users[trimmed].id !== bookerId) {
      partnerIds.add(users[trimmed].id);
      continue;
    }

    // 2. Search by id, username, email, displayName, or fullName
    const foundUser = allUsersList.find((u) => {
      if (u.id === bookerId) return false;
      if (u.id.toLowerCase() === lower) return true;
      if (u.name && u.name.toLowerCase() === lower) return true;
      if (u.email && u.email.toLowerCase() === lower) return true;
      const dName = resolvePlayerDisplayName(u).toLowerCase();
      if (dName === lower) return true;
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
      if (fullName && fullName === lower) return true;
      return false;
    });

    if (foundUser) {
      partnerIds.add(foundUser.id);
    }
  }

  return Array.from(partnerIds);
}
