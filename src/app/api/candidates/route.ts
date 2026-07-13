import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = (searchParams.get('sort_order') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Validate sort columns to prevent SQL injection
    const allowedSortColumns = ['name', 'experience', 'created_at'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';

    let countQuery = 'SELECT COUNT(*) FROM candidates';
    let dataQuery = 'SELECT * FROM candidates';
    
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCounter = 1;

    if (status) {
      conditions.push(`status = $${paramCounter}`);
      params.push(status);
      paramCounter++;
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(`(
        name ILIKE $${paramCounter} OR
        email ILIKE $${paramCounter} OR
        phone ILIKE $${paramCounter} OR
        current_company ILIKE $${paramCounter} OR
        designation ILIKE $${paramCounter} OR
        experience ILIKE $${paramCounter} OR
        skills::text ILIKE $${paramCounter} OR
        education::text ILIKE $${paramCounter}
      )`);
      params.push(searchPattern);
      paramCounter++;
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    countQuery += whereClause;

    // Run count query
    const countRes = await query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Run paginated data query
    const offset = (page - 1) * limit;
    
    dataQuery += `${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    const dataParams = [...params, limit, offset];
    
    const dataRes = await query(dataQuery, dataParams);

    return NextResponse.json({
      total,
      page,
      limit,
      candidates: dataRes.rows
    });
  } catch (err: any) {
    console.error('List candidates endpoint error:', err);
    return NextResponse.json(
      { detail: `Database query failed: ${err.message}` },
      { status: 500 }
    );
  }
}
