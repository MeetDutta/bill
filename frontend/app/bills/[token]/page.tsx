"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Download, Printer, Sparkles, Store, Phone, Calendar, CreditCard, ShieldCheck } from "lucide-react";
import axios from "axios";

interface BillItem {
  id: string;
  name: string;
  quantity: string;
  unit_price: string;
  discount: string;
  tax: string;
  total: string;
  hsn_code?: string;
}

interface BillData {
  id: string;
  invoice_number: string;
  secure_token: string;
  is_viewed: boolean;
  organization_name: string;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
  transaction_details: {
    id: string;
    invoice_number: string;
    transaction_date: string;
    status: string;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    payment_method: string;
    loyalty_points_earned: number;
    items: BillItem[];
  };
}

export default function DigitalBillPage() {
  const params = useParams();
  const token = params?.token as string;

  const [bill, setBill] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchBill = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
        const res = await axios.get(`${apiUrl}/invoices/view/${token}/`);
        setBill(res.data);
      } catch (err: unknown) {
        setError("Unable to load digital bill. Please verify the link or try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium text-sm">Fetching verified digital bill...</p>
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Bill Not Found</h2>
          <p className="text-slate-500 text-sm mb-6">{error || "This digital invoice link is invalid or expired."}</p>
        </div>
      </div>
    );
  }

  const tx = bill.transaction_details;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Top Actions */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-emerald-600 font-medium text-xs bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 shadow-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Digital Tax Invoice</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium shadow-sm transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Digital Bill Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden relative">
          {/* Header Accent Bar */}
          <div className="h-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500" />

          {/* Store & Org Info */}
          <div className="p-6 sm:p-8 border-b border-dashed border-slate-200 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mb-3 font-black text-xl">
              ⚡
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {bill.organization_name || "Apex Retail Hub"}
            </h1>
            <p className="text-slate-500 text-sm mt-1 flex items-center justify-center gap-1 font-medium">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              {bill.store_name || "Store Branch"}
            </p>
            <div className="mt-3 inline-block px-3 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-mono font-medium">
              Tax Invoice #{tx?.invoice_number || bill.invoice_number}
            </div>
          </div>

          {/* Customer & Transaction Meta */}
          <div className="bg-slate-50/60 p-4 sm:p-6 grid grid-cols-2 gap-4 text-xs border-b border-slate-200">
            <div>
              <p className="text-slate-400 font-medium">BILLED TO</p>
              <p className="font-bold text-slate-800 text-sm mt-0.5">{bill.customer_name || "Valued Customer"}</p>
              <p className="text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                <Phone className="w-3 h-3 text-slate-400" />
                {bill.customer_phone || "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 font-medium">DATE & TIME</p>
              <p className="font-bold text-slate-800 text-sm mt-0.5">
                {tx?.transaction_date ? new Date(tx.transaction_date).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—"}
              </p>
              <p className="text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-400" />
                {tx?.transaction_date ? new Date(tx.transaction_date).toLocaleTimeString("en-IN", { timeStyle: "short" }) : ""}
              </p>
            </div>
          </div>

          {/* Loyalty Reward Banner */}
          {tx?.loyalty_points_earned > 0 && (
            <div className="m-4 sm:m-6 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-md shadow-amber-200 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Loyalty Rewards Added</p>
                <p className="text-sm text-amber-800">
                  You earned <span className="font-extrabold text-amber-950">+{tx.loyalty_points_earned} Points</span> on this purchase!
                </p>
              </div>
            </div>
          )}

          {/* Items Table */}
          <div className="p-4 sm:p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Item Breakdown</h3>
            <div className="space-y-3">
              {tx?.items?.map((item, idx) => (
                <div key={item.id || idx} className="flex items-start justify-between py-2 border-b border-slate-100 last:border-none">
                  <div className="pr-4">
                    <p className="font-semibold text-slate-800 text-sm">{item.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.quantity} × ₹{Number(item.unit_price).toLocaleString("en-IN")}
                      {Number(item.discount) > 0 && (
                        <span className="text-emerald-600 font-medium ml-2">
                          (-₹{Number(item.discount).toLocaleString("en-IN")})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 text-sm">
                      ₹{Number(item.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals & Calculations */}
          <div className="bg-slate-50 p-6 border-t border-slate-200 space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold">₹{Number(tx?.subtotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {Number(tx?.discount) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span className="font-semibold">-₹{Number(tx?.discount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Taxes (GST)</span>
              <span className="font-semibold">₹{Number(tx?.tax || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-2 border-t border-slate-300 flex justify-between items-baseline text-slate-900">
              <span className="text-sm font-extrabold uppercase tracking-wider">Grand Total</span>
              <span className="text-2xl font-black text-indigo-700">
                ₹{Number(tx?.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="pt-3 mt-2 border-t border-slate-200/80 flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1.5 font-medium">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Payment Mode
              </span>
              <span className="font-semibold text-slate-800 bg-white px-2.5 py-0.5 rounded border border-slate-200 shadow-2xs">
                {tx?.payment_method || "Paid"}
              </span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="p-6 text-center bg-white border-t border-slate-100">
            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Thank you for shopping with us!</span>
            </div>
            <p className="text-[11px] text-slate-400">
              For any queries, exchange, or returns within 14 days, please present this digital invoice.
            </p>
          </div>
        </div>

        {/* Bottom Environmental Tagline */}
        <p className="text-center text-xs text-slate-400 no-print">
          🌱 Powered by Digital Billing SaaS • Save Paper, Save Trees
        </p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
