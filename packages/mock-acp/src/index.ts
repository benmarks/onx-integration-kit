/**
 * Mock ACP Merchant Service
 *
 * Simulates an ACP-compliant merchant API as defined by the Agentic Commerce
 * Protocol (OpenAI + Stripe). This mock exposes:
 *
 *   - Product search & detail
 *   - Cart creation
 *   - Checkout session creation & confirmation
 *   - Order retrieval & cancellation
 *   - Webhook emission (to onX hub)
 *
 * All data is held in memory. No real payments are processed.
 */

import express from "express";
import { v4 as uuid } from "uuid";
import type {
  AcpProduct,
  AcpCart,
  AcpCheckoutSession,
  AcpOrder,
  AcpWebhookEvent,
} from "@onx-kit/shared";
import { SEED_PRODUCTS } from "./seed-data.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.ACP_PORT || "3001", 10);
const ONX_WEBHOOK_URL =
  process.env.ONX_WEBHOOK_URL || "http://localhost:3000/webhooks/acp";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const products: Map<string, AcpProduct> = new Map(
  SEED_PRODUCTS.map((p) => [p.id, p])
);
const carts: Map<string, AcpCart> = new Map();
const checkoutSessions: Map<string, AcpCheckoutSession> = new Map();
const orders: Map<string, AcpOrder> = new Map();
const webhookLog: AcpWebhookEvent[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

async function emitWebhook(event: AcpWebhookEvent): Promise<void> {
  webhookLog.push(event);
  try {
    await fetch(ONX_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    console.log(`[ACP] Webhook sent: ${event.type} → ${ONX_WEBHOOK_URL}`);
  } catch (err) {
    console.warn(`[ACP] Webhook delivery failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Routes: Product discovery
// ---------------------------------------------------------------------------

app.post("/products/search", (req, res) => {
  const { query = "", limit = 10 } = req.body;
  const q = query.toLowerCase();
  const results = [...products.values()]
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
    .slice(0, limit);

  res.json({
    products: results,
    total: results.length,
    hasMore: false,
  });
});

app.get("/products/:id", (req, res) => {
  const product = products.get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// ---------------------------------------------------------------------------
// Routes: Cart
// ---------------------------------------------------------------------------

app.post("/cart", (req, res) => {
  const { items = [] } = req.body;
  let subtotal = 0;

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product)
      return res
        .status(400)
        .json({ error: `Product not found: ${item.productId}` });
    subtotal += product.price.amount * item.quantity;
  }

  const shipping = 999; // flat $9.99
  const tax = Math.round(subtotal * 0.08); // 8% tax

  const cart: AcpCart = {
    id: `cart-${uuid()}`,
    items,
    subtotal: { amount: subtotal, currency: "USD" },
    shipping: { amount: shipping, currency: "USD" },
    tax: { amount: tax, currency: "USD" },
    total: { amount: subtotal + shipping + tax, currency: "USD" },
  };

  carts.set(cart.id, cart);
  res.status(201).json(cart);
});

// ---------------------------------------------------------------------------
// Routes: Checkout
// ---------------------------------------------------------------------------

app.post("/checkout/sessions", (req, res) => {
  const { cartId, shippingAddress, shippingOptionId } = req.body;
  const cart = carts.get(cartId);
  if (!cart) return res.status(400).json({ error: "Cart not found" });

  const session: AcpCheckoutSession = {
    id: `cs-${uuid()}`,
    cart,
    shippingAddress,
    shippingOption: {
      id: shippingOptionId || "standard",
      name: "Standard Shipping",
      price: cart.shipping,
      estimatedDelivery: "3-5 business days",
    },
    paymentIntent: {
      id: `pi-${uuid()}`,
      clientSecret: `pi_secret_${uuid()}`,
      status: "requires_confirmation",
    },
  };

  checkoutSessions.set(session.id, session);
  res.status(201).json(session);
});

app.post("/checkout/sessions/:id/confirm", async (req, res) => {
  const session = checkoutSessions.get(req.params.id);
  if (!session)
    return res.status(404).json({ error: "Checkout session not found" });

  // Simulate payment success
  session.paymentIntent.status = "succeeded";

  const order: AcpOrder = {
    id: `acp-order-${uuid()}`,
    checkoutSessionId: session.id,
    status: "confirmed",
    items: session.cart.items.map((item) => {
      const product = products.get(item.productId)!;
      return {
        productId: item.productId,
        name: product.name,
        quantity: item.quantity,
        unitPrice: product.price,
      };
    }),
    total: session.cart.total,
    shippingAddress: session.shippingAddress,
    customer: {
      id: `cust-${uuid()}`,
      email: "agent-buyer@example.com",
      name: session.shippingAddress.name,
    },
    createdAt: now(),
    updatedAt: now(),
  };

  orders.set(order.id, order);

  // Emit webhook to onX hub
  await emitWebhook({
    id: `evt-${uuid()}`,
    type: "order.confirmed",
    data: { order },
    createdAt: now(),
  });

  res.status(201).json(order);
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

  if (order.status === "shipped" || order.status === "delivered") {
    return res
      .status(400)
      .json({ error: "Cannot cancel a shipped/delivered order" });
  }

  order.status = "cancelled";
  order.updatedAt = now();

  await emitWebhook({
    id: `evt-${uuid()}`,
    type: "order.cancelled",
    data: { order, reason: req.body.reason || "Customer requested" },
    createdAt: now(),
  });

  res.json(order);
});

// ---------------------------------------------------------------------------
// Routes: Simulate lifecycle events (for testing)
// ---------------------------------------------------------------------------

app.post("/orders/:id/ship", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = "shipped";
  order.tracking = {
    carrier: req.body.carrier || "MockCarrier",
    trackingNumber: req.body.trackingNumber || `TRACK-${uuid().slice(0, 8)}`,
    url: `https://mock-tracking.example/${req.body.trackingNumber || "demo"}`,
  };
  order.updatedAt = now();

  await emitWebhook({
    id: `evt-${uuid()}`,
    type: "order.shipped",
    data: { order },
    createdAt: now(),
  });

  res.json(order);
});

app.post("/orders/:id/deliver", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  order.status = "delivered";
  order.updatedAt = now();

  await emitWebhook({
    id: `evt-${uuid()}`,
    type: "order.delivered",
    data: { order },
    createdAt: now(),
  });

  res.json(order);
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => res.json({ status: "ok", service: "mock-acp" }));
app.get("/webhooks/log", (_req, res) => res.json(webhookLog));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[ACP] Mock ACP merchant listening on http://localhost:${PORT}`);
  console.log(`[ACP] ${products.size} products loaded`);
  console.log(`[ACP] Webhooks → ${ONX_WEBHOOK_URL}`);
});
