#!/usr/bin/env npx tsx
/**
 * onX Integration Kit — Scenario Runner
 *
 * Runs end-to-end test scenarios against the running services.
 * Each scenario exercises a different part of the order lifecycle
 * through both ACP and UCP channels.
 *
 * Usage:
 *   npx tsx scenarios/run-all.ts          # run all scenarios
 *   npx tsx scenarios/run-all.ts acp-buy  # run a specific scenario
 *
 * Prerequisites:
 *   All four services must be running (use `npm run dev` or docker-compose up)
 */

const ACP_URL = process.env.ACP_URL || "http://localhost:3001";
const UCP_URL = process.env.UCP_URL || "http://localhost:3002";
const ONX_URL = process.env.ONX_URL || "http://localhost:3000";
const FUL_URL = process.env.FULFILLMENT_URL || "http://localhost:3003";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(
  url: string,
  method: string = "GET",
  body?: unknown
): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failed++;
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioAcpBuyAndShip(): Promise<void> {
  console.log("\n━━━ Scenario: ACP Buy → Ship → Deliver ━━━");

  // 1. Search products on ACP merchant
  console.log("\n  Step 1: Search products");
  const search = await api(`${ACP_URL}/products/search`, "POST", {
    query: "trail runner",
  });
  assert(search.products.length > 0, "Found trail runner products via ACP");

  // 2. Create cart
  console.log("  Step 2: Create cart");
  const cart = await api(`${ACP_URL}/cart`, "POST", {
    items: [{ productId: search.products[0].id, quantity: 1 }],
  });
  assert(cart.id !== undefined, `Cart created: ${cart.id}`);
  assert(cart.total.amount > 0, `Cart total: ${cart.total.amount} cents`);

  // 3. Create checkout session
  console.log("  Step 3: Create checkout session");
  const session = await api(`${ACP_URL}/checkout/sessions`, "POST", {
    cartId: cart.id,
    shippingAddress: {
      name: "Jane Agent",
      line1: "123 AI Boulevard",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
    },
    shippingOptionId: "standard",
  });
  assert(session.id !== undefined, `Checkout session: ${session.id}`);

  // 4. Confirm checkout (triggers webhook to onX)
  console.log("  Step 4: Confirm checkout → webhook to onX");
  const order = await api(
    `${ACP_URL}/checkout/sessions/${session.id}/confirm`,
    "POST"
  );
  assert(order.status === "confirmed", `ACP order confirmed: ${order.id}`);
  await sleep(500); // let webhook propagate

  // 5. Verify onX received and normalized the order
  console.log("  Step 5: Verify onX order");
  const onxOrders = await api(`${ONX_URL}/orders`);
  const onxOrder = onxOrders.find(
    (o: any) => o.externalId === order.id
  );
  assert(onxOrder !== undefined, `onX order exists: ${onxOrder?.id}`);
  assert(
    onxOrder?.sourceChannel === "acp",
    `Source channel is ACP`
  );

  // 6. Verify fulfillment received the order
  console.log("  Step 6: Verify fulfillment received order");
  const fulOrders = await api(`${FUL_URL}/orders`);
  const fulOrder = fulOrders.find(
    (o: any) => o.onxOrderId === onxOrder?.id
  );
  assert(fulOrder !== undefined, `Fulfillment has order`);
  assert(
    fulOrder?.fulfillmentStatus === "received",
    `Fulfillment status: received`
  );

  // 7. Simulate pick → pack → ship
  console.log("  Step 7: Fulfillment pick → pack → ship");
  await api(`${FUL_URL}/orders/${onxOrder.id}/pick`, "POST");
  await api(`${FUL_URL}/orders/${onxOrder.id}/pack`, "POST");
  const shipped = await api(`${FUL_URL}/orders/${onxOrder.id}/ship`, "POST", {
    carrier: "FedEx",
    trackingNumber: "FX-123456789",
  });
  assert(shipped.fulfillmentStatus === "shipped", "Fulfillment: shipped");
  assert(shipped.trackingNumber === "FX-123456789", "Tracking number set");
  await sleep(500);

  // 8. Verify onX received shipment update
  console.log("  Step 8: Verify onX shipment update");
  const updatedOnx = await api(`${ONX_URL}/orders/${onxOrder.id}`);
  assert(updatedOnx.shipments.length > 0, "onX has shipment data");

  // 9. Deliver
  console.log("  Step 9: Deliver");
  await api(`${FUL_URL}/orders/${onxOrder.id}/deliver`, "POST");
  await sleep(500);

  // 10. Check event trail
  console.log("  Step 10: Verify event trail");
  const events = await api(`${ONX_URL}/events?orderId=${onxOrder.id}`);
  assert(events.length >= 2, `${events.length} events recorded for order`);
}

