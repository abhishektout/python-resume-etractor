import os
import shutil
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, File, UploadFile, BackgroundTasks, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc
import openpyxl
from io import BytesIO
from dotenv import load_dotenv

# Load .env file explicitly
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

from .database import engine, Base, get_db
from .models import Candidate
from .schemas import LoginRequest, LoginResponse, CandidateResponse, DashboardStats
from .parser import extract_text
from .ai import parse_resume_with_grok

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TalentScan AI Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. In production, restrict to frontend url.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup upload directory and mount it for resume viewing
UPLOAD_DIR = "/home/oem/abhishek/extractor/backend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Groq API Key
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "mock")
logger.info(f"Loaded GROQ_API_KEY: {repr(GROQ_API_KEY)}")


# Simple mock admin user for auth
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Background task to process a single resume
async def process_resume_task(db_candidate_id: int, file_path: str, filename: str):
    # We must open a new db session inside the background task to avoid session conflicts
    from .database import SessionLocal
    db = SessionLocal()
    try:
        candidate = db.query(Candidate).filter(Candidate.id == db_candidate_id).first()
        if not candidate:
            logger.error(f"Candidate {db_candidate_id} not found in database.")
            return

        # 1. Read file bytes
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        # 2. Extract Text
        try:
            text = extract_text(file_bytes, filename)
        except Exception as parse_err:
            candidate.status = "failed"
            candidate.error_message = f"Text extraction failed: {str(parse_err)}"
            db.commit()
            logger.error(f"Failed to extract text from {filename}: {str(parse_err)}")
            return

        # 3. Call Groq API
        try:
            ai_data = await parse_resume_with_grok(text, GROQ_API_KEY)
        except Exception as ai_err:
            candidate.status = "failed"
            candidate.error_message = f"AI processing failed: {str(ai_err)}"
            db.commit()
            logger.error(f"Failed to process {filename} with AI: {str(ai_err)}")
            return

        # 4. Save Extracted Data
        candidate.name = ai_data.get("name")
        candidate.gender = ai_data.get("gender")
        candidate.email = ai_data.get("email")
        candidate.phone = ai_data.get("phone")
        candidate.address = ai_data.get("address")
        candidate.city = ai_data.get("city")
        candidate.state = ai_data.get("state")
        candidate.country = ai_data.get("country")
        candidate.experience = ai_data.get("experience")
        candidate.current_company = ai_data.get("current_company")
        candidate.designation = ai_data.get("designation")
        candidate.skills = ai_data.get("skills", [])
        candidate.education = ai_data.get("education", [])
        candidate.projects = ai_data.get("projects", [])
        candidate.certifications = ai_data.get("certifications", [])
        candidate.summary = ai_data.get("summary")
        
        candidate.status = "processed"
        candidate.error_message = None
        db.commit()
        logger.info(f"Successfully processed resume: {filename}")

    except Exception as e:
        logger.error(f"Error in background task for candidate {db_candidate_id}: {str(e)}")
        try:
            candidate = db.query(Candidate).filter(Candidate.id == db_candidate_id).first()
            if candidate:
                candidate.status = "failed"
                candidate.error_message = f"Unexpected processing error: {str(e)}"
                db.commit()
        except Exception as db_err:
            logger.error(f"Could not write failed status to DB: {str(db_err)}")
    finally:
        db.close()

# Auth Login Route
@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    if payload.username == ADMIN_USERNAME and payload.password == ADMIN_PASSWORD:
        return {"access_token": "talentscan_session_token_123", "token_type": "bearer"}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password"
    )

# Dashboard Stats Route
@app.get("/api/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_uploaded = db.query(Candidate).count()
    processed = db.query(Candidate).filter(Candidate.status == "processed").count()
    failed = db.query(Candidate).filter(Candidate.status == "failed").count()
    return {
        "total_uploaded": total_uploaded,
        "processed": processed,
        "failed": failed
    }

# Upload Resume Route
@app.post("/api/resumes/upload")
def upload_resumes(
    background_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...), 
    db: Session = Depends(get_db)
):
    results = []
    for file in files:
        # Validate extension
        ext = file.filename.split(".")[-1].lower()
        if ext not in ["pdf", "docx"]:
            results.append({"filename": file.filename, "status": "ignored", "error": "Only PDF and DOCX files are allowed."})
            continue

        # Save to disk
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        # Handle filename collisions
        base_name, extension = os.path.splitext(file.filename)
        counter = 1
        while os.path.exists(file_path):
            file_path = os.path.join(UPLOAD_DIR, f"{base_name}_{counter}{extension}")
            counter += 1
        
        actual_filename = os.path.basename(file_path)

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            results.append({"filename": file.filename, "status": "failed", "error": f"Failed to save file: {str(e)}"})
            continue

        # Create record in DB as "processing"
        candidate = Candidate(
            resume_filename=actual_filename,
            status="processing"
        )
        db.add(candidate)
        db.commit()
        db.refresh(candidate)

        # Trigger background task
        background_tasks.add_task(
            process_resume_task, 
            db_candidate_id=candidate.id, 
            file_path=file_path, 
            filename=actual_filename
        )
        results.append({"filename": actual_filename, "candidate_id": candidate.id, "status": "processing"})
        
    return {"results": results}

