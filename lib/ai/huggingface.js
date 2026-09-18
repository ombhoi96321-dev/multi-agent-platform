// lib/ai/huggingface.js

export const IMAGE_MODELS = {
  fast: {
    id: "black-forest-labs/FLUX.1-schnell",
    label: "Fast (FLUX.1-schnell)",
  },
  quality: {
    id: "ByteDance/SDXL-Lightning",
    label: "Quality (SDXL-Lightning)",
  },
};

const DEFAULT_MODEL_KEY = "fast";

function resolveModel(modelKey) {
  return IMAGE_MODELS[modelKey] || IMAGE_MODELS[DEFAULT_MODEL_KEY];
}

export async function generateImage(prompt, modelKey) {
  const apiKey = (process.env.HUGGINGFACE_API_KEY || "").trim();
  const model = resolveModel(modelKey);
  const cleanPrompt = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 1000000);

  // 1. Try Hugging Face Serverless Inference API
  if (apiKey) {
    try {
      const response = await fetch(
        `https://router.huggingface.co/hf-inference/models/${model.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { wait_for_model: true },
          }),
        }
      );

      const contentType = response.headers.get("content-type") || "";

      if (response.ok && contentType.startsWith("image/")) {
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return {
          image: `data:${contentType};base64,${base64}`,
          model: model.id,
        };
      }
    } catch (hfErr) {
      console.warn("Hugging Face API failed, switching to fallback...", hfErr.message);
    }
  }

  // 2. Reliable Direct Fallback (Pollinations AI binary fetch)
  const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=512&height=512&seed=${seed}&nologo=true`;

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return {
        image: `data:${contentType};base64,${base64}`,
        model: `${model.id} (Pollinations)`,
      };
    }
  } catch (err) {
    console.error("Fallback image download failed:", err.message);
  }

  // 3. Direct Image URL
  return {
    image: imageUrl,
    model: "Direct Render",
  };
}