import factory
from decimal import Decimal

from django.utils import timezone

from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.customers.models import Customer
from apps.products.models import Product, ProductCategory
from apps.transactions.models import Transaction, TransactionItem
from apps.loyalty.models import LoyaltyAccount, LoyaltyRule
from apps.coupons.models import Coupon


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Org {n}")
    email = factory.LazyAttribute(lambda o: f"{o.name.lower().replace(' ', ' ')}@test.com")
    phone = factory.Sequence(lambda n: f"+91987654{n:04d}")
    country = "IN"
    currency = "INR"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@test.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    phone = factory.Sequence(lambda n: f"+91987654{n:04d}")
    role = "org_admin"
    organization = factory.SubFactory(OrganizationFactory)
    is_active = True

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        password = extracted or "testpass123"
        obj.set_password(password)
        if create:
            obj.save()


class StoreFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Store

    name = factory.Sequence(lambda n: f"Store {n}")
    code = factory.Sequence(lambda n: f"STR{n:03d}")
    organization = factory.SubFactory(OrganizationFactory)
    phone = factory.Sequence(lambda n: f"+91987654{n:04d}")
    status = "active"


class CustomerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Customer

    customer_id = factory.Sequence(lambda n: f"CUST{n:04d}")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    phone = factory.Sequence(lambda n: f"+91987654{n:04d}")
    email = factory.LazyAttribute(lambda o: f"{o.first_name.lower()}@test.com")
    organization = factory.SubFactory(OrganizationFactory)
    source = "manual"
    total_purchases = 0
    total_spend = Decimal("0")
    average_order_value = Decimal("0")
    is_active = True
    whatsapp_opt_in = True


class ProductCategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProductCategory

    name = factory.Sequence(lambda n: f"Category {n}")
    organization = factory.SubFactory(OrganizationFactory)


class ProductFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Product

    external_id = factory.Sequence(lambda n: f"P{n:04d}")
    name = factory.Sequence(lambda n: f"Product {n}")
    organization = factory.SubFactory(OrganizationFactory)
    unit_price = Decimal("100.00")
    tax_rate = Decimal("18.00")
    is_active = True


class TransactionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Transaction

    organization = factory.SubFactory(OrganizationFactory)
    store = factory.SubFactory(StoreFactory)
    customer = factory.SubFactory(CustomerFactory)
    invoice_number = factory.Sequence(lambda n: f"INV{n:05d}")
    transaction_date = factory.LazyFunction(timezone.now)
    subtotal = Decimal("1000.00")
    discount = Decimal("0")
    tax = Decimal("180.00")
    total = Decimal("1180.00")
    payment_method = "UPI"
    status = "completed"


class TransactionItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TransactionItem

    transaction = factory.SubFactory(TransactionFactory)
    name = factory.Sequence(lambda n: f"Item {n}")
    quantity = Decimal("1")
    unit_price = Decimal("100.00")
    discount = Decimal("0")
    tax = Decimal("18.00")
    total = Decimal("118.00")


class LoyaltyAccountFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = LoyaltyAccount

    organization = factory.SubFactory(OrganizationFactory)
    customer = factory.SubFactory(CustomerFactory)
    balance = Decimal("0")
    total_earned = Decimal("0")
    total_redeemed = Decimal("0")


class LoyaltyRuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = LoyaltyRule

    name = factory.Sequence(lambda n: f"Rule {n}")
    rule_type = "earn_purchase"
    points = Decimal("10")
    per_amount = Decimal("100")
    min_transaction_amount = Decimal("0")
    is_active = True
    organization = factory.SubFactory(OrganizationFactory)


class CouponFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Coupon

    code = factory.Sequence(lambda n: f"CPN{n:04d}")
    name = factory.Sequence(lambda n: f"Coupon {n}")
    discount_type = "percentage"
    discount_value = Decimal("10")
    min_order_value = Decimal("100")
    start_at = factory.LazyFunction(timezone.now)
    expires_at = factory.LazyFunction(lambda: timezone.now() + timezone.timedelta(days=30))
    usage_limit = 100
    per_customer_limit = 1
    is_active = True
    organization = factory.SubFactory(OrganizationFactory)
