import type { ActivityItem } from "@/lib/api";

// Activity ticker + feed show only real server events. No seeded / synthetic
// rows — a quiet marketplace is an honest marketplace.
export const fallbackActivity: ActivityItem[] = [];

export function mergeActivity(primary: ActivityItem[], secondary: ActivityItem[]) {
  const merged = [...primary, ...secondary];
  const seen = new Set<string>();

  return merged
    .sort((left, right) => right.timestamp - left.timestamp)
    .filter((item) => {
      const key = `${item.type}:${item.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}
