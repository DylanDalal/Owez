/**
 * Firebase Cloud Functions entry point.
 *
 * NOTE on the Spark plan: `onCall`/`onRequest` v2 functions DO deploy on
 * Spark but cannot make outbound HTTPS requests to external services. This
 * means the MVP calls Mindee from inside the emulator for local dev, and
 * from a Next.js /api route in production. This file is wired up so that if
 * the user upgrades to Blaze later, they can flip over to the Cloud Function
 * without touching the client code.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { parseReceiptWithMindee } from './mindee';
import { normalizeMindeeReceipt } from '@owez/shared';

export const parseReceipt = onCall(
  { memory: '512MiB', cors: true, maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to parse receipts');
    }

    const fileBase64: string | undefined = request.data?.fileBase64;
    const contentType: string | undefined = request.data?.contentType;
    const fileName: string | undefined = request.data?.fileName;

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'fileBase64 is required');
    }

    const apiKey = process.env.MINDEE_API_KEY;
    const modelId = process.env.MINDEE_MODEL_ID;
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'MINDEE_API_KEY is not configured on the function',
      );
    }

    const buffer = Buffer.from(fileBase64, 'base64');

    try {
      const raw = await parseReceiptWithMindee({
        apiKey,
        modelId,
        fileBytes: buffer,
        fileName,
        contentType,
      });
      const normalized = normalizeMindeeReceipt(raw);
      return { raw, normalized };
    } catch (err: any) {
      logger.error('parseReceipt failed', err);
      throw new HttpsError(
        'internal',
        err?.message ?? 'Failed to parse receipt',
      );
    }
  },
);
