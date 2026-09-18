import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const COOKIE_NAME = "session_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is missing. Add it to .env.local in the project root."
    );
  }
  return secret;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

/** Signs a session for `user` ({id, name, email}) and sets it as an httpOnly cookie. */
export function setSessionCookie(user) {
  const token = signToken({ id: user.id, name: user.name, email: user.email });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

/** Reads and verifies the session cookie. Returns {id, name, email} or null. */
export function getCurrentUser() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
