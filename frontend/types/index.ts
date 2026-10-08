export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: string;
  organization: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  country: string;
  is_active: boolean;
}

export interface Store {
  id: string;
  name: string;
  code: string;
  city: string;
  phone: string;
  status: string;
}

export interface Customer {
  id: string;
  customer_id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  phone: string;
  email: string;
  city?: string;
  total_purchases: number;
  total_spend: number;
  segment: string;
  last_purchase_at: string;
  portal_token?: string;
  credit_limit?: number | string;
  outstanding_credit?: number | string;
  is_walk_in?: boolean;
}

export interface Transaction {
  id: string;
  invoice_number: string;
  customer: string;
  store: string;
  total: number;
  payment_method: string;
  status: string;
  transaction_date: string;
  item_count: number;
  items?: any[];
}

export interface Product {
  id: string;
  external_id: string;
  name: string;
  sku: string;
  unit_price: number;
  tax_rate: number;
  is_active: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_delivered?: number;
  total_read?: number;
  total_failed?: number;
  scheduled_at?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  min_order_value?: number;
  start_at?: string;
  expires_at: string;
  usage_limit: number;
  used_count: number;
  is_active: boolean;
}

export interface TrendPoint {
  date: string;
  formatted_date: string;
  revenue: number;
  transactions: number;
}

export interface GrowthPoint {
  date: string;
  formatted_date: string;
  new_customers: number;
  total_customers: number;
}

