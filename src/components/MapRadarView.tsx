import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useMap,
} from "@vis.gl/react-google-maps";
import { RefreshCw, ExternalLink } from "lucide-react";
import {
  RestaurantLead,
  computeHaversineMeters,
} from "../types/prospect";

interface MapRadarViewProps {
  center: { lat: number; lng: number };
  radiusMeters: number;
  leads: RestaurantLead[];
  selectedLeadId: string | null;
  onSelectLead: (lead: RestaurantLead) => void;
  onScanCenterChange: (newCenter: { lat: number; lng: number }) => void;
  isScanning: boolean;
}

function SearchRadiusCircle({
  center,
  radiusMeters,
}: {
  center: { lat: number; lng: number };
  radiusMeters: number;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center,
        radius: radiusMeters,
        strokeColor: "#059669",
        strokeOpacity: 0.45,
        strokeWeight: 1.5,
        fillColor: "#059669",
        fillOpacity: 0.05,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusMeters);
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center, radiusMeters]);

  return null;
}

function LeadMarker({
  lead,
  isSelected,
  onSelect,
}: {
  lead: RestaurantLead;
  isSelected: boolean;
  onSelect: (lead: RestaurantLead) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const isNoWebsite = lead.websiteStatus === "none";
  const isSocialOnly = lead.websiteStatus === "social_or_aggregator";
  const isHighPotential = lead.activityTier === "high";

  const markerBg = isNoWebsite
    ? isHighPotential
      ? "bg-emerald-600 text-white border-emerald-800"
      : "bg-amber-500 text-white border-amber-700"
    : isSocialOnly
      ? "bg-teal-600 text-white border-teal-800"
      : "bg-slate-600 text-white border-slate-800 opacity-75";

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={lead.location}
        title={lead.displayName}
        zIndex={isSelected ? 50 : isNoWebsite && isHighPotential ? 30 : 10}
        onClick={() => onSelect(lead)}
      >
        <div
          className={`px-2 py-1 rounded-md border text-xs font-mono font-semibold tabular-nums shadow-sm transition-transform cursor-pointer ${markerBg} ${
            isSelected ? "scale-115 ring-2 ring-slate-900 ring-offset-1" : "hover:scale-105"
          }`}
        >
          {lead.rating ? `${lead.rating.toFixed(1)}★` : "Nouveau"}
          {lead.userRatingCount > 0 && (
            <span className="ml-1 opacity-90 font-normal">
              ({lead.userRatingCount})
            </span>
          )}
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={270}
          onCloseClick={() => onSelect(lead)}
        >
          <div className="p-1 text-slate-900 space-y-1.5">
            <div className="font-semibold text-sm leading-snug">
              {lead.displayName}
            </div>
            <div className="text-xs text-slate-600">
              {lead.primaryTypeDisplayName || "Restaurant"} ·{" "}
              {lead.rating ? `${lead.rating.toFixed(1)} ★` : "N/C"} (
              {lead.userRatingCount} avis)
            </div>
            <div className="text-xs font-medium">
              {lead.websiteStatus === "none" ? (
                <span className="text-emerald-700">
                  Aucun site web détecté
                </span>
              ) : lead.websiteStatus === "social_or_aggregator" ? (
                <span className="text-teal-700">
                  Lien social / plateforme uniquement
                </span>
              ) : (
                <span className="text-slate-500">Site web déjà actif</span>
              )}
            </div>
            {lead.googleMapsURI && (
              <a
                href={lead.googleMapsURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline pt-0.5"
              >
                <span>Voir sur Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function MapRadarView({
  center,
  radiusMeters,
  leads,
  selectedLeadId,
  onSelectLead,
  onScanCenterChange,
  isScanning,
}: MapRadarViewProps) {
  const map = useMap();
  const [cameraCenter, setCameraCenter] = useState(center);
  const [hasMovedFar, setHasMovedFar] = useState(false);

  // Pan map smoothly when target center updates externally
  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    setHasMovedFar(false);
  }, [map, center]);

  // Adjust zoom cleanly when radius changes
  useEffect(() => {
    if (!map) return;
    const zoomForRadius =
      radiusMeters <= 600
        ? 16
        : radiusMeters <= 1200
          ? 15
          : radiusMeters <= 3000
            ? 14
            : 13;
    map.setZoom(zoomForRadius);
  }, [map, radiusMeters]);

  const handleCameraChanged = useCallback(
    (ev: { detail: { center: { lat: number; lng: number } } }) => {
      const next = ev.detail.center;
      setCameraCenter(next);
      const dist = computeHaversineMeters(center, next);
      setHasMovedFar(dist > Math.max(250, radiusMeters * 0.35));
    },
    [center, radiusMeters]
  );

  return (
    <div className="relative w-full h-full min-h-[520px] bg-slate-100">
      <GoogleMap
        defaultCenter={center}
        defaultZoom={15}
        mapId="DEMO_MAP_ID"
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        clickableIcons={false}
        onCameraChanged={handleCameraChanged}
        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
        style={{ width: "100%", height: "100%" }}
      >
        <SearchRadiusCircle center={center} radiusMeters={radiusMeters} />
        {leads.map((lead) => (
          <LeadMarker
            key={lead.id}
            lead={lead}
            isSelected={lead.id === selectedLeadId}
            onSelect={onSelectLead}
          />
        ))}
      </GoogleMap>

      {hasMovedFar && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            disabled={isScanning}
            onClick={() => {
              setHasMovedFar(false);
              onScanCenterChange(cameraCenter);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg shadow-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-600 ${isScanning ? "animate-spin" : ""}`}
            />
            <span>Rechercher dans cette zone</span>
          </button>
        </div>
      )}

      {/* Map legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 flex flex-wrap items-center gap-4 shadow-sm pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
          Sans site · Fort potentiel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
          Sans site · Émergent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />
          Réseau / plateforme seul
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" />
          Site web actif
        </span>
      </div>
    </div>
  );
}
