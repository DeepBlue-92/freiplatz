import {
  calculateBookingFee,
  generateRuleSentence,
  buildBookingFeeContext,
  validateFeeSettings,
  hasYouthRules,
  getActiveGuestCategories,
} from './guestFeeCalculator.ts';
import type { ClubFeeSettings, BookingFeeContext, AdvancedRule } from '../types.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`✓ PASS: ${msg}`);
}

console.log('=== TEST 1: Legacy Simple Mode Fallback ===');
const legacyRules = {
  guestFeePerHour: 3.5,
  guestBillingMode: 'per_player',
};
const ctxSimple1: BookingFeeContext = {
  anzahl_gaeste: 2,
  anzahl_mitglieder: 1,
  anzahl_gesamt: 3,
  dauer_minuten: 60,
};
const res1 = calculateBookingFee(ctxSimple1, undefined, legacyRules);
assert(res1.mode === 'SIMPLE', 'Uses SIMPLE mode when settings undefined');
assert(res1.totalEuro === 7.0, `Expected 7.00 €, got ${res1.totalEuro} € (2 guests * 3.50 * 1h)`);

console.log('\n=== TEST 2: Simple Mode Zero Guests ===');
const ctxZeroGuests: BookingFeeContext = {
  anzahl_gaeste: 0,
  anzahl_mitglieder: 2,
  anzahl_gesamt: 2,
  dauer_minuten: 90,
};
const resZero = calculateBookingFee(ctxZeroGuests, undefined, legacyRules);
assert(resZero.totalEuro === 0, 'Zero guests result in 0 € in simple mode');
assert(resZero.action.type === 'FREE', 'Action is FREE when 0 guests');

console.log('\n=== TEST 3: Advanced Mode Top-Down Priority Evaluation ===');
const rule1Priority0: AdvancedRule = {
  id: 'rule-single-guest-single-match',
  name: 'Einzel mit 1 Gast',
  priority: 0,
  match_type: 'ALL',
  conditions: [
    { id: 'c1', field: 'anzahl_gaeste', operator: 'EQUALS', value: 1 },
    { id: 'c2', field: 'anzahl_gesamt', operator: 'EQUALS', value: 2 },
  ],
  action: {
    type: 'PER_COURT_HOUR',
    amount_cents: 1000, // 10,00 € per court hour
  },
};

const rule2Priority1: AdvancedRule = {
  id: 'rule-two-guests',
  name: 'Doppel mit 2 Gästen',
  priority: 1,
  match_type: 'ALL',
  conditions: [
    { id: 'c3', field: 'anzahl_gaeste', operator: 'GREATER_THAN_EQUAL', value: 2 },
  ],
  action: {
    type: 'PER_GUEST',
    amount_cents: 600, // 6,00 € flat per guest
  },
};

const advancedSettings: ClubFeeSettings = {
  fee_calculation_mode: 'ADVANCED',
  advanced_config: {
    rules: [rule2Priority1, rule1Priority0], // intentionally unordered to test priority sort
    default_rule: {
      type: 'PER_GUEST_HOUR',
      amount_cents: 400, // 4,00 € fallback
    },
  },
};

// Context matches Rule 1: 1 guest, total 2 players, 90 minutes
const ctxSingle: BookingFeeContext = {
  anzahl_gaeste: 1,
  anzahl_mitglieder: 1,
  anzahl_gesamt: 2,
  dauer_minuten: 90,
};
const resAdv1 = calculateBookingFee(ctxSingle, advancedSettings);
assert(resAdv1.matchedRuleId === 'rule-single-guest-single-match', 'Priority 0 matches first');
assert(resAdv1.totalEuro === 15.0, `Expected 15.00 € (10.00 * 1.5h), got ${resAdv1.totalEuro} €`);

// Context matches Rule 2: 2 guests, total 4 players, 60 minutes
const ctxDouble: BookingFeeContext = {
  anzahl_gaeste: 2,
  anzahl_mitglieder: 2,
  anzahl_gesamt: 4,
  dauer_minuten: 60,
};
const resAdv2 = calculateBookingFee(ctxDouble, advancedSettings);
assert(resAdv2.matchedRuleId === 'rule-two-guests', 'Rule 2 matches');
assert(resAdv2.totalEuro === 12.0, `Expected 12.00 € (2 guests * 6.00 €), got ${resAdv2.totalEuro} €`);

