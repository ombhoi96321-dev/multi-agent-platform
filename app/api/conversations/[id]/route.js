import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

async function loadOwnedConversation(userId, id) {
  const result = await query(
    "SELECT id, agent_id, title, updated_at FROM conversations WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function GET(request, { params }) {
  const user = getCurrentUser();
  if (!user) {
    return Response.json({ success: false, error: "Please sign in to continue." }, { status: 401 });
  }

  const conversation = await loadOwnedConversation(user.id, params.id);
  if (!conversation) {
    return Response.json({ success: false, error: "Conversation not found." }, { status: 404 });
  }

  const messages = await query(
    "SELECT id, role, content, file_name, image_data, created_at FROM messages WHERE conversation_id = $1 ORDER BY id ASC",
    [params.id]
  );

  return Response.json({ success: true, conversation, messages: messages.rows });
}

export async function PATCH(request, { params }) {
  const user = getCurrentUser();
  if (!user) {
    return Response.json({ success: false, error: "Please sign in to continue." }, { status: 401 });
  }

  const conversation = await loadOwnedConversation(user.id, params.id);
  if (!conversation) {
    return Response.json({ success: false, error: "Conversation not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const fields = [];
  const values = [];
  let i = 1;

  if (body.title) {
    fields.push(`title = $${i++}`);
    values.push(String(body.title).slice(0, 255));
  }
  if (body.agentId) {
    fields.push(`agent_id = $${i++}`);
    values.push(String(body.agentId));
  }

  if (!fields.length) {
    return Response.json({ success: false, error: "Nothing to update." }, { status: 400 });
  }

  fields.push("updated_at = now()");
  values.push(params.id);

  await query(`UPDATE conversations SET ${fields.join(", ")} WHERE id = $${i}`, values);

  return Response.json({ success: true });
}

export async function DELETE(request, { params }) {
  const user = getCurrentUser();
  if (!user) {
    return Response.json({ success: false, error: "Please sign in to continue." }, { status: 401 });
  }

  await query("DELETE FROM conversations WHERE id = $1 AND user_id = $2", [params.id, user.id]);

  return Response.json({ success: true });
}
