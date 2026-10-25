/**
 * Professional Isolated Receipt & Invoice Print System
 * Guarantees zero DOM leakage, no parent modal or catalog printing,
 * supports both Thermal POS Receipt (80mm) and Standard A4 GST Tax Invoice.
 */

export interface PrintReceiptItem {
  id?: string;
  name?: string;
  product_name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  hsn_code?: string;
  quantity: number | string;
  unit?: string;
  unit_price: number | string;
  discount?: number | string;
  tax_rate?: number | string;
  taxable_amount?: number | string;
  cgst_amount?: number | string;
  sgst_amount?: number | string;
  igst_amount?: number | string;
  tax?: number | string;
  total: number | string;
}

export interface PrintPaymentLine {
  payment_method: string;
  amount: number | string;
  reference?: string;
  status?: string;
}

export interface PrintReceiptData {
  invoice_id?: string;
  invoice_number: string;
  transaction_date?: string;
  created_at?: string;
  seller?: {
    name?: string;
    legal_name?: string;
    trade_name?: string;
    gstin?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    invoice_footer?: string;
    invoice_terms?: string;
  };
  customer?: {
    id?: string;
    name?: string;
    full_name?: string;
    phone?: string;
    gstin?: string;
    address?: string;
    is_walk_in?: boolean;
  } | null;
  cashier_name?: string;
  store_name?: string;
  items: PrintReceiptItem[];
  subtotal: number | string;
  discount?: number | string;
  tax: number | string;
  round_off?: number | string;
  total: number | string;
  tendered_amount?: number | string;
  change_amount?: number | string;
  amount_paid?: number | string;
  outstanding_amount?: number | string;
  payment_status?: string;
  payment_method?: string;
  payments?: PrintPaymentLine[];
  tax_breakup?: any;
}

function escapeHtml(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatINR(val: number | string | undefined | null): string {
  const num = Number(val) || 0;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Creates an isolated offscreen iframe, writes the printable document,
 * invokes window.print() on the iframe, and cleans up.
 */
function printViaIsolatedIframe(htmlContent: string) {
  // Remove any stale print iframes
  const oldIframe = document.getElementById("bm-print-frame");
  if (oldIframe) {
    oldIframe.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.id = "bm-print-frame";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Popup fallback if iframe doc unavailable
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Print execution error:", e);
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 2000);
    }
  };

  // Immediate fallback trigger if onload already resolved
  setTimeout(() => {
    if (document.getElementById("bm-print-frame")) {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        // Handled
      } finally {
        setTimeout(() => iframe.remove(), 2000);
      }
    }
  }, 400);
}

/**
 * 1. Print Compact Thermal POS Receipt (80mm width)
 */
