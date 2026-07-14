import fs from 'fs';
import { query } from './db';
import { extractText } from './parser';
import { parseResumeWithGemini } from './ai';
import { parseResumeWithFreeTier, logFreeProviderStatus } from './ai-free';

// ── Mode Switch ──────────────────────────────────────────
// AI_MODE=free  → Gemini Free + Groq Free (₹0, ~15,900 req/day)
// AI_MODE=paid  → Gemini Paid  (~₹73 per 500 resumes, fast)
const AI_MODE = (process.env.AI_MODE || 'free').toLowerCase();

// Paid mode keys
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Free mode keys
const GEMINI_FREE_KEY = process.env.GEMINI_FREE_KEY || '';
const GROQ_FREE_KEY   = process.env.GROQ_FREE_KEY   || '';

console.log(`[Processor] AI Mode: ${AI_MODE.toUpperCase()}`);

export async function processResumeTask(candidateId: number, filePath: string, filename: string) {
  console.log(`[Processor] Starting for candidate ${candidateId}, file: ${filename}`);
  try {
    // 1. Read file bytes
    const fileBytes = fs.readFileSync(filePath);

    // 2. Extract text from PDF/DOCX
    let text = '';
    try {
      text = await extractText(fileBytes, filename);
    } catch (parseErr: any) {
      console.error(`[Processor] Text extraction failed for ${filename}:`, parseErr);
      await query(
        "UPDATE candidates SET status = 'failed', error_message = $1 WHERE id = $2",
        [`Text extraction failed: ${parseErr.message}`, candidateId]
      );
      return;
    }

    // 3. Call AI — route based on AI_MODE
    let aiData;
    try {
      if (AI_MODE === 'paid') {
        // ── PAID: Gemini paid tier ──
        console.log(`[Processor] [PAID] Using Gemini paid tier`);
        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        aiData = { data: await parseResumeWithGemini(text, GEMINI_API_KEY), extractedBy: `${model} (paid)` };
      } else {
        // ── FREE: Gemini free + Groq free rotation ──
        logFreeProviderStatus();
        aiData = await parseResumeWithFreeTier(text, GEMINI_FREE_KEY, GROQ_FREE_KEY);
      }
    } catch (aiErr: any) {
      console.error(`[Processor] AI processing failed for ${filename}:`, aiErr);
      await query(
        "UPDATE candidates SET status = 'failed', error_message = $1 WHERE id = $2",
        [`AI processing failed: ${aiErr.message}`, candidateId]
      );
      return;
    }

    // ── Check email for dedup ──
    if (aiData.data.email) {
      const emailCheck = await query(
        `SELECT id FROM candidates WHERE email = $1 AND id != $2 LIMIT 1`,
        [aiData.data.email, candidateId]
      );

      if (emailCheck.rows.length > 0) {
        const existingId = emailCheck.rows[0].id;
        console.log(
          `[Processor] Email duplicate: "${aiData.data.email}" exists as id=${existingId}. Updating & removing temp id=${candidateId}.`
        );

        await query(
          `UPDATE candidates
           SET name = $1, gender = $2, email = $3, phone = $4, address = $5,
               city = $6, state = $7, country = $8, experience = $9,
               current_company = $10, designation = $11, skills = $12,
               education = $13, projects = $14, certifications = $15,
               summary = $16, resume_filename = $17, extracted_by = $18,
               status = 'processed', error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $19`,
          [
            aiData.data.name, aiData.data.gender, aiData.data.email, aiData.data.phone,
            aiData.data.address, aiData.data.city, aiData.data.state, aiData.data.country,
            aiData.data.experience, aiData.data.current_company, aiData.data.designation,
            JSON.stringify(aiData.data.skills || []),
            JSON.stringify(aiData.data.education || []),
            JSON.stringify(aiData.data.projects || []),
            JSON.stringify(aiData.data.certifications || []),
            aiData.data.summary, filename, aiData.extractedBy, existingId
          ]
        );
        await query(`DELETE FROM candidates WHERE id = $1`, [candidateId]);
        return;
      }
    }

    // 4. Save to DB normally
    await query(
      `UPDATE candidates
       SET name = $1, gender = $2, email = $3, phone = $4, address = $5,
           city = $6, state = $7, country = $8, experience = $9,
           current_company = $10, designation = $11, skills = $12,
           education = $13, projects = $14, certifications = $15,
           summary = $16, extracted_by = $17, status = 'processed',
           error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $18`,
      [
        aiData.data.name, aiData.data.gender, aiData.data.email, aiData.data.phone,
        aiData.data.address, aiData.data.city, aiData.data.state, aiData.data.country,
        aiData.data.experience, aiData.data.current_company, aiData.data.designation,
        JSON.stringify(aiData.data.skills || []),
        JSON.stringify(aiData.data.education || []),
        JSON.stringify(aiData.data.projects || []),
        JSON.stringify(aiData.data.certifications || []),
        aiData.data.summary, aiData.extractedBy, candidateId
      ]
    );

    console.log(`[Processor] ✅ Done — candidate ${candidateId} via ${aiData.extractedBy} (${AI_MODE} mode)`);

  } catch (err: any) {
    console.error(`[Processor] Unexpected error for candidate ${candidateId}:`, err);
    try {
      await query(
        "UPDATE candidates SET status = 'failed', error_message = $1 WHERE id = $2",
        [`Unexpected processing error: ${err.message}`, candidateId]
      );
    } catch (dbErr) {
      console.error(`[Processor] Could not write failed status to DB:`, dbErr);
    }
  }
}
