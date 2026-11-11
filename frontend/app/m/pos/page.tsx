"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { resolveWhatsAppPresentation, WhatsAppUiStatus } from "@/lib/whatsappStatus";
import { posApi, quotationApi, customerApi, productApi, invoiceApi } from "@/services/api";
import type { Product, Quotation, Customer, BusinessConfig, POSCalculateResponse, WhatsAppDeliverySummary } from "@/types";
import {
  Search,
  Barcode,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  User,
  Tag,
  CreditCard,
  Banknote,
  QrCode,
  ClipboardList,
  AlertCircle,
  FileText,
  RotateCcw,
  Sparkles,
  Printer,
  Download,
  Share2,
  Landmark,
  Wallet,
  Split,
  Loader2,
} from "lucide-react";
import { printThermalReceipt, downloadInvoicePdf } from "@/lib/receiptPrinter";

interface CartItem {
  id: string; // product id or custom
  product?: any;
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
  original_unit_price?: number;
  tax_rate: number;
  discount: number;
}

interface SplitPaymentRow {
  payment_method: string;
  amount: number;
  reference?: string;
  notes?: string;
}

export default function MobilePOSPage() {
  // Navigation tabs: 'catalog' | 'cart' | 'payment' | 'success'
  const [activeTab, setActiveTab] = useState<"catalog" | "cart" | "payment" | "success">("catalog");

  // Products & Search
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Cart State
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [calcSummary, setCalcSummary] = useState<POSCalculateResponse | null>(null);
  const [calcSyncedSignature, setCalcSyncedSignature] = useState<string>("");
  const calcSeqRef = useRef(0);
  const [customer, setCustomer] = useState<{ id?: string; name: string; phone: string; is_walk_in: boolean }>({
    name: "Walk-in Customer",
    phone: "",
    is_walk_in: true,
  });
  const [quotationRef, setQuotationRef] = useState<string | null>(null);

  // Modals inside POS
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showQuoteLookupModal, setShowQuoteLookupModal] = useState(false);
  const [quoteNumberInput, setQuoteNumberInput] = useState("");
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");

  // Payment State
  const [primaryMethod, setPrimaryMethod] = useState<"cash" | "upi" | "card" | "credit" | "other">("cash");
  const [otherMethod, setOtherMethod] = useState<"netbanking" | "cheque" | "wallet">("netbanking");
  const [isSplit, setIsSplit] = useState(false);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [cashDraft, setCashDraft] = useState<string>("");
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([
    { payment_method: "cash", amount: 0 },
    { payment_method: "upi", amount: 0 },
    { payment_method: "card", amount: 0 },
  ]);
  const [splitDrafts, setSplitDrafts] = useState<Record<number, string>>({});
  const [electronicRef, setElectronicRef] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightSubmitRef = useRef(false);
  const idempotencyKeyRef = useRef("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedSale, setConfirmedSale] = useState<{
    transaction_id: string;
    invoice_id?: string;
    invoice_number: string;
    total: number;
    amount_paid: number;
    change_amount: number;
    payment_method: string;
    web_url?: string;
    customer_name?: string;
    customer_phone?: string;
    bill_sent?: boolean;
    whatsapp_delivery?: WhatsAppDeliverySummary | null;
    raw?: any;
  } | null>(null);
  const [waStatus, setWaStatus] = useState<{
    state: WhatsAppUiStatus;
    message: string;
  }>({ state: "idle", message: "" });
  const [mobileWaPhone, setMobileWaPhone] = useState("");

  useEffect(() => {
    const invId = confirmedSale?.invoice_id;
    if (!invId || waStatus.state !== "queued") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await invoiceApi.getWhatsAppStatus(invId);
        if (cancelled) return;
        const delivery = res.data?.whatsapp_delivery;
        const billSent = Boolean(res.data?.bill_sent);
        const next = resolveWhatsAppPresentation(delivery, billSent);
        if (next.status !== "queued" && next.status !== "idle") {
          setWaStatus({ state: next.status, message: next.message });
          setConfirmedSale((prev) =>
            prev && prev.invoice_id === invId
              ? { ...prev, bill_sent: billSent, whatsapp_delivery: delivery }
              : prev
          );
          return;
        }
      } catch {
        // Ignore transient poll errors
      }
      if (!cancelled && attempts < 20) {
        timer = window.setTimeout(poll, 1500);
      }
    };

    let timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [confirmedSale?.invoice_id, waStatus.state]);

  // Load tenant config & categories on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [cfgRes, catRes] = await Promise.allSettled([
          posApi.getConfig(),
          productApi.listCategories({ all: true }),
        ]);
        if (cfgRes.status === "fulfilled" && cfgRes.value?.data) {
          setConfig(cfgRes.value.data);
        }
        if (catRes.status === "fulfilled") {
          const raw = catRes.value.data as any;
          const list = Array.isArray(raw) ? raw : raw?.results || [];
          const names = list
            .filter((c: any) => c.is_active !== false)
            .map((c: any) => c.name)
            .filter(Boolean);
          if (names.length > 0) {
            setCategories((prev) => Array.from(new Set([...prev, ...names])));
          }
        }
      } catch (err) {
        console.error("Failed to load metadata for mobile POS:", err);
      }
    };
    loadMetadata();
  }, []);

  // Load products on search / category filter
  const fetchProducts = useCallback(async (query: string, category: string) => {
    setLoadingProducts(true);
    try {
      const res = await posApi.searchProducts({
        search: query.trim() || undefined,
        category: category !== "all" ? category : undefined,
        page_size: 40,
      });
      const list = res.data?.results || [];
      setProducts(list);

      // Extract unique categories from products
      const cats = Array.from(
        new Set(
          list
            .map((p: any) => p.category_name || p.category?.name || (typeof p.category === "string" ? p.category : null))
            .filter(Boolean)
        )
      ) as string[];
      if (cats.length > 0) {
        setCategories((prev) => Array.from(new Set([...prev, ...cats])));
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory, fetchProducts]);

  // Check for pre-loaded quotation from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedQuote = sessionStorage.getItem("billmeet_loaded_quote");
      if (savedQuote) {
        try {
          const q: Quotation = JSON.parse(savedQuote);
          sessionStorage.removeItem("billmeet_loaded_quote");
          loadQuotationIntoCart(q);
        } catch {}
      }
    }
  }, []);

  const roundCurrency = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const creditSalesEnabled = config ? config.allow_credit_sales !== false : true;

  const currentCartSignature = useMemo(
    () =>
      JSON.stringify(
        cart.map((it) => ({
          id: it.id,
          unit_price: it.unit_price,
          quantity: it.quantity,
          tax_rate: it.tax_rate,
          discount: it.discount,
        }))
      ),
    [cart]
  );
  const isCalcSynced = cart.length === 0 || (calcSummary !== null && calcSyncedSignature === currentCartSignature);

  const calculateMobileCartImmediate = useCallback(async () => {
    if (cart.length === 0) {
      setCalcSummary(null);
      setCalcSyncedSignature("");
      return null;
    }
    const seq = ++calcSeqRef.current;
    const sig = currentCartSignature;
    try {
      const itemsPayload = cart.map((it) => ({
        product_id: it.product?.id || (it.id.startsWith("custom-") ? undefined : it.id),
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount: it.discount,
      }));
      const res = await posApi.calculateCart({ items: itemsPayload, is_interstate: false });
      if (seq === calcSeqRef.current) {
        setCalcSummary(res.data);
        setCalcSyncedSignature(sig);
      }
      return res.data as POSCalculateResponse;
    } catch (err) {
      console.error("Mobile POS cart calculate failed", err);
      return null;
    }
  }, [cart, currentCartSignature]);

  useEffect(() => {
    if (cart.length === 0) {
      setCalcSummary(null);
      setCalcSyncedSignature("");
      return;
    }
    const timer = setTimeout(() => {
      calculateMobileCartImmediate();
    }, 90);
    return () => clearTimeout(timer);
  }, [cart, calculateMobileCartImmediate]);

  // Cart calculations (immediate subtotal + authoritative backend tax/grand_total)
  const cartSummary = useMemo(() => {
    let localSubtotal = 0;
    let itemCount = 0;

    cart.forEach((item) => {
      localSubtotal += Math.max(0, item.unit_price * item.quantity - (item.discount || 0));
      itemCount += item.quantity;
    });

    if (isCalcSynced && calcSummary) {
      return {
        subtotal: Number(calcSummary.subtotal ?? localSubtotal),
        totalTax: Number(calcSummary.tax ?? 0),
        roundOff: Number(calcSummary.round_off ?? 0),
        grandTotal: Number(calcSummary.grand_total ?? localSubtotal),
        itemCount,
      };
    }

    return {
      subtotal: roundCurrency(localSubtotal),
      totalTax: 0,
      roundOff: 0,
      grandTotal: roundCurrency(localSubtotal),
      itemCount,
    };
  }, [cart, isCalcSynced, calcSummary]);

  // Synchronize payment amounts when grand total changes in single mode
  useEffect(() => {
    if (!isSplit) {
      setCashTendered(cartSummary.grandTotal);
      setCashDraft(cartSummary.grandTotal > 0 ? cartSummary.grandTotal.toFixed(2) : "0");
    }
  }, [cartSummary.grandTotal, primaryMethod, isSplit]);

  // Add product to cart
  const addToCart = (product: Product) => {
    idempotencyKeyRef.current = "";
    const defaultPrice = Math.max(0, Number(product.selling_price || product.unit_price || 0));
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          product,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          quantity: 1,
          unit_price: defaultPrice,
          original_unit_price: defaultPrice,
          tax_rate: Number(product.tax_rate || 0),
          discount: 0,
        },
      ];
    });
  };

  // Update item quantity
  const updateQuantity = (id: string, delta: number) => {
    idempotencyKeyRef.current = "";
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Update item unit price
  const updateItemPrice = (id: string, raw: string) => {
    idempotencyKeyRef.current = "";
    if (raw.trim().startsWith("-")) return;
    setPriceDrafts((prev) => ({ ...prev, [id]: raw }));
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, unit_price: parsed } : item))
    );
  };

  const commitItemPrice = (id: string) => {
    const draft = priceDrafts[id];
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (draft !== undefined) {
      const parsed = Number(draft);
      if (Number.isFinite(parsed) && parsed >= 0) {
        const rounded = roundCurrency(parsed);
        setCart((prev) =>
          prev.map((item) => (item.id === id ? { ...item, unit_price: rounded } : item))
        );
      }
    }
  };

  const resetItemPrice = (id: string) => {
    idempotencyKeyRef.current = "";
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCart((prev) =>
      prev.map((item) =>
        item.id === id && item.original_unit_price !== undefined
          ? { ...item, unit_price: item.original_unit_price }
          : item
      )
    );
  };

  // Remove item
  const removeItem = (id: string) => {
    idempotencyKeyRef.current = "";
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  // Clear cart
  const clearCart = () => {
    if (confirm("Clear all items in cart?")) {
      idempotencyKeyRef.current = "";
      setPriceDrafts({});
      setCart([]);
      setQuotationRef(null);
      setActiveTab("catalog");
    }
  };

  // Load quotation helper
  const loadQuotationIntoCart = (q: Quotation) => {
    if (!q || !q.items || q.items.length === 0) return;
    idempotencyKeyRef.current = "";
    setPriceDrafts({});
    const loadedItems: CartItem[] = q.items.map((it: any) => ({
      id: typeof it.product === "object" && it.product?.id ? it.product.id : it.product || `custom-${it.id || Math.random()}`,
      product: it.product,
      name: it.name,
      sku: it.sku || "",
      quantity: Number(it.quantity || 1),
      unit_price: Number(it.unit_price || 0),
      original_unit_price: Number(it.original_unit_price ?? it.unit_price ?? 0),
      tax_rate: Number(it.tax_rate || 0),
      discount: Number(it.discount || 0),
    }));
    setCart(loadedItems);
    setQuotationRef(q.quotation_number);
    if (q.customer_name || q.customer_phone) {
      setCustomer({
        name: q.customer_name || "Customer",
        phone: q.customer_phone || "",
        is_walk_in: false,
      });
    }
    setActiveTab("cart");
  };

  // Handle Quotation Lookup
  const handleLookupQuotation = async () => {
    if (!quoteNumberInput.trim()) return;
    try {
      const res = await quotationApi.lookupByNumber(quoteNumberInput.trim());
      loadQuotationIntoCart(res.data);
      setShowQuoteLookupModal(false);
      setQuoteNumberInput("");
    } catch {
      alert(`Quotation "${quoteNumberInput}" not found.`);
    }
  };

  // Payment computations (Single & Hybrid)
  const activePaymentRows: SplitPaymentRow[] = useMemo(() => {
    if (isSplit) {
      return splitPayments.filter((p) => Number(p.amount) > 0);
    }
    if (primaryMethod === "cash") {
      return [{ payment_method: "cash", amount: roundCurrency(Number(cashTendered) || 0) }];
    }
    if (primaryMethod === "other") {
      return [{ payment_method: otherMethod, amount: cartSummary.grandTotal, reference: electronicRef }];
    }
    return [{ payment_method: primaryMethod, amount: cartSummary.grandTotal, reference: electronicRef }];
  }, [isSplit, splitPayments, primaryMethod, cashTendered, otherMethod, cartSummary.grandTotal, electronicRef]);

  const totalAllocated = useMemo(
    () => roundCurrency(activePaymentRows.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    [activePaymentRows]
  );
  const cashPaidSum = useMemo(
    () => roundCurrency(activePaymentRows.filter((p) => p.payment_method === "cash").reduce((s, p) => s + p.amount, 0)),
    [activePaymentRows]
  );
  const splitUsesCredit = activePaymentRows.some((p) => p.payment_method === "credit" && p.amount > 0);
  const splitRemaining = Math.max(0, roundCurrency(cartSummary.grandTotal - totalAllocated));
  const excessPayment = totalAllocated > cartSummary.grandTotal ? roundCurrency(totalAllocated - cartSummary.grandTotal) : 0;
  const isElectronicOverpay = excessPayment > 0.009 && cashPaidSum < excessPayment - 0.009;
  const cashChange = excessPayment > 0 && !isElectronicOverpay ? excessPayment : 0;

  // Set primary payment method
  const handleSelectPrimaryMethod = (method: "cash" | "upi" | "card" | "credit" | "other") => {
    setErrorMessage(null);
    setPrimaryMethod(method);
    setIsSplit(false);
    if (method === "cash") {
      setCashTendered(cartSummary.grandTotal);
      setCashDraft(cartSummary.grandTotal.toFixed(2));
    }
  };

  const handleSelectHybridMode = () => {
    setErrorMessage(null);
    setIsSplit(true);
    setSplitDrafts({});
    setSplitPayments((prev) => {
      if (prev.some((p) => p.amount > 0)) return prev;
      return [
        { payment_method: "cash", amount: cartSummary.grandTotal },
        { payment_method: "upi", amount: 0 },
        { payment_method: "card", amount: 0 },
      ];
    });
  };

  const goToPaymentTab = async () => {
    setErrorMessage(null);
    if (!isCalcSynced) {
      await calculateMobileCartImmediate();
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `M-POS-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    setActiveTab("payment");
  };

  // Submit Complete Sale
  const handleCompleteSale = async () => {
    if (inFlightSubmitRef.current || isSubmitting) return;
    if (cart.length === 0) {
      alert("Cart cannot be empty.");
      return;
    }

    if (!isCalcSynced) {
      await calculateMobileCartImmediate();
    }

    if (splitUsesCredit && !creditSalesEnabled) {
      setErrorMessage("Credit / Udhaar sales are disabled in business settings.");
      return;
    }
    if (splitUsesCredit && customer.is_walk_in) {
      setErrorMessage("Walk-in customers cannot take Credit. Please select a registered customer first.");
      return;
    }
    if (isElectronicOverpay) {
      setErrorMessage("Overpayment is only permitted in Cash. Electronic payments cannot exceed bill total.");
      return;
    }
    if (totalAllocated < cartSummary.grandTotal - 0.009) {
      setErrorMessage(`Paid amount (${formatCurrency(totalAllocated)}) is less than bill total (${formatCurrency(cartSummary.grandTotal)}).`);
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `M-POS-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    inFlightSubmitRef.current = true;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const itemsPayload = cart.map((it) => ({
        product_id: it.product?.id || (it.id.startsWith("custom-") ? undefined : it.id),
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount: it.discount,
      }));

      const paymentsPayload =
        activePaymentRows.length > 0
          ? activePaymentRows
          : [{ payment_method: "cash", amount: 0 }];

      const checkoutPayload = {
        quotation_number: quotationRef || undefined,
        items: itemsPayload,
        payments: paymentsPayload,
        is_walk_in: customer.is_walk_in,
        customer: customer.is_walk_in
          ? undefined
          : {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
            },
        idempotency_key: idempotencyKeyRef.current,
      };

      const res = await posApi.checkout(checkoutPayload);
      const data = res.data;
      idempotencyKeyRef.current = "";

      setConfirmedSale({
        transaction_id: data.transaction_id || data.id,
        invoice_id: data.invoice?.id || data.invoice_id || data.id,
        invoice_number: data.invoice_number,
        total: Number(data.total || cartSummary.grandTotal),
        amount_paid: Number(data.amount_paid || cartSummary.grandTotal),
        change_amount: Number(data.change_amount || 0),
        payment_method: data.payment_method || (isSplit ? "split" : primaryMethod),
        web_url: data.invoice?.web_url,
        customer_name: customer.name,
        customer_phone: customer.phone,
        bill_sent: Boolean(data.bill_sent),
        whatsapp_delivery: data.whatsapp_delivery || null,
        raw: data,
      });
      setMobileWaPhone(customer.phone || "");
      const waPresentation = resolveWhatsAppPresentation(data.whatsapp_delivery, data.bill_sent);
      setWaStatus({ state: waPresentation.status, message: waPresentation.message });

      // Clear cart on confirmed success
      setPriceDrafts({});
      setCart([]);
      setQuotationRef(null);
      setActiveTab("success");
    } catch (err: unknown) {
      const msg = parseApiError(err, "Payment checkout failed. Please review cart and retry.");
      setErrorMessage(msg);
    } finally {
      inFlightSubmitRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Segmented Screen Header Switcher */}
      <div className="flex rounded-xl bg-slate-200/80 p-1 text-xs font-bold shadow-inner">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex-1 rounded-lg py-1.5 transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "catalog" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          <span>Catalog</span>
        </button>
        <button
          onClick={() => setActiveTab("cart")}
          className={`flex-1 rounded-lg py-1.5 transition-all flex items-center justify-center gap-1.5 relative ${
            activeTab === "cart" || activeTab === "payment"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Cart ({cartSummary.itemCount})</span>
          {cartSummary.itemCount > 0 && (
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          )}
        </button>
      </div>

      {/* ============================================================== */}
      {/* SCREEN A: PRODUCT CATALOG & SEARCH */}
      {/* ============================================================== */}
      {activeTab === "catalog" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          {/* Search Bar & Barcode Button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by name, SKU..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setBarcodeModalOpen(true)}
              className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm active:scale-95 transition-transform shrink-0"
              title="Barcode Scanner"
            >
              <Barcode className="h-4 w-4" />
              <span className="hidden xs:inline">Barcode</span>
            </button>
          </div>

          {/* Customer & Quote Utility Bar */}
          <div className="flex items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs shadow-sm">
            <button
              onClick={() => setShowCustomerModal(true)}
              className="flex items-center gap-1.5 text-slate-700 font-semibold truncate hover:text-blue-600 transition-colors"
            >
              <User className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span className="truncate">{customer.name}</span>
            </button>

            <button
              onClick={() => setShowQuoteLookupModal(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline shrink-0"
            >
              <FileText className="h-3 w-3" />
              <span>{quotationRef ? `#${quotationRef}` : "Load Quote"}</span>
            </button>
          </div>

          {/* Category Filter Pills Carousel */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px] font-semibold">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`rounded-full px-3 py-1 transition-all whitespace-nowrap ${
                selectedCategory === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Catalog Grid (Compact 2-Column Touch Cards) */}
          {loadingProducts ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-28 animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-600">No matching products found</p>
              <p className="text-[11px] text-slate-400">Try another search term or check stock.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {products.map((p) => {
                const inCart = cart.find((i) => i.id === p.id);
                const isOutOfStock = p.track_inventory && Number(p.current_stock || 0) <= 0;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-all hover:border-blue-300 relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-mono font-medium text-slate-400 uppercase truncate">
                          {p.sku || p.barcode || "ITEM"}
                        </span>
                        {p.track_inventory && (
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                              Number(p.current_stock || 0) > 5
                                ? "bg-emerald-50 text-emerald-600"
                                : Number(p.current_stock || 0) > 0
                                ? "bg-amber-50 text-amber-600"
                                : "bg-rose-50 text-rose-600"
                            }`}
                          >
                            {p.current_stock} left
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-bold text-xs text-slate-800 line-clamp-2 leading-tight">
                        {p.name}
                      </h3>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-slate-100">
                      <div>
                        <span className="text-xs font-extrabold text-slate-900 block">
                          {formatCurrency(Number(p.selling_price || p.unit_price || 0))}
                        </span>
                        {p.tax_rate ? (
                          <span className="text-[9px] text-slate-400">+{p.tax_rate}% GST</span>
                        ) : null}
                      </div>

                      {/* One-tap Add button */}
                      <button
                        onClick={() => addToCart(p)}
                        disabled={isOutOfStock}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white shadow-sm transition-transform active:scale-90 ${
                          isOutOfStock
                            ? "bg-slate-300 cursor-not-allowed text-slate-500"
                            : inCart
                            ? "bg-emerald-600"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                        title="Add to cart"
                      >
                        {inCart ? (
                          <span className="text-[11px] font-extrabold">{inCart.quantity}</span>
                        ) : (
                          <Plus className="h-4 w-4 stroke-[2.5]" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SCREEN B: CART & ORDER ITEMS */}
      {/* ============================================================== */}
      {activeTab === "cart" && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Current Cart Items</h2>
              <p className="text-[10px] text-slate-400">
                {cartSummary.itemCount} items • {customer.name}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear Cart</span>
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
              <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-600">Cart is empty</p>
              <button
                onClick={() => setActiveTab("catalog")}
                className="mt-3 inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"
              >
                Browse Catalog →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Compact Mobile Billing List (Non-card divided rows with editable Unit Price) */}
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden shadow-xs">
                {cart.map((item) => {
                  const lineTotal = Math.max(0, item.unit_price * item.quantity - (item.discount || 0));
                  const isModified =
                    item.original_unit_price !== undefined &&
                    Math.abs(item.unit_price - item.original_unit_price) > 0.001;
                  const draft = priceDrafts[item.id];
                  return (
                    <div key={item.id} className="p-2.5 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-900 truncate">{item.name}</h4>
                          <p className="text-[10px] text-slate-400">
                            {item.sku ? `${item.sku} • ` : ""}
                            Tax: {item.tax_rate}%
                            {isModified && (
                              <span className="ml-1.5 text-amber-600 line-through">
                                {formatCurrency(item.original_unit_price!)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-extrabold text-blue-600 tabular-nums">
                            {formatCurrency(lineTotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Remove Item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm active:bg-slate-200"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-extrabold text-slate-900 tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm active:bg-slate-200"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-slate-500">Rate ₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Unit price for ${item.name}`}
                            value={draft !== undefined ? draft : item.unit_price}
                            onChange={(e) => updateItemPrice(item.id, e.target.value)}
                            onBlur={() => commitItemPrice(item.id)}
                            onFocus={(e) => e.currentTarget.select()}
                            className={`w-20 rounded-lg border px-2 py-1 text-right text-xs font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                              isModified ? "border-amber-400 bg-amber-50/50 text-slate-900" : "border-slate-200 text-slate-900"
                            }`}
                          />
                          {isModified && (
                            <button
                              type="button"
                              onClick={() => resetItemPrice(item.id)}
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Calculation Summary Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 text-xs shadow-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(cartSummary.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST / Taxes</span>
                  <span className="tabular-nums">{formatCurrency(cartSummary.totalTax)}</span>
                </div>
                {cartSummary.roundOff !== 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Round-off</span>
                    <span className="tabular-nums">{formatCurrency(cartSummary.roundOff)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-extrabold text-base text-slate-900">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{formatCurrency(cartSummary.grandTotal)}</span>
                </div>
              </div>

              {/* Proceed to Payment Action Button */}
              <button
                type="button"
                onClick={goToPaymentTab}
                className="w-full rounded-xl bg-blue-600 py-3 text-center text-xs font-extrabold text-white shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                <span>Open Payment ({formatCurrency(cartSummary.grandTotal)})</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SCREEN C: DIRECT PAYMENT WORKFLOW */}
      {/* ============================================================== */}
      {activeTab === "payment" && (
        <div className="space-y-3.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("cart")}
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Bill</span>
            </button>
            <span className="text-xs font-extrabold text-slate-900 tabular-nums">
              Total Due: {formatCurrency(cartSummary.grandTotal)}
            </span>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Direct Payment Options Grid */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Select Payment Option
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPrimaryMethod("cash")}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  primaryMethod === "cash" && !isSplit
                    ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                  <Banknote className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Cash</span>
                  <span className="text-[10px] text-slate-400">Cash drawer</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPrimaryMethod("upi")}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  primaryMethod === "upi" && !isSplit
                    ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0">
                  <QrCode className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">UPI</span>
                  <span className="text-[10px] text-slate-400">GPay, PhonePe</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPrimaryMethod("card")}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  primaryMethod === "card" && !isSplit
                    ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 shrink-0">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Card</span>
                  <span className="text-[10px] text-slate-400">POS Terminal</span>
                </div>
              </button>

              {creditSalesEnabled && (
                <button
                  type="button"
                  onClick={() => handleSelectPrimaryMethod("credit")}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                    primaryMethod === "credit" && !isSplit
                      ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Credit</span>
                    <span className="text-[10px] text-slate-400">Customer Udhaar</span>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSelectPrimaryMethod("other")}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  primaryMethod === "other" && !isSplit
                    ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shrink-0">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Other</span>
                  <span className="text-[10px] text-slate-400">Bank / Cheque / Wallet</span>
                </div>
              </button>

              <button
                type="button"
                onClick={handleSelectHybridMode}
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                  isSplit
                    ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 text-blue-900 font-bold"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                  <Split className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Hybrid / Split</span>
                  <span className="text-[10px] text-slate-400">Cash + UPI + Card</span>
                </div>
              </button>
            </div>
          </div>

          {/* Cash Tender & Change Due Section */}
          {primaryMethod === "cash" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Cash Tendered</span>
                <span className="text-xs font-extrabold text-blue-600 tabular-nums">
                  {formatCurrency(cashTendered)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCashTendered(cartSummary.grandTotal);
                    setCashDraft(cartSummary.grandTotal.toFixed(2));
                  }}
                  className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 active:scale-95 transition-all"
                >
                  Exact (₹{cartSummary.grandTotal})
                </button>
                {[100, 200, 500, 1000, 2000].map((denom) => (
                  <button
                    key={denom}
                    type="button"
                    onClick={() => {
                      setCashTendered(denom);
                      setCashDraft(String(denom));
                    }}
                    className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 active:scale-95 transition-all"
                  >
                    ₹{denom}
                  </button>
                ))}
              </div>

              <input
                type="number"
                min="0"
                step="0.01"
                value={cashDraft !== "" ? cashDraft : cashTendered || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim().startsWith("-")) return;
                  setCashDraft(raw);
                  const parsed = raw.trim() === "" ? 0 : Number(raw);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    setCashTendered(roundCurrency(parsed));
                  }
                }}
                placeholder="Enter cash amount..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 tabular-nums"
              />

              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs font-bold text-emerald-800">
                <span>Change to Return:</span>
                <span className="text-sm font-extrabold tabular-nums">{formatCurrency(cashChange)}</span>
              </div>
            </div>
          )}

          {/* UPI Reference / Preview */}
          {primaryMethod === "upi" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-sm text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                <QrCode className="h-16 w-16 text-slate-700" />
              </div>
              <p className="text-[11px] text-slate-500">Scan QR Code on counter or enter UPI UTR</p>
              <input
                type="text"
                value={electronicRef}
                onChange={(e) => setElectronicRef(e.target.value)}
                placeholder="Optional UPI Reference / UTR Number..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Card Reference */}
          {primaryMethod === "card" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-sm">
              <span className="text-[11px] font-bold text-slate-700">Card Approval / Ref Number</span>
              <input
                type="text"
                value={electronicRef}
                onChange={(e) => setElectronicRef(e.target.value)}
                placeholder="Card Authorization Code (e.g. TXN-1029)..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Other Payment Methods */}
          {primaryMethod === "other" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-sm">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "netbanking" as const, label: "Net Banking", icon: Landmark },
                  { id: "cheque" as const, label: "Cheque", icon: Receipt },
                  { id: "wallet" as const, label: "Wallet", icon: Wallet },
                ].map((om) => (
                  <button
                    key={om.id}
                    type="button"
                    onClick={() => setOtherMethod(om.id)}
                    className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-[11px] font-bold ${
                      otherMethod === om.id
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <om.icon className="h-3.5 w-3.5" />
                    <span>{om.label}</span>
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={electronicRef}
                onChange={(e) => setElectronicRef(e.target.value)}
                placeholder="Reference / Cheque / Wallet Transaction ID..."
                className="w-full rounded-lg border border-slate-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {/* Hybrid / Split Payment Breakdown */}
          {isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Hybrid Payment Split
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSplitPayments((prev) => [
                      ...prev,
                      { payment_method: "netbanking", amount: splitRemaining },
                    ])
                  }
                  className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" />
                  Add Method
                </button>
              </div>

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
                {splitPayments.map((row, idx) => {
                  const draft = splitDrafts[idx];
                  return (
                    <div key={idx} className="p-2 flex items-center gap-2 bg-white">
                      <select
                        value={row.payment_method}
                        onChange={(e) => {
                          const m = e.target.value;
                          setSplitPayments((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, payment_method: m } : p))
                          );
                        }}
                        className="h-8 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-bold uppercase text-slate-800 w-24 shrink-0"
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        {creditSalesEnabled && <option value="credit">Credit</option>}
                        <option value="netbanking">Bank</option>
                        <option value="cheque">Cheque</option>
                        <option value="wallet">Wallet</option>
                      </select>

                      <div className="relative flex-1">
                        <span className="absolute left-2 top-2 text-slate-400 font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft !== undefined ? draft : row.amount || ""}
                          placeholder="0.00"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw.trim().startsWith("-")) return;
                            setSplitDrafts((prev) => ({ ...prev, [idx]: raw }));
                            const parsed = raw.trim() === "" ? 0 : Number(raw);
                            if (!Number.isFinite(parsed) || parsed < 0) return;
                            setSplitPayments((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, amount: roundCurrency(parsed) } : p
                              )
                            );
                          }}
                          onBlur={() => {
                            setSplitDrafts((prev) => {
                              const next = { ...prev };
                              delete next[idx];
                              return next;
                            });
                          }}
                          className="h-8 w-full rounded border border-slate-200 pl-5 pr-2 text-right font-bold text-slate-900 tabular-nums"
                        />
                      </div>

                      {splitRemaining > 0.009 && (
                        <button
                          type="button"
                          onClick={() => {
                            const fill = Math.max(0, roundCurrency(cartSummary.grandTotal - (totalAllocated - row.amount)));
                            setSplitPayments((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, amount: fill } : p))
                            );
                          }}
                          className="rounded bg-blue-50 px-1.5 py-1 text-[10px] font-bold text-blue-700 border border-blue-200 shrink-0"
                        >
                          Fill
                        </button>
                      )}

                      {splitPayments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSplitDrafts({});
                            setSplitPayments((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Bill</span>
                  <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(cartSummary.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Entered Total</span>
                  <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(totalAllocated)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-extrabold">
                  <span className="text-slate-700">Remaining</span>
                  <span className={splitRemaining > 0.009 ? "text-rose-600 tabular-nums" : "text-emerald-700 tabular-nums"}>
                    {formatCurrency(splitRemaining)}
                  </span>
                </div>
                {cashChange > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Cash Change</span>
                    <span className="tabular-nums">{formatCurrency(cashChange)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customer Credit / Udhaar Notice */}
          {((primaryMethod === "credit" && !isSplit) || splitUsesCredit) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5 text-xs text-amber-800">
              <span className="font-bold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Customer Credit Policy
              </span>
              <p className="text-[11px]">
                Credit sales require a registered customer. Currently selected:{" "}
                <span className="font-bold">{customer.name}</span>
              </p>
              {customer.is_walk_in && (
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(true)}
                  className="rounded-lg bg-amber-600 text-white font-bold px-2.5 py-1 text-[10px] mt-1"
                >
                  Select Registered Customer →
                </button>
              )}
            </div>
          )}

          {/* Complete Sale Final Action */}
          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={
              isSubmitting ||
              (splitUsesCredit && (customer.is_walk_in || !creditSalesEnabled)) ||
              isElectronicOverpay ||
              totalAllocated < cartSummary.grandTotal - 0.009
            }
            className="w-full rounded-xl bg-blue-600 py-3.5 text-center text-sm font-extrabold text-white shadow-xl shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Processing Sale...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Complete Sale ({formatCurrency(cartSummary.grandTotal)})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SCREEN D: POST-PAYMENT CONFIRMED SUCCESS */}
      {/* ============================================================== */}
      {activeTab === "success" && confirmedSale && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-md space-y-4 animate-in zoom-in-95 duration-150">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8 stroke-[2.5]" />
          </div>

          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Payment Confirmed</span>
            <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">Sale Successful!</h2>
            <p className="text-xs font-mono text-slate-500 mt-1">Invoice #{confirmedSale.invoice_number}</p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1.5 text-xs text-left">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Bill</span>
              <span className="font-extrabold text-slate-900">{formatCurrency(confirmedSale.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Method</span>
              <span className="font-bold uppercase text-slate-800">{confirmedSale.payment_method}</span>
            </div>
            {confirmedSale.change_amount > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold border-t pt-1">
                <span>Change Returned</span>
                <span>{formatCurrency(confirmedSale.change_amount)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (confirmedSale.raw) {
                    const raw = confirmedSale.raw;
                    printThermalReceipt({
                      invoice_id: confirmedSale.invoice_id,
                      invoice_number: confirmedSale.invoice_number,
                      transaction_date: raw.transaction_date,
                      seller: {
                        name: raw.seller?.name || "BILLMEET RETAIL",
                        trade_name: raw.seller?.trade_name || raw.seller?.name || "BILLMEET RETAIL",
                        gstin: raw.seller?.gstin || "",
                        phone: raw.seller?.phone || "",
                        address: raw.seller?.address || "",
                      },
                      customer: raw.customer ? {
                        name: raw.customer?.name || confirmedSale.customer_name || "Walk-in",
                        phone: raw.customer?.phone || confirmedSale.customer_phone || "",
                        gstin: raw.customer?.gstin || "",
                      } : null,
                      cashier_name: raw.cashier || "Mobile Staff",
                      store_name: raw.store?.name || "Mobile Counter",
                      items: (raw.items || []).map((it: any) => ({
                        name: it.product_name || it.name || it.description || "Product Item",
                        product_name: it.product_name || it.name || it.description || "Product Item",
                        sku: it.sku || "",
                        hsn_code: it.hsn_code || "",
                        quantity: Number(it.quantity || 1),
                        unit: it.unit || "pcs",
                        unit_price: Number(it.unit_price || 0),
                        discount: Number(it.discount || 0),
                        tax_rate: Number(it.tax_rate || 0),
                        taxable_amount: Number(it.taxable_amount || 0),
                        total: Number(it.total || 0),
                      })),
                      subtotal: Number(raw.subtotal || confirmedSale.total),
                      discount: Number(raw.discount || 0),
                      tax: Number(raw.tax || 0),
                      round_off: Number(raw.round_off || 0),
                      total: Number(raw.total || confirmedSale.total),
                      tendered_amount: Number(raw.tendered_amount || confirmedSale.total),
                      change_amount: Number(raw.change_amount || confirmedSale.change_amount),
                      payments: raw.payments,
                      payment_method: confirmedSale.payment_method,
                      payment_status: raw.payment_status || "paid",
                    });
                  }
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-800 shadow-sm active:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5 text-blue-600" />
                <span>Thermal Bill</span>
              </button>

              {confirmedSale.invoice_id && (
                <button
                  type="button"
                  onClick={() => {
                    void downloadInvoicePdf(
                      confirmedSale.invoice_id!,
                      confirmedSale.invoice_number,
                      "a4"
                    ).catch((err) => {
                      alert(err instanceof Error ? err.message : "Failed to download invoice PDF.");
                    });
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-800 shadow-sm active:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>GST PDF</span>
                </button>
              )}
            </div>

            {confirmedSale.invoice_id && (
              <div className="space-y-2 text-left">
                {waStatus.state !== "idle" && (
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${
                      waStatus.state === "sent"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : waStatus.state === "failed"
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : waStatus.state === "queued" || waStatus.state === "sending"
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {(waStatus.state === "queued" || waStatus.state === "sending") && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    )}
                    <span>{waStatus.message}</span>
                  </div>
                )}

                {!confirmedSale.customer_phone && (
                  <input
                    type="tel"
                    value={mobileWaPhone}
                    onChange={(e) => setMobileWaPhone(e.target.value)}
                    placeholder="Enter WhatsApp number (e.g. 9876543210)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                )}

                <button
                  type="button"
                  disabled={
                    waStatus.state === "sending" ||
                    waStatus.state === "queued" ||
                    (!confirmedSale.customer_phone && !mobileWaPhone.trim())
                  }
                  onClick={async () => {
                    if (!confirmedSale.invoice_id || waStatus.state === "sending" || waStatus.state === "queued") return;
                    const previousState = waStatus.state;
                    setWaStatus({ state: "sending", message: "Sending Invoice PDF to WhatsApp..." });
                    try {
                      const res = await invoiceApi.sendWhatsApp(confirmedSale.invoice_id, {
                        phone: !confirmedSale.customer_phone ? mobileWaPhone.trim() : undefined,
                        force: previousState === "sent",
                      });
                      const data = res.data;
                      if (data?.status === "sent" || data?.status === "already_sent") {
                        setWaStatus({
                          state: "sent",
                          message: `✓ Invoice sent to WhatsApp${data?.filename ? ` (${data.filename})` : ""}`,
                        });
                      } else if (data?.status === "queued" || data?.status === "processing") {
                        setWaStatus({
                          state: "queued",
                          message: "Sending invoice PDF via WhatsApp...",
                        });
                      } else {
                        setWaStatus({
                          state: "failed",
                          message: `⚠ Invoice created successfully, but WhatsApp delivery failed${data?.error ? `: ${data.error}` : "."}`,
                        });
                      }
                    } catch (err: unknown) {
                      const msg = parseApiError(err, "WhatsApp delivery failed.");
                      setWaStatus({
                        state: "failed",
                        message: `⚠ Invoice created successfully, but WhatsApp delivery failed: ${msg}`,
                      });
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-800 shadow-sm active:bg-emerald-100 disabled:opacity-50"
                >
                  {waStatus.state === "sending" || waStatus.state === "queued" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-700" />
                  ) : (
                    <Share2 className="h-3.5 w-3.5 text-emerald-700" />
                  )}
                  <span>
                    {waStatus.state === "sending" || waStatus.state === "queued"
                      ? "Sending Invoice PDF..."
                      : waStatus.state === "sent"
                      ? "Resend Invoice PDF on WhatsApp"
                      : waStatus.state === "failed"
                      ? "Retry WhatsApp Invoice PDF"
                      : `Send Invoice PDF${confirmedSale.customer_phone ? ` to ${confirmedSale.customer_phone}` : " on WhatsApp"}`}
                  </span>
                </button>
              </div>
            )}

            {confirmedSale.web_url && (
              <a
                href={confirmedSale.web_url}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-block rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
              >
                View Digital Invoice Receipt →
              </a>
            )}

            <button
              onClick={() => {
                setConfirmedSale(null);
                setActiveTab("catalog");
              }}
              className="w-full rounded-xl bg-blue-600 py-3 text-xs font-extrabold text-white shadow-md active:scale-95 transition-transform"
            >
              Start New Sale ⚡
            </button>
          </div>
        </div>
      )}

      {/* Persistent Floating Bottom Checkout Bar (when on catalog and cart has items) */}
      {activeTab === "catalog" && cartSummary.itemCount > 0 && (
        <div
          className="fixed bottom-20 left-0 right-0 z-30 px-3 max-w-lg mx-auto pointer-events-none"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="pointer-events-auto flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-2.5 text-white shadow-2xl border border-slate-800 backdrop-blur-md">
            <div>
              <span className="text-[11px] text-slate-300 font-medium block">
                {cartSummary.itemCount} items in cart
              </span>
              <span className="text-sm font-extrabold text-white">
                {formatCurrency(cartSummary.grandTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("cart")}
                className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
              >
                View Cart
              </button>
              <button
                onClick={() => setActiveTab("payment")}
                className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-md shadow-blue-500/40 active:scale-95 transition-transform flex items-center gap-1"
              >
                <span>Pay</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-xs text-slate-900">Select Customer</h3>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setCustomer({ name: "Walk-in Customer", phone: "", is_walk_in: true });
                  setShowCustomerModal(false);
                }}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-left text-xs font-bold text-slate-800 hover:bg-slate-50"
              >
                🚶 Walk-in Customer
              </button>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">Customer Phone</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value, is_walk_in: false })}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500">Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Sharma"
                  value={customer.name === "Walk-in Customer" ? "" : customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value, is_walk_in: false })}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>
            </div>
            <button
              onClick={() => setShowCustomerModal(false)}
              className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white"
            >
              Confirm Customer
            </button>
          </div>
        </div>
      )}

      {/* Quotation Lookup Modal */}
      {showQuoteLookupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-xs text-slate-900">Load Quotation to Cart</h3>
              <button onClick={() => setShowQuoteLookupModal(false)} className="text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">Quotation Serial Number</label>
              <input
                type="text"
                placeholder="e.g. QT-POS-1001 or 1001"
                value={quoteNumberInput}
                onChange={(e) => setQuoteNumberInput(e.target.value)}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs font-mono"
              />
            </div>
            <button
              onClick={handleLookupQuotation}
              className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white shadow-sm"
            >
              Lookup & Load Items
            </button>
          </div>
        </div>
      )}

      {/* Manual Barcode Simulation Modal */}
      {barcodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-xs text-slate-900">Barcode Scanner Input</h3>
              <button onClick={() => setBarcodeModalOpen(false)} className="text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Scan or enter barcode digits..."
              value={manualBarcodeInput}
              onChange={(e) => setManualBarcodeInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2 text-xs font-mono"
            />
            <button
              onClick={() => {
                setSearchQuery(manualBarcodeInput);
                setBarcodeModalOpen(false);
                setManualBarcodeInput("");
              }}
              className="w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white shadow-sm"
            >
              Search Barcode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
