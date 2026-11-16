import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  ProspectKit,
  RestaurantLead,
  SavedProspectEntry,
} from "../types/prospect";
import { useGoogleWorkspaceAuth } from "../contexts/GoogleWorkspaceAuthContext";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  GmailAuthExpiredError,
  GmailReplyStatus,
  checkProspectGmailReplies,
  createProspectDraftInGmail,
  isValidEmailAddress,
  sendProspectEmailViaGmail,
} from "../services/gmailService";

export type EmailTemplateId =
  | "site_vitrine"
  | "click_collect"
  | "visibilite_avis"
  | "approche_courte";

export type EmailTone = "professionnel" | "direct";

interface SenderProfile {
  senderName: string;
  senderCompany: string;
  senderPhoneOrLink: string;
}

const SENDER_STORAGE_KEY = "restoradar_sender_profile_v1";
const RECIPIENT_EMAILS_STORAGE_KEY = "restoradar_prospect_emails_v1";

const DEFAULT_SENDER: SenderProfile = {
  senderName: "",
  senderCompany: "",
  senderPhoneOrLink: "",
};

function loadSenderProfile(): SenderProfile {
  try {
    const raw = localStorage.getItem(SENDER_STORAGE_KEY);
    if (!raw) return DEFAULT_SENDER;
    const parsed = JSON.parse(raw) as Partial<SenderProfile>;
    return {
      senderName: parsed.senderName ?? "",
      senderCompany: parsed.senderCompany ?? "",
      senderPhoneOrLink: parsed.senderPhoneOrLink ?? "",
    };
  } catch {
    return DEFAULT_SENDER;
  }
}

function loadSavedRecipientEmail(placeId: string): string {
  try {
    const raw = localStorage.getItem(RECIPIENT_EMAILS_STORAGE_KEY);
    if (!raw) return "";
    const map = JSON.parse(raw) as Record<string, string>;
    return map[placeId] ?? "";
  } catch {
    return "";
  }
}

