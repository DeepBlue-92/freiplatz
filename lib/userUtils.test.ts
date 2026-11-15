import { isClubAdmin, isSuperAdmin, getUserClubs } from './userUtils.ts';
import { Role } from '../types.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`✓ PASS: ${msg}`);
}

console.log('=== TEST 1: Multi-Club User (Admin at DJK Furth, Member at SV Neuhausen) ===');
const multiClubUser = {
  id: 'hubert-urbat',
  name: 'Hubert Urbat',
  vereinsId: 'djk-furth',
  role: Role.ADMIN,
  clubs: [
    { vereinsId: 'djk-furth', role: Role.ADMIN },
    { vereinsId: 'sv-neuhausen', role: Role.MITGLIED },
  ],
};

assert(isClubAdmin(multiClubUser, 'djk-furth') === true, 'Hubert is admin at DJK Furth');
assert(isClubAdmin(multiClubUser, 'sv-neuhausen') === false, 'Hubert is NOT admin at SV Neuhausen');

console.log('\n=== TEST 2: Multi-Club User with String Array Clubs and Primary Club Role ===');
const stringClubsUser = {
  id: 'user-2',
  name: 'Test User',
  vereinsId: 'djk-furth',
  role: Role.ADMIN,
  clubs: ['djk-furth', 'sv-neuhausen'],
};

assert(isClubAdmin(stringClubsUser, 'djk-furth') === true, 'Admin in primary club djk-furth');
assert(isClubAdmin(stringClubsUser, 'sv-neuhausen') === false, 'Not admin in secondary club sv-neuhausen');

console.log('\n=== TEST 3: Regular Member across all clubs ===');
const memberUser = {
  id: 'regular-user',
  name: 'Max Mustermann',
  vereinsId: 'sv-neuhausen',
  role: Role.MITGLIED,
  clubs: [
    { vereinsId: 'sv-neuhausen', role: Role.MITGLIED },
  ],
};

assert(isClubAdmin(memberUser, 'sv-neuhausen') === false, 'Regular member is NOT admin');

console.log('\n=== TEST 4: Super Admin across all clubs ===');
const superAdminUser = {
  id: 'super-user',
  name: 'Super Admin',
  role: Role.SUPER_ADMIN,
  vereinsId: 'super-admin',
};

assert(isSuperAdmin(superAdminUser) === true, 'isSuperAdmin returns true');
assert(isClubAdmin(superAdminUser, 'sv-neuhausen') === true, 'Super Admin is admin in sv-neuhausen');
assert(isClubAdmin(superAdminUser, 'djk-furth') === true, 'Super Admin is admin in djk-furth');

console.log('\nALL USERUTILS TESTS PASSED SUCCESSFULLY!\n');