console.log('\n=== TEST 4: Default Fallback Rule When No Rules Match ===');
// Context: 0 guests or condition that doesn't match above (e.g. 1 guest, 3 total players)
const ctxNoMatch: BookingFeeContext = {
  anzahl_gaeste: 1,
  anzahl_mitglieder: 2,
  anzahl_gesamt: 3,
  dauer_minuten: 60,
};
const resFallback = calculateBookingFee(ctxNoMatch, advancedSettings);
assert(resFallback.matchedRuleId === 'DEFAULT_RULE', 'Falls back to DEFAULT_RULE');
assert(resFallback.totalEuro === 4.0, `Expected 4.00 € (1 guest * 4.00 * 1h), got ${resFallback.totalEuro} €`);

console.log('\n=== TEST 5: Workday-style Business Sentence Preview ===');
const sentenceRule: AdvancedRule = {
  id: 'sentence-test',
  name: 'Gast mit 3 Spielern',
  priority: 0,
  match_type: 'ALL',
  conditions: [
    { id: 'c1', field: 'anzahl_gaeste', operator: 'GREATER_THAN_EQUAL', value: 1 },
    { id: 'c2', field: 'anzahl_gesamt', operator: 'EQUALS', value: 3 },
  ],
  action: {
    type: 'PER_COURT_HOUR',
    amount_cents: 1200,
  },
};
const sentence = generateRuleSentence(sentenceRule);
console.log(`Generated Sentence:\n"${sentence}"`);
assert(
  sentence === 'WENN Gesamtzahl der Gäste mindestens 1 UND Gesamtzahl der Spieler exakt 3, DANN berechne 12,00 € pauschal pro Platzstunde.',
  'Generated German sentence matches specification exact requirement'
);

console.log('\n=== TEST 6: Validation Guardrails ===');
const invalidSettings: ClubFeeSettings = {
  fee_calculation_mode: 'ADVANCED',
  advanced_config: {
    rules: [
      {
        id: 'r-bad',
        name: '', // Empty name
        priority: 0,
        match_type: 'ALL',
        conditions: [
          { id: 'c-bad', field: 'anzahl_gaeste', operator: 'EQUALS', value: null }, // null value
        ],
        action: { type: 'PER_GUEST', amount_cents: 500 },
      },
    ],
    default_rule: { type: 'PER_GUEST', amount_cents: -50 }, // negative amount
  },
};
const validationResult = validateFeeSettings(invalidSettings);
assert(!validationResult.isValid, 'Validation correctly flags invalid configuration');
assert(Boolean(validationResult.errors['rule_r-bad_name']), 'Flags empty rule name');
assert(Boolean(validationResult.errors['rule_r-bad_cond_c-bad_value']), 'Flags null condition value');
assert(Boolean(validationResult.errors['default_rule_amount']), 'Flags negative default rule amount');

console.log('\n=== TEST 7: Youth Rule Detection & Evaluation ===');

const youthRule: AdvancedRule = {
  id: 'rule-youth-guest',
  name: 'Jugendlicher Gast Tarif',
  priority: 0,
  match_type: 'ALL',
  conditions: [
    { id: 'cy1', field: 'anzahl_jugendliche_gaeste', operator: 'GREATER_THAN_EQUAL', value: 1 },
  ],
  action: {
    type: 'PER_GUEST_HOUR',
    amount_cents: 200, // 2,00 € per youth guest per hour
  },
};

const settingsWithYouth: ClubFeeSettings = {
  fee_calculation_mode: 'ADVANCED',
  advanced_config: {
    rules: [youthRule],
    default_rule: {
      type: 'PER_GUEST_HOUR',
      amount_cents: 500, // 5,00 € for adult guests
    },
  },
};

assert(hasYouthRules(settingsWithYouth) === true, 'hasYouthRules returns true when youth rules exist');
assert(hasYouthRules(advancedSettings) === false, 'hasYouthRules returns false when no youth rules exist');

const ctxYouthBooking: BookingFeeContext = {
  anzahl_gaeste: 1,
  anzahl_erwachsene_gaeste: 0,
  anzahl_jugendliche_gaeste: 1,
  anzahl_jugendliche_gesamt: 1,
  anzahl_mitglieder: 1,
  anzahl_gesamt: 2,
  dauer_minuten: 60,
};

const resYouth = calculateBookingFee(ctxYouthBooking, settingsWithYouth);
assert(resYouth.matchedRuleId === 'rule-youth-guest', 'Youth rule correctly matched');
assert(resYouth.totalEuro === 2.0, `Expected 2.00 €, got ${resYouth.totalEuro} €`);
assert(Boolean(resYouth.ruleSentence), 'ruleSentence is generated in calculation result');
console.log(`Youth Rule Sentence: "${resYouth.ruleSentence}"`);

