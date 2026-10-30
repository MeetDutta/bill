import os
import sys
import time
import uuid
import statistics
from decimal import Decimal
import concurrent.futures

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.db import connection, transaction
from django.utils import timezone
from apps.users.models import User
from apps.organizations.models import Organization
from apps.stores.models import Store
from apps.products.models import Product, ProductCategory, InventoryMovement
from apps.customers.models import Customer
from apps.billing.models import BusinessConfig
from apps.billing.services.checkout_service import CheckoutService
from apps.transactions.models import Transaction, TransactionItem


def setup_benchmark_environment():
    org = Organization.objects.create(
        name="Load Test Enterprise",
        legal_name="Load Test Enterprise Pvt Ltd",
        gst_number="27LOADT1234F1Z1",
        state="Maharashtra",
    )
    store = Store.objects.create(
        organization=org,
        name="Flagship Load Store",
        code="LOAD-01",
        state="Maharashtra",
        status="active",
    )
    cashier = User.objects.create_user(
        email=f"load.cashier.{uuid.uuid4().hex[:6]}@loadtest.local",
        password="Password@123",
        organization=org,
        role="cashier",
    )
    BusinessConfig.objects.create(
        organization=org,
        business_type="RETAIL",
        gst_enabled=True,
        default_tax_rate=Decimal("18.00"),
        default_tax_mode="exclusive",
    )
    return org, store, cashier


def run_concurrency_tier(org, store, cashier, concurrency: int, total_requests: int):
    """
    Executes `total_requests` checkout transactions across `concurrency` concurrent workers.
    Each checkout attempts to buy 1 unit of a dedicated product stocked with `total_requests` units.
    """
    # Create a fresh product for this tier
    prod = Product.objects.create(
        organization=org,
        name=f"Load Benchmark Item Tier {concurrency}",
        sku=f"BENCH-{concurrency}-{uuid.uuid4().hex[:6]}",
        selling_price=Decimal("100.00"),
        unit_price=Decimal("100.00"),
        current_stock=Decimal(str(total_requests)),
        baseline_stock=Decimal(str(total_requests)),
        track_inventory=True,
        is_active=True,
    )

    latencies = []
    successes = 0
    failures = 0
    errors = []

    def single_checkout(task_id: int):
        connection.close()  # Ensure thread-local DB connection
        # Set SQLite busy timeout so threads wait for writer lock
        try:
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA busy_timeout = 10000;")
        except Exception:
            pass
        t_start = time.perf_counter()
        cart_data = {
            "items": [{
                "product_id": str(prod.id),
                "quantity": 1,
                "unit_price": 100.00,
                "name": prod.name,
            }],
            "payments": [{
                "payment_method": "cash",
                "amount": 118.00,
            }],
            "idempotency_key": f"BENCH-{concurrency}-{task_id}-{uuid.uuid4().hex[:8]}",
        }
        try:
            res = CheckoutService.process_checkout(
                organization=org,
                store=store,
                user=cashier,
                cart_data=cart_data,
            )
            t_end = time.perf_counter()
            elapsed_ms = (t_end - t_start) * 1000.0
            return True, elapsed_ms, None
        except Exception as exc:
            t_end = time.perf_counter()
            elapsed_ms = (t_end - t_start) * 1000.0
            return False, elapsed_ms, str(exc)
        finally:
            connection.close()

    wall_start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(single_checkout, i) for i in range(total_requests)]
        for f in concurrent.futures.as_completed(futures):
            ok, lat, err = f.result()
            latencies.append(lat)
            if ok:
                successes += 1
            else:
                failures += 1
                errors.append(err)
    wall_duration = time.perf_counter() - wall_start

    # Inventory consistency validation
    prod.refresh_from_db()
    expected_remaining = Decimal(str(total_requests - successes))
    actual_remaining = prod.current_stock
    inventory_consistent = (actual_remaining == expected_remaining)

    # Metrics calculation
    latencies.sort()
    min_lat = min(latencies)
    mean_lat = statistics.mean(latencies)
    max_lat = max(latencies)
    p95_lat = latencies[int(len(latencies) * 0.95)] if len(latencies) >= 20 else latencies[-1]
    p99_lat = latencies[int(len(latencies) * 0.99)] if len(latencies) >= 100 else latencies[-1]
    throughput = len(latencies) / wall_duration if wall_duration > 0 else 0
    error_rate = (failures / len(latencies)) * 100.0

    return {
        "concurrency": concurrency,
        "total_requests": total_requests,
        "wall_duration_s": round(wall_duration, 3),
        "throughput_req_s": round(throughput, 2),
        "min_ms": round(min_lat, 2),
        "mean_ms": round(mean_lat, 2),
        "p95_ms": round(p95_lat, 2),
        "p99_ms": round(p99_lat, 2),
        "max_ms": round(max_lat, 2),
        "successes": successes,
        "failures": failures,
        "error_rate_pct": round(error_rate, 2),
        "inventory_consistent": inventory_consistent,
        "expected_stock": expected_remaining,
        "actual_stock": actual_remaining,
        "errors_sample": errors[:3],
    }


