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
  Invoice,
  Quotation,
  Supplier,
  PurchaseOrder,
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

// V2 Customer Intelligence
export const customerIntelligenceApi = {
  getHealth: (id: string) => api.get(`/customers/${id}/health/`),
  getChurn: (id: string) => api.get(`/customers/${id}/churn/`),
  getNextAction: (id: string) => api.get(`/customers/${id}/next-action/`),
  getRecommendations: (id: string) => api.get(`/customers/${id}/recommendations/`),
  createOffer: (id: string, data?: unknown) => api.post(`/customers/${id}/create-recommended-offer/`, data),
  getRFM: (id: string) => api.get(`/customers/${id}/rfm/`),
  getAtRisk: (limit = 20) => api.get("/analytics/churn/at-risk/", { params: { limit } }),
};

// V2 Analytics & RFM
export const intelligenceAnalyticsApi = {
  getRFMDistribution: () => api.get("/analytics/rfm/distribution/"),
  getRFMSummary: () => api.get("/analytics/rfm/summary/"),
  getRFMCustomers: (params?: { segment?: string; search?: string; page?: number }) =>
    api.get("/analytics/rfm/customers/", { params }),
  getBusinessHealth: () => api.get("/analytics/business-health/"),
  getRetentionMetrics: () => api.get("/analytics/customer-retention/"),
  getCohorts: () => api.get("/analytics/cohorts/"),
  getAlerts: () => api.get("/analytics/alerts/"),
  acknowledgeAlert: (id: string) => api.post(`/analytics/alerts/${id}/acknowledge/`),
  dismissAlert: (id: string) => api.post(`/analytics/alerts/${id}/dismiss/`),
  getStoreComparison: () => api.get("/analytics/stores/comparison/"),
  getStaffPerformance: () => api.get("/analytics/staff/"),
};

// V2 Product Intelligence
export const productIntelligenceApi = {
  getAnalytics: () => api.get("/products/intelligence/"),
  getAffinity: () => api.get("/products/affinity/"),
  getBundles: () => api.get("/products/bundles/"),
};

// V2 Campaign ROI
export const campaignIntelligenceApi = {
  getROISummary: () => api.get("/campaigns/roi/"),
  getCampaignROI: (id: string) => api.get(`/campaigns/${id}/roi/`),
};

// V2 AI Business Copilot
export const copilotApi = {
  query: (question: string) => api.post("/copilot/query/", { question }),
};

// V2 Customer Mini Portal
export const customerPortalApi = {
  getPortalData: (token: string) => api.get(`/customer-portal/${token}/`),
};

