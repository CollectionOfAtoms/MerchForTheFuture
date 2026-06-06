"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPrintOrderAction } from "@/app/actions/print";

interface PrintProduct {
  sku: string;
  size: string;
  price: number;
  mockupUrl?: string | null;
}

interface PrintOptionsSelectorProps {
  listingId: string;
  printProducts: PrintProduct[];
  isLoggedIn: boolean;
}

const MATERIAL_LABELS: Record<string, string> = {
  FAP: "Fine Art Paper",
  CAN: "Stretched Canvas",
};

function getMaterial(sku: string): string {
  // SKU format: GLOBAL-{MATERIAL}-{SIZE}
  return sku.split("-")[1] ?? "FAP";
}

function getMaterials(products: PrintProduct[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const p of products) {
    const m = getMaterial(p.sku);
    if (!seen.has(m)) { seen.add(m); order.push(m); }
  }
  return order;
}

export default function PrintOptionsSelector({ listingId, printProducts, isLoggedIn }: PrintOptionsSelectorProps) {
  const materials = getMaterials(printProducts);
  const [selectedMaterial, setSelectedMaterial] = useState(materials[0] ?? "FAP");

  const materialProducts = printProducts.filter((p) => getMaterial(p.sku) === selectedMaterial);
  const [selectedSku, setSelectedSku] = useState(materialProducts[0]?.sku ?? printProducts[0]?.sku ?? "");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleMaterialChange(material: string) {
    setSelectedMaterial(material);
    const first = printProducts.find((p) => getMaterial(p.sku) === material);
    if (first) setSelectedSku(first.sku);
  }

  const selectedProduct = printProducts.find((p) => p.sku === selectedSku) ?? materialProducts[0];

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
        <p className="font-medium text-stone-700">Order a Print</p>
        <p className="mt-1 text-xs">Sign in to order a print of this artwork.</p>
        <a
          href="/sign-in"
          className="mt-3 inline-block rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Sign In to Order
        </a>
      </div>
    );
  }

  function handleOrder() {
    if (!selectedProduct) return;
    setError(null);
    startTransition(async () => {
      const result = await createPrintOrderAction(listingId, selectedProduct.sku, selectedProduct.size, quantity);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.push(`/checkout/${result.orderId}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Material selector */}
      {materials.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1.5">Material</label>
          <div className="flex flex-wrap gap-2">
            {materials.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMaterialChange(m)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedMaterial === m
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                }`}
              >
                {MATERIAL_LABELS[m] ?? m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size selector */}
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1.5">Size</label>
        <div className="flex flex-wrap gap-2">
          {materialProducts.map((p) => (
            <button
              key={p.sku}
              type="button"
              onClick={() => setSelectedSku(p.sku)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedSku === p.sku
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
              }`}
            >
              {p.size}
            </button>
          ))}
        </div>
      </div>

      {/* Mockup preview */}
      {selectedProduct?.mockupUrl && (
        <div className="overflow-hidden rounded-xl border border-stone-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedProduct.mockupUrl}
            alt="Print mockup"
            className="w-full object-cover"
          />
        </div>
      )}

      {/* Price */}
      {selectedProduct && (
        <p className="text-xl font-bold text-stone-900">
          {(selectedProduct.price * quantity).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })}
        </p>
      )}

      {/* Quantity */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-stone-500">Qty</label>
        <input
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-16 rounded-lg border border-stone-200 px-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <button
        type="button"
        onClick={handleOrder}
        disabled={isPending || !selectedProduct}
        className="w-full rounded-full bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors disabled:opacity-50"
      >
        {isPending ? "Processing…" : "Order Print"}
      </button>
    </div>
  );
}
