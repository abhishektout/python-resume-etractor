import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
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

    return NextResponse.json(res.rows[0]);
  } catch (err: any) {
    console.error('Get candidate endpoint error:', err);
    return NextResponse.json(
      { detail: `Database query failed: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const candidateId = parseInt(id, 10);

    if (isNaN(candidateId)) {
      return NextResponse.json({ detail: "Invalid candidate ID" }, { status: 400 });
    }

    const res = await query('DELETE FROM candidates WHERE id = $1 RETURNING id', [candidateId]);

    if (res.rows.length === 0) {
      return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted_id: candidateId });
  } catch (err: any) {
    console.error('Delete candidate error:', err);
    return NextResponse.json(
      { detail: `Delete failed: ${err.message}` },
      { status: 500 }
    );
  }
}
