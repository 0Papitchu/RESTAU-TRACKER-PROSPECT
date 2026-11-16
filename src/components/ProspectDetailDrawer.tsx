import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  X,
} from "lucide-react";
import {
  PipelineStatus,
  ProspectKit,
  RestaurantLead,
  SavedProspectEntry,
  formatDistance,
  formatPriceLevel,
} from "../types/prospect";
import { ProspectEmailGenerator } from "./ProspectEmailGenerator";

interface ProspectDetailDrawerProps {
  lead: RestaurantLead | null;
  savedEntry?: SavedProspectEntry;
  isLoadingDetails: boolean;
  onClose: () => void;
  onToggleSave: (lead: RestaurantLead, kit?: ProspectKit) => void;
  onSaveKit: (lead: RestaurantLead, kit: ProspectKit) => void;
  onUpdateStatus: (placeId: string, status: PipelineStatus) => void;
  onUpdateNotes: (placeId: string, notes: string) => void;
}

const OFFER_ANGLES = [
  "Site vitrine moderne + Réservation de table directe sans commission",
  "Menu QR digital + Commande Click & Collect sans commission plateformes",
  "Mini-app mobile de commande & programme de fidélité client",
  "Refonte présence Google + Page menu optimisée mobile & SEO local",
];

export function ProspectDetailDrawer({
  lead,
  savedEntry,
  isLoadingDetails,
  onClose,
  onToggleSave,
  onSaveKit,
  onUpdateStatus,
  onUpdateNotes,
}: ProspectDetailDrawerProps) {
  const [offerAngle, setOfferAngle] = useState(OFFER_ANGLES[0]);
  const [customAngle, setCustomAngle] = useState("");
  const [kit, setKit] = useState<ProspectKit | null>(savedEntry?.kit ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [kitTab, setKitTab] = useState<"diagnostic" | "messages" | "script">(
    "diagnostic"
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    setKit(savedEntry?.kit ?? null);
    setGenError(null);
    setKitTab("diagnostic");
  }, [lead?.id, savedEntry?.kit]);

  if (!lead) return null;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleGenerateKit = async () => {
    setIsGenerating(true);
    setGenError(null);
    const chosenAngle = customAngle.trim() || offerAngle;

    try {
      const res = await fetch("/api/prospect/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerAngle: chosenAngle,
          restaurant: {
            id: lead.id,
            displayName: lead.displayName,
            formattedAddress: lead.formattedAddress,
            primaryTypeDisplayName: lead.primaryTypeDisplayName,
            rating: lead.rating,
            userRatingCount: lead.userRatingCount,
            priceLevel: formatPriceLevel(lead.priceLevel),
            websiteStatus: lead.websiteStatus,
            websiteURI: lead.websiteURI,
            nationalPhoneNumber: lead.nationalPhoneNumber,
            distanceMeters: lead.distanceMeters,
            hasDelivery: lead.hasDelivery,
            hasTakeout: lead.hasTakeout,
            isReservable: lead.isReservable,
            hasDineIn: lead.hasDineIn,
            editorialSummary: lead.editorialSummary,
            reviews: (lead.reviews ?? []).map((r) => ({
              rating: r.rating ?? undefined,
              text: r.text ?? undefined,
            })),
            weekdayDescriptions: lead.weekdayDescriptions,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la préparation du dossier.");
      }

      setKit(data.kit);
      onSaveKit(lead, data.kit);
    } catch (err) {
      setGenError(
        err instanceof Error
          ? err.message
          : "Impossible de générer le dossier pour le moment."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkContacted = () => {
    if (!savedEntry) {
      onToggleSave(lead, kit ?? undefined);
    }
    onUpdateStatus(lead.id, "contacte");
  };

  const price = formatPriceLevel(lead.priceLevel);
  const dist = formatDistance(lead.distanceMeters);

  return (
    <aside
      aria-label={`Dossier de prospection : ${lead.displayName}`}
      className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <div className="text-xs font-medium text-emerald-700">
            {lead.websiteStatus === "none"
              ? "Cible prioritaire · Aucun site web"
              : lead.websiteStatus === "social_or_aggregator"
                ? "Cible qualifiée · Lien tiers uniquement"
                : "Établissement équipé · Site web actif"}
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5 truncate">
            {lead.displayName}
          </h2>
          <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
            <span>{lead.primaryTypeDisplayName || "Restaurant"}</span>
            {lead.rating !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-900">
                  {lead.rating.toFixed(1)} ★ ({lead.userRatingCount} avis)
                </span>
              </>
            )}
            {price && (
              <>
                <span aria-hidden="true">·</span>
                <span>{price}</span>
              </>
            )}
            {dist && (
              <>
                <span aria-hidden="true">·</span>
                <span>À {dist}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleSave(lead, kit ?? undefined)}
            aria-label={
              savedEntry
                ? "Retirer de la shortlist"
                : "Sauvegarder dans la shortlist"
            }
            className={`p-2 rounded-lg border transition-colors ${
              savedEntry
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            {savedEntry ? (
              <BookmarkCheck className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le dossier"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Photos strip from Google Places */}
        {isLoadingDetails && !lead.detailsLoaded ? (
          <div className="h-36 bg-slate-100 rounded-lg animate-pulse" />
        ) : lead.photos && lead.photos.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {lead.photos.map((photo, i) => (
              <div
                key={i}
                className="relative w-44 h-32 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200"
              >
                <img
                  src={photo.uri}
                  alt={`${lead.displayName} — photo ${i + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {photo.attributions.length > 0 && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-1 text-[10px] text-white truncate">
                    Photo : {photo.attributions[0].displayName || "Contributeur Google"}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Verified Google Maps coordinates & contact */}
        <div className="space-y-2.5 text-sm border-b border-slate-200 pb-5">
          <div className="flex items-start gap-2.5 text-slate-700">
            <MapPin
              className="w-4 h-4 text-slate-400 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>{lead.formattedAddress}</span>
          </div>

          {lead.nationalPhoneNumber && (
            <div className="flex items-center gap-2.5 text-slate-700 tabular-nums">
              <Phone
                className="w-4 h-4 text-slate-400 shrink-0"
                aria-hidden="true"
              />
              <a
                href={`tel:${lead.internationalPhoneNumber || lead.nationalPhoneNumber}`}
                className="font-medium text-slate-900 hover:text-emerald-700"
              >
                {lead.nationalPhoneNumber}
              </a>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
            {lead.googleMapsURI && (
              <a
                href={lead.googleMapsURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
              >
                <span>Fiche Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {lead.websiteURI && (
              <a
                href={lead.websiteURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline"
              >
                <span>Lien actuel : {lead.websiteURI}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {lead.editorialSummary && (
            <p className="text-xs text-slate-600 pt-1 leading-relaxed">
              {lead.editorialSummary}
            </p>
          )}

          {(lead.hasDineIn !== undefined ||
            lead.hasTakeout !== undefined ||
            lead.hasDelivery !== undefined ||
            lead.isReservable !== undefined) && (
            <div className="text-xs text-slate-500 pt-1 flex flex-wrap gap-x-2 gap-y-1">
              <span>Services :</span>
              {lead.hasDineIn && <span>Sur place</span>}
              {lead.hasTakeout && <span>· À emporter</span>}
              {lead.hasDelivery && <span>· Livraison</span>}
              {lead.isReservable && <span>· Réservable</span>}
            </div>
          )}

          {lead.weekdayDescriptions.length > 0 && (
            <details className="text-xs text-slate-600 pt-1">
              <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900">
                Horaires d&apos;ouverture
              </summary>
              <ul className="mt-1.5 space-y-0.5 pl-3 text-slate-600 tabular-nums">
                {lead.weekdayDescriptions.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Personalized Email Template Generator */}
        <ProspectEmailGenerator
          lead={lead}
          kit={kit}
          isSaved={Boolean(savedEntry)}
          savedStatus={savedEntry?.status}
          onMarkContacted={handleMarkContacted}
        />

        {/* AI Prospection Kit Preparation */}
        <section className="border-t border-slate-200 pt-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Préparer l&apos;approche commerciale (Dossier complet IA)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Générez un diagnostic digital, un email, un message WhatsApp et un
              script d&apos;appel personnalisés à partir des données Google Maps.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="offer-angle-select"
              className="block text-xs font-medium text-slate-700"
            >
              Proposition à mettre en avant
            </label>
            <select
              id="offer-angle-select"
              value={offerAngle}
              onChange={(e) => setOfferAngle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {OFFER_ANGLES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={customAngle}
              onChange={(e) => setCustomAngle(e.target.value)}
              placeholder="Ou précisez votre offre sur-mesure (optionnel)…"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />

            <button
              type="button"
              onClick={() => void handleGenerateKit()}
              disabled={isGenerating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              )}
              <span>
                {isGenerating
                  ? "Rédaction du dossier en cours…"
                  : kit
                    ? "Régénérer le dossier de prospection"
                    : "Générer le dossier de prospection"}
              </span>
            </button>
          </div>

          {genError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {genError}
            </div>
          )}

          {kit && (
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
              <div className="flex border-b border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setKitTab("diagnostic")}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    kitTab === "diagnostic"
                      ? "text-emerald-700 border-b-2 border-emerald-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Diagnostic & Offre
                </button>
                <button
                  type="button"
                  onClick={() => setKitTab("messages")}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    kitTab === "messages"
                      ? "text-emerald-700 border-b-2 border-emerald-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Email & WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setKitTab("script")}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    kitTab === "script"
                      ? "text-emerald-700 border-b-2 border-emerald-600"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Appel & Objections
                </button>
              </div>

              <div className="p-4 space-y-4 text-sm bg-white">
                {kitTab === "diagnostic" && (
                  <>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">
                        Diagnostic d&apos;opportunité
                      </div>
                      <p className="text-slate-800 mt-1 leading-relaxed">
                        {kit.opportunityDiagnosis}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-500">
                        Solution recommandée : {kit.recommendedSolutionTitle}
                      </div>
                      <ul className="mt-1.5 space-y-1 text-slate-700 list-disc pl-4">
                        {kit.recommendedFeatures.map((feat, i) => (
                          <li key={i}>{feat}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="grid grid-cols-1 gap-3 pt-1 border-t border-slate-100">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">
                          Impact commercial attendu
                        </div>
                        <p className="text-slate-800 mt-0.5 text-xs leading-relaxed">
                          {kit.estimatedImpact}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">
                          Meilleur créneau de prise de contact
                        </div>
                        <p className="text-slate-800 mt-0.5 text-xs">
                          {kit.bestContactWindow}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {kitTab === "messages" && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">
                          Email personnalisé
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              `Objet : ${kit.emailSubject}\n\n${kit.emailBody}`,
                              "email"
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          {copiedField === "email" ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {copiedField === "email" ? "Copié" : "Copier l'email"}
                          </span>
                        </button>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                        Objet : {kit.emailSubject}
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed">
                        {kit.emailBody}
                      </pre>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">
                          Message WhatsApp / SMS
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(kit.whatsappMessage, "whatsapp")
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          {copiedField === "whatsapp" ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {copiedField === "whatsapp" ? "Copié" : "Copier"}
                          </span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed whitespace-pre-wrap">
                        {kit.whatsappMessage}
                      </p>
                    </div>
                  </>
                )}

                {kitTab === "script" && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">
                          Accroche téléphonique (30 sec)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(kit.callScript, "script")
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          {copiedField === "script" ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {copiedField === "script" ? "Copié" : "Copier"}
                          </span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-200 leading-relaxed whitespace-pre-wrap">
                        {kit.callScript}
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="text-xs font-semibold text-slate-500">
                        Réponses aux objections fréquentes
                      </div>
                      {kit.objections.map((obj, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1"
                        >
                          <div className="text-xs font-semibold text-slate-900">
                            « {obj.objection} »
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {obj.response}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* CRM Pipeline tracking when saved */}
        {savedEntry && (
          <section className="border-t border-slate-200 pt-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Suivi de prospection
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs text-slate-600">
                Statut
                <select
                  value={savedEntry.status}
                  onChange={(e) =>
                    onUpdateStatus(
                      savedEntry.placeId,
                      e.target.value as PipelineStatus
                    )
                  }
                  className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="a_contacter">À contacter</option>
                  <option value="contacte">Contacté</option>
                  <option value="rdv_pris">RDV pris</option>
                  <option value="archive">Archivé</option>
                </select>
              </label>

              <label className="text-xs text-slate-600">
                Notes personnelles
                <textarea
                  rows={2}
                  value={savedEntry.notes}
                  onChange={(e) =>
                    onUpdateNotes(savedEntry.placeId, e.target.value)
                  }
                  placeholder="Nom du gérant, remarques après appel…"
                  className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </label>
            </div>
          </section>
        )}

        {/* Recent Google Reviews with mandatory author attributions */}
        {lead.reviews && lead.reviews.length > 0 && (
          <section className="border-t border-slate-200 pt-5 space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Derniers avis clients Google
            </h3>
            <div className="space-y-3">
              {lead.reviews.map((rev, idx) => (
                <div
                  key={idx}
                  className="text-xs text-slate-700 space-y-1 pb-3 border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-medium text-slate-800">
                      {rev.authorUri ? (
                        <a
                          href={rev.authorUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {rev.authorName || "Client Google"}
                        </a>
                      ) : (
                        rev.authorName || "Client Google"
                      )}
                    </span>
                    <span className="tabular-nums">
                      {rev.rating ? `${rev.rating}/5` : ""}{" "}
                      {rev.relativePublishTimeDescription
                        ? `· ${rev.relativePublishTimeDescription}`
                        : ""}
                    </span>
                  </div>
                  {rev.text && <p className="leading-relaxed">{rev.text}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Mandatory Place attributions if present */}
        {lead.attributions.length > 0 && (
          <div className="text-[11px] text-slate-400 pt-2">
            Sources :{" "}
            {lead.attributions.map((a, idx) => (
              <span key={idx}>
                {idx > 0 && ", "}
                {a.providerURI ? (
                  <a
                    href={a.providerURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {a.provider}
                  </a>
                ) : (
                  a.provider
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
