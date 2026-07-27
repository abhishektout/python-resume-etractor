import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '@/lib/db';
import { processResumeTask } from '@/lib/processor';
import pLimit from 'p-limit';

// -------------------------------------------------------
// Paid tier concurrency control
// Gemini 2.0 Flash paid: 2000 RPM allowed
// 10 concurrent = safe, fast, no 429 errors
// -------------------------------------------------------
const CONCURRENCY_LIMIT = 10;

/** Compute MD5 hash of file buffer for deduplication */
function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ detail: "No files uploaded" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tasks: Array<{ candidateId: number; filePath: string; actualFilename: string }> = [];
    const results: any[] = [];

    for (const file of files) {
      const filename = file.name;
      const ext = filename.split('.').pop()?.toLowerCase();

      if (ext !== 'pdf' && ext !== 'docx' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png') {
        results.push({ filename, status: 'ignored', error: 'Only PDF, DOCX, and JPG/JPEG/PNG files are allowed.' });
        continue;
      }

      // Read file buffer & compute hash
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileHash = computeFileHash(buffer);

      // ── Dedup Check 1: Same file hash already in DB? ──
      const hashCheck = await query(
        `SELECT id, status, resume_filename FROM candidates WHERE file_hash = $1 LIMIT 1`,
        [fileHash]
      );

      if (hashCheck.rows.length > 0) {
        const existing = hashCheck.rows[0];
        console.log(`[Upload] Duplicate file skipped (hash match): ${filename} → existing id=${existing.id}`);
        results.push({
          filename,
          candidate_id: existing.id,
          status: existing.status,
          skipped: true,
          reason: `Duplicate file — already exists as "${existing.resume_filename}"`
        });
        continue;
      }

      // Handle filename collision on disk
      let filePath = path.join(uploadDir, filename);
      const extName = path.extname(filename);
      const baseName = path.basename(filename, extName);
      let counter = 1;
      let actualFilename = filename;
      while (fs.existsSync(filePath)) {
        actualFilename = `${baseName}_${counter}${extName}`;
        filePath = path.join(uploadDir, actualFilename);
        counter++;
      }

      // Save file to disk
      fs.writeFileSync(filePath, buffer);

      // Create DB record — store file_hash for future dedup
      const dbRes = await query(
        `INSERT INTO candidates (resume_filename, file_hash, status) VALUES ($1, $2, 'processing') RETURNING id`,
        [actualFilename, fileHash]
      );
      const candidateId = dbRes.rows[0].id;

      tasks.push({ candidateId, filePath, actualFilename });
      results.push({ filename: actualFilename, candidate_id: candidateId, status: 'processing' });
    }

    // ── Process all new (non-duplicate) resumes with p-limit ──
    if (tasks.length > 0) {
      const limit = pLimit(CONCURRENCY_LIMIT);

      Promise.allSettled(
        tasks.map(({ candidateId, filePath, actualFilename }) =>
          limit(() => processResumeTask(candidateId, filePath, actualFilename))
        )
      ).then((outcomes) => {
        const failed = outcomes.filter((o) => o.status === 'rejected').length;
        const succeeded = outcomes.filter((o) => o.status === 'fulfilled').length;
        console.log(
          `[Upload] Batch complete — ${succeeded} succeeded, ${failed} failed, ${results.filter((r: any) => r.skipped).length} duplicates skipped.`
        );
      }).catch((err) => {
        console.error('[Upload] Unexpected batch error:', err);
      });
    }

    const skipped = results.filter((r: any) => r.skipped).length;
    const queued = tasks.length;

    return NextResponse.json({
      results,
      message: `${queued} new resume(s) queued, ${skipped} duplicate(s) skipped.`
    });

  } catch (err: any) {
    console.error('Upload endpoint error:', err);
    return NextResponse.json(
      { detail: `Failed to upload files: ${err.message}` },
      { status: 500 }
    );
  }
}