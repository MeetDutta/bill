"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  FileCheck,
  Table as TableIcon,
  Trash2,
  Loader2,
  ShieldAlert,
  Info,
  Database,
  Users,
  Boxes,
  Truck,
  Receipt,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { migrationApi } from "@/services/api";

interface TargetField {
  key: string;
  label: string;
  required: boolean;
}

interface MigrationJob {
  id: string;
  file_name: string;
  entity_type: string;
  status: string;
  duplicate_strategy: string;
  raw_headers: string[];
  sample_rows: Record<string, string>[];
  column_mapping: Record<string, string>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  new_items_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  validation_errors: { row: number; error: string; data?: Record<string, string> }[];
  import_report: {
    entity_type?: string;
    total_rows?: number;
    imported_count?: number;
    skipped_count?: number;
    failed_count?: number;
    created_summary?: Record<string, number>;
    row_errors?: { row: number; error: string }[];
    completed_at?: string;
  };
  target_fields: TargetField[];
  suggested_mapping: Record<string, string>;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

const ENTITY_CONFIGS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  products: {
    label: "Products & Inventory",
    icon: Boxes,
    desc: "Import product catalog, selling prices, cost prices, opening stock, barcodes, HSN codes, and units.",
  },
  customers: {
    label: "Customers",
    icon: Users,
    desc: "Import customer directory with mobile numbers, names, billing addresses, GSTIN, and opening balances.",
  },
  categories: {
    label: "Product Categories",
    icon: Tag,
    desc: "Import category taxonomy and departmental groupings.",
  },
  opening_stock: {
    label: "Opening Stock Intake",
    icon: Database,
    desc: "Assign initial inventory counts to existing products with full audit ledger tracking.",
  },
  suppliers: {
    label: "Suppliers & Vendors",
    icon: Truck,
    desc: "Import vendor directories, contact details, phone numbers, and GSTIN.",
  },
  invoices: {
    label: "Historical Invoices",
    icon: Receipt,
    desc: "Import past sales invoices, totals, dates, and customer order records.",
  },
};

