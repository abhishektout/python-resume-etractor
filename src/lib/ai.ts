// ============================================================
// ai.ts — Gemini Flash Resume Parser (Paid Tier)
// Concurrency is managed in upload/route.ts via p-limit
// ============================================================

export interface Education {
  degree: string;           // e.g. "B.Tech", "MCA", "12th Grade"
  major: string | null;     // e.g. "Computer Science & Engineering"
  institution: string | null; // e.g. "Sage University"
  year: number | null;      // e.g. 2026  — used for HR filtering
}

export interface ParsedCandidate {
  name: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  experience: string | null;
  current_company: string | null;
  designation: string | null;
  skills: string[];
  education: Education[];
  projects: any[];
  certifications: any[];
  summary: string | null;
}

export const REQUIRED_STRUCTURE: ParsedCandidate = {
  name: null,
  gender: null,
  email: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  country: null,
  experience: null,
  current_company: null,
  designation: null,
  skills: [],
  education: [],
  projects: [],
  certifications: [],
  summary: null,
};

// -------------------------------------------------------
// JSON Cleaner
// -------------------------------------------------------
export function cleanJsonString(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  return cleaned.trim();
}

// -------------------------------------------------------
// Fallback — Local Regex Parser (when API key not set)
// -------------------------------------------------------
export function generateMockJson(text: string): ParsedCandidate {
  const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : "unknown@example.com";

  const phoneMatch = text.match(/(\+?\d{1,3}[-.\\s]?)?\(?\d{3}\)?[-.\\s]?\d{3}[-.\\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "+1-555-0199";

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  let name = "John Doe";
  for (const line of lines.slice(0, 5)) {
    if (!line.includes("@") && !/\d/.test(line) && line.length < 40) {
      name = line;
      break;
    }
  }

  const commonSkills = [
    "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js",
    "Java", "C++", "SQL", "PostgreSQL", "Docker", "AWS", "Git", "HTML", "CSS",
    "Tailwind", "FastAPI",
  ];
  const foundSkills = commonSkills.filter((skill) =>
    new RegExp(`\\b${skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(text)
  );
  if (!foundSkills.length) foundSkills.push("Software Development", "Problem Solving");

  const education: Education[] = [];
  const eduKeywords = ["Bachelor", "Master", "B.S", "B.Tech", "M.Tech", "Ph.D", "University", "College"];
  for (const line of lines) {
    if (eduKeywords.some((kw) => line.includes(kw))) {
      // Best-effort parse: use full line as degree, year extracted if present
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      education.push({
        degree: line.trim(),
        major: null,
        institution: null,
        year: yearMatch ? parseInt(yearMatch[0]) : null,
      });
      if (education.length >= 3) break;
    }
  }
  if (!education.length) {
    education.push({ degree: "Bachelor of Science in Computer Science", major: null, institution: null, year: null });
  }

  let experience = "3 years";
  const expMatch = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
  if (expMatch) experience = `${expMatch[1]} years`;

  let designation = "Software Engineer";
  for (const line of lines) {
    if (
      (line.includes("Engineer") || line.includes("Developer") ||
        line.includes("Manager") || line.includes("Analyst")) &&
      !line.includes("Resume") && !line.includes("CV")
    ) {
      designation = line;
      break;
    }
  }

  const summary = `Experienced professional with expertise in ${foundSkills.slice(0, 4).join(", ")}. Proven track record of developing scalable applications.`;

  let gender = "Male";
  const firstName = name.split(" ")[0].toLowerCase();
  const femaleEndings = ["a", "i", "ti", "ya", "ne", "ee", "ha", "ka", "shree"];
  const maleExceptions = ["soma", "sonu", "hari", "ravi", "ali", "vijay", "ajay"];
  if (femaleEndings.some((e) => firstName.endsWith(e)) && !maleExceptions.includes(firstName))
    gender = "Female";

  return {
    ...REQUIRED_STRUCTURE,
    name, gender, email, phone, experience, designation,
    current_company: "Tech Solutions Inc.",
    skills: foundSkills, education, summary,
    projects: ["Automated Extraction System", "HR Portal Development"],
    certifications: ["AWS Cloud Practitioner"],
  };
}

// -------------------------------------------------------
// Main — Parse Resume with Gemini (Paid Tier)
// Retry logic built-in for transient 429/5xx errors
// -------------------------------------------------------
export async function parseResumeWithGemini(
  text: string,
  apiKey: string,
  imageInfo?: { mimeType: string; data: string } | { mimeType: string; data: string }[] | null
): Promise<ParsedCandidate> {
  if (!apiKey || apiKey.trim() === "" || apiKey === "mock" || apiKey === "your_gemini_api_key_here") {
    console.warn("[AI] Gemini API key not set. Using local regex fallback.");
    return generateMockJson(text);
  }

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
}` : `You are a precise resume parser. Extract the candidate's details from the resume text provided below.
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

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AI] Gemini ${model} — attempt ${attempt}`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...(imageInfo ? (Array.isArray(imageInfo) ? imageInfo.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })) : [{ inlineData: { mimeType: imageInfo.mimeType, data: imageInfo.data } }]) : []),
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 }, // Disable thinking → cheaper & faster
          },
        }),
      });

      // Handle 429 / 503 — wait and retry
      if (response.status === 429 || response.status === 503) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5", 10);
        const waitMs = retryAfter * 1000 * attempt; // exponential backoff
        console.warn(`[AI] Rate limited (${response.status}). Waiting ${waitMs / 1000}s before retry ${attempt}/${MAX_RETRIES}...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      const rawContent = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawContent) throw new Error("Gemini returned empty response.");

      // ── Token Usage Logging ──
      const usage = resJson?.usageMetadata;
      if (usage) {
        const inputTokens = usage.promptTokenCount ?? 0;
        const outputTokens = usage.candidatesTokenCount ?? 0;
        const totalTokens = usage.totalTokenCount ?? 0;

        // Model-aware pricing (per 1M tokens, USD)
        // Source: https://ai.google.dev/pricing
        const PRICING: Record<string, { input: number; output: number }> = {
          "gemini-2.5-flash": { input: 0.30, output: 2.50 },
          "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },
          "gemini-2.0-flash": { input: 0.10, output: 0.40 },
          "gemini-2.0-flash-lite": { input: 0.075, output: 0.30 },
          "gemini-1.5-flash": { input: 0.075, output: 0.30 },
        };

        const activeModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const price = PRICING[activeModel] ?? { input: 0.30, output: 2.50 };

        const inputCost = (inputTokens / 1_000_000) * price.input;
        const outputCost = (outputTokens / 1_000_000) * price.output;
        const totalCost = inputCost + outputCost;

        console.log(`[AI] ┌─ Token Usage (${activeModel}) ──────────`);
        console.log(`[AI] │  Input tokens  : ${inputTokens.toLocaleString()}  @ $${price.input}/1M`);
        console.log(`[AI] │  Output tokens : ${outputTokens.toLocaleString()}  @ $${price.output}/1M`);
        console.log(`[AI] │  Total tokens  : ${totalTokens.toLocaleString()}`);
        console.log(`[AI] │  Cost (USD)    : $${totalCost.toFixed(6)}  (~₹${(totalCost * 84).toFixed(4)})`);
        console.log(`[AI] │  Est. 500 res  : ~$${(totalCost * 500).toFixed(4)}  (~₹${(totalCost * 500 * 84).toFixed(2)})`);
        console.log(`[AI] └──────────────────────────────────────`);
      }


      const parsedData = JSON.parse(cleanJsonString(rawContent));

      // Merge with REQUIRED_STRUCTURE to guarantee all keys exist
      const finalData = { ...REQUIRED_STRUCTURE };
      for (const key of Object.keys(REQUIRED_STRUCTURE) as Array<keyof ParsedCandidate>) {
        if (parsedData[key] !== undefined) (finalData as any)[key] = parsedData[key];
      }
      return finalData;

    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const waitMs = 2000 * attempt;
        console.warn(`[AI] Attempt ${attempt} failed: ${err.message}. Retrying in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw new Error(`Gemini failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// Backward-compat alias
export const parseResumeWithGrok = parseResumeWithGemini;
