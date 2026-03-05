/**
 * onX (Order Network Exchange) Core Types
 *
 * These types represent the canonical onX order model that serves as the
 * universal translation layer between selling channels (ACP, UCP, etc.)
 * and fulfillment systems.
 *
 * @see https://github.com/commerce-operations-foundation/onx-spec
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum OnxOrderStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  RETURNED = "returned",
  REFUNDED = "refunded",
}

export enum OnxEventType {
  ORDER_CREATED = "order.created",
  ORDER_CONFIRMED = "order.confirmed",
  ORDER_CAPTURED = "order.captured",
  SHIPMENT_CREATED = "shipment.created",
  SHIPMENT_UPDATED = "shipment.updated",
  SHIPMENT_DELIVERED = "shipment.delivered",
  RETURN_REQUESTED = "return.requested",
  RETURN_RECEIVED = "return.received",
  ORDER_CANCELLED = "order.cancelled",
  REFUND_ISSUED = "refund.issued",
}

export enum OnxSourceChannel {
  ACP = "acp",
  UCP = "ucp",
  DIRECT = "direct",
}

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

export interface OnxMoney {
  amount: number;
  currency: string; // ISO 4217
}

export interface OnxAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface OnxLineItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: OnxMoney;
  totalPrice: OnxMoney;
  attributes?: Record<string, string>;
}

export interface OnxShipment {
  id: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: "pending" | "in_transit" | "delivered" | "exception";
  lineItemIds: string[];
  shippedAt?: string; // ISO 8601
  deliveredAt?: string; // ISO 8601
}

export interface OnxReturn {
  id: string;
  reason: string;
  lineItemIds: string[];
  status: "requested" | "approved" | "received" | "refunded" | "rejected";
  requestedAt: string; // ISO 8601
  receivedAt?: string; // ISO 8601
}

export interface OnxPayment {
  id: string;
  provider: string; // e.g. "stripe", "adyen"
  method: string; // e.g. "card", "wallet"
  status: "authorized" | "captured" | "refunded" | "failed";
  amount: OnxMoney;
  capturedAt?: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Core order
// ---------------------------------------------------------------------------

export interface OnxOrder {
  id: string;
  externalId: string; // ID from the source channel
  sourceChannel: OnxSourceChannel;
  status: OnxOrderStatus;
  customer: {
    id: string;
    email: string;
    name: string;
  };
  shippingAddress: OnxAddress;
  lineItems: OnxLineItem[];
  subtotal: OnxMoney;
  shippingCost: OnxMoney;
  tax: OnxMoney;
  total: OnxMoney;
  payment: OnxPayment;
  shipments: OnxShipment[];
  returns: OnxReturn[];
  metadata: Record<string, string>;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface OnxEvent {
  id: string;
  type: OnxEventType;
  orderId: string;
  timestamp: string; // ISO 8601
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP tool definitions (for onX MCP server)
// ---------------------------------------------------------------------------

export interface OnxToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const ONX_TOOLS: OnxToolDefinition[] = [
  {
    name: "onx_create_order",
    description:
      "Ingest a new order from a selling channel (ACP/UCP) and normalize it into the onX format.",
    inputSchema: {
      type: "object",
      properties: {
        sourceChannel: {
          type: "string",
          enum: ["acp", "ucp", "direct"],
        },
        rawOrder: {
          type: "object",
          description: "The raw order payload from the source channel.",
        },
      },
      required: ["sourceChannel", "rawOrder"],
    },
  },
  {
    name: "onx_get_order",
    description: "Retrieve an onX-normalized order by ID.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
      },
      required: ["orderId"],
    },
  },
  {
    name: "onx_update_shipment",
    description:
      "Update shipment information for an order (e.g., tracking number, status).",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        shipment: { type: "object" },
      },
      required: ["orderId", "shipment"],
    },
  },
  {
    name: "onx_request_return",
    description: "Initiate a return request for specific line items.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        lineItemIds: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["orderId", "lineItemIds", "reason"],
    },
  },
  {
    name: "onx_cancel_order",
    description: "Cancel an order that has not yet shipped.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["orderId"],
    },
  },
  {
    name: "onx_list_events",
    description: "List lifecycle events for an order.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        eventType: { type: "string" },
      },
      required: ["orderId"],
    },
  },
];
