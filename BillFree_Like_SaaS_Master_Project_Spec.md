# BILLFREE-LIKE CUSTOMER ENGAGEMENT SAAS
## Master Project Specification for Antigravity

Version: 1.0
Purpose: This document is the single source of truth for designing and implementing the project.

---

# 1. PROJECT OBJECTIVE

Build a production-ready, multi-tenant SaaS platform inspired by BillFree's business model.

The platform is NOT intended to be only a billing/POS application.

Its primary purpose is:

POS/ERP Transaction
-> Customer Data
-> Digital Bill
-> CRM
-> Loyalty
-> Coupons
-> WhatsApp Engagement
-> Marketing Automation
-> Customer Retention
-> Analytics

The product should help retail businesses convert every transaction into a long-term customer relationship and increase repeat purchases.

Important:
- Build an original implementation and UI.
- Do not copy BillFree's source code, branding, copyrighted UI, text, assets, or proprietary implementation.
- Match the functional category and business workflow, not the protected implementation.

---

# 2. TARGET USERS

The platform is a SaaS product for retail businesses.

Primary customer:
- Retail stores
- Multi-branch retailers
- Businesses already using POS/ERP/billing software
- Businesses wanting digital bills, CRM, WhatsApp marketing and loyalty

Platform roles:

1. Super Admin
   - Controls the SaaS platform
   - Businesses/tenants
   - Plans and subscriptions
   - Usage
   - Integrations
   - System monitoring
   - Support

2. Business Owner / Organization Admin
   - Controls one organization
   - Stores
   - Staff
   - Customers
   - Campaigns
   - Loyalty
   - Coupons
   - Analytics
   - Integrations

3. Store Manager
   - Controls assigned stores
   - Store-level customers and reports
   - Campaign access according to permissions

4. Staff
   - Customer lookup
   - Transaction/bill lookup
   - Loyalty operations
   - Limited CRM access

5. Customer
   - Receives digital bills
   - Receives WhatsApp notifications
   - Views rewards/coupons through secure web links
   - Redeems eligible rewards

---

# 3. TECHNOLOGY STACK

Use this stack unless a technical reason requires a documented change.

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Query / TanStack Query
- React Hook Form
- Zod
- Recharts or equivalent chart library

## Backend

- Python
- Django
- Django REST Framework
- PostgreSQL
- Redis
- Celery

## Messaging

- Meta WhatsApp Cloud API
- Email provider
- SMS provider as a pluggable integration

## Storage

- AWS S3 or Cloudflare R2

## Infrastructure

- Docker
- Nginx or cloud load balancer
- AWS initially
- GitHub Actions CI/CD

## Monitoring

- Sentry
- Application logging
- Health checks
- Metrics-ready architecture

## AI

Keep AI as a separate backend module/service boundary.

Initial AI capabilities:
- Campaign content generation
- Customer insights
- Customer segmentation suggestions
- Churn-risk prediction
- Offer recommendations

Do not make AI a dependency for core billing, CRM, loyalty or messaging functionality.

---

# 4. ARCHITECTURE PRINCIPLE

Start with a MODULAR MONOLITH, not microservices.

Backend structure should be modular Django applications:

backend/
  config/
  apps/
    authentication/
    organizations/
    users/
    stores/
    customers/
    products/
    transactions/
    invoices/
    loyalty/
    coupons/
    campaigns/
    automations/
    whatsapp/
    integrations/
    notifications/
    analytics/
    subscriptions/
    billing/
    reports/
    ai/
  common/
  manage.py

The system should be designed so high-load modules can later be extracted into services without rewriting the whole product.

---

# 5. HIGH-LEVEL ARCHITECTURE

User
|
v
Next.js Web Application
|
v
Django REST API
|
+-------------------+
|                   |
v                   v
PostgreSQL         Redis
                     |
                     v
                  Celery
                     |
        +------------+------------+
        |            |            |
        v            v            v
     WhatsApp       Email        SMS
       API

External POS/ERP systems
|
v
Integration API/Webhooks
|
v
Transaction Normalization
|
v
Customer + Transaction Engine
|
v
CRM / Loyalty / Marketing / Analytics

---

# 6. MULTI-TENANCY

This is mandatory.

Every business is an organization/tenant.

Example:

