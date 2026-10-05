# AI Business Copilot Architecture & Security Specification

## 1. Overview
The AI Business Copilot provides merchants with instant operational intelligence, explaining sales performance, retention trends, at-risk customers, and next best actions.

---

## 2. Safety & Anti-Hallucination Architecture

```
Merchant Question (Natural Language)
                ↓
     Intent & Scope Classifier
                ↓
  Authorized Domain Service Tools
  (Tenant-Scoped, Read-Only Aggregates)
                ↓
  Structured Data Context Assembly
                ↓
   LLM Synthesis / Factual Response
                ↓
 Merchant-Verified Action Suggestions
```

### Critical Security Boundaries
1. **No Direct Database Access**: The LLM is never provided with raw database connections, cursors, or SQL execution abilities.
2. **Strict Multi-Tenant Isolation**: Service tools only query data belonging to the authenticated merchant's `request.user.organization`.
3. **No Automatic Destructive Actions**: The Copilot cannot alter prices, generate financial transactions, or trigger customer messaging broadcasts without explicit merchant confirmation in the application UI.
4. **Data Privacy**: Customer personally identifiable information (PII) is masked or omitted from context payloads.

---

## 3. Controlled Copilot Tool Registry

| Tool Function | Description | Return Payload |
|---|---|---|
| `get_sales_summary()` | Returns 30-day revenue, transaction counts, and trend comparisons | Current revenue, prior month revenue, growth rate |
| `get_customer_segments()` | Retrieves RFM distribution breakdown | Count and percentage for Champions, At Risk, Lost |
| `get_at_risk_customers()` | Lists top customers approaching churn threshold | Customer names, days inactive, normal interval, LTV |
| `get_campaign_roi()` | Summarizes campaign costs and directly attributed revenue | Attributed revenue, conversions, ROI multipliers |
| `get_product_trends()` | Returns top growth products and declining items | Fast movers, declining items, margin impact |
| `get_business_health()` | Returns composite 0–100 health index and weakest area | Category breakdown and improvement recommendation |
| `get_recommended_actions()` | Summarizes high-priority next actions | Win-back candidates, review requests, VIP rewards |

---

## 4. Example Conversations

**User**: *"What should I do today to boost revenue?"*  
**Copilot**: *"Based on your real-time store data, your Customer Retention score is currently 74/100 (your primary area for improvement). You have 12 high-value customers at risk of churning who haven't visited in over 50 days (normally every 20 days).  
**Recommended Action**: Review and approve the suggested ₹200 comeback coupon for these customers in your Customer 360 dashboard."*

**User**: *"Which campaign generated the best ROI?"*  
**Copilot**: *"Your 'Diwali Offer' campaign generated ₹1,84,500 in directly attributed revenue from 184 verified purchases against a messaging cost of ₹4,200, achieving a 43.9x ROI."*
