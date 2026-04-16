import { db } from "@/lib/db";

export async function GET() {
  const rows = await db.activity.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
  });
  return Response.json(
    rows.map((r) => ({
      type: r.type,
      message: r.message,
      timestamp: Number(r.timestamp),
    }))
  );
}
