# BillMeet Data Source & Screen Mapping Specification

This document maps every operational screen in BillMeet to its authoritative source of truth, underlying database models, backend API endpoints, primary actions, and distinguishing characteristics.

---

## 1. Domain Separation Summary

| Screen / Feature | Route | Database Source of Truth | Purpose ("What question does this answer?") | Core Actions |
|---|---|---|---|---|
| **Purchase Orders** | `/dashboard/purchases` & `/dashboard/purchases/orders` | `PurchaseOrder` (All statuses: `draft`, `sent`, `ordered`, `received`, `cancelled`) | *"What do we intend to buy from suppliers?"* (Procurement workflow) | Create PO, Edit draft, Send, Receive Stock, Cancel, Print PO |
| **Purchase History** | `/dashboard/purchases/history` | `PurchaseOrder` (where `status = 'received'`) + `PurchaseOrderItem` | *"What purchases actually arrived and were completed?"* (Historical ledger) | View bill, View supplier invoice #, View linked inventory movements, View payment history, Print receipt |
| **Current Stock** | `/dashboard/inventory` | `Product` (filtered by tenant organization) | *"What stock do I currently have on hand?"* (Stock inventory dashboard) | Search by SKU/name, Filter low stock, View valuation, Trigger adjustment, View movements |
| **Stock Movements** | `/dashboard/inventory/movements` | `InventoryMovement` (All movement types) | *"What exact changes happened to stock over time?"* (Immutable audit ledger) | Audit timeline, Filter by movement type, Trace reference IDs (Invoice, PO, Return) |
| **Stock Adjustments** | `/dashboard/inventory/adjustments` | `InventoryMovement` (Types: `DAMAGE`, `LOSS`, `FOUND`, `CORRECTION`, `COUNT_ADJUSTMENT`, `OPENING_STOCK`, `OTHER`) | *"Why am I manually overriding stock counts?"* (Manual adjustment audit trail) | Live before/delta/after preview, Select reason code, Log operator attribution & notes |
| **Payment Ledger** | `/dashboard/finance/payments` | `TransactionPayment` + `CustomerCreditPayment` + `SupplierPayment` | *"What actual money has been received or paid?"* (Cash & digital fund flows) | Filter incoming vs outgoing, Filter payment method (Cash, UPI, Card, Bank), View cashier |
| **Receivables (Udhaar)** | `/dashboard/finance/receivables` | `Transaction` (where `outstanding_amount > 0`) & `Customer.outstanding_credit` | *"What money is currently owed to us by customers?"* (Customer debt & aging) | Record customer credit payment (FIFO settlement), Send WhatsApp reminder, View invoice |
| **Payables** | `/dashboard/finance/payables` | `PurchaseOrder` (where `status = 'received'` and `outstanding_amount > 0`) | *"What money do we owe to suppliers?"* (Supplier liabilities & aging) | Record supplier payment, View PO / supplier invoice, View aging days |
| **Sales Report** | `/dashboard/reports/sales` | `Transaction` + `TransactionItem` + `Invoice` | *"How is the business selling overall?"* (Macro commercial analytics) | Analyze gross/net sales, taxes, discounts, top products, top categories, date trends |
| **POS / Register Report** | `/dashboard/reports/pos` | `CashRegister` sessions + associated register transactions | *"How did the cash registers and cashiers perform today?"* (Operational drawer reconciliation) | Verify expected vs counted closing cash, Audit shortage/overage variance, Cashier accountability |

---

## 2. In-Depth Screen Specifications

### 2.1 Purchasing: Purchase Orders vs. Purchase History

```
[Procurement Intent]
       │
       ▼
PurchaseOrder (status = 'draft' / 'ordered') ──▶ Visible in Purchase Orders
       │                                         (NO stock change, NO movement)
       │ (Action: Receive Stock)
       ▼
PurchaseOrder (status = 'received') ────────────▶ Visible in Purchase History
       ├──▶ InventoryMovement(type='PURCHASE')
       └──▶ Product(current_stock += qty, cost_price = new_price)
```

1. **Purchase Orders (`/dashboard/purchases`)**:
   - **Data Query**: `GET /api/v1/pos/inventory/purchases/` (supports filter `status=draft|ordered|received|cancelled`).
   - **Key Fields**: PO Number, Supplier, Order Date, Expected Delivery Date, Status Badge, Items Count, Total Amount.
   - **Business Invariant**: Creating an `ordered` PO does **not** touch inventory stock or create movements until goods receipt.

2. **Purchase History (`/dashboard/purchases/history`)**:
   - **Data Query**: `GET /api/v1/pos/inventory/purchases/?status=received`.
   - **Key Fields**: Purchase Date, Supplier Invoice Number, PO Number, Supplier, Received Products, Total Amount, Paid Amount, Outstanding Balance, Payment Status (`paid`, `partial`, `unpaid`).
   - **Cross-Links**: Direct button to *"View Resulting Inventory Movements"*, link to original PO.

