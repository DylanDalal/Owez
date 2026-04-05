// Shared types for Owez. Will move to packages/shared/ in Phase 2 when the
// Expo app starts importing them too. For now they live next to the function
// that produces them.

export type Currency = 'USD'

export interface PaymentMethods {
  venmo?: string // username, no @
  cashapp?: string // cashtag, no $
  zelle?: string // phone or email
}

export interface OwnerPublic {
  displayName: string
  paymentMethods: PaymentMethods
}

export type BillStatus = 'parsing' | 'ready' | 'error'

export interface Bill {
  ownerId: string
  ownerPublic: OwnerPublic
  imageStoragePath: string
  imageUrl: string
  status: BillStatus
  subtotal: number
  tax: number
  tip: number
  total: number
  currency: Currency
  createdAt: FirebaseFirestore.Timestamp | Date
  expiresAt: FirebaseFirestore.Timestamp | Date
  parsedAt?: FirebaseFirestore.Timestamp | Date
  errorMessage?: string
}

export interface LineItem {
  name: string
  price: number
  qty: number
  position: number
}

export interface Claim {
  lineItemId: string
  claimerName: string
  claimerUid: string
  share: number // 1.0 = full, 0.5 = split with one other person, etc.
  createdAt: FirebaseFirestore.Timestamp | Date
}

// Callable function request/response shapes
export interface ParseBillRequest {
  slug: string
}

export interface ParseBillResponse {
  itemCount: number
  subtotal: number
  total: number
  status: BillStatus
}
