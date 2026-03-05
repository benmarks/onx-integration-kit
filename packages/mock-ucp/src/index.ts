/**
 * Mock UCP Merchant Service
 *
 * Simulates a UCP-compliant merchant API as defined by Google's Universal
 * Commerce Protocol. Key UCP-specific features modeled:
 *
 *   - Capability negotiation
 *   - UcpMoney format (units + nanos)
 *   - Offer-based pricing (separate from products)
 *   - AP2 payment token flow (simulated)
 *   - Notification emission (to onX hub)
 *
 * All data is held in memory. No real payments are processed.
 */

import express from "express";
import { v4 as uuid } from "uuid";
import type {
  UcpProduct,
  UcpOffer,
  UcpOrder,
  UcpReturn,
  UcpNotification,
  UcpCapabilityDeclaration,
} from "@onx-kit/shared";
import { SEED_PRODUCTS, SEED_OFFERS } from "./seed-data.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.UCP_PORT || "3002", 10);
const ONX_WEBHOOK_URL =
  process.env.ONX_WEBHOOK_URL || "http://localhost:3000/webhooks/ucp";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const products: Map<string, UcpProduct> = new Map(
  SEED_PRODUCTS.map((p) => [p.id, p])
);
const offers: Map<string, UcpOffer> = new Map(
  SEED_OFFERS.map((o) => [o.id, o])
);
const orders: Map<string, UcpOrder> = new Map();
const returns: Map<string, UcpReturn> = new Map();
const notificationLog: UcpNotification[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

async function emitNotification(notification: UcpNotification): Promise<void> {
  notificationLog.push(notification);
  try {
    await fetch(ONX_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    });
    console.log(
      `[UCP] Notification sent: ${notification.type} → ${ONX_WEBHOOK_URL}`
    );
  } catch (err) {
    console.warn(
      `[UCP] Notification delivery failed: ${(err as Error).message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Routes: Capability negotiation
// ---------------------------------------------------------------------------

app.get("/capabilities", (_req, res) => {
  const capabilities: UcpCapabilityDeclaration = {
    capabilities: [
      { name: "shopping", version: "1.0" },
      { name: "checkout", version: "1.0", extensions: ["ap2_payments"] },
      { name: "order_management", version: "1.0" },
      {
        name: "returns",
        version: "1.0",
        extensions: ["automated_refunds"],
      },
      { name: "fulfillment_tracking", version: "1.0" },
    ],
  };
  res.json(capabilities);
});

// ---------------------------------------------------------------------------
// Routes: Product discovery
// ---------------------------------------------------------------------------

app.post("/products/search", (req, res) => {
  const { query = "", pageSize = 10 } = req.body;
  const q = query.toLowerCase();
  const results = [...products.values()]
    .filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
    .slice(0, pageSize);

  res.json({ products: results, nextPageToken: undefined });
});

app.get("/products/:id", (req, res) => {
  const product = products.get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// ---------------------------------------------------------------------------
// Routes: Offers
// ---------------------------------------------------------------------------

app.get("/offers", (req, res) => {
  const { productId } = req.query;
  const result = [...offers.values()].filter(
    (o) => !productId || o.productId === productId
  );
  res.json({ offers: result });
});

// ---------------------------------------------------------------------------
// Routes: Checkout
// ---------------------------------------------------------------------------

app.post("/checkout", async (req, res) => {
  const { offerId, quantity, shippingAddress, shippingOptionId, buyerInfo } =
    req.body;

  const offer = offers.get(offerId);
  if (!offer) return res.status(400).json({ error: "Offer not found" });

  const product = products.get(offer.productId);
  if (!product)
    return res.status(400).json({ error: "Product not found for offer" });

  const unitPriceInCents =
    parseInt(offer.price.units) * 100 +
    Math.round(offer.price.nanos / 10000000);
  const totalCents = unitPriceInCents * quantity;

  const order: UcpOrder = {
    orderId: `ucp-order-${uuid()}`,
    merchantOrderId: `merch-${uuid().slice(0, 8)}`,
    status: "CONFIRMED",
    lineItems: [
      {
        offerId,
        productId: offer.productId,
        title: product.title,
        quantity,
        price: offer.price,
      },
    ],
    total: {
      currencyCode: "USD",
      units: String(Math.floor(totalCents / 100)),
      nanos: (totalCents % 100) * 10000000,
    },
    shippingAddress,
    buyer: buyerInfo,
    createdTime: now(),
    updatedTime: now(),
  };

  orders.set(order.orderId, order);

  await emitNotification({
    notificationId: `notif-${uuid()}`,
    type: "ORDER_STATUS_CHANGED",
    orderId: order.orderId,
    data: { order, newStatus: "CONFIRMED" },
    timestamp: now(),
  });

  res.status(201).json({
    orderId: order.orderId,
    status: "CONFIRMED",
    estimatedDelivery: { minDate: "2026-03-07", maxDate: "2026-03-09" },
    total: order.total,
  });
});

// ---------------------------------------------------------------------------
// Routes: Order management
// ---------------------------------------------------------------------------

app.get("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.post("/orders/:id/cancel", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.status === "SHIPPED" || order.status === "DELIVERED") {
    return res
      .status(400)
      .json({ error: "Cannot cancel a shipped/delivered order" });
  }

  order.status = "CANCELLED";
  order.updatedTime = now();

  await emitNotification({
    notificationId: `notif-${uuid()}`,
    type: "ORDER_STATUS_CHANGED",
    orderId: order.orderId,
    data: { order, newStatus: "CANCELLED", reason: req.body.reason },
    timestamp: now(),
  });

  res.json(order);
});

// ---------------------------------------------------------------------------
// Routes: Simulate lifecycle events (for testing)
// ---------------------------------------------------------------------------

app.post("/orders/:id/ship", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = "SHIPPED";
  order.fulfillment = {
    carrier: req.body.carrier || "MockCarrier",
    trackingId: req.body.trackingId || `UCP-TRACK-${uuid().slice(0, 8)}`,
    trackingUrl: `https://mock-tracking.example/${req.body.trackingId || "demo"}`,
    status: "SHIPPED",
    estimatedDelivery: "2026-03-09",
  };
  order.updatedTime = now();

  await emitNotification({
    notificationId: `notif-${uuid()}`,
    type: "SHIPMENT_UPDATED",
    orderId: order.orderId,
    data: { order, fulfillment: order.fulfillment },
    timestamp: now(),
  });

  res.json(order);
});

