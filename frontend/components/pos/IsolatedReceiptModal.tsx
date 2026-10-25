"use client";

import React, { useState } from "react";
import {
  Printer,
  FileText,
  Download,
  Share2,
  CheckCircle2,
  X,
  ExternalLink,
  Receipt,
  Layers,
} from "lucide-react";
import {
  printThermalReceipt,
  printA4TaxInvoice,
  streamInvoicePdf,
  downloadInvoicePdf,
  PrintReceiptData,
} from "@/lib/receiptPrinter";
import { formatCurrency } from "@/lib/utils";

interface IsolatedReceiptModalProps {
  saleData: any;
  config: any;
  basePath: string;
  onClose: () => void;
  onNewSale: () => void;
}

export function IsolatedReceiptModal({
  saleData,
  config,
  basePath,
  onClose,
  onNewSale,
}: IsolatedReceiptModalProps) {
  const [activeFormat, setActiveFormat] = useState<"thermal" | "a4">("thermal");

  if (!saleData) return null;

  // Normalize data for printing
  const invoiceId = saleData.invoice?.id || saleData.invoice_id || saleData.id;
  const invoiceNumber = saleData.invoice_number || saleData.invoice?.invoice_number || "INV-000";
  const customerName = saleData.customer?.name || saleData.customer?.full_name || "Walk-in Customer";
  const customerPhone = saleData.customer?.phone || "";
  const total = Number(saleData.total || 0);
  const subtotal = Number(saleData.subtotal || 0);
  const discount = Number(saleData.discount || 0);
  const tax = Number(saleData.tax || 0);
  const roundOff = Number(saleData.round_off || 0);
  const amountPaid = Number(saleData.amount_paid ?? total);
  const tenderedAmount = Number(saleData.tendered_amount || 0);
  const changeAmount = Number(saleData.change_amount || 0);
  const paymentStatus = (saleData.payment_status || "paid").toUpperCase();
  const paymentMethod = (saleData.payment_method || "cash").toUpperCase();

  const printPayload: PrintReceiptData = {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    transaction_date: saleData.transaction_date,
    created_at: saleData.created_at,
    seller: {
      name: saleData.seller?.name || config?.legal_name || "BillMeet Store",
      legal_name: saleData.seller?.legal_name || config?.legal_name || "",
      trade_name: saleData.seller?.trade_name || config?.trade_name || config?.name || "BILLMEET RETAIL",
      gstin: saleData.seller?.gstin || config?.gstin || "",
      address: saleData.seller?.address || config?.address || "",
      city: saleData.seller?.city || "",
      state: saleData.seller?.state || "",
      phone: saleData.seller?.phone || config?.phone || "",
      email: saleData.seller?.email || config?.email || "",
      invoice_footer: saleData.seller?.invoice_footer || config?.invoice_footer,
      invoice_terms: saleData.seller?.invoice_terms || config?.invoice_terms_and_conditions,
    },
    customer: saleData.customer ? {
      name: customerName,
      full_name: customerName,
      phone: customerPhone,
      gstin: saleData.customer?.gstin || "",
      address: saleData.customer?.address || "",
      is_walk_in: saleData.customer?.is_walk_in ?? (!saleData.customer?.phone),
    } : null,
    cashier_name: saleData.cashier || "Staff",
    store_name: saleData.store?.name || "Main Counter",
    items: (saleData.items || []).map((it: any) => ({
      name: it.product_name || it.name || it.description || "Product Item",
      product_name: it.product_name || it.name || it.description || "Product Item",
      description: it.description || it.name || "",
      sku: it.sku || "",
      hsn_code: it.hsn_code || "",
      quantity: Number(it.quantity || 1),
      unit: it.unit || "pcs",
      unit_price: Number(it.unit_price || 0),
      discount: Number(it.discount || 0),
      tax_rate: Number(it.tax_rate || 0),
      taxable_amount: Number(it.taxable_amount || (Number(it.unit_price || 0) * Number(it.quantity || 1) - Number(it.discount || 0))),
      cgst_amount: Number(it.cgst_amount || 0),
      sgst_amount: Number(it.sgst_amount || 0),
      igst_amount: Number(it.igst_amount || 0),
      tax: Number(it.tax || 0),
      total: Number(it.total || 0),
    })),
    subtotal,
    discount,
    tax,
    round_off: roundOff,
    total,
    tendered_amount: tenderedAmount,
    change_amount: changeAmount,
    amount_paid: amountPaid,
    outstanding_amount: Number(saleData.outstanding_amount || 0),
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    payments: saleData.payments || [],
    tax_breakup: saleData.tax_breakup,
  };

  const handlePrint = () => {
    if (activeFormat === "thermal") {
      printThermalReceipt(printPayload);
    } else {
      printA4TaxInvoice(printPayload);
    }
  };

  const handleOpenPdf = () => {
    if (invoiceId) {
      streamInvoicePdf(invoiceId, activeFormat);
    }
  };

  const handleDownloadPdf = () => {
    if (invoiceId) {
      downloadInvoicePdf(invoiceId, invoiceNumber, activeFormat);
    }
  };

  const handleWhatsApp = () => {
    if (!customerPhone) return;
    const cleanPhone = customerPhone.replace(/\D/g, "");
    const viewUrl = saleData.invoice?.web_url
      ? `${window.location.origin}${saleData.invoice.web_url}`
      : `${window.location.origin}/bills/${saleData.invoice?.secure_token || invoiceNumber}`;
    const msg = `Dear ${customerName}, thank you for your purchase of ₹${total.toFixed(2)} at ${printPayload.seller?.trade_name}. View your digital invoice here: ${viewUrl}`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto no-print">
      <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-4 sm:p-6 shadow-2xl text-foreground space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Sale Completed</h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground">
                  #{invoiceNumber}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receipt registered. Choose print format or digital delivery below.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Format Selector Pills */}
        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/60 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveFormat("thermal")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeFormat === "thermal"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Thermal POS (80mm)</span>
            </button>
            <button
              onClick={() => setActiveFormat("a4")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeFormat === "a4"
                  ? "bg-background text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>A4 GST Tax Invoice</span>
            </button>
          </div>

          <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
            Status: <strong className="text-emerald-600">{paymentStatus}</strong>
          </span>
        </div>

        {/* Receipt Content Preview Box */}
        <div className="rounded-xl border bg-white text-slate-900 p-4 max-h-72 overflow-y-auto shadow-inner text-xs font-mono">
          {activeFormat === "thermal" ? (
            /* Thermal 80mm Preview */
            <div className="max-w-[320px] mx-auto space-y-2 text-[11px] leading-tight">
              <div className="text-center border-b pb-2">
                <div className="font-extrabold text-sm uppercase">{printPayload.seller?.trade_name}</div>
                {printPayload.seller?.address && <div className="text-[10px]">{printPayload.seller.address}</div>}
                {printPayload.seller?.gstin && <div className="text-[10px] font-bold">GSTIN: {printPayload.seller.gstin}</div>}
                <div className="text-[10px] mt-1 text-slate-600">TAX INVOICE #{invoiceNumber}</div>
              </div>

              <div className="flex justify-between text-[10px] text-slate-600">
                <span>Cust: {customerName}</span>
                <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              <div className="border-t border-b py-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-[10px] font-bold">
                      <th className="pb-1">Item</th>
                      <th className="text-center pb-1">Qty</th>
                      <th className="text-right pb-1">Rate</th>
                      <th className="text-right pb-1">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printPayload.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-1">
                          <div className="font-bold">{it.name}</div>
                          {it.sku && <div className="text-[9px] text-slate-500">SKU: {it.sku}</div>}
                        </td>
                        <td className="text-center py-1">{it.quantity}</td>
                        <td className="text-right py-1">₹{Number(it.unit_price).toFixed(2)}</td>
                        <td className="text-right py-1 font-bold">₹{Number(it.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-0.5 text-right text-[11px] pt-1">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Tax (GST):</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
                {roundOff !== 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Round-off:</span>
                    <span>{roundOff > 0 ? "+" : ""}{formatCurrency(roundOff)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-xs pt-1 border-t text-slate-900">
                  <span>GRAND TOTAL:</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                  <span>Paid ({paymentMethod}):</span>
                  <span>{formatCurrency(amountPaid)}</span>
                </div>
                {changeAmount > 0 && (
                  <div className="flex justify-between text-[10px] font-bold text-emerald-700">
                    <span>Change Returned:</span>
                    <span>{formatCurrency(changeAmount)}</span>
                  </div>
                )}
              </div>

              <div className="text-center text-[9px] text-slate-500 pt-2 border-t mt-2">
                {printPayload.seller?.invoice_footer}
              </div>
            </div>
          ) : (
            /* A4 GST Invoice Preview */
            <div className="space-y-3 font-sans text-xs">
              <div className="flex justify-between items-start border-b pb-2">
                <div>
                  <h4 className="font-extrabold text-sm uppercase text-slate-900">{printPayload.seller?.legal_name}</h4>
                  <p className="text-[11px] text-slate-600">{printPayload.seller?.address}</p>
                  <p className="text-[11px] font-bold">GSTIN: {printPayload.seller?.gstin || "Unregistered"}</p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px]">
                    TAX INVOICE
                  </span>
                  <p className="font-mono font-bold mt-1">#{invoiceNumber}</p>
                  <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString("en-IN")}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2 rounded bg-slate-50 border text-[11px]">
                <div>
                  <span className="text-slate-500 font-bold block text-[10px]">BILLED TO:</span>
                  <div className="font-bold">{customerName}</div>
                  <div className="text-slate-600">{customerPhone}</div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-bold block text-[10px]">PAYMENT:</span>
                  <div className="font-bold text-emerald-700">{paymentStatus}</div>
                  <div className="text-slate-600">{paymentMethod}</div>
                </div>
              </div>

              <table className="w-full text-left text-xs border">
                <thead className="bg-slate-100 font-bold text-[10px] uppercase border-b">
                  <tr>
                    <th className="p-1.5">Description</th>
                    <th className="p-1.5 text-center">HSN</th>
                    <th className="p-1.5 text-center">Qty</th>
                    <th className="p-1.5 text-right">Rate</th>
                    <th className="p-1.5 text-right">Taxable</th>
                    <th className="p-1.5 text-center">GST</th>
                    <th className="p-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  {printPayload.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-1.5 font-sans font-medium">{it.name}</td>
                      <td className="p-1.5 text-center">{it.hsn_code || "-"}</td>
                      <td className="p-1.5 text-center">{it.quantity} {it.unit}</td>
                      <td className="p-1.5 text-right">₹{Number(it.unit_price).toFixed(2)}</td>
                      <td className="p-1.5 text-right">₹{Number(it.taxable_amount).toFixed(2)}</td>
                      <td className="p-1.5 text-center">{it.tax_rate}%</td>
                      <td className="p-1.5 text-right font-bold">₹{Number(it.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-1">
                <div className="w-48 space-y-1 text-right text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span>Taxable:</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total GST:</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t pt-1 font-sans">
                    <span>Grand Total:</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Primary Print Button */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-foreground text-background font-bold text-xs hover:bg-foreground/90 transition-all shadow-sm active:scale-95"
            >
              <Printer className="h-4 w-4" />
              <span>Print {activeFormat === "thermal" ? "Thermal (80mm)" : "A4 Invoice"}</span>
            </button>

            {/* Native PDF View */}
            {invoiceId && (
              <button
                onClick={handleOpenPdf}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border font-semibold text-xs hover:bg-accent text-foreground transition-colors"
                title="Open genuine ReportLab PDF in browser"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View PDF</span>
              </button>
            )}

            {/* Native PDF Download */}
            {invoiceId && (
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border font-semibold text-xs hover:bg-accent text-foreground transition-colors"
                title="Download genuine ReportLab PDF file"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            {/* WhatsApp Bill */}
            {customerPhone && (
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold text-xs hover:bg-emerald-500/20 transition-colors"
                title="Send digital bill link via WhatsApp"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </button>
            )}
          </div>

          {/* New Sale Button */}
          <button
            onClick={onNewSale}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-xs active:scale-95 ml-auto"
          >
            <span>Start New Sale (Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
