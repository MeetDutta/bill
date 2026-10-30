"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Barcode,
  FileText,
  Plus,
  Trash2,
  Minus,
  Pause,
  RotateCcw,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  User,
  Users,
  CheckCircle2,
  Printer,
  Share2,
  AlertCircle,
  X,
  Tag,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Calendar,
  Eye,
  Clock,
  ArrowUpDown,
  RefreshCw,
  Download,
  FileCheck,
  Loader2,
  History,
} from "lucide-react";
import {
  posApi,
  customerApi,
  storeApi,
  quotationApi,
  productApi,
  invoiceApi,
  staffApi,
} from "@/services/api";
import { useRealtimeSubscription } from "@/services/realtime";
import {
  POSProduct,
  POSCartItem,
  POSCalculateResponse,
  BusinessConfig,
  BusinessTypeSchema,
  HeldCart,
  Customer,
  Store,
  CashRegister,
  Invoice,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, parseApiError } from "@/lib/utils";
import { IsolatedReceiptModal } from "@/components/pos/IsolatedReceiptModal";

const POS_CATALOG_EVENT_FILTER = [
  "product_created",
  "product_updated",
  "inventory_updated",
  "inventory_adjusted",
  "stock_adjusted",
  "stock_received",
  "purchase_received",
  "sale_completed",
  "return_completed",
];

interface UnifiedBillingWorkspaceProps {
  basePath?: string;
  initialView?: "new" | "history";
}

