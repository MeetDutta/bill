"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { parseApiError } from "@/lib/api-error";
import { staffApi, quotationApi, posApi, customerApi } from "@/services/api";
import type { Quotation, QuotationItem, Customer, POSProduct } from "@/types";
import {
  Search,
  Plus,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Eye,
  ArrowRight,
  CreditCard,
  Banknote,
  QrCode,
  Trash2,
  Calendar,
} from "lucide-react";

export default function StaffQuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableProducts, setAvailableProducts] = useState<POSProduct[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customCustomerName, setCustomCustomerName] = useState("");
  const [customCustomerPhone, setCustomCustomerPhone] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<Array<QuotationItem & { original_price?: number }>>([
    { name: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 18, total: 0 },
  ]);

  // Convert Modal
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [quotationToConvert, setQuotationToConvert] = useState<Quotation | null>(null);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");
  const [splitPayments, setSplitPayments] = useState<Array<{ payment_method: string; amount: number }>>([
    { payment_method: "cash", amount: 0 },
  ]);
  const [isSplit, setIsSplit] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertSuccess, setConvertSuccess] = useState<{ invoice_number: string; invoice_id: string } | null>(null);

  // Detail Modal
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  const fetchQuotations = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await staffApi.getQuotations({
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
      });

      if (res.data?.results) {
        setQuotations(res.data.results);
        setTotalCount(res.data.count || 0);
        setTotalPages(Math.ceil((res.data.count || 1) / 25));
      } else if (Array.isArray(res.data)) {
        setQuotations(res.data);
        setTotalCount(res.data.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Failed to load staff quotations:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  const loadAuxiliaryData = async () => {
    try {
      const [custRes, prodRes] = await Promise.all([
        customerApi.list(),
        posApi.searchProducts({ page_size: 100 }),
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

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
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

  const handleSelectProduct = (index: number, productId: string) => {
    const prod = availableProducts.find((p) => p.id === productId);
    if (!prod) return;
    const authoritativePrice = Number(prod.selling_price ?? (prod as any).unit_price) || 0;
    const updated = [...items];
    const qty = updated[index].quantity || 1;
    const disc = updated[index].discount || 0;
    const rate = Number(prod.tax_rate ?? 18);

    const sub = Math.max(0, Number(qty) * authoritativePrice - Number(disc));
    const tax = sub * (rate / 100);

    updated[index] = {
      product_id: prod.id,
      name: prod.name,
      unit_price: authoritativePrice,
      original_price: authoritativePrice,
      quantity: qty,
      discount: disc,
      tax_rate: rate,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((sub + tax) * 100) / 100,
      hsn_code: prod.hsn_code || "",
      unit: prod.unit || "pcs",
    };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { name: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 18, total: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const calcSubtotal = items.reduce(
    (sum, it) => sum + (parseFloat(String(it.quantity)) || 0) * (parseFloat(String(it.unit_price)) || 0),
    0
  );
  const calcDiscount = items.reduce((sum, it) => sum + (parseFloat(String(it.discount)) || 0), 0);
  const calcTax = items.reduce((sum, it) => sum + (parseFloat(String(it.tax)) || 0), 0);
  const calcGrandTotal = items.reduce((sum, it) => sum + (parseFloat(String(it.total)) || 0), 0);

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const validItems = items.filter((it) => it.name && (Number(it.quantity) || 0) > 0);
    if (validItems.length === 0) {
      setFormError("Add at least one item with a valid name and quantity.");
      return;
    }

    setCreating(true);
    try {
      await quotationApi.create({
        customer_id: selectedCustomerId || undefined,
        customer_name: customCustomerName || undefined,
        customer_phone: customCustomerPhone || undefined,
        valid_until: validUntil || undefined,
        notes: notes || undefined,
        items: validItems.map((it) => ({
          product_id: it.product_id || undefined,
          name: it.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: it.discount,
          tax_rate: it.tax_rate,
          hsn_code: it.hsn_code,
          unit: it.unit,
        })),
      });
      setShowCreateModal(false);
      fetchQuotations(false);
    } catch (err: any) {
      setFormError(err.response?.data?.detail || err.response?.data?.error || "Failed to create quotation.");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenConvert = (q: Quotation) => {
    if (q.status === "converted") return;
    setQuotationToConvert(q);
    setConvertSuccess(null);
    setConvertError(null);
    setConvertPaymentMethod("cash");
    setIsSplit(false);
    const half = Math.floor(Number(q.total || 0) / 2);
    setSplitPayments([
      { payment_method: "cash", amount: half },
      { payment_method: "upi", amount: Number(q.total || 0) - half },
    ]);
    setShowConvertModal(true);
  };

  const handleExecuteConvert = async () => {
    if (!quotationToConvert || converting) return;
    setConverting(true);
    setConvertError(null);
    try {
      const payload: any = isSplit
        ? { payments: splitPayments.filter((p) => p.amount > 0) }
        : { payment_method: convertPaymentMethod };

      const res = await quotationApi.convert(quotationToConvert.id, payload);
      setConvertSuccess({
        invoice_id: res.data.invoice_id,
        invoice_number: res.data.invoice_number,
      });
      fetchQuotations(true);
    } catch (err: unknown) {
      const errorMsg = parseApiError(err, "Failed to convert quotation to invoice.");
      setConvertError(errorMsg);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">My Quotations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Price estimates created by you ({totalCount} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchQuotations(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 shadow-sm transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search quote # or customer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent to Customer</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-xs focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Valid Until</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Loading your quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No quotations found. Click &quot;New Quotation&quot; to draft one.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isConverted = q.status === "converted";
                  return (
                    <tr key={q.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        #{q.quotation_number}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.quotation_date || new Date(q.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">
                          {(typeof q.customer === "object" ? q.customer?.full_name : null) || q.customer_name || "Walk-in Customer"}
                        </div>
                        {((typeof q.customer === "object" ? q.customer?.phone : null) || q.customer_phone) && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {(typeof q.customer === "object" ? q.customer?.phone : null) || q.customer_phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {q.valid_until || "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(Number(q.total || 0))}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isConverted
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              : (q.status === "rejected" || q.status === "expired")
                              ? "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {q.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedQuotation(q)}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                            title="View Quote Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {!isConverted && q.status !== "rejected" && q.status !== "expired" && (
                            <button
                              onClick={() => handleOpenConvert(q)}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 shadow-xs"
                              title="Convert to Official Tax Invoice"
                            >
                              Convert &amp; Pay
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
      </div>

      {/* CREATE QUOTATION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4 my-8">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Create Price Quotation</h3>
                <p className="text-xs text-muted-foreground">
                  Draft a customer estimate. Stock is not reserved until converted.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateQuotation} className="space-y-4 text-xs">
              {/* Customer & Valid Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Customer</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                  >
                    <option value="">Walk-in / Custom Name</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.phone || "No phone"})
                      </option>
                    ))}
                  </select>
                </div>

                {!selectedCustomerId && (
                  <div>
                    <label className="block font-semibold mb-1">Customer Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={customCustomerName}
                      onChange={(e) => setCustomCustomerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold mb-1">Valid Until Date</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-background"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-foreground">Quotation Items</h4>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-[11px] font-bold text-foreground px-2 py-1 rounded border hover:bg-accent flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border bg-muted/20 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2"
                    >
                      {/* Product Selector */}
                      <div className="flex-1">
                        <select
                          value={it.product_id || ""}
                          onChange={(e) => handleSelectProduct(idx, e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded border bg-background text-xs"
                        >
                          <option value="">Custom Item / Select Product...</option>
                          {availableProducts.map((p) => {
                            const pPrice = Number(p.selling_price ?? (p as any).unit_price) || 0;
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.sku ? `(${p.sku})` : ""} - ₹{pPrice} | Stock: {p.current_stock || 0}
                              </option>
                            );
                          })}
                        </select>
                        {!it.product_id && (
                          <input
                            type="text"
                            placeholder="Enter item description..."
                            value={it.name}
                            onChange={(e) => updateItem(idx, "name", e.target.value)}
                            className="w-full px-2.5 py-1 rounded border bg-background text-xs mt-1"
                          />
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="w-20">
                        <span className="text-[10px] text-muted-foreground sm:hidden">Qty: </span>
                        <input
                          type="number"
                          min="1"
                          step="any"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className="w-full px-2 py-1.5 rounded border bg-background text-center text-xs"
                          placeholder="Qty"
                        />
                      </div>

                      {/* Selling Price / Rate */}
                      <div className="w-28">
                        <span className="text-[10px] text-muted-foreground sm:hidden">Rate: </span>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                          className="w-full px-2 py-1.5 rounded border bg-background text-right text-xs"
                          placeholder="Unit Price"
                        />
                        {it.original_price !== undefined && it.original_price !== Number(it.unit_price) && (
                          <div className="text-[9px] text-muted-foreground text-right mt-0.5">
                            Orig: ₹{it.original_price}
                          </div>
                        )}
                      </div>

                      {/* Tax % */}
                      <div className="w-20">
                        <span className="text-[10px] text-muted-foreground sm:hidden">Tax %: </span>
                        <input
                          type="number"
                          step="1"
                          value={it.tax_rate}
                          onChange={(e) => updateItem(idx, "tax_rate", e.target.value)}
                          className="w-full px-2 py-1.5 rounded border bg-background text-center text-xs"
                          placeholder="Tax %"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="w-28 text-right font-mono font-bold text-foreground">
                        ₹{Number(it.total || 0).toFixed(2)}
                      </div>

                      {/* Remove */}
                      <div>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="border-t pt-3 flex flex-col items-end space-y-1">
                <div className="flex justify-between w-64 text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{calcSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64 text-muted-foreground">
                  <span>Taxes (GST):</span>
                  <span className="font-mono">₹{calcTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64 font-black text-sm text-foreground pt-1 border-t">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{calcGrandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-lg bg-foreground text-background font-bold hover:bg-foreground/90 disabled:opacity-50"
                >
                  {creating ? "Creating Quote..." : "Save Quotation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONVERT TO INVOICE & PAY MODAL */}
      {showConvertModal && quotationToConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Convert Quote &amp; Record Payment</h3>
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
                    href={`/staff/billing?view=history`}
                    className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-bold shadow-xs"
                  >
                    View in My Invoices
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
              <div className="space-y-4 text-xs">
                {convertError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="flex-1 font-medium">{convertError}</span>
                  </div>
                )}
                <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold">
                      {quotationToConvert.customer?.full_name || quotationToConvert.customer_name || "Walk-in"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-muted-foreground font-semibold">Total Payable:</span>
                    <span className="font-black text-foreground font-mono text-base">
                      {formatCurrency(Number(quotationToConvert.total || 0))}
                    </span>
                  </div>
                </div>

                {/* Single vs Split Toggle */}
                <div className="flex items-center justify-between">
                  <label className="font-semibold">Payment Allocation</label>
                  <button
                    type="button"
                    onClick={() => setIsSplit(!isSplit)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {isSplit ? "Switch to Single Method" : "Split Payment (Cash + UPI)"}
                  </button>
                </div>

                {!isSplit ? (
                  <div>
                    <select
                      value={convertPaymentMethod}
                      onChange={(e) => setConvertPaymentMethod(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                    >
                      <option value="cash">Cash Tender</option>
                      <option value="upi">UPI / Instant QR</option>
                      <option value="card">Card (Debit/Credit POS)</option>
                      <option value="netbanking">Net Banking</option>
                      <option value="credit">Credit / Udhaar (Registered Customers)</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                    {splitPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={p.payment_method}
                          onChange={(e) => {
                            const updated = [...splitPayments];
                            updated[idx].payment_method = e.target.value;
                            setSplitPayments(updated);
                          }}
                          className="w-28 rounded border px-2 py-1.5 bg-background text-xs font-semibold"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="credit">Credit</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          value={p.amount}
                          onChange={(e) => {
                            const updated = [...splitPayments];
                            updated[idx].amount = parseFloat(e.target.value) || 0;
                            setSplitPayments(updated);
                          }}
                          className="flex-1 rounded border px-2 py-1.5 bg-background text-right font-mono text-xs"
                          placeholder="Amount"
                        />
                      </div>
                    ))}
                    <div className="text-[11px] text-right text-muted-foreground pt-1">
                      Total Tendered: ₹{splitPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}
                    </div>
                  </div>
                )}

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
                    className="rounded-lg bg-emerald-600 text-white px-5 py-2 font-bold shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {converting ? "Processing..." : "Confirm & Finalize Invoice"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl text-foreground space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Quotation #{selectedQuotation.quotation_number}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Dated: {selectedQuotation.quotation_date || new Date(selectedQuotation.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedQuotation(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 flex justify-between">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <div className="font-semibold">
                    {selectedQuotation.customer?.full_name || selectedQuotation.customer_name || "Walk-in Customer"}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Status:</span>
                  <div>
                    <span className="font-bold uppercase text-foreground">{selectedQuotation.status}</span>
                  </div>
                </div>
              </div>

              {selectedQuotation.items && selectedQuotation.items.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] font-bold border-b">
                      <tr>
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedQuotation.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-medium">{it.name}</td>
                          <td className="py-2 px-3 text-center">{it.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">₹{Number(it.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t pt-2 space-y-1 text-right">
                <div className="flex justify-between font-black text-sm text-foreground">
                  <span>Total Amount:</span>
                  <span className="font-mono">₹{Number(selectedQuotation.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-3 flex justify-end">
              <button
                onClick={() => setSelectedQuotation(null)}
                className="px-4 py-2 rounded-lg border font-semibold hover:bg-accent text-xs"
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
