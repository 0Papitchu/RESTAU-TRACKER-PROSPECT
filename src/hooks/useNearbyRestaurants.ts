import { useCallback, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  PlaceCategoryFilter,
  RestaurantLead,
  classifyWebsiteStatus,
  computeActivityPotential,
  computeHaversineMeters,
} from "../types/prospect";
import { isQuotaError } from "./useAutocompleteSuggestions";

export interface ScanOptions {
  center: { lat: number; lng: number };
  radiusMeters: number;
  category: PlaceCategoryFilter;
  rankBy: "POPULARITY" | "DISTANCE";
  keyword?: string;
}

export function useNearbyRestaurants() {
  const placesLib = useMapsLibrary("places");
  const [leads, setLeads] = useState<RestaurantLead[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);

  const mapPlaceToLead = useCallback(
    (
      place: google.maps.places.Place,
      originCenter: { lat: number; lng: number }
    ): RestaurantLead | null => {
      if (!place.location || !place.id) return null;
      const lat =
        typeof place.location.lat === "function"
          ? place.location.lat()
          : Number(place.location.lat);
      const lng =
        typeof place.location.lng === "function"
          ? place.location.lng()
          : Number(place.location.lng);

      const rating = typeof place.rating === "number" ? place.rating : null;
      const userRatingCount =
        typeof place.userRatingCount === "number" ? place.userRatingCount : 0;
      const websiteURI = place.websiteURI ?? null;
      const websiteStatus = classifyWebsiteStatus(websiteURI);
      const { tier, score } = computeActivityPotential(rating, userRatingCount);

      const openingHours = (
        place as unknown as {
          regularOpeningHours?: { weekdayDescriptions?: string[] };
          openingHours?: { weekdayDescriptions?: string[] };
        }
      );
      const weekdayDescriptions =
        openingHours.regularOpeningHours?.weekdayDescriptions ??
        openingHours.openingHours?.weekdayDescriptions ??
        [];

      const attributions = (place.attributions ?? []).map((a) => ({
        provider: a.provider ?? "Google",
        providerURI: a.providerURI ?? null,
      }));

      return {
        id: place.id,
        displayName: place.displayName ?? "Établissement sans nom",
        formattedAddress: place.formattedAddress ?? "",
        location: { lat, lng },
        rating,
        userRatingCount,
        websiteURI,
        websiteStatus,
        nationalPhoneNumber: place.nationalPhoneNumber ?? null,
        internationalPhoneNumber: place.internationalPhoneNumber ?? null,
        priceLevel: place.priceLevel ? String(place.priceLevel) : null,
        primaryType: place.primaryType ?? null,
        primaryTypeDisplayName: place.primaryTypeDisplayName ?? null,
        businessStatus: place.businessStatus ? String(place.businessStatus) : null,
        googleMapsURI: place.googleMapsURI ?? null,
        distanceMeters: computeHaversineMeters(originCenter, { lat, lng }),
        activityTier: tier,
        activityScore: score,
        weekdayDescriptions,
        attributions,
        rawPlace: place,
      };
    },
    []
  );

  const scanArea = useCallback(
    async (options: ScanOptions): Promise<RestaurantLead[]> => {
      if (!placesLib) return [];

      setIsScanning(true);
      setScanError(null);

      const clampedRadius = Math.min(Math.max(options.radiusMeters, 150), 50000);
      const baseFields = [
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "rating",
        "userRatingCount",
        "websiteURI",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "priceLevel",
        "primaryType",
        "primaryTypeDisplayName",
        "businessStatus",
        "googleMapsURI",
      ];

      try {
        const { Place, SearchNearbyRankPreference } = placesLib;
        let places: google.maps.places.Place[] = [];

        const trimmedKeyword = options.keyword?.trim();
        if (trimmedKeyword) {
          const res = await Place.searchByText({
            textQuery: trimmedKeyword,
            fields: baseFields,
            includedType: options.category,
            locationBias: {
              center: options.center,
              radius: clampedRadius,
            },
            maxResultCount: 20,
            language: "fr",
            region: "fr",
          });
          places = res.places ?? [];
        } else {
          const res = await Place.searchNearby({
            fields: baseFields,
            locationRestriction: {
              center: options.center,
              radius: clampedRadius,
            },
            includedPrimaryTypes: [options.category],
            maxResultCount: 20,
            rankPreference:
              options.rankBy === "DISTANCE"
                ? SearchNearbyRankPreference.DISTANCE
                : SearchNearbyRankPreference.POPULARITY,
            language: "fr",
            region: "fr",
          });
          places = res.places ?? [];
        }

        const mapped = places
          .map((p) => mapPlaceToLead(p, options.center))
          .filter((item): item is RestaurantLead => item !== null)
          .filter((item) => item.businessStatus !== "CLOSED_PERMANENTLY");

        setLeads(mapped);
        setHasScannedOnce(true);
        return mapped;
      } catch (err) {
        console.error("Places scan error:", err);
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        }
        setScanError(
          "Impossible de charger les établissements pour cette zone. Réessayez ou élargissez le rayon."
        );
        return [];
      } finally {
        setIsScanning(false);
      }
    },
    [placesLib, mapPlaceToLead]
  );

  const loadPlaceDetails = useCallback(
    async (lead: RestaurantLead): Promise<RestaurantLead> => {
      if (lead.detailsLoaded || !lead.rawPlace) {
        return lead;
      }

      try {
        await lead.rawPlace.fetchFields({
          fields: [
            "editorialSummary",
            "reviews",
            "photos",
            "openingHours",
            "hasDelivery",
            "hasTakeout",
            "isReservable",
            "hasDineIn",
          ],
        });

        const raw = lead.rawPlace as google.maps.places.Place & {
          regularOpeningHours?: { weekdayDescriptions?: string[] };
          openingHours?: { weekdayDescriptions?: string[] };
        };

        const photos = (raw.photos ?? []).slice(0, 5).map((photo) => ({
          uri: photo.getURI({ maxWidth: 800, maxHeight: 520 }),
          attributions: (photo.authorAttributions ?? []).map((a) => ({
            displayName: a.displayName ?? null,
            uri: a.uri ?? null,
          })),
        }));

        const reviews = (raw.reviews ?? []).slice(0, 4).map((rev) => ({
          rating: rev.rating ?? null,
          text: rev.text ?? null,
          authorName: rev.authorAttribution?.displayName ?? null,
          authorUri: rev.authorAttribution?.uri ?? null,
          relativePublishTimeDescription:
            rev.relativePublishTimeDescription ?? null,
        }));

        const weekdayDescriptions =
          raw.regularOpeningHours?.weekdayDescriptions ??
          raw.openingHours?.weekdayDescriptions ??
          lead.weekdayDescriptions;

        const updated: RestaurantLead = {
          ...lead,
          detailsLoaded: true,
          editorialSummary: raw.editorialSummary ?? null,
          hasDelivery: raw.hasDelivery ?? null,
          hasTakeout: raw.hasTakeout ?? null,
          isReservable: raw.isReservable ?? null,
          hasDineIn: raw.hasDineIn ?? null,
          weekdayDescriptions,
          photos,
          reviews,
        };

        setLeads((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );

        return updated;
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        }
        return lead;
      }
    },
    []
  );

  return {
    leads,
    isScanning,
    scanError,
    hasScannedOnce,
    scanArea,
    loadPlaceDetails,
  };
}
