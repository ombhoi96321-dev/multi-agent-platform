import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error(
    "GROQ_API_KEY is missing. Add it to .env.local in the project root (not inside /app)."
  );
}

const groq = new Groq({ apiKey });

export default groq;
