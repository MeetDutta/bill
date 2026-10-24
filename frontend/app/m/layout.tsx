"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Receipt,
  Menu,
  Monitor,
  Store,
  User as UserIcon,
  CircleDot,
} from "lucide-react";
import { authApi, posApi } from "@/services/api";
import type { User } from "@/types";

interface MobileNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isPrimary?: boolean;
}

const navItems: MobileNavItem[] = [
  { name: "Home", href: "/m/dashboard", icon: LayoutDashboard },
  { name: "Inventory", href: "/m/inventory", icon: Boxes },
  { name: "POS", href: "/m/pos", icon: ShoppingCart, isPrimary: true },
  { name: "Sales", href: "/m/sales", icon: Receipt },
  { name: "More", href: "/m/more", icon: Menu },
];

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [registerOpen, setRegisterOpen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      router.push("/login?redirect=" + encodeURIComponent(pathname));
      return;
    }

    // Load user profile & active register
    authApi
      .getProfile()
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        // Token expired or invalid
        localStorage.removeItem("access_token");
        router.push("/login");
      })
      .finally(() => setLoading(false));

    posApi
      .getRegisterStatus()
      .then((res) => {
        setRegisterOpen(res.data?.status === "open");
      })
      .catch(() => {
        setRegisterOpen(false);
      });
  }, [pathname, router]);

  const isActive = (href: string) => {
    if (href === "/m/dashboard") return pathname === "/m/dashboard" || pathname === "/m";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased selection:bg-blue-500 selection:text-white">
      {/* Top Mobile Bar (Fixed Dark Navy) */}
      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-800 bg-[#0f172a] px-3.5 text-white shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/m/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-black text-sm text-white shadow-sm">
              BM
            </div>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white truncate max-w-[140px] sm:max-w-[200px]">
                {user?.organization_name || "BillMeet POS"}
              </span>
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                Mobile
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
              <span className="truncate">{user?.first_name ? `${user.first_name} (${user.role})` : "Cashier"}</span>
              <span>•</span>
              <Link
                href="/m/register"
                className={cn(
                  "flex items-center gap-1 font-semibold transition-colors",
                  registerOpen ? "text-emerald-400" : "text-amber-400"
                )}
              >
                <CircleDot className="h-2.5 w-2.5 animate-pulse" />
                <span>{registerOpen ? "Register Open" : "Register Closed"}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Switch to Desktop */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Switch to Desktop Terminal"
          >
            <Monitor className="h-3 w-3 text-slate-400" />
            <span className="hidden xs:inline">Desktop</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-24 pt-2 px-3 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-xs text-slate-500 font-medium">Loading BillMeet Mobile...</p>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            if (item.isPrimary) {
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="group relative -top-3 flex flex-col items-center focus:outline-none"
                >
                  <div
                    className={cn(
                      "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform duration-150 active:scale-95",
                      active
                        ? "bg-blue-600 text-white shadow-blue-500/40 ring-4 ring-blue-100"
                        : "bg-slate-900 text-white shadow-slate-900/30 ring-4 ring-slate-100"
                    )}
                  >
                    <Icon className="h-6 w-6 stroke-[2.2]" />
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 text-[10px] font-bold tracking-tight transition-colors",
                      active ? "text-blue-600" : "text-slate-700"
                    )}
                  >
                    {item.name}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center py-1 transition-colors active:scale-95",
                  active ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <div className="relative">
                  <Icon className={cn("h-5 w-5", active ? "stroke-[2.4]" : "stroke-[1.8]")} />
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-600" />
                  )}
                </div>
                <span className={cn("mt-1 text-[10px]", active ? "font-bold text-blue-600" : "font-medium")}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
