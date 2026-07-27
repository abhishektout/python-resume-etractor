# TalentScan AI 🚀

TalentScan AI is an enterprise-grade, high-performance **AI-powered Resume Parser & Candidate Management System** built with **Next.js 16 (App Router)** and **PostgreSQL**. 

It enables HR departments and recruiters to upload batches of resumes (PDF, DOCX, and images), automatically extract detailed structured candidates' info using state-of-the-art LLMs (Gemini & Groq), manage duplicates, filter/search candidate listings, and export parsed profiles into beautifully styled Excel spreadsheets.

---

## 🔑 Key Features & Technical Highlights

### 1. Robust Parser Engine ([parser.ts](file:///home/oem/abhishek/extractor/src/lib/parser.ts), [processor.ts](file:///home/oem/abhishek/extractor/src/lib/processor.ts))
*   **Multi-Format Processing**: Direct extraction of text from standard **PDFs** (`pdf-parse`) and **DOCX** files (`mammoth`).
*   **Dual Vision Fallbacks**:
    *   **Scanned PDFs**: If text extraction yields sparse content (less than 100 characters), the system automatically converts the file into a base64 buffer and uses Gemini's Vision capabilities to extract information.
    *   **Scanned DOCXs**: When a DOCX yields no direct text, the parser unzips the file package structure (`word/media/*`), extracts embedded images in sequential order, and routes them to the Gemini Vision fallback.
*   **Name Detection Fallback**: Automatically triggers PDF Vision fallback if text extraction succeeds but fails to identify a candidate's name.

### 2. Smart AI Routing Modes ([ai.ts](file:///home/oem/abhishek/extractor/src/lib/ai.ts), [ai-free.ts](file:///home/oem/abhishek/extractor/src/lib/ai-free.ts))
The application supports a custom mode switch (`AI_MODE`) in the environment to balance cost and throughput:
*   **Paid Mode (`AI_MODE=paid`)**:
    *   Uses **Gemini Paid tier** APIs (configured via `GEMINI_MODEL`, e.g., `gemini-2.5-flash`).
    *   Calculates and logs exact prompt/response token usage and estimated USD/INR cost.
    *   Optimized with `thinkingBudget: 0` to reduce latency and API billing cost.
    *   Built-in exponential backoff retry logic (up to 3 retries) for `429` Rate Limit or `503` service errors.
*   **Free Mode (`AI_MODE=free`)**:
    *   Rotates between Gemini and Groq free tiers to avoid rate-limits while keeping costs at **₹0**.
    *   Implements an in-memory token/request rate limiter enforcing RPM (Requests Per Minute) and RPD (Requests Per Day) safety zones.
    *   **Provider Rotation Order**:
        1.  *Gemini 3.1 Flash Lite* (500 RPD | 10 RPM) — Best quality.
        2.  *Groq Llama-3.3-70b* (1,000 RPD | 30 RPM) — High quality.
        3.  *Groq Llama-3.1-8b* (14,400 RPD | 30 RPM) — Fast fallback.

### 3. Smart Database & Deduplication ([db.ts](file:///home/oem/abhishek/extractor/src/lib/db.ts), [route.ts](file:///home/oem/abhishek/extractor/src/app/api/resumes/upload/route.ts))
*   **On-Demand Schema Initialization**: Auto-creates tables, indexes, and applies database migrations on app startup.
*   **MD5 File Hashing**: Prevents unnecessary processing of identical documents. Computes MD5 hash for every uploaded file and skips parsing if the hash exists in the database.
*   **Email Deduplication**: If a candidate's extracted email already exists in the database, the system updates the existing profile with the newly parsed fields and deletes the duplicate/temporary candidate record.

### 4. Enterprise Excel Exports ([route.ts](file:///home/oem/abhishek/extractor/src/app/api/candidates/export/route.ts))
*   Generates professionally formatted worksheets using `exceljs`.
*   Includes frozen header rows, styled dark navy backgrounds, auto-fit columns, and proper cell borders.
*   Intelligently formats structured lists (Skills, Projects, Education) and automatically calculates graduation/latest education year from records.

---

