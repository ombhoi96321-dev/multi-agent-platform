import { query } from "@/lib/db";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return Response.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const result = await query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    const row = result.rows[0];

    // Same generic message whether the email doesn't exist or the
    // password is wrong, so we don't leak which emails are registered.
    if (!row) {
      return Response.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      return Response.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const user = { id: row.id, name: row.name, email: row.email };
    setSessionCookie(user);

    return Response.json({ success: true, user });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return Response.json(
      { success: false, error: error?.message || "Login failed." },
      { status: 500 }
    );
  }
}
