/**
 * Phase 0 — Mindee receipt parsing validation (v2 API)
 *
 * Run a real receipt through a Mindee Extraction model and inspect the output.
 * The goal is to validate OCR quality before building the rest of the app.
 *
 * Usage:
 *   npm run parse -- ./path/to/receipt.jpg
 *
 * Requires in .env:
 *   MINDEE_API_KEY  — your v2 API key
 *   MINDEE_MODEL_ID — copy from your Mindee dashboard's Document Catalog
 *                    (use the Receipt or Financial Document model)
 *
 * Try it on 5–10 different receipts (chain restaurant, mom-and-pop, faded,
 * crumpled, handwritten total, etc.) and see how it does on line items.
 */

import 'dotenv/config'
import { v2, PathInput } from 'mindee'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const apiKey = process.env.MINDEE_API_KEY
if (!apiKey) {
  console.error('MINDEE_API_KEY not set. Copy .env.example to .env and add your key.')
  process.exit(1)
}

const modelId = process.env.MINDEE_MODEL_ID
if (!modelId) {
  console.error(
    'MINDEE_MODEL_ID not set. Find it in your Mindee dashboard → Document Catalog → Receipt model → Model ID.',
  )
  process.exit(1)
}

const imagePath = process.argv[2]
if (!imagePath) {
  console.error('Usage: npm run parse -- ./path/to/receipt.jpg')
  process.exit(1)
}

const absolutePath = resolve(imagePath)
if (!existsSync(absolutePath)) {
  console.error(`File not found: ${absolutePath}`)
  process.exit(1)
}

const client = new v2.Client({ apiKey })
const inputSource = new PathInput({ inputPath: absolutePath })

console.log(`Parsing ${absolutePath}\n  with model ${modelId}...\n`)
const start = Date.now()

const response = await client.enqueueAndGetResult(
  v2.product.Extraction,
  inputSource,
  { modelId },
)

const elapsed = ((Date.now() - start) / 1000).toFixed(2)

const inference = response.inference
if (!inference) {
  console.error('No inference returned from Mindee.')
  process.exit(1)
}

// Mindee's built-in pretty-printer dumps every parsed field. This is the
// primary thing to look at — see what fields the receipt model extracted
// and how accurate the values are.
console.log(inference.toString())
console.log(`\nParsed in ${elapsed}s`)

// Generic sanity check: does the sum of line items match the receipt subtotal?
// v2 fields are generic (no typed accessors), so we look up by common field
// names. If your model uses different names, the toString() output above will
// show them and we can adjust here.
const fields: any = (inference as any).result?.fields
if (!fields) {
  console.log('\nCould not access fields map for sanity check.')
  process.exit(0)
}

const tryNumber = (...names: string[]): number | null => {
  for (const name of names) {
    try {
      const f = fields.getSimpleField?.(name)
      const v = f?.numberValue ?? f?.value
      if (typeof v === 'number') return v
    } catch {
      // field doesn't exist on this model, try the next name
    }
  }
  return null
}

const tryListField = (...names: string[]): any | null => {
  for (const name of names) {
    try {
      const f = fields.getListField?.(name)
      if (f) return f
    } catch {
      // try the next name
    }
  }
  return null
}

const subtotal = tryNumber('total_net', 'subtotal', 'sub_total')
const tax = tryNumber('total_tax', 'tax', 'taxes')
const tip = tryNumber('tip', 'gratuity')
const total = tryNumber('total_amount', 'total', 'total_gross')

console.log('\n--- Sanity check (for bill splitting) ---')
console.log(`Reported subtotal: ${formatMoney(subtotal)}`)
console.log(`Reported tax:      ${formatMoney(tax)}`)
console.log(`Reported tip:      ${formatMoney(tip)}`)
console.log(`Reported total:    ${formatMoney(total)}`)

const lineItemsField = tryListField('line_items', 'items', 'lineItems')
if (!lineItemsField) {
  console.log(
    '\nLine items field not found by common names. Check the toString output above for the actual field name and update tryListField() in parse.ts.',
  )
  process.exit(0)
}

const items = lineItemsField.objectItems ?? lineItemsField.simpleItems ?? []
console.log(`\nLine items parsed: ${items.length}`)

let sumOfItems = 0
for (const item of items) {
  const subFields = item.simpleFields ?? item.fields ?? null
  const itemTotal =
    subFields?.get?.('total_amount')?.numberValue ??
    subFields?.get?.('total')?.numberValue ??
    subFields?.get?.('amount')?.numberValue ??
    0
  if (typeof itemTotal === 'number') sumOfItems += itemTotal
}

console.log(`Line items sum:    ${formatMoney(sumOfItems)}`)

if (subtotal != null) {
  const diff = Math.abs(sumOfItems - subtotal)
  console.log(
    `Items vs subtotal diff: ${formatMoney(diff)} ${
      diff > 0.5
        ? '[MISMATCH — owner will need to fix items before splitting]'
        : '[OK]'
    }`,
  )
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '(field not found)'
  return `$${n.toFixed(2)}`
}
