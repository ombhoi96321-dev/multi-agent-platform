import { query } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!name || !email || !password) {
      return Response.json(
        { success: false, error: "Name, email and password are required." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return Response.json(
        { success: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return Response.json(
        { success: false, error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      return Response.json(
        { success: false, error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const result = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, passwordHash]
    );
    const user = result.rows[0];

    setSessionCookie(user);

    return Response.json({ success: true, user });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return Response.json(
      { success: false, error: error?.message || "Registration failed." },
      { status: 500 }
    );
  }
}
