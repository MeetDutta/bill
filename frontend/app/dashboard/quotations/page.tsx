"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { quotationApi, customerApi, posApi } from "@/services/api";
import type { Quotation, QuotationItem, Customer, Product } from "@/types";
import {
  FileCheck,
  Search,
  Plus,
  RefreshCw,
  Eye,
  Trash2,
  ArrowRight,
  Receipt,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  CreditCard,
  Edit2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");
  const [converting, setConverting] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState<{ invoice_number: string; invoice_id: string } | null>(null);

  // Create form state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customCustomerName, setCustomCustomerName] = useState("");
  const [customCustomerPhone, setCustomCustomerPhone] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Prices valid for 15 days from quote date. Standard warranty applies.");
  const [items, setItems] = useState<QuotationItem[]>([
    { name: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 18, total: 0 },
  ]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Available products for dropdown
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

  // Fetch Quotations
  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await quotationApi.list({
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });
      const data = res.data;
      if (Array.isArray(data)) {
        setQuotations(data);
        setTotalCount(data.length);
      } else if (data && Array.isArray(data.results)) {
        setQuotations(data.results);
        setTotalCount(data.count || data.results.length);
      } else {
        setQuotations([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error("Failed to load quotations:", err);
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // Load auxiliary data for Create Quotation modal
  const loadAuxiliaryData = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        customerApi.list(),
        posApi.searchProducts({ page_size: 50 }),
      ]);
      if (Array.isArray(custRes.data)) setCustomers(custRes.data);
      else if (custRes.data?.results) setCustomers(custRes.data.results);

      if (Array.isArray(prodRes.data)) setAvailableProducts(prodRes.data);
      else if (prodRes.data?.results) setAvailableProducts(prodRes.data.results);
    } catch (err) {
      console.error("Failed to load customer/product options:", err);
    }
  };

  const handleOpenCreate = () => {
    loadAuxiliaryData();
    // Default valid until 15 days ahead
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntil(d.toISOString().split("T")[0]);
    setItems([{ name: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 18, total: 0 }]);
    setSelectedCustomerId("");
    setCustomCustomerName("");
    setCustomCustomerPhone("");
    setNotes("");
    setFormError("");
    setShowCreateModal(true);
  };

  // Item calculations
  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    // Calculate line total
    const qty = parseFloat(String(item.quantity)) || 0;
    const price = parseFloat(String(item.unit_price)) || 0;
    const disc = parseFloat(String(item.discount)) || 0;
    const rate = parseFloat(String(item.tax_rate)) || 0;

    const sub = Math.max(0, qty * price - disc);
    const tax = sub * (rate / 100);
    item.total = Math.round((sub + tax) * 100) / 100;
    item.tax = Math.round(tax * 100) / 100;

    updated[index] = item;
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { name: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 18, total: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSelectProduct = (index: number, productId: string) => {
    const prod = availableProducts.find((p) => p.id === productId);
    if (!prod) return;
    const updated = [...items];
    const qty = updated[index].quantity || 1;
    const price = prod.unit_price || 0;
    const disc = updated[index].discount || 0;
    const rate = prod.tax_rate || 0;

    const sub = Math.max(0, Number(qty) * Number(price) - Number(disc));
    const tax = sub * (Number(rate) / 100);

    updated[index] = {
      product_id: prod.id,
      name: prod.name,
      unit_price: price,
      quantity: qty,
      discount: disc,
      tax_rate: rate,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((sub + tax) * 100) / 100,
    };
    setItems(updated);
  };

  // Summary totals for modal
  const calcSubtotal = items.reduce(
    (sum, it) => sum + (parseFloat(String(it.quantity)) || 0) * (parseFloat(String(it.unit_price)) || 0),
    0
  );
  const calcDiscount = items.reduce((sum, it) => sum + (parseFloat(String(it.discount)) || 0), 0);
  const calcTax = items.reduce((sum, it) => sum + (parseFloat(String(it.tax)) || 0), 0);
  const calcGrandTotal = items.reduce((sum, it) => sum + (parseFloat(String(it.total)) || 0), 0);

  // Submit Create Quotation
  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const validItems = items.filter((it) => it.name.trim() && (parseFloat(String(it.quantity)) || 0) > 0);
    if (validItems.length === 0) {
      setFormError("Please add at least one line item with a name and quantity.");
      return;
    }

    setCreating(true);
    try {
      await quotationApi.create({
        customer_id: selectedCustomerId || undefined,
        customer_name: customCustomerName || undefined,
        customer_phone: customCustomerPhone || undefined,
        valid_until: validUntil || undefined,
        notes,
        terms_and_conditions: terms,
        items: validItems,
      });
      setShowCreateModal(false);
      fetchQuotations();
    } catch (err: any) {
      setFormError(err.response?.data?.error || err.response?.data?.items || "Failed to create quotation.");
    } finally {
      setCreating(false);
    }
  };

  // Convert Quotation to Invoice
  const handleConvertClick = (q: Quotation) => {
    if (q.status === "converted") return;
    setQuotationToConvert(q);
    setConvertSuccess(null);
    setShowConvertModal(true);
  };

  const handleExecuteConvert = async () => {
    if (!quotationToConvert) return;
    setConverting(true);
    try {
      const res = await quotationApi.convert(quotationToConvert.id, {
        payment_method: convertPaymentMethod,
      });
      setConvertSuccess({
        invoice_number: res.data.invoice_number,
        invoice_id: res.data.invoice_id,
      });
      fetchQuotations();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to convert quotation to invoice.");
    } finally {
      setConverting(false);
    }
  };

  // Delete Quotation
  const handleDelete = async (q: Quotation) => {
    if (q.status === "converted") {
      alert("Cannot delete a quotation that has already been converted into an invoice.");
      return;
    }
    if (!confirm(`Are you sure you want to delete quote #${q.quotation_number}?`)) return;

    try {
      await quotationApi.delete(q.id);
      fetchQuotations();
      if (selectedQuotation?.id === q.id) setSelectedQuotation(null);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to delete quotation.");
    }
  };

  // View Details
  const handleViewDetails = async (q: Quotation) => {
    try {
      const res = await quotationApi.get(q.id);
      setSelectedQuotation(res.data);
    } catch {
      setSelectedQuotation(q);
    }
  };

  // Status badge styling
  const renderStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "converted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            CONVERTED
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
            <CheckCircle2 className="h-3 w-3" />
            ACCEPTED
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            REJECTED
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
            <Clock className="h-3 w-3" />
            SENT
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            EXPIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            DRAFT
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileCheck className="h-4 w-4 text-primary" />
            <span>Sales & Estimates</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Quotations & Estimates
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create professional price estimates and convert accepted quotes into official Invoices
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchQuotations()}
            className="flex items-center gap-1.5 rounded-lg border bg-card hover:bg-accent px-3 py-2 text-xs font-medium text-foreground transition-all shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>+ New Quotation</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search quotes by number, customer name, or phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by quotation status"
              className="rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="converted">Converted to Invoice</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>

            <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="Start Date"
              />
              <span className="text-muted-foreground">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-foreground focus:outline-none"
                title="End Date"
              />
            </div>

            {(searchTerm || statusFilter || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quotations Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Valid Until</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Total</th>
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
                      <span>Loading quotations...</span>
                    </div>
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FileCheck className="h-10 w-10 text-muted-foreground/40" />
                      <div>
                        <p className="font-semibold text-foreground text-sm">No Quotations Found</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Create your first price quotation to share with prospective customers.
                        </p>
                      </div>
                      <button
                        onClick={handleOpenCreate}
                        className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm"
                      >
                        + Create Quotation
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isConverted = q.status === "converted";

                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-accent/40 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetails(q)}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        {q.quotation_number}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.quotation_date || new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "No Expiry"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {q.customer_name || "Walk-in Customer"}
                        </div>
                        {q.customer_phone && (
                          <div className="text-[11px] text-muted-foreground">{q.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-foreground">
                        ₹{Number(q.total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">{renderStatusBadge(q.status)}</td>
                      <td
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetails(q)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {!isConverted ? (
                            <button
                              onClick={() => handleConvertClick(q)}
                              className="flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white shadow-xs"
                              title="Convert to Invoice"
                            >
                              <span>Convert</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <span
                              className="text-[11px] font-mono text-muted-foreground px-2 py-1 bg-muted rounded"
                              title={`Converted to Invoice #${q.converted_invoice_number || ""}`}
                            >
                              {q.converted_invoice_number ? `#${q.converted_invoice_number}` : "Converted"}
                            </span>
                          )}

                          {!isConverted && (
                            <button
                              onClick={() => handleDelete(q)}
                              className="rounded p-1 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                              title="Delete Quote"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > 20 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <div>
              Showing page {page} of {Math.ceil(totalCount / 20)} ({totalCount} total)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 rounded border px-2.5 py-1 disabled:opacity-40 hover:bg-accent"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <button
                disabled={page >= Math.ceil(totalCount / 20)}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded border px-2.5 py-1 disabled:opacity-40 hover:bg-accent"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE QUOTATION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Create New Quotation</h3>
                <p className="text-xs text-muted-foreground">
                  Build and calculate a formal price estimate for customer approval
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
              {formError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  {formError}
                </div>
              )}

              {/* Customer Selector & Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Select Customer</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      const c = customers.find((cust) => cust.id === e.target.value);
                      if (c) {
                        setCustomCustomerName(c.full_name);
                        setCustomCustomerPhone(c.phone || "");
                      }
                    }}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">-- Choose Existing or Enter Details Below --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.phone || "No phone"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Customer Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={customCustomerName}
                    onChange={(e) => setCustomCustomerName(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Customer Mobile</label>
                  <input
                    type="text"
                    placeholder="10-digit mobile"
                    value={customCustomerPhone}
                    onChange={(e) => setCustomCustomerPhone(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Quotation Valid Until</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Internal Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Client requested 5% discount on bulk"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Line Items Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground">
                    Items & Pricing Breakdown
                  </h4>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-primary hover:underline font-semibold text-xs flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 border rounded-xl p-3 bg-muted/20">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-card p-2 rounded-lg border">
                      <div className="col-span-12 sm:col-span-4">
                        {availableProducts.length > 0 && (
                          <select
                            onChange={(e) => handleSelectProduct(idx, e.target.value)}
                            className="w-full mb-1 text-[11px] border rounded px-1.5 py-1 bg-background text-muted-foreground"
                          >
                            <option value="">-- Choose Product Preset --</option>
                            {availableProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (₹{p.unit_price})
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          required
                          placeholder="Item Name"
                          value={item.name}
                          onChange={(e) => updateItem(idx, "name", e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <label className="block text-[10px] text-muted-foreground">Qty</label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          required
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background text-center"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <label className="block text-[10px] text-muted-foreground">Unit Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs bg-background text-right"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] text-muted-foreground">Tax %</label>
                        <input
                          type="number"
                          min="0"
                          value={item.tax_rate}
                          onChange={(e) => updateItem(idx, "tax_rate", e.target.value)}
                          className="w-full border rounded px-1.5 py-1 text-xs bg-background text-center"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2 text-right">
                        <label className="block text-[10px] text-muted-foreground">Line Total</label>
                        <span className="font-bold text-foreground">₹{Number(item.total || 0).toFixed(2)}</span>
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Summary */}
              <div className="rounded-xl bg-muted/40 p-4 space-y-1.5 border">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{calcSubtotal.toFixed(2)}</span>
                </div>
                {calcDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Total Discount</span>
                    <span className="font-mono">- ₹{calcDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Estimated Tax (GST)</span>
                  <span className="font-mono">₹{calcTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-foreground border-t pt-2 mt-1">
                  <span>Quotation Grand Total</span>
                  <span className="font-mono text-primary">₹{calcGrandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Terms and conditions */}
              <div>
                <label className="block font-semibold mb-1">Terms & Conditions</label>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full rounded-lg border bg-background p-2 text-xs focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="border-t pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-primary text-primary-foreground px-5 py-2 font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Saving Quotation..." : "Create Quotation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONVERT TO INVOICE MODAL */}
      {showConvertModal && quotationToConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl text-foreground">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Convert to Tax Invoice</h3>
                <p className="text-xs text-muted-foreground">
                  Quotation #{quotationToConvert.quotation_number}
                </p>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {convertSuccess ? (
              <div className="py-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">Successfully Converted!</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invoice <span className="font-mono font-bold text-foreground">#{convertSuccess.invoice_number}</span> has been issued and inventory deducted.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Link
                    href={`/dashboard/invoices`}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
                  >
                    View in Invoices
                  </Link>
                  <button
                    onClick={() => setShowConvertModal(false)}
                    className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-accent"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-4 text-xs">
                <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold">{quotationToConvert.customer_name || "Walk-in"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bill Amount:</span>
                    <span className="font-bold text-foreground font-mono text-sm">
                      ₹{Number(quotationToConvert.total || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Tender / Payment Method</label>
                  <select
                    value={convertPaymentMethod}
                    onChange={(e) => setConvertPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / QR Code</option>
                    <option value="card">Card (Debit/Credit)</option>
                    <option value="credit">Credit / Udhaar</option>
                  </select>
                </div>

                <div className="rounded-lg bg-blue-500/10 p-3 text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Action will:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    <li>Generate an official sequential tax invoice</li>
                    <li>Deduct stock from store inventory for tracked items</li>
                    <li>Mark this quotation as converted permanently</li>
                  </ul>
                </div>

                <div className="border-t pt-4 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowConvertModal(false)}
                    className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteConvert}
                    disabled={converting}
                    className="rounded-lg bg-emerald-600 text-white px-5 py-2 font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {converting ? "Converting..." : "Confirm & Issue Invoice"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold font-mono text-foreground">
                    #{selectedQuotation.quotation_number}
                  </h3>
                  {renderStatusBadge(selectedQuotation.status)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Issued on: {selectedQuotation.quotation_date || new Date(selectedQuotation.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Customer</span>
                  <div className="font-semibold text-sm mt-0.5">{selectedQuotation.customer_name || "Walk-in"}</div>
                  {selectedQuotation.customer_phone && (
                    <div className="text-muted-foreground font-mono">{selectedQuotation.customer_phone}</div>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Validity</span>
                  <div className="font-semibold text-sm mt-0.5">
                    {selectedQuotation.valid_until ? new Date(selectedQuotation.valid_until).toLocaleDateString() : "Open"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Items</h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b text-[10px] font-bold uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-2 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Price</th>
                        <th className="py-2 px-3 text-right">Tax</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {selectedQuotation.items && selectedQuotation.items.length > 0 ? (
                        selectedQuotation.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-medium">{it.name}</td>
                            <td className="py-2 px-2 text-center font-mono">{it.quantity}</td>
                            <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                              ₹{Number(it.tax || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">
                              ₹{Number(it.total || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-muted-foreground">
                            No items details available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1 border-t pt-3">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{Number(selectedQuotation.subtotal || 0).toFixed(2)}</span>
                </div>
                {Number(selectedQuotation.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-mono">- ₹{Number(selectedQuotation.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (GST)</span>
                  <span className="font-mono">₹{Number(selectedQuotation.tax || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-foreground border-t pt-2">
                  <span>Total Amount</span>
                  <span className="font-mono text-primary">₹{Number(selectedQuotation.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {selectedQuotation.converted_invoice && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                  <div>
                    <span className="font-semibold text-xs">Converted to Invoice: </span>
                    <span className="font-mono text-xs">{selectedQuotation.converted_invoice_number || "Issued"}</span>
                  </div>
                  <Link href={`/dashboard/invoices`} className="text-xs underline font-semibold flex items-center gap-1">
                    <span>View Invoices</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>

            <div className="border-t pt-4 flex items-center justify-between">
              {selectedQuotation.status !== "converted" ? (
                <button
                  onClick={() => {
                    setSelectedQuotation(null);
                    handleConvertClick(selectedQuotation);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 font-semibold shadow-sm"
                >
                  <span>Convert to Invoice</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  This quotation has been converted into an invoice.
                </div>
              )}

              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg border px-4 py-2 font-semibold hover:bg-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
