"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supplierApi } from "@/services/api";
import type { Supplier, PurchaseOrder } from "@/types";
import {
  Truck,
  Search,
  Plus,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Building,
  CheckCircle2,
  XCircle,
  Eye,
  Edit2,
  Trash2,
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierPurchases, setSupplierPurchases] = useState<PurchaseOrder[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
    pan: "",
    notes: "",
    opening_balance: "0",
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supplierApi.list({
        search: searchTerm || undefined,
        is_active: statusFilter ? statusFilter === "active" : undefined,
      });
      const data = res.data;
      if (Array.isArray(data)) {
        setSuppliers(data);
      } else if (data && Array.isArray(data.results)) {
        setSuppliers(data.results);
      } else {
        setSuppliers([]);
      }
    } catch (err) {
      console.error("Failed to load suppliers:", err);
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      gstin: "",
      pan: "",
      notes: "",
      opening_balance: "0",
      is_active: true,
    });
    setFormError("");
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFormData({
      name: sup.name,
      contact_person: sup.contact_person || "",
      phone: sup.phone || "",
      email: sup.email || "",
      address: sup.address || "",
      gstin: sup.gstin || "",
      pan: sup.pan || "",
      notes: sup.notes || "",
      opening_balance: String(sup.opening_balance || 0),
      is_active: sup.is_active,
    });
    setFormError("");
    setShowAddModal(true);
  };

  // Open Detail Modal
  const handleOpenDetail = async (sup: Supplier) => {
    setSelectedSupplier(sup);
    setPurchasesLoading(true);
    try {
      const res = await supplierApi.getPurchases(sup.id);
      const data = res.data;
      if (Array.isArray(data)) setSupplierPurchases(data);
      else if (data?.results) setSupplierPurchases(data.results);
      else setSupplierPurchases([]);
    } catch {
      setSupplierPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  };

  // Submit Supplier (Create / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      if (editingSupplier) {
        await supplierApi.update(editingSupplier.id, formData);
      } else {
        await supplierApi.create(formData);
      }
      setShowAddModal(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(
        err.response?.data?.name || err.response?.data?.error || "Failed to save supplier."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Active
  const handleToggleActive = async (sup: Supplier) => {
    try {
      await supplierApi.update(sup.id, { is_active: !sup.is_active });
      fetchSuppliers();
    } catch (err: any) {
      alert("Failed to update supplier status.");
    }
  };

  // Metric counts
  const totalPurchasesSum = suppliers.reduce(
    (sum, s) => sum + (parseFloat(String(s.total_purchases)) || 0),
    0
  );
  const activeCount = suppliers.filter((s) => s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Truck className="h-4 w-4 text-primary" />
            <span>Purchasing & Supply Chain</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Supplier Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage vendor profiles, contact details, GSTIN, and track purchase order history
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSuppliers()}
            className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-medium text-foreground transition-all shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>+ Add Supplier</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Vendors</span>
            <Building className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{suppliers.length}</span>
            <span className="text-[11px] text-muted-foreground">registered</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Active Suppliers</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">{activeCount}</span>
            <span className="text-[11px] text-muted-foreground">procurement active</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Purchases</span>
            <Truck className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              ₹{totalPurchasesSum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search suppliers by name, contact person, mobile, or GSTIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by supplier status"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {(searchTerm || statusFilter) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("");
                }}
                className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Contact Person</th>
                <th className="py-3 px-4">Phone & Email</th>
                <th className="py-3 px-4">GSTIN / Tax ID</th>
                <th className="py-3 px-4">Total Purchases</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                      <span>Loading suppliers...</span>
                    </div>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Truck className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">No Suppliers Found</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Add your vendors and suppliers to organize stock-in purchases.
                        </p>
                      </div>
                      <button
                        onClick={handleOpenAdd}
                        className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                      >
                        + Add Supplier
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr
                    key={sup.id}
                    className="hover:bg-accent/40 transition-colors group cursor-pointer"
                    onClick={() => handleOpenDetail(sup)}
                  >
                    <td className="py-3 px-4 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {sup.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{sup.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {sup.contact_person || "—"}
                    </td>
                    <td className="py-3 px-4">
                      {sup.phone ? (
                        <div className="font-mono text-foreground">{sup.phone}</div>
                      ) : (
                        <div className="text-muted-foreground">—</div>
                      )}
                      {sup.email && (
                        <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{sup.email}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {sup.gstin || "—"}
                    </td>
                    <td className="py-3 px-4 font-bold text-foreground">
                      ₹
                      {Number(sup.total_purchases || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      {Number(sup.purchase_orders_count || 0) > 0 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({sup.purchase_orders_count} POs)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          sup.is_active
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            sup.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                          )}
                        />
                        {sup.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(sup)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="View Supplier"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(sup)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit Supplier"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(sup)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground text-[11px] font-semibold px-1.5"
                          title={sup.is_active ? "Deactivate" : "Activate"}
                        >
                          {sup.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Record vendor details for purchasing and inventory replenishment
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              {formError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Supplier / Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Electronics Ltd"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Vikram Mehta"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Phone / Mobile</label>
                  <input
                    type="text"
                    placeholder="10-digit mobile"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="vendor@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street address, city, state"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  placeholder="Credit term (e.g. 30 days net), bank details, etc."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border bg-background p-2 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active_checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-primary focus:ring-primary/20"
                />
                <label htmlFor="is_active_checkbox" className="font-semibold cursor-pointer">
                  Supplier is active for purchasing
                </label>
              </div>

              <div className="border-t pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary text-primary-foreground px-5 py-2 font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Create Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL & PURCHASE HISTORY MODAL */}
      {selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">{selectedSupplier.name}</h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      selectedSupplier.is_active
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {selectedSupplier.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vendor Profile & Purchase History
                </p>
              </div>
              <button
                onClick={() => setSelectedSupplier(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
              {/* Profile Details */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Contact Person</span>
                  <div className="font-semibold text-sm">{selectedSupplier.contact_person || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Phone</span>
                  <div className="font-mono text-sm">{selectedSupplier.phone || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Email</span>
                  <div className="truncate">{selectedSupplier.email || "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">GSTIN</span>
                  <div className="font-mono">{selectedSupplier.gstin || "—"}</div>
                </div>
                {selectedSupplier.address && (
                  <div className="col-span-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Address</span>
                    <div>{selectedSupplier.address}</div>
                  </div>
                )}
              </div>

              {/* Purchase History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
                    Purchase Orders from this Supplier
                  </h4>
                  <Link
                    href={`/dashboard/purchases?supplier_id=${selectedSupplier.id}`}
                    className="text-primary hover:underline font-semibold text-xs flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Record New Purchase</span>
                  </Link>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b text-[10px] font-bold uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3">PO #</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {purchasesLoading ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin mx-auto text-primary" />
                          </td>
                        </tr>
                      ) : supplierPurchases.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            No purchase orders recorded yet for this supplier.
                          </td>
                        </tr>
                      ) : (
                        supplierPurchases.map((po) => (
                          <tr key={po.id} className="hover:bg-muted/20">
                            <td className="py-2 px-3 font-mono font-semibold">{po.po_number}</td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {po.purchase_date || new Date(po.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-3 font-mono">{po.supplier_invoice_number || "—"}</td>
                            <td className="py-2 px-3 font-bold">₹{Number(po.total_amount).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">
                              <span className="rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                                {po.status || "RECEIVED"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedSupplier(null);
                  handleOpenEdit(selectedSupplier);
                }}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>Edit Profile</span>
              </button>

              <button
                onClick={() => setSelectedSupplier(null)}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
