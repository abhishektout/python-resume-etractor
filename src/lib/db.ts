import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost/talentscan';

const pool = new Pool({
  connectionString,
});

let isInitialized = false;

// Initialize DB tables on-demand
export const ensureDbInitialized = async () => {
  if (isInitialized) return;

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      gender VARCHAR(50),
      email VARCHAR(255),
      phone VARCHAR(100),
      address TEXT,
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100),
      experience VARCHAR(100),
      current_company VARCHAR(255),
      designation VARCHAR(255),
      skills JSONB DEFAULT '[]'::jsonb,
      education JSONB DEFAULT '[]'::jsonb,
      projects JSONB DEFAULT '[]'::jsonb,
      certifications JSONB DEFAULT '[]'::jsonb,
      summary TEXT,
      resume_filename VARCHAR(512),
      file_hash VARCHAR(64),
      extracted_by VARCHAR(100),
      status VARCHAR(50) DEFAULT 'processing',
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Migrations: safely add new columns to existing tables
  const migrations = [
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS extracted_by VARCHAR(100);`,
  ];

  const createIndices = [
    `CREATE INDEX IF NOT EXISTS idx_candidates_name ON candidates(name);`,
    `CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);`,
    `CREATE INDEX IF NOT EXISTS idx_candidates_file_hash ON candidates(file_hash);`,
    // Unique constraint on email — only for non-null emails
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_email_unique ON candidates(email) WHERE email IS NOT NULL;`,
  ];

  try {
    await pool.query(createTableQuery);
    for (const migration of migrations) {
      await pool.query(migration);
    }
    for (const indexQuery of createIndices) {
      await pool.query(indexQuery);
    }
    isInitialized = true;
    console.log('Database tables, migrations, and indices initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

// Helper to query the database
export const query = async (text: string, params?: any[]) => {
  await ensureDbInitialized();
  return pool.query(text, params);
};

export default pool;
