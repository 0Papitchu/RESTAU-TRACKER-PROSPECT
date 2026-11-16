import express from "express";
import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export interface ProspectPayload {
  id: string;
  displayName: string;
  formattedAddress: string;
  primaryTypeDisplayName?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: string | null;
  websiteStatus: "none" | "social_or_aggregator" | "own_website";
  websiteURI?: string | null;
  nationalPhoneNumber?: string | null;
  distanceMeters?: number | null;
  hasDelivery?: boolean | null;
  hasTakeout?: boolean | null;
  isReservable?: boolean | null;
  hasDineIn?: boolean | null;
  editorialSummary?: string | null;
  reviews?: Array<{ rating?: number; text?: string }>;
  weekdayDescriptions?: string[];
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/config", (_req, res) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "";
    res.json({
      mapsApiKey,
      hasGemini: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/prospect/prepare", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Clé API Gemini indisponible. Vérifiez la configuration de GEMINI_API_KEY.",
      });
      return;
    }

    const { restaurant, offerAngle } = req.body as {
      restaurant?: ProspectPayload;
      offerAngle?: string;
    };

    if (!restaurant || !restaurant.displayName) {
      res.status(400).json({ error: "Données du restaurant manquantes." });
      return;
    }

    const reviewSnippets = (restaurant.reviews ?? [])
      .slice(0, 3)
      .map(
        (r) => `- Note ${r.rating ?? "?"}/5 : "${(r.text ?? "").slice(0, 220)}"`
      )
      .join("\n");

    const presenceLabel =
      restaurant.websiteStatus === "none"
        ? "Aucun site web ni application détectée sur Google Maps"
        : restaurant.websiteStatus === "social_or_aggregator"
          ? `Lien tiers uniquement (${restaurant.websiteURI}) — aucun site web propriétaire`
          : `Site web détecté (${restaurant.websiteURI})`;

    const prompt = `Tu es un consultant senior en stratégie digitale pour la restauration locale.
Prépare un dossier de prospection commerciale concret, persuasif et prêt à l'emploi en français pour l'établissement suivant (données réelles issues de Google Maps) :

- Nom : ${restaurant.displayName}
- Catégorie : ${restaurant.primaryTypeDisplayName || "Restaurant"}
- Adresse : ${restaurant.formattedAddress}
- Note Google : ${restaurant.rating ?? "Non communiquée"} / 5
- Volume d'avis clients : ${restaurant.userRatingCount ?? 0} avis
- Niveau de prix : ${restaurant.priceLevel || "Non renseigné"}
- Présence web : ${presenceLabel}
- Téléphone : ${restaurant.nationalPhoneNumber || "Non renseigné"}
- Services : Sur place=${restaurant.hasDineIn ? "Oui" : "N/C"}, À emporter=${restaurant.hasTakeout ? "Oui" : "N/C"}, Livraison=${restaurant.hasDelivery ? "Oui" : "N/C"}, Réservable=${restaurant.isReservable ? "Oui" : "N/C"}
- Résumé Google : ${restaurant.editorialSummary || "Non renseigné"}
- Horaires : ${(restaurant.weekdayDescriptions ?? []).slice(0, 3).join(" | ") || "Non renseignés"}
${reviewSnippets ? `- Extraits d'avis clients :\n${reviewSnippets}` : ""}

Angle d'offre souhaité par le prospecteur : ${offerAngle || "Création de site vitrine + réservation directe et menu QR / Click & Collect sans commission"}.

