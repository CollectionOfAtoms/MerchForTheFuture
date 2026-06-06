import { prisma } from "@/lib/db";
import { isTaxExempt } from "./exemption";

export interface TaxAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface TaxCalcInput {
  address: TaxAddress;
  subtotal: number;
  currency?: string;
  buyerId?: string;
}

interface TaxBreakdown {
  state_tax_rate?: number;
  county_tax_rate?: number;
  city_tax_rate?: number;
  special_district_tax_rate?: number;
}

export interface TaxResult {
  taxAmount: number;
  taxRate: number;
  hasNexus: boolean;
  taxExempt: boolean;
  jurisdiction: string;
  breakdown: TaxBreakdown;
}

interface TaxJarResponse {
  tax: {
    amount_to_collect: number;
    rate: number;
    has_nexus: boolean;
    tax_source?: string;
    breakdown?: TaxBreakdown;
  };
}

export async function calculateTax(input: TaxCalcInput): Promise<TaxResult> {
  const { address, subtotal, buyerId } = input;

  if (buyerId) {
    const exempt = await isTaxExempt(buyerId);
    if (exempt) {
      return {
        taxAmount: 0,
        taxRate: 0,
        hasNexus: false,
        taxExempt: true,
        jurisdiction: address.state,
        breakdown: {},
      };
    }
  }

  const apiKey = process.env.TAXJAR_API_KEY ?? "test_key";
  const response = await fetch("https://api.taxjar.com/v2/taxes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_country: "US",
      from_zip: "94107",
      from_state: "CA",
      to_country: address.country,
      to_zip: address.zip,
      to_state: address.state,
      to_city: address.city,
      to_street: address.street,
      amount: subtotal,
      shipping: 0,
      line_items: [
        {
          id: "1",
          quantity: 1,
          unit_price: subtotal,
          product_tax_code: "99999",
        },
      ],
    }),
  });

  const data = (await response.json()) as TaxJarResponse;
  const { tax } = data;

  return {
    taxAmount: tax.amount_to_collect ?? 0,
    taxRate: tax.rate ?? 0,
    hasNexus: tax.has_nexus ?? false,
    taxExempt: false,
    jurisdiction: address.state,
    breakdown: tax.breakdown ?? {},
  };
}

export async function applyTaxToOrder(orderId: string, address: TaxAddress): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const taxResult = await calculateTax({
    address,
    subtotal: Number(order.subtotal),
    buyerId: order.buyerId,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      taxAmount: taxResult.taxAmount,
      taxRate: taxResult.taxRate,
      taxJurisdiction: taxResult.jurisdiction,
      totalAmount: Number(order.subtotal) + taxResult.taxAmount,
    },
  });
}
