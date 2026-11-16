export class GmailAuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthExpiredError";
  }
}

export interface SendGmailEmailParams {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  fromEmail?: string | null;
}

export interface GmailSendResult {
  id: string;
  threadId?: string;
}

export interface GmailDraftResult {
  id: string;
  messageId?: string;
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function utf8ToBase64Url(value: string): string {
  return utf8ToBase64(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function wrapBase64Lines(b64: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += lineLength) {
    lines.push(b64.slice(i, i + lineLength));
  }
  return lines.join("\r\n");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function isValidEmailAddress(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function buildRawMimeEmail(params: {
  to?: string;
  subject: string;
  body: string;
  fromEmail?: string | null;
}): string {
  const cleanSubject = sanitizeHeaderValue(params.subject);
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(cleanSubject)}?=`;
  const headers: string[] = [];

  if (params.fromEmail && isValidEmailAddress(params.fromEmail)) {
    headers.push(`From: ${sanitizeHeaderValue(params.fromEmail)}`);
  }
  if (params.to && params.to.trim()) {
    headers.push(`To: ${sanitizeHeaderValue(params.to)}`);
  }

  headers.push(`Subject: ${encodedSubject}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");

  const normalizedBody = params.body.replace(/\r?\n/g, "\r\n");
  const encodedBody = wrapBase64Lines(utf8ToBase64(normalizedBody));

  const mimeMessage = `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
  return utf8ToBase64Url(mimeMessage);
}

async function parseGmailError(res: Response): Promise<never> {
  let detail = "";
  try {
    const json = (await res.json()) as {
      error?: { message?: string; status?: string };
    };
    detail = json?.error?.message || "";
  } catch {
    // Ignore JSON parse errors
  }

  if (res.status === 401) {
    throw new GmailAuthExpiredError(
      "Votre session Gmail a expiré. Veuillez vous reconnecter avec Google."
    );
  }
  if (res.status === 403) {
    throw new GmailAuthExpiredError(
      detail ||
        "Autorisation Gmail insuffisante. Veuillez vous reconnecter et accorder les droits d'envoi Gmail."
    );
  }

  throw new Error(
    detail || `Erreur de l'API Gmail (HTTP ${res.status}).`
  );
}

export async function sendProspectEmailViaGmail(
  params: SendGmailEmailParams
): Promise<GmailSendResult> {
  const to = params.to.trim();
  if (!isValidEmailAddress(to)) {
    throw new Error("Veuillez saisir une adresse e-mail destinataire valide.");
  }
  if (!params.subject.trim()) {
    throw new Error("L'objet de l'e-mail ne peut pas être vide.");
  }
  if (!params.body.trim()) {
    throw new Error("Le corps de l'e-mail ne peut pas être vide.");
  }

  const raw = buildRawMimeEmail({
    to,
    subject: params.subject,
    body: params.body,
    fromEmail: params.fromEmail,
  });

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (!res.ok) {
    await parseGmailError(res);
  }

  const data = (await res.json()) as { id: string; threadId?: string };
  return { id: data.id, threadId: data.threadId };
}

export async function createProspectDraftInGmail(params: {
  accessToken: string;
  to?: string;
  subject: string;
  body: string;
  fromEmail?: string | null;
}): Promise<GmailDraftResult> {
  if (!params.subject.trim()) {
    throw new Error("L'objet du brouillon ne peut pas être vide.");
  }
  if (params.to && params.to.trim() && !isValidEmailAddress(params.to)) {
    throw new Error("L'adresse e-mail destinataire n'est pas valide.");
  }

  const raw = buildRawMimeEmail({
    to: params.to?.trim() || undefined,
    subject: params.subject,
    body: params.body,
    fromEmail: params.fromEmail,
  });

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: { raw },
      }),
    }
  );

  if (!res.ok) {
    await parseGmailError(res);
  }

  const data = (await res.json()) as {
    id: string;
    message?: { id?: string };
  };
  return { id: data.id, messageId: data.message?.id };
}

export interface GmailReplyStatus {
  hasReply: boolean;
  totalMessages: number;
  latestReplyFrom?: string;
  latestReplyDate?: string;
  latestReplySnippet?: string;
  threadId?: string;
}

interface GmailMessageMetadata {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
}

function getHeader(
  msg: GmailMessageMetadata,
  headerName: string
): string | undefined {
  const target = headerName.toLowerCase();
  return msg.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === target
  )?.value;
}

export async function checkProspectGmailReplies(params: {
  accessToken: string;
  recipientEmail?: string;
  threadId?: string;
  userEmail?: string | null;
}): Promise<GmailReplyStatus> {
  const cleanRecipient = params.recipientEmail?.trim().toLowerCase();
  const cleanUser = params.userEmail?.trim().toLowerCase();

  // 1. Check specific thread if threadId is known
  if (params.threadId) {
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
        params.threadId
      )}?format=metadata&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=Subject`,
      {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      }
    );

    if (threadRes.ok) {
      const threadData = (await threadRes.json()) as {
        id: string;
        messages?: GmailMessageMetadata[];
      };
      const messages = threadData.messages ?? [];
      // Look for any message in thread not sent by the current user
      const incomingMessages = messages.filter((m) => {
        const from = (getHeader(m, "From") || "").toLowerCase();
        if (cleanRecipient && from.includes(cleanRecipient)) return true;
        if (cleanUser && from && !from.includes(cleanUser)) return true;
        return false;
      });

      if (incomingMessages.length > 0) {
        const latest = incomingMessages[incomingMessages.length - 1];
        return {
          hasReply: true,
          totalMessages: messages.length,
          latestReplyFrom: getHeader(latest, "From"),
          latestReplyDate:
            getHeader(latest, "Date") ||
            (latest.internalDate
              ? new Date(Number(latest.internalDate)).toLocaleDateString(
                  "fr-FR"
                )
              : undefined),
          latestReplySnippet: latest.snippet,
          threadId: threadData.id,
        };
      }
    } else if (threadRes.status === 401 || threadRes.status === 403) {
      await parseGmailError(threadRes);
    }
  }

  // 2. Fallback: search inbox/messages directly from recipientEmail
  if (cleanRecipient && isValidEmailAddress(cleanRecipient)) {
    const q = `from:${cleanRecipient}`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
        q
      )}&maxResults=3`,
      {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      }
    );

    if (!listRes.ok) {
      await parseGmailError(listRes);
    }

    const listData = (await listRes.json()) as {
      messages?: Array<{ id: string; threadId?: string }>;
    };
    const first = listData.messages?.[0];
    if (first) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          first.id
        )}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${params.accessToken}` },
        }
      );

      if (msgRes.ok) {
        const msg = (await msgRes.json()) as GmailMessageMetadata;
        return {
          hasReply: true,
          totalMessages: listData.messages?.length ?? 1,
          latestReplyFrom: getHeader(msg, "From") || cleanRecipient,
          latestReplyDate:
            getHeader(msg, "Date") ||
            (msg.internalDate
              ? new Date(Number(msg.internalDate)).toLocaleDateString("fr-FR")
              : undefined),
          latestReplySnippet: msg.snippet,
          threadId: msg.threadId,
        };
      }
    }
  }

  return {
    hasReply: false,
    totalMessages: params.threadId ? 1 : 0,
    threadId: params.threadId,
  };
}