export function printThermalReceipt(data: PrintReceiptData) {
  const sellerName = escapeHtml(data.seller?.trade_name || data.seller?.name || "BILLMEET RETAIL");
  const sellerAddress = escapeHtml(data.seller?.address || "");
  const sellerPhone = escapeHtml(data.seller?.phone || "");
  const sellerGstin = escapeHtml(data.seller?.gstin || "");
  const invoiceNumber = escapeHtml(data.invoice_number);
  const dateStr = new Date(data.transaction_date || data.created_at || Date.now()).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const cashier = escapeHtml(data.cashier_name || "Staff");
  const customerName = escapeHtml(data.customer?.full_name || data.customer?.name || "Walk-in Customer");
  const customerPhone = escapeHtml(data.customer?.phone || "");

  const subtotal = Number(data.subtotal) || 0;
  const discount = Number(data.discount) || 0;
  const tax = Number(data.tax) || 0;
  const roundOff = Number(data.round_off) || 0;
  const total = Number(data.total) || 0;
  const tendered = Number(data.tendered_amount) || 0;
  const change = Number(data.change_amount) || 0;

  const itemsHtml = (data.items || []).map((it, idx) => {
    const itemName = escapeHtml(it.product_name || it.name || it.description || `Item #${idx + 1}`);
    const sku = escapeHtml(it.sku || "");
    const hsn = escapeHtml(it.hsn_code || "");
    const qty = Number(it.quantity) || 1;
    const unit = escapeHtml(it.unit || "pcs");
    const rate = Number(it.unit_price) || 0;
    const lineTotal = Number(it.total) || (qty * rate);

    const subDetails: string[] = [];
    if (sku) subDetails.push(`SKU: ${sku}`);
    if (hsn) subDetails.push(`HSN: ${hsn}`);

    return `
      <tr>
        <td style="padding: 4px 0; vertical-align: top;">
          <div style="font-weight: 700; word-break: break-word;">${itemName}</div>
          ${subDetails.length > 0 ? `<div style="font-size: 9px; color: #555;">${subDetails.join(" | ")}</div>` : ""}
        </td>
        <td style="text-align: center; vertical-align: top; padding: 4px 0; white-space: nowrap;">
          ${qty} ${unit}
        </td>
        <td style="text-align: right; vertical-align: top; padding: 4px 0; white-space: nowrap;">
          ${formatINR(rate)}
        </td>
        <td style="text-align: right; vertical-align: top; padding: 4px 0; font-weight: 700; white-space: nowrap;">
          ${formatINR(lineTotal)}
        </td>
      </tr>
    `;
  }).join("");

  const paymentsHtml = (data.payments && data.payments.length > 0)
    ? data.payments.map(p => `
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
          <span>${escapeHtml(p.payment_method.toUpperCase())}${p.reference ? ` (${escapeHtml(p.reference)})` : ""}:</span>
          <span>${formatINR(p.amount)}</span>
        </div>
      `).join("")
    : `
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>PAID VIA ${(data.payment_method || "CASH").toUpperCase()}:</span>
          <span>${formatINR(total)}</span>
        </div>
      `;

  const footerText = escapeHtml(data.seller?.invoice_footer || "Thank you for shopping with us! Please visit again.");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt #${invoiceNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 6mm 4mm;
            font-size: 10px;
            color: #000;
            background: #fff;
            line-height: 1.3;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: 700; }
          .divider {
            border-bottom: 1px dashed #000;
            margin: 5px 0;
          }
          .divider-solid {
            border-bottom: 1px solid #000;
            margin: 5px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }
          th {
            border-bottom: 1px solid #000;
            padding: 3px 0;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="text-center">
          <div style="font-size: 13px; font-weight: 900; letter-spacing: -0.2px;">${sellerName}</div>
          ${sellerAddress ? `<div>${sellerAddress}</div>` : ""}
          ${sellerPhone ? `<div>Tel: ${sellerPhone}</div>` : ""}
          ${sellerGstin ? `<div class="bold">GSTIN: ${sellerGstin}</div>` : ""}
        </div>

        <div class="divider"></div>

        <!-- Meta -->
        <div style="display: flex; justify-content: space-between;">
          <span>Bill No: <span class="bold">#${invoiceNumber}</span></span>
          <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Customer: <span class="bold">${customerName}</span></span>
          ${customerPhone ? `<span>${customerPhone}</span>` : ""}
        </div>
        <div>Cashier: ${cashier}</div>

        <div class="divider"></div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Amt</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <!-- Totals -->
        <div class="totals-row">
          <span>Subtotal:</span>
          <span>${formatINR(subtotal)}</span>
        </div>
        ${discount > 0 ? `
          <div class="totals-row">
            <span>Discount:</span>
            <span>-${formatINR(discount)}</span>
          </div>
        ` : ""}
        <div class="totals-row">
          <span>Tax (GST):</span>
          <span>${formatINR(tax)}</span>
        </div>
        ${roundOff !== 0 ? `
          <div class="totals-row">
            <span>Round-off:</span>
            <span>${roundOff > 0 ? "+" : ""}${formatINR(roundOff)}</span>
          </div>
        ` : ""}
        <div class="divider-solid"></div>
        <div class="totals-row bold" style="font-size: 12px;">
          <span>GRAND TOTAL:</span>
          <span>${formatINR(total)}</span>
        </div>
        <div class="divider-solid"></div>

        <!-- Payments & Change -->
        <div style="margin-top: 4px;">
          ${paymentsHtml}
          ${tendered > total ? `
            <div class="totals-row" style="color: #444;">
              <span>Tendered Cash:</span>
              <span>${formatINR(tendered)}</span>
            </div>
            <div class="totals-row bold">
              <span>Change Returned:</span>
              <span>${formatINR(change)}</span>
            </div>
          ` : ""}
        </div>

        <div class="divider"></div>

        <!-- Footer -->
        <div class="text-center" style="margin-top: 6px; font-size: 9px;">
          <p>${footerText}</p>
          <p style="margin-top: 3px; font-family: monospace;">*** Powered by BillMeet POS ***</p>
        </div>
      </body>
    </html>
  `;

  printViaIsolatedIframe(html);
}

/**
 * 2. Print Professional Standard A4 GST Tax Invoice
 */
export function printA4TaxInvoice(data: PrintReceiptData) {
  const sellerLegal = escapeHtml(data.seller?.legal_name || data.seller?.name || "BillMeet Technologies Private Limited");
  const sellerTrade = escapeHtml(data.seller?.trade_name || data.seller?.name || "");
  const sellerAddress = escapeHtml(data.seller?.address || "");
  const sellerCityState = escapeHtml([data.seller?.city, data.seller?.state, data.seller?.pincode].filter(Boolean).join(", "));
  const sellerPhone = escapeHtml(data.seller?.phone || "");
  const sellerEmail = escapeHtml(data.seller?.email || "");
  const sellerGstin = escapeHtml(data.seller?.gstin || "Not Registered");

  const invoiceNumber = escapeHtml(data.invoice_number);
  const dateStr = new Date(data.transaction_date || data.created_at || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = new Date(data.transaction_date || data.created_at || Date.now()).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const customerName = escapeHtml(data.customer?.full_name || data.customer?.name || "Walk-in Customer");
  const customerPhone = escapeHtml(data.customer?.phone || "-");
  const customerAddress = escapeHtml(data.customer?.address || "-");
  const customerGstin = escapeHtml(data.customer?.gstin || "Unregistered");

  const subtotal = Number(data.subtotal) || 0;
  const discount = Number(data.discount) || 0;
  const tax = Number(data.tax) || 0;
  const roundOff = Number(data.round_off) || 0;
  const total = Number(data.total) || 0;
  const paid = Number(data.amount_paid) || total;
  const balanceDue = Number(data.outstanding_amount) || 0;

  // Render Table Rows
  const itemsHtml = (data.items || []).map((it, idx) => {
    const itemName = escapeHtml(it.product_name || it.name || it.description || `Item #${idx + 1}`);
    const sku = escapeHtml(it.sku || "");
    const hsn = escapeHtml(it.hsn_code || "9983");
    const qty = Number(it.quantity) || 1;
    const unit = escapeHtml(it.unit || "PCS");
    const rate = Number(it.unit_price) || 0;
    const itemDisc = Number(it.discount) || 0;
    const taxRate = Number(it.tax_rate) || 0;
    const taxable = Number(it.taxable_amount) || Math.max(0, (qty * rate) - itemDisc);
    const lineTotal = Number(it.total) || 0;

    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 6px; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px;">
          <div style="font-weight: 700; color: #111827;">${itemName}</div>
          ${sku ? `<div style="font-size: 10px; color: #6b7280;">SKU: ${sku}</div>` : ""}
        </td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${hsn}</td>
        <td style="padding: 6px; text-align: center;">${qty} ${unit}</td>
        <td style="padding: 6px; text-align: right; font-family: monospace;">${formatINR(rate)}</td>
        <td style="padding: 6px; text-align: right; font-family: monospace;">${itemDisc > 0 ? formatINR(itemDisc) : "-"}</td>
        <td style="padding: 6px; text-align: right; font-family: monospace;">${formatINR(taxable)}</td>
        <td style="padding: 6px; text-align: center; font-family: monospace;">${taxRate}%</td>
        <td style="padding: 6px; text-align: right; font-weight: 700; font-family: monospace;">${formatINR(lineTotal)}</td>
      </tr>
    `;
  }).join("");

  const isGst = Boolean(data.seller?.gstin);
  const title = isGst ? "TAX INVOICE" : "RETAIL INVOICE";
  const termsText = escapeHtml(data.seller?.invoice_terms || "1. Goods once sold will not be returned. 2. Subject to local jurisdiction. 3. This is an authenticated computer-generated invoice.");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Tax Invoice #${invoiceNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.4;
          }
          .container {
            width: 100%;
            max-width: 190mm;
            margin: 0 auto;
            border: 1px solid #111827;
            padding: 10mm;
          }
          .header-table {
            width: 100%;
            border-bottom: 2px solid #111827;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .two-col {
            width: 100%;
            margin-bottom: 12px;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
          }
          .two-col td {
            padding: 8px 12px;
            vertical-align: top;
            width: 50%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .items-table th {
            background: #111827;
            color: #ffffff;
            font-weight: 700;
            padding: 6px;
            font-size: 10px;
            text-transform: uppercase;
          }
          .totals-table {
            width: 100%;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 4px 8px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Main Header -->
          <table class="header-table">
            <tr>
              <td style="vertical-align: top; width: 60%;">
                <h1 style="font-size: 18px; font-weight: 900; color: #111827; text-transform: uppercase;">${sellerLegal}</h1>
                ${sellerTrade ? `<div style="font-weight: 600; font-size: 12px; color: #374151;">${sellerTrade}</div>` : ""}
                ${sellerAddress ? `<div>${sellerAddress}</div>` : ""}
                ${sellerCityState ? `<div>${sellerCityState}</div>` : ""}
                <div>GSTIN: <strong style="font-family: monospace;">${sellerGstin}</strong></div>
                ${sellerPhone ? `<div>Phone: ${sellerPhone} ${sellerEmail ? `| Email: ${sellerEmail}` : ""}</div>` : ""}
              </td>
              <td style="vertical-align: top; text-align: right; width: 40%;">
                <div style="display: inline-block; background: #111827; color: #fff; padding: 4px 12px; font-size: 13px; font-weight: 800; border-radius: 4px;">
                  ${title}
                </div>
                <div style="margin-top: 8px; font-size: 11px;">
                  <div>Invoice No: <strong style="font-family: monospace; font-size: 13px;">#${invoiceNumber}</strong></div>
                  <div>Date: <strong>${dateStr}</strong></div>
                  <div>Time: <strong>${timeStr}</strong></div>
                  <div>Place of Supply: <strong>${data.seller?.state || "State Jurisdiction"}</strong></div>
                </div>
              </td>
            </tr>
          </table>

          <!-- Bill To / Customer Details -->
          <table class="two-col">
            <tr>
              <td>
                <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 2px;">Billed To (Customer):</div>
                <div style="font-weight: 800; font-size: 13px; color: #111827;">${customerName}</div>
                <div>Phone: <strong>${customerPhone}</strong></div>
                <div>Address: ${customerAddress}</div>
                <div>GSTIN: <strong>${customerGstin}</strong></div>
              </td>
              <td>
                <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 2px;">Transaction Details:</div>
                <div>Cashier / Agent: <strong>${escapeHtml(data.cashier_name || "POS Station")}</strong></div>
                <div>Payment Status: <strong style="text-transform: uppercase;">${escapeHtml(data.payment_status || "PAID")}</strong></div>
                <div>Payment Method: <strong style="text-transform: uppercase;">${escapeHtml(data.payment_method || "CASH")}</strong></div>
              </td>
            </tr>
          </table>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="text-align: left;">Item Description</th>
                <th style="width: 60px; text-align: center;">HSN</th>
                <th style="width: 55px; text-align: center;">Qty</th>
                <th style="width: 75px; text-align: right;">Rate</th>
                <th style="width: 65px; text-align: right;">Disc</th>
                <th style="width: 80px; text-align: right;">Taxable</th>
                <th style="width: 45px; text-align: center;">GST</th>
                <th style="width: 90px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Totals & Payment Summary -->
          <table style="width: 100%; margin-bottom: 16px;">
            <tr>
              <td style="vertical-align: top; width: 55%; padding-right: 15px;">
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #fafafa;">
                  <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Terms & Conditions</div>
                  <div style="font-size: 9.5px; color: #4b5563; line-height: 1.35;">${termsText}</div>
                </div>

                <!-- Split Payments Breakdown -->
                ${data.payments && data.payments.length > 0 ? `
                  <div style="margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px;">
                    <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Payment Breakdown:</div>
                    ${data.payments.map(p => `
                      <div style="display: flex; justify-content: space-between; font-size: 10px; font-family: monospace;">
                        <span>${escapeHtml(p.payment_method.toUpperCase())}${p.reference ? ` (${escapeHtml(p.reference)})` : ""}:</span>
                        <strong>${formatINR(p.amount)}</strong>
                      </div>
                    `).join("")}
                  </div>
                ` : ""}
              </td>
              <td style="vertical-align: top; width: 45%;">
                <table class="totals-table" style="width: 100%; border: 1px solid #e5e7eb;">
                  <tr>
                    <td style="color: #4b5563;">Taxable Subtotal:</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 600;">${formatINR(subtotal)}</td>
                  </tr>
                  ${discount > 0 ? `
                    <tr>
                      <td style="color: #4b5563;">Discount Applied:</td>
                      <td style="text-align: right; font-family: monospace; color: #dc2626;">-${formatINR(discount)}</td>
                    </tr>
                  ` : ""}
                  <tr>
                    <td style="color: #4b5563;">Total GST:</td>
                    <td style="text-align: right; font-family: monospace;">${formatINR(tax)}</td>
                  </tr>
                  ${roundOff !== 0 ? `
                    <tr>
                      <td style="color: #4b5563;">Round Off:</td>
                      <td style="text-align: right; font-family: monospace;">${roundOff > 0 ? "+" : ""}${formatINR(roundOff)}</td>
                    </tr>
                  ` : ""}
                  <tr style="border-top: 2px solid #111827; background: #f3f4f6;">
                    <td style="font-weight: 800; font-size: 13px;">GRAND TOTAL:</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 900; font-size: 14px;">${formatINR(total)}</td>
                  </tr>
                  <tr>
                    <td style="color: #4b5563;">Amount Paid:</td>
                    <td style="text-align: right; font-family: monospace; font-weight: 600;">${formatINR(paid)}</td>
                  </tr>
                  ${balanceDue > 0 ? `
                    <tr style="color: #dc2626; font-weight: 700;">
                      <td>Balance Due:</td>
                      <td style="text-align: right; font-family: monospace;">${formatINR(balanceDue)}</td>
                    </tr>
                  ` : ""}
                </table>
              </td>
            </tr>
          </table>

          <!-- Signatory Footer -->
          <div style="border-top: 1px solid #111827; padding-top: 15px; margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 9px; color: #6b7280;">
              This is a digitally verified GST Tax Invoice generated by BillMeet Billing & POS.
            </div>
            <div style="text-align: center; width: 180px;">
              <div style="height: 35px;"></div>
              <div style="border-top: 1px dashed #000; font-size: 10px; font-weight: 700;">Authorized Signatory</div>
              <div style="font-size: 9px; color: #555;">${sellerLegal}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  printViaIsolatedIframe(html);
}

/**
 * 3. Stream or Open Pure ReportLab Binary PDF
 */
export function streamInvoicePdf(invoiceId: string, formatType: "a4" | "thermal" = "a4") {
  const url = `/api/v1/invoices/${invoiceId}/pdf/?raw=true&format_type=${formatType}`;
  const win = window.open(url, "_blank");
  if (!win) {
    alert("Popup was blocked by your browser. Please allow popups for this site to view the PDF invoice.");
  }
}

/**
 * 4. Download Pure ReportLab Binary PDF
 */
export function downloadInvoicePdf(invoiceId: string, invoiceNumber: string, formatType: "a4" | "thermal" = "a4") {
  const link = document.createElement("a");
  link.href = `/api/v1/invoices/${invoiceId}/pdf/?download=true&format_type=${formatType}`;
  link.download = `${invoiceNumber}_${formatType}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
