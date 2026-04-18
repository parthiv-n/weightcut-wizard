/**
 * Strip em/en dashes and double hyphens from AI-generated text so it reads
 * like natural prose written by a coach, not a model.
 */
export function sanitizeAIText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\u2014\u2013]/g, ", ")
    .replace(/--/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+([.?!;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