console.log('\n=== TEST 8: buildBookingFeeContext with Youth Calculations ===');
const ctxBuilt = buildBookingFeeContext({
  court: 'Platz 1',
  players: ['Max Mustermann', 'Gastspieler 1'],
  guestCount: 2,
  adultGuestCount: 1,
  youthGuestCount: 1,
  date: '2026-10-10',
  time: '14:00',
  durationMinutes: 60,
});
assert(ctxBuilt.anzahl_erwachsene_gaeste === 1, 'Adult guest count is 1');
assert(ctxBuilt.anzahl_jugendliche_gaeste === 1, 'Youth guest count is 1');
assert(ctxBuilt.anzahl_gaeste === 2, 'Total guest count is 2');
assert(ctxBuilt.anzahl_jugendliche_gesamt === 1, 'Total youth count is 1');

console.log('\n=== TEST 9: Split Rate Calculation for Mixed Adult & Youth Matches (Simple Mode) ===');
const splitSimpleSettings: ClubFeeSettings = {
  fee_calculation_mode: 'SIMPLE',
  simple_config: {
    rate_type: 'PER_GUEST_HOUR',
    amount_cents: 500, // 5,00 € adult
    youth_amount_cents: 250, // 2,50 € youth
  },
};
assert(hasYouthRules(splitSimpleSettings) === true, 'hasYouthRules returns true for simple config with youth rate');

const ctxMixedBooking1: BookingFeeContext = {
  anzahl_gaeste: 2,
  anzahl_erwachsene_gaeste: 1,
  anzahl_jugendliche_gaeste: 1,
  anzahl_mitglieder: 2,
  anzahl_gesamt: 4,
  dauer_minuten: 90, // 1.5h
};
const resSplit1 = calculateBookingFee(ctxMixedBooking1, splitSimpleSettings);
// 1 adult * 5.00€ + 1 youth * 2.50€ = 7.50€/h * 1.5h = 11.25€
assert(resSplit1.totalEuro === 11.25, `Expected 11.25 € (1 erw * 5€ + 1 jug * 2.50€ * 1.5h), got ${resSplit1.totalEuro} €`);
console.log(`Split rate description: "${resSplit1.description}"`);
console.log(`Split rate sentence: "${resSplit1.ruleSentence}"`);

console.log('\n=== TEST 10: Split Rate Calculation in Advanced Rule & Default Rule ===');
const splitAdvancedSettings: ClubFeeSettings = {
  fee_calculation_mode: 'ADVANCED',
  advanced_config: {
    rules: [
      {
        id: 'rule-mixed-double',
        name: 'Doppel mit Gästen (Split Rate)',
        priority: 0,
        conditions: [
          { id: 'cd1', field: 'anzahl_gesamt', operator: 'EQUALS', value: 4 },
        ],
        action: {
          type: 'PER_GUEST_HOUR',
          amount_cents: 600, // 6,00 € adult
          youth_amount_cents: 300, // 3,00 € youth
        },
      },
    ],
    default_rule: {
      type: 'PER_GUEST_HOUR',
      amount_cents: 400,
      youth_amount_cents: 200,
    },
  },
};

const ctxMixedBooking2: BookingFeeContext = {
  anzahl_gaeste: 3,
  anzahl_erwachsene_gaeste: 1,
  anzahl_jugendliche_gaeste: 2,
  anzahl_mitglieder: 1,
  anzahl_gesamt: 4,
  dauer_minuten: 60, // 1h
};
// 1 erw * 6.00€ + 2 jug * 3.00€ = 12.00€ * 1h = 12.00€
const resSplit2 = calculateBookingFee(ctxMixedBooking2, splitAdvancedSettings);
assert(resSplit2.matchedRuleId === 'rule-mixed-double', 'Matches rule-mixed-double');
assert(resSplit2.totalEuro === 12.00, `Expected 12.00 € (1 erw * 6€ + 2 jug * 3€ * 1h), got ${resSplit2.totalEuro} €`);

// Test default fallback with split rates:
const ctxFallbackMixed: BookingFeeContext = {
  anzahl_gaeste: 2,
  anzahl_erwachsene_gaeste: 1,
  anzahl_jugendliche_gaeste: 1,
  anzahl_mitglieder: 0,
  anzahl_gesamt: 2,
  dauer_minuten: 120, // 2h
};
// 1 erw * 4.00€ + 1 jug * 2.00€ = 6.00€ * 2h = 12.00€
const resSplitDefault = calculateBookingFee(ctxFallbackMixed, splitAdvancedSettings);
assert(resSplitDefault.matchedRuleId === 'DEFAULT_RULE', 'Matches DEFAULT_RULE');
assert(resSplitDefault.totalEuro === 12.00, `Expected 12.00 € (1 erw * 4€ + 1 jug * 2€ * 2h), got ${resSplitDefault.totalEuro} €`);

