/**
 * parseBill — callable Cloud Function
 *
 * Triggered by the app after it has:
 *   1. Created a bills/{slug} doc with status: 'parsing' and ownerId: <caller>
 *   2. Uploaded the receipt image to Storage at imageStoragePath
 *
 * This function:
 *   - Verifies the caller owns the bill
 *   - Downloads the image from Storage
 *   - Calls Mindee v2 API directly (bypasses the SDK which breaks on Node 24)
 *   - Writes line items + totals back to Firestore in a single batch
 *   - Sets status: 'ready' (or 'error')
 *
 * Mindee credentials — for local emulator, add to functions/.secret.local:
 *   MINDEE_API_KEY=...
 *   MINDEE_MODEL_ID=...
 * For deployment: firebase functions:secrets:set MINDEE_API_KEY
 *                 firebase functions:secrets:set MINDEE_MODEL_ID
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import https from 'node:https'
import FormData from 'form-data'
import type { ParseBillRequest, ParseBillResponse, BillStatus } from './types'

const MINDEE_API_KEY = defineSecret('MINDEE_API_KEY')
const MINDEE_MODEL_ID = defineSecret('MINDEE_MODEL_ID')
const MINDEE_HOST = 'api-v2.mindee.net'

export const parseBill = onCall<ParseBillRequest, Promise<ParseBillResponse>>(
  {
    secrets: [MINDEE_API_KEY, MINDEE_MODEL_ID],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'sign in required')
    const { slug } = request.data
    if (!slug || typeof slug !== 'string') throw new HttpsError('invalid-argument', 'slug required')

    const db = getFirestore()
    const billRef = db.doc(`bills/${slug}`)
    const billSnap = await billRef.get()
    if (!billSnap.exists) throw new HttpsError('not-found', `bill ${slug} not found`)
    const bill = billSnap.data()!
    if (bill.ownerId !== request.auth.uid) throw new HttpsError('permission-denied', 'not your bill')
    if (bill.status === 'ready') {
      logger.info(`bill ${slug} already parsed, skipping`)
      return { itemCount: 0, subtotal: bill.subtotal ?? 0, total: bill.total ?? 0, status: 'ready' as BillStatus }
    }

    // ── Download image from Storage
    let imageBuffer: Buffer
    try {
      const [buf] = await getStorage().bucket().file(bill.imageStoragePath).download()
      imageBuffer = buf
    } catch (err) {
      logger.error(`failed to download ${bill.imageStoragePath}`, err)
      await billRef.update({ status: 'error', errorMessage: 'image download failed' })
      throw new HttpsError('internal', 'image download failed')
    }

    // ── Call Mindee v2 REST API directly
    // The Mindee Node SDK breaks on Node 24 (undici ReadableStream bug when
    // uploading files via fetch). We call the API with Node's https module +
    // the form-data package instead, which bypasses undici entirely.
    let rawFields: Record<string, any>
    try {
      rawFields = await callMindeeV2(
        MINDEE_API_KEY.value(),
        MINDEE_MODEL_ID.value(),
        imageBuffer,
      )
    } catch (err) {
      logger.error('mindee parse failed', err)
      await billRef.update({ status: 'error', errorMessage: `mindee: ${(err as Error).message}` })
      throw new HttpsError('internal', 'mindee parse failed')
    }

    // ── Extract values from raw fields JSON
    // Each field is { "value": <number|string|null>, "confidence": <number>, ... }
    // List fields are { "items": [ { "fields": { ... } } | { "value": ... }, ... ] }
    const subtotal = rawNum(rawFields, 'total_net', 'subtotal', 'sub_total') ?? 0
    const tax      = rawNum(rawFields, 'total_tax', 'tax', 'taxes') ?? 0
    const tip      = rawNum(rawFields, 'tip', 'gratuity') ?? 0
    const total    = rawNum(rawFields, 'total_amount', 'total', 'total_gross') ?? 0
    const currency = rawFields?.locale?.value?.currency
      ?? rawStr(rawFields, 'currency', 'locale')
      ?? 'USD'

    const rawItems: any[] = rawList(rawFields, 'line_items', 'items', 'lineItems') ?? []

    // ── Batch write — items + updated bill totals in one atomic operation
    const batch = db.batch()
    rawItems.forEach((item, i) => {
      // List items can be { fields: { ... } } (object items) or { value: ... } (simple)
      const f = item?.fields ?? null
      const name  = (f ? rawStrF(f, 'description', 'name', 'item') : null) ?? `Item ${i + 1}`
      const price = (f ? rawNumF(f, 'total_amount', 'total', 'amount') : item?.value) ?? 0
      const qty   = (f ? rawNumF(f, 'quantity', 'qty') : null) ?? 1

      batch.set(billRef.collection('items').doc(), { name, price, qty, position: i })
    })

    batch.update(billRef, {
      subtotal, tax, tip, total, currency,
      status: 'ready' as BillStatus,
      parsedAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()
    logger.info(`parsed bill ${slug}: ${rawItems.length} items, total $${total}`)
    return { itemCount: rawItems.length, subtotal, total, status: 'ready' as BillStatus }
  },
)

// ── Mindee v2 direct API ─────────────────────────────────────────────────────

async function callMindeeV2(
  apiKey: string,
  modelId: string,
  imageBuffer: Buffer,
): Promise<Record<string, any>> {
  const jobId = await mindeeEnqueue(apiKey, modelId, imageBuffer)
  const resultUrl = await mindeePoll(apiKey, jobId)
  return await mindeeGetResult(apiKey, resultUrl)
}

async function mindeeEnqueue(apiKey: string, modelId: string, imageBuffer: Buffer): Promise<string> {
  const form = new FormData()
  form.append('file', imageBuffer, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
  form.append('model_id', modelId)

  const body = form.getBuffer()
  const data = await httpsJson({
    hostname: MINDEE_HOST,
    path: '/v2/products/extraction/enqueue',
    method: 'POST',
    headers: { ...form.getHeaders(), Authorization: apiKey, 'Content-Length': body.length },
  }, body)

  if (data?.error) throw new Error(`enqueue error: ${JSON.stringify(data.error)}`)
  const jobId: string | undefined = data?.job?.id
  if (!jobId) throw new Error(`no job id in response: ${JSON.stringify(data)}`)
  return jobId
}

async function mindeePoll(apiKey: string, jobId: string): Promise<string> {
  const maxAttempts = 30
  const pollDelaySec = 2

  await delay(3000) // initial delay before first poll

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const data = await httpsJson({
      hostname: MINDEE_HOST,
      path: `/v2/jobs/${jobId}`,
      method: 'GET',
      headers: { Authorization: apiKey },
    })

    const status: string = data?.job?.status
    if (status === 'Processed') {
      const resultUrl: string | undefined = data?.job?.result_url
      if (!resultUrl) throw new Error('job processed but result_url missing')
      return resultUrl
    }
    if (status === 'Failed') {
      throw new Error(`job failed: ${JSON.stringify(data?.job?.error ?? 'unknown')}`)
    }

    logger.debug(`mindee job ${jobId} status=${status}, attempt ${attempt}/${maxAttempts}`)
    await delay(pollDelaySec * 1000)
  }
  throw new Error(`mindee polling timed out after ${maxAttempts} attempts`)
}

async function mindeeGetResult(apiKey: string, resultUrl: string): Promise<Record<string, any>> {
  const url = new URL(resultUrl)
  const data = await httpsJson({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { Authorization: apiKey },
  })

  const fields = data?.inference?.result?.fields
  if (!fields) throw new Error(`no fields in result: ${JSON.stringify(data)}`)
  return fields
}

function httpsJson(options: https.RequestOptions, body?: Buffer): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Raw field accessors ───────────────────────────────────────────────────────
// Mindee v2 raw JSON: each field is { value, confidence, ... }
// List field: { items: [ { fields: { ... } } | { value: ... }, ... ] }

function rawNum(fields: any, ...names: string[]): number | null {
  for (const n of names) {
    const v = fields?.[n]?.value
    if (typeof v === 'number') return v
  }
  return null
}

function rawStr(fields: any, ...names: string[]): string | null {
  for (const n of names) {
    const v = fields?.[n]?.value
    if (typeof v === 'string') return v
  }
  return null
}

function rawList(fields: any, ...names: string[]): any[] | null {
  for (const n of names) {
    const items = fields?.[n]?.items
    if (Array.isArray(items)) return items
  }
  return null
}

// Same accessors for sub-fields inside a list item's `fields` map
function rawNumF(subFields: any, ...names: string[]): number | null {
  for (const n of names) {
    const v = subFields?.[n]?.value
    if (typeof v === 'number') return v
  }
  return null
}

function rawStrF(subFields: any, ...names: string[]): string | null {
  for (const n of names) {
    const v = subFields?.[n]?.value
    if (typeof v === 'string') return v
  }
  return null
}
