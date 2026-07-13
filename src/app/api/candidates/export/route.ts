import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await query("SELECT * FROM candidates WHERE status = 'processed'");
    const candidates = res.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('TalentScan Candidates');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Gender', key: 'gender', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Experience', key: 'experience', width: 15 },
      { header: 'Current Company', key: 'current_company', width: 25 },
      { header: 'Designation', key: 'designation', width: 25 },
      { header: 'Skills', key: 'skills', width: 40 },
      { header: 'Education', key: 'education', width: 40 },
      { header: 'Projects', key: 'projects', width: 40 },
      { header: 'Certifications', key: 'certifications', width: 30 },
      { header: 'Summary', key: 'summary', width: 50 },
      { header: 'Resume Filename', key: 'resume_filename', width: 30 },
      { header: 'Uploaded Date', key: 'created_at', width: 25 },
    ];

    for (const c of candidates) {
      // Format skills
      const skillsStr = Array.isArray(c.skills) ? c.skills.join(', ') : '';

      // Format education
      const eduList: string[] = [];
      if (Array.isArray(c.education)) {
        for (const edu of c.education) {
          if (typeof edu === 'object' && edu !== null) {
            const eduStr = `${edu.degree || ''} in ${edu.major || ''} from ${edu.institution || ''} (${edu.year || ''})`;
            eduList.push(eduStr);
          } else {
            eduList.push(String(edu));
          }
        }
      }
      const educationStr = eduList.join('; ');

      // Format projects
      const projList: string[] = [];
      if (Array.isArray(c.projects)) {
        for (const proj of c.projects) {
          if (typeof proj === 'object' && proj !== null) {
            const projStr = `${proj.name || ''}: ${proj.description || ''}`;
            projList.push(projStr);
          } else {
            projList.push(String(proj));
          }
        }
      }
      const projectsStr = projList.join('; ');

      // Format certifications
      const certsStr = Array.isArray(c.certifications) ? c.certifications.join(', ') : '';

      worksheet.addRow({
        id: c.id,
        name: c.name,
        gender: c.gender,
        email: c.email,
        phone: c.phone,
        address: c.address,
        city: c.city,
        state: c.state,
        country: c.country,
        experience: c.experience,
        current_company: c.current_company,
        designation: c.designation,
        skills: skillsStr,
        education: educationStr,
        projects: projectsStr,
        certifications: certsStr,
        summary: c.summary,
        resume_filename: c.resume_filename,
        created_at: c.created_at ? new Date(c.created_at).toISOString().replace('T', ' ').substring(0, 19) : '',
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=talentscan_candidates.xlsx',
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