async function scenarioUcpBuyAndReturn(): Promise<void> {
  console.log("\n━━━ Scenario: UCP Buy → Ship → Return ━━━");

  // 1. Check UCP capabilities
  console.log("\n  Step 1: Negotiate capabilities");
  const caps = await api(`${UCP_URL}/capabilities`);
  assert(caps.capabilities.length > 0, `UCP merchant has ${caps.capabilities.length} capabilities`);
  const hasReturns = caps.capabilities.some((c: any) => c.name === "returns");
  assert(hasReturns, "Returns capability supported");

  // 2. Search products
  console.log("  Step 2: Search products");
  const search = await api(`${UCP_URL}/products/search`, "POST", {
    query: "jacket",
  });
  assert(search.products.length > 0, "Found jacket products via UCP");

  // 3. Get offer
  console.log("  Step 3: Get offers");
  const offersRes = await api(
    `${UCP_URL}/offers?productId=${search.products[0].id}`
  );
  assert(offersRes.offers.length > 0, `Offers available for product`);
  const offer = offersRes.offers[0];

  // 4. Checkout (triggers notification to onX)
  console.log("  Step 4: Checkout → notification to onX");
  const checkout = await api(`${UCP_URL}/checkout`, "POST", {
    offerId: offer.id,
    quantity: 1,
    shippingAddress: {
      recipientName: "Bob Agent",
      addressLine1: "456 ML Street",
      city: "Mountain View",
      administrativeArea: "CA",
      postalCode: "94043",
      countryCode: "US",
    },
    shippingOptionId: "express",
    buyerInfo: { email: "bob@example.com", name: "Bob Agent" },
    paymentToken: "ap2-sandbox-token-123",
  });
  assert(checkout.status === "CONFIRMED", `UCP order confirmed: ${checkout.orderId}`);
  await sleep(500);

  // 5. Verify onX normalized the order
  console.log("  Step 5: Verify onX order");
  const onxOrders = await api(`${ONX_URL}/orders`);
  const onxOrder = onxOrders.find(
    (o: any) => o.externalId === checkout.orderId
  );
  assert(onxOrder !== undefined, `onX order exists: ${onxOrder?.id}`);
  assert(onxOrder?.sourceChannel === "ucp", "Source channel is UCP");
  assert(
    onxOrder?.payment.provider === "ap2",
    "Payment provider is AP2 (UCP-specific)"
  );

  // 6. Ship via UCP merchant
  console.log("  Step 6: Ship order");
  await api(`${UCP_URL}/orders/${checkout.orderId}/ship`, "POST", {
    carrier: "UPS",
    trackingId: "UPS-987654321",
  });
  await sleep(500);

  // 7. Deliver
  console.log("  Step 7: Deliver order");
  await api(`${UCP_URL}/orders/${checkout.orderId}/deliver`, "POST");
  await sleep(500);

  // 8. Request return via UCP
  console.log("  Step 8: Request return");
  const ret = await api(`${UCP_URL}/returns`, "POST", {
    orderId: checkout.orderId,
    lineItems: [
      {
        offerId: offer.id,
        quantity: 1,
        reason: "Size too small",
        reasonCode: "CHANGED_MIND",
      },
    ],
  });
  assert(ret.status === "REQUESTED", `Return requested: ${ret.returnId}`);
  await sleep(500);

  // 9. Verify onX captured the return event
  console.log("  Step 9: Verify onX events");
  const events = await api(`${ONX_URL}/events?orderId=${onxOrder.id}`);
  assert(events.length >= 3, `${events.length} events recorded`);
}

async function scenarioAcpCancelBeforeShip(): Promise<void> {
  console.log("\n━━━ Scenario: ACP Buy → Cancel (before ship) ━━━");

  // 1. Quick purchase
  console.log("\n  Step 1: Quick purchase via ACP");
  const search = await api(`${ACP_URL}/products/search`, "POST", {
    query: "backpack",
  });
  const cart = await api(`${ACP_URL}/cart`, "POST", {
    items: [{ productId: search.products[0].id, quantity: 2 }],
  });
  const session = await api(`${ACP_URL}/checkout/sessions`, "POST", {
    cartId: cart.id,
    shippingAddress: {
      name: "Cancel Test",
      line1: "789 Test Ave",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      country: "US",
    },
    shippingOptionId: "standard",
  });
  const order = await api(
    `${ACP_URL}/checkout/sessions/${session.id}/confirm`,
    "POST"
  );
  assert(order.status === "confirmed", `Order confirmed: ${order.id}`);
  await sleep(500);

  // 2. Cancel
  console.log("  Step 2: Cancel order");
  const cancelled = await api(`${ACP_URL}/orders/${order.id}/cancel`, "POST", {
    reason: "Changed my mind",
  });
  assert(cancelled.status === "cancelled", "ACP order cancelled");
  await sleep(500);

  // 3. Verify onX reflects cancellation
  console.log("  Step 3: Verify onX reflects cancellation");
  const onxOrders = await api(`${ONX_URL}/orders`);
  const onxOrder = onxOrders.find((o: any) => o.externalId === order.id);
  assert(onxOrder?.status === "cancelled", "onX order status: cancelled");

  // 4. Check cancel event
  console.log("  Step 4: Verify cancel event");
  const events = await api(`${ONX_URL}/events?orderId=${onxOrder.id}`);
  const cancelEvent = events.find(
    (e: any) => e.type === "order.cancelled"
  );
  assert(cancelEvent !== undefined, "Cancel event recorded in onX");
}

