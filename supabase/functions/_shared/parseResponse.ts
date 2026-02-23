/**
 * Shared AI response parsing utilities for all edge functions.
 * Handles think-tag stripping, JSON extraction, and content filter detection.
 */

/** Strip <think>...</think> tags from MiniMax responses */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Extract generated text from MiniMax API response, stripping think tags */
export function extractContent(data: any): { content: string | null; filtered: boolean } {
  let content = data.choices?.[0]?.message?.content;
  if (content) {
    content = stripThinkTags(content);
  }
  const filtered = !content && data.choices?.[0]?.finish_reason === 'content_filter';
  return { content: content || null, filtered };
}

/**
 * Parse JSON from AI response text with fallbacks:
 * 1. Direct JSON.parse
 * 2. Extract from ```json...``` markdown blocks
 * 3. Extract bare {...} object
 */
export function parseJSON<T = any>(text: string): T {
  // 1. Direct parse
  try {
    return JSON.parse(text);
  } catch {
    // continue to fallbacks
  }

  // 2. Markdown code block
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Bare JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // fall through to error
    }
  }

  throw new Error("Could not parse JSON from AI response");
}
