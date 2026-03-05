# onX Integration Kit

End-to-end testing environment and reference implementation for [onX (Order Network Exchange)](https://github.com/commerce-operations-foundation/onx-spec) — the open standard linking agentic commerce selling channels to the world of fulfillment.

This kit demonstrates how onX normalizes orders from both **OpenAI's ACP** (Agentic Commerce Protocol) and **Google's UCP** (Universal Commerce Protocol) into a single canonical format that any fulfillment system can consume.

## Architecture

```
┌─────────────────┐     webhook      ┌──────────────┐    fulfillment    ┌─────────────────┐
│   Mock ACP      │────────────────▶│              │────────────────▶│                 │
│   Merchant      │                  │   onX Hub    │                  │  Mock 3PL/WMS   │
│   (port 3001)   │                  │  (port 3000) │◀────────────────│   (port 3003)   │
└─────────────────┘                  │              │   status update   └─────────────────┘
                                     │              │
┌─────────────────┐   notification   │              │
│   Mock UCP      │────────────────▶│              │
│   Merchant      │                  │              │
│   (port 3002)   │                  └──────┬───────┘
└─────────────────┘                         │
                                            ▼
                                     MCP Tool API
                                    (for AI agents)
```

**What each service does:**

| Service | Port | Role |
|---------|------|------|
| **onX Hub** | 3000 | The core — receives orders from ACP/UCP, normalizes them into the onX format, forwards to fulfillment, and exposes MCP tools for AI agent interaction |
| **Mock ACP** | 3001 | Simulates an ACP-compliant merchant (product search, cart, checkout, webhooks) as defined by OpenAI + Stripe |
| **Mock UCP** | 3002 | Simulates a UCP-compliant merchant (capability negotiation, offers, checkout, notifications) as defined by Google |
| **Mock Fulfillment** | 3003 | Simulates a 3PL/WMS that receives onX-normalized orders and processes pick/pack/ship/deliver workflows |

## Quick Start

### Option A: Docker Compose (recommended)

```bash
docker-compose up --build
```

All four services start automatically with correct inter-service networking.

### Option B: Manual Setup

**Prerequisites:** Node.js 20+, pnpm 8+

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start all services (uses concurrently)
pnpm dev
```

This starts all four services with color-coded log output.

### Run the Test Scenarios

Once services are running:

```bash
# Run all scenarios
pnpm test:scenarios

# Run a specific scenario
npx tsx scenarios/run-all.ts acp-buy
npx tsx scenarios/run-all.ts ucp-buy
npx tsx scenarios/run-all.ts acp-cancel
npx tsx scenarios/run-all.ts mcp-tools
```

## Test Scenarios

The kit includes four end-to-end scenarios that exercise the full order lifecycle:

### 1. `acp-buy` — ACP Purchase → Ship → Deliver

Demonstrates the happy path through ACP: product search → cart → checkout → onX normalization → fulfillment pick/pack/ship → delivery confirmation.

### 2. `ucp-buy` — UCP Purchase → Ship → Return

Exercises UCP's capability negotiation, offer-based checkout, AP2 payment tokens, and the return flow — showing how onX handles UCP's distinct data model.

### 3. `acp-cancel` — ACP Purchase → Cancel Before Ship

Tests order cancellation propagation: ACP cancel → onX status update → event recording.

### 4. `mcp-tools` — MCP Tool API

Verifies the onX hub's MCP-compatible tool interface: tool discovery, direct order creation, order retrieval, and event listing — the interface AI agents use to interact with onX.

## Key Concepts Demonstrated

### onX as Universal Adapter

The core insight: ACP and UCP have fundamentally different data models.

| Concept | ACP | UCP |
|---------|-----|-----|
| **Money** | `{ amount: 12999, currency: "USD" }` (cents) | `{ units: "129", nanos: 990000000, currencyCode: "USD" }` |
| **Products** | Products have prices directly | Products have Offers with prices (separate) |
| **Checkout** | Cart → Checkout Session → Confirm | Capability negotiation → Offer → Checkout |
| **Payments** | Stripe PaymentIntent | AP2 payment token |
| **Events** | Webhooks | Notifications |
| **Naming** | camelCase, flat | UPPER_CASE enums, nested |

The onX hub translates both into one canonical format (`OnxOrder`) that fulfillment systems consume. This means a 3PL only needs one integration — with onX — instead of separate integrations for every selling channel.

### MCP Tool Interface

The onX hub exposes MCP-compatible tools that AI agents can use:

- `onx_create_order` — Ingest an order from any channel
- `onx_get_order` — Retrieve a normalized order
- `onx_update_shipment` — Update tracking/shipping info
- `onx_request_return` — Initiate a return
- `onx_cancel_order` — Cancel an order
- `onx_list_events` — View the order's lifecycle event trail

## Project Structure

```
onx-integration-kit/
├── packages/
│   ├── shared/              # Shared TypeScript types (onX, ACP, UCP)
│   │   └── src/
│   │       ├── onx-types.ts    # Canonical onX order model
│   │       ├── acp-types.ts    # ACP data structures
│   │       └── ucp-types.ts    # UCP data structures
│   ├── onx-hub/             # onX translation hub
│   │   └── src/
│   │       ├── index.ts        # Express server, webhook receivers, MCP API
│   │       └── translators/
│   │           ├── acp-translator.ts  # ACP → onX conversion
│   │           └── ucp-translator.ts  # UCP → onX conversion
│   ├── mock-acp/            # Mock ACP merchant
│   │   └── src/
│   │       ├── index.ts        # Express server with ACP endpoints
│   │       └── seed-data.ts    # Product catalog
│   ├── mock-ucp/            # Mock UCP merchant
│   │   └── src/
│   │       ├── index.ts        # Express server with UCP endpoints
│   │       └── seed-data.ts    # Product & offer catalog
│   └── mock-fulfillment/    # Mock 3PL service
│       └── src/
│           └── index.ts        # Receives onX orders, simulates fulfillment
├── scenarios/
│   └── run-all.ts           # End-to-end test scenarios
├── docker-compose.yml       # One-command startup
├── package.json             # Workspace root
└── pnpm-workspace.yaml
```

## Building Your Own Integration

This kit is designed as a starting point. Here's how to use it:

### If you're a **selling channel** integrating with onX:

1. Study `packages/shared/src/onx-types.ts` for the canonical order model
2. Look at the ACP and UCP translators to understand the mapping
3. Build your own translator in `packages/onx-hub/src/translators/`

### If you're a **fulfillment provider** integrating with onX:

1. Study `packages/mock-fulfillment/src/index.ts` for the expected interface
2. The onX hub sends you `OnxOrder` objects — that's your contract
3. Send shipment updates back via the MCP tool API

### If you're building an **AI agent** that interacts with commerce:

1. Query `GET /mcp/tools` to discover available onX capabilities
2. Use `POST /mcp/tools/:name` to invoke tools
3. All order data is in the canonical onX format regardless of origin

## Contributing

This is a [Commerce Operations Foundation](https://github.com/commerce-operations-foundation) project. We welcome contributions from members and the broader community.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Links

- [onX Specification](https://github.com/commerce-operations-foundation/onx-spec)
- [Commerce Operations Foundation](https://commerceoperationsfoundation.org)
- [ACP Specification](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- [UCP Specification](https://ucp.dev/)
