"use client";

import React from "react";
import { BusinessConfig } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText, CheckCircle2 } from "lucide-react";

interface A4InvoiceLivePreviewProps {
  config: Partial<BusinessConfig>;
  logoPreview?: string | null;
  signaturePreview?: string | null;
}

export function A4InvoiceLivePreview({
  config,
  logoPreview,
  signaturePreview,
}: A4InvoiceLivePreviewProps) {
  const elements = config.invoice_elements || {
    show_logo: true,
    show_address: true,
    show_gstin: true,
    show_contact_details: true,
    show_phone: true,
    show_email: true,
    show_website: false,
    show_tagline: false,
    show_bill_to: true,
    show_ship_to: true,
    show_bank_details: true,
    show_terms: true,
    show_notes: true,
    show_amount_in_words: true,
    show_authorized_signature: true,
    show_page_number: true,
  };

  const businessName =
    config.business_name || config.legal_name || config.trade_name || "Zoom Renewables Pvt. Ltd.";
  const legalName = config.legal_name || businessName;
  const tagline = config.tagline || "";
  const logoUrl = logoPreview || config.logo_url || config.logo || null;
  const signatureUrl =
    signaturePreview || config.signature_url || config.signature_image || null;

  const logoPosition = config.logo_position || "left";
  const gstTitle = config.gst_invoice_title || "TAX INVOICE";
  const regularTitle = config.regular_invoice_title || "INVOICE";
  const isGst = Boolean(config.gst_enabled ?? true);
  const docTitle = isGst ? gstTitle : regularTitle;

  const addressLine1 = config.address_line1 || config.address || "Zoom, U-62 MIDC, Hingna";
  const addressLine2 = config.address_line2 || "";
  const city = config.city || "Nagpur";
  const district = config.district || "";
  const state = config.state || "Maharashtra";
  const pincode = config.pincode || config.postal_code || "440016";
  const gstin = config.gstin || "27AABCZ1569R1ZH";
  const stateCode = config.state_code || "27";

  const phone = config.phone || "+91 98765 43210";
  const altPhone = config.alternate_phone || "";
  const email = config.email || "billing@company.com";
  const website = config.website || "www.company.com";

  const bankName = config.bank_name || "ICICI Bank";
  const bankAccountName = config.bank_account_name || legalName;
  const bankAccountNumber = config.bank_account_number || "178705500909";
  const bankIfscCode = config.bank_ifsc_code || "ICIC0001787";
  const bankBranch = config.bank_branch || "Chhatrapati Nagar, Nagpur";
  const bankUpiId = config.bank_upi_id || "zoomrenewables@icici";

  const notes = config.default_invoice_notes || "Looking forward for your business.";
  const terms =
    config.invoice_terms_and_conditions ||
    "Payment : 100% Advance. Goods once sold will not be taken back.";
  const signatoryTitle = config.authorized_signatory_name || "Authorized Signature";

  // Sample items
  const sampleItems = [
    {
      num: 1,
      name: "LDPE Pipe 16MM",
      desc: "ISI standard high density drip irrigation pipe",
      hsn: "39011090",
      qty: 100,
      unit: "MTR",
      rate: 15.0,
      cgstRate: 9,
      cgstAmt: 135.0,
      sgstRate: 9,
      sgstAmt: 135.0,
      amount: 1500.0,
    },
  ];

  const subTotal = 1500.0;
  const cgstTotal = 135.0;
  const sgstTotal = 135.0;
  const shippingCharge = 170.0;
  const roundOff = -0.4;
  const grandTotal = 1939.6;

  return (
    <div className="w-full">
      {/* Header bar of the preview */}
      <div className="flex items-center justify-between bg-slate-900 text-white px-3 py-2 rounded-t-lg text-xs font-semibold">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-emerald-400" />
          <span>Live A4 Invoice Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
            Real-Time Simulation
          </Badge>
          <span className="text-[10px] text-slate-400">A4 Portrait (210×297mm)</span>
        </div>
      </div>

      {/* Outer Paper Container */}
      <div className="border border-slate-300 border-t-0 rounded-b-lg bg-slate-100 p-2 sm:p-4 overflow-x-auto shadow-inner">
        {/* Actual A4 invoice sheet */}
        <div
          className="mx-auto bg-white border border-black text-black shadow-lg font-sans text-xs selection:bg-slate-200"
          style={{ width: "100%", maxWidth: "620px", minHeight: "842px", padding: "16px" }}
        >
          {/* Centered Business Legal Heading */}
          <div className="text-center mb-1">
            <h1 className="font-bold text-sm tracking-tight text-black">{businessName}</h1>
            {(elements.show_tagline ?? false) && tagline && (
              <p className="text-[9.5px] italic text-slate-700">{tagline}</p>
            )}
          </div>

          {/* Header Layout based on logoPosition */}
          <div className="flex justify-between items-start border-b border-black pb-2 px-1">
            {logoPosition === "right" ? (
              <>
                {/* Left: Address & Contacts */}
                <div className="text-[9px] leading-tight text-black flex-1 pr-2">
                  {(elements.show_address ?? true) && (
                    <>
                      <div>{addressLine1}</div>
                      {addressLine2 && <div>{addressLine2}</div>}
                      <div>
                        {[city, district, pincode ? `- ${pincode}` : "", state].filter(Boolean).join(" ")}
                      </div>
                    </>
                  )}
                  {(elements.show_gstin ?? true) && gstin && (
                    <div className="font-semibold mt-0.5">
                      GSTIN: <span className="font-mono">{gstin}</span>
                    </div>
                  )}
                  {(elements.show_contact_details ?? true) && (
                    <div className="text-[8.5px] text-slate-700 mt-0.5">
                      {[
                        (elements.show_phone ?? true) && phone ? `Phone: ${phone}` : "",
                        (elements.show_email ?? true) && email ? `Email: ${email}` : "",
                        (elements.show_website ?? false) && website ? `Web: ${website}` : "",
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </div>
                  )}
                </div>

                {/* Right: TAX INVOICE & Logo */}
                <div className="flex items-center gap-2 text-right">
                  <div className="text-lg font-extrabold tracking-wider text-black uppercase">
                    {docTitle}
                  </div>
                  {(elements.show_logo ?? true) && logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="max-h-11 max-w-[90px] object-contain"
                    />
                  )}
                </div>
              </>
            ) : logoPosition === "center" ? (
              <div className="w-full flex flex-col items-center text-center">
                {(elements.show_logo ?? true) && logoUrl && (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="max-h-12 max-w-[120px] object-contain mb-1"
                  />
                )}
                {(elements.show_address ?? true) && (
                  <div className="text-[9px] leading-tight text-black">
                    <div>{addressLine1} {addressLine2}</div>
                    <div>{[city, pincode ? `- ${pincode}` : "", state].filter(Boolean).join(" ")}</div>
                  </div>
                )}
                {(elements.show_gstin ?? true) && gstin && (
                  <div className="text-[9px] font-semibold mt-0.5">
                    GSTIN: <span className="font-mono">{gstin}</span>
                  </div>
                )}
                <div className="text-lg font-extrabold tracking-wider text-black uppercase mt-1">
                  {docTitle}
                </div>
              </div>
            ) : (
              /* Default Left Logo */
              <>
                <div className="flex items-center gap-2.5 flex-1">
                  {(elements.show_logo ?? true) && logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="max-h-11 max-w-[90px] object-contain"
                    />
                  )}
                  <div className="text-[9px] leading-tight text-black">
                    {(elements.show_address ?? true) && (
                      <>
                        <div>{addressLine1}</div>
                        {addressLine2 && <div>{addressLine2}</div>}
                        <div>
                          {[city, district, pincode ? `- ${pincode}` : "", state].filter(Boolean).join(" ")}
                        </div>
                      </>
                    )}
                    {(elements.show_gstin ?? true) && gstin && (
                      <div className="font-semibold mt-0.5">
                        GSTIN: <span className="font-mono">{gstin}</span>
                      </div>
                    )}
                    {(elements.show_contact_details ?? true) && (
                      <div className="text-[8.5px] text-slate-700 mt-0.5">
                        {[
                          (elements.show_phone ?? true) && phone ? `Phone: ${phone}` : "",
                          (elements.show_email ?? true) && email ? `Email: ${email}` : "",
                          (elements.show_website ?? false) && website ? `Web: ${website}` : "",
                        ]
                          .filter(Boolean)
                          .join(" | ")}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-extrabold tracking-wider text-black uppercase">
                    {docTitle}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Invoice Information: 2 Columns */}
          <div className="grid grid-cols-2 border-b border-black text-[9px]">
            <div className="p-1.5 border-r border-black space-y-0.5">
              <div className="flex">
                <span className="w-20 text-black">#</span>
                <span>: <strong className="font-mono">INV-01920</strong></span>
              </div>
              <div className="flex">
                <span className="w-20 text-black">Invoice Date</span>
                <span>: 03/11/2026</span>
              </div>
              <div className="flex">
                <span className="w-20 text-black">Terms</span>
                <span>: Due on Receipt</span>
              </div>
              <div className="flex">
                <span className="w-20 text-black">Due Date</span>
                <span>: 03/11/2026</span>
              </div>
            </div>
            <div className="p-1.5 space-y-0.5">
              <div className="flex">
                <span className="w-24 text-black">Place Of Supply</span>
                <span>: <strong>{state} ({stateCode})</strong></span>
              </div>
              <div className="flex">
                <span className="w-24 text-black">Reverse Charge</span>
                <span>: No</span>
              </div>
            </div>
          </div>

          {/* Bill To / Ship To */}
          {((elements.show_bill_to ?? true) || (elements.show_ship_to ?? true)) && (
            <div
              className={`grid ${(elements.show_bill_to ?? true) && (elements.show_ship_to ?? true) ? "grid-cols-2" : "grid-cols-1"} border-b border-black text-[9px]`}
            >
              {(elements.show_bill_to ?? true) && (
                <div
                  className={`p-1.5 ${(elements.show_ship_to ?? true) ? "border-r border-black" : ""} leading-snug`}
                >
                  <div className="font-bold text-[9.5px] uppercase text-black mb-0.5">Bill To</div>
                  <div className="font-bold text-black">DPRAMP-TECH SOLUTIONS LLP</div>
                  <div>Plot No. EWS-38, V H B Colony Nandanvan Layout</div>
                  <div>Near Nandanvan Police station, Nandanvan Layout</div>
                  <div>Nagpur 440024 Maharashtra</div>
                  <div>India</div>
                  <div className="mt-0.5 font-semibold">
                    GSTIN: <span className="font-mono">27AAXFD2138D1ZD</span>
                  </div>
                </div>
              )}

              {(elements.show_ship_to ?? true) && (
                <div className="p-1.5 leading-snug">
                  <div className="font-bold text-[9.5px] uppercase text-black mb-0.5">Ship To</div>
                  <div className="font-bold text-black">DPRAMP-TECH SOLUTIONS LLP</div>
                  <div>Plot No. EWS-38, V H B Colony Nandanvan Layout</div>
                  <div>Near Nandanvan Police station, Nandanvan Layout</div>
                  <div>Nagpur 440024 Maharashtra</div>
                  <div>India</div>
                </div>
              )}
            </div>
          )}

          {/* Line Items Table */}
          <div className="w-full">
            <table className="w-full text-left text-[8.5px] border-collapse border-b border-black">
              <thead>
                <tr className="bg-slate-50 text-black">
                  <th rowSpan={2} className="border border-black p-1 text-center w-5">#</th>
                  <th rowSpan={2} className="border border-black p-1">Item & Description</th>
                  <th rowSpan={2} className="border border-black p-1 text-center w-12">HSN/SAC</th>
                  <th rowSpan={2} className="border border-black p-1 text-center w-9">Qty</th>
                  <th rowSpan={2} className="border border-black p-1 text-right w-11">Rate</th>
                  <th colSpan={2} className="border border-black p-0.5 text-center">CGST</th>
                  <th colSpan={2} className="border border-black p-0.5 text-center">SGST</th>
                  <th rowSpan={2} className="border border-black p-1 text-right w-14">Amount</th>
                </tr>
                <tr className="bg-slate-50 text-black text-[7.5px]">
                  <th className="border border-black p-0.5 text-center w-5">%</th>
                  <th className="border border-black p-0.5 text-right w-9">Amt</th>
                  <th className="border border-black p-0.5 text-center w-5">%</th>
                  <th className="border border-black p-0.5 text-right w-9">Amt</th>
                </tr>
              </thead>
              <tbody>
                {sampleItems.map((it) => (
                  <tr key={it.num} className="border-t border-black">
                    <td className="border border-black p-1 text-center font-mono">{it.num}</td>
                    <td className="border border-black p-1">
                      <div className="font-bold text-black">{it.name}</div>
                      <div className="text-[7.5px] text-slate-600">{it.desc}</div>
                    </td>
                    <td className="border border-black p-1 text-center font-mono">{it.hsn}</td>
                    <td className="border border-black p-1 text-center font-mono">
                      {it.qty}<br /><span className="text-[7px] uppercase">{it.unit}</span>
                    </td>
                    <td className="border border-black p-1 text-right font-mono">{it.rate.toFixed(2)}</td>
                    <td className="border border-black p-0.5 text-center font-mono">{it.cgstRate}%</td>
                    <td className="border border-black p-0.5 text-right font-mono">{it.cgstAmt.toFixed(2)}</td>
                    <td className="border border-black p-0.5 text-center font-mono">{it.sgstRate}%</td>
                    <td className="border border-black p-0.5 text-right font-mono">{it.sgstAmt.toFixed(2)}</td>
                    <td className="border border-black p-1 text-right font-mono font-bold">
                      {it.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Summary: Left Notes & Bank | Right Financials & Signature */}
          <div className="grid grid-cols-12 text-[8.5px]">
            <div className="col-span-7 p-1.5 border-r border-black space-y-1.5">
              <div>
                Items in Total <strong>100</strong>
              </div>

              {(elements.show_amount_in_words ?? true) && (
                <div>
                  <div className="text-[8px] text-slate-600">Total In Words</div>
                  <div className="font-bold italic text-black text-[9px]">
                    Rupees One Thousand Nine Hundred Thirty-Nine and Sixty Paise Only
                  </div>
                </div>
              )}

              {(elements.show_notes ?? true) && notes && (
                <div>
                  <div className="text-[8px] text-slate-600">Notes</div>
                  <div className="text-black">{notes}</div>
                </div>
              )}

              {(elements.show_terms ?? true) && terms && (
                <div>
                  <div className="text-[8px] text-slate-600">Terms & Conditions</div>
                  <div className="text-black">{terms}</div>
                </div>
              )}

              {(elements.show_bank_details ?? true) && (
                <div className="pt-1 border-t border-dotted border-black/40 text-[8px] space-y-0.5">
                  <div className="font-bold text-black">Bank Details:</div>
                  <div>Bank Account Name : {bankAccountName}</div>
                  <div>
                    Bank Account Number: <span className="font-mono">{bankAccountNumber}</span>
                  </div>
                  <div>
                    IFS Code: <span className="font-mono font-semibold">{bankIfscCode}</span>
                  </div>
                  <div>Bank Name : {bankName}</div>
                  {bankBranch && <div>Branch Address: {bankBranch}</div>}
                  {bankUpiId && <div>UPI ID: <span className="font-mono">{bankUpiId}</span></div>}
                </div>
              )}
            </div>

            <div className="col-span-5 flex flex-col justify-between">
              <table className="w-full text-[8.5px] border-collapse">
                <tbody>
                  <tr className="border-b border-black">
                    <td className="p-1 px-1.5 text-black">Sub Total</td>
                    <td className="p-1 px-1.5 text-right font-mono">
                      {subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 px-1.5 text-black">CGST9 (9%)</td>
                    <td className="p-1 px-1.5 text-right font-mono">
                      {cgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 px-1.5 text-black">SGST9 (9%)</td>
                    <td className="p-1 px-1.5 text-right font-mono">
                      {sgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 px-1.5 text-black">Shipping charge</td>
                    <td className="p-1 px-1.5 text-right font-mono">
                      {shippingCharge.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 px-1.5 text-black">Balance Amount</td>
                    <td className="p-1 px-1.5 text-right font-mono">
                      (-) {Math.abs(roundOff).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-black font-bold">
                    <td className="p-1 px-1.5 text-black text-[9px]">Total</td>
                    <td className="p-1 px-1.5 text-right font-mono text-[10px] font-extrabold text-black">
                      ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>

              {(elements.show_authorized_signature ?? true) && (
                <div className="p-2 text-center flex flex-col justify-between h-20">
                  <div className="font-bold text-[8.5px] text-black">{legalName}</div>
                  <div className="flex-1 flex items-center justify-center">
                    {signatureUrl ? (
                      <img
                        src={signatureUrl}
                        alt="Signature"
                        className="max-h-7 max-w-[90px] object-contain"
                      />
                    ) : (
                      <div className="h-5" />
                    )}
                  </div>
                  <div className="font-semibold text-[8px] text-black border-t border-dashed border-black/40 pt-0.5">
                    {signatoryTitle}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Page Number */}
          {(elements.show_page_number ?? true) && (
            <div className="text-right text-[7.5px] text-slate-500 pt-1 pr-1">1</div>
          )}
        </div>
      </div>
    </div>
  );
}
