import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { query } from '@/lib/db';
import { processResumeTask } from '@/lib/processor';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const candidateId = parseInt(id, 10);

    if (isNaN(candidateId)) {
      return NextResponse.json({ detail: "Invalid candidate ID" }, { status: 400 });
    }

    const res = await query('SELECT * FROM candidates WHERE id = $1', [candidateId]);

    if (res.rows.length === 0) {
      return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
    }

    const candidate = res.rows[0];

    // Reset status in DB
    await query(
      "UPDATE candidates SET status = 'processing', error_message = NULL WHERE id = $1",
      [candidateId]
    );

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadDir, candidate.resume_filename);

    if (!fs.existsSync(filePath)) {
      // If file doesn't exist locally, check if it's in the old python directory as a fallback during migration
      const legacyPath = path.join(process.cwd(), 'backend', 'uploads', candidate.resume_filename);
      if (fs.existsSync(legacyPath)) {
        // Copy to public/uploads
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.copyFileSync(legacyPath, filePath);
      } else {
        await query(
          "UPDATE candidates SET status = 'failed', error_message = $1 WHERE id = $2",
          [`Resume file not found on disk: ${candidate.resume_filename}`, candidateId]
        );
        return NextResponse.json(
          { detail: `Resume file not found on disk: ${candidate.resume_filename}` },
          { status: 400 }
        );
      }
    }

    // Trigger background task (unawaited)
    processResumeTask(candidateId, filePath, candidate.resume_filename).catch(err => {
      console.error(`Error in processResumeTask (retry) for candidate ${candidateId}:`, err);
    });

    return NextResponse.json({ status: "processing", candidate_id: candidateId });
  } catch (err: any) {
    console.error('Retry endpoint error:', err);
    return NextResponse.json(
      { detail: `Failed to retry candidate parsing: ${err.message}` },
      { status: 500 }
    );
  }
}
