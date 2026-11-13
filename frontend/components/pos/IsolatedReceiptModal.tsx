"use client";

import React, { useState, useEffect } from "react";
import {
  Printer,
  FileText,
  Download,
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
  resolvePlaceOfSupply,
  PrintReceiptData,
} from "@/lib/receiptPrinter";
import { indianNumberToWords } from "@/lib/numberToWords";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { resolveWhatsAppPresentation, WhatsAppUiStatus } from "@/lib/whatsappStatus";
import { invoiceApi } from "@/services/api";

interface IsolatedReceiptModalProps {
  saleData: any;
  config: any;
  basePath: string;
  onClose: () => void;
  onNewSale: () => void;
  onWhatsAppUpdated?: (invoiceId: string, delivery: any, billSent?: boolean) => void;
}

export function IsolatedReceiptModal({
  saleData,
  config,
  basePath,
  onClose,
  onNewSale,
  onWhatsAppUpdated,
}: IsolatedReceiptModalProps) {
  const [activeFormat, setActiveFormat] = useState<"thermal" | "a4">("thermal");
  const [waState, setWaState] = useState<{
    status: WhatsAppUiStatus;
    message: string;
  }>({ status: "idle", message: "" });
  const [customWaPhone, setCustomWaPhone] = useState("");
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  const invoiceId = saleData ? saleData.invoice?.id || saleData.invoice_id || saleData.id : undefined;

  useEffect(() => {
    if (!saleData) {
      setWaState({ status: "idle", message: "" });
      setCustomWaPhone("");
      setShowPhonePrompt(false);
      return;
    }
    const presentation = resolveWhatsAppPresentation(saleData.whatsapp_delivery, saleData.bill_sent);
    setWaState({ status: presentation.status, message: presentation.message });
    setCustomWaPhone("");
    setShowPhonePrompt(false);
  }, [saleData]);

  // Live non-blocking background status polling while WhatsApp auto-delivery is queued/processing
  useEffect(() => {
    if (!invoiceId || waState.status !== "queued") return;
    let cancelled = false;
    let attempts = 0;

    const pollStatus = async () => {
      attempts += 1;
      try {
        const res = await invoiceApi.getWhatsAppStatus(invoiceId);
        if (cancelled) return;
        const delivery = res.data?.whatsapp_delivery;
        const billSent = Boolean(res.data?.bill_sent);
        if (delivery || billSent) {
          const next = resolveWhatsAppPresentation(delivery, billSent);
          if (next.status !== "queued" && next.status !== "idle") {
            setWaState({ status: next.status, message: next.message });
            onWhatsAppUpdated?.(invoiceId, delivery, billSent);
            return;
          }
        }
      } catch {
        // Ignore transient poll failure; retry until max attempts
      }
      if (!cancelled && attempts < 20) {
        timer = window.setTimeout(pollStatus, 1500);
      }
    };

    let timer = window.setTimeout(pollStatus, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoiceId, waState.status, onWhatsAppUpdated]);

  if (!saleData) return null;

  // Normalize data for printing
  const custData = saleData.customer || saleData.customer_snapshot || null;
  const invoiceNumber = saleData.invoice_number || saleData.invoice?.invoice_number || "INV-000";
  const customerName = custData?.name || custData?.full_name || "Walk-in Customer";
  const customerPhone = custData?.phone || custData?.mobile || "";
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

  const isGst = Boolean(
    (saleData.seller?.gstin || config?.gstin) &&
    (saleData.invoice?.invoice_type || saleData.invoice_type) !== "non_gst"
  );
  const sellerState = saleData.seller?.state || config?.state || "Maharashtra";
  const customerState = custData?.state || "";
  const placeOfSupply = resolvePlaceOfSupply(customerState || sellerState, custData?.gstin || config?.gstin);

  const printPayload: PrintReceiptData = {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    invoice_type: isGst ? "gst" : "non_gst",
    transaction_date: saleData.transaction_date,
    created_at: saleData.created_at,
    due_date: saleData.due_date,
    payment_terms: saleData.payment_terms || "Due on Receipt",
    place_of_supply: placeOfSupply,
    reverse_charge: "No",
    custom_notes: saleData.custom_notes || saleData.invoice?.custom_notes || "Looking forward for your business.",
    terms_and_conditions: saleData.terms_and_conditions || saleData.invoice?.terms_and_conditions || config?.invoice_terms_and_conditions || "Payment : 100% Advance",
    seller: {
      name: saleData.seller?.name || config?.legal_name || "BillMeet Store",
      legal_name: saleData.seller?.legal_name || config?.legal_name || config?.trade_name || config?.name || "BillMeet Technologies Private Limited",
      trade_name: saleData.seller?.trade_name || config?.trade_name || config?.name || "BILLMEET RETAIL",
      gstin: saleData.seller?.gstin || config?.gstin || "",
      address: saleData.seller?.address || config?.address_line1 || config?.address || "",
      city: saleData.seller?.city || config?.city || "",
      state: sellerState,
      pincode: saleData.seller?.pincode || config?.pincode || config?.postal_code || "",
      phone: saleData.seller?.phone || config?.phone || "",
      alternate_phone: saleData.seller?.alternate_phone || config?.alternate_phone || "",
      email: saleData.seller?.email || config?.email || "",
      website: saleData.seller?.website || config?.website || "",
      tagline: saleData.seller?.tagline || config?.tagline || "",
      logo_url: saleData.seller?.logo_url || config?.logo_url || config?.logo || "",
      logo_position: saleData.seller?.logo_position || config?.logo_position || "left",
      gst_invoice_title: saleData.seller?.gst_invoice_title || config?.gst_invoice_title || "TAX INVOICE",
      regular_invoice_title: saleData.seller?.regular_invoice_title || config?.regular_invoice_title || "INVOICE",
      invoice_footer: saleData.seller?.default_invoice_notes || saleData.seller?.invoice_footer || config?.default_invoice_notes || config?.invoice_footer,
      invoice_terms: saleData.seller?.terms_and_conditions || saleData.seller?.invoice_terms || config?.invoice_terms_and_conditions,
      bank_name: saleData.seller?.bank_name || config?.bank_name,
      bank_account_name: saleData.seller?.bank_account_name || config?.bank_account_name,
      bank_account_number: saleData.seller?.bank_account_number || config?.bank_account_number,
      bank_ifsc_code: saleData.seller?.bank_ifsc_code || config?.bank_ifsc_code,
      bank_branch: saleData.seller?.bank_branch || config?.bank_branch,
      bank_upi_id: saleData.seller?.bank_upi_id || config?.bank_upi_id,
      authorized_signatory_name: saleData.seller?.authorized_signatory_name || config?.authorized_signatory_name,
      signature_url: saleData.seller?.signature_url || config?.signature_url || config?.signature_image || undefined,
      invoice_elements: saleData.seller?.invoice_elements || config?.invoice_elements || {},
    },
    customer: custData ? {
      name: customerName,
      full_name: customerName,
      phone: customerPhone,
      gstin: custData?.gstin || "",
      address: custData?.address_line1 || custData?.address || "",
      city: custData?.city || "",
      state: custData?.state || "",
      pincode: custData?.postal_code || custData?.pincode || "",
      is_walk_in: custData?.is_walk_in ?? (!custData?.phone),
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

  const handleOpenPdf = async () => {
    if (!invoiceId) return;
    try {
      await streamInvoicePdf(invoiceId, activeFormat);
    } catch (err) {
      console.error("Failed to preview invoice PDF:", err);
      alert(err instanceof Error ? err.message : "Failed to open invoice PDF.");
    }
  };

  const handleDownloadPdf = async () => {
    if (!invoiceId) return;
    try {
      await downloadInvoicePdf(invoiceId, invoiceNumber, activeFormat);
    } catch (err) {
      console.error("Failed to download invoice PDF:", err);
      alert(err instanceof Error ? err.message : "Failed to download invoice PDF.");
    }
  };

  const handleWhatsApp = async (overridePhone?: string) => {
    if (!invoiceId || waState.status === "sending" || waState.status === "queued") return;
    const phoneToUse = (overridePhone ?? customWaPhone).trim() || (!saleData.customer?.is_walk_in ? customerPhone : "");
    if (!phoneToUse || phoneToUse.toLowerCase().startsWith("walkin")) {
      setShowPhonePrompt(true);
      setWaState({
        status: "skipped",
        message: "Enter a customer WhatsApp phone number below to send the invoice PDF manually.",
      });
      return;
    }

    const previousStatus = waState.status;
    setWaState({ status: "sending", message: "Preparing & sending invoice PDF to WhatsApp..." });
    try {
      const shouldForce = previousStatus === "sent";
      const res = await invoiceApi.sendWhatsApp(invoiceId, {
        phone: (overridePhone ?? customWaPhone).trim() || undefined,
        format_type: activeFormat,
        force: shouldForce,
      });
      const data = res.data;
      if (data?.status === "sent" || data?.status === "already_sent") {
        setShowPhonePrompt(false);
        const delivery = data?.whatsapp_delivery || {
          status: "sent",
          filename: data?.filename,
          phone_number: data?.phone_number,
        };
        setWaState({
          status: "sent",
          message: `✓ Invoice sent to WhatsApp${data?.filename ? ` (${data.filename})` : ""}`,
        });
        onWhatsAppUpdated?.(invoiceId, delivery, true);
      } else if (data?.status === "queued" || data?.status === "processing") {
        setWaState({ status: "queued", message: "Sending invoice PDF via WhatsApp..." });
        onWhatsAppUpdated?.(invoiceId, data?.whatsapp_delivery || { status: data.status }, false);
      } else {
        setWaState({
          status: "failed",
          message: data?.error
            ? `⚠ Invoice created successfully, but WhatsApp delivery failed: ${data.error}`
            : "⚠ Invoice created successfully, but WhatsApp delivery failed.",
        });
      }
    } catch (err: unknown) {
      const msg = parseApiError(err, "WhatsApp delivery failed.");
      setWaState({
        status: "failed",
        message: `⚠ Invoice created successfully, but WhatsApp delivery failed: ${msg}`,
      });
    }
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
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/60 text-xs font-semibold">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
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
                {printPayload.payments && printPayload.payments.length > 0 ? (
                  <div className="pt-0.5 space-y-0.5 text-[10px] text-slate-600">
                    {printPayload.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{String(p.payment_method || "CASH").toUpperCase()}{p.reference ? ` (${p.reference})` : ""}:</span>
                        <span>{formatCurrency(Number(p.amount) || 0)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>Paid ({paymentMethod}):</span>
                    <span>{formatCurrency(amountPaid)}</span>
                  </div>
                )}
                {tenderedAmount > total && (
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Cash Tendered:</span>
                    <span>{formatCurrency(tenderedAmount)}</span>
                  </div>
                )}
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
            /* Professional A4 GST Invoice Preview (Matching Zoom Renewables Reference Standard) */
            <div className="border border-black bg-white text-black p-3.5 shadow-sm font-sans text-xs select-none">
              {/* Organization Heading Centered */}
              <div className="text-center mb-1">
                <div className="font-bold text-sm text-black tracking-tight">
                  {printPayload.seller?.legal_name || "BillMeet Store"}
                </div>
                {printPayload.seller?.invoice_elements?.show_tagline && printPayload.seller?.tagline && (
                  <div className="text-[9px] italic text-slate-700">{printPayload.seller.tagline}</div>
                )}
              </div>

              {/* Header: Logo & Address Left | TAX INVOICE Right */}
              <div className="flex justify-between items-center border-b border-black pb-2 px-1">
                {(printPayload.seller?.invoice_elements?.show_logo ?? true) && printPayload.seller?.logo_url && printPayload.seller?.logo_position === "right" ? (
                  <>
                    <div className="text-[9px] leading-tight text-black">
                      {(printPayload.seller?.invoice_elements?.show_address ?? true) && printPayload.seller?.address && (
                        <div>{printPayload.seller.address}</div>
                      )}
                      {(printPayload.seller?.invoice_elements?.show_address ?? true) && (
                        <div>
                          {[printPayload.seller?.city, printPayload.seller?.pincode ? `- ${printPayload.seller.pincode}` : "", printPayload.seller?.state]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                      )}
                      {(printPayload.seller?.invoice_elements?.show_gstin ?? true) && printPayload.seller?.gstin && (
                        <div className="font-semibold mt-0.5">
                          GSTIN: <span className="font-mono">{printPayload.seller.gstin}</span>
                        </div>
                      )}
                      {(printPayload.seller?.invoice_elements?.show_contact_details ?? true) && (
                        <div className="text-[8.5px] text-slate-700 mt-0.5">
                          {[
                            (printPayload.seller?.invoice_elements?.show_phone ?? true) && printPayload.seller?.phone ? `Phone: ${printPayload.seller.phone}` : "",
                            (printPayload.seller?.invoice_elements?.show_email ?? true) && printPayload.seller?.email ? `Email: ${printPayload.seller.email}` : "",
                            (printPayload.seller?.invoice_elements?.show_website ?? false) && printPayload.seller?.website ? `Web: ${printPayload.seller.website}` : "",
                          ].filter(Boolean).join(" | ")}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-extrabold tracking-wider text-black">
                        {isGst ? (printPayload.seller?.gst_invoice_title || "TAX INVOICE") : (printPayload.seller?.regular_invoice_title || "INVOICE")}
                      </div>
                      <img
                        src={printPayload.seller.logo_url}
                        alt="Logo"
                        className="max-h-10 max-w-[90px] object-contain"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5">
                      {(printPayload.seller?.invoice_elements?.show_logo ?? true) && printPayload.seller?.logo_url && (
                        <img
                          src={printPayload.seller.logo_url}
                          alt="Logo"
                          className="max-h-10 max-w-[90px] object-contain"
                        />
                      )}
                      <div className="text-[9px] leading-tight text-black">
                        {(printPayload.seller?.invoice_elements?.show_address ?? true) && printPayload.seller?.address && (
                          <div>{printPayload.seller.address}</div>
                        )}
                        {(printPayload.seller?.invoice_elements?.show_address ?? true) && (
                          <div>
                            {[printPayload.seller?.city, printPayload.seller?.pincode ? `- ${printPayload.seller.pincode}` : "", printPayload.seller?.state]
                              .filter(Boolean)
                              .join(" ")}
                          </div>
                        )}
                        {(printPayload.seller?.invoice_elements?.show_gstin ?? true) && printPayload.seller?.gstin && (
                          <div className="font-semibold mt-0.5">
                            GSTIN: <span className="font-mono">{printPayload.seller.gstin}</span>
                          </div>
                        )}
                        {(printPayload.seller?.invoice_elements?.show_contact_details ?? true) && (
                          <div className="text-[8.5px] text-slate-700 mt-0.5">
                            {[
                              (printPayload.seller?.invoice_elements?.show_phone ?? true) && printPayload.seller?.phone ? `Phone: ${printPayload.seller.phone}` : "",
                              (printPayload.seller?.invoice_elements?.show_email ?? true) && printPayload.seller?.email ? `Email: ${printPayload.seller.email}` : "",
                              (printPayload.seller?.invoice_elements?.show_website ?? false) && printPayload.seller?.website ? `Web: ${printPayload.seller.website}` : "",
                            ].filter(Boolean).join(" | ")}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-extrabold tracking-wider text-black">
                        {isGst ? (printPayload.seller?.gst_invoice_title || "TAX INVOICE") : (printPayload.seller?.regular_invoice_title || "INVOICE")}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Invoice Information: 2 Columns */}
              <div className="grid grid-cols-2 border-b border-black text-[9.5px]">
                <div className="p-1.5 border-r border-black space-y-0.5">
                  <div className="flex"><span className="w-20 text-black">#</span><span>: <strong className="font-mono">{invoiceNumber}</strong></span></div>
                  <div className="flex"><span className="w-20 text-black">Invoice Date</span><span>: {new Date(saleData.transaction_date || saleData.created_at || Date.now()).toLocaleDateString("en-GB")}</span></div>
                  <div className="flex"><span className="w-20 text-black">Terms</span><span>: {printPayload.payment_terms || "Due on Receipt"}</span></div>
                  <div className="flex"><span className="w-20 text-black">Due Date</span><span>: {new Date(saleData.due_date || saleData.transaction_date || Date.now()).toLocaleDateString("en-GB")}</span></div>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <div className="flex"><span className="w-28 text-black">Place Of Supply</span><span>: <strong>{printPayload.place_of_supply}</strong></span></div>
                  <div className="flex"><span className="w-28 text-black">Reverse Charge</span><span>: No</span></div>
                </div>
              </div>

              {/* Bill To / Ship To: Conditional */}
              {((printPayload.seller?.invoice_elements?.show_bill_to ?? true) || (printPayload.seller?.invoice_elements?.show_ship_to ?? true)) && (
                <div className={`grid ${(printPayload.seller?.invoice_elements?.show_bill_to ?? true) && (printPayload.seller?.invoice_elements?.show_ship_to ?? true) ? "grid-cols-2" : "grid-cols-1"} border-b border-black text-[9.5px]`}>
                  {(printPayload.seller?.invoice_elements?.show_bill_to ?? true) && (
                    <div className={`p-1.5 ${(printPayload.seller?.invoice_elements?.show_ship_to ?? true) ? "border-r border-black" : ""} leading-snug`}>
                      <div className="font-bold text-[10px] uppercase text-black mb-0.5">Bill To</div>
                      <div className="font-bold text-black">{customerName}</div>
                      {printPayload.customer?.address && <div>{printPayload.customer.address}</div>}
                      <div>{[printPayload.customer?.city, printPayload.customer?.pincode, printPayload.customer?.state].filter(Boolean).join(", ")}</div>
                      <div>India</div>
                      {printPayload.customer?.gstin ? (
                        <div className="mt-0.5 font-semibold">GSTIN: <span className="font-mono">{printPayload.customer.gstin}</span></div>
                      ) : customerPhone ? (
                        <div className="mt-0.5">Contact: {customerPhone}</div>
                      ) : null}
                    </div>
                  )}
                  {(printPayload.seller?.invoice_elements?.show_ship_to ?? true) && (
                    <div className="p-1.5 leading-snug">
                      <div className="font-bold text-[10px] uppercase text-black mb-0.5">Ship To</div>
                      <div className="font-bold text-black">{customerName}</div>
                      {printPayload.customer?.address && <div>{printPayload.customer.address}</div>}
                      <div>{[printPayload.customer?.city, printPayload.customer?.pincode, printPayload.customer?.state].filter(Boolean).join(", ")}</div>
                      <div>India</div>
                    </div>
                  )}
                </div>
              )}

              {/* Structured Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[9px] border-collapse border-b border-black">
                  <thead>
                    <tr className="bg-slate-50 text-black">
                      <th rowSpan={2} className="border border-black p-1 text-center w-6">#</th>
                      <th rowSpan={2} className="border border-black p-1">Item & Description</th>
                      <th rowSpan={2} className="border border-black p-1 text-center w-14">HSN/SAC</th>
                      <th rowSpan={2} className="border border-black p-1 text-center w-10">Qty</th>
                      <th rowSpan={2} className="border border-black p-1 text-right w-12">Rate</th>
                      <th colSpan={2} className="border border-black p-0.5 text-center">CGST</th>
                      <th colSpan={2} className="border border-black p-0.5 text-center">SGST</th>
                      <th rowSpan={2} className="border border-black p-1 text-right w-14">Amount</th>
                    </tr>
                    <tr className="bg-slate-50 text-black text-[8px]">
                      <th className="border border-black p-0.5 text-center w-6">%</th>
                      <th className="border border-black p-0.5 text-right w-10">Amt</th>
                      <th className="border border-black p-0.5 text-center w-6">%</th>
                      <th className="border border-black p-0.5 text-right w-10">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printPayload.items.map((it, idx) => {
                      const halfTaxRate = (Number(it.tax_rate) || 0) / 2;
                      const taxable = Number(it.taxable_amount) || (Number(it.unit_price) * Number(it.quantity) - Number(it.discount || 0));
                      const cgstAmt = it.cgst_amount !== undefined ? Number(it.cgst_amount) : (taxable * halfTaxRate) / 100;
                      const sgstAmt = it.sgst_amount !== undefined ? Number(it.sgst_amount) : (taxable * halfTaxRate) / 100;

                      return (
                        <tr key={idx} className="border-t border-black">
                          <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                          <td className="border border-black p-1">
                            <div className="font-bold text-black">{it.name}</div>
                            {it.description && it.description !== it.name && (
                              <div className="text-[8px] text-slate-600">{it.description}</div>
                            )}
                          </td>
                          <td className="border border-black p-1 text-center font-mono">{it.hsn_code || "39011090"}</td>
                          <td className="border border-black p-1 text-center font-mono">
                            {it.quantity}<br/><span className="text-[7.5px] uppercase">{it.unit || "PCS"}</span>
                          </td>
                          <td className="border border-black p-1 text-right font-mono">{Number(it.unit_price).toFixed(2)}</td>
                          <td className="border border-black p-0.5 text-center font-mono">{halfTaxRate}%</td>
                          <td className="border border-black p-0.5 text-right font-mono">{cgstAmt.toFixed(2)}</td>
                          <td className="border border-black p-0.5 text-center font-mono">{halfTaxRate}%</td>
                          <td className="border border-black p-0.5 text-right font-mono">{sgstAmt.toFixed(2)}</td>
                          <td className="border border-black p-1 text-right font-mono font-bold">
                            {taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary: Left Notes & Bank | Right Financials & Signature */}
              <div className="grid grid-cols-12 text-[9px]">
                <div className="col-span-7 p-2 border-r border-black space-y-1.5">
                  <div>
                    Items in Total <strong>{printPayload.items.reduce((s, it) => s + Number(it.quantity || 1), 0)}</strong>
                  </div>
                  {((printPayload.seller?.invoice_elements?.show_amount_in_words ?? (printPayload.seller?.invoice_elements as any)?.show_words) ?? true) && (
                    <div>
                      <div className="text-[8.5px] text-slate-700">Total In Words</div>
                      <div className="font-bold italic text-black text-[9.5px]">
                        {indianNumberToWords(total)}
                      </div>
                    </div>
                  )}
                  {(printPayload.seller?.invoice_elements?.show_notes ?? true) && printPayload.custom_notes && (
                    <div>
                      <div className="text-[8.5px] text-slate-700">Notes</div>
                      <div className="text-black">{printPayload.custom_notes}</div>
                    </div>
                  )}
                  {(printPayload.seller?.invoice_elements?.show_terms ?? true) && printPayload.terms_and_conditions && (
                    <div>
                      <div className="text-[8.5px] text-slate-700">Terms & Conditions</div>
                      <div className="text-black">{printPayload.terms_and_conditions}</div>
                    </div>
                  )}
                  {(printPayload.seller?.invoice_elements?.show_bank_details ?? true) && (printPayload.seller?.bank_name || printPayload.seller?.bank_account_number) && (
                    <div className="pt-1 border-t border-dotted border-black/40 text-[8.5px] space-y-0.5">
                      <div className="font-bold text-black">Bank Details:</div>
                      {printPayload.seller?.bank_account_name && (
                        <div>Bank Account Name : {printPayload.seller.bank_account_name}</div>
                      )}
                      {printPayload.seller?.bank_account_number && (
                        <div>Bank Account Number: <span className="font-mono">{printPayload.seller.bank_account_number}</span></div>
                      )}
                      {printPayload.seller?.bank_ifsc_code && (
                        <div>IFS Code: <span className="font-mono font-semibold">{printPayload.seller.bank_ifsc_code}</span></div>
                      )}
                      {printPayload.seller?.bank_name && (
                        <div>Bank Name : {printPayload.seller.bank_name}</div>
                      )}
                      {printPayload.seller?.bank_branch && (
                        <div>Branch Address: {printPayload.seller.bank_branch}</div>
                      )}
                      {printPayload.seller?.bank_upi_id && (
                        <div>UPI ID: <span className="font-mono">{printPayload.seller.bank_upi_id}</span></div>
                      )}
                    </div>
                  )}
                </div>

                <div className="col-span-5 flex flex-col justify-between">
                  <table className="w-full text-[9px] border-collapse">
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="p-1 px-2 text-black">Sub Total</td>
                        <td className="p-1 px-2 text-right font-mono">
                          {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="p-1 px-2 text-black">CGST</td>
                        <td className="p-1 px-2 text-right font-mono">
                          {(tax / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="p-1 px-2 text-black">SGST</td>
                        <td className="p-1 px-2 text-right font-mono">
                          {(tax / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {roundOff !== 0 && (
                        <tr className="border-b border-black">
                          <td className="p-1 px-2 text-black">Balance Amount</td>
                          <td className="p-1 px-2 text-right font-mono">
                            {roundOff < 0 ? `(-) ${Math.abs(roundOff).toFixed(2)}` : roundOff.toFixed(2)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-black font-bold">
                        <td className="p-1.5 px-2 text-black text-[10px]">Total</td>
                        <td className="p-1.5 px-2 text-right font-mono text-xs font-extrabold text-black">
                          ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {printPayload.payments && printPayload.payments.length > 0 && (
                        <tr className="border-b border-black">
                          <td className="p-1 px-2 text-black">Payment</td>
                          <td className="p-1 px-2 text-right font-mono text-[8.5px]">
                            {printPayload.payments
                              .map((p) => `${String(p.payment_method || "CASH").toUpperCase()} ₹${Number(p.amount || 0).toFixed(2)}`)
                              .join(" + ")}
                          </td>
                        </tr>
                      )}
                      {changeAmount > 0 && (
                        <tr className="border-b border-black">
                          <td className="p-1 px-2 text-black">Change Returned</td>
                          <td className="p-1 px-2 text-right font-mono">
                            {changeAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {((printPayload.seller?.invoice_elements?.show_authorized_signature ?? (printPayload.seller?.invoice_elements as any)?.show_signature) ?? true) && (
                    <div className="p-2 text-center flex flex-col justify-between h-24">
                      <div className="font-bold text-[9px] text-black">
                        {printPayload.seller?.legal_name || printPayload.seller?.name || "BillMeet Store"}
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        {printPayload.seller?.signature_url ? (
                          <img
                            src={printPayload.seller.signature_url}
                            alt="Signature"
                            className="max-h-8 max-w-[100px] object-contain"
                          />
                        ) : (
                          <div className="h-6" />
                        )}
                      </div>
                      <div className="font-semibold text-[8.5px] text-black border-t border-dashed border-black/40 pt-0.5">
                        {printPayload.seller?.authorized_signatory_name || "Authorized Signature"}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Page Number Bottom Right */}
              {((printPayload.seller?.invoice_elements?.show_page_number ?? (printPayload.seller?.invoice_elements as any)?.show_page_numbers) ?? true) && (
                <div className="text-right text-[8px] text-slate-500 pt-1 pr-1">
                  1
                </div>
              )}
            </div>
          )}
        </div>

        {/* Post-Sale Completion & Non-Blocking WhatsApp Delivery Status */}
        <div
          className={`rounded-lg border px-3 py-2 text-xs flex flex-col gap-2 ${
            waState.status === "sent"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : waState.status === "failed"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : waState.status === "queued" || waState.status === "sending"
              ? "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300"
              : "border-border bg-muted/40 text-foreground"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-90">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Payment completed
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Invoice #{invoiceNumber} created
            </span>
          </div>

          {(waState.status !== "idle" || showPhonePrompt) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium">
                {(waState.status === "sending" || waState.status === "queued") && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                )}
                {waState.status === "sent" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                {(waState.status === "failed" || waState.status === "skipped") && (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{waState.message || "Enter WhatsApp phone number"}</span>
              </div>
              {waState.status === "failed" && !showPhonePrompt && (
                <button
                  type="button"
                  onClick={() => handleWhatsApp()}
                  className="text-[11px] font-bold underline shrink-0 hover:opacity-80"
                >
                  Retry
                </button>
              )}
              {waState.status === "skipped" && !showPhonePrompt && (
                <button
                  type="button"
                  onClick={() => setShowPhonePrompt(true)}
                  className="text-[11px] font-bold underline shrink-0 hover:opacity-80"
                >
                  Send to Phone
                </button>
              )}
            </div>
          )}

          {showPhonePrompt && (
            <div className="flex items-center gap-1.5">
              <input
                type="tel"
                value={customWaPhone}
                onChange={(e) => setCustomWaPhone(e.target.value)}
                placeholder="Enter customer WhatsApp mobile (e.g. 9876543210)"
                className="flex-1 rounded border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleWhatsApp(customWaPhone)}
                disabled={waState.status === "sending" || waState.status === "queued" || !customWaPhone.trim()}
                className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Send PDF
              </button>
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {/* Primary Print Button */}
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg bg-foreground text-background font-bold text-xs hover:bg-foreground/90 transition-all shadow-sm active:scale-95"
            >
              <Printer className="h-4 w-4" />
              <span>Print {activeFormat === "thermal" ? "Thermal (80mm)" : "A4 Invoice"}</span>
            </button>

            {/* Native PDF View */}
            {invoiceId && (
              <button
                onClick={handleOpenPdf}
                className="flex items-center gap-1 px-3 py-2.5 sm:py-2 rounded-lg border font-semibold text-xs hover:bg-accent text-foreground transition-colors"
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
                className="flex items-center gap-1 px-3 py-2.5 sm:py-2 rounded-lg border font-semibold text-xs hover:bg-accent text-foreground transition-colors"
                title="Download genuine ReportLab PDF file"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            {/* WhatsApp PDF Attachment */}
            {invoiceId && (
              <button
                type="button"
                onClick={() => handleWhatsApp()}
                disabled={waState.status === "sending" || waState.status === "queued"}
                className="flex items-center gap-1 px-3 py-2.5 sm:py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold text-xs hover:bg-emerald-500/20 transition-colors disabled:opacity-60"
                title="Send official Invoice PDF attachment via WhatsApp"
              >
                {waState.status === "sending" || waState.status === "queued" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {waState.status === "sending" || waState.status === "queued"
                    ? "Sending PDF..."
                    : waState.status === "sent"
                    ? "Resend PDF"
                    : waState.status === "failed"
                    ? "Retry WhatsApp"
                    : "WhatsApp PDF"}
                </span>
              </button>
            )}
          </div>

          {/* New Sale Button */}
          <button
            onClick={onNewSale}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-xs active:scale-95 sm:ml-auto"
          >
            <span>Start New Sale (Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
