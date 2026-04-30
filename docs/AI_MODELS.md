# AI Models — WeightCut Wizard

Every AI feature in the app routes through Groq's API (`api.groq.com/openai/v1/chat/completions`). Two LLMs are used in rotation, plus one vision model for meal photo analysis.

> Note: It's **Groq** (the inference provider running open-source models like Llama and gpt-oss), not xAI's **Grok**. Authenticated via the `GROQ_API_KEY` Supabase secret.

---

## `openai/gpt-oss-120b` — heavier reasoning

Used for complex generation, planning, and structured output.

| Feature | Edge function | Path |
|---|---|---|
| Diet analysis | `analyse-diet` | `supabase/functions/analyse-diet/index.ts:119` |
| Rehydration protocol | `rehydration-protocol` | `supabase/functions/rehydration-protocol/index.ts:149` |
| Weight plan generation | `generate-weight-plan` | `supabase/functions/generate-weight-plan/index.ts:108` |
| Fight camp coach | `fight-camp-coach` | `supabase/functions/fight-camp-coach/index.ts:315` |
| Fight week analysis | `fight-week-analysis` | `supabase/functions/fight-week-analysis/index.ts:254` |
| Meal nutrition extraction (text + retry) | `analyze-meal` (steps 2 & 3) | `supabase/functions/analyze-meal/index.ts:229,283` |
| Training insights | `training-insights` | `supabase/functions/training-insights/index.ts:214` |
| Cut plan generation | `generate-cut-plan` | `supabase/functions/generate-cut-plan/index.ts:136` |
| Technique chains | `generate-technique-chains` | `supabase/functions/generate-technique-chains/index.ts:107` |
| Meal planner | `meal-planner` | `supabase/functions/meal-planner/index.ts:231` |

---

## `llama-3.1-8b-instant` — fast / cheap

Used for short-form, low-latency tasks where 8B is sufficient.

| Feature | Edge function | Path |
|---|---|---|
| Recovery coach | `recovery-coach` | `supabase/functions/recovery-coach/index.ts:201` |
| Ingredient lookup | `lookup-ingredient` | `supabase/functions/lookup-ingredient/index.ts:90` |
| Hydration insights | `hydration-insights` | `supabase/functions/hydration-insights/index.ts:67` |
| Training summary | `training-summary` | `supabase/functions/training-summary/index.ts:107` |
| Daily wisdom | `daily-wisdom` | `supabase/functions/daily-wisdom/index.ts:129` |
| Weight tracker analysis | `weight-tracker-analysis` | `supabase/functions/weight-tracker-analysis/index.ts:237` |
| Workout generator | `workout-generator` | `supabase/functions/workout-generator/index.ts:157` |
| Wizard chat | `wizard-chat` | `supabase/functions/wizard-chat/index.ts:320` |

---

## `meta-llama/llama-4-scout-17b-16e-instruct` — vision

Multimodal model used to identify food from a photo.

| Feature | Edge function | Path |
|---|---|---|
| Meal photo identification (step 1 of 3) | `analyze-meal` | `supabase/functions/analyze-meal/index.ts:177` |

The two follow-up steps in `analyze-meal` (nutrition extraction + retry) hand off to `openai/gpt-oss-120b`.

---

## Non-Groq AI / external APIs

Not LLMs, but feature-relevant external AI / data services.

| Feature | Edge function | Provider | Notes |
|---|---|---|---|
| Speech-to-text | `transcribe-audio` | Google Cloud Speech-to-Text (`speech.googleapis.com`) | Voice meal logging |
| Barcode lookup | `scan-barcode` | OpenFoodFacts | Pure API, no AI |
| Food search | `food-search` | USDA FoodData Central | Pure API, no AI |
| iOS push notifications | `send-announcement-push` | Apple APNs (HTTP/2, ES256 JWT signed) | No AI; routes coach announcements to athlete devices |

---

## Streaming vs synchronous

8 of the LLM-backed edge functions support SSE streaming via the `?stream=true` query param (server: `supabase/functions/_shared/streamResponse.ts`; client: `src/lib/streamingFetch.ts`):

- `daily-wisdom`
- `fight-camp-coach`
- `analyse-diet`
- `fight-week-analysis`
- `weight-tracker-analysis`
- `training-summary`
- `rehydration-protocol`
- `meal-planner`

Synchronous (non-streaming):
- `analyze-meal`, `scan-barcode`, `lookup-ingredient`

---

## How to change a model

Each edge function names its model inline at the `fetch("https://api.groq.com/openai/v1/chat/completions", ...)` call site. To swap:

1. Edit the `model:` field in the edge function source.
2. `supabase functions deploy <function-name>`.
3. No client change needed — model identity is server-side only.

For new Groq models, see https://console.groq.com/docs/models for current availability.