function saveRecipientEmail(placeId: string, email: string): void {
  try {
    const raw = localStorage.getItem(RECIPIENT_EMAILS_STORAGE_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (email.trim()) {
      map[placeId] = email.trim();
    } else {
      delete map[placeId];
    }
    localStorage.setItem(RECIPIENT_EMAILS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function extractCityFromAddress(formattedAddress: string): string {
  if (!formattedAddress) return "";
  const postalCityMatch = formattedAddress.match(
    /\b\d{4,5}\s+([^,]+?)(?:,|$)/
  );
  if (postalCityMatch?.[1]) {
    return postalCityMatch[1].trim();
  }
  const parts = formattedAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (
      /^(france|belgique|suisse|canada|luxembourg|espagne|italie|allemagne)$/i.test(
        last
      ) &&
      parts.length >= 2
    ) {
      return parts[parts.length - 2].replace(/^\d{4,5}\s*/, "").trim();
    }
    return parts[parts.length - 1];
  }
  return "";
}

function extractDomainHost(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function pickDefaultTemplate(lead: RestaurantLead): EmailTemplateId {
  if (lead.hasTakeout || lead.hasDelivery) {
    return "click_collect";
  }
  if (lead.websiteStatus !== "own_website") {
    return "site_vitrine";
  }
  if ((lead.userRatingCount ?? 0) >= 120 && (lead.rating ?? 0) >= 4.2) {
    return "visibilite_avis";
  }
  return "site_vitrine";
}

interface TemplateOption {
  id: EmailTemplateId;
  label: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { id: "site_vitrine", label: "Site vitrine & menu" },
  { id: "click_collect", label: "Click & Collect" },
  { id: "visibilite_avis", label: "Avis & réservations" },
  { id: "approche_courte", label: "Relance courte" },
];

export function buildPersonalizedEmail(params: {
  lead: RestaurantLead;
  templateId: EmailTemplateId;
  tone: EmailTone;
  sender: SenderProfile;
}): { subject: string; body: string } {
  const { lead, templateId, tone, sender } = params;
  const name = lead.displayName;
  const city = extractCityFromAddress(lead.formattedAddress);
  const cityPhrase = city ? ` à ${city}` : "";
  const cuisineRaw = lead.primaryTypeDisplayName?.trim();
  const categoryLabel = cuisineRaw
    ? cuisineRaw.toLowerCase()
    : "établissement";

  const ratingFormatted =
    lead.rating !== null ? lead.rating.toFixed(1).replace(".", ",") : null;
  const hasStrongReviews = lead.userRatingCount >= 50 && ratingFormatted !== null;
  const reputationSnippet = hasStrongReviews
    ? `avec une très belle note de ${ratingFormatted}/5 sur ${lead.userRatingCount} avis Google`
    : ratingFormatted !== null && lead.userRatingCount > 0
      ? `noté ${ratingFormatted}/5 sur Google (${lead.userRatingCount} avis)`
      : `bien référencé sur Google Maps${cityPhrase}`;

  const currentHost = extractDomainHost(lead.websiteURI);
  const digitalGapSentence =
    lead.websiteStatus === "none"
      ? `En consultant votre fiche Google Maps, j'ai remarqué que ${name} ne dispose pas encore de site web dédié : les clients qui vous cherchent sur mobile ne peuvent pas consulter votre carte complète ni réserver directement.`
      : lead.websiteStatus === "social_or_aggregator"
        ? `En consultant votre fiche Google Maps, j'ai vu que le lien actuel renvoie vers ${currentHost || "une plateforme tierce"} plutôt que vers un site propre à ${name}, ce qui limite votre visibilité et vous rend dépendant d'intermédiaires.`
        : `En parcourant la présence en ligne de ${name}${currentHost ? ` (${currentHost})` : ""}, j'ai identifié des leviers simples pour capter davantage de clients directs sans passer par les plateformes.`;

  const activeServices: string[] = [];
  if (lead.hasDineIn) activeServices.push("sur place");
  if (lead.hasTakeout) activeServices.push("vente à emporter");
  if (lead.hasDelivery) activeServices.push("livraison");
  if (lead.isReservable) activeServices.push("réservation de table");

  const servicesContext =
    activeServices.length > 0
      ? `compte tenu de vos services actuels (${activeServices.join(", ")})`
      : `pour un ${categoryLabel}${cityPhrase}`;

  const signatureLines = [
    sender.senderName.trim() || "[Votre prénom & nom]",
    sender.senderCompany.trim() || null,
    sender.senderPhoneOrLink.trim() || null,
  ].filter(Boolean);
  const signature = signatureLines.join("\n");

  const callbackMention = lead.nationalPhoneNumber
    ? `Si cela vous convient, je peux aussi vous passer un rapide appel au ${lead.nationalPhoneNumber} en dehors des heures de coup de feu.`
    : `Seriez-vous disponible cette semaine pour un échange rapide de 10 minutes en dehors du service ?`;

  if (templateId === "site_vitrine") {
    const subject =
      lead.websiteStatus === "none"
        ? `${name}${cityPhrase} — votre carte et réservations en direct sur Google`
        : `${name} — transformer vos visites Google Maps en clients directs`;

    const body =
      tone === "direct"
        ? `Bonjour l'équipe de ${name},

J'ai repéré votre ${categoryLabel}${cityPhrase}, ${reputationSnippet}.

${digitalGapSentence}

Concrètement, nous pouvons mettre en place en quelques jours une page rapide et optimisée mobile pour ${name} :
- votre carte et vos photos mises en valeur (sans PDF illisible sur téléphone),
- un bouton de réservation directe sans commission,
- un lien optimisé directement connecté à votre fiche Google Maps.

${callbackMention}

Bien cordialement,
${signature}`
        : `Bonjour,

Je me permets de vous contacter après avoir découvert ${name}${cityPhrase} sur Google Maps (${reputationSnippet}).

${digitalGapSentence}

Aujourd'hui, une grande part des clients locaux choisit son restaurant depuis son smartphone après avoir consulté les avis Google. En proposant un site vitrine clair à l'image de votre établissement — avec votre menu à jour, vos horaires et une prise de réservation en direct — vous captez cette demande sans payer de commission par couvert.

Je serais ravi de vous montrer gratuitement à quoi pourrait ressembler cette vitrine pour ${name}, ${servicesContext}.

${callbackMention}

Bien cordialement,
${signature}`;

    return { subject, body };
  }

  if (templateId === "click_collect") {
    const hasTakeoutOrDelivery = Boolean(lead.hasTakeout || lead.hasDelivery);
    const subject = hasTakeoutOrDelivery
      ? `${name} — développer vos commandes directes sans commission plateforme`
      : `${name}${cityPhrase} — lancer le Click & Collect direct pour vos habitués`;

    const serviceIntro = hasTakeoutOrDelivery
      ? `J'ai vu sur Google Maps que vous proposez déjà ${lead.hasTakeout && lead.hasDelivery ? "la vente à emporter et la livraison" : lead.hasTakeout ? "la vente à emporter" : "la livraison"}${cityPhrase}.`
      : `Votre établissement (${reputationSnippet}) attire déjà une belle clientèle locale${cityPhrase}.`;

    const body =
      tone === "direct"
        ? `Bonjour l'équipe de ${name},

${serviceIntro}
${lead.websiteStatus !== "own_website" ? `Pourtant, vos clients ne disposent pas encore d'un lien de commande directe propre à ${name} sur Google.` : ""}

Nous aidons les restaurateurs à mettre en place un module de commande Click & Collect ultra-simple :
- 0 % de commission sur vos commandes régulières,
- paiement ou retrait au comptoir selon votre organisation en cuisine,
- mise en avant directe depuis votre fiche Google Maps et un QR code en salle.

Je peux vous envoyer une maquette personnalisée pour ${name} dès cette semaine. Cela vous intéresserait-il ?

Bien cordialement,
${signature}`
        : `Bonjour,

En analysant les établissements les plus appréciés${cityPhrase}, je suis tombé sur ${name} (${reputationSnippet}). ${serviceIntro}

Beaucoup de restaurateurs avec un tel niveau de satisfaction perdent une part importante de leur marge sur les plateformes de livraison ou manquent des commandes d'habitués faute d'un parcours direct simple sur mobile.

Nous concevons des pages de commande Click & Collect et menus digitaux sur-mesure pour les restaurants : vos clients commandent en 3 clics depuis votre fiche Google, sans commission prélevée sur votre chiffre d'affaires.

${callbackMention}

Bien cordialement,
${signature}`;

    return { subject, body };
  }

  if (templateId === "visibilite_avis") {
    const subject = hasStrongReviews
      ? `${name} (${ratingFormatted}/5 sur Google) — convertir vos visiteurs en réservations`
      : `${name}${cityPhrase} — convertir davantage de recherches Google en tables remplies`;

    const body =
      tone === "direct"
        ? `Bonjour l'équipe de ${name},

Félicitations pour votre réputation locale : ${reputationSnippet}, c'est un atout majeur${cityPhrase}.

${digitalGapSentence}

Avec un mini-site relié à votre fiche Google Maps, vous transformez directement cette visibilité en réservations fermes et en demandes de privatisation/groupes, sans intermédiaire.

Souhaitez-vous que je vous prépare un aperçu rapide adapté à ${name} ?

Bien cordialement,
${signature}`
        : `Bonjour,

Votre ${categoryLabel} ${name} bénéficie déjà d'une solide preuve sociale${cityPhrase} (${reputationSnippet}).

Pourtant, sans page dédiée à votre nom pour accueillir les internautes après leur recherche sur Google Maps, une partie de ce trafic repart vers des annuaires ou des concurrents mieux équipés sur mobile.

En mettant en ligne un espace clair dédié à ${name} — présentant votre carte, votre ambiance et un accès direct à la réservation ou à l'itinéraire — vous capitalisez pleinement sur vos avis existants.

${callbackMention}

Bien cordialement,
${signature}`;

    return { subject, body };
  }

  const subject = `Question rapide pour ${name}${cityPhrase}`;
  const shortGap =
    lead.websiteStatus === "none"
      ? `je n'ai pas trouvé de site web sur votre fiche Google Maps`
      : lead.websiteStatus === "social_or_aggregator"
        ? `votre fiche Google Maps renvoie uniquement vers ${currentHost || "un lien externe"}`
        : `je travaille avec des restaurateurs${cityPhrase} sur la réservation directe sans commission`;

  const body = `Bonjour l'équipe de ${name},

Je suis tombé sur votre fiche Google (${reputationSnippet}) et j'ai noté que ${shortGap}.

J'ai préparé 2 idées concrètes pour vous permettre de capter plus de clients en direct (menu mobile + réservation/Click & Collect sans commission). Puis-je vous les présenter en 5 minutes cette semaine ?

Bien cordialement,
${signature}`;

  return { subject, body };
}

interface ProspectEmailGeneratorProps {
  lead: RestaurantLead;
  kit: ProspectKit | null;
  savedEntry?: SavedProspectEntry;
  isSaved: boolean;
  savedStatus?: string;
  onMarkContacted: () => void;
  onRecipientEmailSaved?: (email: string) => void;
  onGmailSent?: (info: {
    recipientEmail: string;
    threadId?: string;
    sentAt: string;
  }) => void;
}

export function ProspectEmailGenerator({
  lead,
  kit,
  savedEntry,
  isSaved,
  savedStatus,
  onMarkContacted,
  onRecipientEmailSaved,
  onGmailSent,
}: ProspectEmailGeneratorProps) {
  const {
    user,
    accessToken,
    needsAuth,
    isSigningIn,
    authError,
    signIn,
    signOut,
    invalidateToken,
  } = useGoogleWorkspaceAuth();

  const [templateId, setTemplateId] = useState<EmailTemplateId>(() =>
    pickDefaultTemplate(lead)
  );
  const [tone, setTone] = useState<EmailTone>("professionnel");
  const [sender, setSender] = useState<SenderProfile>(() =>
    loadSenderProfile()
  );
  const [showSenderSettings, setShowSenderSettings] = useState(
    () => !loadSenderProfile().senderName
  );
  const [recipientEmail, setRecipientEmail] = useState<string>(
    () => savedEntry?.recipientEmail || loadSavedRecipientEmail(lead.id)
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // Gmail sending & reply tracking state
  const [pendingAction, setPendingAction] = useState<"send" | "draft" | null>(
    null
  );
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailSuccess, setGmailSuccess] = useState<{
    type: "send" | "draft";
    to?: string;
    timestamp: string;
  } | null>(null);
  const [replyStatus, setReplyStatus] = useState<GmailReplyStatus | null>(null);
  const [isCheckingReplies, setIsCheckingReplies] = useState(false);

  // Pre-fill sender name from connected Google account if empty
  useEffect(() => {
    if (user?.displayName && !sender.senderName) {
      setSender((prev) => ({
        ...prev,
        senderName: prev.senderName || user.displayName || "",
      }));
    }
  }, [user?.displayName, sender.senderName]);

  // Persist sender profile in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(sender));
    } catch {
      // Ignore storage quota errors
    }
  }, [sender]);

  // Reset template, recipient email, and Gmail feedback when switching restaurant
  useEffect(() => {
    const recommended = pickDefaultTemplate(lead);
    setTemplateId(recommended);
    setIsDirty(false);
    setRecipientEmail(
      savedEntry?.recipientEmail || loadSavedRecipientEmail(lead.id)
    );
    setPendingAction(null);
    setGmailError(null);
    setGmailSuccess(null);
    setReplyStatus(null);
    const built = buildPersonalizedEmail({
      lead,
      templateId: recommended,
      tone,
      sender,
    });
    setSubject(built.subject);
    setBody(built.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  // Re-fill automatically when Place Details load or template/tone/sender change (unless user edited manually)
  useEffect(() => {
    if (isDirty) return;
    const built = buildPersonalizedEmail({
      lead,
      templateId,
      tone,
      sender,
    });
    setSubject(built.subject);
    setBody(built.body);
  }, [
    lead,
    lead.detailsLoaded,
    lead.hasDelivery,
    lead.hasTakeout,
    lead.isReservable,
    lead.hasDineIn,
    templateId,
    tone,
    sender,
    isDirty,
  ]);

  const handleRecipientChange = (nextEmail: string) => {
    setRecipientEmail(nextEmail);
    saveRecipientEmail(lead.id, nextEmail);
    setGmailError(null);
    if (isSaved && onRecipientEmailSaved) {
      onRecipientEmailSaved(nextEmail.trim());
    }
  };

  const handleSelectTemplate = (nextId: EmailTemplateId) => {
    setTemplateId(nextId);
    setIsDirty(false);
    const built = buildPersonalizedEmail({
      lead,
      templateId: nextId,
      tone,
      sender,
    });
    setSubject(built.subject);
    setBody(built.body);
  };

  const handleSelectTone = (nextTone: EmailTone) => {
    setTone(nextTone);
    setIsDirty(false);
    const built = buildPersonalizedEmail({
      lead,
      templateId,
      tone: nextTone,
      sender,
    });
    setSubject(built.subject);
    setBody(built.body);
  };

  const handleReset = () => {
    setIsDirty(false);
    const built = buildPersonalizedEmail({
      lead,
      templateId,
      tone,
      sender,
    });
    setSubject(built.subject);
    setBody(built.body);
  };

  const handleApplyAiEmail = () => {
    if (!kit) return;
    setSubject(kit.emailSubject);
    setBody(kit.emailBody);
    setIsDirty(true);
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permissions errors
    }
  };

  const handleRequestGmailSend = () => {
    setGmailError(null);
    if (!isValidEmailAddress(recipientEmail)) {
      setGmailError(
        "Renseignez une adresse e-mail destinataire valide pour ce restaurant avant l'envoi."
      );
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setGmailError("L'objet et le corps de l'e-mail sont requis.");
      return;
    }
    setPendingAction("send");
  };

  const handleRequestGmailDraft = () => {
    setGmailError(null);
    if (recipientEmail.trim() && !isValidEmailAddress(recipientEmail)) {
      setGmailError("L'adresse e-mail destinataire saisie n'est pas valide.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setGmailError("L'objet et le corps du message sont requis.");
      return;
    }
    setPendingAction("draft");
  };

  const handleConfirmGmailAction = async () => {
    if (!pendingAction || !accessToken) return;
    setIsSendingGmail(true);
    setGmailError(null);

    try {
      const nowLabel = new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (pendingAction === "send") {
        const sent = await sendProspectEmailViaGmail({
          accessToken,
          to: recipientEmail.trim(),
          subject,
          body,
          fromEmail: user?.email,
        });
        setGmailSuccess({
          type: "send",
          to: recipientEmail.trim(),
          timestamp: nowLabel,
        });
        if (onGmailSent) {
          onGmailSent({
            recipientEmail: recipientEmail.trim(),
            threadId: sent.threadId,
            sentAt: new Date().toISOString(),
          });
        } else {
          onMarkContacted();
        }
      } else {
        await createProspectDraftInGmail({
          accessToken,
          to: recipientEmail.trim() || undefined,
          subject,
          body,
          fromEmail: user?.email,
        });
        setGmailSuccess({
          type: "draft",
          to: recipientEmail.trim() || undefined,
          timestamp: nowLabel,
        });
      }
      setPendingAction(null);
    } catch (err) {
      if (err instanceof GmailAuthExpiredError) {
        invalidateToken();
      }
      setPendingAction(null);
      setGmailError(
        err instanceof Error
          ? err.message
          : "Impossible d'exécuter l'opération Gmail."
      );
    } finally {
      setIsSendingGmail(false);
    }
  };

  const handleCheckReplies = async () => {
    if (!accessToken) return;
    if (!isValidEmailAddress(recipientEmail) && !savedEntry?.lastGmailThreadId) {
      setGmailError(
        "Renseignez d'abord l'adresse e-mail du restaurant pour rechercher ses réponses."
      );
      return;
    }
    setIsCheckingReplies(true);
    setGmailError(null);
    try {
      const result = await checkProspectGmailReplies({
        accessToken,
        recipientEmail: recipientEmail.trim() || undefined,
        threadId: savedEntry?.lastGmailThreadId,
        userEmail: user?.email,
      });
      setReplyStatus(result);
    } catch (err) {
      if (err instanceof GmailAuthExpiredError) {
        invalidateToken();
      }
      setGmailError(
        err instanceof Error
          ? err.message
          : "Impossible de vérifier les réponses Gmail."
      );
    } finally {
      setIsCheckingReplies(false);
    }
  };

  const mailtoHref = useMemo(() => {
    const recipient = isValidEmailAddress(recipientEmail)
      ? recipientEmail.trim()
      : "";
    return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [recipientEmail, subject, body]);

  const city = extractCityFromAddress(lead.formattedAddress);
  const injectedSignals = useMemo(() => {
    const signals: string[] = [lead.displayName];
    if (city) signals.push(city);
    if (lead.rating !== null) {
      signals.push(
        `${lead.rating.toFixed(1).replace(".", ",")}/5 (${lead.userRatingCount} avis)`
      );
    }
    signals.push(
      lead.websiteStatus === "none"
        ? "Sans site web"
        : lead.websiteStatus === "social_or_aggregator"
          ? "Lien tiers"
          : "Site actif"
    );
    if (lead.hasTakeout) signals.push("À emporter");
    if (lead.hasDelivery) signals.push("Livraison");
    if (lead.isReservable) signals.push("Réservable");
    return signals;
  }, [lead, city]);

  const alreadyContacted = isSaved && savedStatus === "contacte";
  const hasGmailToken = Boolean(accessToken) && !needsAuth;

  return (
    <section
      aria-label="Générateur et envoi d'e-mails de prospection"
      className="border-t border-slate-200 pt-5 space-y-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">
            E-mail de prospection &amp; Envoi Gmail
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Modèles pré-remplis avec les données Google Maps, envoyables
            directement depuis votre compte Gmail.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSenderSettings((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            showSenderSettings
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Signature</span>
        </button>
      </div>

      {/* Real data signals injected into template */}
      <div className="text-[11px] text-slate-500 tabular-nums leading-relaxed">
        <span className="font-semibold text-slate-700">Données injectées :</span>{" "}
        {injectedSignals.join(" · ")}
      </div>

      {/* Collapsible sender profile */}
      {showSenderSettings && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
          <div className="text-xs font-semibold text-slate-700">
            Votre signature d&apos;expéditeur (mémorisée)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={sender.senderName}
              onChange={(e) =>
                setSender((prev) => ({ ...prev, senderName: e.target.value }))
              }
              placeholder="Votre prénom & nom"
              aria-label="Votre prénom et nom"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <input
              type="text"
              value={sender.senderCompany}
              onChange={(e) =>
                setSender((prev) => ({
                  ...prev,
                  senderCompany: e.target.value,
                }))
              }
              placeholder="Agence / Activité (optionnel)"
              aria-label="Nom de votre agence ou activité"
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <input
            type="text"
            value={sender.senderPhoneOrLink}
            onChange={(e) =>
              setSender((prev) => ({
                ...prev,
                senderPhoneOrLink: e.target.value,
              }))
            }
            placeholder="Téléphone, site web ou lien de prise de RDV (optionnel)"
            aria-label="Votre téléphone ou lien de rendez-vous"
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      )}

      {/* Template Selector + Tone Toggle */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {TEMPLATE_OPTIONS.map((tpl) => {
            const active = templateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl.id)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition-colors whitespace-nowrap truncate ${
                  active
                    ? "border-emerald-600 bg-emerald-50/70 text-emerald-800 font-semibold"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {tpl.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => handleSelectTone("professionnel")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tone === "professionnel"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ton conseil
            </button>
            <button
              type="button"
              onClick={() => handleSelectTone("direct")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tone === "direct"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ton direct
            </button>
          </div>

          <div className="flex items-center gap-2">
            {kit && (
              <button
                type="button"
                onClick={handleApplyAiEmail}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Charger l&apos;e-mail IA</span>
              </button>
            )}
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Réinitialiser</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recipient, Subject & Body */}
      <div className="space-y-2.5">
        <div>
          <label
            htmlFor="prospect-recipient-email"
            className="block text-[11px] font-semibold text-slate-500 mb-1"
          >
            Destinataire (e-mail de {lead.displayName})
          </label>
          <input
            id="prospect-recipient-email"
            type="email"
            value={recipientEmail}
            onChange={(e) => handleRecipientChange(e.target.value)}
            placeholder="contact@restaurant.fr"
            className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          {!recipientEmail && lead.nationalPhoneNumber && (
            <p className="text-[11px] text-slate-500 mt-1">
              Google Maps ne fournit pas l&apos;adresse e-mail : récupérez-la
              sur leur page ou demandez-la au {lead.nationalPhoneNumber}.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="prospect-email-subject"
            className="block text-[11px] font-semibold text-slate-500 mb-1"
          >
            Objet de l&apos;e-mail
          </label>
          <input
            id="prospect-email-subject"
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setIsDirty(true);
            }}
            className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="prospect-email-body"
              className="block text-[11px] font-semibold text-slate-500"
            >
              Corps du message (modifiable)
            </label>
            {isDirty && (
              <span className="text-[11px] text-amber-700 font-medium">
                Édité manuellement
              </span>
            )}
          </div>
          <textarea
            id="prospect-email-body"
            rows={8}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setIsDirty(true);
            }}
            className="w-full px-3 py-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Gmail Direct Send Service Block */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-800">
            Envoi direct via Gmail
          </div>
          {hasGmailToken && user?.email && (
            <div className="flex items-center gap-2 text-[11px] text-slate-600 min-w-0">
              <span className="truncate">{user.email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                title="Déconnecter le compte Google"
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3 h-3" aria-hidden="true" />
                <span>Déconnecter</span>
              </button>
            </div>
          )}
        </div>

        {!hasGmailToken ? (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-600 leading-relaxed">
              {user
                ? "Reconnectez votre session Google pour autoriser l'envoi direct depuis votre boîte Gmail."
                : "Connectez votre compte Google pour envoyer cet e-mail ou créer un brouillon directement dans Gmail."}
            </p>
            <GoogleSignInButton
              onClick={() => void signIn()}
              disabled={isSigningIn}
            />
            {authError && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRequestGmailSend}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Envoyer via Gmail</span>
            </button>

            <button
              type="button"
              onClick={handleRequestGmailDraft}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span>Brouillon Gmail</span>
            </button>

            {(isValidEmailAddress(recipientEmail) ||
              Boolean(savedEntry?.lastGmailThreadId)) && (
              <button
                type="button"
                onClick={() => void handleCheckReplies()}
                disabled={isCheckingReplies}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isCheckingReplies ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>
                  {isCheckingReplies ? "Vérification…" : "Vérifier réponse"}
                </span>
              </button>
            )}
          </div>
        )}

        {savedEntry?.lastGmailSentAt && (
          <div className="text-[11px] text-slate-500 tabular-nums">
            Dernier envoi enregistré le{" "}
            {new Date(savedEntry.lastGmailSentAt).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </div>
        )}

        {replyStatus && (
          <div
            className={`text-xs rounded-lg p-2.5 border ${
              replyStatus.hasReply
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-white border-slate-200 text-slate-600"
            }`}
          >
            {replyStatus.hasReply ? (
              <div className="space-y-1">
                <div className="font-semibold text-emerald-800">
                  Réponse reçue de {replyStatus.latestReplyFrom || recipientEmail}
                  {replyStatus.latestReplyDate
                    ? ` (${replyStatus.latestReplyDate})`
                    : ""}
                </div>
                {replyStatus.latestReplySnippet && (
                  <p className="text-[11px] text-emerald-800/90 leading-relaxed">
                    « {replyStatus.latestReplySnippet} »
                  </p>
                )}
              </div>
            ) : (
              <span>Aucune réponse détectée dans votre boîte Gmail pour le moment.</span>
            )}
          </div>
        )}

        {gmailError && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{gmailError}</span>
          </div>
        )}

        {gmailSuccess && (
          <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              {gmailSuccess.type === "send"
                ? `E-mail envoyé via Gmail à ${gmailSuccess.to} (${gmailSuccess.timestamp}). Prospect marqué comme contacté.`
                : `Brouillon enregistré dans votre compte Gmail (${gmailSuccess.timestamp}).`}
            </span>
          </div>
        )}
      </div>

      {/* Secondary / Fallback Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopyEmail()}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{copied ? "E-mail copié" : "Copier l'e-mail"}</span>
        </button>

        <a
          href={mailtoHref}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Mail className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
          <span>Messagerie locale</span>
        </a>

        <button
          type="button"
          onClick={onMarkContacted}
          disabled={alreadyContacted}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            alreadyContacted
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{alreadyContacted ? "Contacté" : "Marquer contacté"}</span>
        </button>
      </div>

      {/* Explicit Confirmation Modal before mutating Gmail state */}
      {pendingAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <h4
                id="gmail-confirm-title"
                className="font-display text-base font-bold text-slate-900"
              >
                {pendingAction === "send"
                  ? "Confirmer l'envoi via Gmail"
                  : "Confirmer la création du brouillon Gmail"}
              </h4>
              <button
                type="button"
                onClick={() => !isSendingGmail && setPendingAction(null)}
                aria-label="Fermer la confirmation"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {pendingAction === "send"
                  ? "Cet e-mail sera envoyé immédiatement depuis votre compte Gmail au destinataire ci-dessous."
                  : "Ce message sera enregistré comme brouillon dans votre boîte Gmail sans être envoyé."}
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-24 shrink-0">
                    Expéditeur
                  </span>
                  <span className="text-slate-900 truncate">
                    {user?.email || "Compte Google connecté"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-24 shrink-0">
                    Destinataire
                  </span>
                  <span className="font-medium text-slate-900 truncate">
                    {recipientEmail.trim() || "Non renseigné (brouillon)"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-24 shrink-0">
                    Restaurant
                  </span>
                  <span className="text-slate-800 truncate">
                    {lead.displayName}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-24 shrink-0">
                    Objet
                  </span>
                  <span className="font-semibold text-slate-900">
                    {subject}
                  </span>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg p-3 text-slate-700 whitespace-pre-wrap leading-relaxed">
                {body}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={isSendingGmail}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmGmailAction()}
                disabled={isSendingGmail}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {isSendingGmail ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : pendingAction === "send" ? (
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>
                  {isSendingGmail
                    ? "Traitement…"
                    : pendingAction === "send"
                      ? "Confirmer et envoyer"
                      : "Confirmer le brouillon"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
