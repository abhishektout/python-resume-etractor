import fs from 'fs';
import { query } from './db';
import { extractText } from './parser';
import { parseResumeWithGrok } from './ai';

const GROQ_API_KEY = process.env.GROQ_API_KEY || "mock";

export async function processResumeTask(candidateId: number, filePath: string, filename: string) {
  console.log(`[Processor] Starting processResumeTask for candidate ${candidateId}, file: ${filename}`);
  try {
    // 1. Read file bytes
    const fileBytes = fs.readFileSync(filePath);

    // 2. Extract Text
    let text = "";
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

    // 3. Call Groq API
    let aiData;
    try {
      aiData = await parseResumeWithGrok(text, GROQ_API_KEY);
    } catch (aiErr: any) {
      console.error(`[Processor] AI processing failed for ${filename}:`, aiErr);
      await query(
        "UPDATE candidates SET status = 'failed', error_message = $1 WHERE id = $2",
        [`AI processing failed: ${aiErr.message}`, candidateId]
      );
      return;
    }

    // 4. Save Extracted Data
    const updateQuery = `
      UPDATE candidates 
      SET name = $1, gender = $2, email = $3, phone = $4, address = $5, city = $6, state = $7, country = $8,
          experience = $9, current_company = $10, designation = $11, skills = $12, education = $13,
          projects = $14, certifications = $15, summary = $16, status = 'processed', error_message = NULL
      WHERE id = $17
    `;

    const updateParams = [
      aiData.name,
      aiData.gender,
      aiData.email,
      aiData.phone,
      aiData.address,
      aiData.city,
      aiData.state,
      aiData.country,
      aiData.experience,
      aiData.current_company,
      aiData.designation,
      JSON.stringify(aiData.skills || []),
      JSON.stringify(aiData.education || []),
      JSON.stringify(aiData.projects || []),
      JSON.stringify(aiData.certifications || []),
      aiData.summary,
      candidateId
    ];

    await query(updateQuery, updateParams);
    console.log(`[Processor] Successfully processed resume for candidate ${candidateId}`);
  } catch (err: any) {
    console.error(`[Processor] Unexpected error processing candidate ${candidateId}:`, err);
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
