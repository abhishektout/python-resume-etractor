import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await query("SELECT * FROM candidates WHERE status = 'processed'");
    const candidates = res.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TalentScan AI';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('TalentScan Candidates', {
      views: [{ state: 'frozen', ySplit: 1 }], // Freeze the header row
    });

    // ── Column definitions ─────────────────────────────────────────────────────
    worksheet.columns = [
      { header: 'Name',            key: 'name',            width: 22 },
      { header: 'Gender',          key: 'gender',          width: 10 },
      { header: 'Email',           key: 'email',           width: 28 },
      { header: 'Phone',           key: 'phone',           width: 16 },
      { header: 'City',            key: 'city',            width: 14 },
      { header: 'State',           key: 'state',           width: 14 },
      { header: 'Experience',      key: 'experience',      width: 13 },
      { header: 'Current Company', key: 'current_company', width: 22 },
      { header: 'Designation',     key: 'designation',     width: 22 },
      { header: 'Skills',          key: 'skills',          width: 40 },
      { header: 'Education',       key: 'education',       width: 40 },
      { header: 'Grad Year',       key: 'grad_year',       width: 11 },
      { header: 'Projects',        key: 'projects',        width: 50 },
      { header: 'Certifications',  key: 'certifications',  width: 35 },
    ];

    // ── Style the header row ───────────────────────────────────────────────────
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' }, // dark navy
      };
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11,
        name: 'Calibri',
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF2E86AB' } },
      };
    });
    headerRow.height = 28;

    // ── Add data rows ──────────────────────────────────────────────────────────
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];

      // Format skills
      const skillsStr = Array.isArray(c.skills)
        ? c.skills.join(', ')
        : (c.skills ?? '');

      // Format education — handles both structured objects AND legacy flat strings
      const eduLines: string[] = [];
      let latestYear: number | null = null;

      if (Array.isArray(c.education)) {
        for (const edu of c.education) {
          if (typeof edu === 'object' && edu !== null) {
            // ✅ New structured format: { degree, major, institution, year }
            const parts = [
              edu.degree,
              edu.major     ? `in ${edu.major}`         : null,
              edu.institution ? `from ${edu.institution}` : null,
              edu.year      ? `(${edu.year})`           : null,
            ].filter(Boolean);
            eduLines.push(parts.join(' '));
            if (edu.year && (!latestYear || edu.year > latestYear)) {
              latestYear = edu.year;
            }
          } else {
            // 🔄 Legacy flat string: "B.Tech, CS, Sage University, 2026"
            const str = String(edu);
            eduLines.push(str);
            // Try to extract year from the end of the string
            const yearMatch = str.match(/\b(19|20)\d{2}\b/g);
            if (yearMatch) {
              const yr = parseInt(yearMatch[yearMatch.length - 1]);
              if (!latestYear || yr > latestYear) latestYear = yr;
            }
          }
        }
      }
      const educationStr = eduLines.join('\n');

      // Format projects — one entry per line
      const projLines: string[] = [];
      if (Array.isArray(c.projects)) {
        for (const proj of c.projects) {
          if (typeof proj === 'object' && proj !== null) {
            const name = proj.name ? `• ${proj.name}` : '';
            const desc = proj.description ? proj.description : '';
            projLines.push(desc ? `${name}: ${desc}` : name);
          } else {
            projLines.push(`• ${String(proj)}`);
          }
        }
      }
      const projectsStr = projLines.join('\n');

      // Format certifications — one per line
      const certLines: string[] = Array.isArray(c.certifications)
        ? c.certifications.map((cert: string) => `• ${cert}`)
        : [];
      const certsStr = certLines.join('\n');

      const rowData = {
        name:            c.name            ?? '',
        gender:          c.gender          ?? '',
        email:           c.email           ?? '',
        phone:           c.phone           ?? '',
        city:            c.city            ?? '',
        state:           c.state           ?? '',
        experience:      c.experience      ?? '',
        current_company: c.current_company ?? '',
        designation:     c.designation     ?? '',
        skills:          skillsStr,
        education:       educationStr,
        grad_year:       latestYear ?? '',
        projects:        projectsStr,
        certifications:  certsStr,
      };

      const dataRow = worksheet.addRow(rowData);

      // Alternating row background
      const isEven = i % 2 === 0;
      const rowBg = isEven ? 'FFF0F4F8' : 'FFFFFFFF'; // light blue-grey vs white

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Background
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg },
        };

        // Font
        cell.font = { name: 'Calibri', size: 10 };

        // Alignment: wrap text, top-align
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          // Centre short columns, left-align long content columns
          horizontal: colNumber <= 9 ? 'left' : 'left',
        };

        // Subtle border
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFD1D9E0' } },
          right:  { style: 'thin', color: { argb: 'FFD1D9E0' } },
        };
      });

      // Dynamically size row height based on the number of newlines in any cell
      const maxLines = Math.max(
        ...Object.values(rowData).map((v) =>
          typeof v === 'string' ? (v.split('\n').length) : 1
        )
      );
      dataRow.height = Math.max(20, maxLines * 16);
    }

    // ── Right border on the last column ───────────────────────────────────────
    worksheet.eachRow((row) => {
      const lastCell = row.getCell(worksheet.columns.length);
      lastCell.border = {
        ...lastCell.border,
        right: { style: 'thin', color: { argb: 'FFD1D9E0' } },
      };
    });

    // ── Tab colour ────────────────────────────────────────────────────────────
    worksheet.properties.tabColor = { argb: 'FF2E86AB' };

    // ── Output ────────────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename=talentscan_candidates.xlsx',
      },
    });
  } catch (err: any) {
    console.error('Export endpoint error:', err);
    return NextResponse.json(
      { detail: `Failed to export candidates: ${err.message}` },
      { status: 500 }
    );
  }
}
