import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Terms · Owez" };

export default function TermsPage() {
  return (
    <main>
      <Header />
      <article className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold">Terms of Service</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Last updated: April 9, 2026
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">What Owez does</h2>
        <p>
          Owez is a tool that reads a photo of a restaurant or store receipt,
          lists the items on it, and lets your friends each pick the items
          they bought so you can collect money from them. We generate a link;
          they open the link, claim items, and see their personal total with
          links to Venmo, Cash App, and Zelle.
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">
          Receipt parsing is not guaranteed
        </h2>
        <p>
          Owez uses a third-party receipt-parsing service (Mindee) to read
          your receipts. It is very good, but it is not perfect. You should
          always review the parsed line items, prices, tax, and tip before
          sharing a receipt.{" "}
          <strong>
            We are not responsible for incorrect parsing, missed items,
            mis-priced items, or incorrect totals.
          </strong>{" "}
          You are the person who reviews and shares the receipt; the split is
          what you sent.
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">Payments</h2>
        <p>
          Owez does not process payments. We surface deep-links to Venmo,
          Cash App, and Zelle using handles you provide on your profile. All
          money movement happens on those services under their own terms.
          Owez never holds, routes, or sees any funds.
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">Acceptable use</h2>
        <p>
          Don't use Owez to defraud your friends, spam people, upload content
          you don't have the right to upload, or attempt to misuse the
          service. We can suspend accounts that do.
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">No warranty</h2>
        <p>
          Owez is provided "as is" without warranty of any kind. You use Owez
          at your own risk, and in particular you take responsibility for any
          total you ask your friends to pay based on an Owez receipt.
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">Contact</h2>
        <p>
          Questions? <a href="mailto:hi@owez.me">hi@owez.me</a>.
        </p>
      </article>
      <Footer />
    </main>
  );
}