export default function UnifiedBillingWorkspace({
  basePath = "/dashboard",
  initialView = "new",
}: UnifiedBillingWorkspaceProps) {
  const isStaff = basePath.startsWith("/staff");

  // ==========================================
  // 1. TOP-LEVEL VIEW MANAGEMENT (Tabs & History)
  // ==========================================
  const [activeView, setActiveView] = useState<"new" | "history">(initialView);

  const switchView = useCallback((view: "new" | "history") => {
    setActiveView(view);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (view === "history") {
        url.searchParams.set("view", "history");
      } else {
        url.searchParams.delete("view");
      }
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  // Listen to browser Back / Forward events
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      setActiveView(v === "history" ? "history" : "new");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Sync initial query parameter from window on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v === "history") {
        setActiveView("history");
      } else if (initialView === "history") {
        setActiveView("history");
      }
    }
  }, [initialView]);

  // ==========================================
  // 2. CONFIG, REGISTER & SHARED METADATA
  // ==========================================
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [businessTypes, setBusinessTypes] = useState<Record<string, BusinessTypeSchema>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [register, setRegister] = useState<CashRegister | null>(null);

  // ==========================================
  // 3. POS CATALOG & PRODUCTS STATE
  // ==========================================
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // ==========================================
  // 4. POS CART STATE
  // ==========================================
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [overallDiscountType, setOverallDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [overallDiscountValue, setOverallDiscountValue] = useState<number>(0);
  const [isInterstate, setIsInterstate] = useState<boolean>(false);
  const [calcSummary, setCalcSummary] = useState<POSCalculateResponse | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // ==========================================
  // 5. CUSTOMER STATE
  // ==========================================
  const [isWalkIn, setIsWalkIn] = useState<boolean>(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    full_name: "",
    phone: "",
    email: "",
    credit_limit: 5000,
  });

  // ==========================================
  // 6. QUICK ADD PRODUCT MODAL
  // ==========================================
  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickProduct, setQuickProduct] = useState({
    name: "",
    sku: "",
    barcode: "",
    selling_price: "",
    purchase_price: "",
    tax_rate: "18",
    unit: "pcs",
    current_stock: "10",
    hsn_code: "",
    attributes: {} as Record<string, string>,
  });

  // ==========================================
  // 7. HELD CARTS
  // ==========================================
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [heldModalOpen, setHeldModalOpen] = useState(false);

  // ==========================================
  // 8. CHECKOUT & PAYMENT MODAL
  // ==========================================
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payments, setPayments] = useState<{ method: string; amount: number; reference?: string }[]>([]);
  const [payingCashAmount, setPayingCashAmount] = useState<number>(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart">("catalog");
  const inFlightCheckoutRef = useRef(false);

  // Post-Sale Modal
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [printFormat, setPrintFormat] = useState<"thermal_80mm" | "thermal_58mm" | "a4">("thermal_80mm");

  // Quotation Load State
  const [quoteInput, setQuoteInput] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadedQuoteBanner, setLoadedQuoteBanner] = useState<{ number: string; total: string; count: number } | null>(null);

  // Barcode / Keyboard input refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // ==========================================
  // 9. INVOICE HISTORY STATE
  // ==========================================
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);

  // History Filters
  const [historySearch, setHistorySearch] = useState("");
  const [historyPaymentStatus, setHistoryPaymentStatus] = useState("");
  const [historyPaymentMethod, setHistoryPaymentMethod] = useState("");
  const [historyInvoiceType, setHistoryInvoiceType] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  // Invoice Detail Modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // ==========================================
  // QUOTATION LOADER HANDLER
  // ==========================================
  const handleLoadQuotation = useCallback(async (quoteNumberToLoad?: string) => {
    const qNum = (quoteNumberToLoad || quoteInput).trim();
    if (!qNum) return;
    setLoadingQuote(true);
    try {
      const res = await quotationApi.lookupByNumber(qNum);
      const q = res.data;
      if (q.status === "converted") {
        alert(`Notice: Quotation #${q.quotation_number} was already converted into invoice #${q.converted_invoice_number || ""}.`);
      }
      if (!q.items || q.items.length === 0) {
        alert(`Quotation #${q.quotation_number} has no items.`);
        return;
      }
      const cartItems: POSCartItem[] = q.items.map((it: any) => ({
        product_id: it.product || it.product_id || it.id,
        name: it.name,
        unit_price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 1,
        discount: Number(it.discount) || 0,
        discount_type: "fixed",
        tax_rate: Number(it.tax_rate) || 0,
        unit: it.unit || "pcs",
        hsn_code: it.hsn_code || "",
        current_stock: 999,
        track_inventory: true,
      }));
      setCart(cartItems);

      if (q.customer) {
        setIsWalkIn(false);
        const cId = typeof q.customer === "string" ? q.customer : (q.customer as any).id;
        setSelectedCustomer({
          id: cId,
          customer_id: cId,
          full_name: q.customer_name || "Customer",
          phone: q.customer_phone || "",
          email: q.customer_email || "",
          outstanding_credit: 0,
          total_purchases: 0,
          total_spend: 0,
          segment: "Standard",
          last_purchase_at: "",
        });
      } else if (q.customer_name && q.customer_name !== "Walk-in Customer") {
        setIsWalkIn(false);
        setSelectedCustomer({
          id: "",
          customer_id: "",
          full_name: q.customer_name,
          phone: q.customer_phone || "",
          email: q.customer_email || "",
          outstanding_credit: 0,
          total_purchases: 0,
          total_spend: 0,
          segment: "Standard",
          last_purchase_at: "",
        });
      }

      setLoadedQuoteBanner({
        number: q.quotation_number,
        total: String(q.total),
        count: cartItems.length,
      });
      setQuoteInput("");
      setActiveView("new");
    } catch {
      alert(`Quotation "${qNum}" not found or failed to load.`);
    } finally {
      setLoadingQuote(false);
    }
  }, [quoteInput]);

  // ==========================================
  // INITIAL POS CONFIG & QUOTATION PARAM
  // ==========================================
  useEffect(() => {
    async function init() {
      try {
        const [cfgRes, btRes, storeRes, heldRes, regRes] = await Promise.all([
          posApi.getConfig(),
          posApi.getBusinessTypes(),
          storeApi.list(),
          posApi.getHeldCarts(),
          posApi.getRegisterStatus(),
        ]);
        setConfig(cfgRes.data);
        setBusinessTypes(btRes.data);
        if (storeRes.data?.results?.length) {
          setStores(storeRes.data.results);
          setSelectedStoreId(storeRes.data.results[0].id);
        }
        setHeldCarts(heldRes.data || []);
        setRegister(regRes.data || null);
        if (cfgRes.data?.default_invoice_format) {
          setPrintFormat(cfgRes.data.default_invoice_format);
        }

        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const qParam = params.get("quote") || params.get("quotation");
          if (qParam) {
            handleLoadQuotation(qParam);
          }

          // Also initialize history filters from URL if present
          const qStatus = params.get("payment_status") || params.get("status");
          if (qStatus) setHistoryPaymentStatus(qStatus);
          const qMethod = params.get("payment_method") || params.get("method");
          if (qMethod) setHistoryPaymentMethod(qMethod.toLowerCase());
          const qType = params.get("invoice_type") || params.get("type");
          if (qType) setHistoryInvoiceType(qType);
          const qSearch = params.get("search");
          if (qSearch) setHistorySearch(qSearch);
          const qDate = params.get("date");
          if (qDate === "today") {
            const todayStr = new Date().toISOString().split("T")[0];
            setHistoryStartDate(todayStr);
            setHistoryEndDate(todayStr);
          } else if (qDate) {
            setHistoryStartDate(qDate);
            setHistoryEndDate(qDate);
          }
        }
      } catch (err) {
        console.error("Failed to load POS config", err);
      }
    }
    init();
  }, [handleLoadQuotation]);

  // ==========================================
  // PRODUCT CATALOG & REALTIME REFRESH
  // ==========================================
  const fetchCategories = useCallback(async () => {
    try {
      const categoryRes = await productApi.listCategories();
      const categoryData = Array.isArray(categoryRes.data)
        ? categoryRes.data
        : (categoryRes.data as any)?.results || [];
      const categoryNames = categoryData
        .filter((category: any) => category.is_active !== false)
        .map((category: any) => category.name)
        .filter(Boolean) as string[];
      setCategories((previous) =>
        Array.from(new Set([...previous, ...categoryNames])).sort((a, b) => a.localeCompare(b))
      );
    } catch (err) {
      console.error("Failed to load POS categories", err);
    }
  }, []);

  const fetchProducts = useCallback(async (query: string, cat: string) => {
    setProductsLoading(true);
    try {
      const res = await posApi.searchProducts({
        search: query || undefined,
        category: cat !== "all" ? cat : undefined,
        page_size: 40,
      });
      const data = res.data;
      const list: POSProduct[] = Array.isArray(data) ? data : data.results || [];
      setProducts(list);
      const visibleCategories = list.map((product) => product.category).filter(Boolean) as string[];
      setCategories((previous) =>
        Array.from(new Set([...previous, ...visibleCategories])).sort((a, b) => a.localeCompare(b))
      );
    } catch (err) {
      console.error("Failed to fetch products", err);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(searchTerm, selectedCategory);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, fetchProducts]);

  const handleCatalogRealtimeEvent = useCallback(
    (event: { event_type: string }) => {
      if (POS_CATALOG_EVENT_FILTER.includes(event.event_type)) {
        fetchProducts(searchTerm, selectedCategory);
        fetchCategories();
      }
    },
    [fetchCategories, fetchProducts, searchTerm, selectedCategory]
  );
  useRealtimeSubscription(handleCatalogRealtimeEvent, POS_CATALOG_EVENT_FILTER);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchProducts(searchTerm, selectedCategory);
      fetchCategories();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [fetchCategories, fetchProducts, searchTerm, selectedCategory]);

  // ==========================================
  // CART CALCULATION & KEYBOARD SHORTCUTS
  // ==========================================
  useEffect(() => {
    if (cart.length === 0) {
      setCalcSummary(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCalcLoading(true);
      try {
        const res = await posApi.calculateCart({
          items: cart,
          overall_discount_type: overallDiscountType,
          overall_discount_value: Number(overallDiscountValue) || 0,
          is_interstate: isInterstate,
        });
        setCalcSummary(res.data);
      } catch (err) {
        console.error("Cart calculation error", err);
      } finally {
        setCalcLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [cart, overallDiscountType, overallDiscountValue, isInterstate]);

  const addToCart = (product: POSProduct) => {
    setCart((prev) => {
      const idx = prev.findIndex((item) => item.product_id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + 1,
        };
        return updated;
      }

      const newItem: POSCartItem = {
        product_id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        quantity: 1,
        unit_price: Number(product.selling_price ?? (product as any).unit_price) || 0,
        discount: 0,
        discount_type: "fixed",
        tax_rate: Number(product.tax_rate) || 0,
        hsn_code: product.hsn_code || "",
        unit: product.unit || "pcs",
        attributes: product.product_attributes || {},
        current_stock: Number(product.current_stock) || 0,
        track_inventory: product.track_inventory,
      };
      return [...prev, newItem];
    });
  };

  const updateCartItemQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    setOverallDiscountValue(0);
    setIsWalkIn(true);
    setSelectedCustomer(null);
    setLoadedQuoteBanner(null);
  };

  const handleHoldCart = async () => {
    if (cart.length === 0) return;
    const refName = prompt(
      "Enter reference note for held cart:",
      `Held-${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
    if (refName === null) return;

    try {
      const res = await posApi.holdCart({
        hold_reference: refName || undefined,
        customer_name: selectedCustomer?.full_name || (isWalkIn ? "Walk-in Customer" : ""),
        customer_phone: selectedCustomer?.phone || "",
        cart_data: { cart, isInterstate, overallDiscountType, overallDiscountValue, selectedCustomer, isWalkIn },
        subtotal: Number(calcSummary?.subtotal) || 0,
        item_count: cart.reduce((acc, c) => acc + c.quantity, 0),
        notes: "Held from billing workspace",
      });
      setHeldCarts((prev) => [res.data, ...prev]);
      clearCart();
    } catch {
      alert("Failed to hold cart. Please try again.");
    }
  };

  const resumeHeldCart = (held: HeldCart) => {
    if (cart.length > 0 && !confirm("Current cart will be replaced. Continue?")) {
      return;
    }
    const data = held.cart_data;
    if (data?.cart) {
      setCart(data.cart);
      setIsInterstate(!!data.isInterstate);
      setOverallDiscountType(data.overallDiscountType || "fixed");
      setOverallDiscountValue(data.overallDiscountValue || 0);
      setIsWalkIn(data.isWalkIn ?? true);
      setSelectedCustomer(data.selectedCustomer || null);
    }
    posApi.deleteHeldCart(held.id).then(() => {
      setHeldCarts((prev) => prev.filter((h) => h.id !== held.id));
    });
    setHeldModalOpen(false);
  };

  // Keyboard Shortcuts & Barcode reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is in history view unless Escape
      if (activeView !== "new" && e.key !== "Escape") return;

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter" && barcodeBufferRef.current.length >= 3 && diff < 80) {
        const scannedCode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = "";
        handleBarcodeScanned(scannedCode);
        return;
      }

      if (e.key.length === 1 && diff < 80) {
        barcodeBufferRef.current += e.key;
      } else if (diff >= 80) {
        barcodeBufferRef.current = e.key.length === 1 ? e.key : "";
      }

      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        setCustomerModalOpen(true);
      } else if (e.key === "F6") {
        e.preventDefault();
        if (cart.length > 0) {
          handleHoldCart();
        } else {
          setHeldModalOpen(true);
        }
      } else if (e.key === "F8") {
        e.preventDefault();
        if (cart.length > 0) {
          openPaymentModal();
        }
      } else if (e.key === "Escape") {
        setPaymentModalOpen(false);
        setCustomerModalOpen(false);
        setQuickAddModalOpen(false);
        setHeldModalOpen(false);
        setSelectedInvoice(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeView]);

  const handleBarcodeScanned = async (code: string) => {
    try {
      const res = await posApi.searchProducts({ search: code, page_size: 5 });
      const items: POSProduct[] = Array.isArray(res.data) ? res.data : res.data.results || [];
      const match = items.find((p) => p.barcode === code || p.sku === code) || items[0];
      if (match) {
        addToCart(match);
      }
    } catch (err) {
      console.error("Barcode scan lookup failed", err);
    }
  };

  // ==========================================
  // CUSTOMER LOOKUP & QUICK CREATE
  // ==========================================
  const handleCustomerSearch = async (val: string) => {
    setCustomerSearch(val);
    if (!val || val.length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    try {
      const res = await customerApi.list();
      const list = res.data?.results || [];
      const filtered = list.filter(
        (c: Customer) =>
          c.full_name?.toLowerCase().includes(val.toLowerCase()) ||
          c.phone?.includes(val) ||
          c.email?.toLowerCase().includes(val.toLowerCase())
      );
      setCustomerSearchResults(filtered);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await customerApi.create({
        full_name: newCustomerData.full_name,
        phone: newCustomerData.phone,
        email: newCustomerData.email,
      });
      setSelectedCustomer(res.data);
      setIsWalkIn(false);
      setCustomerModalOpen(false);
      setNewCustomerData({ full_name: "", phone: "", email: "", credit_limit: 5000 });
    } catch {
      alert("Failed to create customer. Phone or email might already exist.");
    }
  };

  // ==========================================
  // QUICK ADD PRODUCT
  // ==========================================
  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: quickProduct.name,
        sku: quickProduct.sku || `SKU-${Date.now().toString().slice(-6)}`,
        barcode: quickProduct.barcode || undefined,
        selling_price: parseFloat(quickProduct.selling_price) || 0,
        purchase_price: parseFloat(quickProduct.purchase_price) || 0,
        tax_rate: parseFloat(quickProduct.tax_rate) || 0,
        unit: quickProduct.unit || "pcs",
        current_stock: parseFloat(quickProduct.current_stock) || 0,
        hsn_code: quickProduct.hsn_code || undefined,
        product_attributes: quickProduct.attributes,
      };
      const res = await posApi.quickCreateProduct(payload);
      addToCart(res.data);
      setQuickAddModalOpen(false);
      setQuickProduct({
        name: "",
        sku: "",
        barcode: "",
        selling_price: "",
        purchase_price: "",
        tax_rate: "18",
        unit: "pcs",
        current_stock: "10",
        hsn_code: "",
        attributes: {},
      });
      fetchProducts(searchTerm, selectedCategory);
    } catch {
      alert("Failed to add product. Check required fields.");
    }
  };

  // ==========================================
  // PAYMENT CALCULATION & SETTLEMENT FLOW
  // ==========================================
  const localCartSubtotal = cart.reduce(
    (acc, item) => acc + Math.max(0, item.quantity * item.unit_price - (item.discount || 0)),
    0
  );
  const grandTotalNum =
    calcSummary && Number(calcSummary.grand_total) > 0
      ? Number(calcSummary.grand_total)
      : localCartSubtotal;

  const openPaymentModal = () => {
    if (cart.length === 0) return;
    const payable = grandTotalNum > 0 ? grandTotalNum : localCartSubtotal;
    setCheckoutError("");
    setPayments([{ method: "CASH", amount: payable }]);
    setPayingCashAmount(payable);
    setPaymentModalOpen(true);
  };

  const totalPaidSoFar = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const remainingDue = Math.max(0, grandTotalNum - totalPaidSoFar);
  const cashChange = totalPaidSoFar > grandTotalNum ? totalPaidSoFar - grandTotalNum : 0;

  const setPrimaryPaymentMethod = (method: string) => {
    const payable = grandTotalNum > 0 ? grandTotalNum : localCartSubtotal;
    setPayments([{ method, amount: payable }]);
    setPayingCashAmount(payable);
    setCheckoutError("");
  };

  const addSplitPaymentMethod = (method: string) => {
    const amt = remainingDue > 0 ? remainingDue : 0;
    setPayments((prev) => [...prev, { method, amount: amt }]);
    setCheckoutError("");
  };

  const updatePaymentMethod = (index: number, newMethod: string) => {
    setPayments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], method: newMethod };
      return updated;
    });
  };

  const updatePaymentAmount = (index: number, val: number) => {
    setPayments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount: Math.max(0, val) };
      return updated;
    });
  };

  const removePaymentLine = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const setQuickCashTender = (tenderedAmount: number) => {
    setPayments((prev) => {
      const cashIdx = prev.findIndex((p) => p.method === "CASH");
      if (cashIdx >= 0) {
        const updated = [...prev];
        updated[cashIdx] = { ...updated[cashIdx], amount: tenderedAmount };
        return updated;
      }
      return [{ method: "CASH", amount: tenderedAmount }];
    });
    setPayingCashAmount(tenderedAmount);
  };

  // Checkout Execution with Idempotency Protection
  const handleCheckout = async () => {
    // Synchronous lock to prevent duplicate concurrent submissions
    if (inFlightCheckoutRef.current || checkoutLoading) return;

    if (payments.length === 0) {
      setCheckoutError("Please specify at least one payment method.");
      return;
    }

    if (totalPaidSoFar < grandTotalNum) {
      const hasCredit = payments.some((p) => p.method === "CREDIT");
      if (!hasCredit) {
        setCheckoutError(
          `Tendered amount (₹${totalPaidSoFar.toFixed(2)}) is less than total (₹${grandTotalNum.toFixed(2)}). Add Credit or adjust payment.`
        );
        return;
      }
    }

    inFlightCheckoutRef.current = true;
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const payload: any = {
        store_id: selectedStoreId || undefined,
        quotation_number: loadedQuoteBanner?.number || undefined,
        items: cart,
        overall_discount_type: overallDiscountType,
        overall_discount_value: Number(overallDiscountValue) || 0,
        is_interstate: isInterstate,
        is_walk_in: isWalkIn,
        customer:
          !isWalkIn && selectedCustomer
            ? {
                id: selectedCustomer.id,
                name: selectedCustomer.full_name,
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
              }
            : undefined,
        payments: payments.map((p) => ({
          payment_method: p.method,
          amount: p.amount,
          reference: p.reference,
        })),
        idempotency_key: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };

      const res = await posApi.checkout(payload);
      setCompletedSale(res.data);
      setPaymentModalOpen(false);
      clearCart();
      // Silently refresh history in background
      fetchHistoryInvoices(true);
    } catch (err: unknown) {
      const errorMsg = parseApiError(err, "Checkout failed. Please check stock or payments.");
      setCheckoutError(errorMsg);
    } finally {
      inFlightCheckoutRef.current = false;
      setCheckoutLoading(false);
    }
  };

  // ==========================================
  // 10. INVOICE HISTORY FETCHING & ACTIONS
  // ==========================================
  const fetchHistoryInvoices = useCallback(
    async (silent = false) => {
      if (!silent) setHistoryLoading(true);
      try {
        if (isStaff) {
          const res = await staffApi.getInvoices({
            search: historySearch || undefined,
            payment_status: historyPaymentStatus || undefined,
            start_date: historyStartDate || undefined,
            end_date: historyEndDate || undefined,
            page: historyPage,
          });
          const data = res.data;
          if (Array.isArray(data)) {
            setInvoices(data);
            setHistoryTotalCount(data.length);
          } else if (data && Array.isArray(data.results)) {
            setInvoices(data.results);
            setHistoryTotalCount(data.count || data.results.length);
          } else {
            setInvoices([]);
            setHistoryTotalCount(0);
          }
        } else {
          const res = await invoiceApi.list({
            search: historySearch || undefined,
            payment_status: historyPaymentStatus || undefined,
            payment_method: historyPaymentMethod || undefined,
            invoice_type: historyInvoiceType || undefined,
            start_date: historyStartDate || undefined,
            end_date: historyEndDate || undefined,
            page: historyPage,
          });
          const data = res.data;
          if (Array.isArray(data)) {
            setInvoices(data);
            setHistoryTotalCount(data.length);
          } else if (data && Array.isArray(data.results)) {
            setInvoices(data.results);
            setHistoryTotalCount(data.count || data.results.length);
          } else {
            setInvoices([]);
            setHistoryTotalCount(0);
          }
        }
      } catch (err) {
        console.error("Failed to load invoice history:", err);
        setInvoices([]);
        setHistoryTotalCount(0);
      } finally {
        if (!silent) setHistoryLoading(false);
      }
    },
    [
      isStaff,
      historySearch,
      historyPaymentStatus,
      historyPaymentMethod,
      historyInvoiceType,
      historyStartDate,
      historyEndDate,
      historyPage,
    ]
  );

  useEffect(() => {
    if (activeView === "history") {
      fetchHistoryInvoices();
    }
  }, [activeView, fetchHistoryInvoices]);

  const handleViewInvoiceDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setDetailLoading(true);
    try {
      const res = await invoiceApi.get(inv.id);
      setSelectedInvoice(res.data);
    } catch {
      // Keep row invoice if full get is unavailable
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrintInvoice = (inv: Invoice) => {
    if (inv.web_url) {
      const printWin = window.open(inv.web_url, "_blank");
      if (printWin) {
        printWin.focus();
        setTimeout(() => printWin.print(), 1000);
      }
    } else {
      window.open(`/api/v1/invoices/${inv.id}/pdf/?raw=true`, "_blank");
    }
  };

  const handleDownloadInvoicePdf = async (inv: Invoice) => {
    if (isStaff) {
      window.open(`/api/v1/invoices/${inv.id}/pdf/?download=true`, "_blank");
      return;
    }
    if (inv.pdf_url) {
      window.open(inv.pdf_url, "_blank");
      return;
    }
    setPdfGenerating(true);
    try {
      const res = await invoiceApi.generatePdf(inv.id);
      if (res.data?.pdf_url) {
        window.open(res.data.pdf_url, "_blank");
        fetchHistoryInvoices(true);
      } else if (inv.web_url) {
        window.open(inv.web_url, "_blank");
      }
    } catch {
      window.open(`/api/v1/invoices/${inv.id}/pdf/?download=true`, "_blank");
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleShareWhatsApp = (inv: Invoice) => {
    const phone = inv.customer_phone?.replace(/\D/g, "");
    const webUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${inv.web_url || `/bills/${inv.id}`}`
        : "";
    const text = encodeURIComponent(
      `Hello ${inv.customer_name || "Valued Customer"}, thank you for your purchase! Your invoice #${inv.invoice_number} of ₹${inv.total} is ready. View it here: ${webUrl}`
    );
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  // Business Type Helper
  const currentVerticalKey = config?.business_type || "RETAIL";
  const currentVerticalMeta = businessTypes[currentVerticalKey] || {
    label: "General Retail",
    name: "General Retail",
    category_suggestions: ["General", "Accessories", "Electronics"],
    custom_fields: [],
  };

  // Dynamic UPI URL for QR Code
  const upiId = config?.gstin
    ? `${config.trade_name || "shop"}@upi`
    : "billfree.business@okhdfcbank";
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(config?.trade_name || "BillFree Store")}&am=${remainingDue > 0 ? remainingDue.toFixed(2) : grandTotalNum.toFixed(2)}&cu=INR&tn=Invoice%20Bill`;

  // History KPI metrics
  const historyTotalAmountSum = invoices.reduce(
    (sum, inv) => sum + (parseFloat(String(inv.total)) || 0),
    0
  );
  const historyPaidCount = invoices.filter(
    (i) => i.payment_status?.toLowerCase() === "paid"
  ).length;
  const historyCreditCount = invoices.filter(
    (i) => i.payment_status?.toLowerCase() === "credit"
  ).length;

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100vh-8.5rem)] lg:h-[calc(100vh-8rem)] pb-16 lg:pb-0">
      {/* ========================================================================= */}
      {/* UNIFIED WORKSPACE HEADER & VIEW SEGMENTED CONTROLS                         */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          {/* Workspace Title & Vertical Badge */}
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Receipt className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm sm:text-base font-bold leading-tight flex items-center gap-2">
                <span>Billing Workspace</span>
                <span className="hidden sm:inline-block rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {currentVerticalMeta.label || currentVerticalMeta.name}
                </span>
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{isStaff ? "Staff POS & History" : "Store POS & Tax Invoices"}</span>
                {config?.gstin && <span className="hidden md:inline">• GSTIN: {config.gstin}</span>}
              </div>
            </div>
          </div>

          {/* Segmented View Switcher: New Bill vs Invoice History */}
          <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => switchView("new")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                activeView === "new"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>New Bill</span>
            </button>
            <button
              type="button"
              onClick={() => switchView("history")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                activeView === "history"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="h-3.5 w-3.5" />
              <span>Invoice History</span>
              {historyTotalCount > 0 && activeView === "history" && (
                <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] text-primary font-bold">
                  {historyTotalCount}
                </span>
              )}
            </button>
          </div>

          {/* Store Selector (when in New Bill view) */}
          {activeView === "new" && stores.length > 1 && (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}

          {/* Quotation Loader (when in New Bill view) */}
          {activeView === "new" && (
            <div className="hidden sm:flex items-center gap-1.5 border-l pl-3 ml-1">
              <div className="relative">
                <FileCheck className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Quotation #..."
                  value={quoteInput}
                  onChange={(e) => setQuoteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLoadQuotation();
                    }
                  }}
                  className="h-8 pl-8 pr-2 w-36 lg:w-44 text-xs font-mono uppercase"
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={loadingQuote || !quoteInput.trim()}
                onClick={() => handleLoadQuotation()}
                className="h-8 text-xs font-semibold px-2.5"
              >
                {loadingQuote ? "Loading..." : "Load"}
              </Button>
            </div>
          )}
        </div>

        {/* Right Action Tools: Register, Held Bills, Shortcuts, New Bill Shortcut */}
        <div className="flex items-center gap-2">
          {activeView === "history" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchHistoryInvoices()}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", historyLoading && "animate-spin")} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                size="sm"
                onClick={() => switchView("new")}
                className="h-8 gap-1.5 text-xs font-bold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ New Bill</span>
              </Button>
            </>
          ) : (
            <>
              {/* Register Status */}
              {register?.status === "open" ? (
                <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Register Open: ₹{parseFloat(register.expected_cash || register.opening_balance).toLocaleString()}
                </div>
              ) : (
                <a
                  href="/dashboard/register"
                  className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/20"
                >
                  <ShieldAlert className="h-3 w-3" />
                  Register Closed
                </a>
              )}

              {/* Held Bills Badge */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHeldModalOpen(true)}
                className="relative h-8 gap-1.5 text-xs font-medium"
              >
                <Pause className="h-3 w-3" />
                <span className="hidden sm:inline">Held Bills</span>
                {heldCarts.length > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {heldCarts.length}
                  </span>
                )}
              </Button>

              {/* Ask Copilot */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.dispatchEvent(new CustomEvent("open-copilot"))}
                className="h-8 gap-1.5 text-xs font-semibold border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 hover:text-indigo-800 shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Ask Copilot</span>
              </Button>

              {/* Keyboard Shortcut Hints */}
              <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-muted-foreground border-l pl-2.5">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F2</span> Search
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F4</span> Customer
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F6</span> Hold
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F8</span> Pay
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: NEW BILL (POS TERMINAL CATALOG, CART & CHECKOUT)                   */}
      {/* ========================================================================= */}
      {activeView === "new" && (
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Mobile/Tablet Catalog vs Cart Tab Switcher */}
          <div className="flex lg:hidden items-center rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMobileTab("catalog")}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all min-h-[40px] touch-target-min",
                mobileTab === "catalog"
                  ? "bg-background text-foreground shadow-xs border font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Catalog & Items</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("cart")}
              className={cn(
                "flex-1 py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all relative min-h-[40px] touch-target-min",
                mobileTab === "cart"
                  ? "bg-background text-foreground shadow-xs border font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt className="h-4 w-4 text-emerald-600" />
              <span>Cart & Checkout</span>
              {cart.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground leading-none">
                  {cart.length}
                </span>
              )}
              {cart.length > 0 && (
                <span className="font-bold text-primary text-xs ml-1">
                  ₹{grandTotalNum.toFixed(0)}
                </span>
              )}
            </button>
          </div>

          {/* Quotation Loaded Notification Banner */}
          {loadedQuoteBanner && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Quotation #{loadedQuoteBanner.number}</strong> loaded into cart ({loadedQuoteBanner.count} items, Total: ₹{loadedQuoteBanner.total}). Ready for billing & checkout!
                </span>
              </div>
              <button
                onClick={() => setLoadedQuoteBanner(null)}
                className="text-xs text-blue-700 hover:text-blue-900 font-bold ml-2 px-1.5 py-0.5 rounded hover:bg-blue-200/50"
              >
                ×
              </button>
            </div>
          )}

          {/* Main Work Area: Left Catalog & Right Cart */}
          <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12 min-h-0">
            {/* Left Side: Product Search, Category Pills, Grid */}
            <div
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs lg:col-span-7 xl:col-span-8 overflow-hidden min-h-0",
                mobileTab === "cart" ? "hidden lg:flex" : "flex"
              )}
            >
              {/* Search bar + Quick Add Product */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search products by Name, SKU, Barcode, or Brand (F2)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-8 text-sm"
                  />
                  <Barcode className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
                <Button
                  size="sm"
                  onClick={() => setQuickAddModalOpen(true)}
                  className="gap-1 shrink-0 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Product</span>
                </Button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`rounded-full px-3 py-1 font-medium transition-colors ${
                    selectedCategory === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  All Items
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedCategory(c)}
                    className={`rounded-full px-3 py-1 font-medium transition-colors shrink-0 ${
                      selectedCategory === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              <div className="flex-1 overflow-y-auto pr-1">
                {productsLoading ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
                    Loading products...
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <Tag className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">No products found</p>
                    <p className="text-xs">Create a quick product or clear search filters.</p>
                    <Button size="sm" variant="outline" onClick={() => setQuickAddModalOpen(true)}>
                      + Add Product
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {products.map((p) => {
                      const stockNum = Number(p.current_stock) || 0;
                      const isOutOfStock = p.track_inventory && stockNum <= 0;
                      const isLowStock =
                        p.track_inventory && stockNum > 0 && stockNum <= (Number(p.min_stock) || 5);

                      return (
                        <div
                          key={p.id}
                          onClick={() => !isOutOfStock && addToCart(p)}
                          className={`group relative flex flex-col justify-between rounded-md border p-2.5 transition-all cursor-pointer hover:border-primary hover:shadow-sm ${
                            isOutOfStock ? "opacity-50 cursor-not-allowed bg-muted/40" : "bg-card"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="line-clamp-2 text-xs font-semibold leading-snug group-hover:text-primary">
                                {p.name}
                              </h4>
                            </div>
                            <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">{p.sku}</p>

                            {p.product_attributes && Object.keys(p.product_attributes).length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {Object.entries(p.product_attributes).slice(0, 2).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground"
                                  >
                                    {String(v)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-end justify-between border-t pt-1.5">
                            <div>
                              <div className="text-xs font-bold text-foreground">
                                ₹{Number(p.selling_price ?? (p as any).unit_price).toFixed(2)}
                              </div>
                              {p.mrp && Number(p.mrp) > Number(p.selling_price ?? (p as any).unit_price) && (
                                <div className="text-[10px] text-muted-foreground line-through">
                                  ₹{Number(p.mrp).toFixed(2)}
                                </div>
                              )}
                            </div>

                            {p.track_inventory && (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isOutOfStock
                                    ? "bg-destructive/15 text-destructive"
                                    : isLowStock
                                    ? "bg-amber-500/15 text-amber-700"
                                    : "bg-emerald-500/15 text-emerald-700"
                                }`}
                              >
                                {stockNum} {p.unit || "pcs"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Cart, Customer, Calculations, and Actions */}
            <div
              className={cn(
                "flex flex-col rounded-lg border bg-card p-3 shadow-xs lg:col-span-5 xl:col-span-4 overflow-hidden min-h-0",
                mobileTab === "catalog" ? "hidden lg:flex" : "flex"
              )}
            >
              {/* Customer Selection Header */}
              <div className="flex items-center justify-between border-b pb-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-semibold">
                      {isWalkIn ? "Walk-in Customer" : selectedCustomer?.full_name || "Customer Selected"}
                    </p>
                    {!isWalkIn && selectedCustomer && (
                      <p className="text-[11px] text-muted-foreground">
                        Ph: {selectedCustomer.phone} • Limit: ₹{Number(selectedCustomer.credit_limit || 5000)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomerModalOpen(true)}
                  className="h-7 text-xs font-medium gap-1"
                >
                  <Users className="h-3 w-3" />
                  {isWalkIn ? "Select (F4)" : "Change"}
                </Button>
              </div>

              {/* Cart Items Table */}
              <div className="flex-1 overflow-y-auto py-2 min-h-0">
                {cart.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <Receipt className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-xs font-medium">Cart is empty</p>
                    <p className="text-[11px]">Scan barcode or click items on the left to add.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item, idx) => {
                      const lineTotal = item.quantity * item.unit_price - (item.discount || 0);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              ₹{item.unit_price} × {item.quantity} {item.unit || "pcs"}
                              {item.tax_rate > 0 && ` (${item.tax_rate}% GST)`}
                            </p>
                            {item.discount > 0 && (
                              <p className="text-[10px] text-emerald-600 font-medium">
                                -₹{item.discount} item discount
                              </p>
                            )}
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(idx, -1)}
                              className="flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-md border bg-muted hover:bg-muted/80 active:bg-muted/60 transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(idx, 1)}
                              className="flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-md border bg-muted hover:bg-muted/80 active:bg-muted/60 transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Line Total & Remove */}
                          <div className="text-right shrink-0">
                            <p className="font-bold text-foreground">₹{lineTotal.toFixed(2)}</p>
                            <button
                              type="button"
                              onClick={() => removeFromCart(idx)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded-md inline-flex items-center justify-center transition-colors"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cart Calculation & Summary */}
              <div className="border-t pt-2.5 space-y-1.5 text-xs shrink-0">
                {/* Discount & Interstate Toggles */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Bill Discount:</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={overallDiscountValue || ""}
                      onChange={(e) => setOverallDiscountValue(parseFloat(e.target.value) || 0)}
                      className="w-16 rounded border px-1.5 py-0.5 text-right text-xs"
                    />
                    <button
                      onClick={() =>
                        setOverallDiscountType(overallDiscountType === "fixed" ? "percentage" : "fixed")
                      }
                      className="rounded bg-muted px-1.5 py-0.5 font-bold text-[10px]"
                    >
                      {overallDiscountType === "fixed" ? "₹" : "%"}
                    </button>
                  </div>

                  <label className="flex items-center gap-1 cursor-pointer text-muted-foreground text-[11px]">
                    <input
                      type="checkbox"
                      checked={isInterstate}
                      onChange={(e) => setIsInterstate(e.target.checked)}
                      className="rounded"
                    />
                    IGST (Interstate)
                  </label>
                </div>

                {/* Calculations Breakdown */}
                <div className="space-y-1 rounded bg-muted/40 p-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span>₹{calcSummary ? Number(calcSummary.subtotal).toFixed(2) : localCartSubtotal.toFixed(2)}</span>
                  </div>
                  {calcSummary && Number(calcSummary.total_discount) > 0 && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Total Discount:</span>
                      <span>-₹{Number(calcSummary.total_discount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax ({isInterstate ? "IGST" : "CGST + SGST"}):</span>
                    <span>₹{calcSummary ? Number(calcSummary.tax).toFixed(2) : "0.00"}</span>
                  </div>
                  {calcSummary && Number(calcSummary.round_off) !== 0 && (
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Round Off:</span>
                      <span>
                        {Number(calcSummary.round_off) > 0 ? "+" : ""}₹{Number(calcSummary.round_off).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 text-sm font-black text-foreground">
                    <span>Grand Total:</span>
                    <span className="text-primary text-base">₹{grandTotalNum.toFixed(2)}</span>
                  </div>
                </div>

                {/* Bottom Cart Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (cart.length > 0 && confirm("Clear all items from the current cart?")) {
                        clearCart();
                      }
                    }}
                    disabled={cart.length === 0}
                    className="text-xs h-9"
                  >
                    Clear
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleHoldCart}
                    disabled={cart.length === 0}
                    className="text-xs h-9 gap-1"
                  >
                    <Pause className="h-3 w-3" />
                    Hold (F6)
                  </Button>
                  <Button
                    size="sm"
                    onClick={openPaymentModal}
                    disabled={cart.length === 0}
                    className="text-xs h-9 font-bold bg-primary text-primary-foreground gap-1 hover:bg-primary/90 shadow-sm cursor-pointer"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Pay (F8)
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Floating Mobile Checkout Bar (Sits safely above mobile bottom navigation) */}
          {mobileTab === "catalog" && cart.length > 0 && (
            <div className="lg:hidden fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] left-2.5 right-2.5 sm:left-4 sm:right-4 z-30 flex items-center justify-between rounded-xl bg-slate-900/95 text-white p-2.5 sm:p-3 shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-sm shrink-0">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-bold text-emerald-400">₹{grandTotalNum.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 truncate">({cart.length} items)</span>
                  </div>
                  <p className="text-[10px] text-slate-300 truncate">
                    {isWalkIn ? "Walk-in" : selectedCustomer?.full_name || "Customer Selected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMobileTab("cart")}
                  className="text-xs h-9 px-2.5 font-medium border-slate-600 bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-600"
                >
                  View Cart
                </Button>
                <Button
                  size="sm"
                  onClick={openPaymentModal}
                  className="text-xs h-9 px-3 font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1 shadow-sm active:bg-emerald-700"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Pay</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: INVOICE HISTORY                                                   */}
      {/* ========================================================================= */}
      {activeView === "history" && (
        <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Top History KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Invoices Listed</span>
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-foreground">{historyTotalCount}</span>
                <span className="text-[11px] text-muted-foreground">records</span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Total Value</span>
                <ArrowUpDown className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-foreground">
                  ₹{historyTotalAmountSum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Settled (Paid)</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-emerald-600">{historyPaidCount}</span>
                <span className="text-[11px] text-muted-foreground">paid</span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Credit / Udhaar</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-amber-600">{historyCreditCount}</span>
                <span className="text-[11px] text-muted-foreground">outstanding</span>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="rounded-lg border bg-card p-2.5 sm:p-3 shadow-2xs space-y-2.5 shrink-0">
            <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
              {/* Search bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by Invoice #, Customer name, or Mobile..."
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full rounded-lg border bg-background pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={historyPaymentStatus}
                  onChange={(e) => {
                    setHistoryPaymentStatus(e.target.value);
                    setHistoryPage(1);
                  }}
                  aria-label="Filter by payment status"
                  className="rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All Payment Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="credit">Credit / Udhaar</option>
                  <option value="partial">Partially Paid</option>
                </select>

                {!isStaff && (
                  <select
                    value={historyPaymentMethod}
                    onChange={(e) => {
                      setHistoryPaymentMethod(e.target.value);
                      setHistoryPage(1);
                    }}
                    aria-label="Filter by payment channel"
                    className="rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">All Channels</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / QR</option>
                    <option value="card">Card POS</option>
                    <option value="credit">Credit / Udhaar</option>
                  </select>
                )}

                {/* Date pickers */}
                <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => {
                      setHistoryStartDate(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="bg-transparent text-xs text-foreground focus:outline-none"
                    title="Start Date"
                  />
                  <span>-</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => {
                      setHistoryEndDate(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="bg-transparent text-xs text-foreground focus:outline-none"
                    title="End Date"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split("T")[0];
                    setHistoryStartDate(todayStr);
                    setHistoryEndDate(todayStr);
                    setHistoryPage(1);
                  }}
                  className="h-8 text-xs px-2.5 font-medium"
                >
                  Today
                </Button>

                {(historySearch || historyPaymentStatus || historyPaymentMethod || historyStartDate || historyEndDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistorySearch("");
                      setHistoryPaymentStatus("");
                      setHistoryPaymentMethod("");
                      setHistoryInvoiceType("");
                      setHistoryStartDate("");
                      setHistoryEndDate("");
                      setHistoryPage(1);
                    }}
                    className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground font-semibold"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="rounded-lg border bg-card shadow-2xs overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span>Loading invoice records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2.5">
                          <FileText className="h-10 w-10 text-muted-foreground/40" />
                          <div>
                            <p className="font-semibold text-foreground text-sm">No Invoices Found</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {historySearch || historyPaymentStatus || historyStartDate
                                ? "Adjust your search filters to find past invoices."
                                : "Invoices generated from the POS will automatically appear here."}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => switchView("new")}
                            className="mt-1 gap-1 text-xs font-semibold"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Create New Bill</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => {
                      const isPaid = inv.payment_status?.toLowerCase() === "paid";
                      const isCredit = inv.payment_status?.toLowerCase() === "credit";

                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-accent/40 transition-colors group cursor-pointer"
                          onClick={() => handleViewInvoiceDetail(inv)}
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-foreground">
                            <div className="flex items-center gap-1.5">
                              <span>{inv.invoice_number}</span>
                              {inv.origin_quotation_id && (
                                <span
                                  title="Converted from Quotation"
                                  className="rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1 py-0.2 text-[9px] font-bold"
                                >
                                  QUOTE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                            {inv.transaction_date || inv.created_at
                              ? new Date(inv.transaction_date || inv.created_at).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-foreground">
                              {inv.customer_name || "Walk-in Customer"}
                            </div>
                            {inv.customer_phone && (
                              <div className="text-[11px] text-muted-foreground">{inv.customer_phone}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
                              {inv.invoice_type || "GST"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-foreground whitespace-nowrap">
                            ₹
                            {Number(inv.total || 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                isPaid
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : isCredit
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  isPaid ? "bg-emerald-500" : isCredit ? "bg-amber-500" : "bg-blue-500"
                                )}
                              />
                              {inv.payment_status ? inv.payment_status.toUpperCase() : "PAID"}
                            </span>
                          </td>
                          <td
                            className="py-2.5 px-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleViewInvoiceDetail(inv)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                title="View Details"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handlePrintInvoice(inv)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                title="Print Invoice"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDownloadInvoicePdf(inv)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                title="Download PDF"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleShareWhatsApp(inv)}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                title="Share on WhatsApp"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {historyTotalCount > 20 && (
              <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground shrink-0 bg-card">
                <div>
                  Showing page {historyPage} of {Math.ceil(historyTotalCount / 20)} ({historyTotalCount} total)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1 rounded border px-2 py-0.5 disabled:opacity-40 hover:bg-accent text-xs"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    <span>Prev</span>
                  </button>
                  <button
                    disabled={historyPage >= Math.ceil(historyTotalCount / 20)}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className="flex items-center gap-1 rounded border px-2 py-0.5 disabled:opacity-40 hover:bg-accent text-xs"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CHECKOUT & PAYMENT DIALOG                                        */}
      {/* ========================================================================= */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-2xl w-[96vw] sm:w-full max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader className="border-b pb-3 shrink-0">
            <DialogTitle className="flex items-center justify-between text-base sm:text-lg">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <span>Checkout & Settlement</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-normal text-muted-foreground block">Payable Amount</span>
                <span className="text-xl font-black text-primary">₹{grandTotalNum.toFixed(2)}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-4 min-h-0">
            {/* Primary Payment Selector with Instant Single-Click Switch */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Select Payment Method
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "CASH", label: "Cash", icon: Banknote },
                  { id: "UPI", label: "UPI QR", icon: QrCode },
                  { id: "CARD", label: "Card", icon: CreditCard },
                  { id: "CREDIT", label: "Udhaar / Credit", icon: Receipt },
                ].map((m) => {
                  const isSelected = payments.length === 1 && payments[0].method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPrimaryPaymentMethod(m.id)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-semibold transition-all gap-1 text-center cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary shadow-xs font-bold"
                          : "border-border bg-card hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <m.icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span>{m.label}</span>
                      {isSelected && <span className="text-[10px] text-primary font-bold">✓ Active</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fast Cash Tender Shortcuts */}
            {payments.some((p) => p.method === "CASH") && (
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/25 p-2.5 space-y-1.5">
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  ⚡ Fast Cash Tender Shortcuts:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickCashTender(grandTotalNum)}
                    className="h-7 text-xs bg-emerald-100/60 hover:bg-emerald-200/70 border-emerald-300 text-emerald-900 font-bold"
                  >
                    Exact ₹{grandTotalNum.toFixed(2)}
                  </Button>
                  {(() => {
                    const presets = [100, 200, 500, 1000, 2000].filter((n) => n >= grandTotalNum);
                    const noteButtons = presets.slice(0, 4);
                    return noteButtons.map((amt) => (
                      <Button
                        key={amt}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQuickCashTender(amt)}
                        className="h-7 text-xs bg-white dark:bg-card border-border hover:bg-muted font-semibold"
                      >
                        ₹{amt} Note
                      </Button>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Split Payment Lines Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Payment Allocations {payments.length > 1 && "(Split Sale)"}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    addSplitPaymentMethod(payments.some((p) => p.method === "UPI") ? "CASH" : "UPI")
                  }
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Split Method
                </button>
              </div>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {payments.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-lg border p-2 bg-muted/20 text-xs"
                  >
                    <select
                      value={p.method}
                      onChange={(e) => updatePaymentMethod(idx, e.target.value)}
                      className="h-8 rounded border bg-background px-2 font-bold uppercase text-xs w-28 shrink-0"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI QR</option>
                      <option value="CARD">Card</option>
                      <option value="CREDIT">Udhaar</option>
                    </select>
                    <div className="relative flex-1 min-w-[120px]">
                      <span className="absolute left-2.5 top-2 text-muted-foreground font-bold">₹</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={p.amount}
                        onChange={(e) => updatePaymentAmount(idx, parseFloat(e.target.value) || 0)}
                        className="h-8 pl-6 text-xs font-bold font-mono"
                      />
                    </div>
                    <Input
                      placeholder="Ref / Note / Auth No"
                      value={p.reference || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPayments((prev) => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], reference: val };
                          return updated;
                        });
                      }}
                      className="h-8 text-xs flex-1 min-w-[120px]"
                    />
                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentLine(idx)}
                        className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Split & Live Balance Calculations */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
              <div className="md:col-span-7 space-y-2">
                {payments.some((p) => p.method === "CREDIT") && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-amber-600" />
                      Udhaar / Customer Credit Sale
                    </p>
                    {isWalkIn ? (
                      <p className="text-destructive font-medium mt-1">
                        ⚠️ Walk-in customers cannot take Credit sales. Please select or register a customer first (F4).
                      </p>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground">
                        Customer: <strong>{selectedCustomer?.full_name}</strong> • Phone: {selectedCustomer?.phone} • Outstanding: ₹{selectedCustomer?.outstanding_credit || 0}
                      </p>
                    )}
                  </div>
                )}

                {checkoutError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-1.5 animate-in shake">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{checkoutError}</span>
                  </div>
                )}
              </div>

              <div className="md:col-span-5 rounded-lg border bg-muted/30 p-2.5 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Bill:</span>
                  <span className="font-bold">₹{grandTotalNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tendered:</span>
                  <span className="font-bold text-emerald-600">₹{totalPaidSoFar.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black border-t pt-1">
                  <span>Balance Due:</span>
                  <span className={remainingDue > 0 ? "text-destructive" : "text-emerald-600"}>
                    ₹{remainingDue.toFixed(2)}
                  </span>
                </div>
                {cashChange > 0 && (
                  <div className="flex justify-between font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 p-1.5 rounded mt-1">
                    <span>Cash Change:</span>
                    <span>₹{cashChange.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* UPI QR Display */}
            {payments.some((p) => p.method === "UPI") && (
              <div className="rounded-lg border bg-card p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-1.5 rounded-lg border shadow-xs shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(upiUrl)}`}
                      alt="UPI Payment QR"
                      className="h-20 w-20"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Scan to Pay via UPI</span>
                    <span className="text-[11px] font-mono text-muted-foreground block">{upiId}</span>
                    <span className="text-[11px] font-bold text-emerald-600 block mt-0.5">
                      Amount: ₹{payments.find((p) => p.method === "UPI")?.amount.toFixed(2) || grandTotalNum.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground text-center sm:text-right">
                  <span className="inline-block rounded bg-muted px-2 py-1 text-[11px] font-mono">
                    GooglePay • PhonePe • Paytm • BHIM
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-auto pt-3 border-t flex flex-row items-center justify-between sm:justify-end gap-2 shrink-0 bg-background sticky bottom-0 z-20 safe-area-bottom">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaymentModalOpen(false)}
              disabled={checkoutLoading}
              className="h-11 sm:h-9 text-xs sm:text-sm touch-target-min"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading || (payments.some((p) => p.method === "CREDIT") && isWalkIn)}
              className="h-11 sm:h-9 font-bold bg-primary text-primary-foreground gap-1.5 min-w-[140px] text-xs sm:text-sm touch-target-min shadow-md"
            >
              {checkoutLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Complete Sale</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: POST-SALE ISOLATED RECEIPT & TAX INVOICE                          */}
      {/* ========================================================================= */}
      {completedSale && (
        <IsolatedReceiptModal
          saleData={completedSale}
          config={config}
          basePath={basePath}
          onClose={() => setCompletedSale(null)}
          onNewSale={() => {
            setCompletedSale(null);
            clearCart();
            searchInputRef.current?.focus();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: INVOICE DETAIL VIEW MODAL (FROM HISTORY)                         */}
      {/* ========================================================================= */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-5 sm:p-6 shadow-2xl text-foreground max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b pb-3.5 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold font-mono text-foreground">
                    {selectedInvoice.invoice_number}
                  </h3>
                  <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
                    {selectedInvoice.invoice_type || "Tax Invoice"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedInvoice.transaction_date || selectedInvoice.created_at
                    ? new Date(selectedInvoice.transaction_date || selectedInvoice.created_at).toLocaleString("en-IN", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })
                    : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3.5 space-y-4 text-xs min-h-0">
              {detailLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Customer & Store Meta */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase text-[10px]">
                        <User className="h-3.5 w-3.5" />
                        <span>Billed To</span>
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {selectedInvoice.customer_name || "Walk-in Customer"}
                      </div>
                      {selectedInvoice.customer_phone && (
                        <div className="text-muted-foreground font-mono">{selectedInvoice.customer_phone}</div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold uppercase text-[10px]">
                        <Receipt className="h-3.5 w-3.5" />
                        <span>Payment & Channel</span>
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {selectedInvoice.payment_method?.toUpperCase() || "CASH"}
                      </div>
                      <div>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.2 text-[10px] font-bold",
                            selectedInvoice.payment_status?.toLowerCase() === "paid"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-amber-500/10 text-amber-600"
                          )}
                        >
                          {selectedInvoice.payment_status?.toUpperCase() || "PAID"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Line Items
                    </h4>
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
                          {selectedInvoice.transaction_details?.items &&
                          selectedInvoice.transaction_details.items.length > 0 ? (
                            selectedInvoice.transaction_details.items.map((it: any, idx: number) => (
                              <tr key={idx} className="hover:bg-muted/20">
                                <td className="py-2 px-3">
                                  <div className="font-medium text-foreground">{it.name}</div>
                                  {it.hsn_code && (
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                      HSN: {it.hsn_code}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center font-mono">{it.quantity}</td>
                                <td className="py-2 px-3 text-right font-mono">₹{Number(it.unit_price).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                                  ₹{Number(it.tax || 0).toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                                  ₹{Number(it.total).toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                                Item details included in summary total.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="space-y-1.5 border-t pt-2.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{Number(selectedInvoice.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {Number(selectedInvoice.discount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount</span>
                        <span className="font-mono">- ₹{Number(selectedInvoice.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxes (GST)</span>
                      <span className="font-mono">₹{Number(selectedInvoice.tax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-foreground border-t pt-2 mt-1">
                      <span>Grand Total</span>
                      <span className="font-mono text-primary">₹{Number(selectedInvoice.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="border-t pt-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrintInvoice(selectedInvoice)}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadInvoicePdf(selectedInvoice)}
                  disabled={pdfGenerating}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Download className={cn("h-3.5 w-3.5", pdfGenerating && "animate-spin")} />
                  <span>{pdfGenerating ? "Generating..." : "Download PDF"}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleShareWhatsApp(selectedInvoice)}
                  className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </Button>
              </div>

              {selectedInvoice.web_url && (
                <a
                  href={selectedInvoice.web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-semibold"
                >
                  <span>Public Bill</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CUSTOMER SELECTOR & QUICK CREATE                                 */}
      {/* ========================================================================= */}
      <Dialog open={customerModalOpen} onOpenChange={setCustomerModalOpen}>
        <DialogContent className="max-w-md w-[96vw] sm:w-full max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader>
            <DialogTitle>Select or Add Customer</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs overflow-y-auto">
            {/* Walk-in Customer Option */}
            <div
              onClick={() => {
                setIsWalkIn(true);
                setSelectedCustomer(null);
                setCustomerModalOpen(false);
              }}
              className={`flex items-center justify-between p-2.5 rounded border cursor-pointer hover:bg-muted/50 ${
                isWalkIn ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-bold">Walk-in Customer</p>
                  <p className="text-[11px] text-muted-foreground">Standard cash/UPI sale without registration</p>
                </div>
              </div>
              {isWalkIn && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>

            {/* Search Existing Customer */}
            <div className="space-y-1">
              <label className="font-semibold text-muted-foreground">Search Existing Customer</label>
              <Input
                placeholder="Search by name, phone or email..."
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                className="text-xs"
              />
            </div>

            {customerSearchResults.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1 border rounded p-1">
                {customerSearchResults.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomer(c);
                      setIsWalkIn(false);
                      setCustomerModalOpen(false);
                    }}
                    className="flex items-center justify-between p-1.5 rounded hover:bg-muted cursor-pointer"
                  >
                    <div>
                      <p className="font-semibold">{c.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">Ph: {c.phone}</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}

            {/* Quick Register New Customer Form */}
            <form onSubmit={handleCreateCustomer} className="border-t pt-2 space-y-2">
              <p className="font-semibold text-foreground">Or Register New Customer:</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  required
                  placeholder="Full Name *"
                  value={newCustomerData.full_name}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, full_name: e.target.value })}
                  className="text-xs"
                />
                <Input
                  required
                  placeholder="Phone Number *"
                  value={newCustomerData.phone}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                  className="text-xs"
                />
              </div>
              <Input
                placeholder="Email (Optional)"
                value={newCustomerData.email}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                className="text-xs"
              />
              <Button type="submit" size="sm" className="w-full text-xs">
                Save & Select Customer
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 5: QUICK ADD PRODUCT                                                */}
      {/* ========================================================================= */}
      <Dialog open={quickAddModalOpen} onOpenChange={setQuickAddModalOpen}>
        <DialogContent className="max-w-lg w-[96vw] sm:w-full max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader>
            <DialogTitle>Quick Add Product</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleQuickAddProduct} className="space-y-3 py-2 text-xs overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold">Product Name *</label>
                <Input
                  required
                  placeholder="e.g. Berger Enamel 1L"
                  value={quickProduct.name}
                  onChange={(e) => setQuickProduct({ ...quickProduct, name: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">SKU / Code</label>
                <Input
                  placeholder="Auto-generated if blank"
                  value={quickProduct.sku}
                  onChange={(e) => setQuickProduct({ ...quickProduct, sku: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-semibold">Selling Price (₹) *</label>
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="450.00"
                  value={quickProduct.selling_price}
                  onChange={(e) => setQuickProduct({ ...quickProduct, selling_price: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">Cost Price (₹)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="380.00"
                  value={quickProduct.purchase_price}
                  onChange={(e) => setQuickProduct({ ...quickProduct, purchase_price: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">GST Rate (%)</label>
                <select
                  value={quickProduct.tax_rate}
                  onChange={(e) => setQuickProduct({ ...quickProduct, tax_rate: e.target.value })}
                  className="h-9 w-full rounded border px-2 text-xs"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-semibold">Barcode / EAN</label>
                <Input
                  placeholder="Scan or enter"
                  value={quickProduct.barcode}
                  onChange={(e) => setQuickProduct({ ...quickProduct, barcode: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">Opening Stock</label>
                <Input
                  type="number"
                  min="0"
                  value={quickProduct.current_stock}
                  onChange={(e) => setQuickProduct({ ...quickProduct, current_stock: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="font-semibold">Unit</label>
                <Input
                  placeholder="pcs, kg, m, ltr"
                  value={quickProduct.unit}
                  onChange={(e) => setQuickProduct({ ...quickProduct, unit: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            {currentVerticalMeta.custom_fields && currentVerticalMeta.custom_fields.length > 0 && (
              <div className="border-t pt-2 space-y-1.5">
                <p className="font-semibold text-primary">
                  {currentVerticalMeta.label || currentVerticalMeta.name} Specific Attributes:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {currentVerticalMeta.custom_fields.slice(0, 4).map((f) => {
                    const fieldKey = f.field_name || f.key;
                    return (
                      <div key={fieldKey}>
                        <label className="text-[11px] text-muted-foreground">{f.label}</label>
                        <Input
                          placeholder={`Enter ${f.label}`}
                          value={quickProduct.attributes[fieldKey] || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuickProduct((prev) => ({
                              ...prev,
                              attributes: { ...prev.attributes, [fieldKey]: val },
                            }));
                          }}
                          className="text-xs h-8"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuickAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create & Add to Cart</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 6: HELD CARTS RETRIEVAL                                             */}
      {/* ========================================================================= */}
      <Dialog open={heldModalOpen} onOpenChange={setHeldModalOpen}>
        <DialogContent className="max-w-md w-[96vw] sm:w-full max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden rounded-xl">
          <DialogHeader>
            <DialogTitle>Held Bills ({heldCarts.length})</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-2 max-h-64 overflow-y-auto text-xs">
            {heldCarts.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No held bills at the moment.</p>
            ) : (
              heldCarts.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded border p-2.5 hover:bg-muted/40"
                >
                  <div>
                    <p className="font-bold">{h.hold_reference || "Held Cart"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {h.customer_name || "Walk-in"} • {h.item_count} items • ₹{h.subtotal}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => resumeHeldCart(h)}
                      className="h-7 text-xs bg-primary text-primary-foreground"
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        posApi.deleteHeldCart(h.id).then(() => {
                          setHeldCarts((prev) => prev.filter((item) => item.id !== h.id));
                        });
                      }}
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