async function scenarioMcpToolInteraction(): Promise<void> {
  console.log("\n━━━ Scenario: MCP Tool API ━━━");

  // 1. List available tools
  console.log("\n  Step 1: Discover MCP tools");
  const tools = await api(`${ONX_URL}/mcp/tools`);
  assert(tools.tools.length >= 5, `${tools.tools.length} onX MCP tools available`);

  const toolNames = tools.tools.map((t: any) => t.name);
  assert(toolNames.includes("onx_create_order"), "onx_create_order tool exists");
  assert(toolNames.includes("onx_get_order"), "onx_get_order tool exists");
  assert(
    toolNames.includes("onx_request_return"),
    "onx_request_return tool exists"
  );

  // 2. Create order via MCP tool (direct ACP order injection)
  console.log("  Step 2: Create order via MCP tool");
  const result = await api(`${ONX_URL}/mcp/tools/onx_create_order`, "POST", {
    sourceChannel: "acp",
    rawOrder: {
      id: "mcp-test-order-001",
      checkoutSessionId: "mcp-cs-001",
      status: "confirmed",
      items: [
        {
          productId: "acp-prod-001",
          name: "Trail Runner Pro Shoes",
          quantity: 1,
          unitPrice: { amount: 12999, currency: "USD" },
        },
      ],
      total: { amount: 14097, currency: "USD" },
      shippingAddress: {
        name: "MCP Test",
        line1: "100 Tool Street",
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
        country: "US",
      },
      customer: {
        id: "mcp-cust-001",
        email: "mcp-test@example.com",
        name: "MCP Test",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  const mcpOrderId = result.result.id;
  assert(mcpOrderId !== undefined, `Order created via MCP: ${mcpOrderId}`);

  // 3. Retrieve via MCP tool
  console.log("  Step 3: Retrieve order via MCP tool");
  const fetched = await api(`${ONX_URL}/mcp/tools/onx_get_order`, "POST", {
    orderId: mcpOrderId,
  });
  assert(fetched.result.id === mcpOrderId, "Order retrieved successfully");

  // 4. List events via MCP tool
  console.log("  Step 4: List events via MCP tool");
  const evts = await api(`${ONX_URL}/mcp/tools/onx_list_events`, "POST", {
    orderId: mcpOrderId,
  });
  assert(evts.result.length >= 1, `${evts.result.length} events via MCP tool`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const SCENARIOS: Record<string, () => Promise<void>> = {
  "acp-buy": scenarioAcpBuyAndShip,
  "ucp-buy": scenarioUcpBuyAndReturn,
  "acp-cancel": scenarioAcpCancelBeforeShip,
  "mcp-tools": scenarioMcpToolInteraction,
};

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║  onX Integration Kit — Scenario Runner        ║");
  console.log("╚═══════════════════════════════════════════════╝");

  // Check services are up
  console.log("\nChecking services...");
  for (const [name, url] of [
    ["onX Hub", ONX_URL],
    ["Mock ACP", ACP_URL],
    ["Mock UCP", UCP_URL],
    ["Mock Fulfillment", FUL_URL],
  ]) {
    try {
      await api(`${url}/health`);
      console.log(`  ✓ ${name} is running at ${url}`);
    } catch {
      console.error(`  ✗ ${name} is NOT running at ${url}`);
      console.error(
        "\n  Please start all services first: npm run dev (or docker-compose up)"
      );
      process.exit(1);
    }
  }

  const requested = process.argv[2];
  const scenariosToRun = requested
    ? { [requested]: SCENARIOS[requested] }
    : SCENARIOS;

  if (requested && !SCENARIOS[requested]) {
    console.error(`\nUnknown scenario: ${requested}`);
    console.error(`Available: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exit(1);
  }

  for (const [name, fn] of Object.entries(scenariosToRun)) {
    try {
      await fn();
    } catch (err) {
      console.error(`\n  ✗ Scenario "${name}" threw: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
