"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Download,
  Settings2,
  History,
  X,
  RefreshCw,
  Info,
  ShieldAlert,
  ArrowRight,
  Database,
  Building2,
  Coins,
  Check,
} from "lucide-react";
import { tallyExportApi } from "@/services/api";
import type { TallyPreviewData, TallyLedgerConfigData, TallyExportHistoryItem } from "@/types";
import { cn } from "@/lib/utils";

interface TallyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: string;
  startDate?: string;
  endDate?: string;
}

const DEFAULT_DISCLAIMER =
  "Notice: This XML export is generated for internal accounting data transfer to Tally ERP/TallyPrime and does not constitute a statutory GST return (GSTR-1, GSTR-3B) or tax audit clearance. Tax liability and compliance must be reviewed by an authorized tax practitioner.";

export function TallyExportModal({
  isOpen,
  onClose,
  period,
  startDate,
  endDate,
}: TallyExportModalProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "ledgers" | "history">("preview");
  const [includePrevious, setIncludePrevious] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<TallyPreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Config state
  const [config, setConfig] = useState<TallyLedgerConfigData | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  // History state
  const [history, setHistory] = useState<TallyExportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const res = await tallyExportApi.getPreview({
        period,
        start_date: startDate,
        end_date: endDate,
        include_previously_exported: includePrevious,
      });
      setPreview(res.data);
    } catch (err: any) {
      console.error("Failed to load Tally export preview:", err);
      setPreviewError(err?.response?.data?.error || "Failed to load Tally export validation preview.");
    } finally {
      setLoadingPreview(false);
    }
  }, [period, startDate, endDate, includePrevious]);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await tallyExportApi.getConfig();
      setConfig(res.data);
    } catch (err) {
      console.error("Failed to load Tally ledger config:", err);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await tallyExportApi.getHistory();
      setHistory(res.data.history || []);
    } catch (err) {
      console.error("Failed to load Tally export history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPreview();
      fetchConfig();
      fetchHistory();
    }
  }, [isOpen, fetchPreview, fetchConfig, fetchHistory]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    setConfigSuccess(false);
    try {
      await tallyExportApi.updateConfig(config);
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
      fetchPreview();
    } catch (err) {
      console.error("Failed to save ledger config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDownloadXml = async () => {
    if (!preview?.validation.can_export) return;
    setExporting(true);
    try {
      const res = await tallyExportApi.exportXml({
        period,
        start_date: startDate,
        end_date: endDate,
        include_previously_exported: includePrevious,
      });

      // Create download anchor from response blob
      const blob = new Blob([res.data], { type: "application/xml" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Tally_GST_Sales_Export_${new Date().toISOString().slice(0, 10)}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Refresh preview and history
      fetchPreview();
      fetchHistory();
    } catch (err: any) {
      console.error("Failed to download Tally XML:", err);
      alert(err?.response?.data?.error || "Failed to generate Tally XML export.");
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  const summary = preview?.summary;
  const validation = preview?.validation;
  const gstBreakdown = preview?.gst_breakdown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-card text-foreground rounded-2xl border shadow-2xl flex flex-col overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Tally GST Accounting Export</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200">
                  TallyPrime / ERP 9
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Double-entry balanced XML vouchers for Sales, Receipts, Taxes, and Receivables
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 px-6 border-b bg-muted/15 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex items-center gap-2 py-3 px-3 border-b-2 transition-all",
              activeTab === "preview"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-4 w-4" />
            <span>Export Preview & Validation</span>
            {validation && !validation.can_export && (
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("ledgers")}
            className={cn(
              "flex items-center gap-2 py-3 px-3 border-b-2 transition-all",
              activeTab === "ledgers"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings2 className="h-4 w-4" />
            <span>Ledger Mappings</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex items-center gap-2 py-3 px-3 border-b-2 transition-all",
              activeTab === "history"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <History className="h-4 w-4" />
            <span>Export History</span>
            {history.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted font-bold">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: PREVIEW & VALIDATION */}
          {activeTab === "preview" && (
            <div className="space-y-6">
              {/* Filter controls row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 border">
                <div className="text-xs space-y-0.5">
                  <span className="text-muted-foreground">Reporting Window: </span>
                  <span className="font-bold uppercase text-foreground">{period.replace("_", " ")}</span>
                  {preview && (
                    <span className="text-muted-foreground ml-2">
                      ({new Date(preview.start_date).toLocaleDateString()} &mdash;{" "}
                      {new Date(preview.end_date).toLocaleDateString()})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium select-none">
                    <input
                      type="checkbox"
                      checked={includePrevious}
                      onChange={(e) => setIncludePrevious(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Include previously exported</span>
                  </label>

                  <button
                    onClick={fetchPreview}
                    disabled={loadingPreview}
                    className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Refresh validation"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", loadingPreview && "animate-spin")} />
                  </button>
                </div>
              </div>

              {loadingPreview ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Performing double-entry audit and GST reconciliation...
                  </p>
                </div>
              ) : previewError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-800 dark:text-red-300">
                  {previewError}
                </div>
              ) : (
                <>
                  {/* VALIDATION STATUS BANNERS */}
                  {validation?.blocking_errors && validation.blocking_errors.length > 0 ? (
                    <div className="rounded-xl border border-red-300 bg-red-50/90 dark:bg-red-950/40 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-red-900 dark:text-red-200 font-bold text-xs">
                        <AlertOctagon className="h-4 w-4 shrink-0 text-red-600" />
                        <span>Export Blocked: Mandatory Accounting Validation Failed</span>
                      </div>
                      <p className="text-[11px] text-red-700 dark:text-red-300">
                        The following fatal errors violate accounting balance or mandatory ledger mappings.
                        Please resolve them before generating Tally XML:
                      </p>
                      <ul className="list-disc list-inside text-xs space-y-1 text-red-800 dark:text-red-300 font-mono">
                        {validation.blocking_errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/30 p-3.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 text-emerald-900 dark:text-emerald-200">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="font-bold">
                          All vouchers reconciled and verified. Double-entry debits equal credits.
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                        Ready for Tally Import
                      </span>
                    </div>
                  )}

                  {/* WARNINGS BANNER */}
                  {validation?.warnings && validation.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/90 dark:bg-amber-950/40 p-3.5 space-y-1.5">
                      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>GST Discrepancy & Incomplete Data Warnings ({validation.warnings.length})</span>
                      </div>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800 dark:text-amber-300 max-h-24 overflow-y-auto font-mono">
                        {validation.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* SUMMARY CARDS GRID */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Accounting Voucher Summary
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl border bg-card p-3 shadow-2xs">
                        <span className="text-[11px] text-muted-foreground">Sales Vouchers</span>
                        <div className="text-xl font-bold mt-1 text-foreground">
                          {summary?.sales_vouchers_count || 0}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Tax Invoices</span>
                      </div>

                      <div className="rounded-xl border bg-card p-3 shadow-2xs">
                        <span className="text-[11px] text-muted-foreground">Receipt Vouchers</span>
                        <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                          {summary?.receipt_vouchers_count || 0}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Recorded Payments</span>
                      </div>

                      <div className="rounded-xl border bg-card p-3 shadow-2xs">
                        <span className="text-[11px] text-muted-foreground">Credit Notes</span>
                        <div className="text-xl font-bold mt-1 text-rose-600 dark:text-rose-400">
                          {summary?.credit_notes_count || 0}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Sales Returns</span>
                      </div>

                      <div className="rounded-xl border bg-card p-3 shadow-2xs">
                        <span className="text-[11px] text-muted-foreground">Outstanding Credit</span>
                        <div className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                          ₹{parseFloat(summary?.outstanding_receivables || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Pending Receivables</span>
                      </div>
                    </div>
                  </div>

                  {/* RECONCILED TOTALS TABLE */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Financial & GST Tax Reconciliation
                    </h3>
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y">
                          <tr className="bg-muted/30">
                            <td className="py-2.5 px-4 font-semibold text-muted-foreground">Total Taxable Value (Subtotal):</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold">
                              ₹{parseFloat(summary?.total_taxable_value || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 text-muted-foreground">Output CGST (Central Tax):</td>
                            <td className="py-2 px-4 text-right font-mono text-emerald-600">
                              ₹{parseFloat(summary?.total_cgst || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 text-muted-foreground">Output SGST (State Tax):</td>
                            <td className="py-2 px-4 text-right font-mono text-emerald-600">
                              ₹{parseFloat(summary?.total_sgst || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 text-muted-foreground">Output IGST (Integrated Tax):</td>
                            <td className="py-2 px-4 text-right font-mono text-blue-600">
                              ₹{parseFloat(summary?.total_igst || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr className="bg-muted/40 font-bold border-t">
                            <td className="py-2.5 px-4">Total Invoice Value (Debited to Debtors):</td>
                            <td className="py-2.5 px-4 text-right font-mono text-sm">
                              ₹{parseFloat(summary?.total_invoice_value || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 text-muted-foreground">Total Recorded Settlements (Receipts):</td>
                            <td className="py-2 px-4 text-right font-mono text-emerald-600">
                              ₹{parseFloat(summary?.total_recorded_payments || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 px-4 text-muted-foreground">Balance Outstanding (Sundry Debtors):</td>
                            <td className="py-2 px-4 text-right font-mono text-amber-600 font-bold">
                              ₹{parseFloat(summary?.outstanding_receivables || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          {parseFloat(summary?.total_refund_amount || "0") > 0 && (
                            <tr>
                              <td className="py-2 px-4 text-muted-foreground">Total Returns / Refunds (Credit Notes):</td>
                              <td className="py-2 px-4 text-right font-mono text-rose-600">
                                ₹{parseFloat(summary?.total_refund_amount || "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* PLACE OF SUPPLY & GSTIN BREAKDOWN */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border p-3.5 space-y-2 bg-muted/20">
                      <h4 className="font-bold text-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Seller GST Profile</span>
                      </h4>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div>
                          <span className="text-muted-foreground">State: </span>
                          <span className="font-semibold">{gstBreakdown?.seller_state}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">GSTIN: </span>
                          <span className="font-semibold">{gstBreakdown?.seller_gstin}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border p-3.5 space-y-2 bg-muted/20">
                      <h4 className="font-bold text-foreground flex items-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>GST Transaction Scope</span>
                      </h4>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Intra-State: </span>
                          <span>₹{parseFloat(gstBreakdown?.intra_state_sales || "0").toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Inter-State: </span>
                          <span>₹{parseFloat(gstBreakdown?.inter_state_sales || "0").toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Exempt/Zero: </span>
                          <span>₹{parseFloat(gstBreakdown?.exempt_zero_rated_sales || "0").toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STATUTORY DISCLAIMER */}
                  <div className="p-3 rounded-xl bg-muted/50 border text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    <p>{preview?.disclaimer || DEFAULT_DISCLAIMER}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: LEDGER MAPPING CONFIGURATION */}
          {activeTab === "ledgers" && (
            <form onSubmit={handleSaveConfig} className="space-y-5">
              <div className="border-b pb-3">
                <h3 className="text-sm font-bold text-foreground">Configure Tally Ledger Accounts</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ensure these account names match your Chart of Accounts in Tally ERP 9 / TallyPrime.
                </p>
              </div>

              {configSuccess && (
                <div className="p-3 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span>Tally ledger configuration updated successfully!</span>
                </div>
              )}

              {loadingConfig || !config ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Loading ledger configuration...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Tally Company Name</label>
                    <input
                      type="text"
                      value={config.company_name}
                      onChange={(e) => setConfig({ ...config, company_name: e.target.value })}
                      placeholder="e.g. Apex Retail Private Limited"
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Sales Account</label>
                    <input
                      type="text"
                      required
                      value={config.sales_ledger}
                      onChange={(e) => setConfig({ ...config, sales_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Output CGST Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.cgst_ledger}
                      onChange={(e) => setConfig({ ...config, cgst_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Output SGST Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.sgst_ledger}
                      onChange={(e) => setConfig({ ...config, sgst_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Output IGST Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.igst_ledger}
                      onChange={(e) => setConfig({ ...config, igst_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Cash Settlement Account</label>
                    <input
                      type="text"
                      required
                      value={config.cash_ledger}
                      onChange={(e) => setConfig({ ...config, cash_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Bank Account Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.bank_ledger}
                      onChange={(e) => setConfig({ ...config, bank_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">UPI / Digital Collections Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.upi_ledger}
                      onChange={(e) => setConfig({ ...config, upi_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Card Collections Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.card_ledger}
                      onChange={(e) => setConfig({ ...config, card_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Sundry Debtors Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.debtor_ledger}
                      onChange={(e) => setConfig({ ...config, debtor_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Discount Allowed Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.discount_ledger}
                      onChange={(e) => setConfig({ ...config, discount_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Round Off Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.round_off_ledger}
                      onChange={(e) => setConfig({ ...config, round_off_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Sales Return / Credit Note Ledger</label>
                    <input
                      type="text"
                      required
                      value={config.credit_note_ledger}
                      onChange={(e) => setConfig({ ...config, credit_note_ledger: e.target.value })}
                      className="w-full p-2 rounded-lg border bg-card text-foreground"
                    />
                  </div>

                  <div className="space-y-1 flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={config.include_inventory_details}
                        onChange={(e) => setConfig({ ...config, include_inventory_details: e.target.checked })}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="font-semibold text-foreground">
                        Include Stock Item / Inventory Details in Sales Vouchers
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingConfig || loadingConfig}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingConfig ? "Saving..." : "Save Ledger Configuration"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: EXPORT AUDIT HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-foreground">Tally Accounting Export Audit Log</h3>
                <p className="text-xs text-muted-foreground">
                  History of generated XML voucher files and transaction counts.
                </p>
              </div>

              {loadingHistory ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Loading export history...</div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No previous Tally exports recorded.
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-medium text-muted-foreground">Export Date</th>
                        <th className="py-2.5 px-3 text-left font-medium text-muted-foreground">User</th>
                        <th className="py-2.5 px-3 text-center font-medium text-muted-foreground">Sales VCH</th>
                        <th className="py-2.5 px-3 text-center font-medium text-muted-foreground">Receipt VCH</th>
                        <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Total Invoiced</th>
                        <th className="py-2.5 px-3 text-right font-medium text-muted-foreground">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/10 font-mono text-[11px]">
                          <td className="py-2 px-3">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2 px-3 font-sans font-medium">{log.exported_by}</td>
                          <td className="py-2 px-3 text-center">{log.sales_count}</td>
                          <td className="py-2 px-3 text-center text-emerald-600">{log.receipts_count}</td>
                          <td className="py-2 px-3 text-right font-bold">
                            ₹{parseFloat(log.total_invoice_amount).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-600 font-semibold">
                            ₹{parseFloat(log.outstanding_receivables).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between border-t px-6 py-4 bg-muted/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-xs font-semibold hover:bg-accent"
          >
            Cancel
          </button>

          {activeTab === "preview" && (
            <button
              onClick={handleDownloadXml}
              disabled={exporting || loadingPreview || !validation?.can_export}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-all",
                validation?.can_export
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Download className={cn("h-4 w-4", exporting && "animate-bounce")} />
              <span>{exporting ? "Generating Tally XML..." : "Download Tally XML"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
