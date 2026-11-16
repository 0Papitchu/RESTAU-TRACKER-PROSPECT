import { getApps, initializeApp } from "firebase/app";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { firebaseAuth } from "./googleAuth";
import {
  PipelineStatus,
  ProspectKit,
  SavedProspectEntry,
  WebsiteStatus,
} from "../types/prospect";

const app =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return (cleaned || "id").slice(0, 128);
}

export function getProspectDocId(uid: string, placeId: string): string {
  const safeUid = sanitizeId(uid).slice(0, 48);
  const safePlace = sanitizeId(placeId).slice(0, 78);
  return `${safeUid}_${safePlace}`.slice(0, 128);
}

function trunc(val: string | null | undefined, maxLen: number): string {
  if (!val) return "";
  return val.slice(0, maxLen);
}

function sanitizeKit(kit: ProspectKit): ProspectKit {
  return {
    opportunityDiagnosis: trunc(kit.opportunityDiagnosis, 2000),
    recommendedSolutionTitle: trunc(kit.recommendedSolutionTitle, 200),
    recommendedFeatures: (kit.recommendedFeatures ?? [])
      .slice(0, 8)
      .map((f) => trunc(String(f), 300)),
    estimatedImpact: trunc(kit.estimatedImpact, 1500),
    bestContactWindow: trunc(kit.bestContactWindow, 500),
    emailSubject: trunc(kit.emailSubject, 300),
    emailBody: trunc(kit.emailBody, 5000),
    whatsappMessage: trunc(kit.whatsappMessage, 1500),
    callScript: trunc(kit.callScript, 3000),
    objections: (kit.objections ?? []).slice(0, 6).map((obj) => ({
      objection: trunc(obj.objection, 400),
      response: trunc(obj.response, 1000),
    })),
  };
}

function formatFirestoreDate(value: unknown, fallbackIso?: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && value) {
    return value;
  }
  return fallbackIso || new Date().toISOString();
}

