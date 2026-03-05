/**
 * ACP → onX Translator
 *
 * Converts ACP order data into the canonical onX format.
 * This is the core value proposition of onX: regardless of whether an order
 * arrives via ACP or UCP, the fulfillment side sees the same normalized model.
 */

import { v4 as uuid } from "uuid";
import type { AcpOrder } from "@onx-kit/shared";
import {
  type OnxOrder,
  type OnxEvent,
  OnxOrderStatus,
  OnxEventType,
  OnxSourceChannel,
} from "@onx-kit/shared";

/**
 * Translate an ACP order confirmation into an onX order.
 */
export function translateAcpOrder(acpOrder: AcpOrder): OnxOrder {
  const now = new Date().toISOString();

  return {
    id: `onx-${uuid()}`,
    externalId: acpOrder.id,
    sourceChannel: OnxSourceChannel.ACP,
    status: mapAcpStatus(acpOrder.status),
    customer: {
      id: acpOrder.customer.id,
      email: acpOrder.customer.email,
      name: acpOrder.customer.name,
    },
    shippingAddress: {
      name: acpOrder.shippingAddress.name,
      line1: acpOrder.shippingAddress.line1,
      line2: acpOrder.shippingAddress.line2,
      city: acpOrder.shippingAddress.city,
      state: acpOrder.shippingAddress.state,
      postalCode: acpOrder.shippingAddress.postalCode,
      country: acpOrder.shippingAddress.country,
    },
    lineItems: acpOrder.items.map((item, idx) => ({
      id: `li-${idx + 1}`,
      sku: item.productId, // ACP uses productId as SKU equivalent
      name: item.name,
      quantity: item.quantity,
      unitPrice: {
        amount: item.unitPrice.amount,
        currency: item.unitPrice.currency,
      },
      totalPrice: {
        amount: item.unitPrice.amount * item.quantity,
        currency: item.unitPrice.currency,
      },
    })),
    subtotal: { amount: acpOrder.total.amount, currency: acpOrder.total.currency },
    shippingCost: { amount: 999, currency: "USD" }, // ACP doesn't break this out in order
    tax: { amount: 0, currency: "USD" },
    total: { amount: acpOrder.total.amount, currency: acpOrder.total.currency },
    payment: {
      id: `pay-${uuid()}`,
      provider: "stripe",
      method: "card",
      status: "captured",
      amount: { amount: acpOrder.total.amount, currency: acpOrder.total.currency },
      capturedAt: now,
    },
    shipments: acpOrder.tracking
      ? [
          {
            id: `ship-${uuid()}`,
            carrier: acpOrder.tracking.carrier,
            trackingNumber: acpOrder.tracking.trackingNumber,
            trackingUrl: acpOrder.tracking.url,
            status: "pending",
            lineItemIds: acpOrder.items.map((_, idx) => `li-${idx + 1}`),
          },
        ]
      : [],
    returns: [],
    metadata: {
      sourceProtocol: "acp",
      checkoutSessionId: acpOrder.checkoutSessionId,
    },
    createdAt: acpOrder.createdAt,
    updatedAt: now,
  };
}

/**
 * Create an onX event from an ACP webhook event.
 */
export function translateAcpWebhookToEvent(
  webhookType: string,
  orderId: string,
  data: Record<string, unknown>
): OnxEvent {
  return {
    id: `evt-${uuid()}`,
    type: mapAcpWebhookType(webhookType),
    orderId,
    timestamp: new Date().toISOString(),
    data,
  };
}

function mapAcpStatus(status: AcpOrder["status"]): OnxOrderStatus {
  const map: Record<AcpOrder["status"], OnxOrderStatus> = {
    confirmed: OnxOrderStatus.CONFIRMED,
    processing: OnxOrderStatus.PROCESSING,
    shipped: OnxOrderStatus.SHIPPED,
    delivered: OnxOrderStatus.DELIVERED,
    cancelled: OnxOrderStatus.CANCELLED,
  };
  return map[status] || OnxOrderStatus.PENDING;
}

function mapAcpWebhookType(type: string): OnxEventType {
  const map: Record<string, OnxEventType> = {
    "order.confirmed": OnxEventType.ORDER_CONFIRMED,
    "order.shipped": OnxEventType.SHIPMENT_CREATED,
    "order.delivered": OnxEventType.SHIPMENT_DELIVERED,
    "order.cancelled": OnxEventType.ORDER_CANCELLED,
    "refund.created": OnxEventType.REFUND_ISSUED,
  };
  return map[type] || OnxEventType.ORDER_CREATED;
}
