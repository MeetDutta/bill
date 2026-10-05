"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Receipt,
  Tag,
  Boxes,
  RotateCcw,
  Landmark,
  FileSpreadsheet,
  Megaphone,
  BarChart3,
  Store,
  Settings,
  LogOut,
  Star,
  Ticket,
  Sparkles,
  HeartHandshake,
} from "lucide-react";

const navigation = [
  { name: "POS Terminal", href: "/dashboard/pos", icon: ShoppingCart },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Inventory", href: "/dashboard/inventory", icon: Boxes },
  { name: "Returns", href: "/dashboard/returns", icon: RotateCcw },
  { name: "Cash Register", href: "/dashboard/register", icon: Landmark },
  { name: "POS Reports", href: "/dashboard/reports", icon: FileSpreadsheet },
  { name: "Customers", href: "/dashboard/customers", icon: Users },
  { name: "Engagement", href: "/dashboard/engagement", icon: HeartHandshake },
  { name: "Transactions", href: "/dashboard/transactions", icon: Receipt },
  { name: "Products", href: "/dashboard/products", icon: Tag },
  { name: "Loyalty", href: "/dashboard/loyalty", icon: Star },
  { name: "Coupons", href: "/dashboard/coupons", icon: Ticket },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { name: "AI Assistant", href: "/dashboard/ai-campaigns", icon: Sparkles },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Stores", href: "/dashboard/stores", icon: Store },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

import { CopilotDrawer } from "@/components/CopilotDrawer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-16 items-center border-b px-6">
          <h1 className="text-xl font-bold">BillFree</h1>
        </div>
        <nav className="space-y-1 p-4 flex-1 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t p-4">
          <button
            onClick={() => {
              localStorage.removeItem("access_token");
              localStorage.removeItem("refresh_token");
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 pl-64">
        <header className="flex h-16 items-center border-b px-6">
          <h2 className="text-lg font-semibold">
            {navigation.find((n) => n.href === pathname)?.name || "Dashboard"}
          </h2>
        </header>
        <div className="p-6">{children}</div>
      </main>
      <CopilotDrawer />
    </div>
  );
}
