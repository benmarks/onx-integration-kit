/**
 * ACP (Agentic Commerce Protocol) Types
 *
 * Represents the data structures used by OpenAI + Stripe's Agentic Commerce
 * Protocol. These types are used by the mock-acp service and the onX hub's
 * ACP translator.
 *
 * Based on the ACP specification:
 * @see https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
 * @see https://developers.openai.com/commerce/
 */

// ---------------------------------------------------------------------------
// Product catalog
// ---------------------------------------------------------------------------

export interface AcpProduct {
  id: string;
  name: string;
  description: string;
  price: {
    amount: number;
    currency: string;
  };
  images: string[];
  url: string;
  availability: "in_stock" | "out_of_stock" | "preorder";
  attributes: Record<string, string>;
}

export interface AcpProductSearchRequest {
  query: string;
  filters?: Record<string, string>;
  limit?: number;
  offset?: number;
}

export interface AcpProductSearchResponse {
  products: AcpProduct[];
  total: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Cart & checkout
// ---------------------------------------------------------------------------

export interface AcpCartItem {
  productId: string;
  quantity: number;
  selectedAttributes?: Record<string, string>;
}

export interface AcpCart {
  id: string;
  items: AcpCartItem[];
  subtotal: { amount: number; currency: string };
  shipping: { amount: number; currency: string };
  tax: { amount: number; currency: string };
  total: { amount: number; currency: string };
}

export interface AcpShippingOption {
  id: string;
  name: string;
  price: { amount: number; currency: string };
  estimatedDelivery: string;
}

export interface AcpCheckoutSession {
  id: string;
  cart: AcpCart;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  shippingOption: AcpShippingOption;
  paymentIntent: {
    id: string;
    clientSecret: string;
    status: "requires_payment_method" | "requires_confirmation" | "succeeded" | "failed";
  };
}

// ---------------------------------------------------------------------------
// Order (ACP's view)
// ---------------------------------------------------------------------------

export interface AcpOrder {
  id: string;
  checkoutSessionId: string;
  status: "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: { amount: number; currency: string };
  }>;
  total: { amount: number; currency: string };
  shippingAddress: AcpCheckoutSession["shippingAddress"];
  tracking?: {
    carrier: string;
    trackingNumber: string;
    url: string;
  };
  customer: {
    id: string;
    email: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Webhooks (ACP merchant → agent platform)
// ---------------------------------------------------------------------------

export interface AcpWebhookEvent {
  id: string;
  type:
    | "order.confirmed"
    | "order.shipped"
    | "order.delivered"
    | "order.cancelled"
    | "refund.created";
  data: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API endpoints (what the mock ACP merchant exposes)
// ---------------------------------------------------------------------------

export interface AcpMerchantApi {
  // Product discovery
  "POST /products/search": {
    request: AcpProductSearchRequest;
    response: AcpProductSearchResponse;
  };
  "GET /products/:id": {
    response: AcpProduct;
  };

  // Cart & checkout
  "POST /cart": {
    request: { items: AcpCartItem[] };
    response: AcpCart;
  };
  "POST /checkout/sessions": {
    request: {
      cartId: string;
      shippingAddress: AcpCheckoutSession["shippingAddress"];
      shippingOptionId: string;
    };
    response: AcpCheckoutSession;
  };
  "POST /checkout/sessions/:id/confirm": {
    response: AcpOrder;
  };

  // Order management
  "GET /orders/:id": {
    response: AcpOrder;
  };
  "POST /orders/:id/cancel": {
    request: { reason?: string };
    response: AcpOrder;
  };
}
