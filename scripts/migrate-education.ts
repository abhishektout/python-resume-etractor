/**
 * migrate-education.ts
 *
 * One-time migration: converts education entries from flat strings
 *   ["B.Tech, Computer Science & Engineering, Sage University, 2026"]
 * to structured objects
 *   [{ degree, major, institution, year }]
 *
 * Run once: npx ts-node --project tsconfig.json scripts/migrate-education.ts
 * (or: npx tsx scripts/migrate-education.ts)
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: 'postgresql://postgres@localhost/talentscan' });

// ── Degree normalisation map ───────────────────────────────────────────────
const DEGREE_ALIASES: Record<string, string> = {
  'b.tech': 'B.Tech',
  'btech': 'B.Tech',
  'bachelor of technology': 'B.Tech',
  'm.tech': 'M.Tech',
  'mtech': 'M.Tech',
  'master of technology': 'M.Tech',
  'b.e': 'B.E',
  'be': 'B.E',
  'bachelor of engineering': 'B.E',
  'b.sc': 'B.Sc',
  'bsc': 'B.Sc',
  'bachelor of science': 'B.Sc',
  'm.sc': 'M.Sc',
  'msc': 'M.Sc',
  'master of science': 'M.Sc',
  'bca': 'BCA',
  'mca': 'MCA',
  'bachelor of computer application': 'BCA',
  'master of computer application': 'MCA',
  'master of computer applications': 'MCA',
  'b.com': 'B.Com',
  'bcom': 'B.Com',
  'mba': 'MBA',
  'ph.d': 'Ph.D',
  'phd': 'Ph.D',
  'doctor of philosophy': 'Ph.D',
  '12th grade': '12th Grade',
  '12th': '12th Grade',
  'intermediate': '12th Grade',
  '10th grade': '10th Grade',
  '10th': '10th Grade',
  'matriculation': '10th Grade',
  'diploma': 'Diploma',
  'bachelor of arts': 'B.A',
  'b.a': 'B.A',
  'master of arts': 'M.A',
  'm.a': 'M.A',
};

function normaliseDegree(raw: string): string {
  const lower = raw.trim().toLowerCase();
  for (const [alias, canonical] of Object.entries(DEGREE_ALIASES)) {
    if (lower.startsWith(alias)) return canonical;
  }
  // Title-case fallback
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Parser: flat string → structured object ───────────────────────────────
interface EducationObj {
  degree: string;
  major: string | null;
  institution: string | null;
  year: number | null;
}

function parseEducationString(str: string): EducationObj {
  // Extract year (4-digit, 19xx or 20xx) anywhere in the string
  const yearMatch = str.match(/\b(19|20)\d{2}\b/g);
  const year = yearMatch ? parseInt(yearMatch[yearMatch.length - 1]) : null;

  // Remove year from string before splitting
  const withoutYear = str.replace(/\b(19|20)\d{2}\b/g, '').replace(/,\s*$/, '').trim();

  const parts = withoutYear.split(',').map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { degree: str.trim(), major: null, institution: null, year };
  }

  if (parts.length === 1) {
    return { degree: normaliseDegree(parts[0]), major: null, institution: null, year };
  }

  if (parts.length === 2) {
    // Could be "Degree, Institution" or "Degree, Major"
    // Heuristic: if part[1] contains "University/College/School/Institute" → institution
    const isInstitution = /university|college|school|institute|vidyapeeth|academy|iit|nit/i.test(parts[1]);
    return {
      degree: normaliseDegree(parts[0]),
      major: isInstitution ? null : parts[1],
      institution: isInstitution ? parts[1] : null,
      year,
    };
  }

  // 3+ parts: first = degree, last recognised institution, middle = major
  const degree = normaliseDegree(parts[0]);

  // Find the institution part (contains university/college keywords)
  let institutionIdx = -1;
  for (let i = parts.length - 1; i >= 1; i--) {
    if (/university|college|school|institute|vidyapeeth|academy|iit|nit|deemed|autonomous/i.test(parts[i])) {
      institutionIdx = i;
      break;
    }
  }

  if (institutionIdx === -1) {
    // No obvious institution — treat last part as institution
    institutionIdx = parts.length - 1;
  }

  const major = parts.slice(1, institutionIdx).join(', ') || null;
  const institution = parts[institutionIdx];

  return { degree, major, institution, year };
}

// ── Main Migration ─────────────────────────────────────────────────────────
async function migrate() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: number; name: string; education: any }>(
      "SELECT id, name, education FROM candidates WHERE status = 'processed'"
    );

    console.log(`\n📦 Found ${rows.length} processed candidates to migrate.\n`);

    let updated = 0;
    let alreadyStructured = 0;
    let skipped = 0;

    for (const row of rows) {
      const education = row.education;

      if (!Array.isArray(education) || education.length === 0) {
        skipped++;
        continue;
      }

      // Check if already structured (first item is an object with 'degree' key)
      const first = education[0];
      if (typeof first === 'object' && first !== null && 'degree' in first) {
        alreadyStructured++;
        continue;
      }

      // Convert flat strings → structured objects
      const structured: EducationObj[] = education.map((entry: any) =>
        typeof entry === 'string' ? parseEducationString(entry) : entry
      );

      await client.query(
        'UPDATE candidates SET education = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(structured), row.id]
      );

      console.log(`  ✅ [${row.id}] ${row.name}`);
      structured.forEach((e) =>
        console.log(`       → ${e.degree}${e.major ? ` | ${e.major}` : ''}${e.institution ? ` | ${e.institution}` : ''}${e.year ? ` | ${e.year}` : ''}`)
      );

      updated++;
    }

    console.log('\n────────────────────────────────────────');
    console.log(`✅ Migrated        : ${updated} candidates`);
    console.log(`⏭️  Already structured: ${alreadyStructured} candidates`);
    console.log(`⚠️  Skipped (empty) : ${skipped} candidates`);
    console.log('────────────────────────────────────────\n');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
