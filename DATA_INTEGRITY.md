# BillMeet Financial & Data Integrity Specification

## 1. Zero Floating-Point Arithmetic Policy

### Mandate
Under no circumstances may currency calculations, product prices, discounts, tax rates, line totals, or credit balances be cast to or evaluated using Python `float` or JavaScript native floating-point math without proper quantization.

### Implementation Standard
- All backend calculations use Python's `decimal.Decimal` with explicit rounding modes (`ROUND_HALF_UP`).
- Rounding occurs only at the final line-item or invoice total stage using `.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`.
- Round-off differences are explicitly captured in `Transaction.round_off` and `Invoice.round_off` rather than silently absorbed into taxable amounts or item subtotals.

```python
# Authoritative Round-Off Implementation in CartEngine
if business_config.auto_round_off:
    rounded = grand_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))
    round_off = (rounded - grand_total).quantize(Decimal("0.01"))
    grand_total = rounded
```

---

## 2. Calculation Hierarchy & Authoritative Formulae

To eliminate competing implementations across POS, Invoices, Quotations, Reports, and Analytics, the calculation pipeline is standardized as follows:

```
1. Base Item Price:
   base_amount = quantity * unit_price

2. Line Item Discount:
   if discount_type == "percentage":
       discount_amount = (base_amount * (discount_value / 100)).quantize(0.01)
   else:
       discount_amount = min(discount_value, base_amount).quantize(0.01)

   taxable_amount = (base_amount - discount_amount).quantize(0.01)

3. Tax Calculation:
   if tax_type == "inclusive":
       # Tax extracted from price
       tax_amount = (taxable_amount - (taxable_amount / (1 + (tax_rate / 100)))).quantize(0.01)
       subtotal = taxable_amount - tax_amount
   else:
       # Tax added to price
       tax_amount = (taxable_amount * (tax_rate / 100)).quantize(0.01)
       subtotal = taxable_amount

   if is_interstate:
       igst = tax_amount
       cgst = 0.00
       sgst = 0.00
   else:
       cgst = (tax_amount / 2).quantize(0.01)
       sgst = (tax_amount - cgst).quantize(0.01)
       igst = 0.00

4. Item Total:
   item_total = subtotal + tax_amount

5. Cart Total:
   subtotal_sum = sum(items.subtotal)
   discount_sum = sum(items.discount) + cart_level_discount
   tax_sum = sum(items.tax)
   pre_round_total = subtotal_sum + tax_sum - cart_level_discount
   grand_total = pre_round_total + round_off
```

---

## 3. Database Atomicity & Rollback Guarantees

Every transaction creation or quotation conversion executes within an atomic boundary:

```python
with transaction.atomic():
    # 1. Lock idempotency key or invoice sequence
    # 2. Validate product availability with select_for_update()
    # 3. Create Transaction header
    # 4. Create TransactionItems
    # 5. Generate and persist Invoice
    # 6. Create TransactionPayment records
    # 7. Deduct inventory & create InventoryMovement records
    # 8. Update Customer cumulative spend and visit stats
    # 9. Update Customer credit balance (if credit payment)
```

If any constraint fails (e.g. insufficient inventory, database deadlock, validation error), the database performs a full rollback. No partial data is left committed.

---

## 4. Idempotency Specification

### POS Checkout
- Frontend generates a unique UUID `idempotency_key` when opening the checkout modal.
- Backend checks for an existing `Transaction` matching `organization` and `idempotency_key`.
- If an existing transaction is found:
  1. The backend immediately returns the existing transaction data with HTTP 200/201.
  2. No duplicate `Transaction`, `Invoice`, `TransactionPayment`, or `InventoryMovement` is created.
  3. No additional stock is deducted.

### Quotation Conversion
- Quotations have an immutable state transition: `draft` / `sent` -> `converted`.
- Attempting to re-convert an already converted quotation immediately rejects with `HTTP 400 Bad Request` and message `"Quotation has already been converted to an invoice."`.

---

## 5. Sequential Invoice Numbering Rules

1. Format: `INV-YYYYMMDD-000001` (Daily sequence) or `INV-YYYY-000001` (Yearly sequence).
2. Uniqueness: Scoped to `(organization, invoice_number)`.
3. Concurrency Protection:
   - Sequence generation utilizes `InvoiceSequence.objects.select_for_update()`.
   - Thread-safe and process-safe across multiple concurrent cashiers.

---

## 6. Inventory Ledger Invariants

1. **Current Stock Invariant**:
   For any product with `track_inventory=True`, `current_stock` must match the sum of all its `InventoryMovement` records:
   $$\text{current\_stock} = \sum_{\text{movements}} \text{quantity}$$
2. **Negative Stock Policy**:
   Unless the organization has explicitly enabled `allow_negative_stock`, any operation that would reduce `current_stock < 0` is rejected with `ValidationError`.

---

## 7. Return & Refund Constraints

1. Returns must link to an existing `Transaction` and specific `TransactionItem`.
2. Returned quantity cannot exceed $\text{quantity} - \text{returned\_quantity}$.
3. Return amount calculation must be pro-rata to avoid refunding discounts that were never paid.
4. Restocked items create an `InventoryMovement(movement_type="RETURN")` with positive quantity.
5. Invoices are permanent records; returns create separate `SalesReturn` and credit notes rather than modifying historical bills.
