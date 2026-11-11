"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { customerApi, posApi, quotationApi } from "@/services/api";
import { formatCurrency, parseApiError } from "@/lib/utils";
import type {
  BusinessConfig,
  Customer,
  POSProduct,
  Quotation,
  QuotationItem,
} from "@/types";

export interface QuotationCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (quotation: Quotation) => void;
  initialCustomer?: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
  } | null;
  initialItems?: QuotationItem[];
  initialNotes?: string;
  initialTerms?: string;
  title?: string;
}

interface DraftQuotationItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  original_price?: number;
  discount: number;
  tax_rate: number;
  hsn_code: string;
  unit: string;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const defaultValidUntil = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split("T")[0];
};

const createEmptyItem = (defaultTaxRate = 18): DraftQuotationItem => ({
  product_id: "",
  name: "",
  quantity: 1,
  unit_price: 0,
  discount: 0,
  tax_rate: defaultTaxRate,
  hsn_code: "",
  unit: "pcs",
});

function calculateItemAmounts(
  item: DraftQuotationItem,
  gstEnabled: boolean,
  isTaxInclusive: boolean
) {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const price = Math.max(0, Number(item.unit_price) || 0);
  const subtotal = round2(qty * price);
  const discount = Math.min(subtotal, Math.max(0, Number(item.discount) || 0));
  const grossLine = Math.max(0, round2(subtotal - discount));
  const rate = gstEnabled ? Math.max(0, Number(item.tax_rate) || 0) : 0;

  if (!gstEnabled || rate <= 0) {
    return {
      subtotal,
      discount,
      tax: 0,
      total: grossLine,
    };
  }

  if (isTaxInclusive) {
    const divisor = 1 + rate / 100;
    const taxable = round2(grossLine / divisor);
    const tax = round2(grossLine - taxable);
    return {
      subtotal,
      discount,
      tax,
      total: grossLine,
    };
  }

  const tax = round2(grossLine * (rate / 100));
  return {
    subtotal,
    discount,
    tax,
    total: round2(grossLine + tax),
  };
}

