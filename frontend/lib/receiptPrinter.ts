import api from "@/lib/api";
import { parseApiError } from "@/lib/utils";
import { indianNumberToWords } from "./numberToWords";

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
  invoice_type?: string;
  transaction_date?: string;
  created_at?: string;
  due_date?: string;
  payment_terms?: string;
  place_of_supply?: string;
  reverse_charge?: string;
  custom_notes?: string;
  terms_and_conditions?: string;
  seller?: {
    name?: string;
    legal_name?: string;
    trade_name?: string;
    tagline?: string;
    gstin?: string;
    address?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    district?: string;
    state?: string;
    state_code?: string;
    pincode?: string;
    phone?: string;
    alternate_phone?: string;
    email?: string;
    website?: string;
    logo_url?: string | null;
    logo_position?: "left" | "center" | "right";
    gst_invoice_title?: string;
    regular_invoice_title?: string;
    default_invoice_notes?: string;
    invoice_footer?: string;
    invoice_terms?: string;
    bank_name?: string;
    bank_account_name?: string;
    bank_account_number?: string;
    bank_ifsc_code?: string;
    bank_branch?: string;
    bank_upi_id?: string;
    authorized_signatory_name?: string;
    signature_url?: string | null;
    invoice_elements?: Record<string, boolean>;
  };
  customer?: {
    id?: string;
    name?: string;
    full_name?: string;
    phone?: string;
    gstin?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    is_walk_in?: boolean;
  } | null;
  cashier_name?: string;
  store_name?: string;
  items: PrintReceiptItem[];
  subtotal: number | string;
  discount?: number | string;
  tax: number | string;
  round_off?: number | string;
  shipping_charge?: number | string;
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

const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh (New)",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export function resolvePlaceOfSupply(stateName?: string, gstin?: string): string {
  const gstinClean = (gstin || "").trim();
  if (gstinClean.length >= 2) {
    const code = gstinClean.slice(0, 2);
    if (GST_STATE_CODES[code]) {
      return `${GST_STATE_CODES[code]} (${code})`;
    }
  }

  if (!stateName) return "Maharashtra (27)";

  const clean = stateName.toLowerCase().replace(/&/g, "and").trim();
  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    const norm = name.toLowerCase().replace(/&/g, "and").trim();
    if (norm === clean || norm.includes(clean) || clean.includes(norm)) {
      return `${name} (${code})`;
    }
  }

  return stateName;
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
 * Matches formal Indian B2B/B2C GST Tax Invoice reference standard (e.g. Zoom Renewables Pvt. Ltd.)
 */
