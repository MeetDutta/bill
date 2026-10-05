"use client";

import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  TrendingUp,
  CreditCard,
  Package,
  Landmark,
  RotateCcw,
  Users,
  Search,
  Download,
  Filter,
  ArrowUpRight,
  CheckCircle,
} from "lucide-react";
import { posApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function POSReportsPage() {
  const [activeTab, setActiveTab] = useState<
    "sales" | "payments" | "products" | "tax" | "returns" | "outstanding"
  >("sales");
  const [dateFilter, setDateFilter] = useState("this_month");
  const [loading, setLoading] = useState(false);

  // Report Data
  const [salesReport, setSalesReport] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState<any | null>(null);
  const [paymentsReport, setPaymentsReport] = useState<any[]>([]);
  const [productSalesReport, setProductSalesReport] = useState<any[]>([]);
  const [taxReport, setTaxReport] = useState<any | null>(null);
  const [returnsReport, setReturnsReport] = useState<any[]>([]);
  const [outstandingReport, setOutstandingReport] = useState<any[]>([]);

  // Settle Credit Modal
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState("CASH");
  const [settleRef, setSettleRef] = useState("");
  const [settling, setSettling] = useState(false);

  const fetchCurrentTabReport = async () => {
    setLoading(true);
    try {
      const params = { period: dateFilter };
      if (activeTab === "sales") {
        const res = await posApi.getSalesReport(params);
        const data = res.data;
        const txns = data?.transactions || (Array.isArray(data) ? data : data?.results || []);
        setSalesReport(txns);
        setSalesSummary(data?.summary || null);
      } else if (activeTab === "payments") {
        const res = await posApi.getPaymentsReport(params);
        const data = res.data;
        const pms = data?.breakdown || (Array.isArray(data) ? data : data?.results || []);
        setPaymentsReport(pms);
      } else if (activeTab === "products") {
        const res = await posApi.getProductSalesReport(params);
        const data = res.data;
        const prods = data?.products || (Array.isArray(data) ? data : data?.results || []);
        setProductSalesReport(prods);
      } else if (activeTab === "tax") {
        const res = await posApi.getTaxReport(params);
        setTaxReport(res.data || null);
      } else if (activeTab === "returns") {
        const res = await posApi.getReturnsReport(params);
        const data = res.data;
        const rets = data?.returns || (Array.isArray(data) ? data : data?.results || []);
        setReturnsReport(rets);
      } else if (activeTab === "outstanding") {
        const res = await posApi.getOutstandingReport(params);
        const data = res.data;
        const debtors = data?.customers || (Array.isArray(data) ? data : data?.results || []);
        setOutstandingReport(debtors);
      }
    } catch (err) {
      console.error("Failed to load report", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentTabReport();
  }, [activeTab, dateFilter]);

  const handleSettleCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust) return;
    setSettling(true);
    try {
      await posApi.recordCreditPayment({
        customer_id: selectedCust.id,
        amount: parseFloat(settleAmount) || 0,
        payment_method: settleMethod,
        reference: settleRef,
      });
      setSettleModalOpen(false);
      setSettleAmount("");
      setSettleRef("");
      fetchCurrentTabReport();
    } catch (err) {
      alert("Failed to record credit payment.");
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">POS Financial & Operational Reports</h2>
          <p className="text-sm text-muted-foreground">
            Multi-store sales analytics, payment method breakdown, GST tax filing reports, and customer credit ledger.
          </p>
        </div>

        {/* Date Filter selector */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-3 text-xs font-semibold"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex flex-wrap border-b text-sm font-medium gap-1">
        {[
          { id: "sales", label: "Sales Report", icon: TrendingUp },
          { id: "payments", label: "Payment Breakdown", icon: CreditCard },
          { id: "products", label: "Product Sales", icon: Package },
          { id: "tax", label: "GST & Tax Summary", icon: Landmark },
          { id: "returns", label: "Returns Report", icon: RotateCcw },
          { id: "outstanding", label: "Udhaar / Credit Ledger", icon: Users },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 transition-colors ${
              activeTab === tab.id
                ? "border-primary font-bold text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Sales Report */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          {salesSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-muted/20">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Total Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-black text-foreground">
                    ₹{Number(salesSummary.total_sales || 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/20">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Bills Issued</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{salesSummary.bill_count || 0}</div>
                </CardContent>
              </Card>

              <Card className="bg-muted/20">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Average Bill Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-blue-600">
                    ₹{Number(salesSummary.average_bill_value || 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/20">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs uppercase text-muted-foreground font-semibold">Discounts Given</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-emerald-600">
                    ₹{Number(salesSummary.total_discount || 0).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions & Sales Ledger</CardTitle>
              <CardDescription className="text-xs">Detailed audit of all customer invoices and payments</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Loading sales data...</div>
              ) : salesReport.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No sales recorded for this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-3 text-right">Tax</th>
                        <th className="py-2.5 px-3 text-right">Grand Total</th>
                        <th className="py-2.5 px-3">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {salesReport.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(s.date || s.transaction_date).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">{s.invoice_number}</td>
                          <td className="py-2.5 px-3 font-medium">{s.customer || s.customer_name || "Walk-in"}</td>
                          <td className="py-2.5 px-3 text-right">₹{Number(s.subtotal).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">₹{Number(s.tax).toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-black text-foreground">
                            ₹{Number(s.total).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 uppercase text-[11px] font-medium">{s.payment_method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: Payment Breakdown */}
      {activeTab === "payments" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Method Breakdown</CardTitle>
            <CardDescription className="text-xs">
              Aggregate collection totals across Cash, UPI, Card, and Udhaar Credit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading payment data...</div>
            ) : paymentsReport.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No payments recorded for this period.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {paymentsReport.map((p, idx) => (
                  <Card key={idx} className="bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs uppercase text-muted-foreground font-bold">
                        {p.method || p.payment_method || "Other"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-black text-foreground">
                        ₹{Number(p.total || p.total_amount || p.amount || 0).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.count || 0} transactions {p.percentage ? `(${p.percentage}%)` : ""}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: Product Sales */}
      {activeTab === "products" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Selling Products</CardTitle>
            <CardDescription className="text-xs">Quantity sold and revenue generated by SKU</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading product sales...</div>
            ) : productSalesReport.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No product sales in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Product Name</th>
                      <th className="py-2.5 px-3">HSN / SKU</th>
                      <th className="py-2.5 px-3 text-right">Units Sold</th>
                      <th className="py-2.5 px-3 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {productSalesReport.map((item, idx) => (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-semibold">{item.name || item.product_name}</td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{item.hsn_code || item.sku || "—"}</td>
                        <td className="py-2.5 px-3 text-right font-bold">{item.quantity_sold || item.total_quantity || 0}</td>
                        <td className="py-2.5 px-3 text-right font-black text-foreground">
                          ₹{Number(item.revenue || item.total_revenue || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: Tax Summary */}
      {activeTab === "tax" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GST & Tax Summary (GSTR-1 Ready)</CardTitle>
            <CardDescription className="text-xs">
              Taxable values, CGST, SGST, and IGST breakdowns ready for monthly GST filing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading tax summary...</div>
            ) : !taxReport ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No tax records found for this period.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-lg bg-muted p-3">
                    <span className="text-muted-foreground text-xs block">Taxable Amount</span>
                    <span className="text-xl font-black">
                      ₹{Number(taxReport.totals?.gross || taxReport.taxable_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <span className="text-muted-foreground text-xs block">CGST Collected</span>
                    <span className="text-xl font-bold text-blue-600">
                      ₹{Number(taxReport.totals?.cgst || taxReport.cgst || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <span className="text-muted-foreground text-xs block">SGST Collected</span>
                    <span className="text-xl font-bold text-blue-600">
                      ₹{Number(taxReport.totals?.sgst || taxReport.sgst || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3">
                    <span className="text-primary text-xs font-semibold block">Total Tax Liability</span>
                    <span className="text-xl font-black text-primary">
                      ₹{Number(taxReport.totals?.tax || taxReport.total_tax || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {taxReport.by_tax_rate && taxReport.by_tax_rate.length > 0 && (
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3">Tax Slab</th>
                          <th className="py-2 px-3 text-right">Items Sold</th>
                          <th className="py-2 px-3 text-right">Gross Amount</th>
                          <th className="py-2 px-3 text-right">CGST</th>
                          <th className="py-2 px-3 text-right">SGST</th>
                          <th className="py-2 px-3 text-right">Total Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {taxReport.by_tax_rate.map((rate: any, i: number) => (
                          <tr key={i}>
                            <td className="py-2 px-3 font-bold">{rate.tax_rate}% GST</td>
                            <td className="py-2 px-3 text-right">{rate.items_sold}</td>
                            <td className="py-2 px-3 text-right">₹{Number(rate.gross).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">₹{Number(rate.cgst).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">₹{Number(rate.sgst).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-bold text-primary">₹{Number(rate.total_tax).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 5: Returns Report */}
      {activeTab === "returns" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Returns Summary</CardTitle>
            <CardDescription className="text-xs">Items refunded and stock returned to shelves</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading returns data...</div>
            ) : returnsReport.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No returns in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Return #</th>
                      <th className="py-2.5 px-3">Original Invoice</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3 text-right">Refund Total</th>
                      <th className="py-2.5 px-3">Refund Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {returnsReport.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-mono font-bold">{r.return_number}</td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{r.original_invoice || r.original_invoice_number}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="py-2.5 px-3">{r.customer || "Walk-in"}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-destructive">
                          -₹{Number(r.refund_amount || r.total_refund_amount).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 uppercase text-[11px]">{r.refund_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 6: Outstanding Udhaar Credit Ledger */}
      {activeTab === "outstanding" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer Udhaar / Outstanding Credit Ledger</CardTitle>
            <CardDescription className="text-xs">
              Track outstanding balances, credit limits, and record partial/full settlement payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Loading credit accounts...</div>
            ) : outstandingReport.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No outstanding customer credit balances.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Customer Name</th>
                      <th className="py-2.5 px-3">Phone</th>
                      <th className="py-2.5 px-3 text-right">Credit Limit</th>
                      <th className="py-2.5 px-3 text-right">Outstanding Due</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {outstandingReport.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-semibold">{c.name || c.full_name}</td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">{c.phone}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          ₹{Number(c.credit_limit || 5000).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-destructive">
                          ₹{Number(c.outstanding_credit || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedCust(c);
                              setSettleAmount(String(c.outstanding_credit));
                              setSettleModalOpen(true);
                            }}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Record Payment
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL: Settle Credit Payment */}
      <Dialog open={settleModalOpen} onOpenChange={setSettleModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Udhaar Payment</DialogTitle>
          </DialogHeader>

          {selectedCust && (
            <form onSubmit={handleSettleCredit} className="space-y-3 py-2 text-xs">
              <div className="rounded bg-muted p-2.5">
                <p className="font-semibold text-muted-foreground">Customer</p>
                <p className="text-sm font-bold">{selectedCust.name || selectedCust.full_name}</p>
                <p className="text-xs text-destructive font-semibold">
                  Outstanding Due: ₹{Number(selectedCust.outstanding_credit).toFixed(2)}
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-1">Payment Received (₹) *</label>
                <Input
                  required
                  type="number"
                  step="any"
                  min="0.01"
                  max={selectedCust.outstanding_credit}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="text-sm font-bold"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Payment Method</label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="h-9 w-full rounded border px-2 text-xs"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="CARD">Card</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Reference / Note</label>
                <Input
                  placeholder="e.g. UPI Ref / Cash receipt"
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSettleModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={settling} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {settling ? "Recording..." : "Confirm & Settle"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
