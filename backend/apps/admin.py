from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

# Register all models
from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.customers.models import Customer, CustomerTimeline
from apps.products.models import Product, ProductCategory
from apps.transactions.models import Transaction, TransactionItem
from apps.invoices.models import Invoice
from apps.loyalty.models import LoyaltyAccount, LoyaltyRule, LoyaltyTransaction, LoyaltyRedemption
from apps.coupons.models import Coupon, CouponRedemption
from apps.campaigns.models import Campaign, CampaignMessage
from apps.automations.models import Automation, AutomationExecution
from apps.whatsapp.models import WhatsAppConfig, WhatsAppTemplate, WhatsAppMessage
from apps.integrations.models import Integration, IntegrationLog
from apps.notifications.models import Notification
from apps.analytics.models import DailySalesReport, CustomerAnalytics, CampaignAnalytics
from apps.subscriptions.models import Plan, Subscription, SubscriptionUsage
from apps.billing.models import AuditLog

# All models are already registered in their respective admin.py files
