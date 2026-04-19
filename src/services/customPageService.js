import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { ensureFirebaseReady } from './firebase'

const COLLECTION = 'custom_pages'

export async function getCustomPages() {
  const firestore = ensureFirebaseReady()

  const snapshot = await getDocs(collection(firestore, COLLECTION))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function createCustomPage(payload) {
  const firestore = ensureFirebaseReady()

  const ref = await addDoc(collection(firestore, COLLECTION), {
    ...payload,
    createdAt: new Date().toISOString(),
  })

  return { id: ref.id, ...payload }
}

export async function updateCustomPage(id, payload) {
  const firestore = ensureFirebaseReady()

  await updateDoc(doc(firestore, COLLECTION, id), payload)
}

export async function deleteCustomPage(id) {
  const firestore = ensureFirebaseReady()

  await deleteDoc(doc(firestore, COLLECTION, id))
}
