/**
 * Seed product catalog for the mock UCP merchant.
 * Same conceptual store as ACP (outdoor gear) but expressed in UCP's format
 * to highlight the structural differences onX normalizes.
 */

import type { UcpProduct, UcpOffer } from "@onx-kit/shared";

export const SEED_PRODUCTS: UcpProduct[] = [
  {
    id: "ucp-prod-001",
    title: "Trail Runner Pro Shoes",
    description:
      "Lightweight trail running shoes with aggressive tread pattern and waterproof membrane.",
    price: { currencyCode: "USD", units: "129", nanos: 990000000 },
    images: [
      {
        url: "https://example.com/images/trail-runner-pro.jpg",
        altText: "Trail Runner Pro Shoes in Forest Green",
      },
    ],
    uri: "https://mock-ucp-store.example/products/trail-runner-pro",
    availability: "IN_STOCK",
    brand: "TrailCo",
    categories: ["Footwear", "Running"],
    attributes: { color: "Forest Green", size: "10", weight: "280g" },
  },
  {
    id: "ucp-prod-002",
    title: "Summit Pack 45L",
    description:
      "Versatile 45-liter backpack with adjustable torso length and rain cover.",
    price: { currencyCode: "USD", units: "189", nanos: 990000000 },
    images: [
      {
        url: "https://example.com/images/summit-pack-45.jpg",
        altText: "Summit Pack 45L in Midnight Blue",
      },
    ],
    uri: "https://mock-ucp-store.example/products/summit-pack-45",
    availability: "IN_STOCK",
    brand: "SummitGear",
    categories: ["Packs", "Hiking"],
    attributes: { color: "Midnight Blue", capacity: "45L" },
  },
  {
    id: "ucp-prod-003",
    title: "Alpine Down Jacket",
    description:
      "800-fill goose down jacket with water-resistant shell. Packs into its own pocket.",
    price: { currencyCode: "USD", units: "249", nanos: 990000000 },
    images: [
      {
        url: "https://example.com/images/alpine-down-jacket.jpg",
        altText: "Alpine Down Jacket in Ember Orange",
      },
    ],
    uri: "https://mock-ucp-store.example/products/alpine-down-jacket",
    availability: "IN_STOCK",
    brand: "AlpineWear",
    categories: ["Clothing", "Jackets"],
    attributes: { color: "Ember Orange", size: "M", fillPower: "800" },
  },
  {
    id: "ucp-prod-004",
    title: "Trekking Poles Carbon",
    description:
      "Ultra-light carbon fiber trekking poles with cork grips and flick-lock adjustment.",
    price: { currencyCode: "USD", units: "89", nanos: 990000000 },
    images: [
      {
        url: "https://example.com/images/trekking-poles.jpg",
        altText: "Carbon Trekking Poles",
      },
    ],
    uri: "https://mock-ucp-store.example/products/trekking-poles-carbon",
    availability: "IN_STOCK",
    categories: ["Accessories", "Hiking"],
    attributes: { material: "Carbon Fiber", weight: "195g per pole" },
  },
  {
    id: "ucp-prod-005",
    title: "Headlamp 500",
    description:
      "500-lumen rechargeable headlamp with red light mode and 40-hour battery life.",
    price: { currencyCode: "USD", units: "49", nanos: 990000000 },
    images: [
      {
        url: "https://example.com/images/headlamp-500.jpg",
        altText: "Headlamp 500 lumen",
      },
    ],
    uri: "https://mock-ucp-store.example/products/headlamp-500",
    availability: "OUT_OF_STOCK",
    categories: ["Accessories", "Lighting"],
    attributes: { lumens: "500", batteryLife: "40h" },
  },
];

export const SEED_OFFERS: UcpOffer[] = SEED_PRODUCTS.map((p) => ({
  id: `offer-${p.id}`,
  productId: p.id,
  merchantId: "mock-ucp-merchant-001",
  price: p.price,
  availability: p.availability,
  condition: "NEW" as const,
  shippingOptions: [
    {
      id: "standard",
      label: "Standard Shipping",
      price: { currencyCode: "USD", units: "9", nanos: 990000000 },
      estimatedDeliveryDate: { minDays: 3, maxDays: 5 },
    },
    {
      id: "express",
      label: "Express Shipping",
      price: { currencyCode: "USD", units: "19", nanos: 990000000 },
      estimatedDeliveryDate: { minDays: 1, maxDays: 2 },
    },
  ],
}));
