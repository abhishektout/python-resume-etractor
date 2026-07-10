import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from .database import Base

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    
    # Contact Info
    name = Column(String, nullable=True, index=True)
    gender = Column(String, nullable=True)
    email = Column(String, nullable=True, index=True)
    phone = Column(String, nullable=True)
    
    # Location Info
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True)
    
    # Professional Info
    experience = Column(String, nullable=True)
    current_company = Column(String, nullable=True)
    designation = Column(String, nullable=True)
    
    # Lists stored as JSON
    skills = Column(JSON, default=list)          # ["Python", "Next.js", ...]
    education = Column(JSON, default=list)       # [{"degree": "...", "institution": "...", "year": "..."}]
    projects = Column(JSON, default=list)        # [{"name": "...", "description": "..."}]
    certifications = Column(JSON, default=list)  # ["AWS Certified", ...]
    
    # Summary
    summary = Column(Text, nullable=True)
    
    # Metadata
    resume_filename = Column(String, nullable=True)
    status = Column(String, default="processing") # "processing", "processed", "failed"
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