// Universal POS & Billing Engine
export const posApi = {
  getConfig: () => api.get("/pos/config/"),
  updateConfig: (data: unknown) => api.post("/pos/config/", data),
  getBusinessTypes: () => api.get("/pos/business-types/"),
  searchProducts: (params?: { search?: string; category?: string; low_stock?: boolean; page?: number; page_size?: number }) =>
    api.get("/pos/products/", { params }),
  quickCreateProduct: (data: unknown) => api.post("/pos/products/quick-create/", data),
  calculateCart: (data: unknown) => api.post("/pos/cart/calculate/", data),
  checkout: (data: unknown) => api.post("/pos/checkout/", data),
  getHeldCarts: () => api.get("/pos/held-carts/"),
  holdCart: (data: unknown) => api.post("/pos/held-carts/", data),
  deleteHeldCart: (id: string) => api.delete(`/pos/held-carts/${id}/`),
  processReturn: (data: unknown) => api.post("/pos/returns/", data),
  recordCreditPayment: (data: unknown) => api.post("/pos/credit/payment/", data),
  getCustomerLedger: (customerId: string) => api.get(`/pos/credit/customers/${customerId}/`),
  getRegisterStatus: () => api.get("/pos/register/current/"),
  openRegister: (data: { opening_balance: number; notes?: string }) => api.post("/pos/register/open/", data),
  addRegisterMovement: (data: { movement_type: "in" | "out"; amount: number; notes?: string }) =>
    api.post("/pos/register/movement/", data),
  closeRegister: (data: { actual_cash: number; notes?: string }) => api.post("/pos/register/close/", data),
  getInventoryMovements: (params?: unknown) => api.get("/pos/inventory/movements/", { params }),
  adjustInventory: (data: unknown) => api.post("/pos/inventory/adjust/", data),
  getManualAdjustments: (params?: unknown) => api.get("/pos/inventory/adjustments/", { params }),
  getPurchaseOrders: (params?: unknown) => api.get("/pos/inventory/purchases/", { params }),
  createPurchaseOrder: (data: unknown) => api.post("/pos/inventory/purchases/", data),
  receivePurchaseOrder: (id: string, data?: unknown) => api.post(`/pos/inventory/purchases/${id}/receive/`, data),
  cancelPurchaseOrder: (id: string, data?: unknown) => api.post(`/pos/inventory/purchases/${id}/cancel/`, data),
  getPaymentLedger: (params?: unknown) => api.get("/pos/finance/payments/", { params }),
  getReceivables: (params?: unknown) => api.get("/pos/finance/receivables/", { params }),
  getPayables: (params?: unknown) => api.get("/pos/finance/payables/", { params }),
  recordSupplierPayment: (data: unknown) => api.post("/pos/finance/supplier-payments/", data),
  getSalesReport: (params?: unknown) => api.get("/pos/reports/sales/", { params }),
  getPaymentsReport: (params?: unknown) => api.get("/pos/reports/payments/", { params }),
  getProductSalesReport: (params?: unknown) => api.get("/pos/reports/product-sales/", { params }),
  getTaxReport: (params?: unknown) => api.get("/pos/reports/tax/", { params }),
  getReturnsReport: (params?: unknown) => api.get("/pos/reports/returns/", { params }),
  getOutstandingReport: (params?: unknown) => api.get("/pos/reports/outstanding/", { params }),
  getDailyClosingReport: (params?: unknown) => api.get("/pos/reports/daily-closing/", { params }),
  getPOSRegisterReport: (params?: unknown) => api.get("/pos/reports/pos-register/", { params }),
};

// Invoice Management
export const invoiceApi = {
  list: (params?: {
    search?: string;
    customer_id?: string;
    payment_status?: string;
    invoice_type?: string;
    template_format?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
  }) => api.get<PaginatedResponse<Invoice>>("/invoices/", { params }),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}/`),
  getPublic: (token: string) => api.get(`/invoices/view/${token}/`),
  generatePdf: (id: string) => api.post<{ id: string; invoice_number: string; pdf_url: string; web_url: string }>(`/invoices/${id}/pdf/`),
};

// Quotation Management
export const quotationApi = {
  list: (params?: {
    search?: string;
    status?: string;
    customer_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
  }) => api.get<PaginatedResponse<Quotation>>("/quotations/", { params }),
  get: (id: string) => api.get<Quotation>(`/quotations/${id}/`),
  create: (data: unknown) => api.post<Quotation>("/quotations/", data),
  update: (id: string, data: unknown) => api.patch<Quotation>(`/quotations/${id}/`, data),
  delete: (id: string) => api.delete(`/quotations/${id}/`),
  convert: (id: string, data?: { payment_method?: string }) =>
    api.post<{
      message: string;
      invoice_id: string;
      invoice_number: string;
      quotation_id: string;
      quotation_number: string;
      pdf_url: string;
      web_url: string;
      total: string;
    }>(`/quotations/${id}/convert/`, data),
};

// Supplier Management
export const supplierApi = {
  list: (params?: { search?: string; is_active?: boolean; page?: number }) =>
    api.get<PaginatedResponse<Supplier>>("/suppliers/", { params }),
  get: (id: string) => api.get<Supplier>(`/suppliers/${id}/`),
  create: (data: Partial<Supplier>) => api.post<Supplier>("/suppliers/", data),
  update: (id: string, data: Partial<Supplier>) => api.patch<Supplier>(`/suppliers/${id}/`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}/`),
  getPurchases: (id: string, params?: { page?: number }) =>
    api.get<PaginatedResponse<PurchaseOrder>>(`/suppliers/${id}/purchases/`, { params }),
};


