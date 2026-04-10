import type { PaymentMethods } from "./types.js";

/**
 * Builders for pay-me deep links. All of these are URLs — on iOS the venmo://
 * and cashapp web URLs will jump into the respective apps if installed and
 * fall back gracefully otherwise.
 */

/** Convert integer cents to a dollar string like "12.34" (no currency symbol). */
export function centsToDollarString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Venmo deep link. The venmo:// scheme opens the app directly; if you want a
 * universal link that works on desktop too, use venmoWebLink().
 */
export function venmoDeepLink(opts: {
  username: string;
  amountCents: number;
  note: string;
}): string {
  const params = new URLSearchParams({
    txn: "pay",
    recipients: opts.username,
    amount: centsToDollarString(opts.amountCents),
    note: opts.note,
  });
  return `venmo://paycharge?${params.toString()}`;
}

export function venmoWebLink(opts: {
  username: string;
  amountCents: number;
  note: string;
}): string {
  const params = new URLSearchParams({
    txn: "pay",
    audience: "private",
    amount: centsToDollarString(opts.amountCents),
    note: opts.note,
  });
  return `https://venmo.com/${encodeURIComponent(opts.username)}?${params.toString()}`;
}

/** Cash App universal link — opens the app on mobile, the web page on desktop. */
export function cashAppLink(opts: {
  cashtag: string;
  amountCents: number;
}): string {
  const tag = opts.cashtag.startsWith("$") ? opts.cashtag.slice(1) : opts.cashtag;
  return `https://cash.app/$${encodeURIComponent(tag)}/${centsToDollarString(opts.amountCents)}`;
}

/**
 * Zelle has no deep link spec — the pragmatic fallback is sms: pre-filled with
 * "Sending you $X via Zelle at <phone>". Most users' banks let them Zelle by
 * phone number, so this at least tells them the number and amount.
 */
export function zelleSmsFallback(opts: {
  phone: string;
  amountCents: number;
  creatorName?: string;
}): string {
  const body = `Sending $${centsToDollarString(opts.amountCents)} via Zelle${
    opts.creatorName ? ` to ${opts.creatorName}` : ""
  } at ${opts.phone}`;
  return `sms:${opts.phone}?body=${encodeURIComponent(body)}`;
}

/** Convenience: build all available pay links for a given owed amount. */
export function buildPayLinks(opts: {
  methods: PaymentMethods;
  amountCents: number;
  note: string;
  creatorName?: string;
}): Array<{ kind: "venmo" | "cashapp" | "zelle"; label: string; url: string }> {
  const out: Array<{ kind: "venmo" | "cashapp" | "zelle"; label: string; url: string }> = [];
  if (opts.methods.venmo) {
    out.push({
      kind: "venmo",
      label: "Pay with Venmo",
      url: venmoWebLink({
        username: opts.methods.venmo,
        amountCents: opts.amountCents,
        note: opts.note,
      }),
    });
  }
  if (opts.methods.cashapp) {
    out.push({
      kind: "cashapp",
      label: "Pay with Cash App",
      url: cashAppLink({
        cashtag: opts.methods.cashapp,
        amountCents: opts.amountCents,
      }),
    });
  }
  if (opts.methods.zellePhone) {
    out.push({
      kind: "zelle",
      label: "Pay with Zelle",
      url: zelleSmsFallback({
        phone: opts.methods.zellePhone,
        amountCents: opts.amountCents,
        creatorName: opts.creatorName,
      }),
    });
  }
  return out;
}
