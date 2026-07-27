"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  UserCheck,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Users,
  Trash2
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
  extracted_by: string | null;
  resume_filename: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const formatExperience = (exp: string | null): string => {
  if (!exp) return "Fresher";
  const clean = exp.trim().toLowerCase();
  if (["", "-", "0", "0 years", "0 year", "fresher", "none", "no experience", "null"].includes(clean)) {
    return "Fresher";
  }
  if (/^\d+$/.test(clean)) {
    return `${clean} years`;
  }
  return exp;
};

interface Stats {
  total_uploaded: number;
  processed: number;
  failed: number;
}

export default function DashboardPage() {
  const router = useRouter();

  const API_BASE = "";

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Stats and Table State
  const [stats, setStats] = useState<Stats>({ total_uploaded: 0, processed: 0, failed: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // Upload Queue State
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ filename: string; status: string; candidate_id?: number; error?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Authenticate
  useEffect(() => {
    const token = localStorage.getItem("talentscan_token");
    if (!token) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Fetch Dashboard Stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  // Fetch Candidates Table
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (search) queryParams.append("search", search);
      if (statusFilter) queryParams.append("status", statusFilter);

      const response = await fetch(`${API_BASE}/api/candidates?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setCandidates(data.candidates);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch candidates:", err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, sortBy, sortOrder]);

  // Initial Fetch & polling if there are files in "processing" state
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchCandidates();
    }
  }, [isAuthenticated, fetchStats, fetchCandidates]);

  // Auto-refresh when files are processing
  useEffect(() => {
    if (!isAuthenticated) return;
    const hasProcessing = candidates.some((c) => c.status === "processing") ||
      uploadQueue.some((q) => q.status === "processing");

    if (hasProcessing) {
      const interval = setInterval(() => {
        fetchStats();
        fetchCandidates();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, candidates, uploadQueue, fetchStats, fetchCandidates]);

  // Poll status of processing files in the queue
  useEffect(() => {
    const processingItems = uploadQueue.filter((item) => item.status === "processing" && item.candidate_id);
    if (processingItems.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const nextQueue = await Promise.all(
        uploadQueue.map(async (item) => {
          if (item.status === "processing" && item.candidate_id) {
            try {
              const res = await fetch(`${API_BASE}/api/candidates/${item.candidate_id}`);
              if (res.ok) {
                const candidate = await res.json();
                if (candidate && (candidate.status === "processed" || candidate.status === "failed")) {
                  changed = true;
                  return {
                    ...item,
                    status: candidate.status,
                    error: candidate.error_message || undefined
                  };
                }
              }
            } catch (err) {
              console.error(`Failed to poll status for candidate ${item.candidate_id}:`, err);
            }
          }
          return item;
        })
      );

      if (changed) {
        setUploadQueue(nextQueue);
        fetchStats();
        fetchCandidates();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [uploadQueue, fetchStats, fetchCandidates]);

  // Logout Handler
  const handleLogout = () => {
    localStorage.removeItem("talentscan_token");
    router.push("/login");
  };

  // Upload handler — chunked batch upload (20 files per request)
  // Handles 500+ resumes without browser/server timeout
  const BATCH_SIZE = 20;

  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0) return;
    setUploading(true);
    setBatchProgress(null);

    const validFiles: File[] = [];
    const ignoredItems: { filename: string; status: string; error: string }[] = [];

    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf" || ext === "docx" || ext === "jpg" || ext === "jpeg" || ext === "png") {
        validFiles.push(file);
      } else {
        ignoredItems.push({
          filename: file.name,
          status: "failed",
          error: "Only PDF, DOCX, and JPG/JPEG/PNG files are allowed."
        });
      }
    });

    if (ignoredItems.length > 0) {
      setUploadQueue((prev) => [...ignoredItems, ...prev]);
    }

    if (validFiles.length === 0) {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Add all files as placeholders upfront
    const newItems = validFiles.map((f) => ({ filename: f.name, status: "processing" }));
    setUploadQueue((prev) => [...newItems, ...prev]);

    // Split into chunks of BATCH_SIZE
    const batches: File[][] = [];
    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
      batches.push(validFiles.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;
    setBatchProgress({ current: 0, total: totalBatches });

    // Upload each batch sequentially
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      setBatchProgress({ current: batchIdx + 1, total: totalBatches });

      const formData = new FormData();
      batch.forEach((file) => formData.append("files", file));

      try {
        const response = await fetch(`${API_BASE}/api/resumes/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error(`Batch ${batchIdx + 1} upload failed`);

        const data = await response.json();

        // Update queue items for this batch with real candidate_ids
        setUploadQueue((prev) => {
          return prev.map((item) => {
            const matched = data.results.find(
              (res: any) => res.filename.startsWith(item.filename.split(".")[0]) && item.status === "processing"
            );
            if (matched) {
              return {
                filename: matched.filename,
                status: matched.status,
                candidate_id: matched.candidate_id,
                error: matched.error
              };
            }
            return item;
          });
        });

      } catch (err: any) {
        // Mark this batch's files as failed
        const batchNames = new Set(batch.map((f) => f.name));
        setUploadQueue((prev) =>
          prev.map((item) =>
            batchNames.has(item.filename) && item.status === "processing"
              ? { ...item, status: "failed", error: err.message || "Upload failed" }
              : item
          )
        );
      }

      // Refresh after each batch
      fetchStats();
      fetchCandidates();
    }

    setUploading(false);
    setBatchProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag and Drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Excel Export trigger
  const handleExportExcel = () => {
    window.open(`${API_BASE}/api/candidates/export`, "_blank");
  };

  // Delete handler
  const handleDelete = async (candidateId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this candidate?")) return;
    try {
      const response = await fetch(`${API_BASE}/api/candidates/${candidateId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        fetchStats();
        fetchCandidates();
      } else {
        console.error("Failed to delete candidate");
      }
    } catch (err) {
      console.error("Error deleting candidate:", err);
    }
  };

  // Retry parsing trigger
  const handleRetry = async (candidateId: number) => {
    // Optimistically update candidate status to 'processing'
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: "processing", error_message: null } : c))
    );
    setStats((prev) => ({
      ...prev,
      failed: Math.max(0, prev.failed - 1)
    }));

    try {
      const response = await fetch(`${API_BASE}/api/candidates/${candidateId}/retry`, {
        method: "POST"
      });
      if (response.ok) {
        setTimeout(() => {
          fetchStats();
          fetchCandidates();
        }, 1000);
      } else {
        console.error("Failed to retry candidate parsing");
      }
    } catch (err) {
      console.error("Error retrying candidate parsing:", err);
    }
  };

  // Retry all failed candidates
  const handleRetryAllFailed = async () => {
    const failedCandidates = candidates.filter((c) => c.status === "failed");
    if (failedCandidates.length === 0) return;

    // Optimistically update all failed candidates to 'processing'
    setCandidates((prev) =>
      prev.map((c) => (c.status === "failed" ? { ...c, status: "processing", error_message: null } : c))
    );
    // Optimistically update failed resumes count
    setStats((prev) => ({
      ...prev,
      failed: Math.max(0, prev.failed - failedCandidates.length)
    }));

    try {
      // Trigger all retries in parallel without blocking the UI thread
      failedCandidates.forEach((c) => {
        fetch(`${API_BASE}/api/candidates/${c.id}/retry`, { method: "POST" }).catch((err) => {
          console.error(`Failed to retry candidate ${c.id}:`, err);
        });
      });

      // Refresh data after a brief delay
      setTimeout(() => {
        fetchStats();
        fetchCandidates();
      }, 1200);
    } catch (err) {
      console.error("Error retrying all failed candidates:", err);
    }
  };

  // Column Sorter trigger
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <Clock className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow shadow-indigo-500/20">
                <span className="font-bold text-white text-lg">TS</span>
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  TalentScan AI
                </span>
                <span className="ml-2 text-xs text-slate-500 px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900">
                  v1.0.0
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8 space-y-8">

        {/* Top Summary Metrics */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-900 bg-slate-900/30 p-6 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm font-medium text-slate-400">Total Uploaded Resumes</p>
              <h3 className="mt-1 text-3xl font-bold text-white">{stats.total_uploaded}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300">
              <Users className="h-6 w-6" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-900/30 p-6 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm font-medium text-slate-400">Processed Resumes</p>
              <h3 className="mt-1 text-3xl font-bold text-indigo-400">{stats.processed}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-indigo-950/30 border border-indigo-900/50 flex items-center justify-center text-indigo-400">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-900/30 p-6 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm font-medium text-slate-400">Failed Resumes</p>
              <h3 className="mt-1 text-3xl font-bold text-rose-500">{stats.failed}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-rose-950/30 border border-rose-900/50 flex items-center justify-center text-rose-500">
              <XCircle className="h-6 w-6" />
            </div>
          </div>
        </section>

        {/* Upload Area & Queue */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Drag & Drop Area */}
          <div className="lg:col-span-2">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 cursor-pointer transition text-center h-full min-h-[220px] ${isDragOver
                ? "border-indigo-500 bg-indigo-500/5 text-white"
                : "border-slate-850 bg-slate-900/20 hover:border-slate-700 hover:bg-slate-900/30 text-slate-400"
                }`}
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx,image/jpeg,image/png,.jpg,.jpeg,.png"
                className="hidden"
              />
              <div className="rounded-full bg-slate-900 p-4 border border-slate-800 shadow-inner mb-4">
                <Upload className={`h-8 w-8 ${isDragOver ? "text-indigo-400 animate-bounce" : "text-slate-400"}`} />
              </div>
              <h4 className="text-base font-semibold text-white">Upload 500+ resumes at once</h4>
              <p className="mt-1 text-sm text-slate-500 max-w-sm">
                Drag and drop PDF, DOCX, or JPG/PNG image files here, or click to browse. Files are uploaded in smart batches automatically.
              </p>
              {batchProgress && (
                <div className="mt-4 w-full max-w-xs">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Uploading batch {batchProgress.current} of {batchProgress.total}</span>
                    <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>


        </section>

        {/* Candidate Table Section */}
        <section className="rounded-2xl border border-slate-900 bg-slate-900/20 shadow-xl overflow-hidden">

          {/* Table Toolbar */}
          <div className="p-5 border-b border-slate-900 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-900/40">
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">

              {/* Search input */}
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name, company, skill, email..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Status Filter */}
              <div className="relative shrink-0">
                <Filter className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-8 py-2 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="processed">Processed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Page Size Select */}
              <div className="relative shrink-0">
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

            </div>

            {/* Export & Refresh */}
            <div className="flex gap-3 w-full sm:w-auto justify-end">
              {candidates.some(c => c.status === 'failed') && (
                <button
                  onClick={handleRetryAllFailed}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition shadow shadow-indigo-500/10"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry All Failed</span>
                </button>
              )}

              <button
                onClick={() => { fetchStats(); fetchCandidates(); }}
                className="p-2 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white transition"
                title="Refresh Table"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition shadow shadow-emerald-500/10"
              >
                <Download className="h-4 w-4" />
                <span>Export to Excel</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-900">
                <tr>
                  <th className="p-4 cursor-pointer hover:text-white transition select-none" onClick={() => handleSort("name")}>
                    <div className="flex items-center gap-1">
                      <span>Name</span>
                      <ArrowUpDown className="h-3 w-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="p-4">Gender</th>
                  <th className="p-4 cursor-pointer hover:text-white transition select-none" onClick={() => handleSort("experience")}>
                    <div className="flex items-center gap-1">
                      <span>Experience</span>
                      <ArrowUpDown className="h-3 w-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="p-4">Skills</th>
                  <th className="p-4">Education</th>
                  <th className="p-4">Address</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Current Company</th>
                  <th className="p-4 max-w-[200px]">AI Summary</th>
                  {/* <th className="p-4">Extracted By</th> */}
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 bg-slate-950/20">
                {loading && candidates.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Clock className="h-6 w-6 animate-spin text-indigo-500" />
                        <span>Loading candidates...</span>
                      </div>
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-500">
                      No candidates found. Upload resumes to see them here.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/candidates/${c.id}`)}
                      className="hover:bg-slate-900/40 cursor-pointer transition border-b border-slate-900/40 group"
                    >
                      <td className="p-4 font-semibold text-white group-hover:text-indigo-400 transition">
                        {c.name ? c.name : (
                          c.status === "processing" ? (
                            <span className="text-slate-600 italic font-normal">Extracting...</span>
                          ) : (
                            <span className="text-slate-500 italic font-normal">Name Not Extracted</span>
                          )
                        )}
                      </td>
                      <td className="p-4 text-slate-355">{c.gender || "-"}</td>
                      <td className="p-4 text-slate-300">{formatExperience(c.experience)}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {c.skills && c.skills.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                          {c.skills && c.skills.length > 3 && (
                            <span className="text-[10px] text-slate-500 px-1 py-0.5">
                              +{c.skills.length - 3} more
                            </span>
                          )}
                          {!c.skills || c.skills.length === 0 && "-"}
                        </div>
                      </td>
                      <td className="p-4 text-slate-350 truncate max-w-[150px]" title={
                        c.education?.map((e: any) => typeof e === "object" ? `${e.degree || ""} from ${e.institution || ""}` : e).join(", ")
                      }>
                        {c.education && c.education.length > 0
                          ? (typeof c.education[0] === "object"
                            ? `${c.education[0].degree || c.education[0].major || "Degree"}`
                            : c.education[0])
                          : "-"}
                      </td>
                      <td className="p-4 text-slate-350 truncate max-w-[130px]">{c.city ? `${c.city}, ${c.country || ''}` : c.address || "-"}</td>
                      <td className="p-4 text-slate-300 truncate max-w-[120px]">{c.email || "-"}</td>
                      <td className="p-4 text-slate-350 whitespace-nowrap">{c.phone || "-"}</td>
                      <td className="p-4 text-slate-300 truncate max-w-[130px]" title={c.current_company || ""}>
                        {c.current_company || "-"}
                      </td>
                      <td className="p-4 text-slate-400 max-w-[200px] truncate" title={c.summary || ""}>
                        {c.summary || "-"}
                      </td>
                      {/* <td className="p-4">
                        {c.extracted_by ? (
                          <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${c.extracted_by.includes('paid')
                            ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                            : c.extracted_by.includes('gemini')
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                              : c.extracted_by.includes('groq')
                                ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                                : 'bg-slate-700/40 border-slate-600 text-slate-400'
                            }`}>
                            {c.extracted_by}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td> */}
                      <td className="p-4">
                        {c.status === "processed" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Processed</span>
                          </span>
                        )}
                        {c.status === "processing" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                            <RefreshCw className="h-3 w-3 animate-spin text-indigo-400" />
                            <span>Processing</span>
                          </span>
                        )}
                        {c.status === "failed" && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full" title={c.error_message || ""}>
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              <span>Failed</span>
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetry(c.id);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600/30 border border-indigo-500/20 px-2 py-0.5 rounded transition"
                              title="Retry parsing this resume"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              <span>Retry</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={(e) => handleDelete(c.id, e)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600/30 border border-rose-500/20 px-2 py-0.5 rounded transition"
                          title="Delete this candidate"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-900 bg-slate-900/20 flex items-center justify-between text-sm text-slate-450">
            <span>
              Showing <span className="font-semibold text-white">{candidates.length}</span> of{" "}
              <span className="font-semibold text-white">{total}</span> candidates
            </span>

            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex items-center px-3 text-xs border border-slate-800 bg-slate-950 rounded-lg text-slate-300">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-900 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
