import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Mail,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { ProspectKit, RestaurantLead } from "../types/prospect";

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

export function extractCityFromAddress(formattedAddress: string): string {
  if (!formattedAddress) return "";
  // Match French / European postal code + city, e.g. "75011 Paris" or "69002 Lyon"
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
    // Take penultimate segment if last looks like a country name
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

  // approche_courte
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
  isSaved: boolean;
  savedStatus?: string;
  onMarkContacted: () => void;
}

export function ProspectEmailGenerator({
  lead,
  kit,
  isSaved,
  savedStatus,
  onMarkContacted,
}: ProspectEmailGeneratorProps) {
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // Persist sender profile in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(sender));
    } catch {
      // Ignore storage quota errors
    }
  }, [sender]);

  // Reset template choice & dirty state when switching to a different restaurant
  useEffect(() => {
    const recommended = pickDefaultTemplate(lead);
    setTemplateId(recommended);
    setIsDirty(false);
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

  const mailtoHref = useMemo(() => {
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [subject, body]);

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

  return (
    <section
      aria-label="Générateur d'e-mails de prospection"
      className="border-t border-slate-200 pt-5 space-y-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">
            Générateur d&apos;e-mail de prospection
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Modèles pré-remplis instantanément avec les données Google Maps de
            l&apos;établissement.
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

      {/* Real data signals injected into template (plain hairline strip, no pills) */}
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

      {/* Editable Subject & Body */}
      <div className="space-y-2">
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
            rows={9}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setIsDirty(true);
            }}
            className="w-full px-3 py-2.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Action Buttons */}
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
          <span>Ouvrir dans la messagerie</span>
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
    </section>
  );
}
