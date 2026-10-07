"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  FileCheck,
  Receipt,
  RotateCcw,
  Tag,
  Boxes,
  SlidersHorizontal,
  Truck,
  ClipboardList,
  History,
  Users,
  Star,
  HeartHandshake,
  Ticket,
  Megaphone,
  Sparkles,
  Landmark,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Store,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { CopilotDrawer } from "@/components/CopilotDrawer";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tab?: string;
}

interface NavSection {
  title: string;
  key: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "DASHBOARD",
    key: "dashboard",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "SALES",
    key: "sales",
    items: [
      { name: "POS Terminal", href: "/dashboard/pos", icon: ShoppingCart },
      { name: "Invoices", href: "/dashboard/invoices", icon: FileText },
      { name: "Quotations", href: "/dashboard/quotations", icon: FileCheck },
      { name: "Sales History", href: "/dashboard/transactions", icon: Receipt },
      { name: "Returns", href: "/dashboard/returns", icon: RotateCcw },
    ],
  },
  {
    title: "INVENTORY",
    key: "inventory",
    items: [
      { name: "Products", href: "/dashboard/products", icon: Tag },
      { name: "Inventory", href: "/dashboard/inventory", icon: Boxes },
      { name: "Stock Adjustments", href: "/dashboard/inventory?tab=ledger", icon: SlidersHorizontal, tab: "ledger" },
    ],
  },
  {
    title: "PURCHASING",
    key: "purchasing",
    items: [
      { name: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
      { name: "Purchase Orders", href: "/dashboard/purchases", icon: ClipboardList },
      { name: "Purchase History", href: "/dashboard/purchases?tab=history", icon: History, tab: "history" },
    ],
  },
  {
    title: "CUSTOMERS",
    key: "customers",
    items: [
      { name: "Customers", href: "/dashboard/customers", icon: Users },
      { name: "Loyalty", href: "/dashboard/loyalty", icon: Star },
      { name: "Engagement", href: "/dashboard/engagement", icon: HeartHandshake },
    ],
  },
  {
    title: "MARKETING",
    key: "marketing",
    items: [
      { name: "Coupons", href: "/dashboard/coupons", icon: Ticket },
      { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
      { name: "AI Assistant", href: "/dashboard/ai-campaigns", icon: Sparkles },
    ],
  },
  {
    title: "FINANCE",
    key: "finance",
    items: [
      { name: "Cash Register", href: "/dashboard/register", icon: Landmark },
      { name: "Payments", href: "/dashboard/reports?tab=payments", icon: CreditCard, tab: "payments" },
      { name: "Outstanding", href: "/dashboard/reports?tab=outstanding", icon: AlertCircle, tab: "outstanding" },
    ],
  },
  {
    title: "REPORTS",
    key: "reports",
    items: [
      { name: "Sales Reports", href: "/dashboard/reports?tab=sales", icon: TrendingUp, tab: "sales" },
      { name: "POS Reports", href: "/dashboard/reports", icon: FileSpreadsheet },
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "BUSINESS",
    key: "business",
    items: [
      { name: "Stores", href: "/dashboard/stores", icon: Store },
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentTab, setCurrentTab] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setCurrentTab(params.get("tab"));
    }
  }, [pathname]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Helper to determine if an item is active
  const isItemActive = (item: NavItem) => {
    const [itemPath] = item.href.split("?");
    if (pathname !== itemPath) return false;
    if (item.tab) {
      return currentTab === item.tab;
    }
    // If item doesn't have a tab, but URL has a tab, it shouldn't be active if another item handles that tab
    if (currentTab && (pathname === "/dashboard/reports" || pathname === "/dashboard/inventory" || pathname === "/dashboard/purchases")) {
      return false;
    }
    return true;
  };

  // Find active section key
  const activeSectionKey = useMemo(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (isItemActive(item)) {
          return section.key;
        }
      }
    }
    return "dashboard";
  }, [pathname, currentTab]);

  // Load persisted collapsed state from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("billfree_sidebar_collapsed");
      if (saved) {
        setCollapsedSections(JSON.parse(saved));
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }, []);

  // Automatically expand the active section
  useEffect(() => {
    if (activeSectionKey) {
      setCollapsedSections((prev) => {
        if (prev[activeSectionKey]) {
          const updated = { ...prev, [activeSectionKey]: false };
          try {
            sessionStorage.setItem("billfree_sidebar_collapsed", JSON.stringify(updated));
          } catch {}
          return updated;
        }
        return prev;
      });
    }
  }, [activeSectionKey]);

  // Toggle collapse state for a section
  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        sessionStorage.setItem("billfree_sidebar_collapsed", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Find current active page title
  const activePageTitle = useMemo(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (isItemActive(item)) {
          return item.name;
        }
      }
    }
    return "Dashboard";
  }, [pathname, currentTab]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop fixed & Mobile drawer) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 ease-in-out lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between border-b px-5">
          <Link href="/dashboard" onClick={closeMobile} className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-lg tracking-wider shadow-sm">
              BF
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-foreground block leading-tight">BillFree</span>
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Universal POS</span>
            </div>
          </Link>
          <button
            onClick={closeMobile}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 text-xs select-none">
          {navSections.map((section) => {
            const isCollapsed = Boolean(collapsedSections[section.key]);
            const containsActive = section.items.some(isItemActive);

            return (
              <div key={section.key} className="space-y-1">
                {/* Section header toggle */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className={cn(
                    "flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-bold tracking-wider rounded-md uppercase transition-colors",
                    containsActive
                      ? "text-primary font-extrabold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <span>{section.title}</span>
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  )}
                </button>

                {/* Section children */}
                {!isCollapsed && (
                  <div className="space-y-0.5 pt-0.5 pl-1">
                    {section.items.map((item) => {
                      const active = isItemActive(item);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={closeMobile}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-all",
                            active
                              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer / Logout */}
        <div className="border-t p-3 bg-card/50">
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              localStorage.removeItem("refresh_token");
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/80 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
              aria-label="Open navigation drawer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider hidden sm:inline">
                BillFree /
              </span>
              <h2 className="text-base md:text-lg font-bold text-foreground">
                {activePageTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/pos"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>POS Terminal</span>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating AI Copilot */}
      <CopilotDrawer />
    </div>
  );
}
