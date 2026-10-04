"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";
import type { Customer } from "@/types";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { Search, Plus, UserPlus, Loader2, ArrowUpRight } from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    city: "",
    segment: "new",
  });

  const fetchCustomers = async () => {
    try {
      const res = await customerApi.list();
      setCustomers(res.data.results || []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

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
        city: formData.city.trim(),
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
        city: "",
        segment: "new",
      });
      await fetchCustomers();
    } catch (err: unknown) {
      setError(parseApiError(err, "Failed to create customer. Please check input values."));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = customers.filter(
    (c) =>
      (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customers</h2>
          <p className="text-sm text-muted-foreground">Manage your customer relationships, CRM profiles, and loyalty details.</p>
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

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">City</label>
                    <Input
                      placeholder="Mumbai"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers by name, phone, or email..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading customers...</p>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              No customers found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Phone</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Purchases</th>
                    <th className="pb-3 pr-4">Total Spend</th>
                    <th className="pb-3">Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((customer) => (
                    <tr key={customer.id} className="border-b">
                      <td className="py-3 pr-4 font-medium"><Link className="inline-flex items-center gap-1 hover:text-primary" href={`/dashboard/customers/${customer.id}`}>{customer.full_name}<ArrowUpRight className="h-3 w-3" /></Link></td>
                      <td className="py-3 pr-4">{customer.phone}</td>
                      <td className="py-3 pr-4">{customer.email || "—"}</td>
                      <td className="py-3 pr-4">{customer.total_purchases}</td>
                      <td className="py-3 pr-4">
                        ₹{Number(customer.total_spend || 0).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold capitalize text-primary">
                          {customer.segment || "New"}
                        </span>
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
  );
}
