# BillFree V2 API Specification

## Base URL
`/api/v1`

All requests except public invoice and portal endpoints require standard JWT Bearer token authentication:
`Authorization: Bearer <access_token>`

---

## 1. Analytics & RFM Endpoints

### `GET /analytics/rfm/distribution/`
Returns the breakdown of all active customers across the 9 RFM segments.
**Response (200 OK):**
```json
[
  {
    "segment": "Champions",
    "count": 42,
    "percentage": 14.5,
    "total_spend": 320000.00,
    "avg_spend": 7619.05,
    "avg_recency_days": 6.2,
    "description": "Bought recently, buy often and spend the most!"
  }
]
```

### `GET /analytics/rfm/summary/`
High-level summary of total profiles, average scores, and top segment.

### `GET /analytics/rfm/customers/`
Paginated customer list filtered by segment.
**Query Parameters**:
- `segment` (optional): Filter by segment name (e.g. `Champions`, `At Risk`, `Hibernating`)
- `search` (optional): Filter by customer name or phone

---

## 2. Customer Intelligence Endpoints

### `GET /customers/{id}/health/`
Returns the 0–100 Customer Health Score and explainable factors.
**Response (200 OK):**
```json
{
  "customer_id": "c138d6df-...",
  "score": 81,
  "status": "HEALTHY",
  "positive_factors": [
    "Purchased within the last 14 days",
    "Consistent repeat buyer (8 orders)",
    "Active loyalty member (850 pts available)"
  ],
  "risk_factors": [],
  "recommended_action": "SEND_LOYALTY_REWARD"
}
```

### `GET /customers/{id}/churn/`
Returns behaviour-based churn risk prediction.
**Response (200 OK):**
```json
{
  "customer_id": "c138d6df-...",
  "customer_name": "Rahul Verma",
  "churn_probability": 28.5,
  "churn_risk": "LOW",
  "prediction_reason": "Purchased recently. Purchase interval is within normal boundaries.",
  "days_since_last_purchase": 10,
  "average_purchase_interval_days": 18.4,
  "lifetime_value": 15400.00,
  "predicted_at": "2026-10-05T19:00:00Z"
}
```

### `GET /analytics/churn/at-risk/`
Lists all customers categorized under HIGH or CRITICAL churn risk.
**Query Parameters**:
- `limit` (optional, default 20)

### `GET /customers/{id}/next-action/`
Returns the single next best recommended action.
**Response (200 OK):**
```json
{
  "action": "SEND_COMEBACK_OFFER",
  "priority": "HIGH",
  "reason": "High-value customer inactive for 65 days.",
  "recommended_offer": "₹200 OFF on orders above ₹999",
  "recommended_channel": "whatsapp"
}
```

### `GET /customers/{id}/recommendations/`
Returns suggested merchant offer.

### `POST /customers/{id}/create-recommended-offer/`
Creates an approved coupon code from the recommended offer upon merchant confirmation.

---

## 3. Product Intelligence & Smart Bundles

### `GET /products/intelligence/`
Returns top-performing and declining products.

### `GET /products/affinity/`
Returns market basket co-occurrence affinities.
**Response (200 OK):**
```json
[
  {
    "id": "...",
    "product_a": { "id": "p1", "name": "Wireless Mouse", "price": 899.00 },
    "product_b": { "id": "p2", "name": "Laptop Bag", "price": 1499.00 },
    "co_occurrence_count": 34,
    "affinity_score": 67.2,
    "text_insight": "Customers who purchase Wireless Mouse frequently buy Laptop Bag."
  }
]
```

### `GET /products/bundles/`
Returns smart bundle candidates with price savings.

---

## 4. Campaign ROI Endpoints

### `GET /campaigns/roi/`
Returns attribution metrics for all campaigns.
**Response (200 OK):**
```json
[
  {
    "campaign_id": "...",
    "campaign_name": "Festive Win-Back",
    "campaign_type": "whatsapp",
    "recipients": 1200,
    "conversions": 94,
    "conversion_rate": 7.8,
    "attributed_revenue": 145000.00,
    "campaign_cost": 2160.00,
    "roi": "67.1x",
    "revenue_per_recipient": 120.83
  }
]
```

---

## 5. Business Health & Alerts Endpoints

### `GET /analytics/business-health/`
Returns overall 0–100 business index and category sub-scores.

### `GET /analytics/alerts/`
Returns active business operational alerts.

### `POST /analytics/alerts/{id}/dismiss/`
Dismisses a business alert.

### `POST /analytics/alerts/{id}/acknowledge/`
Marks a business alert as acknowledged.

---

## 6. Public Customer Portal & AI Copilot

### `GET /customer-portal/{token}/`
**No authentication required.** Token-authenticated endpoint for customer mini portal.
**Response (200 OK):**
```json
{
  "customer": { "name": "Rahul Verma", "phone": "+91 9876543210", "member_since": "March 2026" },
  "business": { "name": "Apex Retail Hub", "city": "Mumbai" },
  "loyalty": {
    "current_tier": { "name": "Gold", "slug": "gold", "multiplier": 1.5, "color": "#f59e0b" },
    "next_tier": { "name": "Platinum", "min_spend": 20000.00 },
    "points_balance": 2840,
    "spend_needed_for_next_tier": 4600.00,
    "progress_percentage": 77
  },
  "achievements": [
    { "code": "VIP_CUSTOMER", "title": "VIP Customer", "badge_tier": "gold", "unlocked_at": "12 Sep 2026" }
  ],
  "recent_orders": [...],
  "available_rewards": [...]
}
```

### `POST /copilot/query/`
AI Business Copilot inquiry endpoint.
**Payload:**
```json
{ "question": "Which customers are at risk of churning this week?" }
```
