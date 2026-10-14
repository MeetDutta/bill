"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Server,
  Layers,
  HardDrive,
  ShieldAlert,
  ArrowRight,
  Download,
  Play,
  RotateCcw,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Indicator {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "warning" | "unavailable" | "unknown";
  latency_ms?: number | null;
  last_checked: string;
  details: string;
  recommended_action: string;
}

interface SystemHealthResponse {
  overall_status: string;
  timestamp: string;
  pilot_mode: {
    active: boolean;
    version: string;
    notes: string;
  };
  indicators: Indicator[];
}

interface OperationalAlert {
  id: string;
  alert_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  entity_type: string;
  recommended_action: string;
  created_at: string;
}

export default function SystemHealthPage() {
  const [healthData, setHealthData] = useState<SystemHealthResponse | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<SystemHealthResponse>("/health/system/");
      setHealthData(res.data);
    } catch (err) {
      console.error("Failed to fetch system health:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<{ results: OperationalAlert[] }>("/alerts/?is_dismissed=false");
      setAlerts(res.data.results || []);
    } catch (err) {
      console.error("Failed to fetch operational alerts:", err);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchAlerts();
    const interval = setInterval(() => {
      fetchHealth();
      fetchAlerts();
    }, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [fetchHealth, fetchAlerts]);

  const handleRunReconciliation = async (type: "financial" | "inventory") => {
    try {
      setActionLoading(`run_${type}`);
      setActionMessage(null);
      const endpoint = `/reports/reconciliation/${type}/run/`;
      const res = await api.post(endpoint, {});
      setActionMessage(
        `✓ ${type === "financial" ? "Financial" : "Inventory"} reconciliation complete. ${res.data.discrepancies_count} discrepancies found.`
      );
      await fetchHealth();
      await fetchAlerts();
    } catch (err) {
      setActionMessage(`Failed to execute ${type} reconciliation.`);
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadCsv = (type: "financial" | "inventory") => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/reports/reconciliation/${type}/export/`;
    window.open(url, "_blank");
  };

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/acknowledge/`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Healthy
          </span>
        );
      case "degraded":
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> Degraded
          </span>
        );
      case "unavailable":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Down
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border">
            <Clock className="w-3 h-3" /> Checking
          </span>
        );
    }
  };

  const getIndicatorIcon = (id: string) => {
    switch (id) {
      case "postgresql":
        return <Database className="w-5 h-5 text-indigo-500" />;
      case "redis":
        return <Server className="w-5 h-5 text-rose-500" />;
      case "migrations":
      case "celery":
        return <Layers className="w-5 h-5 text-blue-500" />;
      case "storage":
      case "backup":
      case "restore_readiness":
        return <HardDrive className="w-5 h-5 text-emerald-500" />;
      default:
        return <Activity className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border rounded-2xl p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">System Health & Operations</h1>
              <p className="text-xs text-muted-foreground">
                Continuous diagnostics for PostgreSQL transactions, broker queues, backups, and ledger reconciliation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {healthData && (
            <div className="text-right hidden sm:block">
              <div className="text-xs text-muted-foreground">Overall System State</div>
              <div className="text-sm font-semibold capitalize flex items-center justify-end gap-1.5">
                {getStatusBadge(healthData.overall_status)}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              fetchHealth();
              fetchAlerts();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border bg-background hover:bg-accent hover:text-foreground transition-all shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
      )}

      {/* Operational Actions Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          onClick={() => handleRunReconciliation("financial")}
          disabled={actionLoading !== null}
          className="flex items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/40 transition-all text-left shadow-xs group"
        >
          <div>
            <div className="text-xs font-bold text-foreground">Audit Financial Ledger</div>
            <div className="text-[11px] text-muted-foreground">Reconcile Invoices vs Payments</div>
          </div>
          <Play className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={() => handleRunReconciliation("inventory")}
          disabled={actionLoading !== null}
          className="flex items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/40 transition-all text-left shadow-xs group"
        >
          <div>
            <div className="text-xs font-bold text-foreground">Audit Inventory Ledger</div>
            <div className="text-[11px] text-muted-foreground">Reconcile Stock vs Movements</div>
          </div>
          <Play className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={() => handleDownloadCsv("financial")}
          className="flex items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/40 transition-all text-left shadow-xs group"
        >
          <div>
            <div className="text-xs font-bold text-foreground">Export Financial Audit</div>
            <div className="text-[11px] text-muted-foreground">Download Discrepancies CSV</div>
          </div>
          <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        <button
          onClick={() => handleDownloadCsv("inventory")}
          className="flex items-center justify-between p-3.5 rounded-xl border bg-card hover:bg-muted/40 transition-all text-left shadow-xs group"
        >
          <div>
            <div className="text-xs font-bold text-foreground">Export Inventory Audit</div>
            <div className="text-[11px] text-muted-foreground">Download Stock Variances CSV</div>
          </div>
          <Download className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>

      {/* Indicators Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">
          Subsystem Health Status
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {healthData?.indicators.map((ind) => (
            <div
              key={ind.id}
              className="flex flex-col justify-between p-5 rounded-2xl border bg-card hover:border-primary/40 transition-all shadow-xs space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-muted/60">{getIndicatorIcon(ind.id)}</div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{ind.name}</h3>
                      {ind.latency_ms !== undefined && ind.latency_ms !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          Latency: {ind.latency_ms}ms
                        </span>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(ind.status)}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{ind.details}</p>
              </div>

              <div className="pt-3 border-t text-[11px] flex items-center justify-between text-muted-foreground">
                <span className="truncate pr-2 font-medium text-foreground/80">
                  {ind.recommended_action}
                </span>
                <span className="text-[10px] shrink-0 opacity-70">
                  {new Date(ind.last_checked).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Operational Alerts Feed */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Active Operational Alerts ({alerts.length})</span>
          </h2>
          <span className="text-xs text-muted-foreground">Auto-deduplicated</span>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed bg-card/50 text-muted-foreground text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <div className="font-semibold text-foreground">No Active Operational Alerts</div>
            <div>All systems, transactions, and background reconciliations are operating within normal tolerances.</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border bg-card gap-4 shadow-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        alert.severity === "CRITICAL"
                          ? "bg-rose-500/20 text-rose-600 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-600 border border-amber-500/30"
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-foreground">{alert.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.description}</p>
                  {alert.recommended_action && (
                    <p className="text-[11px] font-medium text-primary">
                      Action: {alert.recommended_action}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted hover:bg-accent text-foreground transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Acknowledge</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
