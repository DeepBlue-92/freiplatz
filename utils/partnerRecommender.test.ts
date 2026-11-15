import { getRecommendedPartners, extractPartnerUserIds } from './partnerRecommender.ts';
import type { User } from '../types.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`✓ PASS: ${msg}`);
}

const mockUsers: Record<string, User> = {
  user_me: {
    id: 'user_me',
    name: 'Ich Spieler',
    role: 'mitglied' as any,
    gender: 'm',
    firstName: 'Ich',
    lastName: 'Spieler',
    vereinsId: 'sv-neuhausen',
    partnerStats: {
      '2024': { user_old: 50, user_a: 10 }, // 2024 is older than currentYear - 1 (for 2026) -> ignored
      '2025': { user_a: 5, user_b: 10, user_inactive: 20, user_suspended: 30 },
      '2026': { user_a: 7, user_b: 2, user_c: 4, user_me: 99 }, // user_me should be ignored
    },
  },
  user_a: {
    id: 'user_a',
    name: 'anton',
    role: 'mitglied' as any,
    gender: 'm',
    firstName: 'Anton',
    lastName: 'Albatros',
    status: 'active',
    vereinsId: 'sv-neuhausen',
  },
  user_b: {
    id: 'user_b',
    name: 'bernd',
    role: 'mitglied' as any,
    gender: 'm',
    firstName: 'Bernd',
    lastName: 'Bauer',
    status: 'active',
    vereinsId: 'sv-neuhausen',
  },
  user_c: {
    id: 'user_c',
    name: 'claudia',
    role: 'mitglied' as any,
    gender: 'w',
    firstName: 'Claudia',
    lastName: 'Clemens',
    status: 'active',
    vereinsId: 'sv-neuhausen',
  },
  user_inactive: {
    id: 'user_inactive',
    name: 'ina',
    role: 'mitglied' as any,
    gender: 'w',
    firstName: 'Ina',
    lastName: 'Inaktiv',
    status: 'inactive', // Should be filtered out
    vereinsId: 'sv-neuhausen',
  },
  user_suspended: {
    id: 'user_suspended',
    name: 'sven',
    role: 'mitglied' as any,
    gender: 'm',
    firstName: 'Sven',
    lastName: 'Sperre',
    isSuspended: true, // Should be filtered out
    vereinsId: 'sv-neuhausen',
  },
  user_old: {
    id: 'user_old',
    name: 'olaf',
    role: 'mitglied' as any,
    gender: 'm',
    firstName: 'Olaf',
    lastName: 'Oldie',
    status: 'active',
    vereinsId: 'sv-neuhausen',
  },
};

console.log('=== TEST 1: Two-Year Window Sum & Ranking (2026 override) ===');
// For year 2026:
// user_a: 2026 (7) + 2025 (5) = 12
// user_b: 2026 (2) + 2025 (10) = 12 -> alphabetical: Anton Albatros before Bernd Bauer
// user_c: 2026 (4) + 2025 (0) = 4
// user_old: only 2024 -> total 0 -> ignored
// user_inactive, user_suspended -> filtered out
// user_me -> self filtered out

const recs1 = getRecommendedPartners(mockUsers.user_me, mockUsers, [], 5, 2026);
assert(recs1.length === 3, `Expected 3 active candidates, got ${recs1.length}`);
assert(recs1[0].user.id === 'user_a' && recs1[0].totalCount === 12, '1st place: user_a with 12 points');
assert(recs1[1].user.id === 'user_b' && recs1[1].totalCount === 12, '2nd place: user_b with 12 points');
assert(recs1[2].user.id === 'user_c' && recs1[2].totalCount === 4, '3rd place: user_c with 4 points');

console.log('\n=== TEST 2: Exclusion of Already Selected Additional Players ===');
const recsWithSelected = getRecommendedPartners(mockUsers.user_me, mockUsers, ['Anton Albatros'], 5, 2026);
assert(recsWithSelected.length === 2, 'user_a excluded because already selected');
assert(recsWithSelected[0].user.id === 'user_b', 'New 1st place is user_b');
assert(recsWithSelected[1].user.id === 'user_c', 'New 2nd place is user_c');

console.log('\n=== TEST 3: Limit Restriction (Mobile Top 2 / 3) ===');
const recsLimit2 = getRecommendedPartners(mockUsers.user_me, mockUsers, [], 2, 2026);
assert(recsLimit2.length === 2, `Limit capped to 2 items (got ${recsLimit2.length})`);

console.log('\n=== TEST 4: Cold Start (No Stats) ===');
const userNoStats: User = {
  id: 'newbie',
  name: 'newbie',
  role: 'mitglied' as any,
  gender: 'm',
  firstName: 'New',
  lastName: 'Bie',
  vereinsId: 'sv-neuhausen',
};
const recsCold = getRecommendedPartners(userNoStats, mockUsers, [], 5, 2026);
assert(recsCold.length === 0, 'Returns empty array when user has no stats');

console.log('\n=== TEST 5: extractPartnerUserIds ===');
const partnerIds = extractPartnerUserIds('user_me', ['Ich Spieler', 'Anton Albatros', 'Gast 1', 'bernd'], mockUsers);
assert(partnerIds.length === 2, `Extracted 2 valid partner user IDs (got ${partnerIds.length})`);
assert(partnerIds.includes('user_a'), 'Contains user_a');
assert(partnerIds.includes('user_b'), 'Contains user_b');
assert(!partnerIds.includes('user_me'), 'Excludes booker');

console.log('\nALL RECOMMENDER TESTS PASSED SUCCESSFULLY!\n');
