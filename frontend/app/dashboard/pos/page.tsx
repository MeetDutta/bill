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
  Play,
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
  ArrowRight,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { posApi, customerApi, storeApi } from "@/services/api";
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
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function POSPage() {
  // Config & Metadata
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [businessTypes, setBusinessTypes] = useState<Record<string, BusinessTypeSchema>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [register, setRegister] = useState<CashRegister | null>(null);

  // Products & Filtering
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Cart State
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [overallDiscountType, setOverallDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [overallDiscountValue, setOverallDiscountValue] = useState<number>(0);
  const [isInterstate, setIsInterstate] = useState<boolean>(false);
  const [calcSummary, setCalcSummary] = useState<POSCalculateResponse | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Customer State
  const [isWalkIn, setIsWalkIn] = useState<boolean>(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ full_name: "", phone: "", email: "", credit_limit: 5000 });

  // Quick Add Product Modal
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

  // Held Carts
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [heldModalOpen, setHeldModalOpen] = useState(false);

  // Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payments, setPayments] = useState<{ method: string; amount: number; reference?: string }[]>([]);
  const [payingCashAmount, setPayingCashAmount] = useState<number>(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Post-Sale Modal
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [printFormat, setPrintFormat] = useState<"thermal_80mm" | "thermal_58mm" | "a4">("thermal_80mm");

  // Barcode / Keyboard input refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // Load Initial Setup
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
      } catch (err) {
        console.error("Failed to load POS config", err);
      }
    }
    init();
  }, []);

  // Fetch Products on search/category change
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

      // Extract unique categories
      const cats = Array.from(new Set(list.map((p) => p.category).filter(Boolean))) as string[];
      setCategories((prev) => Array.from(new Set([...prev, ...cats])));
    } catch (err) {
      console.error("Failed to fetch products", err);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(searchTerm, selectedCategory);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, fetchProducts]);

  // Recalculate Cart on changes
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

  // Global Keyboard Shortcuts (F2, F4, F6, F8, ESC) & Barcode Reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Barcode Scanner detection: Scanners type characters in rapid succession (< 40ms between keys) ending in Enter
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

      // Keyboard shortcuts
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart]);

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

  // Add Product to Cart
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
        unit_price: Number(product.selling_price) || 0,
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

  const updateCartItemDiscount = (index: number, val: number) => {
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], discount: Math.max(0, val) };
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
  };

  // Hold Cart
  const handleHoldCart = async () => {
    if (cart.length === 0) return;
    const refName = prompt("Enter reference note for held cart:", `Held-${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if (refName === null) return;

    try {
      const res = await posApi.holdCart({
        hold_reference: refName || undefined,
        customer_name: selectedCustomer?.full_name || (isWalkIn ? "Walk-in Customer" : ""),
        customer_phone: selectedCustomer?.phone || "",
        cart_data: { cart, isInterstate, overallDiscountType, overallDiscountValue, selectedCustomer, isWalkIn },
        subtotal: Number(calcSummary?.subtotal) || 0,
        item_count: cart.reduce((acc, c) => acc + c.quantity, 0),
        notes: "Held from POS terminal",
      });
      setHeldCarts((prev) => [res.data, ...prev]);
      clearCart();
    } catch (err) {
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
    // Delete from held list
    posApi.deleteHeldCart(held.id).then(() => {
      setHeldCarts((prev) => prev.filter((h) => h.id !== held.id));
    });
    setHeldModalOpen(false);
  };

  // Customer Search & Creation
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
    } catch (err) {
      alert("Failed to create customer. Phone or email might already exist.");
    }
  };

  // Quick Add Product
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
    } catch (err) {
      alert("Failed to add product. Check required fields.");
    }
  };

  // Payment Calculation & Flow
  const grandTotalNum = Number(calcSummary?.grand_total) || 0;

  const openPaymentModal = () => {
    if (cart.length === 0) return;
    setCheckoutError("");
    setPayments([{ method: "CASH", amount: grandTotalNum }]);
    setPayingCashAmount(grandTotalNum);
    setPaymentModalOpen(true);
  };

  const totalPaidSoFar = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const remainingDue = Math.max(0, grandTotalNum - totalPaidSoFar);

  const addPaymentMethod = (method: string) => {
    if (remainingDue <= 0) return;
    setPayments((prev) => [...prev, { method, amount: remainingDue }]);
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

  // Checkout Execution
  const handleCheckout = async () => {
    if (payments.length === 0) {
      setCheckoutError("Please specify at least one payment method.");
      return;
    }

    if (totalPaidSoFar < grandTotalNum) {
      const hasCredit = payments.some((p) => p.method === "CREDIT");
      if (!hasCredit) {
        setCheckoutError(`Tendered amount (₹${totalPaidSoFar.toFixed(2)}) is less than total (₹${grandTotalNum.toFixed(2)}). Add Credit or adjust payment.`);
        return;
      }
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const payload: any = {
        store_id: selectedStoreId || undefined,
        items: cart,
        overall_discount_type: overallDiscountType,
        overall_discount_value: Number(overallDiscountValue) || 0,
        is_interstate: isInterstate,
        is_walk_in: isWalkIn,
        customer: !isWalkIn && selectedCustomer ? {
          id: selectedCustomer.id,
          name: selectedCustomer.full_name,
          phone: selectedCustomer.phone,
          email: selectedCustomer.email,
        } : undefined,
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
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Checkout failed. Please check stock or payments.";
      setCheckoutError(errorMsg);
    } finally {
      setCheckoutLoading(false);
    }
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
  const upiId = config?.gstin ? `${config.trade_name || 'shop'}@upi` : "billfree.business@okhdfcbank";
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(config?.trade_name || "BillFree Store")}&am=${remainingDue > 0 ? remainingDue.toFixed(2) : grandTotalNum.toFixed(2)}&cu=INR&tn=Invoice%20Bill`;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      {/* Top POS Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight">Universal POS</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">
                  {currentVerticalMeta.label || currentVerticalMeta.name}
                </span>
                {config?.gstin && <span>GSTIN: {config.gstin}</span>}
              </div>
            </div>
          </div>

          {/* Store Selector */}
          {stores.length > 1 && (
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
        </div>

        {/* Register Status & Actions */}
        <div className="flex items-center gap-2">
          {register?.status === "open" ? (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Register Open: ₹{parseFloat(register.expected_cash || register.opening_balance).toLocaleString()}
            </div>
          ) : (
            <a
              href="/dashboard/register"
              className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/20"
            >
              <ShieldAlert className="h-3 w-3" />
              Register Closed (Click to Open)
            </a>
          )}

          {/* Held Carts Badge */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHeldModalOpen(true)}
            className="relative h-8 gap-1.5 text-xs font-medium"
          >
            <Pause className="h-3 w-3" />
            Held Bills
            {heldCarts.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {heldCarts.length}
              </span>
            )}
          </Button>

          {/* Keyboard Shortcut Hints */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F2</span> Search
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F4</span> Customer
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F6</span> Hold
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">F8</span> Pay
          </div>
        </div>
      </div>

      {/* Main Work Area: Left Catalog & Right Cart */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
        {/* Left Side: Product Search, Category Pills, Grid */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm lg:col-span-7 xl:col-span-8 overflow-hidden">
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
              New Product
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
                  const isLowStock = p.track_inventory && stockNum > 0 && stockNum <= (Number(p.min_stock) || 5);

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isOutOfStock && addToCart(p)}
                      className={`group relative flex flex-col justify-between rounded-md border p-2.5 transition-all cursor-pointer hover:border-primary hover:shadow-md ${
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

                        {/* Business-specific attributes badges */}
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
                            ₹{Number(p.selling_price).toFixed(2)}
                          </div>
                          {p.mrp && Number(p.mrp) > Number(p.selling_price) && (
                            <div className="text-[10px] text-muted-foreground line-through">
                              ₹{Number(p.mrp).toFixed(2)}
                            </div>
                          )}
                        </div>

                        {/* Stock badge */}
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
        <div className="flex flex-col rounded-lg border bg-card p-3 shadow-sm lg:col-span-5 xl:col-span-4 overflow-hidden">
          {/* Customer Selection Header */}
          <div className="flex items-center justify-between border-b pb-2.5">
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
          <div className="flex-1 overflow-y-auto py-2">
            {cart.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Receipt className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs font-medium">Cart is empty</p>
                <p className="text-[11px]">Scan a barcode or click products on the left to add items.</p>
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateCartItemQuantity(idx, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded border bg-muted hover:bg-muted/80"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateCartItemQuantity(idx, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded border bg-muted hover:bg-muted/80"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line Total & Remove */}
                      <div className="text-right">
                        <p className="font-bold text-foreground">₹{lineTotal.toFixed(2)}</p>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="text-[11px] text-destructive hover:underline"
                        >
                          <Trash2 className="h-3.5 w-3.5 inline" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart Calculation & Summary */}
          <div className="border-t pt-2.5 space-y-1.5 text-xs">
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
                  onClick={() => setOverallDiscountType(overallDiscountType === "fixed" ? "percentage" : "fixed")}
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
                <span>₹{calcSummary ? Number(calcSummary.subtotal).toFixed(2) : "0.00"}</span>
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
                  <span>{Number(calcSummary.round_off) > 0 ? "+" : ""}₹{Number(calcSummary.round_off).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-sm font-black text-foreground">
                <span>Grand Total:</span>
                <span className="text-primary text-base">
                  ₹{calcSummary ? Number(calcSummary.grand_total).toFixed(2) : "0.00"}
                </span>
              </div>
            </div>

            {/* Bottom Cart Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
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
                disabled={cart.length === 0 || calcLoading}
                className="text-xs h-9 font-bold bg-primary text-primary-foreground gap-1 hover:bg-primary/90"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Pay (F8)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: Payment Checkout Modal (Multi-split, UPI QR, Udhaar) */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-lg">
              <span>Checkout & Payment</span>
              <span className="text-xl font-black text-primary">₹{grandTotalNum.toFixed(2)}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-2">
            {/* Left: Payment Method Selector */}
            <div className="md:col-span-7 space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "CASH", label: "Cash", icon: Banknote },
                  { id: "UPI", label: "UPI QR", icon: QrCode },
                  { id: "CARD", label: "Card", icon: CreditCard },
                  { id: "CREDIT", label: "Udhaar / Credit", icon: Receipt },
                ].map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPaymentMethod(m.id)}
                    className="gap-1 text-xs"
                  >
                    <m.icon className="h-3.5 w-3.5" />
                    + {m.label}
                  </Button>
                ))}
              </div>

              {/* Payment Split Lines */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded border p-2 bg-muted/20 text-xs">
                    <span className="w-20 font-bold uppercase">{p.method}</span>
                    <Input
                      type="number"
                      min="0"
                      value={p.amount}
                      onChange={(e) => updatePaymentAmount(idx, parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs font-semibold"
                    />
                    <Input
                      placeholder="Ref / Note (Optional)"
                      value={p.reference || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPayments((prev) => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], reference: val };
                          return updated;
                        });
                      }}
                      className="h-8 text-xs"
                    />
                    <button
                      onClick={() => removePaymentLine(idx)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Udhaar / Customer Notice */}
              {payments.some((p) => p.method === "CREDIT") && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
                  <p className="font-semibold">Udhaar / Customer Credit Sale:</p>
                  {isWalkIn ? (
                    <p className="text-destructive font-medium mt-1">
                      ⚠️ Walk-in customers cannot take Credit sales. Please select or register a customer first (F4).
                    </p>
                  ) : (
                    <p className="mt-0.5">
                      Account: {selectedCustomer?.full_name} | Outstanding: ₹{selectedCustomer?.outstanding_credit || 0}
                    </p>
                  )}
                </div>
              )}

              {/* Checkout Error */}
              {checkoutError && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}
            </div>

            {/* Right: UPI QR Code & Balance Details */}
            <div className="md:col-span-5 flex flex-col items-center justify-between rounded-lg border bg-muted/30 p-3 text-center">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Scan to Pay (UPI)
                </p>
                <div className="mt-2 flex justify-center bg-white p-2 rounded-lg border shadow-sm">
                  {/* Standard QR Code Generator Image */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiUrl)}`}
                    alt="UPI Payment QR"
                    className="h-32 w-32"
                  />
                </div>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground">{upiId}</p>
              </div>

              <div className="w-full border-t pt-2 mt-2 space-y-1 text-xs">
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
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCheckout}
              disabled={checkoutLoading || (payments.some((p) => p.method === "CREDIT") && isWalkIn)}
              className="font-bold bg-primary text-primary-foreground"
            >
              {checkoutLoading ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Post-Sale Receipt & Print Dialog */}
      <Dialog open={!!completedSale} onOpenChange={() => setCompletedSale(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              Bill Generated Successfully!
            </DialogTitle>
          </DialogHeader>

          {completedSale && (
            <div className="space-y-4 py-2">
              {/* Receipt Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded bg-muted p-2">
                  <span className="text-muted-foreground block text-[10px]">Invoice</span>
                  <span className="font-bold text-sm font-mono">{completedSale.invoice_number}</span>
                </div>
                <div className="rounded bg-muted p-2">
                  <span className="text-muted-foreground block text-[10px]">Total Paid</span>
                  <span className="font-bold text-sm text-emerald-600">₹{completedSale.total}</span>
                </div>
                <div className="rounded bg-muted p-2">
                  <span className="text-muted-foreground block text-[10px]">Customer</span>
                  <span className="font-bold truncate block">{completedSale.customer?.name || "Walk-in"}</span>
                </div>
                <div className="rounded bg-muted p-2">
                  <span className="text-muted-foreground block text-[10px]">Status</span>
                  <span className="font-bold uppercase text-primary">{completedSale.payment_status}</span>
                </div>
              </div>

              {/* Printable Receipt Preview */}
              <div className="rounded border bg-white p-4 text-black font-mono text-xs shadow-inner max-h-56 overflow-y-auto print:border-none print:p-0 print:shadow-none">
                <div className="text-center border-b pb-2">
                  <p className="font-bold text-sm uppercase">{config?.trade_name || "BILLFREE STORE"}</p>
                  {config?.gstin && <p className="text-[10px]">GSTIN: {config.gstin}</p>}
                  <p className="text-[10px]">TAX INVOICE: {completedSale.invoice_number}</p>
                  <p className="text-[10px]">{new Date().toLocaleString()}</p>
                </div>
                <table className="w-full my-2 text-[11px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-1">Item</th>
                      <th className="text-right pb-1">Qty</th>
                      <th className="text-right pb-1">Price</th>
                      <th className="text-right pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedSale.items?.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="py-0.5 truncate max-w-[120px]">{item.product_name}</td>
                        <td className="text-right py-0.5">{item.quantity}</td>
                        <td className="text-right py-0.5">₹{item.unit_price}</td>
                        <td className="text-right py-0.5">₹{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t pt-1 space-y-0.5 text-right text-[11px]">
                  <p>Subtotal: ₹{completedSale.subtotal}</p>
                  {Number(completedSale.discount) > 0 && <p>Discount: -₹{completedSale.discount}</p>}
                  <p>Tax: ₹{completedSale.tax}</p>
                  <p className="font-bold text-sm">Grand Total: ₹{completedSale.total}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    Paid via {completedSale.payment_method}
                  </p>
                </div>
                <div className="text-center border-t mt-2 pt-1 text-[10px]">
                  <p>{config?.invoice_footer || "Thank you for shopping with us!"}</p>
                </div>
              </div>

              {/* Action Buttons: Print, WhatsApp, Copy Link */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                    className="gap-1.5 text-xs"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Receipt
                  </Button>

                  <Link
                    href="/dashboard/invoices"
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-accent px-3 py-1.5 text-xs font-semibold text-foreground"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>View Invoices</span>
                  </Link>

                  {completedSale.customer?.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const phone = completedSale.customer.phone.replace(/\D/g, "");
                        const msg = `Dear ${completedSale.customer.name}, thank you for your purchase of ₹${completedSale.total}. View your digital invoice here: ${window.location.origin}/invoices/${completedSale.invoice_number}`;
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                      }}
                      className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-800"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      WhatsApp Bill
                    </Button>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={() => setCompletedSale(null)}
                  className="bg-primary text-primary-foreground text-xs"
                >
                  Start New Sale (Enter)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Customer Selector & Quick Create */}
      <Dialog open={customerModalOpen} onOpenChange={setCustomerModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select or Add Customer</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
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

      {/* MODAL 4: Quick Add Product Dialog */}
      <Dialog open={quickAddModalOpen} onOpenChange={setQuickAddModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick Add Product</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleQuickAddProduct} className="space-y-3 py-2 text-xs">
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

            {/* Dynamic Business-Specific Custom Fields */}
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

      {/* MODAL 5: Held Carts Retrieval */}
      <Dialog open={heldModalOpen} onOpenChange={setHeldModalOpen}>
        <DialogContent className="max-w-md">
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
