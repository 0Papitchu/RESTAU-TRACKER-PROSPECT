import { useCallback, useEffect, useMemo, useState } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { AlertCircle, Loader2 } from "lucide-react";
import { TopBar, ActiveTab } from "./components/TopBar";
import { ZoneSearchBar } from "./components/ZoneSearchBar";
import { MapRadarView } from "./components/MapRadarView";
import { LeadListPanel } from "./components/LeadListPanel";
import { ProspectDetailDrawer } from "./components/ProspectDetailDrawer";
import {
  BatchStrategyView,
  ShortlistView,
} from "./components/ShortlistAndStrategyView";
import { ZoneAnalyticsD3 } from "./components/ZoneAnalyticsD3";
import { useNearbyRestaurants } from "./hooks/useNearbyRestaurants";
import {
  PipelineStatus,
  PlaceCategoryFilter,
  ProspectKit,
  RestaurantLead,
  SavedProspectEntry,
  WebsiteFilterMode,
} from "./types/prospect";

const STORAGE_KEY = "restoradar_shortlist_v1";
const DEFAULT_CENTER = { lat: 48.8584, lng: 2.347 }; // Paris centre (Châtelet / Marais)

function loadSavedShortlist(): Record<string, SavedProspectEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SavedProspectEntry>;
  } catch {
    return {};
  }
}

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""
  );
  const [configLoaded, setConfigLoaded] = useState(
    Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", onQuotaExceeded);
    return () =>
      window.removeEventListener("gmp-quota-exceeded", onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: { mapsApiKey?: string }) => {
        if (data.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
      })
      .catch((err) => {
        console.error("Failed to load runtime config:", err);
      })
      .finally(() => {
        setConfigLoaded(true);
      });
  }, [mapsApiKey]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{" "}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{" "}
            for instructions to update your account.
          </span>
        </div>
      )}

      {!configLoaded ? (
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-600 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Initialisation de Google Maps Platform…</span>
        </div>
      ) : !mapsApiKey ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-2 text-center">
            <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
            <h1 className="font-display text-lg font-bold text-slate-900">
              Clé Google Maps Platform requise
            </h1>
            <p className="text-sm text-slate-600">
              Activez Google Maps Platform dans les paramètres de votre projet
              ou configurez la variable{" "}
              <code className="font-mono text-xs">VITE_GOOGLE_MAPS_API_KEY</code>.
            </p>
          </div>
        </div>
      ) : (
        <APIProvider
          apiKey={mapsApiKey}
          libraries={["places", "marker", "geometry", "core"]}
          language="fr"
          region="FR"
        >
          <Workspace />
        </APIProvider>
      )}
    </div>
  );
}