export function printA4TaxInvoice(data: PrintReceiptData) {
  const sellerLegal = escapeHtml(data.seller?.legal_name || data.seller?.name || "BillMeet Technologies Private Limited");
  const sellerTrade = escapeHtml(data.seller?.trade_name || data.seller?.name || "");
  const sellerAddress = escapeHtml(data.seller?.address || "");
  const sellerCity = escapeHtml(data.seller?.city || "");
  const sellerState = escapeHtml(data.seller?.state || "Maharashtra");
  const sellerPin = escapeHtml(data.seller?.pincode || "");
  const sellerGstin = escapeHtml(data.seller?.gstin || "");
  const logoUrl = data.seller?.logo_url;

  const invoiceNumber = escapeHtml(data.invoice_number);
  const rawDate = data.transaction_date || data.created_at || new Date().toISOString();
  const invDate = new Date(rawDate);
  const dateStr = invDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const dueDateStr = data.due_date
    ? new Date(data.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    : dateStr;
  const paymentTerms = escapeHtml(data.payment_terms || "Due on Receipt");

  const customerName = escapeHtml(data.customer?.full_name || data.customer?.name || "Walk-in Customer");
  const customerAddress = escapeHtml(data.customer?.address || "");
  const customerCity = escapeHtml(data.customer?.city || "");
  const customerState = escapeHtml(data.customer?.state || "");
  const customerPin = escapeHtml(data.customer?.pincode || "");
  const customerGstin = escapeHtml(data.customer?.gstin || "");
  const customerPhone = escapeHtml(data.customer?.phone || "");

  const elements = data.seller?.invoice_elements || {};
  const showLogo = elements.show_logo ?? true;
  const showAddress = elements.show_address ?? true;
  const showGstin = elements.show_gstin ?? true;
  const showContact = elements.show_contact_details ?? true;
  const showPhone = elements.show_phone ?? true;
  const showEmail = elements.show_email ?? true;
  const showWebsite = elements.show_website ?? false;
  const showTagline = elements.show_tagline ?? false;
  const showBillTo = elements.show_bill_to ?? true;
  const showShipTo = elements.show_ship_to ?? true;
  const showBank = elements.show_bank_details ?? true;
  const showTerms = elements.show_terms ?? true;
  const showNotes = elements.show_notes ?? true;
  const showWords = elements.show_amount_in_words ?? true;
  const showSignature = elements.show_authorized_signature ?? true;
  const showPageNumber = elements.show_page_number ?? true;

  const logoPosition = data.seller?.logo_position || "left";
  const tagline = escapeHtml(data.seller?.tagline || "");
  const signatoryTitle = escapeHtml(data.seller?.authorized_signatory_name || "Authorized Signature");
  const sellerPhone = escapeHtml(data.seller?.phone || "");
  const sellerAltPhone = escapeHtml(data.seller?.alternate_phone || "");
  const sellerEmail = escapeHtml(data.seller?.email || "");
  const sellerWebsite = escapeHtml(data.seller?.website || "");

  const placeOfSupply = escapeHtml(
    data.place_of_supply || resolvePlaceOfSupply(customerState || sellerState, customerGstin || sellerGstin)
  );
  const reverseCharge = escapeHtml(data.reverse_charge || "No");

  const isGst = Boolean(sellerGstin && data.invoice_type !== "non_gst");
  const docHeading = escapeHtml(
    isGst
      ? (data.seller?.gst_invoice_title || "TAX INVOICE")
      : (data.seller?.regular_invoice_title || "INVOICE")
  );

  const contactParts: string[] = [];
  if (showContact) {
    if (showPhone && sellerPhone) contactParts.push(`Phone: ${sellerPhone}`);
    if (showPhone && sellerAltPhone) contactParts.push(`Alt: ${sellerAltPhone}`);
    if (showEmail && sellerEmail) contactParts.push(`Email: ${sellerEmail}`);
    if (showWebsite && sellerWebsite) contactParts.push(`Web: ${sellerWebsite}`);
  }
  const sellerContactLine = contactParts.join(" | ");

  // Check interstate vs intra-state
  const hasIgst = (data.items || []).some((it) => Number(it.igst_amount || 0) > 0) ||
    Boolean(data.tax_breakup?.igst_amount && Number(data.tax_breakup.igst_amount) > 0);
  const isInterstate = hasIgst || (
    Boolean(customerState) &&
    Boolean(sellerState) &&
    customerState.trim().toLowerCase() !== sellerState.trim().toLowerCase()
  );

  let totalItemsCount = 0;
  const itemsHtml = (data.items || []).map((it, idx) => {
    const itemName = escapeHtml(it.product_name || it.name || it.description || `Item #${idx + 1}`);
    const desc = escapeHtml(it.description && it.description !== it.name ? it.description : "");
    const hsn = escapeHtml(it.hsn_code || "39011090");
    const qty = Number(it.quantity) || 1;
    totalItemsCount += qty;
    const unit = escapeHtml(it.unit ? it.unit.toUpperCase() : "PCS");
    const rate = Number(it.unit_price) || 0;
    const itemDisc = Number(it.discount) || 0;
    const taxable = Number(it.taxable_amount) || Math.max(0, qty * rate - itemDisc);
    const taxRate = Number(it.tax_rate) || 0;

    let taxCells = "";
    if (isInterstate) {
      const igstAmt = it.igst_amount !== undefined ? Number(it.igst_amount) : (taxable * taxRate) / 100;
      taxCells = `
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${taxRate}%</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-family: monospace;">${igstAmt.toFixed(2)}</td>
      `;
    } else {
      const halfRate = taxRate / 2;
      const cgstAmt = it.cgst_amount !== undefined ? Number(it.cgst_amount) : (taxable * halfRate) / 100;
      const sgstAmt = it.sgst_amount !== undefined ? Number(it.sgst_amount) : (taxable * halfRate) / 100;
      taxCells = `
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${halfRate}%</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-family: monospace;">${cgstAmt.toFixed(2)}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${halfRate}%</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-family: monospace;">${sgstAmt.toFixed(2)}</td>
      `;
    }

    return `
      <tr>
        <td style="border: 1px solid #000; padding: 4px; text-align: center;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 4px;">
          <div style="font-weight: 700; color: #000;">${itemName}</div>
          ${desc ? `<div style="font-size: 8.5px; color: #444; margin-top: 1px;">${desc}</div>` : ""}
        </td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center; font-family: monospace;">${hsn}</td>
        <td style="border: 1px solid #000; padding: 4px; text-align: center; font-family: monospace;">
          ${qty}<br/><span style="font-size: 8px;">${unit}</span>
        </td>
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-family: monospace;">${rate.toFixed(2)}</td>
        ${taxCells}
        <td style="border: 1px solid #000; padding: 4px; text-align: right; font-family: monospace; font-weight: 700;">${taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  }).join("");

  const subtotal = Number(data.subtotal) || 0;
  const tax = Number(data.tax) || 0;
  const roundOff = Number(data.round_off) || 0;
  const shippingCharge = Number(data.shipping_charge) || 0;
  const total = Number(data.total) || (subtotal + tax + shippingCharge + roundOff);

  const amountInWords = indianNumberToWords(total);
  const notes = escapeHtml(data.custom_notes || "Looking forward for your business.");
  const termsText = escapeHtml(
    data.terms_and_conditions || data.seller?.invoice_terms || "Payment : 100% Advance"
  );

  // Bank Details
  const bankName = escapeHtml(data.seller?.bank_name || "");
  const bankAccountName = escapeHtml(data.seller?.bank_account_name || sellerLegal);
  const bankAccountNumber = escapeHtml(data.seller?.bank_account_number || "");
  const bankIfsc = escapeHtml(data.seller?.bank_ifsc_code || "");
  const bankBranch = escapeHtml(data.seller?.bank_branch || "");
  const bankUpi = escapeHtml(data.seller?.bank_upi_id || "");

  const hasBankDetails = Boolean(bankAccountNumber || bankName || bankIfsc || bankUpi);

  // Tax breakdown lines for totals
  let taxRows = "";
  if (isInterstate) {
    taxRows = `
      <tr>
        <td style="padding: 3px 8px; border-bottom: 1px solid #000;">IGST</td>
        <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${tax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  } else {
    const halfTax = tax / 2;
    taxRows = `
      <tr>
        <td style="padding: 3px 8px; border-bottom: 1px solid #000;">CGST</td>
        <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${halfTax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td style="padding: 3px 8px; border-bottom: 1px solid #000;">SGST</td>
        <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${halfTax.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  }

  // Address lines formatted
  const sellerCityStatePin = [sellerCity, sellerPin ? `- ${sellerPin}` : "", sellerState].filter(Boolean).join(" ");

  const customerCityStatePin = [
    customerCity,
    customerPin,
    customerState,
  ].filter(Boolean).join(" ");

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
            color: #000000;
            background: #ffffff;
            font-size: 10px;
            line-height: 1.35;
          }
          .invoice-box {
            width: 190mm;
            margin: 0 auto;
            border: 1px solid #000;
            box-sizing: border-box;
            background: #fff;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          .bold { font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <!-- Company Name Centered on Top -->
          <div style="text-align: center; padding-top: 6px; padding-bottom: 3px;">
            <div style="font-weight: 700; font-size: 13.5px;">${sellerLegal}</div>
            ${showTagline && tagline ? `<div style="font-size: 8.5px; font-style: italic; color: #333; margin-top: 1px;">${tagline}</div>` : ""}
          </div>

          <!-- Header Two-Column: Logo & Address Left | Document Title Right -->
          <table style="width: 100%; border-bottom: 1px solid #000;">
            ${showLogo && logoUrl && logoPosition === "right" ? `
              <tr>
                <td style="width: 58%; vertical-align: middle; padding: 2px 8px 6px 8px;">
                  <div style="font-size: 8.5px; line-height: 1.25;">
                    ${showAddress && sellerAddress ? `<div>${sellerAddress}</div>` : ""}
                    ${showAddress && sellerCityStatePin ? `<div>${sellerCityStatePin}</div>` : ""}
                    ${showGstin && sellerGstin ? `<div style="margin-top: 1px;">GSTIN: <strong>${sellerGstin}</strong></div>` : ""}
                    ${showContact && sellerContactLine ? `<div style="margin-top: 1px; color: #333;">${sellerContactLine}</div>` : ""}
                  </div>
                </td>
                <td style="width: 42%; vertical-align: middle; text-align: right; padding: 2px 10px 6px 8px;">
                  <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                    <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">${docHeading}</div>
                    <img src="${logoUrl}" style="max-height: 44px; max-width: 100px; object-fit: contain;" alt="Logo" />
                  </div>
                </td>
              </tr>
            ` : showLogo && logoUrl && logoPosition === "center" ? `
              <tr>
                <td style="width: 42%; vertical-align: middle; padding: 2px 8px 6px 8px;">
                  <div style="font-size: 8.5px; line-height: 1.25;">
                    ${showAddress && sellerAddress ? `<div>${sellerAddress}</div>` : ""}
                    ${showAddress && sellerCityStatePin ? `<div>${sellerCityStatePin}</div>` : ""}
                    ${showGstin && sellerGstin ? `<div style="margin-top: 1px;">GSTIN: <strong>${sellerGstin}</strong></div>` : ""}
                    ${showContact && sellerContactLine ? `<div style="margin-top: 1px; color: #333;">${sellerContactLine}</div>` : ""}
                  </div>
                </td>
                <td style="width: 26%; vertical-align: middle; text-align: center; padding: 2px 4px 6px 4px;">
                  <img src="${logoUrl}" style="max-height: 44px; max-width: 100px; object-fit: contain;" alt="Logo" />
                </td>
                <td style="width: 32%; vertical-align: middle; text-align: right; padding: 2px 10px 6px 8px;">
                  <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">${docHeading}</div>
                </td>
              </tr>
            ` : showLogo && logoUrl ? `
              <tr>
                <td style="width: 62%; vertical-align: middle; padding: 2px 8px 6px 8px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${logoUrl}" style="max-height: 44px; max-width: 120px; object-fit: contain;" alt="Logo" />
                    <div style="font-size: 8.5px; line-height: 1.25;">
                      ${showAddress && sellerAddress ? `<div>${sellerAddress}</div>` : ""}
                      ${showAddress && sellerCityStatePin ? `<div>${sellerCityStatePin}</div>` : ""}
                      ${showGstin && sellerGstin ? `<div style="margin-top: 1px;">GSTIN: <strong>${sellerGstin}</strong></div>` : ""}
                      ${showContact && sellerContactLine ? `<div style="margin-top: 1px; color: #333;">${sellerContactLine}</div>` : ""}
                    </div>
                  </div>
                </td>
                <td style="width: 38%; vertical-align: middle; text-align: right; padding: 2px 10px 6px 8px;">
                  <div style="font-size: 21px; font-weight: 800; letter-spacing: 0.5px;">${docHeading}</div>
                </td>
              </tr>
            ` : `
              <tr>
                <td style="width: 65%; vertical-align: middle; padding: 4px 8px 6px 8px;">
                  <div style="font-size: 8.5px; line-height: 1.25;">
                    ${showAddress && sellerAddress ? `<div>${sellerAddress}</div>` : ""}
                    ${showAddress && sellerCityStatePin ? `<div>${sellerCityStatePin}</div>` : ""}
                    ${showGstin && sellerGstin ? `<div style="margin-top: 1px;">GSTIN: <strong>${sellerGstin}</strong></div>` : ""}
                    ${showContact && sellerContactLine ? `<div style="margin-top: 1px; color: #333;">${sellerContactLine}</div>` : ""}
                  </div>
                </td>
                <td style="width: 35%; vertical-align: middle; text-align: right; padding: 4px 10px 6px 8px;">
                  <div style="font-size: 21px; font-weight: 800; letter-spacing: 0.5px;">${docHeading}</div>
                </td>
              </tr>
            `}
          </table>

          <!-- Invoice Information (2 Columns with inner border) -->
          <table style="width: 100%; border-bottom: 1px solid #000;">
            <tr>
              <td style="width: 50%; vertical-align: top; padding: 4px 8px; border-right: 1px solid #000;">
                <table style="width: 100%; font-size: 9.5px;">
                  <tr><td style="width: 80px; color: #000;">#</td><td>: <strong>${invoiceNumber}</strong></td></tr>
                  <tr><td>Invoice Date</td><td>: ${dateStr}</td></tr>
                  <tr><td>Terms</td><td>: ${paymentTerms}</td></tr>
                  <tr><td>Due Date</td><td>: ${dueDateStr}</td></tr>
                </table>
              </td>
              <td style="width: 50%; vertical-align: top; padding: 4px 8px;">
                <table style="width: 100%; font-size: 9.5px;">
                  <tr><td style="width: 105px;">Place Of Supply</td><td>: <strong>${placeOfSupply}</strong></td></tr>
                  <tr><td>Reverse Charge</td><td>: ${reverseCharge}</td></tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Bill To / Ship To Grid (Conditional) -->
          ${(showBillTo || showShipTo) ? `
            <table style="width: 100%; border-bottom: 1px solid #000;">
              <tr>
                ${showBillTo ? `
                  <td style="width: ${showShipTo ? "50%" : "100%"}; vertical-align: top; padding: 5px 8px; ${showShipTo ? "border-right: 1px solid #000;" : ""}">
                    <div style="font-weight: 700; font-size: 10px; margin-bottom: 2px;">Bill To</div>
                    <div style="font-weight: 700; font-size: 11px;">${customerName}</div>
                    ${customerAddress ? `<div>${customerAddress}</div>` : ""}
                    ${customerCityStatePin ? `<div>${customerCityStatePin}</div>` : ""}
                    <div>India</div>
                    ${customerGstin ? `<div style="margin-top: 1px;">GSTIN <strong>${customerGstin}</strong></div>` : (customerPhone ? `<div>Contact: ${customerPhone}</div>` : "")}
                  </td>
                ` : ""}
                ${showShipTo ? `
                  <td style="width: ${showBillTo ? "50%" : "100%"}; vertical-align: top; padding: 5px 8px;">
                    <div style="font-weight: 700; font-size: 10px; margin-bottom: 2px;">Ship To</div>
                    <div style="font-weight: 700; font-size: 11px;">${customerName}</div>
                    ${customerAddress ? `<div>${customerAddress}</div>` : ""}
                    ${customerCityStatePin ? `<div>${customerCityStatePin}</div>` : ""}
                    <div>India</div>
                  </td>
                ` : ""}
              </tr>
            </table>
          ` : ""}

          <!-- Structured Item Description Table -->
          <table style="width: 100%; border-bottom: 1px solid #000; font-size: 9px;">
            <thead>
              ${isInterstate ? `
                <tr style="background: #fff;">
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 2px; text-align: center; width: 24px;">#</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 6px; text-align: left;">Item & Description</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: center; width: 65px;">HSN/SAC</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: center; width: 45px;">Qty</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 60px;">Rate</th>
                  <th colspan="2" style="border: 1px solid #000; padding: 2px 4px; text-align: center;">IGST</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 6px; text-align: right; width: 75px;">Amount</th>
                </tr>
                <tr style="background: #fff;">
                  <th style="border: 1px solid #000; padding: 2px; text-align: center; width: 35px;">%</th>
                  <th style="border: 1px solid #000; padding: 2px; text-align: right; width: 55px;">Amt</th>
                </tr>
              ` : `
                <tr style="background: #fff;">
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 2px; text-align: center; width: 24px;">#</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 6px; text-align: left;">Item & Description</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: center; width: 60px;">HSN/SAC</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: center; width: 45px;">Qty</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 55px;">Rate</th>
                  <th colspan="2" style="border: 1px solid #000; padding: 2px 4px; text-align: center;">CGST</th>
                  <th colspan="2" style="border: 1px solid #000; padding: 2px 4px; text-align: center;">SGST</th>
                  <th rowspan="2" style="border: 1px solid #000; padding: 4px 6px; text-align: right; width: 70px;">Amount</th>
                </tr>
                <tr style="background: #fff;">
                  <th style="border: 1px solid #000; padding: 2px; text-align: center; width: 26px;">%</th>
                  <th style="border: 1px solid #000; padding: 2px; text-align: right; width: 45px;">Amt</th>
                  <th style="border: 1px solid #000; padding: 2px; text-align: center; width: 26px;">%</th>
                  <th style="border: 1px solid #000; padding: 2px; text-align: right; width: 45px;">Amt</th>
                </tr>
              `}
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <!-- Bottom Section: Left Notes/Bank & Right Totals/Signature -->
          <table style="width: 100%;">
            <tr>
              <td style="width: 58%; vertical-align: top; padding: 6px 8px; border-right: 1px solid #000;">
                <div style="font-size: 9px; margin-bottom: 5px;">
                  Items in Total <strong>${totalItemsCount}</strong>
                </div>

                ${showWords ? `
                  <div style="font-size: 8.5px; color: #333; margin-top: 4px;">Total In Words</div>
                  <div style="font-size: 9.5px; font-weight: 700; font-style: italic; margin-bottom: 6px;">
                    ${amountInWords}
                  </div>
                ` : ""}

                ${showNotes ? `
                  <div style="font-size: 8.5px; color: #333; margin-top: 4px;">Notes</div>
                  <div style="font-size: 8.5px; margin-bottom: 6px;">${notes}</div>
                ` : ""}

                ${showTerms ? `
                  <div style="font-size: 8.5px; color: #333; margin-top: 4px;">Terms & Conditions</div>
                  <div style="font-size: 8.5px; margin-bottom: 8px;">${termsText}</div>
                ` : ""}

                ${showBank && hasBankDetails ? `
                  <div style="font-size: 8.5px; margin-top: 6px; line-height: 1.3;">
                    <div style="font-weight: 700; margin-bottom: 2px;">Bank Details:</div>
                    ${bankAccountName ? `<div>Bank Account Name : ${bankAccountName}</div>` : ""}
                    ${bankAccountNumber ? `<div>Bank Account Number: ${bankAccountNumber}</div>` : ""}
                    ${bankIfsc ? `<div>IFS Code: ${bankIfsc}</div>` : ""}
                    ${bankName ? `<div>Bank Name : ${bankName}</div>` : ""}
                    ${bankBranch ? `<div>Branch Address: ${bankBranch}</div>` : ""}
                    ${bankUpi ? `<div>UPI ID: ${bankUpi}</div>` : ""}
                  </div>
                ` : ""}
              </td>

              <td style="width: 42%; vertical-align: top; padding: 0;">
                <table style="width: 100%; font-size: 9.5px;">
                  <tr>
                    <td style="padding: 3px 8px; border-bottom: 1px solid #000;">Sub Total</td>
                    <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                  ${taxRows}
                  ${shippingCharge > 0 ? `
                    <tr>
                      <td style="padding: 3px 8px; border-bottom: 1px solid #000;">Shipping charge</td>
                      <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${shippingCharge.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ` : ""}
                  ${roundOff !== 0 ? `
                    <tr>
                      <td style="padding: 3px 8px; border-bottom: 1px solid #000;">Balance Amount</td>
                      <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #000; font-family: monospace;">${roundOff < 0 ? `(-) ${Math.abs(roundOff).toFixed(2)}` : roundOff.toFixed(2)}</td>
                    </tr>
                  ` : ""}
                  <tr>
                    <td style="padding: 5px 8px; border-bottom: 1px solid #000; font-weight: 700; font-size: 10.5px;">Total</td>
                    <td style="padding: 5px 8px; text-align: right; border-bottom: 1px solid #000; font-weight: 800; font-size: 12px; font-family: monospace;">${formatINR(total)}</td>
                  </tr>
                </table>

                ${showSignature ? `
                  <!-- Authorized Signature Box -->
                  <div style="padding: 6px 8px; min-height: 95px; display: flex; flex-direction: column; justify-content: space-between; text-align: center;">
                    <div style="font-weight: 700; font-size: 9.5px;">${sellerLegal}</div>
                    <div style="height: 40px; display: flex; align-items: center; justify-content: center;">
                      ${data.seller?.signature_url ? `<img src="${data.seller.signature_url}" style="max-height: 38px; max-width: 120px; object-fit: contain;" alt="Signature" />` : ""}
                    </div>
                    <div style="font-size: 9px; font-weight: 600;">${signatoryTitle}</div>
                  </div>
                ` : ""}
              </td>
            </tr>
          </table>
        </div>

        <!-- Page Number at bottom right outside border (if enabled) -->
        ${showPageNumber ? `
          <div style="width: 190mm; margin: 2mm auto 0 auto; text-align: right; font-size: 8px; color: #000;">
            1
          </div>
        ` : ""}
      </body>
    </html>
  `;

  printViaIsolatedIframe(html);
}

export function sanitizePdfFilename(invoiceNumber: string, formatType: "a4" | "thermal" = "a4"): string {
  const safeBase =
    String(invoiceNumber || "invoice")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^[._]+|[._]+$/g, "") || "invoice";
  return `${safeBase}_${formatType}.pdf`;
}

async function hasPdfSignature(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 5) return false;
  const headerBuffer = await blob.slice(0, 5).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);
  // %PDF-
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * Fetch genuine binary PDF from authenticated Django endpoint.
 */
export async function fetchInvoicePdfBlob(
  invoiceId: string,
  formatType: "a4" | "thermal" = "a4",
  mode: "download" | "raw" = "download"
): Promise<Blob> {
  try {
    const res = await api.get<Blob>(`/invoices/${invoiceId}/pdf/`, {
      params: {
        [mode === "download" ? "download" : "raw"]: "true",
        format_type: formatType,
      },
      responseType: "blob",
    });

    const rawBlob = res.data;
    if (!(await hasPdfSignature(rawBlob))) {
      let backendError = "The server did not return a valid PDF document.";
      try {
        const text = await rawBlob.text();
        const parsed = JSON.parse(text);
        if (parsed?.error || parsed?.detail) {
          backendError = parsed.error || parsed.detail;
        }
      } catch {
        // Response was not JSON
      }
      throw new Error(backendError);
    }

    return new Blob([rawBlob], { type: "application/pdf" });
  } catch (err: any) {
    if (err?.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        if (parsed?.error || parsed?.detail) {
          throw new Error(parsed.error || parsed.detail);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message && !(inner instanceof SyntaxError)) {
          throw inner;
        }
      }
    }
    if (err instanceof Error && !("response" in err)) {
      throw err;
    }
    throw new Error(parseApiError(err, "Failed to retrieve invoice PDF."));
  }
}

/**
 * 3. Stream or Open Pure ReportLab Binary PDF
 */
export async function streamInvoicePdf(invoiceId: string, formatType: "a4" | "thermal" = "a4") {
  // Open blank tab synchronously inside the click handler so popup blockers do not block after await
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup was blocked by your browser. Please allow popups for this site to view the PDF invoice.");
    return;
  }

  try {
    win.document.title = "Loading Invoice PDF...";
    if (win.document.body) {
      win.document.body.innerHTML =
        '<div style="font-family:system-ui,sans-serif;padding:24px;color:#334155;font-size:14px;">Preparing invoice PDF...</div>';
    }
  } catch {
    // Ignore cross-window DOM write issues
  }

  try {
    const pdfBlob = await fetchInvoicePdfBlob(invoiceId, formatType, "raw");
    const blobUrl = window.URL.createObjectURL(pdfBlob);
    win.location.replace(blobUrl);
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 60_000);
  } catch (err) {
    try {
      win.close();
    } catch {
      // Ignore close failure
    }
    throw err;
  }
}

/**
 * 4. Download Pure ReportLab Binary PDF
 */
export async function downloadInvoicePdf(
  invoiceId: string,
  invoiceNumber: string,
  formatType: "a4" | "thermal" = "a4"
) {
  const pdfBlob = await fetchInvoicePdfBlob(invoiceId, formatType, "download");
  const blobUrl = window.URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = sanitizePdfFilename(invoiceNumber, formatType);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 1500);
}
