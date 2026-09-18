import groq from "@/lib/ai/groq";
import pdfParse from "pdf-parse";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const AGENT_PROMPTS = {
  research: `You are a professional Research Agent.

Give clear, accurate, structured answers. Use headings and bullet points
where helpful, include important facts and examples, note advantages and
disadvantages when relevant, and end with a concise conclusion.

Do not invent facts. If something is uncertain, say so.`,

  coding: `You are an expert Coding Agent for JavaScript, React, Next.js,
Node.js, APIs, databases, debugging, and architecture.

When fixing code, explain:
1. What is wrong
2. Why it happens
3. The corrected code

Always give complete, working code when appropriate, in Markdown code
blocks.`,

  interview: `You are a professional Interview Agent conducting technical
interviews.

Ask one question at a time. After the user answers: evaluate the answer,
point out mistakes, explain the correct answer, give a score when
appropriate, then ask the next question. Be realistic and professional.`,

  pdf: `You are a professional PDF Analysis Agent.

Analyze only the PDF content supplied to you. You can summarize it,
answer questions about it, extract key information, explain sections,
write notes, or generate interview questions from it.

Do not invent information. If the answer is not present in the supplied
PDF content, say so clearly.`,
};

const ALLOWED_AGENTS = Object.keys(AGENT_PROMPTS);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_TEXT_LENGTH = 50000; // characters sent to the model

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error("The uploaded PDF is empty.");
  }

  let data;
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    console.error("PDF EXTRACTION ERROR:", err);
    throw new Error(
      "Could not read this PDF. It may be corrupted or password protected."
    );
  }

  const text = (data?.text || "").trim();

  if (!text) {
    throw new Error(
      "No text could be extracted from this PDF. It may be scanned or image-only."
    );
  }

  return text;
}

async function parseRequest(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    return {
      message: String(formData.get("message") || ""),
      agent: String(formData.get("agent") || "pdf"),
      conversationId: String(formData.get("conversationId") || ""),
      file: file instanceof File ? file : null,
    };
  }

  const body = await request.json().catch(() => ({}));
  return {
    message: String(body?.message || ""),
    agent: String(body?.agent || "research"),
    conversationId: String(body?.conversationId || ""),
    file: null,
  };
}

async function loadOwnedConversation(userId, id) {
  const result = await query(
    "SELECT id, agent_id, title FROM conversations WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return result.rows[0] || null;
}

async function saveMessage(conversationId, role, content, fileName = null) {
  await query(
    "INSERT INTO messages (conversation_id, role, content, file_name) VALUES ($1, $2, $3, $4)",
    [conversationId, role, content, fileName]
  );
}

export async function POST(request) {
  try {
    const user = getCurrentUser();
    if (!user) {
      return Response.json(
        { success: false, error: "Please sign in to continue." },
        { status: 401 }
      );
    }

    let { message, agent, conversationId, file: uploadedFile } = await parseRequest(request);

    if (!ALLOWED_AGENTS.includes(agent)) {
      agent = "research";
    }

    if (!conversationId) {
      return Response.json(
        { success: false, error: "Missing conversationId." },
        { status: 400 }
      );
    }

    const conversation = await loadOwnedConversation(user.id, conversationId);
    if (!conversation) {
      return Response.json(
        { success: false, error: "Conversation not found." },
        { status: 404 }
      );
    }

    if (!message.trim() && !uploadedFile) {
      return Response.json(
        { success: false, error: "Message is required." },
        { status: 400 }
      );
    }

    let finalMessage = message;
    let fileNameForRecord = null;

    if (uploadedFile) {
      const fileName = uploadedFile.name || "";
      fileNameForRecord = fileName;

      if (!fileName.toLowerCase().endsWith(".pdf")) {
        return Response.json(
          { success: false, error: "Only PDF files are supported." },
          { status: 400 }
        );
      }

      if (uploadedFile.size > MAX_FILE_SIZE) {
        return Response.json(
          { success: false, error: "PDF is too large. Maximum size is 20 MB." },
          { status: 400 }
        );
      }

      let pdfText;
      try {
        pdfText = await extractPdfText(uploadedFile);
      } catch (err) {
        console.error("PDF EXTRACTION FAILED:", err);
        return Response.json(
          { success: false, error: err?.message || "PDF extraction failed." },
          { status: 400 }
        );
      }

      const limitedText = pdfText.slice(0, MAX_TEXT_LENGTH);

      finalMessage = `The user uploaded this PDF.

================ PDF CONTENT ================
${limitedText}
================ END PDF CONTENT ============

USER REQUEST:
${message.trim() || "Summarize this PDF."}

Answer using the PDF content above. Do not invent information. If the
answer is not contained in the PDF, say so. Keep the response clear and
structured.`;

      agent = "pdf";
    }

    // Persist the user's message (the raw text/file, not the PDF-stuffed prompt)
    await saveMessage(
      conversationId,
      "user",
      message.trim() || "Summarize this PDF.",
      fileNameForRecord
    );

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: AGENT_PROMPTS[agent] },
        { role: "user", content: finalMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const answer =
      completion?.choices?.[0]?.message?.content || "No response generated.";

    await saveMessage(conversationId, "assistant", answer);

    // Auto-title the conversation from the first user message, and
    // keep the stored agent in sync (relevant for the PDF agent, which
    // can be auto-selected by uploading a file from another agent tab).
    const countResult = await query(
      "SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1 AND role = 'user'",
      [conversationId]
    );
    const isFirstMessage = countResult.rows[0].count === 1;
    const title = isFirstMessage
      ? (message.trim() || fileNameForRecord || "New chat").slice(0, 42)
      : conversation.title;

    await query(
      "UPDATE conversations SET title = $1, agent_id = $2, updated_at = now() WHERE id = $3",
      [title, agent, conversationId]
    );

    return Response.json({
      success: true,
      message: answer,
      agent,
      file: fileNameForRecord,
      conversationTitle: title,
    });
  } catch (error) {
    console.error("CHAT API ERROR:", error);
    return Response.json(
      { success: false, error: error?.message || "Something went wrong." },
      { status: 500 }
    );
  }
}