export interface DashboardData {
  total_revenue: string;
  total_transactions: number;
  total_customers: number;
  new_customers_today: number;
  active_campaigns: number;
  total_loyalty_points: string;
  total_coupons_redeemed: number;
  has_revenue_data: boolean;
  has_customer_data: boolean;
  revenue_trend: TrendPoint[];
  customer_growth: GrowthPoint[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  password: string;
}

export interface EngagementOpportunity { key: string; icon: string; title: string; count: number; action: string; }
export interface EngagementDashboard {
  opportunities: EngagementOpportunity[];
  customer_totals: { total: number; vip: number; inactive: number; new_30d: number };
  reviews: { count: number; average: number };
  campaigns: { active: number };
}
export interface Customer360 {
  customer: Customer & { name: string; average_order_value: string; preferred_store?: string | null; created_at: string };
  engagement: { score: number; label: string; reasons: string[] };
  loyalty: { balance: string; total_earned: string; total_redeemed: string; total_expired: string } | null;
  recommended_action: { title: string; reason: string; suggested_offer: string };
  transactions: { id: string; invoice_number: string; total: string; date: string; payment_method: string; items: number }[];
  timeline: { id: string; event_type: string; reference_id: string; metadata: Record<string, unknown>; created_at: string }[];
}
export interface SegmentSummary { key: string; name: string; count: number; description: string; }

export interface RFMSegmentDistribution {
  segment: string;
  count: number;
  percentage: number;
  total_spend: number;
  avg_spend: number;
  avg_recency_days: number;
  description: string;
}

export interface RFMProfile {
  id: string;
  customer: string;
  customer_name: string;
  customer_phone: string;
  recency_days: number;
  frequency_count: number;
  monetary_value: string | number;
  r_score: number;
  f_score: number;
  m_score: number;
  rfm_score: string;
  segment: string;
  calculated_at: string;
}

export interface CustomerHealth {
  customer_id: string;
  score: number;
  status: "EXCELLENT" | "HEALTHY" | "STABLE" | "AT_RISK" | "CRITICAL";
  risk_factors: string[];
  positive_factors: string[];
  recommended_action: string;
}

export interface ChurnPredictionData {
  customer_id: string;
  customer_name: string;
  churn_probability: number;
  churn_risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  prediction_reason: string;
  risk_factors: string[];
  last_purchase_at?: string | null;
  days_since_last_purchase?: number | null;
  average_purchase_interval_days: number;
  lifetime_value: number;
  recommended_action: string;
  predicted_at: string;
}

export interface NextBestActionData {
  action: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  recommended_offer: string;
  recommended_channel: string;
}

export interface SmartOfferData {
  customer_id: string;
  customer_name: string;
  offer_title: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  reason: string;
  requires_merchant_approval: boolean;
  can_create_coupon: boolean;
}

export interface ProductAffinityItem {
  id: string;
  product_a: { id: string; name: string; price: number };
  product_b: { id: string; name: string; price: number };
  co_occurrence_count: number;
  affinity_score: number;
  text_insight: string;
}

export interface ProductBundleItem {
  bundle_name: string;
  products: { id: string; name: string; price: number }[];
  individual_price: number;
  suggested_bundle_price: number;
  discount_percentage: number;
  savings: number;
  affinity_score: number;
  reason: string;
  requires_merchant_review: boolean;
}

export interface CampaignROIItem {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  sent_at?: string | null;
  recipients: number;
  delivered: number;
  read: number;
  conversions: number;
  conversion_rate: number;
  attributed_revenue: number;
  campaign_cost: number;
  roi: string;
  roi_numeric: number;
  revenue_per_recipient: number;
  attribution_window_days: number;
  is_direct_attribution: boolean;
}

export interface BusinessHealthData {
  overall_score: number;
  sales_growth: number;
  customer_retention: number;
  customer_loyalty: number;
  marketing: number;
  product_performance: number;
  weakest_area: string;
  scores: Record<string, number>;
}

export interface BusinessAlertItem {
  id: string;
  alert_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description: string;
  entity_type?: string;
  entity_id?: string;
  recommended_action: string;
  is_acknowledged: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export interface CustomerPortalData {
  customer: {
    name: string;
    phone: string;
    email: string;
    city?: string;
    joined_date: string;
    total_purchases: number;
    total_spend: number;
  };
  loyalty: {
    tier: {
      id: string;
      name: string;
      slug: string;
      min_spend: number;
      points_multiplier: number;
      badge_color: string;
      perks: string[];
    };
    next_tier: {
      name: string;
      min_spend: number;
      spend_needed: number;
    } | null;
    tier_progress_percentage: number;
    points_balance: number;
    total_points_earned: number;
  };
  achievements: {
    slug: string;
    name: string;
    description: string;
    badge_icon: string;
    unlocked_at: string;
  }[];
  recent_invoices: {
    id: string;
    invoice_number: string;
    total: number;
    date: string;
    token: string;
  }[];
  available_rewards: {
    id: string;
    code: string;
    name: string;
    discount_type: string;
    discount_value: number;
    min_order_value: number;
    valid_until: string;
  }[];
  recommendations: {
    id: string;
    name: string;
    price: number;
    affinity_insight: string;
  }[];
}

// ==========================================
// UNIVERSAL BUSINESS POS & BILLING TYPES
// ==========================================

export interface CustomFieldDefinition {
  key: string;
  field_name?: string;
  label: string;
  type: "text" | "number" | "select" | string;
  required?: boolean;
  searchable?: boolean;
  options?: string[];
}

export interface BusinessTypeSchema {
  key: string;
  label: string;
  name?: string;
  description: string;
  default_tax_rate: number;
  supported_units: string[];
  custom_fields: CustomFieldDefinition[];
}

export interface BusinessConfig {
  id: string;
  business_type: string;
  business_type_display: string;
  schema: BusinessTypeSchema;
  gst_enabled: boolean;
  tax_mode: "exclusive" | "inclusive";
  default_tax_rate: string | number;
  gstin: string;
  trade_name: string;
  allow_credit_sales: boolean;
  default_credit_limit: string | number;
  default_invoice_format: "a4" | "thermal_80mm" | "thermal_58mm";
  invoice_prefix: string;
  invoice_terms_and_conditions: string;
  invoice_footer: string;
  allow_negative_stock: boolean;
  max_cashier_discount_percent: string | number;
  require_customer: boolean;
  auto_print_bill: boolean;
  auto_send_digital_bill: boolean;
  low_stock_threshold: string | number;
  updated_at: string;
}

export interface POSProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  qr_code?: string;
  category?: string;
  brand?: string;
  description?: string;
  selling_price: string | number;
  purchase_price: string | number;
  mrp?: string | number | null;
  tax_rate: string | number;
  hsn_code?: string;
  unit: string;
  current_stock: string | number;
  min_stock?: string | number;
  max_stock?: string | number;
  supplier?: string;
  track_inventory: boolean;
  is_active: boolean;
  is_low_stock?: boolean;
  product_attributes: Record<string, any>;
}

export interface POSCartItem {
  product_id?: string;
  sku?: string;
  barcode?: string;
  name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  discount_type?: "fixed" | "percentage";
  tax_rate: number;
  hsn_code?: string;
  unit?: string;
  attributes?: Record<string, any>;
  current_stock?: number;
  track_inventory?: boolean;
  line_subtotal?: number;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  tax?: number;
  total?: number;
}

export interface POSCalculateResponse {
  items: POSCartItem[];
  subtotal: string;
  item_discount: string;
  order_discount: string;
  coupon_discount: string;
  total_discount: string;
  taxable_amount: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  tax_breakup: {
    total_taxable: string;
    total_cgst: string;
    total_sgst: string;
    total_igst: string;
    total_tax: string;
    rates: {
      rate: string;
      taxable_amount: string;
      cgst_amount: string;
      sgst_amount: string;
      igst_amount: string;
      total_tax: string;
    }[];
  };
  round_off: string;
  grand_total: string;
}

export interface POSPaymentLine {
  payment_method: string;
  amount: number;
  reference?: string;
  notes?: string;
}

export interface POSCheckoutPayload {
  store_id?: string;
  items: POSCartItem[];
  overall_discount_type?: "fixed" | "percentage";
  overall_discount_value?: number;
  coupon_discount?: number;
  is_interstate?: boolean;
  is_walk_in?: boolean;
  customer?: {
    id?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  payments: POSPaymentLine[];
  due_date?: string;
  idempotency_key?: string;
}

export interface POSCheckoutResponse {
  id: string;
  invoice_number: string;
  transaction_date: string;
  customer: {
    id: string | null;
    name: string;
    phone: string;
    outstanding_credit: string;
    is_walk_in: boolean;
  } | null;
  store: {
    id: string | null;
    name: string;
  } | null;
  subtotal: string;
  discount: string;
  tax: string;
  round_off: string;
  total: string;
  amount_paid: string;
  outstanding_amount: string;
  payment_status: "paid" | "partial" | "credit";
  payment_method: string;
  tax_breakup: any;
  items: any[];
  payments: any[];
  invoice: {
    id: string | null;
    invoice_number: string;
    invoice_type: string;
    template_format: string;
    web_url: string;
    pdf_url: string;
    secure_token: string;
  } | null;
}

export interface HeldCart {
  id: string;
  hold_reference: string;
  customer_name?: string;
  customer_phone?: string;
  cart_data: any;
  subtotal: string;
  item_count: number;
  notes?: string;
  store_name?: string;
  cashier_name?: string;
  created_at: string;
}

export interface CashRegister {
  id: string;
  store_id?: string;
  store_name?: string;
  opened_by: string;
  closed_by?: string | null;
  opened_at: string;
  closed_at?: string | null;
  status: "open" | "closed";
  opening_balance: string;
  total_cash_sales: string;
  total_cash_refunds: string;
  cash_added: string;
  cash_withdrawn: string;
  expected_cash: string;
  actual_cash?: string;
  difference?: string;
  notes?: string;
}

export interface InventoryMovement {
  id: string;
  product: string;
  product_name: string;
  sku: string;
  store_name?: string;
  user_name?: string;
  movement_type: "SALE" | "PURCHASE" | "RETURN" | "ADJUSTMENT" | "DAMAGE" | "OPENING_STOCK" | "TRANSFER";
  quantity: string;
  previous_stock: string;
  new_stock: string;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  product: string;
  product_name: string;
  quantity: string;
  purchase_price: string;
  tax_rate: string;
  total: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier: string;
  supplier_ref?: string | null;
  supplier_name?: string;
  supplier_invoice_number: string;
  purchase_date: string;
  expected_delivery?: string | null;
  due_date?: string | null;
  total_amount: string;
  paid_amount?: string;
  outstanding_amount?: string;
  payment_status?: string;
  tax_amount: string;
  status: string;
  notes: string;
  created_by_name: string;
  items: PurchaseOrderItem[];
  created_at: string;
}

export interface PaymentLedgerItem {
  id: string;
  date: string;
  direction: "incoming" | "outgoing";
  entity_type: "customer" | "supplier";
  entity_name: string;
  invoice_or_ref: string;
  payment_method: string;
  amount: string;
  reference?: string;
  status: string;
  notes?: string;
  cashier_name?: string;
}

export interface ReceivableItem {
  transaction_id: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: string;
  paid: string;
  outstanding: string;
  days_overdue: number;
  status: "CURRENT" | "DUE_SOON" | "OVERDUE";
  store_name?: string;
}

export interface PayableItem {
  po_id: string;
  po_number: string;
  supplier_id?: string | null;
  supplier_name: string;
  supplier_invoice_number?: string;
  purchase_date: string;
  due_date: string;
  total: string;
  paid: string;
  outstanding: string;
  days_overdue: number;
  status: "CURRENT" | "DUE_SOON" | "OVERDUE";
}

export interface POSRegisterReportSession {
  register_id: string;
  store_name: string;
  cashier_name: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  opening_balance: string;
  cash_sales: string;
  cash_refunds: string;
  expected_closing_cash: string;
  actual_closing_cash: string;
  cash_variance: string;
  notes?: string;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  original_invoice_number: string;
  total_refund_amount: string;
  refund_method: string;
  created_at: string;
  status: string;
  items_returned_count: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type?: string;
  template_format?: string;
  pdf_url?: string;
  web_url?: string;
  is_viewed?: boolean;
  viewed_at?: string;
  created_at: string;
  customer_name?: string;
  customer_phone?: string;
  store_name?: string;
  transaction_date?: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  payment_status?: string;
  payment_method?: string;
  origin_quotation_id?: string;
  origin_quotation_number?: string;
  terms_and_conditions?: string;
  custom_notes?: string;
  transaction_details?: any;
}

export interface QuotationItem {
  id?: string;
  product?: string | null;
  product_id?: string | null;
  name: string;
  quantity: number | string;
  unit_price: number | string;
  discount: number | string;
  tax_rate: number | string;
  tax?: number | string;
  total?: number | string;
  hsn_code?: string;
  unit?: string;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  customer?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  store?: string | null;
  store_name?: string;
  quotation_date: string;
  valid_until?: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  notes?: string;
  terms_and_conditions?: string;
  items_count?: number;
  items?: QuotationItem[];
  converted_invoice?: string | null;
  converted_invoice_number?: string | null;
  converted_at?: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  notes?: string;
  opening_balance?: string | number;
  is_active: boolean;
  purchase_orders_count?: number;
  total_purchases?: string | number;
  created_at?: string;
  updated_at?: string;
}

