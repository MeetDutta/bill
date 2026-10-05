"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whatsappApi, posApi } from "@/services/api";
import { parseApiError } from "@/lib/utils";
import {
  Settings,
  MessageSquare,
  Building2,
  Key,
  CheckCircle,
  Save,
  ShoppingBag,
  Landmark,
  Printer,
  ShieldCheck,
  Percent,
} from "lucide-react";
import { BusinessConfig, BusinessTypeSchema } from "@/types";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingPos, setSavingPos] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [businessTypes, setBusinessTypes] = useState<Record<string, BusinessTypeSchema>>({});

  const [posData, setPosData] = useState<Partial<BusinessConfig>>({
    business_type: "RETAIL",
    trade_name: "BillFree Store",
    gstin: "",
    gst_enabled: true,
    tax_mode: "exclusive",
    default_tax_rate: 18,
    default_invoice_format: "thermal_80mm",
    invoice_prefix: "INV",
    invoice_footer: "Thank you for shopping with us! Visit again.",
    allow_credit_sales: true,
    default_credit_limit: 5000,
    allow_negative_stock: false,
    max_cashier_discount_percent: 10,
    require_customer: false,
    auto_print_bill: false,
    low_stock_threshold: 5,
  });

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
          setWhatsappData({
            business_account_id: waRes.data.business_account_id || "",
            phone_number_id: waRes.data.phone_number_id || "",
            access_token: waRes.data.access_token || "",
            is_active: waRes.data.is_active ?? true,
          });
        }

        if (posRes.data) {
          setPosData(posRes.data);
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

  const handleSavePOS = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPos(true);
    setMessage("");
    setError("");

    try {
      const res = await posApi.updateConfig(posData);
      setPosData(res.data);
      setMessage("Universal Business POS & Tax configuration saved successfully!");
    } catch (err: any) {
      setError(parseApiError(err, "Failed to update POS configuration."));
    } finally {
      setSavingPos(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsApp(true);
    setMessage("");
    setError("");

    try {
      await whatsappApi.updateConfig(whatsappData);
      setMessage("WhatsApp API configuration updated successfully!");
    } catch (err: any) {
      setError(parseApiError(err, "Failed to update WhatsApp configuration."));
    } finally {
      setSavingWhatsApp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Business & POS Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure your business vertical, GST tax engine, invoice formats, POS cashier controls, and integration endpoints.
        </p>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-md bg-green-500/15 p-4 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* SECTION 1: Universal Business Vertical & Profile */}
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
                  placeholder="e.g. Shree Ganesh Hardware"
                  value={posData.trade_name || ""}
                  onChange={(e) => setPosData({ ...posData, trade_name: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">GSTIN Number</label>
                <Input
                  placeholder="e.g. 27AAPFU0939F1ZV"
                  value={posData.gstin || ""}
                  onChange={(e) => setPosData({ ...posData, gstin: e.target.value.toUpperCase() })}
                  className="text-xs uppercase font-mono"
                />
              </div>
            </div>

            {/* SECTION 2: GST & Tax Engine */}
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
                <Landmark className="h-4 w-4 text-blue-600" />
                GST & Tax Engine
              </h4>
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
            </div>

            {/* SECTION 3: Invoice & Printing Preferences */}
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
                <Printer className="h-4 w-4 text-purple-600" />
                Invoice & Printing Format
              </h4>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="font-semibold block mb-1">Default Bill / Invoice Paper</label>
                  <select
                    value={posData.default_invoice_format}
                    onChange={(e) => setPosData({ ...posData, default_invoice_format: e.target.value as any })}
                    className="h-9 w-full rounded border px-2 text-xs"
                  >
                    <option value="thermal_80mm">80mm Thermal Receipt (Standard POS)</option>
                    <option value="thermal_58mm">58mm Thermal Receipt (Compact)</option>
                    <option value="a4">A4 Full Page GST Invoice</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Invoice Prefix</label>
                  <Input
                    placeholder="INV"
                    value={posData.invoice_prefix || "INV"}
                    onChange={(e) => setPosData({ ...posData, invoice_prefix: e.target.value.toUpperCase() })}
                    className="text-xs uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Receipt Footer Note</label>
                  <Input
                    placeholder="Thank you for your visit!"
                    value={posData.invoice_footer || ""}
                    onChange={(e) => setPosData({ ...posData, invoice_footer: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: POS Controls & Udhaar / Credit */}
            <div className="border-t pt-3">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                POS Controls & Udhaar Credit Limits
              </h4>
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
            </div>

            <div className="flex justify-end pt-3 border-t">
              <Button type="submit" disabled={savingPos} className="gap-2 font-bold text-xs">
                <Save className="h-4 w-4" />
                {savingPos ? "Saving Configuration..." : "Save Business POS Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* WhatsApp Cloud API Configuration */}
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
                <p className="text-[11px] text-muted-foreground">Found in Meta App Dashboard $\rightarrow$ WhatsApp $\rightarrow$ API Setup</p>
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
              <p className="text-[11px] text-muted-foreground">Meta System User Access Token with `whatsapp_business_messaging` permission.</p>
            </div>

            <div className="flex items-center justify-between pt-2">
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

              <Button type="submit" disabled={savingWhatsApp} size="sm" className="gap-1.5 text-xs">
                <Save className="h-3.5 w-3.5" />
                {savingWhatsApp ? "Saving..." : "Save WhatsApp Credentials"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* POS / ERP Integration Webhook Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5 text-primary" />
            Universal POS & ERP Ingestion Endpoint
          </CardTitle>
          <CardDescription className="text-xs">
            Connect any billing hardware or external software (Tally, Busy, Shopify) into BillFree.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-medium">Transaction Ingestion API Endpoint</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value="http://localhost:8000/api/v1/transactions/ingest/"
                className="font-mono text-xs bg-muted"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText("http://localhost:8000/api/v1/transactions/ingest/")}
                className="text-xs shrink-0"
              >
                Copy Endpoint
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">HTTP Method: `POST` | Auth Header: `Bearer &lt;Your_JWT_Token&gt;`</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
