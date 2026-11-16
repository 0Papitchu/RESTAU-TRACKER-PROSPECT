import {
  Bookmark,
  BookmarkCheck,
  FileText,
  Globe,
  Phone,
  Sparkles,
} from "lucide-react";
import {
  RestaurantLead,
  formatDistance,
  formatPriceLevel,
} from "../types/prospect";

interface LeadListPanelProps {
  leads: RestaurantLead[];
  totalScanned: number;
  selectedLeadId: string | null;
  savedIds: Record<string, boolean>;
  isScanning: boolean;
  scanError: string | null;
  onSelectLead: (lead: RestaurantLead) => void;
  onToggleSave: (lead: RestaurantLead) => void;
  onOpenPrepare: (lead: RestaurantLead) => void;
}

export function LeadListPanel({
  leads,
  totalScanned,
  selectedLeadId,
  savedIds,
  isScanning,
  scanError,
  onSelectLead,
  onToggleSave,
  onOpenPrepare,
}: LeadListPanelProps) {
  if (scanError) {
    return (
      <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 m-4 rounded-lg">
        {scanError}
      </div>
    );
  }

  if (isScanning) {
    return (
      <div className="divide-y divide-slate-200">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="p-4 animate-pulse space-y-2.5">
            <div className="h-4 bg-slate-200 rounded w-3/5" />
            <div className="h-3 bg-slate-100 rounded w-4/5" />
            <div className="h-3 bg-slate-100 rounded w-2/5" />
          </div>
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="font-display text-base font-semibold text-slate-900">
          {totalScanned === 0
            ? "Aucun résultat chargé pour le moment"
            : "Aucun établissement ne correspond aux filtres"}
        </p>
        <p className="text-sm text-slate-600 max-w-sm mx-auto">
          {totalScanned === 0
            ? "Déplacez la carte ou cliquez sur Scanner la zone pour analyser les restaurants à proximité."
            : `${totalScanned} établissements ont été trouvés dans la zone, mais aucun ne répond simultanément à vos critères actuels. Élargissez le rayon ou incluez « Sans site propre ».`}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {leads.map((lead) => {
        const isSelected = lead.id === selectedLeadId;
        const isSaved = Boolean(savedIds[lead.id]);
        const price = formatPriceLevel(lead.priceLevel);
        const dist = formatDistance(lead.distanceMeters);

        const statusText =
          lead.websiteStatus === "none"
            ? "Aucun site web"
            : lead.websiteStatus === "social_or_aggregator"
              ? "Lien social / plateforme seul"
              : "Site web existant";

        const statusColor =
          lead.websiteStatus === "none"
            ? "text-emerald-700"
            : lead.websiteStatus === "social_or_aggregator"
              ? "text-teal-700"
              : "text-slate-500";

        const potentialLabel =
          lead.activityTier === "high"
            ? "Fort potentiel d'activité"
            : lead.activityTier === "medium"
              ? "Activité régulière"
              : "Activité émergente";

        return (
          <article
            key={lead.id}
            className={`p-4 transition-colors cursor-pointer ${
              isSelected
                ? "bg-emerald-50/60"
                : "bg-white hover:bg-slate-50"
            }`}
            onClick={() => onSelectLead(lead)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
                    {lead.displayName}
                  </h3>
                  {dist && (
                    <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                      {dist}
                    </span>
                  )}
                </div>

                {/* Unboxed metadata with typographic separators */}
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
                  <span>{lead.primaryTypeDisplayName || "Restaurant"}</span>
                  {lead.rating !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-800">
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
                </div>

                <div className="text-xs text-slate-500 truncate">
                  {lead.formattedAddress}
                </div>

                <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={`font-semibold ${statusColor}`}>
                    {statusText}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    /
                  </span>
                  <span
                    className={
                      lead.activityTier === "high"
                        ? "font-medium text-slate-900"
                        : "text-slate-600"
                    }
                  >
                    {potentialLabel}
                  </span>
                  {lead.nationalPhoneNumber && (
                    <>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-600 tabular-nums">
                        <Phone className="w-3 h-3" aria-hidden="true" />
                        {lead.nationalPhoneNumber}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(lead);
                }}
                aria-label={
                  isSaved
                    ? "Retirer de la shortlist"
                    : "Ajouter à la shortlist"
                }
                className={`p-2 rounded-lg border transition-colors shrink-0 ${
                  isSaved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-900"
                }`}
              >
                {isSaved ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {lead.websiteURI ? (
                <a
                  href={lead.websiteURI}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 truncate max-w-[200px]"
                >
                  <Globe className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {lead.websiteURI.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                </a>
              ) : (
                <span className="text-xs text-slate-400">
                  Aucune URL enregistrée
                </span>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPrepare(lead);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {lead.websiteStatus === "own_website" ? (
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Préparer le dossier</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
