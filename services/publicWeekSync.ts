import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking } from '../types';

export interface PublicWeekSlot {
  court: string;
  date: string;
  start: string;
  end: string;
  type: 'booked' | 'blocked';
  label?: string;
}

export interface PublicWeekDoc {
  week: string; // e.g. "2026-W47"
  slots: PublicWeekSlot[];
  updatedAt: string;
  vereinsId?: string;
}

/**
 * Calculates the ISO-8601 week string (e.g. "2026-W47") for a date in "YYYY-MM-DD" format.
 */
export function getISOWeekString(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return '';
  }
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day));
  
  // ISO week starts on Monday (1) to Sunday (7)
  const dayNum = d.getUTCDay() || 7;
  // Thursday in current week decides the ISO year
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Parses time format (e.g. "08:00 - 09:30" or "08:00") into start and end strings.
 */
function parseSlotStartEnd(timeStr: string, hours?: number): { start: string; end: string } {
  const cleanTime = (timeStr || '').trim();
  if (cleanTime.includes('-')) {
    const parts = cleanTime.split('-').map((s) => s.trim());
    return {
      start: parts[0] || '08:00',
      end: parts[1] || '09:00',
    };
  }

  const [hrStr, minStr] = cleanTime.split(':');
  const hr = Number(hrStr) || 8;
  const min = Number(minStr) || 0;
  const durationMins = hours && hours > 0 ? Math.round(hours * 60) : 60;
  const totalEndMins = hr * 60 + min + durationMins;
  const endHr = Math.floor(totalEndMins / 60) % 24;
  const endMin = totalEndMins % 60;

  return {
    start: cleanTime.includes(':') ? cleanTime : `${String(hr).padStart(2, '0')}:00`,
    end: `${String(endHr).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
  };
}

/**
 * Extracts anonymous public slots from bookings.
 * STRICT PRIVACY REQUIREMENT:
 * No personal player names, user IDs, emails, phone numbers, or private comments are ever retained.
 * 'label' is only populated for public blocks or events (e.g. "Freitagsdoppel", "Winterpause").
 */
export function extractPublicWeekSlots(bookings: Booking[]): PublicWeekSlot[] {
  if (!Array.isArray(bookings)) return [];

  const slots: PublicWeekSlot[] = [];

  for (const b of bookings) {
    if (!b || !b.date || !b.court) continue;

    const { start, end } = parseSlotStartEnd(b.time, b.hours);
    const isBlocked = Boolean(b.isLocked || b.isEvent);
    const type: 'booked' | 'blocked' = isBlocked ? 'blocked' : 'booked';

    const slot: PublicWeekSlot = {
      court: String(b.court).trim(),
      date: String(b.date).trim(),
      start,
      end,
      type,
    };

    // Label only for official blocks/events, strictly empty for regular member bookings
    if (isBlocked && b.reason && typeof b.reason === 'string') {
      const cleanReason = b.reason.trim();
      if (cleanReason.length > 0) {
        slot.label = cleanReason;
      }
    }

    slots.push(slot);
  }

  // Sort chronologically by date, start time, and court
  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.court.localeCompare(b.court);
  });

  return slots;
}

/**
 * Synchronizes anonymous week documents in Firestore under `public_weeks/{YYYY-WW}`.
 * If targetWeekId is provided, only that week is updated; otherwise all weeks represented
 * in the bookings list (as well as the current week) are synchronized.
 */
export async function syncPublicWeekDocuments(
  bookings: Booking[],
  vereinsId?: string,
  targetWeekId?: string
): Promise<string[]> {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentWeekId = getISOWeekString(todayStr);

    // Group bookings by ISO week
    const weeksMap = new Map<string, Booking[]>();

    // Ensure current week is present so an empty week doc can be written if no bookings exist
    if (currentWeekId) {
      weeksMap.set(currentWeekId, []);
    }
    if (targetWeekId) {
      weeksMap.set(targetWeekId, []);
    }

    for (const b of bookings) {
      if (!b.date) continue;
      const weekId = getISOWeekString(b.date);
      if (!weekId) continue;
      if (targetWeekId && weekId !== targetWeekId) continue;

      if (!weeksMap.has(weekId)) {
        weeksMap.set(weekId, []);
      }
      weeksMap.get(weekId)!.push(b);
    }

    const updatedWeekIds: string[] = [];
    const normalizedClub = (vereinsId || 'sv-neuhausen').toLowerCase().replace(/\s/g, '');

    for (const [weekId, weekBookings] of weeksMap.entries()) {
      if (!weekId) continue;
      const slots = extractPublicWeekSlots(weekBookings);
      const weekDoc: PublicWeekDoc = {
        week: weekId,
        slots,
        updatedAt: new Date().toISOString(),
        vereinsId: normalizedClub,
      };

      // Always write to the primary public_weeks/{weekId} document
      const docRef = doc(db, 'public_weeks', weekId);
      await setDoc(docRef, weekDoc);
      updatedWeekIds.push(weekId);

      // In multi-tenant environments, additionally write public_weeks/{clubId}_{weekId}
      if (normalizedClub && normalizedClub !== 'default' && normalizedClub !== 'sv-neuhausen') {
        const clubDocRef = doc(db, 'public_weeks', `${normalizedClub}_${weekId}`);
        await setDoc(clubDocRef, weekDoc);
      }
    }

    return updatedWeekIds;
  } catch (err) {
    console.error('Error synchronizing public week documents:', err);
    throw err;
  }
}
