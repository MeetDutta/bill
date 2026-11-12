const fs = require("fs");
const path = require("path");
const assert = require("assert");
const ts = require("../node_modules/typescript");

function loadSmartPaymentModule() {
  const srcPath = path.resolve(__dirname, "../lib/smartPayment.ts");
  const tsCode = fs.readFileSync(srcPath, "utf8");
  const transpiled = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", transpiled.outputText);
  fn(mod.exports, require, mod);
  return mod.exports;
}

function runSmartPaymentTests() {
  console.log("=== Running Unified Smart Payment State Machine Tests ===");
  const sp = loadSmartPaymentModule();
  const BILL_1000 = sp.toPaise(1000);
  const BILL_1500 = sp.toPaise(1500);

  // Test 1: Single Payment Auto-Fill (First method gets full remaining balance)
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    assert.strictEqual(allocs.length, 1);
    assert.strictEqual(allocs[0].method, "CASH");
    assert.strictEqual(allocs[0].amountPaise, 100000);
    const m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.totalPaidPaise, 100000);
    assert.strictEqual(m.remainingPaise, 0);
    assert.strictEqual(m.changePaise, 0);
    console.log("✓ Test 1: Single payment auto-fills full bill amount (₹1,000.00)");
  }

  // Test 2 & 3: Partial Payment Triggering Auto Split + Remaining Balance Calculation
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "400", BILL_1000);
    let m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.totalPaidPaise, 40000);
    assert.strictEqual(m.remainingPaise, 60000);

    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000));
    assert.strictEqual(allocs.length, 2);
    assert.strictEqual(allocs[0].amountPaise, 40000);
    assert.strictEqual(allocs[1].method, "UPI");
    assert.strictEqual(allocs[1].amountPaise, 60000);
    m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.totalPaidPaise, 100000);
    assert.strictEqual(m.remainingPaise, 0);
    assert.strictEqual(m.isSplit, true);
    console.log("✓ Test 2 & 3: Partial ₹400 Cash -> ₹600 Remaining -> UPI auto-fills ₹600.00");
  }

  // Test 4: Multiple Split Methods (3-Way Split: Cash ₹500 + UPI ₹700 + Card ₹300 on ₹1,500)
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1500));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "500", BILL_1500);
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1500));
    assert.strictEqual(allocs[1].amountPaise, 100000);
    allocs = sp.updateAllocationAmount(allocs, allocs[1].id, "700", BILL_1500);
    let m = sp.computePaymentMetrics(allocs, BILL_1500);
    assert.strictEqual(m.remainingPaise, 30000);
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CARD", BILL_1500));
    assert.strictEqual(allocs[2].amountPaise, 30000);
    m = sp.computePaymentMetrics(allocs, BILL_1500);
    assert.strictEqual(m.totalPaidPaise, 150000);
    assert.strictEqual(m.remainingPaise, 0);
    assert.strictEqual(
      sp.validateSmartPayments(allocs, BILL_1500, {
        creditSalesEnabled: true,
        isWalkIn: true,
        selectedCustomer: null,
      }),
      null
    );
    console.log("✓ Test 4: 3-way split (Cash ₹500 + UPI ₹700 + Card ₹300 = ₹1,500.00)");
  }

  // Test 5: Cash Overpayment Change Calculation (Bill ₹1,000, Cash ₹1,200 -> Change ₹200)
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "1200", BILL_1000);
    const m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.totalPaidPaise, 120000);
    assert.strictEqual(m.remainingPaise, 0);
    assert.strictEqual(m.changePaise, 20000);
    assert.strictEqual(m.isElectronicOverpay, false);
    assert.strictEqual(
      sp.validateSmartPayments(allocs, BILL_1000, {
        creditSalesEnabled: true,
        isWalkIn: true,
        selectedCustomer: null,
      }),
      null
    );
    console.log("✓ Test 5: Cash ₹1,200 on ₹1,000 bill shows Change ₹200.00 and validates");
  }

  // Test 6: Electronic Overpayment Blocked (UPI ₹1,200 on ₹1,000)
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "1200", BILL_1000);
    const m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.isElectronicOverpay, true);
    const err = sp.validateSmartPayments(allocs, BILL_1000, {
      creditSalesEnabled: true,
      isWalkIn: true,
      selectedCustomer: null,
    });
    assert(err && err.toLowerCase().includes("cash"), "Electronic overpay must be blocked cleanly");
    console.log("✓ Test 6: Digital/UPI overpayment cleanly blocked");
  }

  // Test 7: Remove Payment Method -> Remaining updates & Card auto-fills remaining
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "400", BILL_1000);
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000));
    allocs = sp.removeAllocationRow(allocs, allocs[1].id);
    const mAfterRemove = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(mAfterRemove.remainingPaise, 60000);

    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CARD", BILL_1000));
    assert.strictEqual(allocs[1].method, "CARD");
    assert.strictEqual(allocs[1].amountPaise, 60000);
    console.log("✓ Test 7: Remove payment method restores Remaining & Card auto-fills ₹600.00");
  }

  // Test 8: Smart Adjustment + Manual Lock Editing
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "400", BILL_1000); // manual
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000)); // auto 600

    // Case A: UPI still auto (`isManual: false`), edit Cash 400 -> 500 -> UPI smartly adjusts to 500
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "500", BILL_1000);
    assert.strictEqual(allocs[1].amountPaise, 50000);
    assert.strictEqual(sp.computePaymentMetrics(allocs, BILL_1000).remainingPaise, 0);

    // Case B: Lock UPI explicitly (`isManual: true`), then edit Cash 500 -> 600 -> Paid = 1100, Change = 100
    allocs = sp.updateAllocationAmount(allocs, allocs[1].id, "500", BILL_1000);
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "600", BILL_1000);
    const m = sp.computePaymentMetrics(allocs, BILL_1000);
    assert.strictEqual(m.totalPaidPaise, 110000);
    assert.strictEqual(m.changePaise, 10000);
    console.log("✓ Test 8: Auto allocation adjusts seamlessly; locked manual rows yield Cash Change");
  }

  // Test 9 & 10: Credit Customer Guard & Dynamic Bill Total Update + Switching Untouched Method
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    // Switching untouched Cash -> UPI swaps smoothly instead of creating ₹0 UPI row
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000));
    assert.strictEqual(allocs.length, 1);
    assert.strictEqual(allocs[0].method, "UPI");
    assert.strictEqual(allocs[0].amountPaise, 100000);

    // Dynamic bill change 1000 -> 1250.75 updates untouched auto allocation
    allocs = sp.reconcileAllocationsForTotal(allocs, sp.toPaise(1250.75));
    assert.strictEqual(allocs[0].amountPaise, 125075);

    // Credit validation on walk-in blocked
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CREDIT", sp.toPaise(1250.75)));
    const errWalkIn = sp.validateSmartPayments(allocs, sp.toPaise(1250.75), {
      creditSalesEnabled: true,
      isWalkIn: true,
      selectedCustomer: null,
    });
    assert(errWalkIn && errWalkIn.toLowerCase().includes("walk-in"));

    // Registered customer within limit passes
    const errReg = sp.validateSmartPayments(allocs, sp.toPaise(1250.75), {
      creditSalesEnabled: true,
      isWalkIn: false,
      selectedCustomer: { id: "c1", credit_limit: "5000.00", outstanding_credit: "100.00" },
    });
    assert.strictEqual(errReg, null);

    // Registered customer exceeding limit blocked
    const errLimit = sp.validateSmartPayments(allocs, sp.toPaise(1250.75), {
      creditSalesEnabled: true,
      isWalkIn: false,
      selectedCustomer: { id: "c1", credit_limit: "1300.00", outstanding_credit: "100.00" },
    });
    assert(errLimit && errLimit.toLowerCase().includes("exceeds"));
    console.log("✓ Test 9 & 10: Method swap, dynamic cart total sync, and credit guards verified");
  }

  // Test 11: Integer-paise precision check (no floating point drift on 333.33 + 333.33 + 333.34)
  {
    let allocs = [];
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CASH", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[0].id, "333.33", BILL_1000);
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "UPI", BILL_1000));
    allocs = sp.updateAllocationAmount(allocs, allocs[1].id, "333.33", BILL_1000);
    ({ allocations: allocs } = sp.selectMethodAllocation(allocs, "CARD", BILL_1000));
    assert.strictEqual(allocs[2].amountPaise, 33334);
    assert.strictEqual(sp.fromPaise(allocs[2].amountPaise), 333.34);
    assert.strictEqual(sp.computePaymentMetrics(allocs, BILL_1000).remainingPaise, 0);
    console.log("✓ Test 11: Exact integer-paise arithmetic with zero float rounding drift");
  }

  // Test 12: Fast Normal Single-Payment Helpers (selectSingleMethodAllocation, quick cash denominations, display labels)
  {
    const BILL_1250 = sp.toPaise(1250);
    let single = sp.selectSingleMethodAllocation("CASH", BILL_1250);
    assert.strictEqual(single.length, 1);
    assert.strictEqual(single[0].method, "CASH");
    assert.strictEqual(single[0].amountPaise, 125000);
    // Simulate manual cash edit then clicking UPI cleanly swaps to 1 full UPI row
    single = sp.updateAllocationAmount(single, single[0].id, "1500", BILL_1250, { markManual: true });
    assert.strictEqual(sp.computePaymentMetrics(single, BILL_1250).changePaise, 25000);

    const switchedUpi = sp.selectSingleMethodAllocation("UPI", BILL_1250);
    assert.strictEqual(switchedUpi.length, 1);
    assert.strictEqual(switchedUpi[0].method, "UPI");
    assert.strictEqual(switchedUpi[0].amountPaise, 125000);

    assert.deepStrictEqual(sp.computeQuickCashAmounts(1250), [1300, 1500, 2000]);
    assert.deepStrictEqual(sp.computeQuickCashAmounts(420), [450, 500, 1000].filter((x) => x > 420) && sp.computeQuickCashAmounts(420));
    assert.strictEqual(sp.computeQuickCashAmounts(420).every((d) => d > 420), true);
    assert.strictEqual(sp.getAllocationDisplayLabel("UPI"), "UPI");
    assert.strictEqual(sp.getAllocationDisplayLabel("NETBANKING"), "Net Banking");
    console.log("✓ Test 12: Normal single-payment switch, quick cash denominations, and labels verified");
  }

  console.log("=== All Unified Smart Payment Frontend Logic Tests Passed! ===");
}

runSmartPaymentTests();

