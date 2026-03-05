/**
 * Seed product catalog for the mock ACP merchant.
 * These products simulate a small e-commerce store selling outdoor gear.
 */

import type { AcpProduct } from "@onx-kit/shared";

export const SEED_PRODUCTS: AcpProduct[] = [
  {
    id: "acp-prod-001",
    name: "Trail Runner Pro Shoes",
    description:
      "Lightweight trail running shoes with aggressive tread pattern and waterproof membrane.",
    price: { amount: 12999, currency: "USD" },
    images: ["https://example.com/images/trail-runner-pro.jpg"],
    url: "https://mock-acp-store.example/products/trail-runner-pro",
    availability: "in_stock",
    attributes: {
      color: "Forest Green",
      size: "10",
      weight: "280g",
    },
  },
  {
    id: "acp-prod-002",
    name: "Summit Pack 45L",
    description:
      "Versatile 45-liter backpack with adjustable torso length and rain cover.",
    price: { amount: 18999, currency: "USD" },
    images: ["https://example.com/images/summit-pack-45.jpg"],
    url: "https://mock-acp-store.example/products/summit-pack-45",
    availability: "in_stock",
    attributes: {
      color: "Midnight Blue",
      capacity: "45L",
    },
  },
  {
    id: "acp-prod-003",
    name: "Alpine Down Jacket",
    description:
      "800-fill goose down jacket with water-resistant shell. Packs into its own pocket.",
    price: { amount: 24999, currency: "USD" },
    images: ["https://example.com/images/alpine-down-jacket.jpg"],
    url: "https://mock-acp-store.example/products/alpine-down-jacket",
    availability: "in_stock",
    attributes: {
      color: "Ember Orange",
      size: "M",
      fillPower: "800",
    },
  },
  {
    id: "acp-prod-004",
    name: "Trekking Poles Carbon",
    description:
      "Ultra-light carbon fiber trekking poles with cork grips and flick-lock adjustment.",
    price: { amount: 8999, currency: "USD" },
    images: ["https://example.com/images/trekking-poles.jpg"],
    url: "https://mock-acp-store.example/products/trekking-poles-carbon",
    availability: "in_stock",
    attributes: {
      material: "Carbon Fiber",
      weight: "195g per pole",
    },
  },
  {
    id: "acp-prod-005",
    name: "Headlamp 500",
    description:
      "500-lumen rechargeable headlamp with red light mode and 40-hour battery life.",
    price: { amount: 4999, currency: "USD" },
    images: ["https://example.com/images/headlamp-500.jpg"],
    url: "https://mock-acp-store.example/products/headlamp-500",
    availability: "out_of_stock",
    attributes: {
      lumens: "500",
      batteryLife: "40h",
    },
  },
];