console.log('\n=== TEST 11: Duration based on Slots (anzahl_slots) ===');
const slotRule: AdvancedRule = {
  id: 'rule-multi-slot',
  name: 'Lange Buchung ab 2 Slots',
  priority: 0,
  conditions: [
    { id: 'cs1', field: 'anzahl_slots', operator: 'GREATER_THAN_EQUAL', value: 2 },
  ],
  action: {
    type: 'PER_COURT_HOUR',
    amount_cents: 800, // 8,00 € per court hour
  },
};

const slotSettings: ClubFeeSettings = {
  fee_calculation_mode: 'ADVANCED',
  advanced_config: {
    rules: [slotRule],
    default_rule: {
      type: 'PER_COURT_HOUR',
      amount_cents: 1000,
    },
  },
};

const ctx1Slot = buildBookingFeeContext({
  players: ['Spieler 1', 'Gast 1'],
  durationMinutes: 60, // 1 slot
});
assert(ctx1Slot.anzahl_slots === 1, 'buildBookingFeeContext computed 1 slot for 60 min');
const resSlot1 = calculateBookingFee(ctx1Slot, slotSettings);
assert(resSlot1.matchedRuleId === 'DEFAULT_RULE', '1 slot does not match rule-multi-slot, uses default');

const ctx2Slots = buildBookingFeeContext({
  players: ['Spieler 1', 'Gast 1'],
  durationMinutes: 120, // 2 slots
});
assert(ctx2Slots.anzahl_slots === 2, 'buildBookingFeeContext computed 2 slots for 120 min');
const resSlot2 = calculateBookingFee(ctx2Slots, slotSettings);
assert(resSlot2.matchedRuleId === 'rule-multi-slot', '2 slots matches rule-multi-slot');
assert(resSlot2.totalEuro === 16.00, `Expected 16.00 € (8.00 * 2h), got ${resSlot2.totalEuro} €`);

const slotSentence = generateRuleSentence(slotRule);
console.log(`Slot Rule Sentence: "${slotSentence}"`);
assert(slotSentence.includes('12,00') === false && slotSentence.includes('Std.'), 'Sentence formats slot unit correctly');

console.log('\n=== TEST 12: Dynamic Guest Categories & Configurable Youth Threshold ===');
// 1. Settings without youth rules -> returns 1 general category
const defaultCats = getActiveGuestCategories(undefined);
assert(defaultCats.length === 1, 'Only 1 category when no youth rules');
assert(defaultCats[0].key === 'guestCount', 'Category key is guestCount');

// 2. Settings with youth rules -> returns 2 categories
const youthCats = getActiveGuestCategories(settingsWithYouth);
assert(youthCats.length === 2, 'Returns 2 categories when youth rules exist');
assert(youthCats[0].key === 'adultGuestCount', 'First category is adultGuestCount');
assert(youthCats[0].label.includes('ab 18 J.'), 'Default adult threshold is ab 18 J. in label');
assert(youthCats[1].key === 'youthGuestCount', 'Second category is youthGuestCount');
assert(youthCats[1].label.includes('U18'), 'Default threshold is U18 in label');

// 3. Settings with custom youth threshold (e.g. 14)
const customThresholdSettings: ClubFeeSettings = {
  ...settingsWithYouth,
  youth_age_threshold: 14,
};
const customCats = getActiveGuestCategories(customThresholdSettings);
assert(customCats[0].label.includes('ab 14 J.'), 'Custom threshold ab 14 J. is reflected in adult label');
assert(customCats[1].label.includes('U14'), 'Custom threshold U14 is reflected in label');

// 4. Age evaluation in buildBookingFeeContext with youthAgeThreshold: 14
const currentYear = new Date().getFullYear();
const member15YearsOld = { id: 'm15', name: 'Max 15', birthDate: `${currentYear - 15}-05-01` };
const ctxThreshold18 = buildBookingFeeContext({
  players: ['Max 15'],
  membersList: [member15YearsOld],
  youthAgeThreshold: 18,
});
assert(ctxThreshold18.anzahl_jugendliche_mitglieder === 1, '15yo is youth under threshold 18');

const ctxThreshold14 = buildBookingFeeContext({
  players: ['Max 15'],
  membersList: [member15YearsOld],
  youthAgeThreshold: 14,
});
assert(ctxThreshold14.anzahl_jugendliche_mitglieder === 0, '15yo is NOT youth under threshold 14');

console.log('\nALL 12 TEST SUITES PASSED SUCCESSFULLY!\n');

