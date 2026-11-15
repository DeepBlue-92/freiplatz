import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  limit,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export interface QuotaSnapshot {
  timestamp: string; // ISO string
  storage: {
    usedBytes: number;
    usedMb: number;
    limitMb: number;
    usedPercent: number;
    documentCount: number;
    collections: Record<string, { count: number; estimatedBytes: number }>;
  };
  reads: {
    usedToday: number;
    limitDaily: number;
    remaining: number;
    usedPercent: number;
  };
  writes: {
    usedToday: number;
    limitDaily: number;
    remaining: number;
    usedPercent: number;
  };
  deletes: {
    usedToday: number;
    limitDaily: number;
    remaining: number;
  };
  plan: "SPARK" | "BLAZE";
  lastHourlyCheck: string;
}

// Spark Plan Limits (Default free tier)
const SPARK_LIMITS = {
  DAILY_READS: 50000,
  DAILY_WRITES: 20000,
  DAILY_DELETES: 20000,
  STORAGE_MB: 1024, // 1 GB
};

// In-memory operation counters for the current day
interface DailyOperationCounters {
  date: string; // YYYY-MM-DD
  reads: number;
  writes: number;
  deletes: number;
}

let dailyCounters: DailyOperationCounters = {
  date: new Date().toISOString().slice(0, 10),
  reads: 0,
  writes: 0,
  deletes: 0,
};

function ensureCurrentDate() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounters.date !== today) {
    dailyCounters = {
      date: today,
      reads: 0,
      writes: 0,
      deletes: 0,
    };
  }
}

/**
 * Tracks an operation (read, write, delete)
 */
export function trackQuotaOperation(type: "read" | "write" | "delete", count: number = 1) {
  ensureCurrentDate();
  if (type === "read") dailyCounters.reads += count;
  else if (type === "write") dailyCounters.writes += count;
  else if (type === "delete") dailyCounters.deletes += count;
}

/**
 * Estimates the size in bytes of a JSON-serializable object
 */
function estimateObjectBytes(obj: any): number {
  try {
    const str = JSON.stringify(obj || {});
    // Estimate JSON string bytes + Firestore index/field overhead (~32 bytes per field)
    const fieldCount = typeof obj === "object" && obj !== null ? Object.keys(obj).length : 1;
    return Buffer.byteLength(str, "utf8") + fieldCount * 32;
  } catch {
    return 512; // Fallback estimate
  }
}

/**
 * Average document size fallbacks (in bytes) if sample fails
 */
const DEFAULT_AVG_DOC_BYTES: Record<string, number> = {
  vereine: 2048,
  users: 1200,
  bookings: 750,
  arbeitseinsaetze: 850,
  tournaments: 2500,
  league_matches: 1100,
  dynamic_leagues: 1800,
  backups: 45000,
  system_settings: 2500,
};

/**
 * Calculates current storage footprint across known Firestore collections.
 * Uses high-speed aggregation counts (getCountFromServer) and 1-doc samples in parallel,
 * finishing in milliseconds without downloading entire collections or burning read quota.
 */
export async function calculateFirestoreFootprint(): Promise<{
  totalBytes: number;
  totalDocs: number;
  collections: Record<string, { count: number; estimatedBytes: number }>;
}> {
  const collectionNames = [
    "vereine",
    "users",
    "bookings",
    "arbeitseinsaetze",
    "tournaments",
    "league_matches",
    "dynamic_leagues",
    "backups",
    "system_settings",
  ];

  // Helper with timeout to prevent hanging on Firestore network stalls
  const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  };

  // Inspect each collection in parallel
  const results = await Promise.all(
    collectionNames.map(async (colName) => {
      try {
        const colRef = collection(db, colName);

        // 1. Get exact count without downloading document contents (fast & lightweight)
        const countPromise = getCountFromServer(colRef).then((s) => s.data().count);
        const count = await withTimeout(countPromise, 2000, 0);

        if (count === 0) {
          return { colName, count: 0, estimatedBytes: 0 };
        }

        // 2. Fetch a single sample document to measure representative byte size
        let avgDocBytes = DEFAULT_AVG_DOC_BYTES[colName] || 1024;
        try {
          const sampleQuery = query(colRef, limit(1));
          const sampleSnap = await withTimeout(getDocs(sampleQuery), 1500, null);
          if (sampleSnap && !sampleSnap.empty) {
            const firstDoc = sampleSnap.docs[0];
            const sampleBytes = estimateObjectBytes(firstDoc.data()) + 32;
            if (sampleBytes > 0) {
              avgDocBytes = sampleBytes;
            }
          }
        } catch {
          // Keep default avg
        }

        const estimatedBytes = count * avgDocBytes;
        // Aggregation query costs only 1 read per 1,000 documents
        trackQuotaOperation("read", Math.max(1, Math.ceil(count / 1000)));

        return { colName, count, estimatedBytes };
      } catch {
        return { colName, count: 0, estimatedBytes: 0 };
      }
    })
  );

  let totalBytes = 0;
  let totalDocs = 0;
  const colStats: Record<string, { count: number; estimatedBytes: number }> = {};

  for (const r of results) {
    colStats[r.colName] = { count: r.count, estimatedBytes: r.estimatedBytes };
    totalBytes += r.estimatedBytes;
    totalDocs += r.count;
  }

  // Base overhead for indexes and metadata (~25% overhead estimate)
  const estimatedWithIndexes = Math.round(totalBytes * 1.25);

  return {
    totalBytes: estimatedWithIndexes,
    totalDocs,
    collections: colStats,
  };
}

