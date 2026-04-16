import "server-only";
import { db } from "./db";

export type ActivityType = "payment" | "reputation" | "task" | "registration";

export async function logActivity(type: ActivityType, message: string): Promise<void> {
  const latest = await db.activity.findFirst({
    orderBy: { timestamp: "desc" },
  });
  if (latest && latest.type === type && latest.message === message) return;
  await db.activity.create({
    data: { type, message, timestamp: BigInt(Date.now()) },
  });
  const count = await db.activity.count();
  if (count > 100) {
    const excess = count - 100;
    const toDelete = await db.activity.findMany({
      orderBy: { timestamp: "asc" },
      take: excess,
      select: { id: true },
    });
    await db.activity.deleteMany({
      where: { id: { in: toDelete.map((a) => a.id) } },
    });
  }
}