Platform
|
+-- Organization A
|    +-- Store A1
|    +-- Store A2
|    +-- Customers
|    +-- Transactions
|
+-- Organization B
|    +-- Store B1
|    +-- Customers
|    +-- Transactions

Never allow Organization A to access Organization B data.

Important:
- organization_id must be present on tenant-owned records
- enforce tenant filtering in backend services/querysets
- do not trust organization_id supplied by frontend
- derive organization context from authenticated user/session/API credential
- enforce authorization server-side
- add automated tests for tenant isolation

---

# 7. CORE MODULES

## 7.1 Authentication

Features:
- Login
- Logout
- Registration
- Password reset
- Email verification
- Role-based permissions
- Session/token management
- Optional 2FA-ready architecture

## 7.2 Organization Management

Fields:
- Organization name
- Legal/business name
- Logo
- Contact details
- Address
- GST/tax information if applicable
- Timezone
- Currency
- Default language
- Business settings

## 7.3 Store Management

Fields:
- Store name
- Store code
- Address
- Phone
- Manager
- Status
- Business hours
- WhatsApp configuration where applicable

## 7.4 User & Staff Management

Features:
- Invite staff
- Assign roles
- Assign stores
- Activate/deactivate users
- Permission matrix

---

# 8. CUSTOMER CRM

Customer profile should include:

- Customer ID
- Name
- Phone
- Email
- Date of birth (optional)
- Anniversary date (optional)
- Address (optional)
- Tags
- Preferred store
- Source
- Created date
- Last purchase
- Total purchases
- Total spend
- Average order value
- Loyalty balance
- Customer segment
- Marketing consent/status
- WhatsApp opt-in/status

Customer timeline:

Customer created
-> Purchase
-> Bill sent
-> Loyalty earned
-> Coupon received
-> Campaign received
-> Coupon redeemed
-> Feedback
-> Referral
-> Repeat purchase

Important:
- Keep customer identity normalized by phone number within an organization.
- Avoid duplicate customer creation.
- Provide merge/duplicate-resolution functionality later.

---

# 9. TRANSACTION ENGINE

This is one of the most important modules.

The platform should NOT initially require businesses to replace their existing POS.

Support:
- REST API
- Webhooks
- Manual transaction creation for testing
- Import-ready architecture
- Future POS/ERP connectors

Standard transaction payload:

{
  "store_id": "STORE001",
  "invoice_number": "INV1025",
  "transaction_date": "2026-08-12T14:00:00",
  "customer": {
    "name": "Rahul Sharma",
    "phone": "9876543210",
    "email": "rahul@example.com"
  },
  "items": [
    {
      "external_product_id": "P001",
      "name": "Product A",
      "quantity": 2,
      "unit_price": 500,
      "discount": 0,
      "tax": 90,
      "total": 1090
    }
  ],
  "subtotal": 1000,
  "discount": 0,
  "tax": 90,
  "total": 1090,
  "payment_method": "UPI",
  "external_source": "CUSTOM_POS",
  "external_transaction_id": "TXN123"
}

The backend should normalize all external systems into an internal transaction model.

---

# 10. DIGITAL BILL FLOW

Primary flow:

Customer purchases
-> POS/ERP creates invoice
-> POS/ERP sends transaction to integration API
-> Validate request
-> Authenticate integration
-> Validate store
-> Find/create customer
-> Save transaction
-> Save transaction items
-> Calculate loyalty
-> Generate digital bill
-> Create secure bill URL/PDF
-> Queue WhatsApp message
-> Celery worker sends WhatsApp template/document
-> Store message status
-> Customer receives bill

Do not perform slow external API calls synchronously when avoidable.

Use Celery for:
- PDF generation
- WhatsApp sending
- campaign processing
- notifications
- scheduled automations

---

# 11. DIGITAL BILL

Digital bill should have:
- Business branding
- Invoice number
- Date/time
- Store
- Customer
- Items
- Quantity
- Price
- Discounts
- Taxes
- Grand total
- Payment method
- Terms
- Contact details

Provide:
- Secure bill web page
- Optional PDF
- Share via WhatsApp
- Download option

Secure URLs should use non-guessable tokens and expiry/revocation where appropriate.

---

# 12. WHATSAPP SERVICE

Create a dedicated WhatsApp integration module.

