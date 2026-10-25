"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  FileCheck,
  UserCheck,
  LogOut,
  Menu,
  X,
  Shield,
  ArrowRightLeft,
  Store,
  RefreshCw,
  Receipt,
} from "lucide-react";
import { authApi } from "@/services/api";
import type { User } from "@/types";

interface StaffNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const staffNavItems: StaffNavItem[] = [
  { name: "Overview", href: "/staff/dashboard", icon: LayoutDashboard },
  { name: "POS Terminal", href: "/staff/pos", icon: ShoppingCart },
  { name: "My Invoices", href: "/staff/invoices", icon: FileText },
  { name: "My Quotations", href: "/staff/quotations", icon: FileCheck },
  { name: "My Sales Profile", href: "/staff/profile", icon: UserCheck },
];

const ADMIN_ROLES = ["super_admin", "org_admin", "owner", "store_manager", "manager"];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          router.replace("/login");
          return;
        }
        const res = await authApi.getProfile();
        setUser(res.data);
      } catch (err) {
        console.error("Failed to authenticate staff session:", err);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.replace("/login");
  };

  const isAdmin = user && ADMIN_ROLES.includes(user.role);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-40 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Store Title */}
          <div className="flex items-center gap-3">
            <Link href="/staff/dashboard" className="flex items-center gap-2 group">
              <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-black text-sm tracking-tight shadow-sm transition-transform group-hover:scale-105">
                BM
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-foreground">BILLMEET</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground uppercase tracking-wider">
                    STAFF
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[180px] sm:max-w-[240px]">
                  <Store className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {user?.organization_name || (typeof user?.organization === "object" ? user?.organization?.name : null) || "Store Terminal"}
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {staffNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/staff/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                    isActive
                      ? "bg-foreground text-background shadow-xs font-bold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: User Role & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Staff Role Badge */}
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-bold text-foreground truncate max-w-[130px]">
                {user ? `${user.first_name} ${user.last_name || ""}`.trim() : "Staff Member"}
              </span>
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {user?.role ? user.role.replace("_", " ") : "Cashier"}
              </span>
            </div>

            {/* Switch to Admin if privileged */}
            {isAdmin && (
              <Link
                href="/dashboard"
                className="hidden lg:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Switch to Executive Business Dashboard"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>Admin View</span>
              </Link>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Toggle Navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-card px-4 pt-3 pb-4 space-y-1 shadow-lg animate-in slide-in-from-top-2">
            <div className="py-2 px-3 mb-2 rounded-lg bg-muted/40 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {user ? `${user.first_name} ${user.last_name || ""}`.trim() : "Staff Member"}
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">
                  {user?.role ? user.role.replace("_", " ") : "Cashier"}
                </p>
              </div>
              {isAdmin && (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="text-[11px] font-bold text-foreground bg-accent px-2 py-1 rounded-sm flex items-center gap-1"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Admin
                </Link>
              )}
            </div>

            {staffNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-foreground text-background font-bold"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* FOOTER */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground bg-card">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>BillMeet POS Terminal &mdash; Authorized Staff Workspace</span>
          <span>Security Enforced &bull; Tenant Isolated</span>
        </div>
      </footer>
    </div>
  );
}
