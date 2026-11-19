import csv
import io
import re
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.migration.models import POSMigrationJob
from apps.products.models import Product, ProductCategory, InventoryMovement, Supplier
from apps.customers.models import Customer
from apps.customers.utils import normalize_phone


class POSMigrationService:
    """
    Comprehensive CSV Migration & Data Onboarding Engine.
    Handles dynamic column mapping, validation, duplicate resolution, atomic staged import,
    audit reporting, and full rollback.
    """

    TARGET_FIELDS = {
        "products": [
            {"key": "name", "label": "Product Name", "required": True},
            {"key": "sku", "label": "SKU / Item Code", "required": False},
            {"key": "barcode", "label": "Barcode", "required": False},
            {"key": "category", "label": "Category Name", "required": False},
            {"key": "selling_price", "label": "Selling Price / MRP", "required": True},
            {"key": "purchase_price", "label": "Cost / Purchase Price", "required": False},
            {"key": "opening_stock", "label": "Opening Stock", "required": False},
            {"key": "current_stock", "label": "Current Stock", "required": False},
            {"key": "min_stock", "label": "Low Stock Threshold", "required": False},
            {"key": "tax_rate", "label": "GST Tax Rate (%)", "required": False},
            {"key": "hsn_code", "label": "HSN Code", "required": False},
            {"key": "unit", "label": "Unit (PCS/KG/etc)", "required": False},
        ],
        "customers": [
            {"key": "first_name", "label": "Customer Name / First Name", "required": True},
            {"key": "last_name", "label": "Last Name", "required": False},
            {"key": "phone", "label": "Mobile Number", "required": True},
            {"key": "email", "label": "Email Address", "required": False},
            {"key": "address_line1", "label": "Billing Address", "required": False},
            {"key": "city", "label": "City", "required": False},
            {"key": "state", "label": "State", "required": False},
            {"key": "postal_code", "label": "Postal / PIN Code", "required": False},
            {"key": "gstin", "label": "GSTIN", "required": False},
            {"key": "opening_balance", "label": "Opening Balance / Udhaar", "required": False},
        ],
        "categories": [
            {"key": "name", "label": "Category Name", "required": True},
            {"key": "description", "label": "Description", "required": False},
        ],
        "opening_stock": [
            {"key": "sku", "label": "Product SKU / Barcode", "required": False},
            {"key": "name", "label": "Product Name", "required": False},
            {"key": "opening_stock", "label": "Opening Stock Quantity", "required": True},
            {"key": "cost_price", "label": "Unit Cost Price", "required": False},
        ],
        "suppliers": [
            {"key": "name", "label": "Supplier / Vendor Name", "required": True},
            {"key": "contact_person", "label": "Contact Person", "required": False},
            {"key": "phone", "label": "Phone Number", "required": False},
            {"key": "email", "label": "Email", "required": False},
            {"key": "address", "label": "Address", "required": False},
            {"key": "gstin", "label": "GSTIN", "required": False},
        ],
        "invoices": [
            {"key": "invoice_number", "label": "Invoice Number", "required": True},
            {"key": "customer_name", "label": "Customer Name", "required": False},
            {"key": "customer_phone", "label": "Customer Phone", "required": False},
            {"key": "date", "label": "Invoice Date", "required": False},
            {"key": "total_amount", "label": "Total Amount", "required": True},
            {"key": "payment_method", "label": "Payment Mode", "required": False},
            {"key": "notes", "label": "Notes / Remarks", "required": False},
        ],
    }

    # Keyword mappings for auto-suggesting column mappings
    AUTO_MAPPING_HINTS = {
        "name": ["product name", "item name", "item", "product", "description", "title", "name", "customer name", "cust name", "client"],
        "first_name": ["first name", "customer name", "cust name", "name", "client name", "party name"],
        "last_name": ["last name", "surname"],
        "sku": ["sku", "item code", "product code", "item no", "code", "barcode / sku"],
        "barcode": ["barcode", "upc", "ean", "ean13", "gtin"],
        "category": ["category", "category name", "department", "group", "item group", "class"],
        "selling_price": ["selling price", "sales price", "price", "mrp", "rate", "retail price", "unit price"],
        "purchase_price": ["purchase price", "cost price", "cost", "buying price", "purchase rate", "cost / unit"],
        "opening_stock": ["opening stock", "initial stock", "opening qty", "opening quantity", "beginning stock", "qty", "quantity", "stock"],
        "current_stock": ["current stock", "stock", "on hand", "available stock", "qty on hand", "inventory"],
        "min_stock": ["min stock", "minimum stock", "reorder level", "reorder point", "low stock alert", "threshold"],
        "tax_rate": ["tax rate", "tax %", "tax percent", "gst", "gst rate", "vat", "vat %"],
        "hsn_code": ["hsn", "hsn code", "sac", "sac code"],
        "unit": ["unit", "uom", "measuring unit", "unit of measure"],
        "phone": ["mobile", "mobile number", "phone", "phone number", "contact", "contact number", "cell", "cell phone"],
        "email": ["email", "e-mail", "email address"],
        "address_line1": ["address", "billing address", "street", "street address", "address line 1"],
        "city": ["city", "town", "district"],
        "state": ["state", "province"],
        "postal_code": ["postal code", "zip", "zip code", "pin", "pincode", "postal"],
        "gstin": ["gstin", "gst number", "gst no", "tax id", "vat no"],
        "opening_balance": ["opening balance", "balance", "udhaar", "outstanding", "due balance", "credit balance"],
        "contact_person": ["contact person", "spoc", "representative"],
        "invoice_number": ["invoice number", "invoice no", "inv no", "bill no", "receipt no", "doc no"],
        "total_amount": ["total amount", "total", "invoice amount", "net amount", "grand total", "bill amount"],
        "payment_method": ["payment mode", "payment method", "pay mode", "tender", "type"],
        "date": ["date", "invoice date", "bill date", "created at", "timestamp"],
        "notes": ["notes", "remarks", "comment"],
    }

    @classmethod
    def parse_csv_content(cls, content_str: str):
        """
        Parses CSV string into headers and row dictionaries.
        """
        # Strip Byte Order Mark (BOM) if present
        if content_str.startswith("\ufeff"):
            content_str = content_str[1:]

        f = io.StringIO(content_str)
        reader = csv.reader(f)
        try:
            raw_headers = next(reader)
        except StopIteration:
            return [], []

        headers = [h.strip() for h in raw_headers if h.strip()]
        # Rewind to parse as DictReader
        f.seek(0)
        dict_reader = csv.DictReader(f)
        rows = []
        for r in dict_reader:
            clean_row = {k.strip(): (v.strip() if v else "") for k, v in r.items() if k}
            if any(clean_row.values()):  # Skip completely blank lines
                rows.append(clean_row)

        return headers, rows

    @classmethod
    def suggest_column_mapping(cls, headers: list, entity_type: str = "products") -> dict:
        """
        Auto-suggests BillMeet field mappings based on similarity to header names.
        Returns a mapping of { billmeet_field_key: csv_header_name }.
        """
        available_targets = cls.TARGET_FIELDS.get(entity_type, cls.TARGET_FIELDS["products"])
        mapping = {}
        used_headers = set()

        for target in available_targets:
            key = target["key"]
            hints = cls.AUTO_MAPPING_HINTS.get(key, [key])
            for h in headers:
                if h in used_headers:
                    continue
                clean_h = h.lower().strip()
                if clean_h == key or clean_h in hints:
                    mapping[key] = h
                    used_headers.add(h)
                    break

            if key not in mapping:
                # Substring match attempt
                for h in headers:
                    if h in used_headers:
                        continue
                    clean_h = h.lower().strip()
                    if any(hint in clean_h for hint in hints):
                        mapping[key] = h
                        used_headers.add(h)
                        break

        return mapping

    @classmethod
    def validate_job(cls, job: POSMigrationJob, column_mapping: dict = None, duplicate_strategy: str = None) -> POSMigrationJob:
        """
        Validates all rows according to the target entity requirements and specified column mapping.
        Checks missing fields, invalid formats, duplicates, and unknown categories.
        """
        if column_mapping:
            job.column_mapping = column_mapping
        if duplicate_strategy:
            job.duplicate_strategy = duplicate_strategy

        headers, rows = cls.parse_csv_content(job.file_content)
        mapping = job.column_mapping or {}
        # Invert mapping: { csv_header: billmeet_key }
        inv_map = {v: k for k, v in mapping.items() if v}

        entity_type = job.entity_type
        target_defs = {f["key"]: f for f in cls.TARGET_FIELDS.get(entity_type, [])}
        required_keys = [f["key"] for f in cls.TARGET_FIELDS.get(entity_type, []) if f["required"]]

        # Pre-load existing records in DB for duplicate checking
        org = job.organization
        existing_skus = set(Product.objects.filter(organization=org).exclude(sku="").values_list("sku", flat=True))
        existing_prod_names = set(p.lower() for p in Product.objects.filter(organization=org).values_list("name", flat=True))
        existing_phones = set(Customer.objects.filter(organization=org).exclude(phone="").values_list("phone", flat=True))
        existing_categories = set(c.lower() for c in ProductCategory.objects.filter(organization=org).values_list("name", flat=True))

        seen_file_skus = set()
        seen_file_phones = set()
        seen_file_names = set()

        validation_errors = []
        valid_rows = 0
        invalid_rows = 0
        duplicate_rows = 0
        new_items_count = 0

        for idx, row in enumerate(rows, start=1):
            row_errors = []
            extracted = {}
            for csv_h, val in row.items():
                target_key = inv_map.get(csv_h)
                if target_key:
                    extracted[target_key] = val

            # Check required fields
            for rk in required_keys:
                if not extracted.get(rk):
                    lbl = target_defs.get(rk, {}).get("label", rk)
                    row_errors.append(f"Missing required field '{lbl}'.")

            # Entity-specific validations
            is_dup = False
            if entity_type in ("products", "opening_stock"):
                # Numeric validations
                for num_key in ("selling_price", "purchase_price", "cost_price", "opening_stock", "current_stock", "min_stock", "tax_rate"):
                    if extracted.get(num_key):
                        try:
                            val = Decimal(str(extracted[num_key]).replace(",", "").replace("₹", "").strip())
                            if val < Decimal("0.00"):
                                row_errors.append(f"{num_key} cannot be negative ({val}).")
                        except Exception:
                            row_errors.append(f"Invalid numeric value for '{num_key}': '{extracted[num_key]}'.")

                # SKU / duplicate checks
                sku = extracted.get("sku", "").strip()
                p_name = extracted.get("name", "").strip().lower()
                if sku:
                    if sku in seen_file_skus:
                        row_errors.append(f"Duplicate SKU '{sku}' found in CSV file (row {idx}).")
                        is_dup = True
                    elif sku in existing_skus:
                        is_dup = True
                    seen_file_skus.add(sku)
                elif p_name:
                    if p_name in seen_file_names:
                        is_dup = True
                    elif p_name in existing_prod_names:
                        is_dup = True
                    seen_file_names.add(p_name)

            elif entity_type == "customers":
                phone = extracted.get("phone", "").strip()
                norm_phone = normalize_phone(phone)
                if phone and not norm_phone:
                    row_errors.append(f"Invalid phone number '{phone}'. Must be a valid 10-15 digit mobile number.")
                elif norm_phone:
                    if norm_phone in seen_file_phones:
                        row_errors.append(f"Duplicate phone '{phone}' found within CSV file.")
                        is_dup = True
                    elif norm_phone in existing_phones:
                        is_dup = True
                    seen_file_phones.add(norm_phone)

                if extracted.get("opening_balance"):
                    try:
                        Decimal(str(extracted["opening_balance"]).replace(",", "").replace("₹", "").strip())
                    except Exception:
                        row_errors.append(f"Invalid opening balance: '{extracted['opening_balance']}'.")

            elif entity_type == "invoices":
                inv_no = extracted.get("invoice_number", "").strip()
                if not inv_no:
                    row_errors.append("Invoice number is required.")
                if extracted.get("total_amount"):
                    try:
                        Decimal(str(extracted["total_amount"]).replace(",", "").replace("₹", "").strip())
                    except Exception:
                        row_errors.append(f"Invalid total amount: '{extracted['total_amount']}'.")

            if row_errors:
                invalid_rows += 1
                for err in row_errors:
                    validation_errors.append({
                        "row": idx,
                        "error": err,
                        "data": {k: v for k, v in extracted.items() if v},
                    })
            else:
                valid_rows += 1

            if is_dup:
                duplicate_rows += 1
            elif not row_errors:
                new_items_count += 1

        job.total_rows = len(rows)
        job.valid_rows = valid_rows
        job.invalid_rows = invalid_rows
        job.duplicate_rows = duplicate_rows
        job.new_items_count = new_items_count
        job.validation_errors = validation_errors[:200]  # Cap preview errors for performance
        job.status = "validated"
        job.save()
        return job

    @classmethod
    def execute_import(cls, job: POSMigrationJob) -> POSMigrationJob:
        """
        Executes the verified migration transactionally, creating products, customers,
        categories, opening stock movements, or invoices.
        Tracks all created IDs in `created_records` for full rollback safety.
        """
        if job.status not in ("validated", "uploaded"):
            raise ValidationError(f"Cannot execute import for job in status '{job.status}'.")

        job.status = "importing"
        job.save(update_fields=["status"])

        headers, rows = cls.parse_csv_content(job.file_content)
        mapping = job.column_mapping or {}
        inv_map = {v: k for k, v in mapping.items() if v}
        strategy = job.duplicate_strategy or "skip"
        org = job.organization
        user = job.user

        created_records = {
            "products": [],
            "categories": [],
            "customers": [],
            "suppliers": [],
            "inventory_movements": [],
            "invoices": [],
            "transactions": [],
        }

        imported_count = 0
        skipped_count = 0
        failed_count = 0
        row_errors = []

        try:
            with transaction.atomic():
                for idx, row in enumerate(rows, start=1):
                    extracted = {}
                    for csv_h, val in row.items():
                        target_key = inv_map.get(csv_h)
                        if target_key:
                            extracted[target_key] = val

                    try:
                        if job.entity_type == "products":
                            res = cls._import_product_row(org, user, extracted, strategy, created_records)
                        elif job.entity_type == "customers":
                            res = cls._import_customer_row(org, extracted, strategy, created_records)
                        elif job.entity_type == "categories":
                            res = cls._import_category_row(org, extracted, strategy, created_records)
                        elif job.entity_type == "opening_stock":
                            res = cls._import_opening_stock_row(org, user, extracted, created_records)
                        elif job.entity_type == "suppliers":
                            res = cls._import_supplier_row(org, extracted, strategy, created_records)
                        elif job.entity_type == "invoices":
                            res = cls._import_invoice_row(org, user, extracted, created_records)
                        else:
                            raise ValidationError(f"Unknown entity type '{job.entity_type}'.")

                        if res == "imported":
                            imported_count += 1
                        elif res == "skipped":
                            skipped_count += 1
                    except Exception as exc:
                        failed_count += 1
                        row_errors.append({"row": idx, "error": str(exc)})
                        if strategy == "error":
                            raise

            job.imported_count = imported_count
            job.skipped_count = skipped_count
            job.failed_count = failed_count
            job.created_records = created_records
            job.import_report = {
                "entity_type": job.entity_type,
                "total_rows": len(rows),
                "imported_count": imported_count,
                "skipped_count": skipped_count,
                "failed_count": failed_count,
                "created_summary": {k: len(v) for k, v in created_records.items() if v},
                "row_errors": row_errors[:100],
                "completed_at": timezone.now().isoformat(),
            }
            job.status = "completed"
            job.save()
            return job

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.save(update_fields=["status", "error_message"])
            raise

    @classmethod
    def _import_product_row(cls, org, user, data: dict, strategy: str, created_records: dict) -> str:
        name = data.get("name", "").strip()
        if not name:
            return "skipped"

        sku = data.get("sku", "").strip()
        barcode = data.get("barcode", "").strip()
        selling_price = Decimal(str(data.get("selling_price", 0) or 0).replace(",", "").replace("₹", "").strip())
        purchase_price = Decimal(str(data.get("purchase_price", 0) or 0).replace(",", "").replace("₹", "").strip())
        opening_stock = Decimal(str(data.get("opening_stock", 0) or 0).replace(",", "").strip())
        current_stock = Decimal(str(data.get("current_stock", opening_stock) or 0).replace(",", "").strip())
        min_stock = Decimal(str(data.get("min_stock", 5) or 5).replace(",", "").strip())
        tax_rate = Decimal(str(data.get("tax_rate", 18) or 18).replace(",", "").replace("%", "").strip())
        hsn_code = data.get("hsn_code", "").strip()
        unit = data.get("unit", "PCS").strip().upper() or "PCS"

        # Category resolution
        cat_name = data.get("category", "General").strip() or "General"
        category, cat_created = ProductCategory.objects.get_or_create(
            organization=org,
            name__iexact=cat_name,
            defaults={"name": cat_name, "organization": org},
        )
        if cat_created:
            created_records["categories"].append(str(category.id))

        # Check existing
        existing = None
        if sku:
            existing = Product.objects.filter(organization=org, sku__iexact=sku).first()
        if not existing:
            existing = Product.objects.filter(organization=org, name__iexact=name).first()

        if existing:
            if strategy == "skip":
                return "skipped"
            elif strategy == "error":
                raise ValidationError(f"Duplicate product '{name}' (SKU: {sku}) already exists.")
            elif strategy == "update":
                existing.selling_price = selling_price
                if purchase_price > Decimal("0.00"):
                    existing.purchase_price = purchase_price
                    existing.cost_price = purchase_price
                existing.min_stock = min_stock
                existing.tax_rate = tax_rate
                if hsn_code:
                    existing.hsn_code = hsn_code
                existing.save()
                return "imported"

        # Create new product
        prod = Product.objects.create(
            organization=org,
            name=name,
            sku=sku,
            barcode=barcode,
            category=category,
            selling_price=selling_price,
            purchase_price=purchase_price,
            cost_price=purchase_price,
            opening_stock=opening_stock,
            current_stock=current_stock,
            min_stock=min_stock,
            tax_rate=tax_rate,
            hsn_code=hsn_code,
            unit=unit,
            is_active=True,
        )
        created_records["products"].append(str(prod.id))

        # Record opening stock inventory movement if stock > 0
        stock_to_record = current_stock if current_stock > Decimal("0.00") else opening_stock
        if stock_to_record > Decimal("0.00"):
            mov = InventoryMovement.objects.create(
                organization=org,
                product=prod,
                user=user if getattr(user, "is_authenticated", False) else None,
                movement_type="OPENING_STOCK",
                quantity=stock_to_record,
                previous_stock=Decimal("0.00"),
                new_stock=stock_to_record,
                reference_type="pos_migration",
                reference_id=f"MIG-{prod.sku or prod.id}",
                notes="POS Migration Initial Stock Entry",
            )
            created_records["inventory_movements"].append(str(mov.id))

        return "imported"

    @classmethod
    def _import_customer_row(cls, org, data: dict, strategy: str, created_records: dict) -> str:
        first_name = data.get("first_name", "").strip()
        last_name = data.get("last_name", "").strip()
        raw_phone = data.get("phone", "").strip()
        norm_phone = normalize_phone(raw_phone)
        if not norm_phone:
            norm_phone = raw_phone

        existing = Customer.objects.filter(organization=org, phone=norm_phone).first() if norm_phone else None
        if existing:
            if strategy == "skip":
                return "skipped"
            elif strategy == "error":
                raise ValidationError(f"Duplicate customer mobile '{norm_phone}' already exists.")
            elif strategy == "update":
                if first_name:
                    existing.first_name = first_name
                if last_name:
                    existing.last_name = last_name
                if data.get("email"):
                    existing.email = data["email"].strip()
                if data.get("address_line1"):
                    existing.address_line1 = data["address_line1"].strip()
                if data.get("city"):
                    existing.city = data["city"].strip()
                if data.get("state"):
                    existing.state = data["state"].strip()
                if data.get("postal_code"):
                    existing.postal_code = data["postal_code"].strip()
                if data.get("gstin"):
                    existing.gstin = data["gstin"].strip().upper()
                existing.save()
                return "imported"

        cust = Customer.objects.create(
            organization=org,
            first_name=first_name or "Customer",
            last_name=last_name,
            phone=norm_phone,
            email=data.get("email", "").strip(),
            address_line1=data.get("address_line1", "").strip(),
            city=data.get("city", "").strip(),
            state=data.get("state", "").strip(),
            postal_code=data.get("postal_code", "").strip(),
            gstin=data.get("gstin", "").strip().upper(),
            whatsapp_opt_in=True,
        )
        created_records["customers"].append(str(cust.id))
        return "imported"

    @classmethod
    def _import_category_row(cls, org, data: dict, strategy: str, created_records: dict) -> str:
        name = data.get("name", "").strip()
        if not name:
            return "skipped"
        desc = data.get("description", "").strip()
        existing = ProductCategory.objects.filter(organization=org, name__iexact=name).first()
        if existing:
            if strategy == "skip":
                return "skipped"
            elif strategy == "error":
                raise ValidationError(f"Category '{name}' already exists.")
            elif strategy == "update":
                if desc:
                    existing.description = desc
                    existing.save(update_fields=["description"])
                return "imported"

        cat = ProductCategory.objects.create(
            organization=org,
            name=name,
            description=desc,
        )
        created_records["categories"].append(str(cat.id))
        return "imported"

    @classmethod
    def _import_opening_stock_row(cls, org, user, data: dict, created_records: dict) -> str:
        sku = data.get("sku", "").strip()
        name = data.get("name", "").strip()
        qty = Decimal(str(data.get("opening_stock", 0) or 0).replace(",", "").strip())
        if qty <= Decimal("0.00"):
            return "skipped"

        prod = None
        if sku:
            prod = Product.objects.filter(organization=org, sku__iexact=sku).first()
        if not prod and name:
            prod = Product.objects.filter(organization=org, name__iexact=name).first()

        if not prod:
            raise ValidationError(f"Cannot assign opening stock: Product '{sku or name}' does not exist.")

        prev = prod.current_stock
        new_stk = prev + qty
        prod.current_stock = new_stk
        prod.opening_stock = (prod.opening_stock or Decimal("0.00")) + qty
        if data.get("cost_price"):
            c_price = Decimal(str(data["cost_price"]).replace(",", "").replace("₹", "").strip())
            if c_price > Decimal("0.00"):
                prod.cost_price = c_price
        prod.save(update_fields=["current_stock", "opening_stock", "cost_price"])

        mov = InventoryMovement.objects.create(
            organization=org,
            product=prod,
            user=user if getattr(user, "is_authenticated", False) else None,
            movement_type="OPENING_STOCK",
            quantity=qty,
            previous_stock=prev,
            new_stock=new_stk,
            reference_type="pos_migration",
            reference_id=f"MIG-STOCK-{prod.sku or prod.id}",
            notes="POS Migration Opening Stock Intake",
        )
        created_records["inventory_movements"].append(str(mov.id))
        return "imported"

    @classmethod
    def _import_supplier_row(cls, org, data: dict, strategy: str, created_records: dict) -> str:
        name = data.get("name", "").strip()
        if not name:
            return "skipped"
        existing = Supplier.objects.filter(organization=org, name__iexact=name).first()
        if existing:
            if strategy == "skip":
                return "skipped"
            elif strategy == "error":
                raise ValidationError(f"Supplier '{name}' already exists.")
            elif strategy == "update":
                if data.get("phone"):
                    existing.phone = data["phone"].strip()
                if data.get("email"):
                    existing.email = data["email"].strip()
                if data.get("address"):
                    existing.address = data["address"].strip()
                if data.get("gstin"):
                    existing.gstin = data["gstin"].strip().upper()
                existing.save()
                return "imported"

        sup = Supplier.objects.create(
            organization=org,
            name=name,
            contact_person=data.get("contact_person", "").strip(),
            phone=data.get("phone", "").strip(),
            email=data.get("email", "").strip(),
            address=data.get("address", "").strip(),
            gstin=data.get("gstin", "").strip().upper(),
            is_active=True,
        )
        created_records["suppliers"].append(str(sup.id))
        return "imported"

    @classmethod
    def _import_invoice_row(cls, org, user, data: dict, created_records: dict) -> str:
        from apps.transactions.models import Transaction, TransactionItem
        from apps.invoices.models import Invoice

        inv_num = data.get("invoice_number", "").strip()
        if not inv_num:
            return "skipped"

        total_amount = Decimal(str(data.get("total_amount", 0) or 0).replace(",", "").replace("₹", "").strip())
        cust_name = data.get("customer_name", "").strip()
        cust_phone = data.get("customer_phone", "").strip()

        customer = None
        if cust_phone:
            norm_phone = normalize_phone(cust_phone) or cust_phone
            customer = Customer.objects.filter(organization=org, phone=norm_phone).first()

        existing_inv = Invoice.objects.filter(organization=org, invoice_number=inv_num).first()
        if existing_inv:
            return "skipped"

        import secrets
        from apps.stores.models import Store
        store = Store.objects.filter(organization=org).first()
        if not store:
            store = Store.objects.create(organization=org, name="Main Store")

        tx = Transaction.objects.create(
            organization=org,
            store=store,
            invoice_number=inv_num,
            transaction_date=timezone.now(),
            customer=customer,
            customer_name=cust_name or (customer.name if customer else "Walk-in Customer"),
            customer_phone=cust_phone or (customer.phone if customer else ""),
            subtotal=total_amount,
            total=total_amount,
            status="completed",
            bill_sent=False,
            payment_status="paid",
        )
        created_records["transactions"].append(str(tx.id))

        inv = Invoice.objects.create(
            organization=org,
            transaction=tx,
            invoice_number=inv_num,
            secure_token=secrets.token_urlsafe(24),
        )
        created_records["invoices"].append(str(inv.id))
        return "imported"

    @classmethod
    def rollback_job(cls, job: POSMigrationJob) -> POSMigrationJob:
        """
        Safely reverses an imported job by rolling back all created entities in atomic order.
        """
        if job.status != "completed":
            raise ValidationError(f"Only completed jobs can be rolled back (current status: {job.status}).")

        created = job.created_records or {}
        with transaction.atomic():
            # 1. Reverse Inventory Movements
            mov_ids = created.get("inventory_movements", [])
            if mov_ids:
                movements = InventoryMovement.objects.filter(id__in=mov_ids, organization=job.organization).select_related("product")
                for m in movements:
                    # Deduct the stock that was added by opening stock
                    prod = m.product
                    prod.current_stock = max(Decimal("0.00"), prod.current_stock - m.quantity)
                    prod.opening_stock = max(Decimal("0.00"), (prod.opening_stock or Decimal("0.00")) - m.quantity)
                    prod.save(update_fields=["current_stock", "opening_stock"])
                movements.delete()

            # 2. Delete Invoices and Transactions
            inv_ids = created.get("invoices", [])
            if inv_ids:
                from apps.invoices.models import Invoice
                Invoice.objects.filter(id__in=inv_ids, organization=job.organization).delete()

            tx_ids = created.get("transactions", [])
            if tx_ids:
                from apps.transactions.models import Transaction
                Transaction.objects.filter(id__in=tx_ids, organization=job.organization).delete()

            # 3. Delete Products
            prod_ids = created.get("products", [])
            if prod_ids:
                Product.objects.filter(id__in=prod_ids, organization=job.organization).delete()

            # 4. Delete Customers
            cust_ids = created.get("customers", [])
            if cust_ids:
                Customer.objects.filter(id__in=cust_ids, organization=job.organization).delete()

            # 5. Delete Suppliers
            sup_ids = created.get("suppliers", [])
            if sup_ids:
                Supplier.objects.filter(id__in=sup_ids, organization=job.organization).delete()

            # 6. Delete Categories
            cat_ids = created.get("categories", [])
            if cat_ids:
                ProductCategory.objects.filter(id__in=cat_ids, organization=job.organization).delete()

            job.status = "rolled_back"
            job.save(update_fields=["status"])

        return job