Responsibilities:
- Connect business WhatsApp account
- Store credentials securely
- Send template messages
- Send documents
- Send images
- Send text where permitted
- Receive webhooks
- Process delivery/read/failed events
- Store external message IDs
- Retry safe failures
- Rate-limit outgoing jobs
- Maintain message audit trail

Important:
- Follow Meta WhatsApp Business/Cloud API policies.
- Do not design spam functionality.
- Track customer consent/opt-in and opt-out.
- Do not hardcode API credentials.
- Use environment variables/secrets management.

Internal service examples:

send_digital_bill()
send_coupon()
send_loyalty_notification()
send_birthday_message()
send_campaign_message()
send_review_request()

---

# 13. WHATSAPP MESSAGE LIFECYCLE

Message states:

QUEUED
-> PROCESSING
-> SENT
-> DELIVERED
-> READ

Failure path:

QUEUED
-> PROCESSING
-> FAILED
-> RETRY or PERMANENT_FAILURE

Store:
- provider_message_id
- customer_id
- campaign_id if applicable
- message type
- template
- timestamp
- status
- failure reason

---

# 14. CUSTOMER SEGMENTATION

Support rule-based segmentation first.

Examples:

New customer:
purchase_count = 1

VIP:
lifetime_spend >= configured threshold

Inactive:
days_since_last_purchase >= 90

Frequent:
purchase_count >= configured threshold

High-value:
average_order_value >= configured threshold

Product buyers:
customer bought a selected product/category

Store-specific:
customer purchased from selected store

Allow AND/OR conditions in a future advanced segment builder.

---

# 15. LOYALTY ENGINE

Use a ledger model.

Do NOT store loyalty only as one mutable number.

Tables/concepts:

loyalty_accounts
loyalty_transactions
loyalty_rewards
loyalty_redemptions

Example:

+500 PURCHASE
+100 REFERRAL
-200 REDEMPTION
-100 EXPIRY

Balance =
sum(credits) - sum(debits)

Features:
- Earn rules
- Redemption rules
- Expiry
- Manual adjustment with audit
- OTP/secure redemption-ready architecture
- Store-specific rules
- Customer wallet
- Loyalty history

---

# 16. COUPON ENGINE

Coupon fields:

- code
- name
- discount_type
- discount_value
- minimum_order_value
- maximum_discount
- start_at
- expires_at
- usage_limit
- per_customer_limit
- eligible_customers/segments
- eligible_stores
- eligible_products/categories
- active status

Coupon lifecycle:

Created
-> Active
-> Redeemed / Expired / Disabled

---

# 17. REFERRAL SYSTEM

Flow:

Existing customer gets referral link/code
-> New customer uses referral
-> New customer completes eligible purchase
-> System validates referral
-> Reward existing customer
-> Optional reward new customer
-> Record referral event

Must prevent:
- Self-referrals
- Duplicate reward
- Fraudulent repeated usage

---

# 18. MARKETING CAMPAIGNS

Campaign flow:

Create campaign
-> Select audience
-> Preview audience count
-> Select WhatsApp template
-> Preview message
-> Schedule/send
-> Create jobs
-> Celery workers
-> WhatsApp API
-> Track delivery/read/failure
-> Analytics

Campaign types:
- Promotional
- New customer
- Win-back
- Birthday
- Anniversary
- Festival
- Loyalty reminder
- Coupon reminder
- Review request

---

# 19. AUTOMATION ENGINE

Build a rule/event-driven architecture.

Example:

EVENT:
purchase_completed

CONDITION:
customer is new

ACTION:
send thank-you WhatsApp

Another:

EVENT:
daily_customer_check

CONDITION:
last_purchase > 90 days

ACTION:
create coupon
+
send WhatsApp

Another:

EVENT:
customer_birthday

ACTION:
generate/send birthday offer

Automation should support:
- Trigger
- Conditions
- Delay
- Action
- Active/inactive
- Execution history

Do not build a visual workflow editor in the first MVP unless time permits.

Start with configurable automation rules in the backend/admin UI.

---

# 20. REVIEWS AND FEEDBACK

Post-purchase flow:

Purchase completed
-> wait configured time
-> send feedback/review request
-> customer chooses rating
-> store feedback
-> optionally redirect satisfied users to Google review

Store:
- rating
- comment
- customer
- transaction
- store
- timestamp

Do not manipulate or fabricate reviews.

---

# 21. ANALYTICS

MVP dashboard:

