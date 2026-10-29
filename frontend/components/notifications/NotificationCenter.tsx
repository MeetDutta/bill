"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Info,
  Archive,
  CheckCheck,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Package,
  Receipt,
  CreditCard,
  ShieldAlert,
  Clock,
  Sparkles,
  Check,
} from "lucide-react";
import { notificationApi } from "@/services/api";
import type { NotificationItem, NotificationSummary, NotificationCategory } from "@/types";
import { cn } from "@/lib/utils";

interface NotificationCenterProps {
  userRole?: "admin" | "staff";
}

type TabFilter = "all" | "unread" | "critical" | "inventory" | "sales" | "payments" | "system";

export function NotificationCenter({ userRole = "admin" }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    total: 0,
    unread: 0,
    critical: 0,
    active_low_stock: 0,
    categories: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  const fetchSummary = useCallback(async () => {
    try {
      const res = await notificationApi.getSummary();
      setSummary(res.data);
    } catch (err) {
      console.error("Failed to load notification summary:", err);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (activeTab === "unread") {
        params.is_read = false;
      } else if (activeTab === "critical") {
        params.severity = "critical";
      } else if (["inventory", "sales", "payments", "system"].includes(activeTab)) {
        params.category = activeTab;
      }

      const res = await notificationApi.list(params);
      setNotifications(res.data.results || []);
      setTotalCount(res.data.count || 0);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError("Failed to load notifications. Please check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, page]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const notifyHeaderUpdate = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("notifications_updated"));
    }
  };

  const handleMarkRead = async (id: string, currentRead: boolean) => {
    try {
      if (currentRead) {
        await notificationApi.markUnread(id);
      } else {
        await notificationApi.markRead(id);
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: !currentRead, read_at: currentRead ? null : new Date().toISOString() } : n))
      );
      fetchSummary();
      notifyHeaderUpdate();
    } catch (err) {
      console.error("Error updating read status:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const categoryParam = ["inventory", "sales", "payments", "system"].includes(activeTab) ? activeTab : undefined;
      await notificationApi.markAllRead(categoryParam);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      fetchSummary();
      notifyHeaderUpdate();
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await notificationApi.dismiss(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotalCount((c) => Math.max(0, c - 1));
      fetchSummary();
      notifyHeaderUpdate();
    } catch (err) {
      console.error("Error dismissing notification:", err);
    }
  };

  const formatTimestamp = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertOctagon className="h-3 w-3" />
            Critical
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Warning
          </span>
        );
      case "success":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </span>
        );
      case "info":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Info className="h-3 w-3" />
            Info
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "inventory":
        return <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
      case "sales":
        return <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
      case "payments":
        return <CreditCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
      case "invoices":
        return <Receipt className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />;
      case "system":
      default:
        return <ShieldAlert className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />;
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Notification Center
              </h1>
              <p className="text-xs text-muted-foreground">
                Centralized business alerts, inventory thresholds, and transaction events
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchSummary();
              fetchNotifications();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors shadow-xs"
            title="Refresh alerts"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          {summary.unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shadow-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark All as Read</span>
            </button>
          )}
        </div>
      </div>

      {/* SUMMARY INDICATORS / KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Notifications */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Notifications</span>
            <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Bell className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-foreground">{summary.total}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across active channels</p>
        </div>

        {/* Unread Alerts */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Unread Alerts</span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Info className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {summary.unread}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Requiring acknowledgement</p>
        </div>

        {/* Critical Alerts */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Critical Alerts</span>
            <div className="h-7 w-7 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertOctagon className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-red-600 dark:text-red-400">
            {summary.critical}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">High severity business events</p>
        </div>

        {/* Active Low Stock */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Low Stock</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Package className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {summary.active_low_stock}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Below 25% purchased baseline</p>
        </div>
      </div>

      {/* CONTROLS: TABS & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-4">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(
            [
              { key: "all", label: "All", count: summary.total },
              { key: "unread", label: "Unread", count: summary.unread },
              { key: "critical", label: "Critical", count: summary.critical },
              { key: "inventory", label: "Inventory", count: summary.categories.inventory || 0 },
              { key: "sales", label: "Sales", count: summary.categories.sales || 0 },
              { key: "payments", label: "Payments", count: summary.categories.payments || 0 },
              { key: "system", label: "System", count: summary.categories.system || 0 },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                  isActive
                    ? "bg-foreground text-background shadow-xs font-bold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                      isActive
                        ? "bg-background text-foreground"
                        : "bg-muted-foreground/15 text-muted-foreground"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, SKU, product..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* NOTIFICATIONS LIST */}
      <div className="space-y-3">
        {loading ? (
          // Skeletons
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-4 animate-pulse space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-40 bg-muted rounded-sm" />
                  <div className="h-4 w-20 bg-muted rounded-sm" />
                </div>
                <div className="h-3 w-3/4 bg-muted rounded-sm" />
                <div className="h-3 w-1/2 bg-muted rounded-sm" />
              </div>
            ))}
          </div>
        ) : error ? (
          // Error State
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-8 text-center space-y-3">
            <AlertOctagon className="h-8 w-8 text-red-600 mx-auto" />
            <h3 className="text-sm font-bold text-red-900 dark:text-red-300">{error}</h3>
            <button
              onClick={fetchNotifications}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          // Empty State
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">No notifications to display</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? `No notifications found matching "${searchQuery}". Try adjusting your search query.`
                : activeTab !== "all"
                ? `No alerts currently present in the "${activeTab}" filter.`
                : "You're all caught up! When low stock alerts or transaction events occur, they will appear here."}
            </p>
            {(searchQuery || activeTab !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setActiveTab("all");
                  setPage(1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-accent"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Items
          notifications.map((item) => {
            const isUnread = !item.is_read;
            const isCritical = item.severity === "critical";

            // Default route mappings for quick actions
            let actionHref = item.data?.action_url;
            if (!actionHref) {
              if (item.category === "inventory") {
                actionHref = userRole === "admin" ? "/dashboard/inventory" : "/staff/billing";
              } else if (item.category === "sales" || item.category === "invoices") {
                const searchParam = item.data?.invoice_number || item.related_entity_id;
                actionHref =
                  userRole === "admin"
                    ? `/dashboard/billing?view=history${searchParam ? `&search=${searchParam}` : ""}`
                    : `/staff/billing?view=history${searchParam ? `&search=${searchParam}` : ""}`;
              } else if (item.category === "payments") {
                actionHref = userRole === "admin" ? "/dashboard/finance/payments" : "/staff/billing";
              }
            }

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-4 transition-all relative group shadow-2xs",
                  isUnread
                    ? "bg-card border-l-4"
                    : "bg-card/60 opacity-90 hover:opacity-100",
                  isUnread && isCritical && "border-l-red-600 bg-red-500/5 dark:bg-red-950/20",
                  isUnread && item.severity === "warning" && "border-l-amber-500 bg-amber-500/5 dark:bg-amber-950/20",
                  isUnread && item.severity === "info" && "border-l-blue-500 bg-blue-500/5",
                  isUnread && item.severity === "success" && "border-l-emerald-500 bg-emerald-500/5"
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left Content */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Unread indicator dot */}
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse shrink-0" title="Unread" />
                      )}

                      {/* Severity Pill */}
                      {getSeverityBadge(item.severity)}

                      {/* Category Tag */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-0.5 rounded-sm bg-muted/60">
                        {getCategoryIcon(item.category)}
                        <span>{item.category}</span>
                      </span>

                      {/* Time */}
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto sm:ml-0">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(item.created_at)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-foreground tracking-tight">
                      {item.title}
                    </h3>

                    {/* Message */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.message}
                    </p>

                    {/* Low stock metadata tags */}
                    {item.data?.percentage && item.category === "inventory" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-muted font-mono font-semibold">
                          Current Stock: {item.data.current_stock}
                        </span>
                        {item.data.baseline && (
                          <span className="px-2 py-0.5 rounded-md bg-muted font-mono font-semibold">
                            Baseline: {item.data.baseline}
                          </span>
                        )}
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-md font-mono font-bold",
                            isCritical
                              ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          )}
                        >
                          Remaining: {item.data.percentage}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    {/* Quick navigation action */}
                    {actionHref && (
                      <Link
                        href={actionHref}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/80 text-foreground transition-colors shadow-2xs"
                      >
                        <span>{item.data?.action_label || "View Details"}</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}

                    {/* Mark read / unread */}
                    <button
                      onClick={() => handleMarkRead(item.id, item.is_read)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title={item.is_read ? "Mark as unread" : "Mark as read"}
                      aria-label={item.is_read ? "Mark as unread" : "Mark as read"}
                    >
                      {item.is_read ? (
                        <CheckCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>

                    {/* Dismiss / Archive */}
                    <button
                      onClick={() => handleDismiss(item.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      title="Dismiss notification"
                      aria-label="Dismiss notification"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} alerts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-semibold text-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