Règles strictes :
- Base-toi uniquement sur les données fournies ci-dessus, n'invente pas de faux chiffres de chiffre d'affaires ni de faits non fournis.
- Sois précis, pragmatique, humain et crédible (pas de jargon robotique).
- L'email et le SMS/WhatsApp doivent pouvoir être envoyés immédiatement avec personnalisation réelle sur le nom, la note et le volume d'avis.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction:
            "Tu rédiges des dossiers de prospection B2B pour démarcher des restaurateurs indépendants en français.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              opportunityDiagnosis: {
                type: Type.STRING,
                description:
                  "Analyse en 2-3 phrases du potentiel d'activité et du manque à gagner sans site/app propriétaire.",
              },
              recommendedSolutionTitle: {
                type: Type.STRING,
                description:
                  "Titre court de la solution recommandée (ex: Site Vitrine & Réservation Directe).",
              },
              recommendedFeatures: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3 à 4 fonctionnalités concrètes adaptées à cet établissement.",
              },
              estimatedImpact: {
                type: Type.STRING,
                description:
                  "Bénéfices opérationnels concrets attendus (réservations directes, réduction des commissions plateformes, visibilité locale).",
              },
              bestContactWindow: {
                type: Type.STRING,
                description:
                  "Meilleur créneau horaire pour contacter le gérant hors coups de feu, basé sur les horaires ou les usages restauration.",
              },
              emailSubject: {
                type: Type.STRING,
                description: "Objet d'email court et percutant.",
              },
              emailBody: {
                type: Type.STRING,
                description:
                  "Corps de l'email prêt à envoyer, structuré et personnalisé.",
              },
              whatsappMessage: {
                type: Type.STRING,
                description:
                  "Message court (3-4 phrases max) prêt pour WhatsApp ou SMS.",
              },
              callScript: {
                type: Type.STRING,
                description:
                  "Script d'accroche téléphonique de 30 secondes pour décrocher un rendez-vous de 10 minutes.",
              },
              objections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    objection: { type: Type.STRING },
                    response: { type: Type.STRING },
                  },
                  required: ["objection", "response"],
                },
                description:
                  "2 objections fréquentes et leurs réponses adaptées.",
              },
            },
            required: [
              "opportunityDiagnosis",
              "recommendedSolutionTitle",
              "recommendedFeatures",
              "estimatedImpact",
              "bestContactWindow",
              "emailSubject",
              "emailBody",
              "whatsappMessage",
              "callScript",
              "objections",
            ],
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw);
      res.json({ kit: parsed });
    } catch (err) {
      console.error("Gemini prospect prepare error:", err);
      const message =
        err instanceof Error ? err.message : "Erreur lors de la génération IA.";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/prospect/batch-brief", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "Clé API Gemini indisponible. Vérifiez la configuration de GEMINI_API_KEY.",
      });
      return;
    }

    const { leads, offerAngle, zoneLabel } = req.body as {
      leads?: ProspectPayload[];
      offerAngle?: string;
      zoneLabel?: string;
    };

    if (!Array.isArray(leads) || leads.length === 0) {
      res
        .status(400)
        .json({ error: "Aucun restaurant à analyser dans cette zone." });
      return;
    }

    const summaryList = leads
      .slice(0, 8)
      .map(
        (l, idx) =>
          `${idx + 1}. ${l.displayName} | ${l.primaryTypeDisplayName || "Restaurant"} | ${l.rating ?? "?"}/5 (${l.userRatingCount ?? 0} avis) | Présence: ${l.websiteStatus === "none" ? "Aucun site" : l.websiteStatus === "social_or_aggregator" ? `Lien tiers (${l.websiteURI})` : "Site existant"} | Tel: ${l.nationalPhoneNumber || "N/C"} | Adresse: ${l.formattedAddress}`
      )
      .join("\n");

    const prompt = `Voici les meilleurs prospects restaurants identifiés dans la zone "${zoneLabel || "Zone scannée"}" :
${summaryList}

Offre proposée : ${offerAngle || "Site web, réservation directe et Click & Collect sans commission"}.

Prépare un plan de prospection terrain & téléphonique priorisé en français pour ces établissements.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          systemInstruction:
            "Tu es un directeur commercial spécialisé dans la digitalisation des commerces de proximité et restaurants.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              zoneSummary: {
                type: Type.STRING,
                description:
                  "Synthèse stratégique de la zone (dynamisme, type d'établissements sans site, opportunité globale).",
              },
              prioritizedTargets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    restaurantName: { type: Type.STRING },
                    priorityReason: { type: Type.STRING },
                    recommendedHook: { type: Type.STRING },
                    suggestedChannel: { type: Type.STRING },
                  },
                  required: [
                    "restaurantName",
                    "priorityReason",
                    "recommendedHook",
                    "suggestedChannel",
                  ],
                },
              },
              dailyRoutineTip: {
                type: Type.STRING,
                description:
                  "Conseil pratique de séquençage de tournée ou d'appels sur cette zone.",
              },
            },
            required: ["zoneSummary", "prioritizedTargets", "dailyRoutineTip"],
          },
        },
      });

      const raw = (response.text ?? "{}").trim();
      const parsed = JSON.parse(raw);
      res.json({ strategy: parsed });
    } catch (err) {
      console.error("Gemini batch brief error:", err);
      const message =
        err instanceof Error ? err.message : "Erreur lors de l'analyse de zone.";
      res.status(500).json({ error: message });
    }
  });

  return app;
}