Sales:
- Revenue
- Transactions
- Average order value
- Daily/weekly/monthly trends

Customers:
- Total customers
- New customers
- Returning customers
- Active customers
- Inactive customers

Marketing:
- Campaigns
- Messages sent
- Delivered
- Read
- Failed
- Coupon redemption

Loyalty:
- Points issued
- Points redeemed
- Points expired

Store:
- Store-wise revenue
- Store-wise customers
- Store comparison

Later:
- Customer lifetime value
- Retention cohorts
- Churn
- Campaign ROI
- Product/customer affinity
- Advanced analytics warehouse

---

# 22. SUBSCRIPTION / SAAS BILLING

Because this is a SaaS platform, build subscription architecture.

Plans can be based on:
- Stores
- Customers
- WhatsApp messages
- Campaigns
- Users
- Features

Example plans:

Starter
Professional
Business
Enterprise

Do not hardcode plan limits throughout the application.

Create:
plans
subscriptions
subscription_usage
feature_limits

Use a centralized entitlement service.

---

# 23. API ARCHITECTURE

Use versioned APIs:

/api/v1/auth/
/api/v1/organizations/
/api/v1/stores/
/api/v1/customers/
/api/v1/products/
/api/v1/transactions/
/api/v1/invoices/
/api/v1/loyalty/
/api/v1/coupons/
/api/v1/campaigns/
/api/v1/automations/
/api/v1/whatsapp/
/api/v1/integrations/
/api/v1/analytics/

External integration API:

/api/v1/integrations/transactions
/api/v1/integrations/customers
/api/v1/integrations/webhooks

Use:
- OpenAPI
- Authentication
- Rate limiting
- Pagination
- Filtering
- Sorting
- Validation
- Consistent error responses

---

# 24. IDEMPOTENCY

This is mandatory for transaction APIs.

POS systems may retry the same request.

Example:
external_transaction_id = TXN123

If the same transaction arrives twice:
- do not create two invoices
- return the existing transaction
- log the duplicate request safely

Use idempotency keys/external IDs.

---

# 25. SECURITY REQUIREMENTS

Implement:
- HTTPS
- Secure authentication
- Password hashing
- JWT/session security
- Role-based access control
- Tenant isolation
- Input validation
- CSRF protection where applicable
- CORS configuration
- Rate limiting
- Secure file access
- Secrets in environment variables/secrets manager
- Audit logs
- API request logging without sensitive data
- Encryption for sensitive credentials where appropriate
- Webhook signature verification
- Secure password reset
- Dependency updates

Never expose:
- API keys
- WhatsApp tokens
- database passwords
- JWT secrets
- cloud credentials

in frontend code or Git.

---

# 26. AUDIT LOG

Record sensitive business actions:

- Login
- User creation
- Role changes
- Coupon creation/edit
- Loyalty adjustment
- Redemption
- Campaign creation
- Campaign sending
- Integration changes
- WhatsApp configuration
- Subscription changes

Audit record:
- organization
- user
- action
- entity
- entity_id
- old value if appropriate
- new value if appropriate
- timestamp
- IP/device metadata where legally appropriate

---

# 27. FRONTEND DASHBOARD

Main navigation:

Dashboard
Customers
Transactions
Bills
Products
Loyalty
Coupons
Campaigns
Automations
WhatsApp
Reviews
Analytics
Stores
Integrations
Team
Subscription
Settings

Dashboard cards:

Revenue
Transactions
Customers
Repeat customers
Active campaigns
WhatsApp delivery
Loyalty points
Coupon redemption

Charts:
- Revenue trend
- Customer growth
- Repeat purchase
- Campaign performance

Use responsive design.

---

# 28. CUSTOMER PORTAL

Customer should be able to access a secure web page from WhatsApp.

Pages:
- Digital bill
- Purchase history
- Loyalty balance
- Coupons
- Rewards
- Profile
- Feedback

Avoid forcing a full account/password workflow for basic bill viewing.

Use secure magic-link/token based access where appropriate.

---

# 29. INTEGRATION FRAMEWORK

Create an adapter architecture.

Example:

IntegrationAdapter
|
+-- CustomPOSAdapter
+-- TallyAdapter
+-- BusyAdapter
+-- ShopifyAdapter
+-- OtherPOSAdapter

All adapters convert external data to internal standard models.