function Workspace() {
  const placesLib = useMapsLibrary("places");
  const [activeTab, setActiveTab] = useState<ActiveTab>("radar");
  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    DEFAULT_CENTER
  );
  const [zoneLabel, setZoneLabel] = useState("Paris Centre");
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [category, setCategory] = useState<PlaceCategoryFilter>("restaurant");
  const [websiteFilter, setWebsiteFilter] =
    useState<WebsiteFilterMode>("no_own_site");
  const [minReviews, setMinReviews] = useState(30);
  const [keyword, setKeyword] = useState("");
  const [activeCuisineFilter, setActiveCuisineFilter] = useState<string | null>(
    null
  );
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [savedShortlist, setSavedShortlist] = useState<
    Record<string, SavedProspectEntry>
  >(() => loadSavedShortlist());

  const {
    leads,
    isScanning,
    scanError,
    hasScannedOnce,
    scanArea,
    loadPlaceDetails,
  } = useNearbyRestaurants();

  // Persist shortlist in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedShortlist));
    } catch {
      // Ignore quota errors on localStorage
    }
  }, [savedShortlist]);

  const runScan = useCallback(
    async (
      targetCenter: { lat: number; lng: number },
      opts?: { radius?: number; cat?: PlaceCategoryFilter; kw?: string }
    ) => {
      setActiveCuisineFilter(null);
      await scanArea({
        center: targetCenter,
        radiusMeters: opts?.radius ?? radiusMeters,
        category: opts?.cat ?? category,
        rankBy: "POPULARITY",
        keyword: opts?.kw ?? keyword,
      });
    },
    [scanArea, radiusMeters, category, keyword]
  );

  // Initial automatic scan once Google Places library is ready
  useEffect(() => {
    if (placesLib && !hasScannedOnce && !isScanning) {
      void runScan(center);
    }
  }, [placesLib, hasScannedOnce, isScanning, runScan, center]);

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoNotice(
        "La géolocalisation n'est pas prise en charge par votre navigateur."
      );
      return;
    }
    setIsGeolocating(true);
    setGeoNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextCenter = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setCenter(nextCenter);
        setZoneLabel("Ma position actuelle");
        setIsGeolocating(false);
        setActiveTab("radar");
        void runScan(nextCenter);
      },
      () => {
        setIsGeolocating(false);
        setGeoNotice(
          "Position refusée ou indisponible. Saisissez une ville ou un quartier dans la barre de recherche."
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [runScan]);

  const handlePlaceJump = useCallback(
    (nextCenter: { lat: number; lng: number }, label: string) => {
      setCenter(nextCenter);
      setZoneLabel(label);
      setActiveTab("radar");
      void runScan(nextCenter);
    },
    [runScan]
  );

  const handleScanCenterChange = useCallback(
    (newCenter: { lat: number; lng: number }) => {
      setCenter(newCenter);
      setZoneLabel("Zone personnalisée");
      void runScan(newCenter);
    },
    [runScan]
  );

  const handleSelectLead = useCallback(
    async (lead: RestaurantLead, openDrawer = true) => {
      setSelectedLeadId(lead.id);
      if (openDrawer) {
        setDrawerOpen(true);
      }
      if (!lead.detailsLoaded) {
        setIsLoadingDetails(true);
        await loadPlaceDetails(lead);
        setIsLoadingDetails(false);
      }
    },
    [loadPlaceDetails]
  );

  const handleToggleSave = useCallback(
    (lead: RestaurantLead, kit?: ProspectKit) => {
      setSavedShortlist((prev) => {
        const next = { ...prev };
        if (next[lead.id]) {
          delete next[lead.id];
        } else {
          next[lead.id] = {
            placeId: lead.id,
            displayName: lead.displayName,
            formattedAddress: lead.formattedAddress,
            primaryTypeDisplayName: lead.primaryTypeDisplayName,
            rating: lead.rating,
            userRatingCount: lead.userRatingCount,
            websiteStatus: lead.websiteStatus,
            nationalPhoneNumber: lead.nationalPhoneNumber,
            googleMapsURI: lead.googleMapsURI,
            status: "a_contacter",
            notes: "",
            savedAt: new Date().toISOString(),
            kit,
          };
        }
        return next;
      });
    },
    []
  );

  const handleSaveKit = useCallback(
    (lead: RestaurantLead, kit: ProspectKit) => {
      setSavedShortlist((prev) => {
        const existing = prev[lead.id];
        return {
          ...prev,
          [lead.id]: existing
            ? { ...existing, kit }
            : {
                placeId: lead.id,
                displayName: lead.displayName,
                formattedAddress: lead.formattedAddress,
                primaryTypeDisplayName: lead.primaryTypeDisplayName,
                rating: lead.rating,
                userRatingCount: lead.userRatingCount,
                websiteStatus: lead.websiteStatus,
                nationalPhoneNumber: lead.nationalPhoneNumber,
                googleMapsURI: lead.googleMapsURI,
                status: "a_contacter",
                notes: "",
                savedAt: new Date().toISOString(),
                kit,
              },
        };
      });
    },
    []
  );

  const handleUpdateStatus = useCallback(
    (placeId: string, status: PipelineStatus) => {
      setSavedShortlist((prev) => {
        const item = prev[placeId];
        if (!item) return prev;
        return { ...prev, [placeId]: { ...item, status } };
      });
    },
    []
  );

  const handleUpdateNotes = useCallback((placeId: string, notes: string) => {
    setSavedShortlist((prev) => {
      const item = prev[placeId];
      if (!item) return prev;
      return { ...prev, [placeId]: { ...item, notes } };
    });
  }, []);

  const handleRemoveSaved = useCallback((placeId: string) => {
    setSavedShortlist((prev) => {
      const next = { ...prev };
      delete next[placeId];
      return next;
    });
  }, []);

  // Compute filtered & sorted leads (No-website & high-activity first)
  const filteredLeads = useMemo(() => {
    const effectiveWebsiteFilter =
      activeTab === "opportunities" ? "no_own_site" : websiteFilter;

    return leads
      .filter((l) => {
        if (effectiveWebsiteFilter === "no_website") {
          if (l.websiteStatus !== "none") return false;
        } else if (effectiveWebsiteFilter === "no_own_site") {
          if (l.websiteStatus === "own_website") return false;
        }
        if (l.userRatingCount < minReviews) return false;
        if (activeCuisineFilter) {
          const cuisine = l.primaryTypeDisplayName?.trim() || "Restaurant";
          if (cuisine !== activeCuisineFilter) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Prioritize no-website first, then activityScore descending
        const rankA =
          a.websiteStatus === "none"
            ? 2
            : a.websiteStatus === "social_or_aggregator"
              ? 1
              : 0;
        const rankB =
          b.websiteStatus === "none"
            ? 2
            : b.websiteStatus === "social_or_aggregator"
              ? 1
              : 0;
        if (rankA !== rankB) return rankB - rankA;
        return b.activityScore - a.activityScore;
      });
  }, [leads, activeTab, websiteFilter, minReviews, activeCuisineFilter]);

  const noWebsiteLeads = useMemo(
    () => leads.filter((l) => l.websiteStatus !== "own_website"),
    [leads]
  );

  const highPotentialNoSiteCount = useMemo(
    () =>
      noWebsiteLeads.filter((l) => l.activityTier === "high").length,
    [noWebsiteLeads]
  );

  const savedIdsMap = useMemo(() => {
    const dict: Record<string, boolean> = {};
    for (const id of Object.keys(savedShortlist)) {
      dict[id] = true;
    }
    return dict;
  }, [savedShortlist]);

  const selectedLead = useMemo<RestaurantLead | null>(() => {
    if (!selectedLeadId) return null;
    const live = leads.find((l) => l.id === selectedLeadId);
    if (live) return live;
    const saved = savedShortlist[selectedLeadId];
    if (!saved) return null;
    return {
      id: saved.placeId,
      displayName: saved.displayName,
      formattedAddress: saved.formattedAddress,
      location: center,
      rating: saved.rating,
      userRatingCount: saved.userRatingCount,
      websiteURI: null,
      websiteStatus: saved.websiteStatus,
      nationalPhoneNumber: saved.nationalPhoneNumber,
      internationalPhoneNumber: saved.nationalPhoneNumber,
      priceLevel: null,
      primaryType: null,
      primaryTypeDisplayName: saved.primaryTypeDisplayName,
      businessStatus: "OPERATIONAL",
      googleMapsURI: saved.googleMapsURI,
      distanceMeters: null,
      activityTier: "high",
      activityScore: 80,
      weekdayDescriptions: [],
      attributions: [],
    };
  }, [leads, selectedLeadId, savedShortlist, center]);

  const savedEntriesList = useMemo(
    () =>
      Object.values(savedShortlist).sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt)
      ),
    [savedShortlist]
  );

  return (
    <>
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onGeolocate={handleGeolocate}
        isGeolocating={isGeolocating}
        shortlistCount={savedEntriesList.length}
        noWebsiteCount={noWebsiteLeads.length}
      />

      {geoNotice && (
        <div className="bg-slate-900 text-white text-xs px-6 py-2 flex items-center justify-between">
          <span>{geoNotice}</span>
          <button
            type="button"
            onClick={() => setGeoNotice(null)}
            className="underline ml-4"
          >
            Fermer
          </button>
        </div>
      )}

      {(activeTab === "radar" || activeTab === "opportunities") && (
        <>
          <ZoneSearchBar
            zoneLabel={zoneLabel}
            radiusMeters={radiusMeters}
            onRadiusChange={(r) => {
              setRadiusMeters(r);
              void runScan(center, { radius: r });
            }}
            category={category}
            onCategoryChange={(c) => {
              setCategory(c);
              void runScan(center, { cat: c });
            }}
            websiteFilter={
              activeTab === "opportunities" ? "no_own_site" : websiteFilter
            }
            onWebsiteFilterChange={(mode) => {
              if (activeTab === "opportunities" && mode === "all") {
                setActiveTab("radar");
              }
              setWebsiteFilter(mode);
            }}
            minReviews={minReviews}
            onMinReviewsChange={setMinReviews}
            keyword={keyword}
            onKeywordChange={setKeyword}
            onPlaceJump={handlePlaceJump}
            onTriggerScan={() => void runScan(center)}
            isScanning={isScanning}
          />

          {/* Compact 4-metric workspace strip */}
          <div className="bg-white border-b border-slate-200 px-6 py-2.5 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="flex items-baseline justify-between lg:justify-start lg:gap-2">
              <span className="text-slate-500">Zone analysée :</span>
              <span className="font-semibold text-slate-900 truncate">
                {zoneLabel}
              </span>
            </div>
            <div className="flex items-baseline justify-between lg:justify-start lg:gap-2 tabular-nums">
              <span className="text-slate-500">Établissements scannés :</span>
              <span className="font-mono font-semibold text-slate-900">
                {leads.length}
              </span>
            </div>
            <div className="flex items-baseline justify-between lg:justify-start lg:gap-2 tabular-nums">
              <span className="text-slate-500">Sans site propre :</span>
              <span className="font-mono font-semibold text-emerald-700">
                {noWebsiteLeads.length} ({highPotentialNoSiteCount} fort
                potentiel)
              </span>
            </div>
            <div className="flex items-baseline justify-between lg:justify-start lg:gap-3 tabular-nums">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-500">Affichés :</span>
                <span className="font-mono font-semibold text-slate-900">
                  {filteredLeads.length}
                </span>
                {activeCuisineFilter && (
                  <button
                    type="button"
                    onClick={() => setActiveCuisineFilter(null)}
                    className="text-emerald-700 underline hover:text-emerald-800 ml-1"
                  >
                    ({activeCuisineFilter} ×)
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("analytics")}
                className="text-emerald-700 font-medium hover:underline whitespace-nowrap ml-auto"
              >
                Graphiques D3 →
              </button>
            </div>
          </div>

          {/* Main Split Workspace: List + Map */}
          <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
            <section
              aria-label="Liste des restaurants identifiés"
              className="lg:col-span-5 xl:col-span-4 bg-white border-r border-slate-200 overflow-y-auto max-h-[calc(100vh-195px)]"
            >
              <LeadListPanel
                leads={filteredLeads}
                totalScanned={leads.length}
                selectedLeadId={selectedLeadId}
                savedIds={savedIdsMap}
                isScanning={isScanning}
                scanError={scanError}
                onSelectLead={(lead) => void handleSelectLead(lead, true)}
                onToggleSave={(lead) => handleToggleSave(lead)}
                onOpenPrepare={(lead) => void handleSelectLead(lead, true)}
              />
            </section>

            <section
              aria-label="Carte interactive des prospects"
              className="lg:col-span-7 xl:col-span-8 h-[520px] lg:h-[calc(100vh-195px)]"
            >
              <MapRadarView
                center={center}
                radiusMeters={radiusMeters}
                leads={filteredLeads}
                selectedLeadId={selectedLeadId}
                onSelectLead={(lead) => void handleSelectLead(lead, true)}
                onScanCenterChange={handleScanCenterChange}
                isScanning={isScanning}
              />
            </section>
          </main>
        </>
      )}

      {activeTab === "analytics" && (
        <main className="flex-1">
          <ZoneAnalyticsD3
            leads={leads}
            zoneLabel={zoneLabel}
            selectedLeadId={selectedLeadId}
            activeCuisineFilter={activeCuisineFilter}
            onSelectCuisineFilter={setActiveCuisineFilter}
            onSelectLead={(lead) => void handleSelectLead(lead, true)}
            onBackToMap={() => setActiveTab("radar")}
          />
        </main>
      )}

      {activeTab === "shortlist" && (
        <main className="flex-1">
          <ShortlistView
            entries={savedEntriesList}
            onUpdateStatus={handleUpdateStatus}
            onRemoveEntry={handleRemoveSaved}
            onOpenFromSaved={(placeId) => {
              const found = leads.find((l) => l.id === placeId);
              setActiveTab("radar");
              if (found) {
                void handleSelectLead(found, true);
              } else if (savedShortlist[placeId]) {
                setSelectedLeadId(placeId);
                setDrawerOpen(true);
              }
            }}
          />
        </main>
      )}

      {activeTab === "strategy" && (
        <main className="flex-1">
          <BatchStrategyView
            zoneLabel={zoneLabel}
            topNoWebsiteLeads={[...noWebsiteLeads].sort(
              (a, b) => b.activityScore - a.activityScore
            )}
            onSelectLead={(lead) => {
              setActiveTab("radar");
              void handleSelectLead(lead, true);
            }}
          />
        </main>
      )}

      {/* Slide-over Prospect Preparation Drawer */}
      {drawerOpen && selectedLead && (
        <ProspectDetailDrawer
          lead={selectedLead}
          savedEntry={savedShortlist[selectedLead.id]}
          isLoadingDetails={isLoadingDetails}
          onClose={() => setDrawerOpen(false)}
          onToggleSave={handleToggleSave}
          onSaveKit={handleSaveKit}
          onUpdateStatus={handleUpdateStatus}
          onUpdateNotes={handleUpdateNotes}
        />
      )}
    </>
  );
}
