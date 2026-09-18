import { generateImage, IMAGE_MODELS } from "@/lib/ai/huggingface";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const MAX_PROMPT_LENGTH = 1000;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || "").trim();
    const modelKey = String(body?.model || "fast");
    const conversationId = body?.conversationId;

    if (!prompt) {
      return Response.json(
        { success: false, error: "A prompt is required." },
        { status: 400 }
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return Response.json(
        {
          success: false,
          error: `Prompt is too long. Maximum ${MAX_PROMPT_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }

    if (!(modelKey in IMAGE_MODELS)) {
      return Response.json(
        { success: false, error: "Unknown model selection." },
        { status: 400 }
      );
    }

    console.log("IMAGE REQUEST:", { prompt, modelKey });

    const { image, model } = await generateImage(prompt, modelKey);

    console.log("IMAGE GENERATION SUCCESS:", model);

    // Save to PostgreSQL if conversationId exists
    if (conversationId) {
      try {
        await query(
          "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
          [conversationId, "user", prompt]
        );

        await query(
          "INSERT INTO messages (conversation_id, role, content, image_data) VALUES ($1, $2, $3, $4)",
          [conversationId, "assistant", `Generated with ${model}`, image]
        );

        await query(
          "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
          [conversationId]
        );
      } catch (dbErr) {
        console.error("FAILED TO SAVE IMAGE MESSAGE TO DB:", dbErr.message);
      }
    }

    return Response.json({
      success: true,
      image,
      model,
      prompt,
    });
  } catch (error) {
    console.error("IMAGE API ERROR:", error);
    return Response.json(
      { success: false, error: error?.message || "Image generation failed." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    success: true,
    models: Object.entries(IMAGE_MODELS).map(([key, m]) => ({
      key,
      label: m.label,
    })),
  });
}