import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  clearSessionCookie();
  return Response.json({ success: true });
}