export function QuotationCreateModal({
  open,
  onClose,
  onCreated,
  initialCustomer,
  initialItems,
  initialNotes,
  initialTerms,
  title = "Create New Quotation",
}: QuotationCreateModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loadingAux, setLoadingAux] = useState(false);
  const [auxError, setAuxError] = useState("");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [quoteStatus, setQuoteStatus] = useState<"draft" | "sent">("draft");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [searchedProducts, setSearchedProducts] = useState<POSProduct[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [items, setItems] = useState<DraftQuotationItem[]>([createEmptyItem(18)]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const termsEditedRef = useRef(false);

  const gstEnabled = config ? config.gst_enabled : true;
  const isTaxInclusive = config?.tax_mode === "inclusive";
  const defaultTaxRate = useMemo(() => {
    if (config && config.gst_enabled === false) return 0;
    const rate = Number(config?.default_tax_rate ?? 18);
    return Number.isFinite(rate) ? rate : 18;
  }, [config]);

  const loadAuxiliaryData = useCallback(async () => {
    setLoadingAux(true);
    setAuxError("");
    try {
      const [custRes, prodRes, cfgRes] = await Promise.allSettled([
        customerApi.list({ page_size: 100 }),
        posApi.searchProducts({ page_size: 100 }),
        posApi.getConfig(),
      ]);

      const errors: string[] = [];

      if (custRes.status === "fulfilled") {
        const list = Array.isArray(custRes.value.data)
          ? custRes.value.data
          : custRes.value.data?.results || [];
        setCustomers(list);
      } else {
        errors.push(`Customers: ${parseApiError(custRes.reason, "Failed to load")}`);
      }

      if (prodRes.status === "fulfilled") {
        const list = Array.isArray(prodRes.value.data)
          ? prodRes.value.data
          : prodRes.value.data?.results || [];
        setProducts(list);
      } else {
        errors.push(`Products: ${parseApiError(prodRes.reason, "Failed to load")}`);
      }

      if (cfgRes.status === "fulfilled" && cfgRes.value.data) {
        const loadedCfg = cfgRes.value.data as BusinessConfig;
        setConfig(loadedCfg);
        if (!termsEditedRef.current && !initialTerms && loadedCfg.invoice_terms_and_conditions) {
          setTerms(loadedCfg.invoice_terms_and_conditions);
        }
      }

      if (errors.length > 0) {
        setAuxError(errors.join(" • "));
      }
    } catch (err) {
      setAuxError(parseApiError(err, "Failed to load catalog or customer list."));
    } finally {
      setLoadingAux(false);
    }
  }, [initialTerms]);

  // Reset and hydrate whenever modal opens
  useEffect(() => {
    if (!open) return;

    termsEditedRef.current = Boolean(initialTerms);
    setFormError("");
    setAuxError("");
    setProductQuery("");
    setCustomerSearch("");
    setSearchedProducts([]);
    setSelectedCustomerId(initialCustomer?.id || "");
    setCustomerName(initialCustomer?.name || "");
    setCustomerPhone(initialCustomer?.phone || "");
    setCustomerEmail(initialCustomer?.email || "");
    setValidUntil(defaultValidUntil());
    setQuoteStatus("draft");
    setNotes(initialNotes || "");
    setTerms(initialTerms || "");

    if (initialItems && initialItems.length > 0) {
      setItems(
        initialItems.map((it) => ({
          product_id: String(it.product_id || it.product || ""),
          name: it.name || "",
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          original_price:
            it.original_price !== undefined ? Number(it.original_price) : undefined,
          discount: Number(it.discount) || 0,
          tax_rate: Number(it.tax_rate) || 0,
          hsn_code: it.hsn_code || "",
          unit: it.unit || "pcs",
        }))
      );
    } else {
      setItems([createEmptyItem(18)]);
    }

    loadAuxiliaryData();
  }, [open, initialCustomer, initialItems, initialNotes, initialTerms, loadAuxiliaryData]);

  // Debounced backend product search for large catalogs
  useEffect(() => {
    if (!open) return;
    const q = productQuery.trim();
    if (!q) {
      setSearchedProducts([]);
      setSearchingProducts(false);
      return;
    }

    const handle = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const res = await posApi.searchProducts({ q, search: q, page_size: 25 });
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setSearchedProducts(list);
      } catch {
        setSearchedProducts([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 220);

    return () => clearTimeout(handle);
  }, [open, productQuery]);

  // Close cleanly on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, submitting]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.full_name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const quickSearchMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    if (searchedProducts.length > 0) return searchedProducts;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.barcode || "").toLowerCase().includes(q)
    );
  }, [productQuery, searchedProducts, products]);

  // Merge searched products into known product lookup list so dropdown keeps selected value valid
  const allKnownProducts = useMemo(() => {
    const map = new Map<string, POSProduct>();
    products.forEach((p) => map.set(p.id, p));
    searchedProducts.forEach((p) => map.set(p.id, p));
    return Array.from(map.values());
  }, [products, searchedProducts]);

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      return;
    }
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setCustomerName(found.full_name || `${found.first_name || ""} ${found.last_name || ""}`.trim());
      setCustomerPhone(found.phone || "");
      setCustomerEmail(found.email || "");
    }
  };

  const addProductFromCatalog = (prod: POSProduct) => {
    const catalogPrice = Number(prod.selling_price ?? 0);
    const catalogTax = gstEnabled ? Number(prod.tax_rate ?? defaultTaxRate) : 0;

    setItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.product_id === prod.id);
      if (existingIdx !== -1) {
        return prev.map((it, i) =>
          i === existingIdx ? { ...it, quantity: round2((Number(it.quantity) || 0) + 1) } : it
        );
      }

      const emptyIdx = prev.findIndex(
        (it) => !it.product_id && !it.name.trim() && Number(it.unit_price) === 0
      );
      const nextItem: DraftQuotationItem = {
        product_id: prod.id,
        name: prod.name,
        quantity: 1,
        unit_price: catalogPrice,
        original_price: catalogPrice,
        discount: 0,
        tax_rate: catalogTax,
        hsn_code: prod.hsn_code || "",
        unit: prod.unit || "pcs",
      };
      if (emptyIdx !== -1) {
        return prev.map((it, i) => (i === emptyIdx ? nextItem : it));
      }
      return [...prev, nextItem];
    });
    setProductQuery("");
    setSearchedProducts([]);
  };

  const handleAddRow = () => {
    setItems((prev) => [...prev, createEmptyItem(defaultTaxRate)]);
  };

  const handleRemoveRow = (idx: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const updateItem = (
    index: number,
    field: keyof DraftQuotationItem,
    rawValue: string | number
  ) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const updated = { ...it };

        if (field === "product_id") {
          const prodId = String(rawValue);
          updated.product_id = prodId;
          if (prodId) {
            const prod = allKnownProducts.find((p) => p.id === prodId);
            if (prod) {
              const catalogPrice = Number(prod.selling_price ?? 0);
              updated.name = prod.name;
              updated.unit_price = catalogPrice;
              updated.original_price = catalogPrice;
              updated.tax_rate = gstEnabled ? Number(prod.tax_rate ?? defaultTaxRate) : 0;
              updated.hsn_code = prod.hsn_code || "";
              updated.unit = prod.unit || "pcs";
            }
          } else {
            updated.original_price = undefined;
          }
          return updated;
        }

        if (field === "name" || field === "hsn_code" || field === "unit") {
          updated[field] = String(rawValue);
          return updated;
        }

        const parsed = parseFloat(String(rawValue));
        const safeNum = Number.isFinite(parsed) ? parsed : 0;
        if (field === "quantity") updated.quantity = Math.max(0, safeNum);
        if (field === "unit_price") updated.unit_price = Math.max(0, safeNum);
        if (field === "discount") updated.discount = Math.max(0, safeNum);
        if (field === "tax_rate") updated.tax_rate = Math.min(100, Math.max(0, safeNum));
        return updated;
      })
    );
  };

  const computedItems = useMemo(
    () =>
      items.map((item) => ({
        item,
        amounts: calculateItemAmounts(item, gstEnabled, isTaxInclusive),
      })),
    [items, gstEnabled, isTaxInclusive]
  );

  const summary = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let total = 0;
    computedItems.forEach(({ amounts }) => {
      subtotal += amounts.subtotal;
      discount += amounts.discount;
      tax += amounts.tax;
      total += amounts.total;
    });
    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      tax: round2(tax),
      total: round2(total),
    };
  }, [computedItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");

    const validItems = items.filter((it) => it.name.trim().length > 0);
    if (validItems.length === 0) {
      setFormError("Please add at least one product or line item with a name.");
      return;
    }

    for (const it of validItems) {
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        setFormError(`Quantity must be greater than zero for "${it.name}".`);
        return;
      }
      if (!Number.isFinite(it.unit_price) || it.unit_price < 0) {
        setFormError(`Unit price cannot be negative for "${it.name}".`);
        return;
      }
      const lineGross = it.quantity * it.unit_price;
      if (it.discount < 0 || it.discount > lineGross) {
        setFormError(
          `Discount (₹${it.discount}) cannot exceed line amount (${formatCurrency(lineGross)}) for "${it.name}".`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await quotationApi.create({
        customer_id: selectedCustomerId || undefined,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        valid_until: validUntil || undefined,
        status: quoteStatus,
        notes: notes.trim(),
        terms_and_conditions: terms.trim(),
        tax_mode: isTaxInclusive ? "inclusive" : "exclusive",
        items: validItems.map((it) => ({
          product_id: it.product_id || undefined,
          name: it.name.trim(),
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: it.discount,
          tax_rate: gstEnabled ? it.tax_rate : 0,
          hsn_code: it.hsn_code,
          unit: it.unit || "pcs",
        })),
      });

      onCreated?.(res.data);
      onClose();
    } catch (err) {
      setFormError(parseApiError(err, "Failed to create quotation. Please verify fields and retry."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-quotation-title"
    >
      <div className="relative w-full max-w-5xl rounded-2xl border bg-card shadow-2xl flex flex-col max-h-[94vh] text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-4 sm:px-6 py-4 shrink-0">
          <div>
            <h3 id="create-quotation-title" className="text-base sm:text-lg font-bold text-foreground">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prepare an estimate with custom pricing, discounts, and GST without deducting inventory or recording a sale.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            aria-label="Close quotation window"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5 text-xs">
          {/* Submission Error */}
          {formError && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 border border-destructive/25 p-3 text-destructive flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{formError}</span>
            </div>
          )}

          {/* Non-blocking Catalog / Customer load warning */}
          {auxError && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Partial catalog load warning ({auxError}). You can still add custom items or retry.
                </span>
              </div>
              <button
                type="button"
                onClick={loadAuxiliaryData}
                disabled={loadingAux}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-background px-2.5 py-1 font-semibold hover:bg-accent"
              >
                <RefreshCw className={`h-3 w-3 ${loadingAux ? "animate-spin" : ""}`} />
                Retry
              </button>
            </div>
          )}

          {/* Customer & Quotation Metadata */}
          <div className="rounded-xl border bg-muted/20 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-foreground text-xs uppercase tracking-wider">
                <UserIcon className="h-3.5 w-3.5 text-primary" />
                Customer & Estimate Details
              </div>
              {loadingAux && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Syncing catalog...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Registered Customer
                </label>
                {customers.length > 6 && (
                  <div className="relative mb-1.5">
                    <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Filter customers by name or phone..."
                      className="w-full rounded-md border bg-background pl-8 pr-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
                <select
                  aria-label="Select Customer"
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="">-- Walk-in / Prospective Client --</option>
                  {filteredCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.phone || "No Phone"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Customer / Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Enterprises"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={Boolean(selectedCustomerId)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Customer Mobile
                </label>
                <input
                  type="text"
                  placeholder="10-digit WhatsApp / Mobile"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  disabled={Boolean(selectedCustomerId)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Customer Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="client@company.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={Boolean(selectedCustomerId)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Valid Until Date
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Initial Status
                </label>
                <select
                  aria-label="Initial Status"
                  value={quoteStatus}
                  onChange={(e) => setQuoteStatus(e.target.value as "draft" | "sent")}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent to Customer</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Quick Search & Line Items */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-foreground text-sm">Quotation Items & Pricing</h4>
                <p className="text-[11px] text-muted-foreground">
                  Search catalog products to add quickly, or customize price, discount, and GST per item.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="self-start sm:self-auto inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-primary font-semibold hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> Add Custom Row
              </button>
            </div>

            {/* Quick Product Search */}
            <div className="relative">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search products by name, SKU, or barcode to add..."
                className="w-full rounded-lg border bg-background pl-9 pr-9 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchingProducts && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute right-3 top-2.5" />
              )}
              {productQuery.trim() && (
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border bg-card shadow-lg divide-y">
                  {quickSearchMatches.length === 0 ? (
                    <div className="px-3 py-2.5 text-muted-foreground">
                      No matching catalog products found. You can still type a custom item row below.
                    </div>
                  ) : (
                    quickSearchMatches.slice(0, 12).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProductFromCatalog(p)}
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {p.sku ? `SKU: ${p.sku} • ` : ""}
                            Stock: {p.current_stock ?? 0} {p.unit || "pcs"} • Tax: {p.tax_rate ?? 0}%
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground">
                            {formatCurrency(Number(p.selling_price ?? 0))}
                          </span>
                          <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                            + Add
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Mobile Card Rows */}
            <div className="md:hidden space-y-2.5">
              {computedItems.map(({ item, amounts }, idx) => (
                <div key={idx} className="rounded-xl border bg-background p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">
                      Item #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        className="text-destructive hover:bg-destructive/10 p-1 rounded"
                        aria-label={`Remove item ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <select
                    aria-label={`Product selector row ${idx + 1}`}
                    value={item.product_id || ""}
                    onChange={(e) => updateItem(idx, "product_id", e.target.value)}
                    className="w-full rounded-lg border bg-card px-2.5 py-2 text-xs"
                  >
                    <option value="">-- Custom / Select Product --</option>
                    {allKnownProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.selling_price})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Item or service description..."
                    value={item.name}
                    onChange={(e) => updateItem(idx, "name", e.target.value)}
                    className="w-full rounded-lg border bg-card px-2.5 py-2 text-xs"
                    required
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Unit Price (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Discount (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.discount}
                        onChange={(e) => updateItem(idx, "discount", e.target.value)}
                        className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground mb-0.5">
                        Tax (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={!gstEnabled}
                        value={gstEnabled ? item.tax_rate : 0}
                        onChange={(e) => updateItem(idx, "tax_rate", e.target.value)}
                        className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-xs font-mono disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t text-xs">
                    <span className="text-muted-foreground">
                      Tax: {formatCurrency(amounts.tax)}
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      Line Total: {formatCurrency(amounts.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Item Table */}
            <div className="hidden md:block border rounded-xl overflow-x-auto bg-background">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase text-[10px] border-b">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[230px]">Product / Description</th>
                    <th className="py-2.5 px-2 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-2 w-28 text-right">Unit Price (₹)</th>
                    <th className="py-2.5 px-2 w-24 text-right">Discount (₹)</th>
                    <th className="py-2.5 px-2 w-20 text-center">Tax %</th>
                    <th className="py-2.5 px-3 w-28 text-right">Line Total</th>
                    <th className="py-2.5 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {computedItems.map(({ item, amounts }, idx) => {
                    const priceModified =
                      item.original_price !== undefined &&
                      Math.abs(item.original_price - item.unit_price) > 0.01;
                    return (
                      <tr key={idx} className="align-top hover:bg-muted/20">
                        <td className="p-2 space-y-1.5">
                          <select
                            aria-label={`Product selector row ${idx + 1}`}
                            value={item.product_id || ""}
                            onChange={(e) => updateItem(idx, "product_id", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1.5 text-xs"
                          >
                            <option value="">-- Custom / Select Catalog Product --</option>
                            {allKnownProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (₹{p.selling_price})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Item description..."
                            value={item.name}
                            onChange={(e) => updateItem(idx, "name", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1 text-xs"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            aria-label={`Quantity row ${idx + 1}`}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1.5 text-center font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 space-y-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Unit price row ${idx + 1}`}
                            value={item.unit_price}
                            onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1.5 text-right font-mono text-xs"
                          />
                          {priceModified && item.original_price !== undefined && (
                            <div className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                              <Tag className="h-2.5 w-2.5" />
                              Catalog: ₹{item.original_price.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={`Discount row ${idx + 1}`}
                            value={item.discount}
                            onChange={(e) => updateItem(idx, "discount", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1.5 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            aria-label={`Tax rate row ${idx + 1}`}
                            disabled={!gstEnabled}
                            value={gstEnabled ? item.tax_rate : 0}
                            onChange={(e) => updateItem(idx, "tax_rate", e.target.value)}
                            className="w-full rounded-md border bg-card px-2 py-1.5 text-center font-mono text-xs disabled:opacity-50"
                          />
                        </td>
                        <td className="p-2 text-right font-mono">
                          <div className="font-bold text-foreground py-1">
                            {formatCurrency(amounts.total)}
                          </div>
                          {amounts.tax > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              GST: {formatCurrency(amounts.tax)}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            disabled={items.length <= 1}
                            className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-30"
                            aria-label={`Delete item row ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes, Terms & Live Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional delivery schedule, customer remarks, or reference..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-foreground">
                  Terms & Conditions
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Quote valid for 15 days. Prices subject to availability."
                  value={terms}
                  onChange={(e) => {
                    termsEditedRef.current = true;
                    setTerms(e.target.value);
                  }}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1 border-b">
                  <span>Tax Mode</span>
                  <span className="font-semibold text-foreground">
                    {!gstEnabled
                      ? "GST Disabled"
                      : isTaxInclusive
                        ? "GST Inclusive"
                        : "GST Exclusive"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Subtotal:</span>
                  <span className="font-mono font-medium">{formatCurrency(summary.subtotal)}</span>
                </div>
                {summary.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Item Discounts:</span>
                    <span className="font-mono">- {formatCurrency(summary.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {isTaxInclusive ? "Included GST:" : "Estimated GST:"}
                  </span>
                  <span className="font-mono font-medium">{formatCurrency(summary.tax)}</span>
                </div>
                <div className="border-t pt-2.5 flex justify-between font-black text-base text-foreground">
                  <span>Quotation Total</span>
                  <span className="font-mono text-primary">{formatCurrency(summary.total)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Drafting a quotation will not deduct stock or affect completed sales reports.
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t pt-4 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 sticky bottom-0 bg-card pb-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border px-4 py-2.5 font-semibold hover:bg-accent text-xs min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 font-bold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-sm text-xs min-h-[40px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Quotation...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Save Quotation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuotationCreateModal;
