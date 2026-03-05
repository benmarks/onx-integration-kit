/**
 * onX Hub — Order Network Exchange Translation Layer
 *
 * This is the heart of the integration kit. The onX hub:
 *
 *   1. Receives webhooks/notifications from ACP and UCP merchant services
 *   2. Translates them into the canonical onX order format
 *   3. Stores the normalized orders
 *   4. Forwards fulfillment instructions to the mock fulfillment service
 *   5. Exposes MCP-compatible tool endpoints for AI agent interaction
 *
 * Architecture:
 *
 *   [ACP Merchant] ──webhook──▶ ┌──────────┐ ──fulfillment──▶ [3PL/WMS]
 *                                │  onX Hub │
 *   [UCP Merchant] ──notify───▶ └──────────┘ ◀──status──────  [3PL/WMS]
 *                                     │
 *                                     ▼
 *                              [MCP Tool API]
 *                              (for AI agents)
 */

import express from "express";
import { v4 as uuid } from "uuid";
import type { OnxOrder, OnxEvent, AcpOrder, UcpOrder } from "@onx-kit/shared";
import { OnxEventType, ONX_TOOLS } from "@onx-kit/shared";
import {
  translateAcpOrder,
  translateAcpWebhookToEvent,
} from "./translators/acp-translator.js";
import {
  translateUcpOrder,
  translateUcpNotificationToEvent,
} from "./translators/ucp-translator.js";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.ONX_PORT || "3000", 10);
const FULFILLMENT_URL =
  process.env.FULFILLMENT_URL || "http://localhost:3003/orders";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const orders: Map<string, OnxOrder> = new Map();
