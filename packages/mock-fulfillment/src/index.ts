/**
 * Mock Fulfillment Service (3PL / WMS)
 *
 * Simulates a third-party logistics or warehouse management system that
 * receives onX-normalized orders. This demonstrates that fulfillment
 * systems only need to integrate with the onX format — they don't need
 * to know whether the order came from ACP, UCP, or any other channel.
 *
 * Features:
 *   - Receives orders from onX hub
 *   - Simulates pick/pack/ship workflow
 *   - Sends shipment updates back to onX hub
 *   - Processes return receipts
 */

import express from "express";
import { v4 as uuid } from "uuid";
import type { OnxOrder } from "@onx-kit/shared";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.FULFILLMENT_PORT || "3003", 10);
const ONX_HUB_URL =
  process.env.ONX_HUB_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

interface FulfillmentOrder {
  onxOrder: OnxOrder;
  fulfillmentStatus:
    | "received"
    | "picking"
    | "packing"
    | "shipped"
    | "delivered"
    | "return_received";
  receivedAt: string;
  updatedAt: string;
  trackingNumber?: string;
  carrier?: string;
}

const fulfillmentOrders: Map<string, FulfillmentOrder> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

async function notifyOnxHub(
  orderId: string,
  shipment: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${ONX_HUB_URL}/mcp/tools/onx_update_shipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, shipment }),
    });
    console.log(`[Fulfillment] Shipment update sent to onX hub for ${orderId}`);
  } catch (err) {
    console.warn(
      `[Fulfillment] Failed to notify onX hub: ${(err as Error).message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Routes: Receive orders from onX hub
// ---------------------------------------------------------------------------

app.post("/orders", (req, res) => {
  const onxOrder = req.body as OnxOrder;
  console.log(
    `[Fulfillment] Received order ${onxOrder.id} (source: ${onxOrder.sourceChannel})`
  );
  console.log(
    `[Fulfillment]   ${onxOrder.lineItems.length} line item(s), total: ${onxOrder.total.amount} ${onxOrder.total.currency}`
  );

  const fo: FulfillmentOrder = {
    onxOrder,
    fulfillmentStatus: "received",
    receivedAt: now(),
    updatedAt: now(),
  };

  fulfillmentOrders.set(onxOrder.id, fo);
  res.status(201).json({
    received: true,
    onxOrderId: onxOrder.id,
    fulfillmentStatus: fo.fulfillmentStatus,
  });
});

// ---------------------------------------------------------------------------
// Routes: Simulate fulfillment lifecycle
// ---------------------------------------------------------------------------

app.post("/orders/:id/pick", (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });

  fo.fulfillmentStatus = "picking";
  fo.updatedAt = now();
  console.log(`[Fulfillment] Order ${req.params.id} → picking`);

  res.json({ onxOrderId: req.params.id, fulfillmentStatus: fo.fulfillmentStatus });
});

app.post("/orders/:id/pack", (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });

  fo.fulfillmentStatus = "packing";
  fo.updatedAt = now();
  console.log(`[Fulfillment] Order ${req.params.id} → packing`);

  res.json({ onxOrderId: req.params.id, fulfillmentStatus: fo.fulfillmentStatus });
});

app.post("/orders/:id/ship", async (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });

  fo.fulfillmentStatus = "shipped";
  fo.trackingNumber = req.body.trackingNumber || `FUL-${uuid().slice(0, 8)}`;
  fo.carrier = req.body.carrier || "MockCarrier";
  fo.updatedAt = now();

  console.log(
    `[Fulfillment] Order ${req.params.id} → shipped (${fo.carrier}: ${fo.trackingNumber})`
  );

  // Notify onX hub of shipment
  await notifyOnxHub(req.params.id, {
    carrier: fo.carrier,
    trackingNumber: fo.trackingNumber,
    status: "in_transit",
    lineItemIds: fo.onxOrder.lineItems.map((li) => li.id),
    shippedAt: now(),
  });

  res.json({
    onxOrderId: req.params.id,
    fulfillmentStatus: fo.fulfillmentStatus,
    trackingNumber: fo.trackingNumber,
    carrier: fo.carrier,
  });
});

app.post("/orders/:id/deliver", async (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });

  fo.fulfillmentStatus = "delivered";
  fo.updatedAt = now();

  console.log(`[Fulfillment] Order ${req.params.id} → delivered`);

  await notifyOnxHub(req.params.id, {
    carrier: fo.carrier,
    trackingNumber: fo.trackingNumber,
    status: "delivered",
    lineItemIds: fo.onxOrder.lineItems.map((li) => li.id),
    deliveredAt: now(),
  });

  res.json({ onxOrderId: req.params.id, fulfillmentStatus: fo.fulfillmentStatus });
});

app.post("/orders/:id/receive-return", async (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });

  fo.fulfillmentStatus = "return_received";
  fo.updatedAt = now();

  console.log(`[Fulfillment] Return received for order ${req.params.id}`);

  res.json({ onxOrderId: req.params.id, fulfillmentStatus: fo.fulfillmentStatus });
});

// ---------------------------------------------------------------------------
// Routes: Query
// ---------------------------------------------------------------------------

app.get("/orders", (_req, res) => {
  const list = [...fulfillmentOrders.values()].map((fo) => ({
    onxOrderId: fo.onxOrder.id,
    sourceChannel: fo.onxOrder.sourceChannel,
    fulfillmentStatus: fo.fulfillmentStatus,
    lineItemCount: fo.onxOrder.lineItems.length,
    total: fo.onxOrder.total,
    trackingNumber: fo.trackingNumber,
    receivedAt: fo.receivedAt,
    updatedAt: fo.updatedAt,
  }));
  res.json(list);
});

app.get("/orders/:id", (req, res) => {
  const fo = fulfillmentOrders.get(req.params.id);
  if (!fo)
    return res.status(404).json({ error: "Fulfillment order not found" });
  res.json(fo);
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "mock-fulfillment",
    orders: fulfillmentOrders.size,
  })
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `[Fulfillment] Mock fulfillment service listening on http://localhost:${PORT}`
  );
  console.log(`[Fulfillment] onX hub → ${ONX_HUB_URL}`);
});
