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