Do not tightly couple the core CRM to one POS provider.

---

# 30. BACKGROUND JOBS

Celery queues should eventually be separated logically:

critical
notifications
whatsapp
campaigns
reports
analytics
automation

Examples:
- send_bill
- send_campaign_message
- process_whatsapp_webhook
- calculate_loyalty
- expire_points
- expire_coupons
- run_automation
- generate_report

Implement retry policies and dead-letter/failure visibility where practical.

---

# 31. FILE STORAGE

Use object storage for:
- Invoice PDFs
- Customer documents if later needed
- Business logos
- Campaign media
- Product images

Do not store large files directly in PostgreSQL.

Use signed URLs for private files.

---

# 32. DEVELOPMENT PHASES

## Phase 0 - Planning

Deliver:
- SRS
- Architecture
- ERD
- API specification
- UI wireframes
- Security plan

## Phase 1 - Foundation

Build:
- Repository
- Docker
- Django
- Next.js
- PostgreSQL
- Redis
- Celery
- Authentication
- Organizations
- Roles
- Stores
- Multi-tenancy

## Phase 2 - Transaction + Digital Bill

Build:
- Products
- Customers
- Transactions
- Transaction items
- Invoice
- Bill generation
- Integration API
- Idempotency

## Phase 3 - WhatsApp

Build:
- WhatsApp connection
- Templates
- Sending
- Webhooks
- Delivery tracking
- Digital bill delivery

## Phase 4 - CRM

Build:
- Customer profiles
- Customer timeline
- Purchase history
- Segments
- Search/filter

## Phase 5 - Loyalty + Coupons

Build:
- Loyalty rules
- Ledger
- Wallet
- Redemption
- Coupons
- Referral

## Phase 6 - Campaigns

Build:
- Audience
- Campaigns
- Templates
- Scheduling
- Queue processing
- Campaign analytics

## Phase 7 - Automation

Build:
- Event triggers
- Conditions
- Delays
- Actions
- Execution logs

## Phase 8 - Analytics

Build:
- Sales
- Customers
- Marketing
- Loyalty
- Store analytics

## Phase 9 - SaaS

Build:
- Plans
- Subscription
- Usage
- Feature limits
- Organization billing

## Phase 10 - AI

Build:
- AI campaign generator
- Customer insights
- Churn prediction
- Offer recommendations
- AI segmentation

---

# 33. FIRST MVP ACCEPTANCE CRITERIA

Before adding advanced features, this complete flow must work:

1. Business registers.
2. Business creates a store.
3. Admin creates staff.
4. Customer is created.
5. Transaction is received through API.
6. Customer is automatically created/found.
7. Transaction is saved.
8. Invoice is generated.
9. Digital bill is accessible.
10. WhatsApp message is queued.
11. Celery sends the message.
12. Webhook updates delivery status.
13. Loyalty points are calculated.
14. Customer profile shows purchase and points.
15. Admin can create a coupon.
16. Admin can create a customer segment.
17. Admin can send a WhatsApp campaign.
18. Campaign runs through Celery.
19. Message status is tracked.
20. Dashboard shows campaign/sales/customer metrics.
21. Organization A cannot access Organization B data.

Do not call the MVP complete until these are tested.

---

# 34. TESTING

Backend:
- Unit tests
- API tests
- Permission tests
- Tenant isolation tests
- Transaction tests
- Loyalty ledger tests
- Idempotency tests
- Webhook tests

Frontend:
- Component tests
- Form validation tests
- Critical flow tests

End-to-end:
- Registration
- Transaction ingestion
- Digital bill
- WhatsApp queue
- Loyalty
- Coupon
- Campaign
- Multi-tenant isolation

Load testing later:
- Transaction ingestion
- Campaign queue
- WhatsApp worker throughput

---

# 35. DEVELOPMENT RULES FOR ANTIGRAVITY

IMPORTANT:

1. Do not generate the entire application in one step.
2. Work phase-by-phase.
3. Before coding each major phase, inspect the existing repository.
4. Do not overwrite working code unnecessarily.
5. Maintain clean module boundaries.
6. Use environment variables for secrets.
7. Create migrations properly.
8. Never modify production data through ad-hoc scripts.
9. Add tests with important backend functionality.
10. Keep API contracts documented.
11. Keep database migrations version controlled.
12. Use meaningful commit-sized changes.
13. After each phase, run tests and fix failures before continuing.
14. Do not introduce microservices unless required by actual scale.
15. Do not add unnecessary dependencies.
16. Prefer secure, maintainable code over shortcuts.
17. Never hardcode tenant IDs.
18. Never trust organization/store IDs from the frontend without authorization checks.
19. Never send bulk messages synchronously from web requests.
20. Keep third-party integrations behind service/adapter interfaces.

