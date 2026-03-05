/**
 * UCP → onX Translator
 *
 * Converts UCP order data into the canonical onX format.
 * Notable UCP-specific conversions:
 *   - UcpMoney (units + nanos) → onX cents-based amount
 *   - UCP field naming conventions → onX field naming
 *   - UCP capability-based fulfillment → onX shipment model
 */

import { v4 as uuid } from "uuid";
import type { UcpOrder, UcpReturn, UcpMoney } from "@onx-kit/shared";
import {
  type OnxOrder,
  type OnxReturn,
  type OnxEvent,
  OnxOrderStatus,
  OnxEventType,
  OnxSourceChannel,
} from "@onx-kit/shared";

/**
 * Convert UCP money (units + nanos) to onX cents.
 * UCP: { units: "129", nanos: 990000000 } → 12999 cents
 */
function ucpMoneyToCents(money: UcpMoney): number {
  return parseInt(money.units) * 100 + Math.round(money.nanos / 10000000);
}

/**
 * Translate a UCP order into an onX order.
 */
export function translateUcpOrder(ucpOrder: UcpOrder): OnxOrder {
  const now = new Date().toISOString();

  return {
    id: `onx-${uuid()}`,
    externalId: ucpOrder.orderId,
    sourceChannel: OnxSourceChannel.UCP,
    status: mapUcpStatus(ucpOrder.status),
    customer: {
      id: `ucp-buyer-${uuid().slice(0, 8)}`,
      email: ucpOrder.buyer.email,
      name: ucpOrder.buyer.name,
    },
    shippingAddress: {
      name: ucpOrder.shippingAddress.recipientName,
      line1: ucpOrder.shippingAddress.addressLine1,
      line2: ucpOrder.shippingAddress.addressLine2,
      city: ucpOrder.shippingAddress.city,
      state: ucpOrder.shippingAddress.administrativeArea,
      postalCode: ucpOrder.shippingAddress.postalCode,
      country: ucpOrder.shippingAddress.countryCode,
    },
    lineItems: ucpOrder.lineItems.map((item, idx) => {
      const unitCents = ucpMoneyToCents(item.price);
      return {
        id: `li-${idx + 1}`,
        sku: item.offerId, // UCP uses offerId as the purchasable unit
        name: item.title,
        quantity: item.quantity,
        unitPrice: { amount: unitCents, currency: item.price.currencyCode },
        totalPrice: {
          amount: unitCents * item.quantity,
          currency: item.price.currencyCode,
        },
      };
    }),
    subtotal: {
      amount: ucpMoneyToCents(ucpOrder.total),
      currency: ucpOrder.total.currencyCode,
    },
    shippingCost: { amount: 999, currency: "USD" },
    tax: { amount: 0, currency: "USD" },
    total: {
      amount: ucpMoneyToCents(ucpOrder.total),
      currency: ucpOrder.total.currencyCode,
    },
    payment: {
      id: `pay-${uuid()}`,
      provider: "ap2", // UCP uses Agent Payments Protocol
      method: "token",
      status: "captured",
      amount: {
        amount: ucpMoneyToCents(ucpOrder.total),
        currency: ucpOrder.total.currencyCode,
      },
      capturedAt: now,
    },
    shipments: ucpOrder.fulfillment
      ? [
          {
            id: `ship-${uuid()}`,
            carrier: ucpOrder.fulfillment.carrier,
            trackingNumber: ucpOrder.fulfillment.trackingId,
            trackingUrl: ucpOrder.fulfillment.trackingUrl,
            status: mapUcpFulfillmentStatus(ucpOrder.fulfillment.status),
            lineItemIds: ucpOrder.lineItems.map((_, idx) => `li-${idx + 1}`),
            shippedAt: ucpOrder.updatedTime,
          },
        ]
      : [],
    returns: [],
    metadata: {
      sourceProtocol: "ucp",
      merchantOrderId: ucpOrder.merchantOrderId,
    },
    createdAt: ucpOrder.createdTime,
    updatedAt: now,
  };
}

/**
 * Translate a UCP return into an onX return.
 */
export function translateUcpReturn(ucpReturn: UcpReturn): OnxReturn {
  return {
    id: `onx-ret-${uuid()}`,
    reason: ucpReturn.lineItems.map((li) => li.reason).join("; "),
    lineItemIds: ucpReturn.lineItems.map((li) => li.offerId),
    status: mapUcpReturnStatus(ucpReturn.status),
    requestedAt: ucpReturn.createdTime,
    receivedAt: ucpReturn.updatedTime,
  };
}

/**
 * Create an onX event from a UCP notification.
 */
export function translateUcpNotificationToEvent(
  notifType: string,
  orderId: string,
  data: Record<string, unknown>
): OnxEvent {
  return {
    id: `evt-${uuid()}`,
    type: mapUcpNotificationType(notifType),
    orderId,
    timestamp: new Date().toISOString(),
    data,
  };
}

function mapUcpStatus(status: UcpOrder["status"]): OnxOrderStatus {
  const map: Record<UcpOrder["status"], OnxOrderStatus> = {
    CREATED: OnxOrderStatus.PENDING,
    CONFIRMED: OnxOrderStatus.CONFIRMED,
    IN_PROGRESS: OnxOrderStatus.PROCESSING,
    SHIPPED: OnxOrderStatus.SHIPPED,
    DELIVERED: OnxOrderStatus.DELIVERED,
    CANCELLED: OnxOrderStatus.CANCELLED,
    RETURNED: OnxOrderStatus.RETURNED,
  };
  return map[status] || OnxOrderStatus.PENDING;
}

function mapUcpFulfillmentStatus(
  status: string
): "pending" | "in_transit" | "delivered" | "exception" {
  const map: Record<string, "pending" | "in_transit" | "delivered" | "exception"> = {
    PROCESSING: "pending",
    SHIPPED: "in_transit",
    IN_TRANSIT: "in_transit",
    DELIVERED: "delivered",
  };
  return map[status] || "pending";
}

function mapUcpReturnStatus(
  status: UcpReturn["status"]
): OnxReturn["status"] {
  const map: Record<UcpReturn["status"], OnxReturn["status"]> = {
    REQUESTED: "requested",
    APPROVED: "approved",
    RECEIVED: "received",
    REFUNDED: "refunded",
    REJECTED: "rejected",
  };
  return map[status] || "requested";
}

function mapUcpNotificationType(type: string): OnxEventType {
  const map: Record<string, OnxEventType> = {
    ORDER_STATUS_CHANGED: OnxEventType.ORDER_CONFIRMED,
    SHIPMENT_UPDATED: OnxEventType.SHIPMENT_UPDATED,
    RETURN_STATUS_CHANGED: OnxEventType.RETURN_REQUESTED,
    REFUND_ISSUED: OnxEventType.REFUND_ISSUED,
  };
  return map[type] || OnxEventType.ORDER_CREATED;
}
