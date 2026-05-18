"use node";

/**
 * Speech-to-text via Google Cloud Speech-to-Text v1.
 *
 * Audio arrives as base64 (WEBM_OPUS @ 48kHz). The client records via
 * MediaRecorder + base64-encodes the blob, so the action only forwards
 * the raw string — no chunked decode needed on the server side.
 *
 * Env: GOOGLE_GEMINI_API_KEY — yes, named "gemini" historically. Reused
 * across Google Cloud APIs; same key works for both Speech and Gemini.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { enforceFeatureGate } from "../_shared/featureGates";

export const run = action({
  args: { audio: v.string() },
  handler: async (ctx, { audio }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await enforceFeatureGate(ctx, userId, "AI_AUDIO_TRANSCRIBE");
    if (!audio || audio.length === 0) {
      throw new Error("No audio data provided");
    }

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            config: {
              encoding: "WEBM_OPUS",
              sampleRateHertz: 48000,
              languageCode: "en-US",
              enableAutomaticPunctuation: true,
            },
            audio: { content: audio },
          }),
        },
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("Google Speech timed out");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Speech error ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as {
      results?: { alternatives?: { transcript?: string }[] }[];
    };
    const text = result.results?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { text };
  },
});
