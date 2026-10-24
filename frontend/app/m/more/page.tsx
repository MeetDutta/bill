"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authApi } from "@/services/api";
import type { User } from "@/types";
import {
  User as UserIcon,
  LogOut,
  Monitor,
  FileCheck,
  RotateCcw,
  CircleDollarSign,
  Receipt,
  Boxes,
  Store,
  ChevronRight,
  ShieldCheck,
  Settings,
} from "lucide-react";

export default function MobileMorePage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    authApi
      .getProfile()
      .then((res) => setUser(res.data))
      .catch(() => {});
  }, []);

  const handleSignOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
  };

  return (
    <div className="space-y-4 pt-1">
      {/* Cashier Profile Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-extrabold text-base shrink-0">
          {user?.first_name ? user.first_name[0].toUpperCase() : "U"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-extrabold text-slate-900 truncate">
              {user?.first_name ? `${user.first_name} ${user.last_name || ""}` : "Staff Member"}
            </h2>
            <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[9px] font-bold uppercase text-blue-600">
              {user?.role || "Staff"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
            {user?.organization_name || "BillMeet Store"}
          </p>
        </div>
      </div>

      {/* Navigation Shortcuts List */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100 text-xs">
        <Link
          href="/m/pos"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">POS Checkout Terminal</span>
              <span className="text-[10px] text-slate-400">Barcode scanner & quick tender</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/m/sales"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Receipt className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Sales & Invoices</span>
              <span className="text-[10px] text-slate-400">All customer receipts & bills</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/m/inventory"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Boxes className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Inventory Stock</span>
              <span className="text-[10px] text-slate-400">Search products & add new items</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/m/quotations"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <FileCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Quotations & Estimates</span>
              <span className="text-[10px] text-slate-400">Convert estimates to POS orders</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/m/returns"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Returns & Refunds</span>
              <span className="text-[10px] text-slate-400">Process invoice item return</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <Link
          href="/m/register"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CircleDollarSign className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Cash Register Shift</span>
              <span className="text-[10px] text-slate-400">Drawer balancing & day-end close</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>
      </div>

      {/* Switch to Desktop & Logout Actions */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100 text-xs">
        <Link
          href="/dashboard"
          className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Monitor className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block">Switch to Desktop View</span>
              <span className="text-[10px] text-slate-400">Open full desktop ERP interface</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-between p-3.5 text-left hover:bg-rose-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 group-hover:bg-rose-200">
              <LogOut className="h-4 w-4" />
            </div>
            <div>
              <span className="font-bold text-rose-700 block">Sign Out</span>
              <span className="text-[10px] text-slate-400">Log out of cashier account</span>
            </div>
          </div>
        </button>
      </div>

      <p className="text-center text-[10px] text-slate-400 pt-2 font-mono">
        BillMeet Mobile POS v2.0 • Build verified
      </p>
    </div>
  );
}
