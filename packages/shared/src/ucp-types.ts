/**
 * UCP (Universal Commerce Protocol) Types
 *
 * Represents the data structures used by Google's Universal Commerce Protocol.
 * UCP uses a layered architecture: Shopping Service → Capabilities → Extensions.
 *
 * Based on the UCP specification:
 * @see https://ucp.dev/
 * @see https://developers.google.com/merchant/ucp
 */

// ---------------------------------------------------------------------------
// Core primitives (Shopping Service layer)
// ---------------------------------------------------------------------------

export interface UcpMoney {
  currencyCode: string; // ISO 4217
  units: string; // integer part
  nanos: number; // fractional part (10^-9)
}

export interface UcpProduct {
  id: string;
  title: string;
  description: string;
  price: UcpMoney;
  images: Array<{ url: string; altText?: string }>;
  uri: string;
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER";
  brand?: string;
  gtin?: string;
  categories: string[];
  attributes: Record<string, string>;
}

export interface UcpOffer {
  id: string;
  productId: string;
  merchantId: string;
  price: UcpMoney;
  availability: UcpProduct["availability"];
  shippingOptions: UcpShippingOption[];
  condition: "NEW" | "REFURBISHED" | "USED";
}

// ---------------------------------------------------------------------------
// Capabilities layer
// ---------------------------------------------------------------------------

/** Capability declaration — merchants advertise what they support */
export interface UcpCapabilityDeclaration {
  capabilities: Array<{
    name: string;
    version: string;
    extensions?: string[];
  }>;
}

// Checkout capability
export interface UcpShippingOption {
  id: string;
  label: string;
  price: UcpMoney;
  estimatedDeliveryDate: {
    minDays: number;
    maxDays: number;
  };
}

export interface UcpCheckoutRequest {
  offerId: string;
  quantity: number;
  shippingAddress: UcpAddress;
  shippingOptionId: string;
  buyerInfo: {
    email: string;
    name: string;
  };
  paymentToken: string; // AP2 payment token
}

export interface UcpCheckoutResponse {
  orderId: string;
  status: "CONFIRMED" | "PENDING_PAYMENT" | "FAILED";
  estimatedDelivery: {
    minDate: string; // ISO 8601
    maxDate: string;
  };
  total: UcpMoney;
}

export interface UcpAddress {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  administrativeArea: string; // state/province
  postalCode: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

// ---------------------------------------------------------------------------
// Order management capability
// ---------------------------------------------------------------------------

export interface UcpOrder {
  orderId: string;
  merchantOrderId: string;
  status:
    | "CREATED"
    | "CONFIRMED"
    | "IN_PROGRESS"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED"
    | "RETURNED";
  lineItems: Array<{
    offerId: string;
    productId: string;
    title: string;
    quantity: number;
    price: UcpMoney;
  }>;
  total: UcpMoney;
  shippingAddress: UcpAddress;
  fulfillment?: {
    carrier: string;
    trackingId: string;
    trackingUrl?: string;
    status: "PROCESSING" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED";
    estimatedDelivery?: string; // ISO 8601
  };
  buyer: {
    email: string;
    name: string;
  };
  createdTime: string; // ISO 8601
  updatedTime: string; // ISO 8601
}

// Returns capability
export interface UcpReturnRequest {
  orderId: string;
  lineItems: Array<{
    offerId: string;
    quantity: number;
    reason: string;
    reasonCode:
      | "DEFECTIVE"
      | "WRONG_ITEM"
      | "CHANGED_MIND"
      | "BETTER_PRICE"
      | "OTHER";
  }>;
}

export interface UcpReturn {
  returnId: string;
  orderId: string;
  status: "REQUESTED" | "APPROVED" | "RECEIVED" | "REFUNDED" | "REJECTED";
  lineItems: UcpReturnRequest["lineItems"];
  refundAmount?: UcpMoney;
  createdTime: string;
  updatedTime: string;
}

// ---------------------------------------------------------------------------
// Notifications (merchant → agent platform)
// ---------------------------------------------------------------------------

export interface UcpNotification {
  notificationId: string;
  type:
    | "ORDER_STATUS_CHANGED"
    | "SHIPMENT_UPDATED"
    | "RETURN_STATUS_CHANGED"
    | "REFUND_ISSUED";
  orderId: string;
  data: Record<string, unknown>;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Merchant API surface (what the mock UCP merchant exposes)
// ---------------------------------------------------------------------------

export interface UcpMerchantApi {
  // Capability negotiation
  "GET /capabilities": {
    response: UcpCapabilityDeclaration;
  };

  // Product discovery
  "POST /products/search": {
    request: {
      query: string;
      filters?: Record<string, string>;
      pageSize?: number;
      pageToken?: string;
    };
    response: {
      products: UcpProduct[];
      nextPageToken?: string;
    };
  };
  "GET /products/:id": {
    response: UcpProduct;
  };

  // Offers
  "GET /offers": {
    request: { productId: string };
    response: { offers: UcpOffer[] };
  };

  // Checkout
  "POST /checkout": {
    request: UcpCheckoutRequest;
    response: UcpCheckoutResponse;
  };

  // Order management
  "GET /orders/:id": {
    response: UcpOrder;
  };
  "POST /orders/:id/cancel": {
    request: { reason: string };
    response: UcpOrder;
  };

  // Returns
  "POST /returns": {
    request: UcpReturnRequest;
    response: UcpReturn;
  };
  "GET /returns/:id": {
    response: UcpReturn;
  };
}