# List Candidates Route with Search, Sort, Filter, Pagination
@app.get("/api/candidates")
def list_candidates(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc")
):
    query = db.query(Candidate)

    # Filter by processing status
    if status:
        query = query.filter(Candidate.status == status)

    # Search filter across multiple columns
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Candidate.name.ilike(search_pattern),
                Candidate.email.ilike(search_pattern),
                Candidate.phone.ilike(search_pattern),
                Candidate.current_company.ilike(search_pattern),
                Candidate.designation.ilike(search_pattern),
                Candidate.experience.ilike(search_pattern),
                Candidate.skills.cast(String).ilike(search_pattern),
                Candidate.education.cast(String).ilike(search_pattern)
            )
        )

    # Count total matching candidates
    total = query.count()

    # Sort
    column = getattr(Candidate, sort_by, Candidate.created_at)
    if sort_order == "asc":
        query = query.order_by(asc(column))
    else:
        query = query.order_by(desc(column))

    # Pagination
    offset = (page - 1) * limit
    candidates = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "candidates": [CandidateResponse.from_orm(c) for c in candidates]
    }

# Export Candidates to Excel
@app.get("/api/candidates/export")
def export_candidates(db: Session = Depends(get_db)):
    candidates = db.query(Candidate).filter(Candidate.status == "processed").all()

    # Create new Excel workbook
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "TalentScan Candidates"

    # Define headers
    headers = [
        "ID", "Name", "Gender", "Email", "Phone", "Address", "City", "State", "Country",
        "Experience", "Current Company", "Designation", "Skills", "Education", "Projects", 
        "Certifications", "Summary", "Resume Filename", "Uploaded Date"
    ]
    ws.append(headers)

    # Populate workbook
    for candidate in candidates:
        # Format list types nicely for Excel
        skills_str = ", ".join(candidate.skills) if candidate.skills else ""
        
        # Education can be array of strings or dicts
        edu_list = []
        if candidate.education:
            for edu in candidate.education:
                if isinstance(edu, dict):
                    edu_str = f"{edu.get('degree','')} in {edu.get('major','')} from {edu.get('institution','')} ({edu.get('year','')})"
                    edu_list.append(edu_str)
                else:
                    edu_list.append(str(edu))
        education_str = "; ".join(edu_list)

        # Projects
        proj_list = []
        if candidate.projects:
            for proj in candidate.projects:
                if isinstance(proj, dict):
                    proj_str = f"{proj.get('name','')}: {proj.get('description','')}"
                    proj_list.append(proj_str)
                else:
                    proj_list.append(str(proj))
        projects_str = "; ".join(proj_list)

        # Certifications
        certs_str = ", ".join(candidate.certifications) if candidate.certifications else ""

        row = [
            candidate.id,
            candidate.name,
            candidate.gender,
            candidate.email,
            candidate.phone,
            candidate.address,
            candidate.city,
            candidate.state,
            candidate.country,
            candidate.experience,
            candidate.current_company,
            candidate.designation,
            skills_str,
            education_str,
            projects_str,
            certs_str,
            candidate.summary,
            candidate.resume_filename,
            candidate.created_at.strftime("%Y-%m-%d %H:%M:%S") if candidate.created_at else ""
        ]
        ws.append(row)

    # Save to a dynamic stream
    file_stream = BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)

    # Return Excel file response
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=talentscan_candidates.xlsx"}
    )

# Get Candidate details Route
@app.get("/api/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate

# Retry Candidate Parsing Route
@app.post("/api/candidates/{candidate_id}/retry")
def retry_candidate_parsing(
    candidate_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Reset status and clear old error messages
    candidate.status = "processing"
    candidate.error_message = None
    db.commit()
    db.refresh(candidate)
    
    file_path = os.path.join(UPLOAD_DIR, candidate.resume_filename)
    
    # Trigger background task again
    background_tasks.add_task(
        process_resume_task, 
        db_candidate_id=candidate.id, 
        file_path=file_path, 
        filename=candidate.resume_filename
    )
    return {"status": "processing", "candidate_id": candidate.id}

