/**
 * Shared AI response parsing utilities for all edge functions.
 * Handles think-tag stripping, JSON extraction, and content filter detection.
 * Compatible with reasoning models that emit <think> blocks, markdown, or extra prose.
 */

/** Strip <think>...</think> tags and other reasoning wrappers from model responses */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
    .replace(/<reflection>[\s\S]*?<\/reflection>/g, '')
    .trim();
}

/** Extract generated text from Groq API response, stripping think tags */
export function extractContent(data: any): { content: string | null; filtered: boolean } {
  // Some models put content in message.content, others in reasoning_content + content
  let content = data.choices?.[0]?.message?.content;

  // If content is empty but there's a reasoning field, the actual answer may be there
  if (!content && data.choices?.[0]?.message?.reasoning_content) {
    content = data.choices[0].message.reasoning_content;
  }

  if (content) {
    content = stripThinkTags(content);
  }

  const filtered = !content && data.choices?.[0]?.finish_reason === 'content_filter';
  return { content: content || null, filtered };
}

/**
 * Parse JSON from AI response text with robust fallbacks:
 * 1. Strip think/reasoning tags first
 * 2. Direct JSON.parse
 * 3. Extract from ```json...``` markdown blocks
 * 4. Extract bare {...} object (greedy — finds the largest JSON block)
 * 5. Extract bare [...] array
 * 6. Try cleaning common issues (trailing commas, unescaped newlines)
 */
export function parseJSON<T = any>(text: string): T {
  // Pre-clean: strip any remaining reasoning tags
  const cleaned = stripThinkTags(text).trim();

  // 1. Direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue to fallbacks
  }

  // 2. Markdown code block (```json ... ``` or ``` ... ```)
  const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {
      // try cleaning the markdown content
      try {
        return JSON.parse(cleanJsonString(mdMatch[1].trim()));
      } catch {
        // continue
      }
    }
  }

  // 3. Bare JSON object — find the outermost { ... }
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    const candidate = cleaned.slice(objStart, objEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(cleanJsonString(candidate));
      } catch {
        // continue
      }
    }
  }

  // 4. Bare JSON array — find the outermost [ ... ]
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    const candidate = cleaned.slice(arrStart, arrEnd + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  throw new Error("Could not parse JSON from AI response");
}

/** Fix common JSON issues from LLM output */
function cleanJsonString(text: string): string {
  return text
    // Remove trailing commas before } or ]
    .replace(/,\s*([\]}])/g, '$1')
    // Remove JS-style comments
    .replace(/\/\/[^\n]*/g, '')
    // Fix unescaped newlines inside string values
    .replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n');
}