const events: OnxEvent[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

async function forwardToFulfillment(order: OnxOrder): Promise<void> {
  try {
    await fetch(FULFILLMENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    console.log(
      `[onX] Order ${order.id} forwarded to fulfillment → ${FULFILLMENT_URL}`
    );
  } catch (err) {
    console.warn(
      `[onX] Fulfillment forwarding failed: ${(err as Error).message}`
    );
  }
}

function recordEvent(event: OnxEvent): void {
  events.push(event);
  console.log(`[onX] Event recorded: ${event.type} for order ${event.orderId}`);
}

// ---------------------------------------------------------------------------
// Webhook receivers (from selling channels)
// ---------------------------------------------------------------------------

/**
 * ACP webhook receiver.
 * The mock-acp service sends webhooks here when order events occur.
 */
app.post("/webhooks/acp", async (req, res) => {
  const webhook = req.body;
  console.log(`[onX] Received ACP webhook: ${webhook.type}`);

  const acpOrder = webhook.data?.order as AcpOrder | undefined;
  if (!acpOrder) {
    return res.status(400).json({ error: "No order data in webhook" });
  }

  // Check if we already have this order (update vs create)
  let onxOrder: OnxOrder | undefined;
  for (const existing of orders.values()) {
    if (existing.externalId === acpOrder.id) {
      onxOrder = existing;
      break;
    }
  }

  if (!onxOrder) {
    // New order — translate and store
    onxOrder = translateAcpOrder(acpOrder);
    orders.set(onxOrder.id, onxOrder);
    console.log(
      `[onX] New order created: ${onxOrder.id} (from ACP ${acpOrder.id})`
    );

    // Forward to fulfillment
    await forwardToFulfillment(onxOrder);
  } else {
    // Existing order — update status
    const updated = translateAcpOrder(acpOrder);
    onxOrder.status = updated.status;
    onxOrder.shipments = updated.shipments;
    onxOrder.updatedAt = now();
    console.log(
      `[onX] Order updated: ${onxOrder.id} → ${onxOrder.status}`
    );
  }

  // Record the event
  const event = translateAcpWebhookToEvent(
    webhook.type,
    onxOrder.id,
    webhook.data
  );
  recordEvent(event);

  res.json({ received: true, onxOrderId: onxOrder.id });
});

/**
 * UCP notification receiver.
 * The mock-ucp service sends notifications here when order events occur.
 */
app.post("/webhooks/ucp", async (req, res) => {
  const notification = req.body;
  console.log(`[onX] Received UCP notification: ${notification.type}`);

  const ucpOrder = notification.data?.order as UcpOrder | undefined;
  if (!ucpOrder) {
    return res.status(400).json({ error: "No order data in notification" });
  }

  let onxOrder: OnxOrder | undefined;
  for (const existing of orders.values()) {
    if (existing.externalId === ucpOrder.orderId) {
      onxOrder = existing;
      break;
    }
  }

  if (!onxOrder) {
    onxOrder = translateUcpOrder(ucpOrder);
    orders.set(onxOrder.id, onxOrder);
    console.log(
      `[onX] New order created: ${onxOrder.id} (from UCP ${ucpOrder.orderId})`
    );

    await forwardToFulfillment(onxOrder);
  } else {
    const updated = translateUcpOrder(ucpOrder);
    onxOrder.status = updated.status;
    onxOrder.shipments = updated.shipments;
    onxOrder.updatedAt = now();
    console.log(
      `[onX] Order updated: ${onxOrder.id} → ${onxOrder.status}`
    );
  }

  const event = translateUcpNotificationToEvent(
    notification.type,
    onxOrder.id,
    notification.data
  );
  recordEvent(event);

  res.json({ received: true, onxOrderId: onxOrder.id });
});

// ---------------------------------------------------------------------------
// MCP-compatible tool API
// ---------------------------------------------------------------------------

/**
 * List available onX tools (MCP tool discovery).
 */
app.get("/mcp/tools", (_req, res) => {
  res.json({ tools: ONX_TOOLS });
});

/**
 * Execute an onX tool (MCP tool invocation).
 */
app.post("/mcp/tools/:name", async (req, res) => {
  const { name } = req.params;
  const args = req.body;

  switch (name) {
    case "onx_create_order": {
      const { sourceChannel, rawOrder } = args;
      let onxOrder: OnxOrder;

      if (sourceChannel === "acp") {
        onxOrder = translateAcpOrder(rawOrder as AcpOrder);
      } else if (sourceChannel === "ucp") {
        onxOrder = translateUcpOrder(rawOrder as UcpOrder);
      } else {
        return res.status(400).json({ error: `Unknown channel: ${sourceChannel}` });
      }

      orders.set(onxOrder.id, onxOrder);
      await forwardToFulfillment(onxOrder);

      recordEvent({
        id: `evt-${uuid()}`,
        type: OnxEventType.ORDER_CREATED,
        orderId: onxOrder.id,
        timestamp: now(),
        data: { sourceChannel },
      });

      return res.json({ result: onxOrder });
    }

    case "onx_get_order": {
      const order = orders.get(args.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      return res.json({ result: order });
    }

    case "onx_update_shipment": {
      const order = orders.get(args.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const shipment = args.shipment;
      const existingIdx = order.shipments.findIndex(
        (s) => s.id === shipment.id
      );
      if (existingIdx >= 0) {
        order.shipments[existingIdx] = {
          ...order.shipments[existingIdx],
          ...shipment,
        };
      } else {
        order.shipments.push({
          id: `ship-${uuid()}`,
          ...shipment,
        });
      }
      order.updatedAt = now();

      recordEvent({
        id: `evt-${uuid()}`,
        type: OnxEventType.SHIPMENT_UPDATED,
        orderId: order.id,
        timestamp: now(),
        data: { shipment },
      });

      return res.json({ result: order });
    }

    case "onx_request_return": {
      const order = orders.get(args.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const ret = {
        id: `ret-${uuid()}`,
        reason: args.reason,
        lineItemIds: args.lineItemIds,
        status: "requested" as const,
        requestedAt: now(),
      };
      order.returns.push(ret);
      order.updatedAt = now();

      recordEvent({
        id: `evt-${uuid()}`,
        type: OnxEventType.RETURN_REQUESTED,
        orderId: order.id,
        timestamp: now(),
        data: { return: ret },
      });

      return res.json({ result: { order, return: ret } });
    }

    case "onx_cancel_order": {
      const order = orders.get(args.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      order.status = "cancelled" as any;
      order.updatedAt = now();

      recordEvent({
        id: `evt-${uuid()}`,
        type: OnxEventType.ORDER_CANCELLED,
        orderId: order.id,
        timestamp: now(),
        data: { reason: args.reason },
      });

      return res.json({ result: order });
    }

    case "onx_list_events": {
      const orderEvents = events.filter(
        (e) =>
          e.orderId === args.orderId &&
          (!args.eventType || e.type === args.eventType)
      );
      return res.json({ result: orderEvents });
    }

    default:
      return res.status(404).json({ error: `Unknown tool: ${name}` });
  }
});

// ---------------------------------------------------------------------------
// REST API (for direct querying)
// ---------------------------------------------------------------------------

app.get("/orders", (_req, res) => {
  res.json([...orders.values()]);
});

app.get("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.get("/events", (req, res) => {
  const { orderId } = req.query;
  if (orderId) {
    return res.json(events.filter((e) => e.orderId === orderId));
  }
  res.json(events);
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "onx-hub",
    orders: orders.size,
    events: events.length,
  })
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[onX] Hub listening on http://localhost:${PORT}`);
  console.log(`[onX] Fulfillment endpoint → ${FULFILLMENT_URL}`);
  console.log(`[onX] MCP tools available at /mcp/tools`);
});
