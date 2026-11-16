import { useCallback, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Search, Radar, Loader2, X } from "lucide-react";
import { useAutocompleteSuggestions } from "../hooks/useAutocompleteSuggestions";
import {
  PlaceCategoryFilter,
  WebsiteFilterMode,
} from "../types/prospect";

interface ZoneSearchBarProps {
  zoneLabel: string;
  radiusMeters: number;
  onRadiusChange: (r: number) => void;
  category: PlaceCategoryFilter;
  onCategoryChange: (c: PlaceCategoryFilter) => void;
  websiteFilter: WebsiteFilterMode;
  onWebsiteFilterChange: (mode: WebsiteFilterMode) => void;
  minReviews: number;
  onMinReviewsChange: (n: number) => void;
  keyword: string;
  onKeywordChange: (k: string) => void;
  onPlaceJump: (center: { lat: number; lng: number }, label: string) => void;
  onTriggerScan: () => void;
  isScanning: boolean;
}

export function ZoneSearchBar({
  zoneLabel,
  radiusMeters,
  onRadiusChange,
  category,
  onCategoryChange,
  websiteFilter,
  onWebsiteFilterChange,
  minReviews,
  onMinReviewsChange,
  keyword,
  onKeywordChange,
  onPlaceJump,
  onTriggerScan,
  isScanning,
}: ZoneSearchBarProps) {
  const placesLib = useMapsLibrary("places");
  const [addressQuery, setAddressQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { suggestions, resetSession } = useAutocompleteSuggestions(
    addressQuery,
    { language: "fr" }
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ["location", "displayName", "formattedAddress"],
        });
        if (place.location) {
          const lat =
            typeof place.location.lat === "function"
              ? place.location.lat()
              : Number(place.location.lat);
          const lng =
            typeof place.location.lng === "function"
              ? place.location.lng()
              : Number(place.location.lng);
          const label =
            place.displayName ||
            suggestion.placePrediction.text?.text ||
            "Zone sélectionnée";
          setAddressQuery("");
          setIsOpen(false);
          resetSession();
          onPlaceJump({ lat, lng }, label);
        }
      } catch (err) {
        console.error("Autocomplete place fetch error:", err);
      }
    },
    [placesLib, onPlaceJump, resetSession]
  );

  const radiusOptions = [
    { value: 500, label: "500 m" },
    { value: 1000, label: "1 km" },
    { value: 2500, label: "2,5 km" },
    { value: 5000, label: "5 km" },
  ];

  return (
    <section
      aria-label="Contrôles de recherche de zone"
      className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 z-20"
    >
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
        {/* Zone Autocomplete Input */}
        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={addressQuery}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setAddressQuery(e.target.value);
              setIsOpen(true);
            }}
            placeholder={`Ville ou quartier (${zoneLabel})`}
            aria-label="Rechercher une ville ou un quartier"
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
          {addressQuery && (
            <button
              type="button"
              onClick={() => {
                setAddressQuery("");
                setIsOpen(false);
              }}
              aria-label="Effacer la recherche de lieu"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isOpen && suggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50 divide-y divide-slate-100"
            >
              {suggestions.map((s, idx) => {
                const text = s.placePrediction?.text?.text;
                if (!text) return null;
                return (
                  <li key={s.placePrediction?.placeId ?? idx}>
                    <button
                      type="button"
                      onClick={() => void handleSelectSuggestion(s)}
                      className="w-full text-left px-3.5 py-2.5 text-sm text-slate-800 hover:bg-slate-50 transition-colors"
                    >
                      {text}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Optional cuisine/keyword filter */}
        <div className="relative w-full sm:w-48">
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTriggerScan();
            }}
            placeholder="Mot-clé (ex: pizzeria, sushi…)"
            aria-label="Filtrer par spécialité ou mot-clé"
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
          />
        </div>

        {/* Radius segmented control */}
        <div
          role="group"
          aria-label="Rayon de recherche"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
        >
          {radiusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onRadiusChange(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                radiusMeters === opt.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category select */}
        <select
          value={category}
          onChange={(e) =>
            onCategoryChange(e.target.value as PlaceCategoryFilter)
          }
          aria-label="Catégorie d'établissement"
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 shrink-0"
        >
          <option value="restaurant">Restaurants</option>
          <option value="cafe">Cafés & Salons</option>
          <option value="bakery">Boulangeries</option>
          <option value="meal_takeaway">À emporter</option>
        </select>

        {/* Website status segmented filter */}
        <div
          role="group"
          aria-label="Filtre présence digitale"
          className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0"
        >
          <button
            type="button"
            onClick={() => onWebsiteFilterChange("no_website")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              websiteFilter === "no_website"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Aucun site web
          </button>
          <button
            type="button"
            onClick={() => onWebsiteFilterChange("no_own_site")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              websiteFilter === "no_own_site"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Sans site propre
          </button>
          <button
            type="button"
            onClick={() => onWebsiteFilterChange("all")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              websiteFilter === "all"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tous
          </button>
        </div>

        {/* Minimum review count filter */}
        <select
          value={minReviews}
          onChange={(e) => onMinReviewsChange(Number(e.target.value))}
          aria-label="Volume d'activité minimum"
          className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 shrink-0 tabular-nums"
        >
          <option value={0}>Tous volumes d&apos;avis</option>
          <option value={30}>30+ avis clients</option>
          <option value={100}>100+ avis (Actifs)</option>
          <option value={200}>200+ avis (Forte activité)</option>
        </select>
      </div>

      <button
        type="button"
        onClick={onTriggerScan}
        disabled={isScanning}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        {isScanning ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Radar className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{isScanning ? "Scan en cours…" : "Scanner la zone"}</span>
      </button>
    </section>
  );
}