app.post("/orders/:id/deliver", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = "DELIVERED";
  if (order.fulfillment) order.fulfillment.status = "DELIVERED";
  order.updatedTime = now();

  await emitNotification({
    notificationId: `notif-${uuid()}`,
    type: "SHIPMENT_UPDATED",
    orderId: order.orderId,
    data: { order, fulfillment: order.fulfillment },
    timestamp: now(),
  });

  res.json(order);
});

// ---------------------------------------------------------------------------
// Routes: Returns
// ---------------------------------------------------------------------------

app.post("/returns", async (req, res) => {
  const { orderId, lineItems } = req.body;
  const order = orders.get(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const ret: UcpReturn = {
    returnId: `ucp-return-${uuid()}`,
    orderId,
    status: "REQUESTED",
    lineItems,
    createdTime: now(),
    updatedTime: now(),
  };

  returns.set(ret.returnId, ret);

  await emitNotification({
    notificationId: `notif-${uuid()}`,
    type: "RETURN_STATUS_CHANGED",
    orderId,
    data: { return: ret },
    timestamp: now(),
  });

  res.status(201).json(ret);
});

app.get("/returns/:id", (req, res) => {
  const ret = returns.get(req.params.id);
  if (!ret) return res.status(404).json({ error: "Return not found" });
  res.json(ret);
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "mock-ucp" })
);
app.get("/notifications/log", (_req, res) => res.json(notificationLog));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[UCP] Mock UCP merchant listening on http://localhost:${PORT}`);
  console.log(`[UCP] ${products.size} products, ${offers.size} offers loaded`);
  console.log(`[UCP] Notifications → ${ONX_WEBHOOK_URL}`);
});
