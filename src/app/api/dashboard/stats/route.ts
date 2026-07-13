import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const totalRes = await query('SELECT COUNT(*) FROM candidates');
    const processedRes = await query("SELECT COUNT(*) FROM candidates WHERE status = 'processed'");
    const failedRes = await query("SELECT COUNT(*) FROM candidates WHERE status = 'failed'");

    return NextResponse.json({
      total_uploaded: parseInt(totalRes.rows[0].count, 10),
      processed: parseInt(processedRes.rows[0].count, 10),
      failed: parseInt(failedRes.rows[0].count, 10),
    });
  } catch (err: any) {
    console.error('Stats endpoint error:', err);
    return NextResponse.json(
      { detail: `Database query failed: ${err.message}` },
      { status: 500 }
    );
  }
}
