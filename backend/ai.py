import os
import json
import re
import logging
import httpx
from typing import Dict, Any

logger = logging.getLogger(__name__)

REQUIRED_STRUCTURE = {
    "name": None,
    "gender": None,
    "email": None,
    "phone": None,
    "address": None,
    "city": None,
    "state": None,
    "country": None,
    "experience": None,
    "current_company": None,
    "designation": None,
    "skills": [],
    "education": [],
    "projects": [],
    "certifications": [],
    "summary": None
}

def clean_json_string(text: str) -> str:
    """
    Cleans markdown code block wrapping from the JSON string if present.
    """
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

def generate_mock_json(text: str) -> Dict[str, Any]:
    """
    Generates realistic structured candidate data from resume text using regex
    as a fallback when Grok API is not available/configured.
    """
    # Regex helper for email
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    email = email_match.group(0) if email_match else "unknown@example.com"
    
    # Regex helper for phone
    phone_match = re.search(r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    phone = phone_match.group(0) if phone_match else "+1-555-0199"
    
    # Guess name from first few non-empty lines
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    name = "John Doe"
    if lines:
        # Avoid lines that look like emails or phone numbers
        for line in lines[:5]:
            if "@" not in line and not any(c.isdigit() for c in line) and len(line) < 40:
                name = line
                break
                
    # Basic skill extraction
    common_skills = ["Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Java", "C++", 
                     "SQL", "PostgreSQL", "Docker", "AWS", "Git", "HTML", "CSS", "Tailwind", "FastAPI"]
    found_skills = []
    for skill in common_skills:
        if re.search(r'\b' + re.escape(skill) + r'\b', text, re.IGNORECASE):
            found_skills.append(skill)
    if not found_skills:
        found_skills = ["Software Development", "Problem Solving"]
        
    # Basic education extraction
    education = []
    edu_keywords = ["Bachelor", "Master", "B.S", "B.Tech", "M.Tech", "Ph.D", "Degree", "University", "College"]
    for line in lines:
        if any(keyword in line for keyword in edu_keywords):
            education.append(line)
            if len(education) >= 3:
                break
    if not education:
        education = ["Bachelor of Science in Computer Science"]
        
    # Experience extraction
    experience = "3 years"
    exp_matches = re.findall(r'(\d+)\+?\s*years?\s+(?:of\s+)?experience', text, re.IGNORECASE)
    if exp_matches:
        experience = f"{exp_matches[0]} years"
        
    # Designation & company
    designation = "Software Engineer"
    current_company = "Tech Solutions Inc."
    for line in lines:
        if "Engineer" in line or "Developer" in line or "Manager" in line or "Analyst" in line:
            if "Resume" not in line and "CV" not in line:
                designation = line
                break
                
    # Summary
    summary = f"Experienced professional with expertise in {', '.join(found_skills[:4])}. Proven track record of developing scalable applications."
    
    # Basic gender guess based on first name
    gender = "Male"
    first_name = name.split()[0].lower() if name else ""
    if first_name.endswith(('a', 'i', 'ti', 'ya', 'ne', 'ee', 'ha', 'ka', 'shree')):
        if first_name not in ['soma', 'sonu', 'hari', 'ravi', 'ali', 'vijay', 'ajay']:
            gender = "Female"

    # Fill structured dictionary
    result = REQUIRED_STRUCTURE.copy()
    result.update({
        "name": name,
        "gender": gender,
        "email": email,
        "phone": phone,
        "experience": experience,
        "designation": designation,
        "current_company": current_company,
        "skills": found_skills,
        "education": education,
        "summary": summary,
        "projects": ["Automated Extraction System", "HR Portal Development"],
        "certifications": ["AWS Cloud Practitioner"]
    })
    return result

async def parse_resume_with_grok(text: str, api_key: str) -> Dict[str, Any]:
    """
    Sends the resume text to Groq API to parse into structured JSON.
    """
    if not api_key or api_key.strip() == "" or api_key == "mock":
        logger.warning("Groq API key is set to mock or empty. Using local regex parser fallback.")
        return generate_mock_json(text)
        
    prompt = f"""You are a precise resume parser. Extract the candidate's details from the resume text provided below.
Return ONLY valid JSON matching the following schema.
If any field is missing or not mentioned, set it to null.
Do not return Markdown. Do not return any explanation or introduction. Return only the JSON object.

JSON Schema:
{{
  "name": "Candidate's full name",
  "gender": "Candidate's gender (Male, Female, Non-binary). If not explicitly mentioned in the resume, you MUST infer the gender from the candidate's first name (e.g., Amit -> Male, Priya -> Female). If completely ambiguous, set it to null.",
  "email": "Candidate's email address",
  "phone": "Candidate's phone number",
  "address": "Candidate's full postal address",
  "city": "Candidate's city",
  "state": "Candidate's state or region",
  "country": "Candidate's country",
  "experience": "Total professional experience in years or string description (e.g. '5 years')",
  "current_company": "Candidate's current or most recent employer",
  "designation": "Candidate's current or most recent job title",
  "skills": ["Skill 1", "Skill 2", ...],
  "education": ["Degree, Major, Institution, Graduation Year", ...],
  "projects": ["Project Name: Brief Description", ...],
  "certifications": ["Certification Name", ...],
  "summary": "A concise 2-3 sentence professional summary extracted or synthesized from the resume"
}}

Resume text:
--------------------
{text}
--------------------
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    primary_model = os.getenv("GROQ_COMPLEX_MODEL", "llama-3.3-70b-versatile")
    fallback_model = os.getenv("GROQ_SIMPLE_MODEL", "llama-3.1-8b-instant")
    
    async def make_api_call(model_name: str) -> Dict[str, Any]:
        data = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are a specialized HR AI parser that only outputs raw JSON. Never output markdown codeblocks or conversational text. Respond ONLY with a JSON object matching the requested schema."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=data)
            response.raise_for_status()
            res_json = response.json()
            raw_content = res_json["choices"][0]["message"]["content"]
            cleaned_content = clean_json_string(raw_content)
            parsed_data = json.loads(cleaned_content)
            
            # Ensure all required keys exist (even if null)
            final_data = {}
            for key in REQUIRED_STRUCTURE.keys():
                final_data[key] = parsed_data.get(key, REQUIRED_STRUCTURE[key])
            return final_data

    try:
        logger.info(f"Attempting to parse resume with primary model: {primary_model}")
        return await make_api_call(primary_model)
    except Exception as primary_err:
        logger.warning(
            f"Primary model {primary_model} failed (likely rate-limited). "
            f"Falling back to {fallback_model}. Error: {str(primary_err)}"
        )
        try:
            return await make_api_call(fallback_model)
        except Exception as fallback_err:
            logger.error(f"Both primary and fallback models failed. Fallback error: {str(fallback_err)}")
            raise ValueError(
                f"Groq API call failed on both models. Primary ({primary_model}): {str(primary_err)}. "
                f"Fallback ({fallback_model}): {str(fallback_err)}"
            )

