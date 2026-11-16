export type WebsiteStatus = "none" | "social_or_aggregator" | "own_website";

export type ActivityTier = "high" | "medium" | "emerging";

export type PipelineStatus =
  | "a_contacter"
  | "contacte"
  | "rdv_pris"
  | "archive";

export interface PlaceReviewSnippet {
  rating?: number | null;
  text?: string | null;
  authorName?: string | null;
  authorUri?: string | null;
  relativePublishTimeDescription?: string | null;
}

export interface PlacePhotoSnippet {
  uri: string;
  attributions: Array<{
    displayName?: string | null;
    uri?: string | null;
  }>;
}

export interface PlaceAttribution {
  provider: string;
  providerURI?: string | null;
}

export interface RestaurantLead {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating: number | null;
  userRatingCount: number;
  websiteURI: string | null;
  websiteStatus: WebsiteStatus;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  priceLevel: string | null;
  primaryType: string | null;
  primaryTypeDisplayName: string | null;
  businessStatus: string | null;
  googleMapsURI: string | null;
  distanceMeters: number | null;
  activityTier: ActivityTier;
  activityScore: number;
  weekdayDescriptions: string[];
  attributions: PlaceAttribution[];
  // Detailed fields loaded on demand via place.fetchFields
  detailsLoaded?: boolean;
  editorialSummary?: string | null;
  hasDelivery?: boolean | null;
  hasTakeout?: boolean | null;
  isReservable?: boolean | null;
  hasDineIn?: boolean | null;
  reviews?: PlaceReviewSnippet[];
  photos?: PlacePhotoSnippet[];
  // Keep reference to raw Google Place instance for on-demand fetchFields
  rawPlace?: google.maps.places.Place;
}

export interface ProspectKit {
  opportunityDiagnosis: string;
  recommendedSolutionTitle: string;
  recommendedFeatures: string[];
  estimatedImpact: string;
  bestContactWindow: string;
  emailSubject: string;
  emailBody: string;
  whatsappMessage: string;
  callScript: string;
  objections: Array<{
    objection: string;
    response: string;
  }>;
}

export interface BatchStrategy {
  zoneSummary: string;
  prioritizedTargets: Array<{
    restaurantName: string;
    priorityReason: string;
    recommendedHook: string;
    suggestedChannel: string;
  }>;
  dailyRoutineTip: string;
}

export interface SavedProspectEntry {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  primaryTypeDisplayName: string | null;
  rating: number | null;
  userRatingCount: number;
  websiteStatus: WebsiteStatus;
  nationalPhoneNumber: string | null;
  googleMapsURI: string | null;
  recipientEmail?: string;
  status: PipelineStatus;
  notes: string;
  savedAt: string;
  updatedAt?: string;
  lastGmailSentAt?: string;
  lastGmailThreadId?: string;
  lastTaskCreatedAt?: string;
  lastTaskTitle?: string;
  kit?: ProspectKit;
}

export type WebsiteFilterMode = "no_website" | "no_own_site" | "all";
export type PlaceCategoryFilter =
  | "restaurant"
  | "cafe"
  | "bakery"
  | "meal_takeaway";

const THIRD_PARTY_DOMAINS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linktr.ee",
  "ubereats.com",
  "deliveroo.",
  "just-eat.",
  "thefork.",
  "lafourchette.",
  "tripadvisor.",
  "yelp.",
  "pagesjaunes.",
  "tiktok.com",
  "maps.google.",
  "goo.gl",
];

export function classifyWebsiteStatus(
  websiteURI?: string | null
): WebsiteStatus {
  if (!websiteURI || websiteURI.trim() === "") {
    return "none";
  }
  const lower = websiteURI.toLowerCase();
  if (THIRD_PARTY_DOMAINS.some((domain) => lower.includes(domain))) {
    return "social_or_aggregator";
  }
  return "own_website";
}

export function computeActivityPotential(
  rating: number | null,
  userRatingCount: number
): { tier: ActivityTier; score: number } {
  const count = userRatingCount || 0;
  const r = rating ?? 0;

  // Transparent activity index derived solely from review volume and rating
  const volumeComponent = Math.min(70, Math.round(Math.log10(count + 1) * 25));
  const ratingComponent = r > 0 ? Math.round((r / 5) * 30) : 0;
  const score = Math.min(100, volumeComponent + ratingComponent);

  if ((count >= 150 && r >= 4.0) || count >= 280) {
    return { tier: "high", score };
  }
  if (count >= 40 && r >= 3.8) {
    return { tier: "medium", score };
  }
  return { tier: "emerging", score };
}

export function formatPriceLevel(priceLevel?: string | null): string {
  switch (priceLevel) {
    case "INEXPENSIVE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return "€";
    case "MODERATE":
    case "PRICE_LEVEL_MODERATE":
      return "€€";
    case "EXPENSIVE":
    case "PRICE_LEVEL_EXPENSIVE":
      return "€€€";
    case "VERY_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "€€€€";
    default:
      return "";
  }
}

export function formatDistance(meters: number | null): string {
  if (meters === null || Number.isNaN(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function computeHaversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}