## 🛠️ Tech Stack
*   **Frontend & Backend**: Next.js 16 (React 19, TypeScript, TailwindCSS v4)
*   **Database**: PostgreSQL
*   **AI Integration**: Google Gemini API, Groq Cloud API
*   **File Parsing Utilities**: `pdf-parse`, `mammoth` (DOCX reader), `exceljs` (Excel sheets creator), `p-limit` (for concurrency control)

---

## 📋 Database Schema

TalentScan AI runs on a `candidates` table structure mapping candidate details:

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `SERIAL PRIMARY KEY` | Unique ID of the candidate profile. |
| `name` | `VARCHAR(255)` | Candidate full name. |
| `gender` | `VARCHAR(50)` | Extracted gender (or inferred from name). |
| `email` | `VARCHAR(255) UNIQUE` | Unique email index. |
| `phone` | `VARCHAR(100)` | Primary phone number. |
| `skills` | `JSONB` | Array of extracted skills. |
| `education` | `JSONB` | Structured education objects (Degree, Major, Institution, Year). |
| `projects` | `JSONB` | Extracted projects array. |
| `certifications` | `JSONB` | Extracted certifications array. |
| `summary` | `TEXT` | Brief candidate summary. |
| `resume_filename` | `VARCHAR(512)` | Name of the file stored on disk. |
| `file_hash` | `VARCHAR(64)` | MD5 hash of the file for duplicate checking. |
| `status` | `VARCHAR(50)` | Parsing status (`processing`, `processed`, `failed`). |
| `extracted_by` | `VARCHAR(100)` | The model and tier used to parse the resume. |
| `created_at` / `updated_at` | `TIMESTAMP` | Timestamps. |

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Connection String
DATABASE_URL=postgresql://postgres@localhost/talentscan

# AI Mode (choose "paid" or "free")
AI_MODE=free

# Paid Tier Keys (Required only if AI_MODE=paid)
GEMINI_API_KEY=your_gemini_paid_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Free Tier Keys (Required only if AI_MODE=free)
GEMINI_FREE_KEY=your_gemini_free_api_key_here
GROQ_FREE_KEY=your_groq_free_api_key_here
```

---

## 🚀 Getting Started

### Prerequisites
*   **Node.js**: `v18.x` or above
*   **PostgreSQL**: A running instance
*   **Unzip CLI**: (For DOCX media/image extract fallback)
    ```bash
    # Ubuntu/Debian
    sudo apt-get install unzip
    ```

### Installation

1.  **Clone the repository and install dependencies**:
    ```bash
    npm install
    ```

2.  **Initialize the Database**:
    The system will automatically initialize tables, columns, and indices when it first boots up. Make sure your database specified in `DATABASE_URL` is created.

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Access the portal at [http://localhost:3000](http://localhost:3000).

4.  **Log in to the Portal**:
    The system features a default login page. Use these default credentials:
    *   **Username**: `admin`
    *   **Password**: `admin123`

---

## 📂 Database Migrations & Scripts

### Education Data Normalization
If you have legacy database records containing unstructured flat strings for education (e.g. `["B.Tech, CSE, Sage University, 2026"]`), you can migrate them to structured JSON objects:

```bash
# Using tsx
npx tsx [migrate-education.ts](file:///home/oem/abhishek/extractor/scripts/migrate-education.ts)
```

This updates files to structured objects:
```json
[
  {
    "degree": "B.Tech",
    "major": "Computer Science & Engineering",
    "institution": "Sage University",
    "year": 2026
  }
]
```

---

## 🔗 API Architecture

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Authenticates administrator and returns a session token. |
| `/api/resumes/upload` | `POST` | Batch uploads files, computes hashes, check duplicates, and queues parsing tasks (Concurrency limit: `10`). |
| `/api/candidates` | `GET` | Paginated search, filter, and sort endpoints for candidate list. |
| `/api/candidates/[id]` | `GET`/`DELETE` | Retrieve detailed candidate profile, or delete a profile. |
| `/api/candidates/export` | `GET` | Export all processed candidates to a styled Excel Sheet. |
| `/api/dashboard/stats` | `GET` | Retrieves stats (Total Uploaded, Processed, Failed). |
