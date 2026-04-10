/**
 * Visual "receipt" mock used in the hero. Pure CSS — no data. We rebuild the
 * look of an actual receipt card so the landing page reflects the real
 * product rather than a stock illustration.
 */
export function LandingReceiptMock() {
  return (
    <div className="max-w-sm mx-auto">
      <div className="torn-top rounded-t-md" />
      <div className="card rounded-none border-t-0 border-b-0 px-6 py-4 font-mono">
        <div className="text-center">
          <div className="font-display font-bold text-lg tracking-widest">LUCALI</div>
          <div className="text-xs text-[color:var(--muted)]">Carroll Gardens • 8:14 PM</div>
        </div>
        <div className="receipt-divider my-3" />
        <ul className="space-y-1.5 text-sm">
          {[
            ['Margherita', '$24.00', 'JC'],
            ['Cal. Artichoke', '$22.00', null],
            ['Cal. Shrimp', '$22.00', 'AM'],
            ['Caesar Salad', '$14.00', null],
            ['Wine (bottle)', '$58.00', null],
          ].map(([name, price, who], i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span>{name}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{price}</span>
                {who && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent border-2 border-accent-ink text-[10px] font-bold text-accent-ink transform -rotate-6">
                    {who}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="receipt-divider my-3" />
        <div className="flex justify-between text-sm">
          <span className="text-[color:var(--muted)]">Subtotal</span>
          <span className="tabular-nums">$140.00</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[color:var(--muted)]">Tax</span>
          <span className="tabular-nums">$12.43</span>
        </div>
        <div className="flex justify-between text-base font-bold mt-1">
          <span>Total</span>
          <span className="tabular-nums">$152.43</span>
        </div>
      </div>
      <div className="torn-bottom rounded-b-md" />
    </div>
  );
}
