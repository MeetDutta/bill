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