let cachedSnapshot: QuotaSnapshot | null = null;

/**
 * Executes the hourly quota check, saves snapshot in Firestore & cache
 */
export async function runHourlyQuotaCheck(): Promise<QuotaSnapshot> {
  ensureCurrentDate();

  const footprint = await calculateFirestoreFootprint();
  const usedMb = Number((footprint.totalBytes / (1024 * 1024)).toFixed(2));
  const storageLimitMb = SPARK_LIMITS.STORAGE_MB;
  const storagePercent = Number(((usedMb / storageLimitMb) * 100).toFixed(1));

  const readsToday = dailyCounters.reads;
  const writesToday = dailyCounters.writes;
  const deletesToday = dailyCounters.deletes;

  const readsPercent = Number(((readsToday / SPARK_LIMITS.DAILY_READS) * 100).toFixed(1));
  const writesPercent = Number(((writesToday / SPARK_LIMITS.DAILY_WRITES) * 100).toFixed(1));

  const snapshot: QuotaSnapshot = {
    timestamp: new Date().toISOString(),
    lastHourlyCheck: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    plan: "SPARK",
    storage: {
      usedBytes: footprint.totalBytes,
      usedMb,
      limitMb: storageLimitMb,
      usedPercent: Math.min(100, storagePercent),
      documentCount: footprint.totalDocs,
      collections: footprint.collections,
    },
    reads: {
      usedToday: readsToday,
      limitDaily: SPARK_LIMITS.DAILY_READS,
      remaining: Math.max(0, SPARK_LIMITS.DAILY_READS - readsToday),
      usedPercent: Math.min(100, readsPercent),
    },
    writes: {
      usedToday: writesToday,
      limitDaily: SPARK_LIMITS.DAILY_WRITES,
      remaining: Math.max(0, SPARK_LIMITS.DAILY_WRITES - writesToday),
      usedPercent: Math.min(100, writesPercent),
    },
    deletes: {
      usedToday: deletesToday,
      limitDaily: SPARK_LIMITS.DAILY_DELETES,
      remaining: Math.max(0, SPARK_LIMITS.DAILY_DELETES - deletesToday),
    },
  };

  cachedSnapshot = snapshot;

  // Persist snapshot to Firestore
  try {
    const quotaRef = doc(db, "_system_metrics", "firestore_quota");
    await setDoc(quotaRef, snapshot, { merge: true });
    trackQuotaOperation("write", 1);
  } catch (err) {
    console.warn("[QuotaService] Failed to persist quota snapshot to Firestore:", err);
  }

  return snapshot;
}

/**
 * Returns latest snapshot from memory or Firestore
 */
export async function getLatestQuotaSnapshot(): Promise<QuotaSnapshot> {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  try {
    const quotaRef = doc(db, "_system_metrics", "firestore_quota");
    const snap = await getDoc(quotaRef);
    if (snap.exists()) {
      cachedSnapshot = snap.data() as QuotaSnapshot;
      return cachedSnapshot;
    }
  } catch {}

  // If not yet available, run check now
  return runHourlyQuotaCheck();
}
