import type { Metadata } from "next";
import type { ReactNode } from "react";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";

async function fetchBill(billId: string) {
  if (!PROJECT_ID) return null;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/bills/${billId}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const doc = await res.json();
    const fields = doc.fields ?? {};
    return {
      title: fields.title?.stringValue as string | undefined,
      creatorName: fields.creatorName?.stringValue as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ billId: string }>;
}): Promise<Metadata> {
  const { billId } = await params;
  const bill = await fetchBill(billId);

  if (!bill) {
    return { title: "Owez" };
  }

  const firstName = bill.creatorName?.split(/\s+/)[0];
  const receiptName = bill.title || "a Receipt";
  const title = firstName
    ? `Pay ${firstName} back for ${receiptName}`
    : `Pay back for ${receiptName}`;

  return {
    title,
    openGraph: {
      title,
      description: "Tap your items and pay your share. No sign up needed.",
    },
  };
}

export default function BillLayout({ children }: { children: ReactNode }) {
  return children;
}
