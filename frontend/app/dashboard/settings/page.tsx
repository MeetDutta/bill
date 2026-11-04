"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { whatsappApi, posApi } from "@/services/api";
import { parseApiError } from "@/lib/utils";
import {
  Building2,
  Key,
  CheckCircle,
  Save,
  Landmark,
  Printer,
  ShieldCheck,
  MessageSquare,
  FileText,
  Upload,
  Trash2,
  RotateCcw,
  Image as ImageIcon,
  Check,
  Sparkles,
  Sliders,
  PenTool,
  CreditCard,
  ScrollText,
  HelpCircle,
} from "lucide-react";
import { BusinessConfig, BusinessTypeSchema, InvoiceElementsConfig } from "@/types";
import { A4InvoiceLivePreview } from "@/components/settings/A4InvoiceLivePreview";

type SettingsTab = "branding" | "profile" | "tax" | "pos" | "whatsapp" | "integrations";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("branding");
  const [loading, setLoading] = useState(true);
  const [savingPos, setSavingPos] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [hasSavedWhatsAppToken, setHasSavedWhatsAppToken] = useState(false);
  const [whatsappTest, setWhatsappTest] = useState<{
    connected: boolean;
    checked_at: string;
    message: string;
    phone_number?: string;
    verified_name?: string;
  } | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [businessTypes, setBusinessTypes] = useState<Record<string, BusinessTypeSchema>>({});

  // Form state
  const [posData, setPosData] = useState<Partial<BusinessConfig>>({
    business_type: "RETAIL",
    trade_name: "Zoom Renewables Pvt. Ltd.",
    business_name: "Zoom Renewables Pvt. Ltd.",
    legal_name: "Zoom Renewables Pvt. Ltd.",
    tagline: "",
    gstin: "27AABCZ1569R1ZH",
    pan_number: "",
    state_code: "27",
    gst_registration_type: "Regular",
    address_line1: "Zoom, U-62 MIDC, Hingna",
    address_line2: "",
    city: "Nagpur",
    district: "",
    state: "Maharashtra",
    postal_code: "440016",
    pincode: "440016",
    country: "India",
    phone: "+91 98765 43210",
    alternate_phone: "",
    email: "billing@zoomrenewables.com",
    website: "www.zoomrenewables.com",
    gst_enabled: true,
    tax_mode: "exclusive",
    default_tax_rate: 18,
    paper_size: "A4",
    invoice_template: "classic_gst",
    logo_position: "left",
    gst_invoice_title: "TAX INVOICE",
    regular_invoice_title: "INVOICE",
    default_invoice_format: "a4",
    invoice_prefix: "INV",
    default_invoice_notes: "Looking forward for your business.",
    invoice_terms_and_conditions: "Payment : 100% Advance. Goods once sold will not be taken back.",
    invoice_footer: "Thank you for choosing BillMeet!",
    bank_name: "ICICI Bank",
    bank_account_name: "Zoom Renewables Private Limited",
    bank_account_number: "178705500909",
    bank_ifsc_code: "ICIC0001787",
    bank_branch: "Chhatrapati Nagar, Nagpur",
    bank_upi_id: "zoomrenewables@icici",
    authorized_signatory_name: "Authorized Signature",
    allow_credit_sales: true,
    default_credit_limit: 5000,
    allow_negative_stock: false,
    max_cashier_discount_percent: 10,
    require_customer: false,
    auto_print_bill: false,
    low_stock_threshold: 5,
    invoice_elements: {
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
    },
  });

  // Snapshot for Cancel / Revert
  const [initialPosData, setInitialPosData] = useState<Partial<BusinessConfig>>({});

  // Logo file upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Signature file upload state
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [removeSignature, setRemoveSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp state
  const [whatsappData, setWhatsappData] = useState({
    business_account_id: "",
    phone_number_id: "",
    access_token: "",
    is_active: true,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [waRes, posRes, btRes] = await Promise.all([
          whatsappApi.getConfig().catch(() => ({ data: null })),
          posApi.getConfig().catch(() => ({ data: null })),
          posApi.getBusinessTypes().catch(() => ({ data: {} })),
        ]);

        if (waRes.data) {
          setHasSavedWhatsAppToken(Boolean(waRes.data.has_access_token));
          setWhatsappData({
            business_account_id: waRes.data.business_account_id || "",
            phone_number_id: waRes.data.phone_number_id || "",
            access_token: "",
            is_active: waRes.data.is_active ?? true,
          });
        }

        if (posRes.data) {
          const config = posRes.data;
          // Ensure default invoice_elements if missing
          const elements: InvoiceElementsConfig = {
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
            ...(config.invoice_elements || {}),
          };

          const merged: Partial<BusinessConfig> = {
            ...config,
            invoice_elements: elements,
            business_name: config.business_name || config.trade_name || "",
            legal_name: config.legal_name || config.trade_name || "",
          };

          setPosData(merged);
          setInitialPosData(JSON.parse(JSON.stringify(merged)));

          if (config.logo_url || config.logo) {
            setLogoPreviewUrl(config.logo_url || config.logo || null);
          }
          if (config.signature_url || config.signature_image) {
            setSignaturePreviewUrl(config.signature_url || config.signature_image || null);
          }
        }

        if (btRes.data) {
          setBusinessTypes(btRes.data);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // Handle Logo Upload
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("Logo file size must not exceed 2MB.");
      return;
    }
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please select a valid PNG, JPG, or WEBP image.");
      return;
    }

    setError("");
    setLogoFile(file);
    setRemoveLogo(false);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreviewUrl(objectUrl);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setRemoveLogo(true);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  // Handle Signature Upload
  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      setError("Signature file size must not exceed 1MB.");
      return;
    }
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please select a valid PNG, JPG, or WEBP image.");
      return;
    }

    setError("");
    setSignatureFile(file);
    setRemoveSignature(false);
    const objectUrl = URL.createObjectURL(file);
    setSignaturePreviewUrl(objectUrl);
  };

  const handleRemoveSignature = () => {
    setSignatureFile(null);
    setSignaturePreviewUrl(null);
    setRemoveSignature(true);
    if (signatureInputRef.current) signatureInputRef.current.value = "";
  };

  // Toggle invoice element helper
  const handleToggleElement = (key: keyof InvoiceElementsConfig) => {
    const current = posData.invoice_elements || {};
    const updated = {
      ...current,
      [key]: !current[key],
    };
    setPosData({
      ...posData,
      invoice_elements: updated,
    });
  };

  // Cancel / Revert Changes
  const handleCancel = () => {
    if (Object.keys(initialPosData).length > 0) {
      setPosData(JSON.parse(JSON.stringify(initialPosData)));
      setLogoFile(null);
      setSignatureFile(null);
      setRemoveLogo(false);
      setRemoveSignature(false);
      setLogoPreviewUrl(initialPosData.logo_url || initialPosData.logo || null);
      setSignaturePreviewUrl(initialPosData.signature_url || initialPosData.signature_image || null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      if (signatureInputRef.current) signatureInputRef.current.value = "";
      setMessage("Edits discarded. Reverted to saved configuration.");
      setError("");
    }
  };

  // Save POS / Branding Settings
  const handleSavePOS = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingPos(true);
    setMessage("");
    setError("");

    try {
      const formData = new FormData();

      Object.entries(posData).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        if (k === "logo" || k === "logo_url" || k === "signature_image" || k === "signature_url" || k === "schema" || k === "id") {
          return;
        }
        if (k === "invoice_elements") {
          formData.append(k, JSON.stringify(v));
        } else if (typeof v === "boolean") {
          formData.append(k, v ? "true" : "false");
        } else if (typeof v === "object") {
          formData.append(k, JSON.stringify(v));
        } else {
          formData.append(k, String(v));
        }
      });

      if (logoFile) {
        formData.append("logo", logoFile);
      }
      if (removeLogo) {
        formData.append("remove_logo", "true");
      }

      if (signatureFile) {
        formData.append("signature_image", signatureFile);
      }
      if (removeSignature) {
        formData.append("remove_signature", "true");
      }

      const res = await posApi.updateConfig(formData);
      const savedConfig = res.data;

      const elements: InvoiceElementsConfig = {
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
        ...(savedConfig.invoice_elements || {}),
      };

      const merged: Partial<BusinessConfig> = {
        ...savedConfig,
        invoice_elements: elements,
        business_name: savedConfig.business_name || savedConfig.trade_name || "",
        legal_name: savedConfig.legal_name || savedConfig.trade_name || "",
      };

      setPosData(merged);
      setInitialPosData(JSON.parse(JSON.stringify(merged)));
      setLogoFile(null);
      setSignatureFile(null);
      setRemoveLogo(false);
      setRemoveSignature(false);

      if (savedConfig.logo_url || savedConfig.logo) {
        setLogoPreviewUrl(savedConfig.logo_url || savedConfig.logo || null);
      } else {
        setLogoPreviewUrl(null);
      }

      if (savedConfig.signature_url || savedConfig.signature_image) {
        setSignaturePreviewUrl(savedConfig.signature_url || savedConfig.signature_image || null);
      } else {
        setSignaturePreviewUrl(null);
      }

      setMessage("Invoice branding & business configuration saved successfully!");
    } catch (err: any) {
      setError(parseApiError(err, "Failed to update configuration."));
    } finally {
      setSavingPos(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsappTest(null);
    try {
      const response = await whatsappApi.testConnection();
      setWhatsappTest(response.data);
    } catch (err: any) {
      setWhatsappTest({
        connected: false,
        checked_at: new Date().toISOString(),
        message: parseApiError(err, "Connection test failed. Check the server and try again."),
      });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsApp(true);
    setMessage("");
    setError("");

    try {
      const updatePayload = { ...whatsappData } as Record<string, unknown>;
      if (!whatsappData.access_token.trim() && hasSavedWhatsAppToken) {
        delete updatePayload.access_token;
      }
      await whatsappApi.updateConfig(updatePayload);
      if (whatsappData.access_token.trim()) setHasSavedWhatsAppToken(true);
      setWhatsappData((previous) => ({ ...previous, access_token: "" }));
      setMessage("WhatsApp API configuration updated successfully!");
    } catch (err: any) {
      setError(parseApiError(err, "Failed to update WhatsApp configuration."));
    } finally {
      setSavingWhatsApp(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Title & Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>Settings</span>
            <span>/</span>
            <span className="font-semibold text-foreground">
              {activeTab === "branding"
                ? "Invoice & Branding"
                : activeTab === "profile"
                ? "Business Profile"
                : activeTab === "tax"
                ? "Tax & GST Settings"
                : activeTab === "pos"
                ? "POS Controls"
                : activeTab === "whatsapp"
                ? "WhatsApp Integration"
                : "Universal API Integration"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Business & Invoice Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure dynamic A4 invoice branding, GST tax engine, bank credentials, cashier controls, and external integrations.
          </p>
        </div>

        {/* Global Save and Revert Action Pill */}
        {activeTab !== "whatsapp" && activeTab !== "integrations" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={savingPos}
              className="gap-1.5 text-xs h-9"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard Edits
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSavePOS()}
              disabled={savingPos}
              className="gap-1.5 font-bold text-xs h-9 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              {savingPos ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {message && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            onClick={() => setMessage("")}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/15 border border-destructive/30 p-3.5 text-xs font-medium text-destructive">
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b text-xs scrollbar-thin">
        <button
          onClick={() => setActiveTab("branding")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "branding"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Invoice & Branding</span>
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            A4
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "profile"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Business Profile & Vertical</span>
        </button>

        <button
          onClick={() => setActiveTab("tax")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "tax"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Landmark className="h-4 w-4" />
          <span>Tax & GST Engine</span>
        </button>

        <button
          onClick={() => setActiveTab("pos")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "pos"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>POS Controls & Credit</span>
        </button>

        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "whatsapp"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          <span>WhatsApp Cloud API</span>
        </button>

        <button
          onClick={() => setActiveTab("integrations")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition-all shrink-0 ${
            activeTab === "integrations"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Key className="h-4 w-4" />
          <span>Universal API</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: INVOICE & BRANDING (FEATURED MODULE)                               */}
      {/* ========================================================================= */}
      {activeTab === "branding" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: 11 Configuration Sections */}
          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleSavePOS} className="space-y-6">
              {/* SECTION A — BUSINESS IDENTITY */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Section A — Business Identity
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Primary business naming and subtitles displayed on printed and PDF invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div>
                    <label className="font-semibold block mb-1">Business Name / Trade Name *</label>
                    <Input
                      required
                      placeholder="e.g. Zoom Renewables Pvt. Ltd."
                      value={posData.business_name || posData.trade_name || ""}
                      onChange={(e) =>
                        setPosData({
                          ...posData,
                          business_name: e.target.value,
                          trade_name: e.target.value,
                        })
                      }
                      className="text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Main title printed prominently in the center top of formal A4 Tax Invoices.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Legal / Registered Name</label>
                      <Input
                        placeholder="e.g. Zoom Renewables Private Limited"
                        value={posData.legal_name || ""}
                        onChange={(e) => setPosData({ ...posData, legal_name: e.target.value })}
                        className="text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Printed on the authorized signatory block and bank details.
                      </p>
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Tagline / Business Subtitle</label>
                      <Input
                        placeholder="e.g. Solar Energy & Irrigation Solutions"
                        value={posData.tagline || ""}
                        onChange={(e) => setPosData({ ...posData, tagline: e.target.value })}
                        className="text-xs"
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="checkbox"
                          id="show_tagline_toggle"
                          checked={posData.invoice_elements?.show_tagline ?? false}
                          onChange={() => handleToggleElement("show_tagline")}
                          className="h-3.5 w-3.5 rounded text-primary"
                        />
                        <label htmlFor="show_tagline_toggle" className="text-[11px] font-medium cursor-pointer">
                          Show Tagline on Invoice
                        </label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION B — BUSINESS LOGO */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-blue-600" />
                    Section B — Business Logo
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Upload official company emblem (PNG, JPG, WEBP, max 2MB). Aspect ratio is safely preserved.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-lg border bg-muted/10">
                    <div className="h-20 w-36 border border-dashed rounded-md flex items-center justify-center bg-white p-2 shrink-0">
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Company Logo Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6 mx-auto opacity-40 mb-1" />
                          <span className="text-[10px]">No Logo Set</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          ref={logoInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoChange}
                          className="hidden"
                          id="logo_upload_field"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoInputRef.current?.click()}
                          className="gap-1.5 text-xs h-8"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {logoPreviewUrl ? "Replace Logo" : "Upload Logo"}
                        </Button>

                        {logoPreviewUrl && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleRemoveLogo}
                            className="gap-1.5 text-xs h-8"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove Logo
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Recommended: Square or horizontal logo with transparent or white background. Auto-resizes safely for A4 page margins.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show_logo_toggle"
                      checked={posData.invoice_elements?.show_logo ?? true}
                      onChange={() => handleToggleElement("show_logo")}
                      className="h-3.5 w-3.5 rounded text-primary"
                    />
                    <label htmlFor="show_logo_toggle" className="text-xs font-semibold cursor-pointer">
                      Display Logo on Generated Invoices & PDFs
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION C — BUSINESS ADDRESS */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Section C — Business Address
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Registered office or operational dispatch address for Indian GST compliance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Address Line 1 *</label>
                      <Input
                        placeholder="e.g. Zoom, U-62 MIDC, Hingna"
                        value={posData.address_line1 || posData.address || ""}
                        onChange={(e) =>
                          setPosData({
                            ...posData,
                            address_line1: e.target.value,
                            address: e.target.value,
                          })
                        }
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Address Line 2 (Optional)</label>
                      <Input
                        placeholder="e.g. Near Hingna Police Station"
                        value={posData.address_line2 || ""}
                        onChange={(e) => setPosData({ ...posData, address_line2: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">City *</label>
                      <Input
                        placeholder="e.g. Nagpur"
                        value={posData.city || ""}
                        onChange={(e) => setPosData({ ...posData, city: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">District</label>
                      <Input
                        placeholder="e.g. Nagpur"
                        value={posData.district || ""}
                        onChange={(e) => setPosData({ ...posData, district: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">State *</label>
                      <Input
                        placeholder="e.g. Maharashtra"
                        value={posData.state || ""}
                        onChange={(e) => setPosData({ ...posData, state: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">PIN / Postal Code *</label>
                      <Input
                        placeholder="e.g. 440016"
                        value={posData.postal_code || posData.pincode || ""}
                        onChange={(e) =>
                          setPosData({
                            ...posData,
                            postal_code: e.target.value,
                            pincode: e.target.value,
                          })
                        }
                        className="text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="show_address_toggle"
                      checked={posData.invoice_elements?.show_address ?? true}
                      onChange={() => handleToggleElement("show_address")}
                      className="h-3.5 w-3.5 rounded text-primary"
                    />
                    <label htmlFor="show_address_toggle" className="text-xs font-semibold cursor-pointer">
                      Display Address on Invoices
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION D — CONTACT DETAILS */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-600" />
                    Section D — Contact Details
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Customer care phone lines, billing email, and corporate portal.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Primary Phone *</label>
                      <Input
                        placeholder="e.g. +91 98765 43210"
                        value={posData.phone || ""}
                        onChange={(e) => setPosData({ ...posData, phone: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Alternate Phone / Landline</label>
                      <Input
                        placeholder="e.g. 0712-2345678"
                        value={posData.alternate_phone || ""}
                        onChange={(e) => setPosData({ ...posData, alternate_phone: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Business Email</label>
                      <Input
                        type="email"
                        placeholder="e.g. billing@zoomrenewables.com"
                        value={posData.email || ""}
                        onChange={(e) => setPosData({ ...posData, email: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Website URL</label>
                      <Input
                        placeholder="e.g. www.zoomrenewables.com"
                        value={posData.website || ""}
                        onChange={(e) => setPosData({ ...posData, website: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="show_contact_details_toggle"
                        checked={posData.invoice_elements?.show_contact_details ?? true}
                        onChange={() => handleToggleElement("show_contact_details")}
                        className="h-3.5 w-3.5 rounded text-primary"
                      />
                      <label htmlFor="show_contact_details_toggle" className="text-xs font-semibold cursor-pointer">
                        Display Contact Block on Invoices
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pl-5 pt-1 text-[11px]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={posData.invoice_elements?.show_phone ?? true}
                          onChange={() => handleToggleElement("show_phone")}
                          className="h-3 w-3 rounded text-primary"
                        />
                        <span>Show Phone</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={posData.invoice_elements?.show_email ?? true}
                          onChange={() => handleToggleElement("show_email")}
                          className="h-3 w-3 rounded text-primary"
                        />
                        <span>Show Email</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={posData.invoice_elements?.show_website ?? false}
                          onChange={() => handleToggleElement("show_website")}
                          className="h-3 w-3 rounded text-primary"
                        />
                        <span>Show Website</span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION E — GST & TAX DETAILS */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-purple-600" />
                    Section E — GST & Tax Details
                  </CardTitle>
                  <CardDescription className="text-xs">
                    GSTIN, PAN number, and state classification for Indian tax compliance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">GSTIN Number</label>
                      <Input
                        placeholder="e.g. 27AABCZ1569R1ZH"
                        value={posData.gstin || ""}
                        onChange={(e) => setPosData({ ...posData, gstin: e.target.value.toUpperCase() })}
                        className="text-xs uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Permanent Account Number (PAN)</label>
                      <Input
                        placeholder="e.g. AABCZ1569R"
                        value={posData.pan_number || ""}
                        onChange={(e) => setPosData({ ...posData, pan_number: e.target.value.toUpperCase() })}
                        className="text-xs uppercase font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">State Code</label>
                      <Input
                        placeholder="e.g. 27"
                        value={posData.state_code || ""}
                        onChange={(e) => setPosData({ ...posData, state_code: e.target.value })}
                        className="text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Registration Type</label>
                      <select
                        value={posData.gst_registration_type || "Regular"}
                        onChange={(e) => setPosData({ ...posData, gst_registration_type: e.target.value })}
                        className="h-9 w-full rounded border px-2 text-xs"
                      >
                        <option value="Regular">Regular Taxpayer</option>
                        <option value="Composition">Composition Scheme</option>
                        <option value="Unregistered">Unregistered Business</option>
                        <option value="Overseas">Overseas / SEZ Unit</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="show_gstin_toggle"
                      checked={posData.invoice_elements?.show_gstin ?? true}
                      onChange={() => handleToggleElement("show_gstin")}
                      className="h-3.5 w-3.5 rounded text-primary"
                    />
                    <label htmlFor="show_gstin_toggle" className="text-xs font-semibold cursor-pointer">
                      Display GSTIN on Invoices
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION F — A4 INVOICE APPEARANCE */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Printer className="h-4 w-4 text-amber-600" />
                    Section F — A4 Invoice Appearance
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Page layout, template theme, logo alignment, and document headers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Paper Size</label>
                      <select
                        value={posData.paper_size || "A4"}
                        onChange={(e) => setPosData({ ...posData, paper_size: e.target.value })}
                        className="h-9 w-full rounded border px-2 text-xs font-semibold"
                      >
                        <option value="A4">A4 Portrait (210 × 297 mm)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Invoice Template</label>
                      <select
                        value={posData.invoice_template || "classic_gst"}
                        onChange={(e) => setPosData({ ...posData, invoice_template: e.target.value })}
                        className="h-9 w-full rounded border px-2 text-xs"
                      >
                        <option value="classic_gst">Classic GST Tax Invoice (Zoom Standard)</option>
                        <option value="minimal">Minimal Business Standard</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold block mb-1">Logo Position</label>
                      <div className="flex items-center gap-1.5 h-9">
                        {(["left", "center", "right"] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => setPosData({ ...posData, logo_position: pos })}
                            className={`flex-1 h-full rounded border text-xs font-semibold uppercase tracking-wider transition-all ${
                              (posData.logo_position || "left") === pos
                                ? "bg-foreground text-background border-foreground"
                                : "bg-muted/30 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
                    <div>
                      <label className="font-semibold block mb-1">GST Tax Invoice Heading</label>
                      <Input
                        placeholder="TAX INVOICE"
                        value={posData.gst_invoice_title || "TAX INVOICE"}
                        onChange={(e) => setPosData({ ...posData, gst_invoice_title: e.target.value })}
                        className="text-xs uppercase font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Regular Invoice Heading</label>
                      <Input
                        placeholder="INVOICE"
                        value={posData.regular_invoice_title || "INVOICE"}
                        onChange={(e) => setPosData({ ...posData, regular_invoice_title: e.target.value })}
                        className="text-xs uppercase font-mono font-bold"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION G — INVOICE ELEMENT VISIBILITY (MASTER CHECKLIST) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-rose-600" />
                    Section G — Invoice Element Visibility
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Fine-tune the visibility of individual components across printed & PDF invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { key: "show_logo", label: "Business Logo" },
                      { key: "show_address", label: "Store Address" },
                      { key: "show_gstin", label: "GSTIN Number" },
                      { key: "show_tagline", label: "Tagline / Subtitle" },
                      { key: "show_contact_details", label: "Contact Details" },
                      { key: "show_bill_to", label: "Bill To Customer Box" },
                      { key: "show_ship_to", label: "Ship To Address Box" },
                      { key: "show_bank_details", label: "Bank Account Details" },
                      { key: "show_terms", label: "Terms & Conditions" },
                      { key: "show_notes", label: "Invoice Notes" },
                      { key: "show_amount_in_words", label: "Amount in Words" },
                      { key: "show_authorized_signature", label: "Signature Block" },
                      { key: "show_page_number", label: "Page Numbers" },
                    ].map(({ key, label }) => {
                      const isChecked = posData.invoice_elements?.[key as keyof InvoiceElementsConfig] ?? true;
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2 rounded border bg-muted/10 cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleElement(key as keyof InvoiceElementsConfig)}
                            className="h-3.5 w-3.5 rounded text-primary"
                          />
                          <span className="text-[11px] font-medium leading-none">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* SECTION H — AUTHORIZED SIGNATURE */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <PenTool className="h-4 w-4 text-emerald-600" />
                    Section H — Authorized Signature
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Upload digital signature stamp (PNG with transparency recommended, max 1MB).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-lg border bg-muted/10">
                    <div className="h-16 w-32 border border-dashed rounded-md flex items-center justify-center bg-white p-1.5 shrink-0">
                      {signaturePreviewUrl ? (
                        <img
                          src={signaturePreviewUrl}
                          alt="Signature Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-muted-foreground">
                          <PenTool className="h-5 w-5 mx-auto opacity-40 mb-0.5" />
                          <span className="text-[9.5px]">No Signature</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="file"
                          ref={signatureInputRef}
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleSignatureChange}
                          className="hidden"
                          id="signature_upload_field"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => signatureInputRef.current?.click()}
                          className="gap-1.5 text-xs h-8"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {signaturePreviewUrl ? "Replace Signature" : "Upload Signature"}
                        </Button>

                        {signaturePreviewUrl && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleRemoveSignature}
                            className="gap-1.5 text-xs h-8"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove Signature
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Clean digital stamp or handwritten signature on transparent background.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Signatory Title / Designation</label>
                    <Input
                      placeholder="e.g. Authorized Signatory"
                      value={posData.authorized_signatory_name || ""}
                      onChange={(e) => setPosData({ ...posData, authorized_signatory_name: e.target.value })}
                      className="text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Label printed beneath the signature line (e.g. &quot;Authorized Signatory&quot;).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show_signature_toggle"
                      checked={posData.invoice_elements?.show_authorized_signature ?? true}
                      onChange={() => handleToggleElement("show_authorized_signature")}
                      className="h-3.5 w-3.5 rounded text-primary"
                    />
                    <label htmlFor="show_signature_toggle" className="text-xs font-semibold cursor-pointer">
                      Display Authorized Signature Block
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION I — BANK & PAYMENT DETAILS */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    Section I — Bank & Payment Details
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Direct NEFT/RTGS/IMPS bank coordinates and UPI VPA displayed on invoices for B2B collection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold block mb-1">Bank Name</label>
                      <Input
                        placeholder="e.g. ICICI Bank"
                        value={posData.bank_name || ""}
                        onChange={(e) => setPosData({ ...posData, bank_name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Bank Account Name</label>
                      <Input
                        placeholder="e.g. Zoom Renewables Private Limited"
                        value={posData.bank_account_name || ""}
                        onChange={(e) => setPosData({ ...posData, bank_account_name: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Account Number</label>
                      <Input
                        placeholder="e.g. 178705500909"
                        value={posData.bank_account_number || ""}
                        onChange={(e) => setPosData({ ...posData, bank_account_number: e.target.value })}
                        className="text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">IFS Code</label>
                      <Input
                        placeholder="e.g. ICIC0001787"
                        value={posData.bank_ifsc_code || ""}
                        onChange={(e) => setPosData({ ...posData, bank_ifsc_code: e.target.value.toUpperCase() })}
                        className="text-xs uppercase font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Branch Address</label>
                      <Input
                        placeholder="e.g. Chhatrapati Nagar, Nagpur"
                        value={posData.bank_branch || ""}
                        onChange={(e) => setPosData({ ...posData, bank_branch: e.target.value })}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">UPI ID (VPA)</label>
                      <Input
                        placeholder="e.g. zoomrenewables@icici"
                        value={posData.bank_upi_id || ""}
                        onChange={(e) => setPosData({ ...posData, bank_upi_id: e.target.value })}
                        className="text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="show_bank_toggle"
                      checked={posData.invoice_elements?.show_bank_details ?? true}
                      onChange={() => handleToggleElement("show_bank_details")}
                      className="h-3.5 w-3.5 rounded text-primary"
                    />
                    <label htmlFor="show_bank_toggle" className="text-xs font-semibold cursor-pointer">
                      Display Bank Coordinates on Formal Invoices
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION J & K — TERMS & CONDITIONS + NOTES */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-emerald-700" />
                    Section J & K — Terms & Conditions and Default Notes
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Payment terms, legal jurisdiction, and cordial greetings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold">Default Invoice Notes (Section K)</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={posData.invoice_elements?.show_notes ?? true}
                          onChange={() => handleToggleElement("show_notes")}
                          className="h-3 w-3 rounded text-primary"
                        />
                        <span>Show Notes</span>
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="e.g. Looking forward for your business."
                      value={posData.default_invoice_notes || ""}
                      onChange={(e) => setPosData({ ...posData, default_invoice_notes: e.target.value })}
                      className="w-full rounded border p-2 text-xs font-sans resize-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold">Terms & Conditions (Section J)</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={posData.invoice_elements?.show_terms ?? true}
                          onChange={() => handleToggleElement("show_terms")}
                          className="h-3 w-3 rounded text-primary"
                        />
                        <span>Show Terms</span>
                      </label>
                    </div>
                    <textarea
                      rows={3}
                      placeholder="e.g. Payment : 100% Advance. Goods once sold will not be taken back."
                      value={posData.invoice_terms_and_conditions || ""}
                      onChange={(e) => setPosData({ ...posData, invoice_terms_and_conditions: e.target.value })}
                      className="w-full rounded border p-2 text-xs font-sans resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Bottom Sticky Action Bar */}
              <div className="flex items-center justify-between gap-3 p-4 bg-muted/40 rounded-xl border sticky bottom-4 shadow-md bg-background/95 backdrop-blur">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={savingPos}
                  className="gap-1.5 text-xs h-9"
                >
                  <RotateCcw className="h-4 w-4" />
                  Discard Edits
                </Button>

                <Button
                  type="submit"
                  disabled={savingPos}
                  className="gap-2 font-bold text-xs h-9 px-6 bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                >
                  <Save className="h-4 w-4" />
                  {savingPos ? "Saving Configuration..." : "Save Invoice & Branding"}
                </Button>
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: Sticky Real-Time Live A4 Invoice Preview */}
          <div className="lg:col-span-5 sticky top-4 space-y-4">
            <A4InvoiceLivePreview
              config={posData}
              logoPreview={logoPreviewUrl}
              signaturePreview={signaturePreviewUrl}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BUSINESS PROFILE & VERTICAL                                        */}
      {/* ========================================================================= */}
      {activeTab === "profile" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Universal Business Vertical & Identity
            </CardTitle>
            <CardDescription className="text-xs">
              Select your industry vertical to dynamically configure product attributes, catalog fields, and POS workflows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePOS} className="space-y-4 text-xs">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="font-semibold block mb-1">Business Vertical *</label>
                  <select
                    value={posData.business_type}
                    onChange={(e) => setPosData({ ...posData, business_type: e.target.value as any })}
                    className="h-9 w-full rounded border px-2 text-xs font-semibold"
                  >
                    {Object.entries(businessTypes).map(([key, schema]) => (
                      <option key={key} value={key}>
                        {schema.label || schema.name || key}
                      </option>
                    ))}
                    {Object.keys(businessTypes).length === 0 && (
                      <>
                        <option value="RETAIL">General Retail</option>
                        <option value="HARDWARE">Hardware & Paints</option>
                        <option value="JEWELLERY">Jewellery & Gold</option>
                        <option value="AUTO_SPARES">Auto Spare Parts</option>
                        <option value="ELECTRONICS">Electronics & Gadgets</option>
                        <option value="GROCERY">Grocery & Supermarket</option>
                        <option value="CLOTHING">Clothing & Fashion</option>
                      </>
                    )}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Customizes product fields (e.g. Purity/Weight for Jewellery, Part # for Auto, Size/Color for Clothing).
                  </p>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Store / Trade Name *</label>
                  <Input
                    required
                    placeholder="e.g. Zoom Renewables Pvt. Ltd."
                    value={posData.trade_name || ""}
                    onChange={(e) => setPosData({ ...posData, trade_name: e.target.value })}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">GSTIN Number</label>
                  <Input
                    placeholder="e.g. 27AABCZ1569R1ZH"
                    value={posData.gstin || ""}
                    onChange={(e) => setPosData({ ...posData, gstin: e.target.value.toUpperCase() })}
                    className="text-xs uppercase font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button type="submit" disabled={savingPos} className="gap-2 font-bold text-xs">
                  <Save className="h-4 w-4" />
                  {savingPos ? "Saving Profile..." : "Save Business Profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TAX & GST ENGINE                                                   */}
      {/* ========================================================================= */}
      {activeTab === "tax" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-5 w-5 text-blue-600" />
              GST & Tax Engine
            </CardTitle>
            <CardDescription className="text-xs">
              Configure CGST, SGST, IGST tax computation modes and default tax rates for inventory items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePOS} className="space-y-4 text-xs">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="font-semibold block mb-1">Tax Calculation Mode</label>
                  <select
                    value={posData.tax_mode}
                    onChange={(e) => setPosData({ ...posData, tax_mode: e.target.value as any })}
                    className="h-9 w-full rounded border px-2 text-xs"
                  >
                    <option value="exclusive">Tax Exclusive (Prices are without tax, tax added at cart)</option>
                    <option value="inclusive">Tax Inclusive (Prices already include tax)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Default GST Rate (%)</label>
                  <select
                    value={posData.default_tax_rate}
                    onChange={(e) => setPosData({ ...posData, default_tax_rate: parseFloat(e.target.value) || 0 })}
                    className="h-9 w-full rounded border px-2 text-xs"
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5% GST</option>
                    <option value="12">12% GST</option>
                    <option value="18">18% GST (Standard)</option>
                    <option value="28">28% GST</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="tax_enabled_check"
                    checked={posData.gst_enabled}
                    onChange={(e) => setPosData({ ...posData, gst_enabled: e.target.checked })}
                    className="h-4 w-4 rounded text-primary"
                  />
                  <label htmlFor="tax_enabled_check" className="font-semibold cursor-pointer">
                    Enable GST / Tax System
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button type="submit" disabled={savingPos} className="gap-2 font-bold text-xs">
                  <Save className="h-4 w-4" />
                  {savingPos ? "Saving..." : "Save Tax Settings"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: POS CONTROLS & CREDIT                                              */}
      {/* ========================================================================= */}
      {activeTab === "pos" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              POS Controls & Udhaar Credit Limits
            </CardTitle>
            <CardDescription className="text-xs">
              Manage maximum cashier discounts, customer credit limits, and inventory safety controls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePOS} className="space-y-4 text-xs">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="font-semibold block mb-1">Max Cashier Discount Allowed (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={posData.max_cashier_discount_percent ?? 10}
                    onChange={(e) =>
                      setPosData({ ...posData, max_cashier_discount_percent: parseFloat(e.target.value) || 0 })
                    }
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Discounts above this will be rejected by backend.</p>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Default Customer Credit Limit (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    value={posData.default_credit_limit ?? 5000}
                    onChange={(e) =>
                      setPosData({ ...posData, default_credit_limit: parseFloat(e.target.value) || 0 })
                    }
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Low Stock Warning Threshold</label>
                  <Input
                    type="number"
                    min="1"
                    value={posData.low_stock_threshold ?? 5}
                    onChange={(e) =>
                      setPosData({ ...posData, low_stock_threshold: parseFloat(e.target.value) || 0 })
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 pt-3">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={posData.allow_credit_sales}
                    onChange={(e) => setPosData({ ...posData, allow_credit_sales: e.target.checked })}
                    className="rounded text-primary h-4 w-4"
                  />
                  Allow Udhaar / Credit Sales
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={posData.allow_negative_stock}
                    onChange={(e) => setPosData({ ...posData, allow_negative_stock: e.target.checked })}
                    className="rounded text-primary h-4 w-4"
                  />
                  Allow Negative Stock Sales
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={posData.require_customer}
                    onChange={(e) => setPosData({ ...posData, require_customer: e.target.checked })}
                    className="rounded text-primary h-4 w-4"
                  />
                  Require Customer on Bill
                </label>
              </div>

              <div className="flex justify-end pt-3 border-t">
                <Button type="submit" disabled={savingPos} className="gap-2 font-bold text-xs">
                  <Save className="h-4 w-4" />
                  {savingPos ? "Saving..." : "Save POS Controls"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: WHATSAPP CLOUD API                                                 */}
      {/* ========================================================================= */}
      {activeTab === "whatsapp" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Meta WhatsApp Cloud API Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Connect your official Meta WhatsApp Business account to send digital bills, instant coupons, and marketing campaigns to customers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveWhatsApp} className="space-y-4 text-xs">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-medium">WhatsApp Phone Number ID *</label>
                  <Input
                    placeholder="e.g. 104857692019485"
                    value={whatsappData.phone_number_id}
                    onChange={(e) => setWhatsappData({ ...whatsappData, phone_number_id: e.target.value })}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Found in Meta App Dashboard → WhatsApp → API Setup</p>
                </div>

                <div className="space-y-1">
                  <label className="font-medium">WhatsApp Business Account ID</label>
                  <Input
                    placeholder="e.g. 109283746591028"
                    value={whatsappData.business_account_id}
                    onChange={(e) => setWhatsappData({ ...whatsappData, business_account_id: e.target.value })}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">Your Meta Business Account ID</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium">Permanent Access Token *</label>
                <Input
                  type="password"
                  placeholder="EAAG..."
                  value={whatsappData.access_token}
                  onChange={(e) => setWhatsappData({ ...whatsappData, access_token: e.target.value })}
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Meta System User Access Token with `whatsapp_business_messaging` permission.{" "}
                  {hasSavedWhatsAppToken ? "A token is already saved; leave blank to keep it." : ""}
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">WhatsApp Cloud API Status</p>
                      {testingWhatsApp ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <span className="animate-spin mr-1">◌</span> Checking
                        </span>
                      ) : whatsappTest?.connected ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Connected
                        </span>
                      ) : whatsappTest && !whatsappTest.connected ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-destructive/15 text-destructive">
                          Failed
                        </span>
                      ) : !whatsappData.phone_number_id && !hasSavedWhatsAppToken ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground">
                          Not configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                          Configured (Untested)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Validates credentials against your Meta WhatsApp Business number without sending customer messages.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestWhatsApp}
                    disabled={testingWhatsApp || (!whatsappData.phone_number_id && !hasSavedWhatsAppToken)}
                    className="gap-1.5"
                  >
                    {testingWhatsApp ? <span className="animate-spin">◌</span> : <MessageSquare className="h-3.5 w-3.5" />}
                    {testingWhatsApp ? "Testing connection…" : "Test connection"}
                  </Button>
                </div>

                {whatsappTest && (
                  <div
                    className={`rounded-md p-3 text-xs border break-all ${
                      whatsappTest.connected
                        ? "bg-green-50/80 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
                        : "bg-red-50/80 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <p className="font-semibold">
                      {whatsappTest.connected ? "✓ Meta Cloud API Connected & Verified" : "✕ Meta Cloud API Diagnostic Failed"}
                    </p>
                    <p className="mt-1 break-words">{whatsappTest.message}</p>
                    {whatsappTest.connected && (whatsappTest.verified_name || whatsappTest.phone_number) && (
                      <p className="mt-1 font-mono text-[11px] break-all">
                        Registered Line: {[whatsappTest.verified_name, whatsappTest.phone_number].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-2 pt-2 border-t border-current/10 text-[11px] opacity-80">
                      <span>Last checked: {new Date(whatsappTest.checked_at).toLocaleString()}</span>
                      <span>{whatsappTest.connected ? "API auth verified (delivery depends on customer opt-in)" : "Action: Check token permissions or Phone ID"}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="whatsapp_active"
                    checked={whatsappData.is_active}
                    onChange={(e) => setWhatsappData({ ...whatsappData, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary"
                  />
                  <label htmlFor="whatsapp_active" className="text-xs font-medium cursor-pointer">
                    Enable Automatic WhatsApp Bill Delivery
                  </label>
                </div>

                <Button type="submit" disabled={savingWhatsApp} className="w-full sm:w-auto h-10 sm:h-9 gap-1.5 text-xs touch-target-min">
                  <Save className="h-3.5 w-3.5" />
                  {savingWhatsApp ? "Saving..." : "Save WhatsApp Credentials"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: UNIVERSAL API INTEGRATION                                          */}
      {/* ========================================================================= */}
      {activeTab === "integrations" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-5 w-5 text-primary" />
              Universal POS & ERP Ingestion Endpoint
            </CardTitle>
            <CardDescription className="text-xs">
              Connect any billing hardware or external software (Tally, Busy, Shopify) into BillMeet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-medium">Transaction Ingestion API Endpoint</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  readOnly
                  value="http://localhost:8000/api/v1/transactions/ingest/"
                  className="font-mono text-xs bg-muted"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText("http://localhost:8000/api/v1/transactions/ingest/")}
                  className="text-xs shrink-0 h-10 sm:h-9 touch-target-min"
                >
                  Copy Endpoint
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">HTTP Method: `POST` | Auth Header: `Bearer &lt;Your_JWT_Token&gt;`</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
