"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { whatsappApi } from "@/services/api";
import { parseApiError } from "@/lib/utils";
import { Settings, MessageSquare, Building2, Key, CheckCircle, Save, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [whatsappData, setWhatsappData] = useState({
    business_account_id: "",
    phone_number_id: "",
    access_token: "",
    is_active: true,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await whatsappApi.getConfig();
        if (res.data) {
          setWhatsappData({
            business_account_id: res.data.business_account_id || "",
            phone_number_id: res.data.phone_number_id || "",
            access_token: res.data.access_token || "",
            is_active: res.data.is_active ?? true,
          });
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await whatsappApi.updateConfig(whatsappData);
      setMessage("WhatsApp API configuration updated successfully!");
    } catch (err: any) {
      setError(parseApiError(err, "Failed to update WhatsApp configuration."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Organization & Integration Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your business profile, Meta WhatsApp Cloud API credentials, and POS integration endpoints.</p>
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

      {/* WhatsApp Cloud API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            Meta WhatsApp Cloud API Configuration
          </CardTitle>
          <CardDescription>
            Connect your official Meta WhatsApp Business account to send digital bills, instant coupons, and marketing campaigns to customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading WhatsApp settings...</p>
          ) : (
            <form onSubmit={handleSaveWhatsApp} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">WhatsApp Phone Number ID *</label>
                  <Input
                    placeholder="e.g. 104857692019485"
                    value={whatsappData.phone_number_id}
                    onChange={(e) => setWhatsappData({ ...whatsappData, phone_number_id: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Found in Meta App Dashboard $\rightarrow$ WhatsApp $\rightarrow$ API Setup</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">WhatsApp Business Account ID</label>
                  <Input
                    placeholder="e.g. 109283746591028"
                    value={whatsappData.business_account_id}
                    onChange={(e) => setWhatsappData({ ...whatsappData, business_account_id: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Your Meta Business Account ID</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Permanent Access Token *</label>
                <Input
                  type="password"
                  placeholder="EAAG..."
                  value={whatsappData.access_token}
                  onChange={(e) => setWhatsappData({ ...whatsappData, access_token: e.target.value })}
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
                  <label htmlFor="whatsapp_active" className="text-sm font-medium">
                    Enable Automatic WhatsApp Bill Delivery
                  </label>
                </div>

                <Button type="submit" disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save Credentials"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* POS / ERP Integration Webhook Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            POS & ERP Transaction Integration Endpoint
          </CardTitle>
          <CardDescription>
            Connect any billing software (Tally, Busy, Shopify, Custom POS) to send purchase invoices into Digitalbill-dpramp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Transaction Ingestion API Endpoint</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value="http://localhost:8000/api/v1/transactions/ingest/"
                className="font-mono text-sm bg-muted"
              />
              <Button variant="outline" onClick={() => navigator.clipboard.writeText("http://localhost:8000/api/v1/transactions/ingest/")}>
                Copy Endpoint
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">HTTP Method: `POST` | Auth Header: `Bearer &lt;Your_JWT_Token&gt;`</p>
          </div>

          <div className="rounded-md bg-muted p-4 text-xs font-mono text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Sample Ingestion JSON Payload:</p>
            <pre className="overflow-x-auto text-[11px]">
{`{
  "store_id": "STORE_CODE",
  "invoice_number": "INV-1001",
  "transaction_date": "2026-08-12T14:00:00Z",
  "customer": { "name": "Rahul Sharma", "phone": "9876543210" },
  "items": [{ "name": "Item A", "quantity": 1, "unit_price": 500, "total": 590 }],
  "subtotal": 500, "tax": 90, "total": 590, "payment_method": "UPI",
  "external_transaction_id": "POS_TXN_001"
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
