import api from "@/lib/api";
import type {
  PaginatedResponse,
  User,
  Organization,
  Store,
  Customer,
  Transaction,
  Product,
  Campaign,
  Coupon,
  DashboardData,
  LoginPayload,
  RegisterPayload,
  EngagementDashboard,
  Customer360,
  SegmentSummary,
} from "@/types";

// Auth
export const authApi = {
  login: (data: LoginPayload) => api.post("/auth/login/", data),
  register: (data: RegisterPayload) => api.post("/auth/register/", data),
  getProfile: () => api.get<User>("/auth/profile/"),
  updateProfile: (data: Partial<User>) => api.patch<User>("/auth/profile/", data),
};

// Organizations
export const organizationApi = {
  list: () => api.get<PaginatedResponse<Organization>>("/organizations/"),
  get: (id: string) => api.get<Organization>(`/organizations/${id}/`),
  update: (id: string, data: Partial<Organization>) => api.patch<Organization>(`/organizations/${id}/`, data),
};

// Stores
export const storeApi = {
  list: () => api.get<PaginatedResponse<Store>>("/stores/"),
  get: (id: string) => api.get<Store>(`/stores/${id}/`),
  create: (data: Partial<Store>) => api.post<Store>("/stores/", data),
  update: (id: string, data: Partial<Store>) => api.patch<Store>(`/stores/${id}/`, data),
};

// Customers
export const customerApi = {
  list: () => api.get<PaginatedResponse<Customer>>("/customers/"),
  get: (id: string) => api.get<Customer>(`/customers/${id}/`),
  create: (data: Partial<Customer>) => api.post<Customer>("/customers/", data),
  update: (id: string, data: Partial<Customer>) => api.patch<Customer>(`/customers/${id}/`, data),
  getTimeline: (id: string) => api.get(`/customers/${id}/timeline/`),
};

// Products
export const productApi = {
  list: () => api.get<PaginatedResponse<Product>>("/products/"),
  get: (id: string) => api.get<Product>(`/products/${id}/`),
  create: (data: Partial<Product>) => api.post<Product>("/products/", data),
  update: (id: string, data: Partial<Product>) => api.patch<Product>(`/products/${id}/`, data),
};

// Transactions
export const transactionApi = {
  list: () => api.get<PaginatedResponse<Transaction>>("/transactions/"),
  get: (id: string) => api.get<Transaction>(`/transactions/${id}/`),
  ingest: (data: unknown) => api.post("/transactions/ingest/", data),
};

// Campaigns
export const campaignApi = {
  list: () => api.get<PaginatedResponse<Campaign>>("/campaigns/"),
  get: (id: string) => api.get<Campaign>(`/campaigns/${id}/`),
  create: (data: Partial<Campaign>) => api.post<Campaign>("/campaigns/", data),
  update: (id: string, data: Partial<Campaign>) => api.patch<Campaign>(`/campaigns/${id}/`, data),
};

// Coupons
export const couponApi = {
  list: () => api.get<PaginatedResponse<Coupon>>("/coupons/"),
  get: (id: string) => api.get<Coupon>(`/coupons/${id}/`),
  create: (data: Partial<Coupon>) => api.post<Coupon>("/coupons/", data),
  update: (id: string, data: Partial<Coupon>) => api.patch<Coupon>(`/coupons/${id}/`, data),
};

// Analytics
export const analyticsApi = {
  getDashboard: () => api.get<DashboardData>("/analytics/"),
  getSales: () => api.get("/analytics/sales/"),
  getCustomers: () => api.get("/analytics/customers/"),
  getCampaigns: () => api.get("/analytics/campaigns/"),
  getRevenueTrend: () => api.get("/analytics/revenue-trend/"),
  getCustomerGrowth: () => api.get("/analytics/customer-growth/"),
};

// Loyalty
export const loyaltyApi = {
  getAccounts: () => api.get("/loyalty/accounts/"),
  getRules: () => api.get("/loyalty/rules/"),
  getTransactions: () => api.get("/loyalty/transactions/"),
};

// WhatsApp
export const whatsappApi = {
  getConfig: () => api.get("/whatsapp/config/"),
  updateConfig: (data: unknown) => api.patch("/whatsapp/config/", data),
  getMessages: () => api.get("/whatsapp/messages/"),
  getTemplates: () => api.get("/whatsapp/templates/"),
};

// Customer engagement
export const engagementApi = {
  dashboard: () => api.get<EngagementDashboard>("/engagement/dashboard/"),
  customer360: (id: string) => api.get<Customer360>(`/engagement/customers/${id}/`),
  score: (id: string) => api.get(`/engagement/customers/${id}/score/`),
  segments: () => api.get<SegmentSummary[]>("/engagement/segments/"),
  reviews: () => api.get("/engagement/reviews/"),
  referrals: () => api.get("/engagement/referrals/"),
  generateCampaign: (goal: string) => api.post("/engagement/campaign-assistant/", { goal }),
};
