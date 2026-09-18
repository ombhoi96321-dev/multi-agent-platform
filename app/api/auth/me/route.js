import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = getCurrentUser();
  return Response.json({ success: true, user: user || null });
}