export default function POSMigrationPage() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [entityType, setEntityType] = useState<string>("products");
  const [duplicateStrategy, setDuplicateStrategy] = useState<string>("skip");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [activeJob, setActiveJob] = useState<MigrationJob | null>(null);
  const [pastJobs, setPastJobs] = useState<MigrationJob[]>([]);
  const [loadingPastJobs, setLoadingPastJobs] = useState(false);

  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPastJobs = async () => {
    setLoadingPastJobs(true);
    try {
      const res = await migrationApi.listJobs();
      setPastJobs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load past migration jobs:", err);
    } finally {
      setLoadingPastJobs(false);
    }
  };

  useEffect(() => {
    loadPastJobs();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setUploadError("Please upload a valid CSV file.");
        return;
      }
      setSelectedFile(file);
      setUploadError("");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a CSV file to upload.");
      return;
    }
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("entity_type", entityType);
    formData.append("duplicate_strategy", duplicateStrategy);

    try {
      const res = await migrationApi.upload(formData);
      const job: MigrationJob = res.data;
      setActiveJob(job);
      setColumnMapping(job.column_mapping || job.suggested_mapping || {});
      setCurrentStep(2); // Move to Preview
      loadPastJobs();
    } catch (err: any) {
      const detail = err.response?.data?.error || err.response?.data?.detail || "Upload failed. Check CSV format.";
      setUploadError(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleValidate = async () => {
    if (!activeJob) return;
    setValidating(true);
    try {
      const res = await migrationApi.validateJob(activeJob.id, {
        column_mapping: columnMapping,
        duplicate_strategy: duplicateStrategy,
      });
      setActiveJob(res.data);
      setCurrentStep(4); // Move to Validation Results
    } catch (err: any) {
      alert(err.response?.data?.error || "Validation failed.");
    } finally {
      setValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!activeJob) return;
    setImporting(true);
    try {
      const res = await migrationApi.executeJob(activeJob.id);
      setActiveJob(res.data);
      setCurrentStep(7); // Move to Final Report
      loadPastJobs();
    } catch (err: any) {
      alert(err.response?.data?.error || "Import failed. Transaction rolled back.");
      if (err.response?.data?.job) {
        setActiveJob(err.response.data.job);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleRollback = async (jobId: string) => {
    if (!confirm("Are you sure you want to roll back this import? All records created by this migration job will be deleted.")) {
      return;
    }
    setRollingBack(true);
    try {
      const res = await migrationApi.rollbackJob(jobId);
      if (activeJob && activeJob.id === jobId) {
        setActiveJob(res.data);
      }
      alert("Migration job successfully rolled back.");
      loadPastJobs();
    } catch (err: any) {
      alert(err.response?.data?.error || "Rollback failed.");
    } finally {
      setRollingBack(false);
    }
  };

  const startNewJob = () => {
    setActiveJob(null);
    setSelectedFile(null);
    setUploadError("");
    setColumnMapping({});
    setConfirmImport(false);
    setCurrentStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <span>POS Data Migration Wizard</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Migrate Products, Opening Stock, Customers, Categories, and Historical Invoices from legacy POS systems.
          </p>
        </div>
        {activeJob && (
          <Button variant="outline" size="sm" onClick={startNewJob} className="gap-1.5 self-start sm:self-auto">
            <RotateCcw className="h-3.5 w-3.5" />
            <span>New Migration</span>
          </Button>
        )}
      </div>

      {/* 7-Step Progress Stepper Bar */}
      <div className="border rounded-lg bg-card p-3 overflow-x-auto shadow-xs">
        <div className="flex items-center min-w-[720px] justify-between text-xs font-semibold">
          {[
            { step: 1, title: "1. Upload CSV" },
            { step: 2, title: "2. Preview Data" },
            { step: 3, title: "3. Map Columns" },
            { step: 4, title: "4. Validate" },
            { step: 5, title: "5. Confirm" },
            { step: 6, title: "6. Import" },
            { step: 7, title: "7. Report" },
          ].map((s, idx, arr) => (
            <React.Fragment key={s.step}>
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors",
                  currentStep === s.step
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : currentStep > s.step
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground opacity-60"
                )}
              >
                {currentStep > s.step ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full flex items-center justify-center text-[10px]",
                      currentStep === s.step ? "bg-white text-primary font-bold" : "border"
                    )}
                  >
                    {s.step}
                  </span>
                )}
                <span>{s.title}</span>
              </div>
              {idx < arr.length - 1 && <span className="text-muted-foreground/40 font-mono text-xs">→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: UPLOAD                                                            */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 1 — Choose Entity & Upload Old POS CSV</CardTitle>
              <CardDescription className="text-xs">
                Select the data type you are importing and choose an extracted CSV file from your previous POS software.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Entity Type Selector */}
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                  Select Data Type to Import *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(ENTITY_CONFIGS).map(([key, item]) => {
                    const Icon = item.icon;
                    const isSelected = entityType === key;
                    return (
                      <div
                        key={key}
                        onClick={() => setEntityType(key)}
                        className={cn(
                          "p-3.5 rounded-lg border cursor-pointer transition-all space-y-1.5",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                            : "hover:border-primary/50 hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                          <h4 className="font-bold text-xs text-foreground">{item.label}</h4>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Duplicate Strategy Option */}
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                  Duplicate Resolution Strategy
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { key: "skip", label: "Skip Duplicates (Safe)", desc: "Existing SKUs or phone numbers are left untouched." },
                    { key: "update", label: "Update Existing", desc: "Overwrites prices, categories, or addresses of existing records." },
                    { key: "error", label: "Fail on Duplicate", desc: "Aborts the migration if any duplicate record is detected." },
                  ].map((s) => (
                    <label
                      key={s.key}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer space-y-1 flex items-start gap-2.5",
                        duplicateStrategy === s.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/30"
                      )}
                    >
                      <input
                        type="radio"
                        name="dup_strategy"
                        value={s.key}
                        checked={duplicateStrategy === s.key}
                        onChange={(e) => setDuplicateStrategy(e.target.value)}
                        className="mt-0.5 text-primary"
                      />
                      <div>
                        <span className="font-bold text-foreground block">{s.label}</span>
                        <span className="text-[11px] text-muted-foreground block">{s.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* File Upload Drop Area */}
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                  Upload CSV File *
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-all space-y-2 bg-muted/10"
                >
                  <UploadCloud className="h-10 w-10 text-primary mx-auto" />
                  <p className="text-xs font-semibold text-foreground">
                    {selectedFile ? selectedFile.name : "Click to browse or drag and drop your CSV file here"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Supports CSV UTF-8, Latin-1, and standard comma or tab separated files.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
                {uploadError && (
                  <p className="text-xs text-destructive font-medium mt-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{uploadError}</span>
                  </p>
                )}
              </div>

              {/* Upload Button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                  className="gap-2 px-6 font-semibold shadow-sm"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Uploading & Parsing...</span>
                    </>
                  ) : (
                    <>
                      <span>Upload & Proceed to Preview</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Past Migration Jobs Log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                <span>Migration History & Rollback Logs</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Review previous import runs and execute safe rollbacks if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPastJobs ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-primary" />
                  Loading past jobs...
                </div>
              ) : pastJobs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No previous migration jobs found.</p>
              ) : (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Entity</th>
                        <th className="p-2.5">File Name</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Imported</th>
                        <th className="p-2.5 text-right">Skipped</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pastJobs.map((j) => (
                        <tr key={j.id} className="hover:bg-muted/20">
                          <td className="p-2.5 whitespace-nowrap text-muted-foreground">
                            {new Date(j.created_at).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-bold uppercase text-foreground">
                            {ENTITY_CONFIGS[j.entity_type]?.label || j.entity_type}
                          </td>
                          <td className="p-2.5 font-mono text-muted-foreground">{j.file_name}</td>
                          <td className="p-2.5">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                j.status === "completed"
                                  ? "bg-emerald-500/15 text-emerald-600"
                                  : j.status === "rolled_back"
                                  ? "bg-amber-500/15 text-amber-700"
                                  : j.status === "failed"
                                  ? "bg-red-500/15 text-red-600"
                                  : "bg-blue-500/15 text-blue-600"
                              )}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-600">{j.imported_count}</td>
                          <td className="p-2.5 text-right text-muted-foreground">{j.skipped_count}</td>
                          <td className="p-2.5 text-right whitespace-nowrap">
                            {j.status === "completed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={rollingBack}
                                onClick={() => handleRollback(j.id)}
                                className="h-7 text-[11px] gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>Rollback</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: PREVIEW RAW DATA                                                  */}
      {/* ========================================================================= */}
      {currentStep === 2 && activeJob && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Step 2 — Inspect Uploaded Records Preview</CardTitle>
                <CardDescription className="text-xs">
                  File: <span className="font-mono font-bold text-foreground">{activeJob.file_name}</span> • Total Rows:{" "}
                  <span className="font-bold text-foreground">{activeJob.total_rows}</span> • Columns detected:{" "}
                  <span className="font-bold text-foreground">{activeJob.raw_headers.length}</span>
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)} className="gap-1 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Re-upload</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto border rounded-lg max-h-96">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/60 font-bold text-foreground">
                    <th className="p-2.5 text-center text-muted-foreground w-12">#</th>
                    {activeJob.raw_headers.map((h) => (
                      <th key={h} className="p-2.5 whitespace-nowrap font-mono text-[11px]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeJob.sample_rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 font-sans">
                      <td className="p-2.5 text-center text-muted-foreground font-mono">{idx + 1}</td>
                      {activeJob.raw_headers.map((h) => (
                        <td key={h} className="p-2.5 whitespace-nowrap text-foreground">
                          {row[h] || <span className="text-muted-foreground/40 italic">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)} className="gap-1 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Button>
              <Button onClick={() => setCurrentStep(3)} className="gap-1.5 text-xs font-semibold">
                <span>Continue to Step 3: Column Mapping</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: COLUMN MAPPING                                                    */}
      {/* ========================================================================= */}
      {currentStep === 3 && activeJob && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Step 3 — Column Mapping (Old POS → BillMeet)</CardTitle>
                <CardDescription className="text-xs">
                  Match each BillMeet target field to the corresponding column header in your uploaded CSV.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColumnMapping(activeJob.suggested_mapping || {})}
                className="gap-1 text-xs"
              >
                <span>Reset to Auto-Suggested</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/60 font-bold text-foreground">
                    <th className="p-3 w-1/3">BillMeet Target Field</th>
                    <th className="p-3 w-1/3">Old POS CSV Header</th>
                    <th className="p-3 w-1/3">Sample Value from CSV</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(activeJob.target_fields || []).map((target) => {
                    const mappedHeader = columnMapping[target.key] || "";
                    const sampleVal = activeJob.sample_rows[0]?.[mappedHeader] || "";
                    return (
                      <tr key={target.key} className="hover:bg-muted/20">
                        <td className="p-3 font-medium">
                          <span className="font-bold text-foreground">{target.label}</span>
                          {target.required ? (
                            <span className="text-destructive font-bold ml-1">*</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground ml-1.5">(optional)</span>
                          )}
                        </td>
                        <td className="p-3">
                          <select
                            value={mappedHeader}
                            onChange={(e) => setColumnMapping({ ...columnMapping, [target.key]: e.target.value })}
                            className={cn(
                              "w-full p-2 rounded-md border text-xs bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary",
                              target.required && !mappedHeader ? "border-destructive/60 bg-destructive/5" : ""
                            )}
                          >
                            <option value="">— Unmapped (Skip this field) —</option>
                            {activeJob.raw_headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono truncate max-w-xs">
                          {sampleVal ? sampleVal : <span className="italic opacity-50">None</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)} className="gap-1 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Preview</span>
              </Button>
              <Button
                onClick={handleValidate}
                disabled={validating}
                className="gap-1.5 text-xs font-semibold shadow-sm"
              >
                {validating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Validating Records...</span>
                  </>
                ) : (
                  <>
                    <span>Validate Records & Check Duplicates</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* STEP 4 & 5: VALIDATION RESULTS & IMPORT PREVIEW                           */}
      {/* ========================================================================= */}
      {(currentStep === 4 || currentStep === 5) && activeJob && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 4 & 5 — Validation Diagnostics & Import Confirmation</CardTitle>
              <CardDescription className="text-xs">
                Inspect duplicate records, validation errors, and confirm staged import options before committing to database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Metric Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3 rounded-lg border bg-muted/20">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Total CSV Rows</span>
                  <span className="text-xl font-bold text-foreground">{activeJob.total_rows}</span>
                </div>
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">Valid Rows</span>
                  <span className="text-xl font-bold text-emerald-600">{activeJob.valid_rows}</span>
                </div>
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                  <span className="text-[10px] font-bold uppercase text-destructive block">Invalid Rows</span>
                  <span className="text-xl font-bold text-destructive">{activeJob.invalid_rows}</span>
                </div>
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block">Duplicate Rows</span>
                  <span className="text-xl font-bold text-amber-600">{activeJob.duplicate_rows}</span>
                </div>
                <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
                  <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block">New Items to Create</span>
                  <span className="text-xl font-bold text-blue-600">{activeJob.new_items_count}</span>
                </div>
              </div>

              {/* Validation Errors Table if any */}
              {activeJob.validation_errors && activeJob.validation_errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Validation Diagnostics ({activeJob.validation_errors.length} issues detected)</span>
                  </h4>
                  <div className="max-h-60 overflow-y-auto border border-destructive/30 rounded-lg">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b bg-destructive/10 text-destructive font-semibold">
                          <th className="p-2 w-16 text-center">Row #</th>
                          <th className="p-2">Diagnostic Error</th>
                          <th className="p-2">Raw Row Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-destructive/20 font-sans">
                        {activeJob.validation_errors.map((err, i) => (
                          <tr key={i} className="hover:bg-destructive/5">
                            <td className="p-2 text-center font-mono font-bold text-destructive">{err.row}</td>
                            <td className="p-2 text-destructive font-medium">{err.error}</td>
                            <td className="p-2 text-muted-foreground font-mono text-[11px] truncate max-w-sm">
                              {err.data ? JSON.stringify(err.data) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Duplicate Resolution Strategy Confirmation */}
              <div className="rounded-lg border p-4 bg-muted/10 space-y-3">
                <h4 className="text-xs font-bold text-foreground">Import Safety & Confirmation</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Selected Strategy for Duplicates:</span>
                  <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {duplicateStrategy}
                  </span>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={confirmImport}
                    onChange={(e) => setConfirmImport(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary"
                  />
                  <span>
                    I confirm that I have reviewed the mapping and diagnostics, and I want to execute the migration transactionally.
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentStep(3)} className="gap-1 text-xs">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Column Mapping</span>
                </Button>
                <Button
                  onClick={handleExecuteImport}
                  disabled={importing || !confirmImport}
                  className="gap-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Executing Database Transaction...</span>
                    </>
                  ) : (
                    <>
                      <Database className="h-3.5 w-3.5" />
                      <span>Execute Migration Import</span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 7: MIGRATION REPORT & ROLLBACK                                       */}
      {/* ========================================================================= */}
      {currentStep === 7 && activeJob && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {activeJob.status === "completed" ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span>Migration Completed Successfully!</span>
                    </>
                  ) : activeJob.status === "rolled_back" ? (
                    <>
                      <RotateCcw className="h-5 w-5 text-amber-600" />
                      <span>Migration Job Rolled Back</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-5 w-5 text-destructive" />
                      <span>Migration Execution Status: {activeJob.status}</span>
                    </>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {activeJob.status === "completed"
                    ? "All valid records and stock movements have been safely written to your BillMeet organization."
                    : "The rollback process safely removed all records created during this run."}
                </CardDescription>
              </div>
              <Button onClick={startNewJob} size="sm" className="gap-1 text-xs">
                <span>Start Another Migration</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Final KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border bg-muted/20">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Processed Rows</span>
                <span className="text-xl font-bold text-foreground">{activeJob.total_rows}</span>
              </div>
              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block">Imported Records</span>
                <span className="text-xl font-bold text-emerald-600">{activeJob.imported_count}</span>
              </div>
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block">Skipped Records</span>
                <span className="text-xl font-bold text-amber-600">{activeJob.skipped_count}</span>
              </div>
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                <span className="text-[10px] font-bold uppercase text-destructive block">Failed Records</span>
                <span className="text-xl font-bold text-destructive">{activeJob.failed_count}</span>
              </div>
            </div>

            {/* Created Summary */}
            {activeJob.import_report?.created_summary && Object.keys(activeJob.import_report.created_summary).length > 0 && (
              <div className="rounded-lg border p-3 bg-muted/10 space-y-2">
                <h4 className="text-xs font-bold text-foreground">Database Records Created:</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(activeJob.import_report.created_summary).map(([k, count]) => (
                    <span key={k} className="px-2.5 py-1 rounded bg-background border font-mono font-semibold">
                      {k}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rollback Action Bar */}
            {activeJob.status === "completed" && (
              <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Need to undo this migration?</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Rolling back will atomicaly delete the {activeJob.imported_count} created records and reverse any added opening stock.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rollingBack}
                  onClick={() => handleRollback(activeJob.id)}
                  className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/40 shrink-0"
                >
                  {rollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  <span>Rollback This Import</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
