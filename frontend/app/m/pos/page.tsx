"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { posApi, quotationApi, customerApi } from "@/services/api";
import type { Product, Quotation, Customer } from "@/types";
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
} from "lucide-react";

interface CartItem {
  id: string; // product id or custom
  product?: any;
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
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
  const [cart, setCart] = useState<CartItem[]>([]);
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
  const [primaryMethod, setPrimaryMethod] = useState<"cash" | "upi" | "card" | "credit">("cash");
  const [isSplit, setIsSplit] = useState(false);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([]);
  const [electronicRef, setElectronicRef] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedSale, setConfirmedSale] = useState<{
    transaction_id: string;
    invoice_number: string;
    total: number;
    amount_paid: number;
    change_amount: number;
    payment_method: string;
    web_url?: string;
  } | null>(null);

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

      // Extract unique categories
      const cats = Array.from(new Set(list.map((p: Product) => p.category?.name).filter(Boolean))) as string[];
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

  // Cart calculations
  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let itemCount = 0;

    cart.forEach((item) => {
      const lineSub = item.unit_price * item.quantity;
      const lineTax = (lineSub * (item.tax_rate || 0)) / 100;
      subtotal += lineSub;
      totalTax += lineTax;
      itemCount += item.quantity;
    });

    const exactTotal = subtotal + totalTax;
    const grandTotal = Math.round(exactTotal);
    const roundOff = Number((grandTotal - exactTotal).toFixed(2));

    return {
      subtotal,
      totalTax,
      roundOff,
      grandTotal,
      itemCount,
    };
  }, [cart]);

  // Synchronize payment amounts when grand total changes
  useEffect(() => {
    if (cartSummary.grandTotal > 0 && !isSplit) {
      setCashTendered(cartSummary.grandTotal);
      setSplitPayments([
        {
          payment_method: primaryMethod,
          amount: cartSummary.grandTotal,
          reference: electronicRef,
        },
      ]);
    }
  }, [cartSummary.grandTotal, primaryMethod, isSplit, electronicRef]);

  // Add product to cart
  const addToCart = (product: Product) => {
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
          unit_price: Number(product.selling_price || product.unit_price || 0),
          tax_rate: Number(product.tax_rate || 0),
          discount: 0,
        },
      ];
    });
  };

  // Update item quantity
  const updateQuantity = (id: string, delta: number) => {
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

  // Remove item
  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  // Clear cart
  const clearCart = () => {
    if (confirm("Clear all items in cart?")) {
      setCart([]);
      setQuotationRef(null);
      setActiveTab("catalog");
    }
  };

  // Load quotation helper
  const loadQuotationIntoCart = (q: Quotation) => {
    if (!q || !q.items || q.items.length === 0) return;
    const loadedItems: CartItem[] = q.items.map((it: any) => ({
      id: typeof it.product === "object" && it.product?.id ? it.product.id : it.product || `custom-${it.id || Math.random()}`,
      product: it.product,
      name: it.name,
      quantity: Number(it.quantity || 1),
      unit_price: Number(it.unit_price || 0),
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

  // Fast cash tender buttons
  const cashChange = useMemo(() => {
    if (primaryMethod !== "cash" && !isSplit) return 0;
    return cashTendered > cartSummary.grandTotal ? cashTendered - cartSummary.grandTotal : 0;
  }, [cashTendered, cartSummary.grandTotal, primaryMethod, isSplit]);

  // Set primary payment method
  const handleSelectPrimaryMethod = (method: "cash" | "upi" | "card" | "credit") => {
    setPrimaryMethod(method);
    setIsSplit(false);
    if (method === "cash") {
      setCashTendered(cartSummary.grandTotal);
    }
    setSplitPayments([
      {
        payment_method: method,
        amount: cartSummary.grandTotal,
        reference: electronicRef,
      },
    ]);
  };

  // Submit Complete Sale
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      alert("Cart cannot be empty.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idempotencyKey = `M-POS-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Prepare items payload
      const itemsPayload = cart.map((it) => ({
        product_id: it.product?.id || (it.id.startsWith("custom-") ? undefined : it.id),
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount: it.discount,
      }));

      // Prepare payments payload
      let paymentsPayload: SplitPaymentRow[] = [];
      if (isSplit) {
        paymentsPayload = splitPayments.filter((p) => p.amount > 0);
      } else if (primaryMethod === "cash") {
        paymentsPayload = [{ payment_method: "cash", amount: cashTendered }];
      } else {
        paymentsPayload = [
          {
            payment_method: primaryMethod,
            amount: cartSummary.grandTotal,
            reference: electronicRef,
          },
        ];
      }

      const checkoutPayload = {
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
        idempotency_key: idempotencyKey,
      };

      const res = await posApi.checkout(checkoutPayload);
      const data = res.data;

      setConfirmedSale({
        transaction_id: data.transaction_id || data.id,
        invoice_number: data.invoice_number,
        total: Number(data.total || cartSummary.grandTotal),
        amount_paid: Number(data.amount_paid || cartSummary.grandTotal),
        change_amount: Number(data.change_amount || 0),
        payment_method: data.payment_method || primaryMethod,
        web_url: data.invoice?.web_url,
      });

      // Clear cart on confirmed success
      setCart([]);
      setQuotationRef(null);
      setActiveTab("success");
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      const msg = errObj.response?.data?.error || "Payment checkout failed. Please review cart and retry.";
      setErrorMessage(msg);
    } finally {
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
            <div className="space-y-2">
              {cart.map((item) => {
                const lineTotal = item.unit_price * item.quantity;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                      <p className="text-[10px] text-slate-400">
                        {formatCurrency(item.unit_price)} each • Tax: {item.tax_rate}%
                      </p>
                      <p className="text-xs font-extrabold text-blue-600 mt-0.5">
                        {formatCurrency(lineTotal)}
                      </p>
                    </div>

                    {/* Quantity Stepper (44px touch targets) */}
                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm active:bg-slate-200"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-extrabold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm active:bg-slate-200"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
                      className="ml-2 text-slate-400 hover:text-rose-600 p-1"
                      title="Remove Item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* Order Calculation Summary Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 text-xs shadow-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartSummary.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>GST / Taxes</span>
                  <span>{formatCurrency(cartSummary.totalTax)}</span>
                </div>
                {cartSummary.roundOff !== 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Round-off</span>
                    <span>{formatCurrency(cartSummary.roundOff)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-extrabold text-base text-slate-900">
                  <span>Grand Total</span>
                  <span>{formatCurrency(cartSummary.grandTotal)}</span>
                </div>
              </div>

              {/* Proceed to Payment Action Button */}
              <button
                onClick={() => setActiveTab("payment")}
                className="w-full rounded-xl bg-blue-600 py-3 text-center text-xs font-extrabold text-white shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                <span>Proceed to Payment ({formatCurrency(cartSummary.grandTotal)})</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SCREEN C: MOBILE GUIDED PAYMENT WORKFLOW */}
      {/* ============================================================== */}
      {activeTab === "payment" && (
        <div className="space-y-3.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b pb-2">
            <button
              onClick={() => setActiveTab("cart")}
              className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Cart</span>
            </button>
            <span className="text-xs font-extrabold text-slate-900">
              Total Due: {formatCurrency(cartSummary.grandTotal)}
            </span>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Payment Method Selector Grid */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Select Primary Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Cash */}
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

              {/* UPI */}
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
                  <span className="text-xs font-bold block">UPI QR</span>
                  <span className="text-[10px] text-slate-400">GPay, PhonePe</span>
                </div>
              </button>

              {/* Card */}
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

              {/* Udhaar / Customer Credit */}
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
                  <span className="text-xs font-bold block">Udhaar</span>
                  <span className="text-[10px] text-slate-400">Customer Credit</span>
                </div>
              </button>
            </div>
          </div>

          {/* Cash Tender & Change Due Section */}
          {primaryMethod === "cash" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Cash Tendered</span>
                <span className="text-xs font-extrabold text-blue-600">
                  {formatCurrency(cashTendered)}
                </span>
              </div>

              {/* Exact Amount & Quick Tender Pills */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCashTendered(cartSummary.grandTotal)}
                  className="rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 active:scale-95 transition-all"
                >
                  ⚡ Exact (₹{cartSummary.grandTotal})
                </button>
                {[100, 200, 500, 1000, 2000].map((denom) => (
                  <button
                    key={denom}
                    type="button"
                    onClick={() => setCashTendered(denom)}
                    className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 active:scale-95 transition-all"
                  >
                    ₹{denom}
                  </button>
                ))}
              </div>

              {/* Custom Tendered Input */}
              <div>
                <input
                  type="number"
                  value={cashTendered || ""}
                  onChange={(e) => setCashTendered(Number(e.target.value) || 0)}
                  placeholder="Enter amount given by customer..."
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Change Return Live Computation */}
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs font-bold text-emerald-800">
                <span>Change to Return:</span>
                <span className="text-sm font-extrabold">{formatCurrency(cashChange)}</span>
              </div>
            </div>
          )}

          {/* UPI Reference / Preview */}
          {primaryMethod === "upi" && !isSplit && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-xs shadow-sm text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                <QrCode className="h-16 w-16 text-slate-700" />
              </div>
              <p className="text-[11px] text-slate-500">Scan QR Code on store counter or enter UPI UTR</p>
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

          {/* Customer Credit / Udhaar Notice */}
          {primaryMethod === "credit" && !isSplit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5 text-xs text-amber-800">
              <span className="font-bold flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Customer Credit Policy
              </span>
              <p className="text-[11px]">
                Credit sales are authorized only for registered customers. Currently selected:{" "}
                <span className="font-bold">{customer.name}</span>
              </p>
              {customer.is_walk_in && (
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(true)}
                  className="rounded-lg bg-amber-600 text-white font-bold px-2.5 py-1 text-[10px] mt-1"
                >
                  Change to Registered Customer →
                </button>
              )}
            </div>
          )}

          {/* Complete Sale Final Action */}
          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={isSubmitting}
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
