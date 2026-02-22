import type { Collection, DataStore } from "../../data/types";

export interface Visit {
  id: string; // URL as primary key
  url: string;
  title: string;
  visitedAt: number;
  visitCount: number;
}

let _visitsCollection: Collection<Visit> | undefined;

export function initVisitTracking(dataStore: DataStore): void {
  _visitsCollection = dataStore.collection<Visit>("visits");
}

/**
 * Record a page visit. Updates existing entry or creates new one.
 */
export async function recordVisit(url: string, title: string): Promise<void> {
  if (!_visitsCollection) return;

  // Skip empty/internal URLs
  if (!url || url === "about:blank" || url.startsWith("data:")) return;

  const id = url;
  const existing = await _visitsCollection.findOne(id);
  if (existing) {
    await _visitsCollection.update(id, {
      title: title || existing.title,
      visitedAt: Date.now(),
      visitCount: existing.visitCount + 1,
    });
  } else {
    await _visitsCollection.insert({
      id,
      url,
      title: title || url,
      visitedAt: Date.now(),
      visitCount: 1,
    });
  }
}

/**
 * Search visit history for suggestions matching the query.
 * Matches against URL and title, ranked by recency.
 */
export async function searchVisits(query: string, limit = 8): Promise<Visit[]> {
  if (!_visitsCollection || !query.trim()) return [];

  const q = query.toLowerCase();
  const all = await _visitsCollection.findMany({
    sort: [{ field: "visitedAt", direction: "desc" }],
  });

  return all
    .filter((v) => v.url.toLowerCase().includes(q) || v.title.toLowerCase().includes(q))
    .slice(0, limit);
}
