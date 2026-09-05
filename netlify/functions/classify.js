// Netlify serverless function: receives a photo from the browser, sends it to
// Claude along with OKC's sorting rules (see ../../rules.js), and returns the
// bin/category as JSON. The Anthropic API key lives only here (server-side) —
// the browser never sees it.
const Anthropic = require("@anthropic-ai/sdk");
const rules = require("../../rules");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let imageBase64, mediaType;
  try {
    ({ imageBase64, mediaType } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body." }) };
  }

  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: "No image provided." }) };
  }

  const type = ALLOWED_MEDIA_TYPES.includes(mediaType) ? mediaType : "image/jpeg";

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: type, data: imageBase64 } },
            { type: "text", text: rules },
          ],
        },
      ],
    });

    const raw = message.content?.[0]?.text?.trim() || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response: " + raw.slice(0, 200));

    const result = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("classify error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Something went wrong identifying that photo. Please try again." }),
    };
  }
};
