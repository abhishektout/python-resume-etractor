export interface ParsedCandidate {
  name: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  experience: string | null;
  current_company: string | null;
  designation: string | null;
  skills: string[];
  education: any[];
  projects: any[];
  certifications: any[];
  summary: string | null;
}

const REQUIRED_STRUCTURE: ParsedCandidate = {
  name: null,
  gender: null,
  email: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  country: null,
  experience: null,
  current_company: null,
  designation: null,
  skills: [],
  education: [],
  projects: [],
  certifications: [],
  summary: null
};

export function cleanJsonString(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

export function generateMockJson(text: string): ParsedCandidate {
  // Regex helper for email
  const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : "unknown@example.com";

  // Regex helper for phone
  const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "+1-555-0199";

  // Guess name from first few non-empty lines
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let name = "John Doe";
  if (lines.length > 0) {
    for (const line of lines.slice(0, 5)) {
      if (!line.includes("@") && !/\d/.test(line) && line.length < 40) {
        name = line;
        break;
      }
    }
  }

  // Basic skill extraction
  const commonSkills = ["Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Java", "C++", 
                        "SQL", "PostgreSQL", "Docker", "AWS", "Git", "HTML", "CSS", "Tailwind", "FastAPI"];
  const foundSkills: string[] = [];
  for (const skill of commonSkills) {
    const regex = new RegExp(`\\b${skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      foundSkills.push(skill);
    }
  }
  if (foundSkills.length === 0) {
    foundSkills.push("Software Development", "Problem Solving");
  }

  // Basic education extraction
  const education: string[] = [];
  const eduKeywords = ["Bachelor", "Master", "B.S", "B.Tech", "M.Tech", "Ph.D", "Degree", "University", "College"];
  for (const line of lines) {
    if (eduKeywords.some(keyword => line.includes(keyword))) {
      education.push(line);
      if (education.length >= 3) {
        break;
      }
    }
  }
  if (education.length === 0) {
    education.push("Bachelor of Science in Computer Science");
  }

  // Experience extraction
  let experience = "3 years";
  const expMatch = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
  if (expMatch) {
    experience = `${expMatch[1]} years`;
  }

  // Designation & company
  let designation = "Software Engineer";
  let currentCompany = "Tech Solutions Inc.";
  for (const line of lines) {
    if (line.includes("Engineer") || line.includes("Developer") || line.includes("Manager") || line.includes("Analyst")) {
      if (!line.includes("Resume") && !line.includes("CV")) {
        designation = line;
        break;
      }
    }
  }

  // Summary
  const summary = `Experienced professional with expertise in ${foundSkills.slice(0, 4).join(", ")}. Proven track record of developing scalable applications.`;

  // Basic gender guess based on first name
  let gender = "Male";
  const firstName = name.split(" ")[0].toLowerCase();
  if (firstName.endsWith('a') || firstName.endsWith('i') || firstName.endsWith('ti') || firstName.endsWith('ya') || firstName.endsWith('ne') || firstName.endsWith('ee') || firstName.endsWith('ha') || firstName.endsWith('ka') || firstName.endsWith('shree')) {
    const maleFirstNames = ['soma', 'sonu', 'hari', 'ravi', 'ali', 'vijay', 'ajay'];
    if (!maleFirstNames.includes(firstName)) {
      gender = "Female";
    }
  }

  return {
    ...REQUIRED_STRUCTURE,
    name,
    gender,
    email,
    phone,
    experience,
    designation,
    current_company: currentCompany,
    skills: foundSkills,
    education,
    summary,
    projects: ["Automated Extraction System", "HR Portal Development"],
    certifications: ["AWS Cloud Practitioner"]
  };
}

export async function parseResumeWithGrok(text: string, apiKey: string): Promise<ParsedCandidate> {
  if (!apiKey || apiKey.trim() === "" || apiKey === "mock") {
    console.warn("Groq API key is set to mock or empty. Using local regex parser fallback.");
    return generateMockJson(text);
  }

  const prompt = `You are a precise resume parser. Extract the candidate's details from the resume text provided below.
Return ONLY valid JSON matching the following schema.
If any field is missing or not mentioned, set it to null.
Do not return Markdown. Do not return any explanation or introduction. Return only the JSON object.

JSON Schema:
{
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
}

Resume text:
--------------------
${text}
--------------------
`;

  const primaryModel = process.env.GROQ_COMPLEX_MODEL || "llama-3.3-70b-versatile";
  const fallbackModel = process.env.GROQ_SIMPLE_MODEL || "llama-3.1-8b-instant";

  const makeApiCall = async (modelName: string): Promise<ParsedCandidate> => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: "You are a specialized HR AI parser that only outputs raw JSON. Never output markdown codeblocks or conversational text. Respond ONLY with a JSON object matching the requested schema." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API returned status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    const rawContent = resJson.choices[0].message.content;
    const cleanedContent = cleanJsonString(rawContent);
    const parsedData = JSON.parse(cleanedContent);

    // Merge with REQUIRED_STRUCTURE to guarantee all keys exist
    const finalData = { ...REQUIRED_STRUCTURE };
    for (const key of Object.keys(REQUIRED_STRUCTURE) as Array<keyof ParsedCandidate>) {
      if (parsedData[key] !== undefined) {
        (finalData as any)[key] = parsedData[key];
      }
    }
    return finalData;
  };

  try {
    console.log(`Attempting to parse resume with primary model: ${primaryModel}`);
    return await makeApiCall(primaryModel);
  } catch (primaryErr: any) {
    console.warn(`Primary model ${primaryModel} failed. Falling back to ${fallbackModel}. Error: ${primaryErr.message}`);
    try {
      return await makeApiCall(fallbackModel);
    } catch (fallbackErr: any) {
      console.error(`Both primary and fallback models failed. Fallback error: ${fallbackErr.message}`);
      throw new Error(`Groq API call failed on both models. Primary (${primaryModel}): ${primaryErr.message}. Fallback (${fallbackModel}): ${fallbackErr.message}`);
    }
  }
}