---

# 36. ENVIRONMENT VARIABLES

Create `.env.example`, never commit actual secrets.

Expected categories:

DJANGO_SECRET_KEY=
DJANGO_DEBUG=
DATABASE_URL=
REDIS_URL=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

EMAIL_PROVIDER_API_KEY=
SMS_PROVIDER_API_KEY=

SENTRY_DSN=

AI_PROVIDER_API_KEY=

All production secrets must be stored using a secure secrets manager or deployment environment.

---

# 37. REPOSITORY STRUCTURE

Recommended:

project-root/
|
+-- frontend/
|   +-- app/
|   +-- components/
|   +-- lib/
|   +-- hooks/
|   +-- types/
|   +-- services/
|   +-- public/
|
+-- backend/
|   +-- config/
|   +-- apps/
|   +-- common/
|   +-- tests/
|   +-- manage.py
|
+-- infrastructure/
|   +-- docker/
|   +-- nginx/
|   +-- deployment/
|
+-- docs/
|   +-- architecture/
|   +-- api/
|   +-- database/
|   +-- workflows/
|
+-- .env.example
+-- docker-compose.yml
+-- README.md

---

# 38. UI/UX DIRECTION

Build a modern B2B SaaS dashboard.

Requirements:
- Clean
- Professional
- Responsive
- Desktop-first but mobile-friendly
- Consistent spacing
- Clear data hierarchy
- Reusable components
- Tables with search/filter/pagination
- Confirmation dialogs for destructive actions
- Empty states
- Loading states
- Error states
- Toast notifications
- Accessible forms

Do not copy BillFree's visual identity. Create an original design system.

---

# 39. IMPORTANT BUSINESS LOGIC

The product's main loop is:

TRANSACTION
-> CUSTOMER IDENTIFICATION
-> DIGITAL BILL
-> LOYALTY
-> CUSTOMER DATA
-> SEGMENTATION
-> PERSONALIZED ENGAGEMENT
-> REPEAT PURCHASE
-> ANALYTICS

Every feature should support this loop.

---

# 40. FUTURE FEATURES

After MVP:

- Advanced POS connectors
- Tally/Busy integrations
- E-commerce integrations
- Product recommendation engine
- AI churn prediction
- AI campaign generator
- Customer lifetime value prediction
- Advanced journey builder
- Advanced customer segmentation
- Marketing ROI
- Cohort analysis
- Multi-language messaging
- Mobile application
- Franchise management
- Enterprise SSO
- Advanced permissions
- White-label SaaS
- Partner/reseller portal

---

# 41. FINAL IMPLEMENTATION INSTRUCTION

Start development in this order:

STEP 1:
Inspect repository and create a technical implementation plan.

STEP 2:
Create the repository structure, Docker environment and development setup.

STEP 3:
Implement PostgreSQL database models and migrations for:
- organizations
- stores
- users/roles
- customers
- products
- transactions
- transaction_items

STEP 4:
Implement authentication and multi-tenant authorization.

STEP 5:
Implement transaction ingestion API with idempotency.

STEP 6:
Implement digital invoice/bill generation.

STEP 7:
Implement WhatsApp service abstraction and test integration.

STEP 8:
Implement Celery + Redis background processing.

STEP 9:
Implement CRM/customer timeline.

STEP 10:
Implement loyalty ledger.

STEP 11:
Implement coupons.

STEP 12:
Implement customer segmentation.

STEP 13:
Implement WhatsApp campaigns.

STEP 14:
Implement automation engine.

STEP 15:
Implement analytics dashboard.

STEP 16:
Implement SaaS subscriptions and usage limits.

STEP 17:
Implement AI features.

After every major step:
- Run tests
- Check migrations
- Check API behavior
- Check tenant isolation
- Update documentation
- Do not proceed with known critical errors.

The goal is a production-quality BillFree-like customer engagement SaaS platform, not a prototype or static UI.
