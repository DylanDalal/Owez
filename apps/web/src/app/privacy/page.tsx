import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Privacy · Owez" };

export default function PrivacyPage() {
  return (
    <main>
      <Header />
      <article className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold">Privacy</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Last updated: April 9, 2026
        </p>

        <h2 className="mt-8 font-display text-xl font-bold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Account info</strong>: the name, email, and profile photo
            that Google or Apple hand us when you sign in. You can upload a
            different photo if you want; it lives inline on your profile
            document in Firestore.
          </li>
          <li>
            <strong>Receipts</strong>: the parsed line items from any receipt
            you upload. We do <em>not</em> store the original receipt image.
          </li>
          <li>
            <strong>Payment handles</strong>: your Venmo, Cash App, and
            (optionally) phone number for Zelle. These are shown to friends on
            your receipts so they can pay you.
          </li>
          <li>
            <strong>Claims</strong>: when a guest picks items on your
            receipt, we store the name they typed and which items they
            claimed.
          </li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-bold">
          What we don't do
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            We will <strong>never</strong> contact you by phone. Phone numbers
            are only stored so friends can Zelle you; we do not call or text.
          </li>
          <li>We do not sell your data.</li>
          <li>We do not run third-party ads or analytics trackers.</li>
          <li>
            Owez does not see or store payment information. All money
            movement happens on Venmo, Cash App, or Zelle under their own
            privacy policies.
          </li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-bold">
          Third parties we use
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Firebase</strong> (Google): authentication and database.
          </li>
          <li>
            <strong>OpenAI</strong>: reads the receipt you upload and returns
            structured line items. We send them the photo of the receipt;
            per their API data policy, inputs aren't used to train their
            models and are retained only briefly for abuse monitoring.
          </li>
        </ul>

        <h2 className="mt-8 font-display text-xl font-bold">
          Deleting your data
        </h2>
        <p>
          Email <a href="mailto:hi@owez.me">hi@owez.me</a> and we'll delete
          your account, profile, receipts, and claims on request.
        </p>
      </article>
      <Footer />
    </main>
  );
}