export function subscribeToUserProspects(
  uid: string,
  onData: (entries: Record<string, SavedProspectEntry>) => void,
  onError?: (err: Error) => void
): () => void {
  const path = "prospects";
  const q = query(collection(db, path), where("ownerId", "==", uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const next: Record<string, SavedProspectEntry> = {};
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const placeId = String(d.placeId || "");
        if (!placeId) return;
        next[placeId] = {
          placeId,
          displayName: String(d.displayName || ""),
          formattedAddress: String(d.formattedAddress || ""),
          primaryTypeDisplayName: d.primaryTypeDisplayName
            ? String(d.primaryTypeDisplayName)
            : null,
          rating: typeof d.rating === "number" ? d.rating : null,
          userRatingCount:
            typeof d.userRatingCount === "number" ? d.userRatingCount : 0,
          websiteStatus: (d.websiteStatus || "none") as WebsiteStatus,
          nationalPhoneNumber: d.nationalPhoneNumber
            ? String(d.nationalPhoneNumber)
            : null,
          googleMapsURI: d.googleMapsURI ? String(d.googleMapsURI) : null,
          recipientEmail: d.recipientEmail ? String(d.recipientEmail) : undefined,
          status: (d.status || "a_contacter") as PipelineStatus,
          notes: String(d.notes || ""),
          savedAt: formatFirestoreDate(d.createdAt),
          updatedAt: formatFirestoreDate(d.updatedAt),
          lastGmailSentAt: d.lastGmailSentAt
            ? String(d.lastGmailSentAt)
            : undefined,
          lastGmailThreadId: d.lastGmailThreadId
            ? String(d.lastGmailThreadId)
            : undefined,
          lastTaskCreatedAt: d.lastTaskCreatedAt
            ? String(d.lastTaskCreatedAt)
            : undefined,
          lastTaskTitle: d.lastTaskTitle ? String(d.lastTaskTitle) : undefined,
          kit: d.kit ? (d.kit as ProspectKit) : undefined,
        };
      });
      onData(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createProspectInFirestore(
  uid: string,
  entry: SavedProspectEntry
): Promise<void> {
  const docId = getProspectDocId(uid, entry.placeId);
  const docPath = `prospects/${docId}`;
  const docRef = doc(db, "prospects", docId);

  const payload: Record<string, unknown> = {
    ownerId: sanitizeId(uid),
    placeId: sanitizeId(entry.placeId),
    displayName: trunc(entry.displayName, 200) || "Restaurant",
    formattedAddress: trunc(entry.formattedAddress, 400),
    userRatingCount: Math.max(
      0,
      Math.min(1000000, Math.round(entry.userRatingCount || 0))
    ),
    websiteStatus: entry.websiteStatus,
    status: entry.status,
    notes: trunc(entry.notes, 4000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (entry.primaryTypeDisplayName) {
    payload.primaryTypeDisplayName = trunc(entry.primaryTypeDisplayName, 120);
  }
  if (typeof entry.rating === "number" && entry.rating >= 0 && entry.rating <= 5) {
    payload.rating = entry.rating;
  }
  if (entry.nationalPhoneNumber) {
    payload.nationalPhoneNumber = trunc(entry.nationalPhoneNumber, 40);
  }
  if (entry.googleMapsURI) {
    payload.googleMapsURI = trunc(entry.googleMapsURI, 500);
  }
  if (entry.recipientEmail) {
    payload.recipientEmail = trunc(entry.recipientEmail, 200);
  }
  if (entry.lastGmailSentAt) {
    payload.lastGmailSentAt = trunc(entry.lastGmailSentAt, 64);
  }
  if (entry.lastGmailThreadId) {
    payload.lastGmailThreadId = trunc(entry.lastGmailThreadId, 128);
  }
  if (entry.lastTaskCreatedAt) {
    payload.lastTaskCreatedAt = trunc(entry.lastTaskCreatedAt, 64);
  }
  if (entry.lastTaskTitle) {
    payload.lastTaskTitle = trunc(entry.lastTaskTitle, 200);
  }
  if (entry.kit) {
    payload.kit = sanitizeKit(entry.kit);
  }

  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateProspectDetailsInFirestore(
  uid: string,
  placeId: string,
  updates: {
    status?: PipelineStatus;
    notes?: string;
    recipientEmail?: string;
  }
): Promise<void> {
  const docId = getProspectDocId(uid, placeId);
  const docPath = `prospects/${docId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = trunc(updates.notes, 4000);
  if (updates.recipientEmail !== undefined) {
    payload.recipientEmail = trunc(updates.recipientEmail, 200);
  }

  try {
    await updateDoc(doc(db, "prospects", docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function updateProspectKitInFirestore(
  uid: string,
  placeId: string,
  kit: ProspectKit
): Promise<void> {
  const docId = getProspectDocId(uid, placeId);
  const docPath = `prospects/${docId}`;

  try {
    await updateDoc(doc(db, "prospects", docId), {
      kit: sanitizeKit(kit),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function recordProspectGmailSentInFirestore(
  uid: string,
  placeId: string,
  params: {
    recipientEmail: string;
    threadId?: string;
    sentAt: string;
  }
): Promise<void> {
  const docId = getProspectDocId(uid, placeId);
  const docPath = `prospects/${docId}`;
  const payload: Record<string, unknown> = {
    status: "contacte" as PipelineStatus,
    recipientEmail: trunc(params.recipientEmail, 200),
    lastGmailSentAt: trunc(params.sentAt, 64),
    updatedAt: serverTimestamp(),
  };
  if (params.threadId) {
    payload.lastGmailThreadId = trunc(params.threadId, 128);
  }

  try {
    await updateDoc(doc(db, "prospects", docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function recordProspectTaskCreatedInFirestore(
  uid: string,
  placeId: string,
  params: {
    taskTitle: string;
    createdAt: string;
  }
): Promise<void> {
  const docId = getProspectDocId(uid, placeId);
  const docPath = `prospects/${docId}`;

  try {
    await updateDoc(doc(db, "prospects", docId), {
      lastTaskCreatedAt: trunc(params.createdAt, 64),
      lastTaskTitle: trunc(params.taskTitle, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteProspectInFirestore(
  uid: string,
  placeId: string
): Promise<void> {
  const docId = getProspectDocId(uid, placeId);
  const docPath = `prospects/${docId}`;

  try {
    await deleteDoc(doc(db, "prospects", docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