---

### 2.2 Inventory: Current Stock vs. Stock Adjustments vs. Stock Movements

```
Product.current_stock (Current state snapshot) ──▶ Current Stock Dashboard (/inventory)
       ▲
       │ (Mutated only via)
InventoryMovement (Audit ledger entry)
       ├── Automated (SALE, PURCHASE, RETURN, PURCHASE_RETURN) ──▶ Stock Movements (/inventory/movements)
       └── Manual (DAMAGE, LOSS, FOUND, CORRECTION, ADJUSTMENT) ──▶ Stock Adjustments (/inventory/adjustments)
```

1. **Current Stock (`/dashboard/inventory`)**:
   - **Data Query**: `GET /api/v1/pos/products/`
   - **Key Metrics**: Product name, SKU, Category, Current stock, Reorder level, Cost price, Selling price, Total inventory value ($stock \times cost$).
   - **Purpose**: Operational dashboard for replenishment, inventory valuation, and stock availability.

2. **Stock Adjustments (`/dashboard/inventory/adjustments`)**:
   - **Data Mutation**: `POST /api/v1/pos/inventory/adjust/`
   - **History Query**: `GET /api/v1/pos/inventory/adjustments/`
   - **Fields**: Product, Store, Adjustment Reason Type, Quantity Delta, Reason Notes.
   - **Preview Engine**: Real-time reactive calculator displaying:
     $$\text{Previous Stock (e.g. 100)} \quad\xrightarrow{+\text{ or } -}\quad \text{Delta (-5)} \quad\implies\quad \text{New Stock (95)}$$

3. **Stock Movements (`/dashboard/inventory/movements`)**:
   - **Data Query**: `GET /api/v1/pos/inventory/movements/`
   - **Purpose**: Global chronological immutable log of all 8 movement types for regulatory and inventory audits.

---

### 2.3 Finance: Payment Ledger vs. Receivables vs. Payables

```
Financial Activity
       │
       ├── Money received from customer sale (TransactionPayment) ──┐
       ├── Money received from Udhaar debt (CustomerCreditPayment) ─┼──▶ Payment Ledger (/finance/payments)
       └── Money disbursed to supplier (SupplierPayment) ───────────┘
```

1. **Payment Ledger (`/dashboard/finance/payments`)**:
   - **Data Query**: `GET /api/v1/pos/finance/payments/`
   - **Key Fields**: Date, Flow Direction (`INCOMING` vs `OUTGOING`), Entity (Customer or Supplier), Reference Number / UPI UTR, Payment Mode, Amount, Cashier / Logged By.
   - **Distinction**: Represents money that has **already moved**.

2. **Customer Receivables (`/dashboard/finance/receivables`)**:
   - **Data Query**: `GET /api/v1/pos/finance/receivables/`
   - **Key Fields**: Customer Name, Phone, Invoice Number, Invoice Date, Due Date, Total Bill, Paid So Far, Outstanding Balance, Days Overdue, Aging Status (`CURRENT`, `DUE_SOON`, `OVERDUE`).
   - **Action**: Direct Settle Credit dialog that executes `CreditService.record_credit_payment` with FIFO debt allocation.

3. **Supplier Payables (`/dashboard/finance/payables`)**:
   - **Data Query**: `GET /api/v1/pos/finance/payables/`
   - **Key Fields**: Supplier, PO Number, Supplier Invoice Number, Purchase Date, Due Date, Total Cost, Paid, Outstanding, Days Overdue.
   - **Action**: Record Supplier Payment dialog that records a `SupplierPayment` and updates `PurchaseOrder.paid_amount`.

---

### 2.4 Reports: Sales Report vs. POS Register Operational Report

1. **Sales Report (`/dashboard/reports/sales`)**:
   - **Data Query**: `GET /api/v1/pos/reports/sales/`
   - **Scope**: Entire business, all stores, multi-channel sales.
   - **Metrics**: Gross Sales, Net Sales, Discounts, Taxes, Returns, Net Revenue, Invoices Count, Average Order Value (AOV), Sales by Category, Sales by Payment Mode.

2. **POS / Register Report (`/dashboard/reports/pos`)**:
   - **Data Query**: `GET /api/v1/pos/reports/pos-register/`
   - **Scope**: Physical cash drawer sessions and individual cashiers.
   - **Reconciliation Invariant**:
     $$\text{Expected Closing Cash} = \text{Opening Balance} + \text{Cash Sales} - \text{Cash Refunds}$$
     $$\text{Cash Variance} = \text{Actual Counted Cash} - \text{Expected Closing Cash}$$
   - **Highlighting**: Variances colored red (cash shortage) or amber (cash overage) to enforce cashier accountability.