def main():
    print("=" * 80)
    print("BILLMEET FINAL ADVERSARIAL AUDIT — CONTROLLED CONCURRENT LOAD BENCHMARK")
    print(f"Timestamp: {timezone.now().isoformat()}")
    print("=" * 80)

    org, store, cashier = setup_benchmark_environment()

    tiers = [
        (1, 20),    # Baseline
        (5, 50),    # Normal usage
        (10, 100),  # Store peak
        (25, 100),  # Multi-store peak
        (50, 100),  # High stress
        (100, 100), # Maximum concurrency stress
    ]

    results = []
    print(f"{'Concurrency':<12} | {'Requests':<9} | {'Throughput':<14} | {'Mean (ms)':<10} | {'p95 (ms)':<10} | {'p99 (ms)':<10} | {'Err %':<8} | {'Stock Consistent'}")
    print("-" * 95)

    for concurrency, requests in tiers:
        res = run_concurrency_tier(org, store, cashier, concurrency, requests)
        results.append(res)
        print(
            f"{res['concurrency']:<12} | "
            f"{res['total_requests']:<9} | "
            f"{res['throughput_req_s']:>8.2f} req/s | "
            f"{res['mean_ms']:>8.2f}ms | "
            f"{res['p95_ms']:>8.2f}ms | "
            f"{res['p99_ms']:>8.2f}ms | "
            f"{res['error_rate_pct']:>6.2f}% | "
            f"{'YES' if res['inventory_consistent'] else 'FAIL: MISMATCH'}"
        )
        if res['errors_sample']:
            print(f"   [Error details sample]: {res['errors_sample'][0]}")

    print("=" * 110)
    print("FINAL BENCHMARK SUMMARY TABLE")
    print("=" * 110)
    print(f"{'Concurrency':<12} | {'Requests':<9} | {'Throughput':<14} | {'Min (ms)':<10} | {'Mean (ms)':<10} | {'p95 (ms)':<10} | {'p99 (ms)':<10} | {'Max (ms)':<10} | {'Err %':<8} | {'Stock Consistent'}")
    print("-" * 125)
    for res in results:
        print(
            f"{res['concurrency']:<12} | "
            f"{res['total_requests']:<9} | "
            f"{res['throughput_req_s']:>8.2f} req/s | "
            f"{res['min_ms']:>8.2f}ms | "
            f"{res['mean_ms']:>8.2f}ms | "
            f"{res['p95_ms']:>8.2f}ms | "
            f"{res['p99_ms']:>8.2f}ms | "
            f"{res['max_ms']:>8.2f}ms | "
            f"{res['error_rate_pct']:>6.2f}% | "
            f"{'YES' if res['inventory_consistent'] else 'FAIL: MISMATCH'}"
        )
    print("=" * 110)
    print(f"Overall Inventory Consistency across all tiers: {'100% VERIFIED' if all(r['inventory_consistent'] for r in results) else 'INCONSISTENCY DETECTED'}")
    print("=" * 110)


if __name__ == "__main__":
    main()
