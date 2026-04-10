/**
 * Visual-only "receipt" card used in the landing hero. Pure CSS — no data.
 * We rebuild the look of an actual claim receipt so the landing page reflects
 * the real product rather than a stock illustration.
 */
export function LandingReceiptMock() {
  const items: Array<{ name: string; price: string; stamps: string[] }> = [
    { name: "Fried Chicken Sandwich", price: "$24.00", stamps: ["SC", "MR"] },
    { name: "Mac & Cheese", price: "$12.00", stamps: ["GR"] },
    { name: "Country Catfish Strips", price: "$22.00", stamps: ["AC", "JH"] },
    { name: "Collard Greens", price: "$10.00", stamps: [] },
    { name: "Chicken & Waffles", price: "$18.00", stamps: ["AK"] },
  ];

  return (
    <div className="mx-auto max-w-sm">
      <div className="torn-top rounded-t-md" />
      <div className="card rounded-none border-t-0 border-b-0 px-6 py-4 font-mono">
        <div className="text-center">
          <div className="font-display text-lg font-bold tracking-widest">
            MELBA&apos;S
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            Harlem · 8:14 PM
          </div>
        </div>
        <div className="receipt-divider my-3" />
        <ul className="space-y-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span>{item.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums">{item.price}</span>
                {item.stamps.map((s) => (
                  <span
                    key={s}
                    className="inline-flex h-6 w-6 -rotate-6 items-center justify-center rounded-full border-2 border-[color:var(--color-accent-ink)] bg-[color:var(--color-accent)] text-[10px] font-bold text-[color:var(--color-accent-ink)]"
                  >
                    {s}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="receipt-divider my-3" />
        <div className="flex justify-between text-sm">
          <span className="text-[color:var(--muted)]">Subtotal</span>
          <span className="tabular-nums">$86.00</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[color:var(--muted)]">Tax</span>
          <span className="tabular-nums">$7.63</span>
        </div>
        <div className="mt-1 flex justify-between text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">$93.63</span>
        </div>
      </div>
      <div className="torn-bottom rounded-b-md" />
    </div>
  );
}
