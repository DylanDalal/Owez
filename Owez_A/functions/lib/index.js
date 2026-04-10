"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseReceipt = void 0;
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
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const mindee_1 = require("./mindee");
const shared_1 = require("@owez/shared");
exports.parseReceipt = (0, https_1.onCall)({ memory: '512MiB', cors: true, maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to parse receipts');
    }
    const fileBase64 = request.data?.fileBase64;
    const contentType = request.data?.contentType;
    const fileName = request.data?.fileName;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'fileBase64 is required');
    }
    const apiKey = process.env.MINDEE_API_KEY;
    const modelId = process.env.MINDEE_MODEL_ID;
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'MINDEE_API_KEY is not configured on the function');
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    try {
        const raw = await (0, mindee_1.parseReceiptWithMindee)({
            apiKey,
            modelId,
            fileBytes: buffer,
            fileName,
            contentType,
        });
        const normalized = (0, shared_1.normalizeMindeeReceipt)(raw);
        return { raw, normalized };
    }
    catch (err) {
        v2_1.logger.error('parseReceipt failed', err);
        throw new https_1.HttpsError('internal', err?.message ?? 'Failed to parse receipt');
    }
});
//# sourceMappingURL=index.js.map