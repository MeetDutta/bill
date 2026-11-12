"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { customerApi } from "@/services/api";
import { useRealtimeSubscription } from "@/services/realtime";
import type { Customer } from "@/types";
import { parseApiError } from "@/lib/utils";
import {
  Search,
  Plus,
  UserPlus,
  Loader2,
  ArrowUpRight,
  Phone,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";

const PAGE_SIZE = 20;
const CUSTOMER_REALTIME_EVENTS = ["sale_completed", "sale_return", "credit_payment"];

function formatInr(amount: number | string | undefined | null): string {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return "₹0";
  return `₹${numeric.toLocaleString("en-IN", {
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  })}`;
}

function formatPurchaseCount(count: number | undefined | null): string {
  const n = Number(count || 0);
  return `${n} ${n === 1 ? "Purchase" : "Purchases"}`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    gstin: "",
    segment: "new",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchCustomers = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const res = await customerApi.list({
        search: debouncedSearch || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setCustomers(res.data.results || []);
      setTotalCount(Number(res.data.count || 0));
    } catch {
      if (!opts?.silent) {
        setCustomers([]);
        setTotalCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const { isConnected } = useRealtimeSubscription(
    useCallback(() => {
      fetchCustomers({ silent: true });
    }, [fetchCustomers]),
    CUSTOMER_REALTIME_EVENTS
  );

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.phone.trim() || !formData.first_name.trim()) {
      setError("First Name and Phone Number are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await customerApi.create({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address_line1: formData.address_line1.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        postal_code: formData.postal_code.trim(),
        gstin: formData.gstin.trim().toUpperCase(),
        segment: formData.segment,
        whatsapp_opt_in: true,
        marketing_consent: true,
      } as Partial<Customer>);

      setOpen(false);
      setFormData({
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        address_line1: "",
        city: "",
        state: "",
        postal_code: "",
        gstin: "",
        segment: "new",
      });
      setPage(1);
      await fetchCustomers();
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to create customer. Please check input values."));
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalCount, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                isConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-muted bg-muted/50 text-muted-foreground"
              }`}
            >
              <Radio className="h-3 w-3" />
              {isConnected ? "Live Sync" : "Synced"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Customer-wise purchase counts, spending analytics, and CRM profiles from completed invoices.
          </p>
        </div>

        <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) setError(""); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateCustomer}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Add New Customer
                </DialogTitle>
                <DialogDescription>
                  Enter customer details to add them to your CRM database.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {error && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">First Name *</label>
                    <Input
                      placeholder="Rahul"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Last Name</label>
                    <Input
                      placeholder="Sharma"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Phone Number *</label>
                  <Input
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Email Address</label>
                  <Input
                    type="email"
                    placeholder="rahul@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Address</label>
                  <Input
                    placeholder="Street, Area, Landmark"
                    value={formData.address_line1}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">City</label>
                    <Input
                      placeholder="Pune"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">State</label>
                    <Input
                      placeholder="Maharashtra"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">PIN Code</label>
                    <Input
                      placeholder="411014"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">GSTIN (Optional)</label>
                    <Input
                      placeholder="27AAAAA0000A1Z5"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Segment</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      value={formData.segment}
                      onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                    >
                      <option value="new">New Customer</option>
                      <option value="frequent">Frequent</option>
                      <option value="vip">VIP</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="min-w-[120px]">
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Customer"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by customer name, mobile number, or customer ID..."
                className="pl-10"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {totalCount > 0 ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount}` : "0 customers"}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No customers found
            </div>
          ) : (
            <>
              {/* Mobile Compact Customer Cards */}
              <div className="md:hidden space-y-3">
                {customers.map((customer) => {
                  const todayCount = customer.today_purchase_count ?? 0;
                  const todaySpend = customer.today_spend ?? 0;
                  const monthCount = customer.month_purchase_count ?? 0;
                  const monthSpend = customer.month_spend ?? 0;
                  const totalPurchases = customer.total_purchase_count ?? customer.total_purchases ?? 0;
                  const lifetimeSpend = customer.lifetime_spend ?? customer.total_spend ?? 0;

                  return (
                    <div key={customer.id} className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/customers/${customer.id}`}
                            className="font-bold text-base text-foreground hover:text-primary inline-flex items-center gap-1 truncate"
                          >
                            <span className="truncate">{customer.full_name}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </Link>
                          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mt-0.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{customer.phone}</span>
                          </div>
                          {customer.customer_id && (
                            <p className="text-[11px] font-mono text-muted-foreground/80 mt-0.5">
                              {customer.customer_id}
                            </p>
                          )}
                        </div>
                        <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-primary shrink-0">
                          {customer.segment || "New"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[11px] text-muted-foreground font-medium">Today</p>
                          <p className="font-semibold text-foreground mt-0.5">
                            {formatPurchaseCount(todayCount)} <span className="text-muted-foreground font-normal">|</span> {formatInr(todaySpend)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2">
                          <p className="text-[11px] text-muted-foreground font-medium">This Month</p>
                          <p className="font-semibold text-foreground mt-0.5">
                            {formatPurchaseCount(monthCount)} <span className="text-muted-foreground font-normal">|</span> {formatInr(monthSpend)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-xs">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">
                            Total Purchases: <strong className="text-foreground">{totalPurchases}</strong>
                          </p>
                          <p className="text-muted-foreground">
                            Lifetime Spend: <strong className="text-foreground">{formatInr(lifetimeSpend)}</strong>
                          </p>
                        </div>
                        <Link href={`/dashboard/customers/${customer.id}`}>
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Summary Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3 pr-4">Customer</th>
                      <th className="pb-3 pr-4">Mobile</th>
                      <th className="pb-3 pr-4">Today</th>
                      <th className="pb-3 pr-4">This Month</th>
                      <th className="pb-3 pr-4">Total Purchases</th>
                      <th className="pb-3 pr-4">Lifetime Spend</th>
                      <th className="pb-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {customers.map((customer) => {
                      const todayCount = customer.today_purchase_count ?? 0;
                      const todaySpend = customer.today_spend ?? 0;
                      const monthCount = customer.month_purchase_count ?? 0;
                      const monthSpend = customer.month_spend ?? 0;
                      const totalPurchases = customer.total_purchase_count ?? customer.total_purchases ?? 0;
                      const lifetimeSpend = customer.lifetime_spend ?? customer.total_spend ?? 0;

                      return (
                        <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3.5 pr-4">
                            <Link
                              href={`/dashboard/customers/${customer.id}`}
                              className="font-semibold text-foreground hover:text-primary inline-flex items-center gap-1"
                            >
                              <span>{customer.full_name}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              {customer.customer_id && (
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {customer.customer_id}
                                </span>
                              )}
                              <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">
                                {customer.segment || "New"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 pr-4 font-mono text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" />
                              {customer.phone}
                            </span>
                          </td>
                          <td className="py-3.5 pr-4">
                            <div className="font-semibold text-foreground">
                              {formatPurchaseCount(todayCount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatInr(todaySpend)}
                            </div>
                          </td>
                          <td className="py-3.5 pr-4">
                            <div className="font-semibold text-foreground">
                              {formatPurchaseCount(monthCount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatInr(monthSpend)}
                            </div>
                          </td>
                          <td className="py-3.5 pr-4 font-semibold text-foreground">
                            {totalPurchases}
                          </td>
                          <td className="py-3.5 pr-4 font-bold text-foreground">
                            {formatInr(lifetimeSpend)}
                          </td>
                          <td className="py-3.5 text-right">
                            <Link href={`/dashboard/customers/${customer.id}`}>
                              <Button size="sm" variant="outline">
                                View Details
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t text-xs text-muted-foreground">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
