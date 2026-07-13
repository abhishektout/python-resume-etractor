import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { query } from '@/lib/db';
import { processResumeTask } from '@/lib/processor';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ detail: "No files uploaded" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const results = [];

    for (const file of files) {
      const filename = file.name;
      const ext = filename.split('.').pop()?.toLowerCase();

      if (ext !== 'pdf' && ext !== 'docx') {
        results.push({
          filename,
          status: 'ignored',
          error: 'Only PDF and DOCX files are allowed.'
        });
        continue;
      }

      // Check collision and rename
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

      // Write file to disk
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(filePath, buffer);

      // Create DB Record
      const insertQuery = `
        INSERT INTO candidates (resume_filename, status)
        VALUES ($1, 'processing')
        RETURNING id
      `;
      const dbRes = await query(insertQuery, [actualFilename]);
      const candidateId = dbRes.rows[0].id;

      // Start background task (unawaited)
      processResumeTask(candidateId, filePath, actualFilename).catch(err => {
        console.error(`Error in processResumeTask for candidate ${candidateId}:`, err);
      });

      results.push({
        filename: actualFilename,
        candidate_id: candidateId,
        status: 'processing'
      });
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('Upload endpoint error:', err);
    return NextResponse.json(
      { detail: `Failed to upload files: ${err.message}` },
      { status: 500 }
    );
  }
}
