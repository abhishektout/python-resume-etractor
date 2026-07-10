"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Download, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  Award, 
  GraduationCap, 
  Code, 
  FileText, 
  Calendar,
  AlertTriangle,
  Clock,
  Sparkles
} from "lucide-react";

interface Candidate {
  id: number;
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
  resume_filename: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function CandidateDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authenticate
  useEffect(() => {
    const token = localStorage.getItem("talentscan_token");
    if (!token) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Fetch Candidate details
  useEffect(() => {
    if (!isAuthenticated || !id) return;
    
    const fetchCandidate = async () => {
      setLoading(true);
      const API_BASE = typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : "http://localhost:8000";
      try {
        const response = await fetch(`${API_BASE}/api/candidates/${id}`);
        if (!response.ok) {
          throw new Error("Candidate not found or server error");
        }
        const data = await response.json();
        setCandidate(data);
      } catch (err: any) {
        setError(err.message || "Failed to load candidate details.");
      } finally {
        setLoading(false);
      }
    };

    fetchCandidate();
  }, [id, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <Clock className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 gap-3 text-slate-400">
        <Clock className="h-8 w-8 animate-spin text-indigo-500" />
        <span>Loading Candidate Profile...</span>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 gap-4 text-slate-400 px-4">
        <AlertTriangle className="h-12 w-12 text-rose-500" />
        <h3 className="text-xl font-bold text-white">Error Loading Profile</h3>
        <p className="text-center text-sm text-slate-500 max-w-md">{error || "The candidate profile could not be found."}</p>
        <button 
          onClick={() => router.push("/")}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>
    );
  }

  const API_BASE = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";

  const isPdf = candidate.resume_filename?.toLowerCase().endsWith(".pdf");
  const resumeUrl = candidate.resume_filename 
    ? `${API_BASE}/uploads/${candidate.resume_filename}` 
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Detail Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <button 
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-slate-450 hover:text-white transition text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Dashboard</span>
          </button>
          
          <div className="flex gap-3">
            {resumeUrl && (
              <a 
                href={resumeUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                <Download className="h-4 w-4" />
                <span>Original File</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Extracted AI Details */}
        <section className="lg:col-span-7 space-y-6">
          
          {/* Header Card */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {candidate.name || <span className="text-slate-650 italic">Name Not Extracted</span>}
                </h1>
                <p className="text-slate-400 text-lg font-medium mt-1">
                  {candidate.designation || "Software Engineer"} {candidate.current_company ? `at ${candidate.current_company}` : ""}
                </p>
                {candidate.experience && (
                  <div className="inline-flex items-center gap-1.5 mt-2 text-sm text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                    <Briefcase className="h-4 w-4" />
                    <span>{candidate.experience} Experience</span>
                  </div>
                )}
              </div>
              <div>
                {candidate.status === "failed" ? (
                  <span className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-500 font-semibold px-3 py-1 rounded-full">
                    Extraction Failed
                  </span>
                ) : candidate.status === "processing" ? (
                  <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-semibold px-3 py-1 rounded-full animate-pulse">
                    AI Processing
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold px-3 py-1 rounded-full">
                    Extracted Profile
                  </span>
                )}
              </div>
            </div>

            {/* Contacts & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-350 pt-2 border-t border-slate-900">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500" />
                <span>{candidate.email || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <span>{candidate.phone || "N/A"}</span>
              </div>
              <div className="flex items-start gap-2 md:col-span-2">
                <MapPin className="h-4 w-4 text-slate-500 mt-0.5" />
                <span>
                  {candidate.address 
                    ? candidate.address 
                    : [candidate.city, candidate.state, candidate.country].filter(Boolean).join(", ") || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>AI Executive Summary</span>
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {candidate.summary || "No executive summary parsed by the AI."}
            </p>
          </div>

          {/* Skills */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Code className="h-4 w-4 text-indigo-400" />
              <span>Skills & Expertise</span>
            </h3>
            {candidate.skills && candidate.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((skill, index) => (
                  <span 
                    key={index}
                    className="text-xs bg-slate-900 border border-slate-800 text-slate-200 px-3 py-1.5 rounded-lg font-medium hover:border-indigo-500/50 transition cursor-default"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No skills extracted.</p>
            )}
          </div>

          {/* Education */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-indigo-400" />
              <span>Education History</span>
            </h3>
            {candidate.education && candidate.education.length > 0 ? (
              <div className="space-y-3">
                {candidate.education.map((edu, index) => {
                  const eduStr = typeof edu === "object" 
                    ? `${edu.degree || edu.major || "Degree"} - ${edu.institution || "Institution"} (${edu.year || ""})`
                    : edu;
                  return (
                    <div key={index} className="text-sm border-l-2 border-slate-800 pl-4 py-1 hover:border-indigo-500 transition">
                      <p className="text-slate-200 font-medium">{eduStr}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No education details extracted.</p>
            )}
          </div>

          {/* Projects */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-indigo-400" />
              <span>Projects</span>
            </h3>
            {candidate.projects && candidate.projects.length > 0 ? (
              <div className="space-y-4">
                {candidate.projects.map((proj, index) => {
                  const hasDetails = typeof proj === "object";
                  const name = hasDetails ? proj.name : proj;
                  const desc = hasDetails ? proj.description : null;
                  return (
                    <div key={index} className="space-y-1 text-sm border-l-2 border-slate-800 pl-4 py-1 hover:border-indigo-500 transition">
                      <p className="text-slate-200 font-semibold">{name}</p>
                      {desc && <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No projects extracted.</p>
            )}
          </div>

          {/* Certifications */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Award className="h-4 w-4 text-indigo-400" />
              <span>Certifications</span>
            </h3>
            {candidate.certifications && candidate.certifications.length > 0 ? (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-350 list-none pl-0">
                {candidate.certifications.map((cert, index) => (
                  <li key={index} className="flex items-center gap-2 bg-slate-900/40 p-2 rounded-lg border border-slate-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    <span>{cert}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 italic">No certifications extracted.</p>
            )}
          </div>

        </section>

        {/* Right Side: Resume Live Preview */}
        <section className="lg:col-span-5 flex flex-col h-[600px] lg:h-auto">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-5 flex flex-col h-full overflow-hidden min-h-[500px]">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2 shrink-0">
              <FileText className="h-4 w-4 text-indigo-400" />
              <span>Document Preview</span>
            </h3>
            
            <div className="flex-1 bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center border border-slate-900">
              {resumeUrl ? (
                isPdf ? (
                  <iframe 
                    src={resumeUrl}
                    className="w-full h-full bg-slate-950" 
                    title="Resume PDF Preview"
                  />
                ) : (
                  <div className="text-center p-6 space-y-4">
                    <div className="h-16 w-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                      <FileText className="h-8 w-8 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-semibold text-white">{candidate.resume_filename}</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto">
                        In-browser preview is only supported for PDF files. This is a DOCX file.
                      </p>
                    </div>
                    <a 
                      href={resumeUrl}
                      download
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-500/20"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download DOCX File</span>
                    </a>
                  </div>
                )
              ) : (
                <p className="text-sm text-slate-500 italic">No resume file attached.</p>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
