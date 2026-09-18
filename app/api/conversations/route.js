import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = getCurrentUser();
  if (!user) {
    return Response.json({ success: false, error: "Please sign in to continue." }, { status: 401 });
  }

  const result = await query(
    "SELECT id, agent_id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
    [user.id]
  );

  return Response.json({ success: true, conversations: result.rows });
}

export async function POST(request) {
  const user = getCurrentUser();
  if (!user) {
    return Response.json({ success: false, error: "Please sign in to continue." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const agentId = String(body?.agentId || "research");

  const result = await query(
    "INSERT INTO conversations (user_id, agent_id, title) VALUES ($1, $2, 'New chat') RETURNING id, agent_id, title, updated_at",
    [user.id, agentId]
  );

  return Response.json({ success: true, conversation: result.rows[0] });
}
