from pydantic import BaseModel, EmailStr
from typing import List, Dict, Any, Optional
from datetime import datetime

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str

class CandidateBase(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    experience: Optional[str] = None
    current_company: Optional[str] = None
    designation: Optional[str] = None
    skills: Optional[List[str]] = []
    education: Optional[List[Any]] = []
    projects: Optional[List[Any]] = []
    certifications: Optional[List[Any]] = []
    summary: Optional[str] = None

class CandidateCreate(CandidateBase):
    pass

class CandidateResponse(CandidateBase):
    id: int
    resume_filename: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_uploaded: int
    processed: int
    failed: int
