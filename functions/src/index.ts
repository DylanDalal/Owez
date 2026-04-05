// Functions entrypoint. Firebase deploys whatever this file exports.

import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { parseBill } from './parseBill'
