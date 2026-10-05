# Analytics & Algorithmic Methodology

## 1. RFM Scoring Methodology

RFM scores evaluate customer value across three core dimensions:
- **Recency ($R$)**: Days elapsed since the customer's last completed purchase.
- **Frequency ($F$)**: Total count of completed transactions.
- **Monetary ($M$)**: Cumulative lifetime spend (INR).

### Scoring Quintiles (1–5)
Each customer is scored from 1 to 5 across $R$, $F$, and $M$ based on organization distribution thresholds:
- $R=5$: Purchased within the last 14 days
- $R=4$: Purchased within 15–30 days
- $R=3$: Purchased within 31–60 days
- $R=2$: Purchased within 61–90 days
- $R=1$: Inactive for 90+ days or never purchased

---

## 2. Customer Health Scoring (0–100)

The Customer Health Score ($H$) aggregates 7 behavioral signals:

$$H = S_{\text{recency}} + S_{\text{frequency}} + S_{\text{monetary}} + S_{\text{cadence}} + S_{\text{loyalty}} + S_{\text{coupons}} - P_{\text{refunds}}$$

| Dimension | Max Points | Weight Rationale |
|---|---|---|
| **Recency** | 30 | Immediate indicator of current brand engagement |
| **Frequency** | 25 | Proven repeat loyalty behavior |
| **Monetary Value & AOV** | 25 | Financial contribution to merchant margin |
| **Cadence Adherence** | 10 | Customer purchasing within expected historical cycle |
| **Loyalty Engagement** | 10 | Points balance and reward redemption behavior |
| **Coupon Redemptions** | 5 | Responsiveness to promotional marketing |
| **Refund Penalty** | -15 | Operational friction or customer dissatisfaction |

---

## 3. Churn Prediction & Inactivity Cadence

Churn probability evaluates the ratio between a customer's current elapsed inactivity days ($D_{\text{inactive}}$) and their personal historical average purchase interval ($\bar{I}_{\text{purchase}}$):

$$\text{Cadence Ratio} = \frac{D_{\text{inactive}}}{\max(14, \bar{I}_{\text{purchase}})}$$

- $\text{Cadence Ratio} \le 1.0$: Normal buying cadence ($\text{Churn Risk} = \text{LOW}$)
- $1.0 < \text{Cadence Ratio} \le 1.6$: Cadence slowing down ($\text{Churn Risk} = \text{MEDIUM}$)
- $1.6 < \text{Cadence Ratio} \le 2.5$: Significant delay ($\text{Churn Risk} = \text{HIGH}$)
- $\text{Cadence Ratio} > 2.5$: Severe dormancy ($\text{Churn Risk} = \text{CRITICAL}$)

---

## 4. Product Affinity & Market Basket Analysis

Given products $A$ and $B$, their affinity is computed using Association Rule Mining principles:
- **Support**: $P(A \cap B) = \frac{\text{Orders containing both } A \text{ and } B}{\text{Total Multi-item Orders}}$
- **Confidence**: $P(B \mid A) = \frac{\text{Orders containing both } A \text{ and } B}{\text{Orders containing } A}$
- **Affinity Score**: Scaled confidence percentage representing co-purchase likelihood.

---

## 5. Direct Campaign ROI Attribution

Campaign ROI tracks actual financial return within a 7-day post-send attribution window:

$$\text{Attributed Revenue} = \sum_{\text{recipients}} \text{Completed Order Value in 7 Days}$$

$$\text{ROI Multiplier} = \frac{\text{Attributed Revenue}}{\max(1, \text{Campaign Cost})}$$
