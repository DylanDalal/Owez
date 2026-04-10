import type { PaymentHandles } from './receipt';

/**
 * User profile stored in Firestore. Populated from Google/Apple on first sign
 * in; later extended with payment handles & a custom profile picture upload.
 */
export interface UserProfile extends PaymentHandles {
  displayName: string;
  email: string;
  /** URL — either Google/Apple default or uploaded override */
  photoURL: string;
  createdAt: number;
  updatedAt?: number;
}
