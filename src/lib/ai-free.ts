// ============================================================
// ai-free.ts — Multi-Provider Free Tier Resume Parser
// ============================================================
// Strategy: Rotate between Gemini + Groq free tiers
// Combined free daily limit: ~15,900 requests
//
// Provider Priority (quality order):
//   1. Gemini 2.5 Flash  — 500 RPD,   10 RPM  (best quality)
//   2. Groq llama-3.3-70b — 1,000 RPD, 30 RPM  (good quality)
//   3. Groq llama-3.1-8b  — 14,400 RPD, 30 RPM (fast, lightweight)
//   4. Regex fallback      — unlimited          (no AI, basic extraction)
// ============================================================

import { ParsedCandidate, cleanJsonString, REQUIRED_STRUCTURE } from './ai';

// -------------------------------------------------------
// Per-Provider Rate Limiter (in-memory, per server session)
// -------------------------------------------------------
class ProviderRateLimiter {
  private requestTimestamps: number[] = [];
  private dailyCount = 0;
  private dailyResetAt: number = Date.now() + 86_400_000;

  constructor(
    public readonly name: string,
    private readonly maxPerMinute: number,
    private readonly maxPerDay: number
  ) { }

  isAvailable(): boolean {
    // Reset daily counter if 24h passed
    if (Date.now() > this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = Date.now() + 86_400_000;
    }
    if (this.dailyCount >= this.maxPerDay) return false;

    // Check per-minute limit
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60_000);
    return this.requestTimestamps.length < this.maxPerMinute;
  }

  isDailyExhausted(): boolean {
    if (Date.now() > this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = Date.now() + 86_400_000;
    }
    return this.dailyCount >= this.maxPerDay;
  }

  acquireSlotOrThrow(): void {
    if (Date.now() > this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = Date.now() + 86_400_000;
    }
    if (this.dailyCount >= this.maxPerDay) {
      throw new Error(`FATAL_ERROR: ${this.name} daily limit exhausted (${this.maxPerDay} req/day)`);
    }

    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60_000);

    if (this.requestTimestamps.length >= this.maxPerMinute) {
      throw new Error(`RETRYABLE_ERROR: ${this.name} per-minute limit reached (${this.maxPerMinute} RPM)`);
    }

    this.requestTimestamps.push(now);
    this.dailyCount++;
  }

  async waitForSlot(): Promise<void> {
    while (true) {
      if (Date.now() > this.dailyResetAt) {
        this.dailyCount = 0;
        this.dailyResetAt = Date.now() + 86_400_000;
      }
      if (this.dailyCount >= this.maxPerDay) {
        throw new Error(`FATAL_ERROR: ${this.name} daily limit exhausted (${this.maxPerDay} req/day)`);
      }

      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60_000);

      if (this.requestTimestamps.length < this.maxPerMinute) {
        this.requestTimestamps.push(now);
        this.dailyCount++;
        return;
      }

      const waitMs = 60_000 - (now - this.requestTimestamps[0]) + 200;
      console.log(`[Free-AI] ${this.name} RPM limit hit. Waiting ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  getStatus(): string {
    const now = Date.now();
    const recentCount = this.requestTimestamps.filter(t => now - t < 60_000).length;
    return `${this.dailyCount}/${this.maxPerDay} daily, ${recentCount}/${this.maxPerMinute} this minute`;
  }
}

// -------------------------------------------------------
// Provider Instances
// -------------------------------------------------------
const providers = {
  gemini: new ProviderRateLimiter('Gemini-3.1-Flash-Lite', 10, 1500),
  groq70b: new ProviderRateLimiter('Groq-llama-3.3-70b', 30, 1000),
  groq8b: new ProviderRateLimiter('Groq-llama-3.1-8b', 30, 14400),
};

// -------------------------------------------------------
// Resume Parsing Prompt (shared across providers)
// -------------------------------------------------------
const buildPrompt = (text: string) => `You are a precise resume parser. Extract the candidate's details from the resume text provided below.
Return ONLY valid JSON matching the following schema.
If any field is missing or not mentioned, set it to null.
Do not return Markdown. Do not return any explanation. Return only the JSON object.

JSON Schema:
{
  "name": "Candidate's full name",
  "gender": "Candidate's gender (Male, Female, Non-binary). Infer from first name if not explicit. Null if ambiguous.",
  "email": "Candidate's email address",
  "phone": "Candidate's phone number",
  "address": "Candidate's full postal address",
  "city": "Candidate's city",
  "state": "Candidate's state or region",
  "country": "Candidate's country",
  "experience": "Total professional experience (e.g. '5 years')",
  "current_company": "Candidate's current or most recent employer",
  "designation": "Candidate's current or most recent job title",
  "skills": ["Skill 1", "Skill 2"],
  "education": [
    { "degree": "Degree name (e.g. B.Tech, MCA, 12th Grade)", "major": "Field of study or null", "institution": "School/University name or null", "year": 2025 }
  ],
  "projects": ["Project Name: Brief Description"],
  "certifications": ["Certification Name"],
  "summary": "A concise 2-3 sentence professional summary"
}

Resume text:
--------------------
${text}
--------------------`;

// -------------------------------------------------------
// Gemini Free API Call
// -------------------------------------------------------
let geminiBusy = false;

async function callGeminiFree(
  text: string,
  apiKey: string,
  imageInfo?: { mimeType: string; data: string } | { mimeType: string; data: string }[] | null
): Promise<{ data: ParsedCandidate; extractedBy: string }> {
  try {
    providers.gemini.acquireSlotOrThrow();
    console.log(`[Free-AI] Using Gemini 3.1 Flash Lite (${providers.gemini.getStatus()})`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    const prompt = imageInfo ? `You are a precise resume parser. Extract the candidate's details from the resume image provided.
Return ONLY valid JSON matching the following schema.
If any field is missing or not mentioned, set it to null.
Do not return Markdown. Do not return any explanation. Return only the JSON object.

JSON Schema:
{
  "name": "Candidate's full name",
  "gender": "Candidate's gender (Male, Female, Non-binary). Infer from first name if not explicit. Null if ambiguous.",
  "email": "Candidate's email address",
  "phone": "Candidate's phone number",
  "address": "Candidate's full postal address",
  "city": "Candidate's city",
  "state": "Candidate's state or region",
  "country": "Candidate's country",
  "experience": "Total professional experience (e.g. '5 years')",
  "current_company": "Candidate's current or most recent employer",
  "designation": "Candidate's current or most recent job title",
  "skills": ["Skill 1", "Skill 2"],
  "education": [
    { "degree": "Degree name (e.g. B.Tech, MCA, 12th Grade)", "major": "Field of study or null", "institution": "School/University name or null", "year": 2025 }
  ],
  "projects": ["Project Name: Brief Description"],
  "certifications": ["Certification Name"],
  "summary": "A concise 2-3 sentence professional summary"
}` : buildPrompt(text);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            ...(imageInfo ? (Array.isArray(imageInfo) ? imageInfo.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })) : [{ inlineData: { mimeType: imageInfo.mimeType, data: imageInfo.data } }]) : []),
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (response.status === 429 || response.status >= 500) {
      const errText = await response.text();
      throw new Error(`RETRYABLE_ERROR: ${response.status} - ${errText}`);
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`FATAL_ERROR: ${response.status} - ${err}`);
    }

    const resJson = await response.json();
    const rawContent = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) throw new Error('Gemini empty response');

    const usage = resJson?.usageMetadata;
    if (usage) {
      const inputCost = (usage.promptTokenCount / 1_000_000) * 0.075;
      const outputCost = (usage.candidatesTokenCount / 1_000_000) * 0.30;
      console.log(`[Free-AI] Gemini tokens: ${usage.totalTokenCount} (FREE) | Paid equiv: ~₹${((inputCost + outputCost) * 84).toFixed(4)}`);
    }

    return { data: mergeWithStructure(JSON.parse(cleanJsonString(rawContent))), extractedBy: 'gemini-3.1-flash-lite (free)' };
  } catch (err: any) {
    throw err;
  }
}

// -------------------------------------------------------
// Groq Free API Call
// -------------------------------------------------------
async function callGroqFree(
  text: string,
  apiKey: string,
  model: 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant',
  maxRetries: number = 1,
  useWait: boolean = false
): Promise<{ data: ParsedCandidate; extractedBy: string }> {
  const limiter = model === 'llama-3.3-70b-versatile' ? providers.groq70b : providers.groq8b;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (useWait) {
        await limiter.waitForSlot();
      } else {
        limiter.acquireSlotOrThrow();
      }

      if (attempt > 1) {
        console.log(`[Free-AI] Groq ${model} retry attempt ${attempt}/${maxRetries}...`);
      } else {
        console.log(`[Free-AI] Using Groq ${model} (${limiter.getStatus()})`);
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a specialized HR AI parser that only outputs raw JSON. Never output markdown codeblocks or conversational text. Respond ONLY with a JSON object matching the requested schema.',
            },
            { role: 'user', content: buildPrompt(text) },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.status === 429 || response.status >= 500) {
        const errText = await response.text();
        throw new Error(`RETRYABLE_ERROR: ${response.status} - ${errText}`);
      }
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`FATAL_ERROR: ${response.status} - ${err}`);
      }

      const resJson = await response.json();
      const rawContent = resJson?.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error('Groq empty response');

      const usage = resJson?.usage;
      if (usage) console.log(`[Free-AI] Groq tokens: ${usage.total_tokens} (FREE)`);

      return { data: mergeWithStructure(JSON.parse(cleanJsonString(rawContent))), extractedBy: `groq-${model} (free)` };
    } catch (err: any) {
      if (err.message.includes('FATAL_ERROR') || attempt === maxRetries) {
        throw err;
      }
      // Exponential backoff capped at 15 seconds to avoid long hangs
      const delay = Math.min(Math.pow(2, attempt) * 1000, 15000) + Math.random() * 1000;
      console.warn(`[Free-AI] Groq ${model} attempt ${attempt} failed: ${err.message}. Retrying in ${delay.toFixed(0)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Groq ${model} max retries reached`);
}

// -------------------------------------------------------
// Helper — merge parsed data with required structure
// -------------------------------------------------------
function mergeWithStructure(parsedData: any): ParsedCandidate {
  const finalData = { ...REQUIRED_STRUCTURE };
  for (const key of Object.keys(REQUIRED_STRUCTURE) as Array<keyof ParsedCandidate>) {
    if (parsedData[key] !== undefined) (finalData as any)[key] = parsedData[key];
  }
  return finalData;
}

// -------------------------------------------------------
// Main — Smart Multi-Provider Free Parser
// Tries providers in priority order, falls back gracefully
// -------------------------------------------------------
export async function parseResumeWithFreeTier(
  text: string,
  geminiKey?: string,
  groqKey?: string,
  imageInfo?: { mimeType: string; data: string } | { mimeType: string; data: string }[] | null
): Promise<{ data: ParsedCandidate; extractedBy: string }> {

  const errors: string[] = [];

  // If it's an image, we MUST use Gemini
  if (imageInfo) {
    if (!geminiKey) {
      throw new Error("Gemini key is required to parse image resumes.");
    }
    try {
      return await callGeminiFree(text, geminiKey, imageInfo);
    } catch (err: any) {
      console.warn(`[Free-AI] Gemini image parsing failed: ${err.message}`);
      throw new Error(`Failed to parse image resume with Gemini: ${err.message}`);
    }
  }

  // ── Provider 1: Gemini Free ──
  if (geminiKey && providers.gemini.isAvailable() && !geminiBusy) {
    try {
      geminiBusy = true;
      // Release the busy flag after 4.5s to space out calls to Gemini 3.1 Flash Lite
      setTimeout(() => { geminiBusy = false; }, 4500);

      return await callGeminiFree(text, geminiKey);
    } catch (err: any) {
      console.warn(`[Free-AI] Gemini failed: ${err.message}`);
      errors.push(`Gemini: ${err.message}`);
    }
  } else if (!geminiKey) {
    console.log('[Free-AI] Gemini key not set, skipping.');
  } else if (geminiBusy) {
    console.log('[Free-AI] Gemini is busy with another request, skipping to Groq for speed.');
  } else {
    console.log(`[Free-AI] Gemini limit reached (${providers.gemini.getStatus()}). Trying Groq...`);
  }

  // ── Provider 2: Groq llama-3.3-70b (better quality) ──
  if (groqKey && providers.groq70b.isAvailable()) {
    try {
      return await callGroqFree(text, groqKey, 'llama-3.3-70b-versatile');
    } catch (err: any) {
      console.warn(`[Free-AI] Groq-70b failed: ${err.message}`);
      errors.push(`Groq-70b: ${err.message}`);
    }
  } else if (groqKey) {
    console.log(`[Free-AI] Groq-70b limit reached (${providers.groq70b.getStatus()}). Trying Groq-8b...`);
  }

  // ── Provider 3: Groq llama-3.1-8b (highest free limit) ──
  if (groqKey && !providers.groq8b.isDailyExhausted()) {
    try {
      return await callGroqFree(text, groqKey, 'llama-3.1-8b-instant', 4, true);
    } catch (err: any) {
      console.warn(`[Free-AI] Groq-8b failed: ${err.message}`);
      errors.push(`Groq-8b: ${err.message}`);
    }
  } else if (groqKey) {
    console.log(`[Free-AI] Groq-8b daily limit exhausted.`);
  }

  // ── Provider 4: Fallback Error (Regex fallback removed) ──
  console.warn('[Free-AI] All API providers exhausted. Throwing extraction failure.');
  throw new Error(`All free AI providers exhausted. Errors: ${errors.join(' | ')}`);
}

// -------------------------------------------------------
// Status Report — log all provider states
// -------------------------------------------------------
export function logFreeProviderStatus(): void {
  console.log('[Free-AI] Provider Status:');
  console.log(`  Gemini 3.1 Flash Lite: ${providers.gemini.getStatus()}`);
  console.log(`  Groq llama-3.3-70b   : ${providers.groq70b.getStatus()}`);
  console.log(`  Groq llama-3.1-8b    : ${providers.groq8b.getStatus()}`);
}
