import { stripe } from "@/lib/payments/stripe";

/** A jurisdiction where the platform is registered to collect tax (US-5.3). */
export interface TaxRegistrationRow {
  id: string;
  country: string;
  /** US state code when the registration is US/state-scoped. */
  state: string | null;
  status: string;
  activeFrom: Date | null;
}

/**
 * The platform's active/scheduled Stripe Tax registrations, for the admin nexus
 * panel (US-5.3). Stripe's nexus monitoring lives in the Dashboard and emails the
 * account when a threshold is approached/crossed; this surfaces where we are
 * currently registered so the admin can see coverage at a glance.
 */
export async function getTaxRegistrations(): Promise<TaxRegistrationRow[]> {
  const list = await stripe.tax.registrations.list({ limit: 100 });
  return list.data.map((r) => {
    const us = (r.country_options as { us?: { state?: string } } | undefined)?.us;
    return {
      id: r.id,
      country: r.country,
      state: us?.state ?? null,
      status: r.status,
      activeFrom: r.active_from ? new Date(r.active_from * 1000) : null,
    };
  });
}
