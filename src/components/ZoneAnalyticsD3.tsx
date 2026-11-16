import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { RestaurantLead } from "../types/prospect";

interface ZoneAnalyticsD3Props {
  leads: RestaurantLead[];
  zoneLabel: string;
  selectedLeadId: string | null;
  activeCuisineFilter: string | null;
  onSelectCuisineFilter: (cuisine: string | null) => void;
  onSelectLead: (lead: RestaurantLead) => void;
  onBackToMap: () => void;
}

interface CuisineAggregate {
  cuisine: string;
  none: number;
  social: number;
  own: number;
  total: number;
  avgReviews: number;
}

interface TooltipState {
  chart: "cuisine" | "scatter";
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export function ZoneAnalyticsD3({
  leads,
  zoneLabel,
  selectedLeadId,
  activeCuisineFilter,
  onSelectCuisineFilter,
  onSelectLead,
  onBackToMap,
}: ZoneAnalyticsD3Props) {
  const cuisineContainerRef = useRef<HTMLDivElement | null>(null);
  const cuisineSvgRef = useRef<SVGSVGElement | null>(null);
  const scatterContainerRef = useRef<HTMLDivElement | null>(null);
  const scatterSvgRef = useRef<SVGSVGElement | null>(null);

  const [cuisineWidth, setCuisineWidth] = useState(560);
  const [scatterWidth, setScatterWidth] = useState(560);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Observe container widths for crisp responsive D3 rendering
  useEffect(() => {
    const observers: ResizeObserver[] = [];
    if (cuisineContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setCuisineWidth(Math.floor(entry.contentRect.width));
          }
        }
      });
      obs.observe(cuisineContainerRef.current);
      observers.push(obs);
    }
    if (scatterContainerRef.current) {
      const obs = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setScatterWidth(Math.floor(entry.contentRect.width));
          }
        }
      });
      obs.observe(scatterContainerRef.current);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Aggregate real Place data by primaryTypeDisplayName
  const cuisineData = useMemo<CuisineAggregate[]>(() => {
    const groups: Record<
      string,
      {
        none: number;
        social: number;
        own: number;
        totalReviews: number;
      }
    > = {};

    for (const lead of leads) {
      const label = lead.primaryTypeDisplayName?.trim() || "Restaurant";
      if (!groups[label]) {
        groups[label] = { none: 0, social: 0, own: 0, totalReviews: 0 };
      }
      if (lead.websiteStatus === "none") groups[label].none += 1;
      else if (lead.websiteStatus === "social_or_aggregator")
        groups[label].social += 1;
      else groups[label].own += 1;
      groups[label].totalReviews += lead.userRatingCount;
    }

    return Object.entries(groups)
      .map(([cuisine, counts]) => {
        const total = counts.none + counts.social + counts.own;
        return {
          cuisine,
          none: counts.none,
          social: counts.social,
          own: counts.own,
          total,
          avgReviews: total > 0 ? Math.round(counts.totalReviews / total) : 0,
        };
      })
      .sort((a, b) => b.total - a.total || b.none - a.none)
      .slice(0, 10);
  }, [leads]);

  // Activity tier summary counts
  const activityCounts = useMemo(() => {
    let high = 0;
    let medium = 0;
    let emerging = 0;
    let highNoSite = 0;
    for (const l of leads) {
      if (l.activityTier === "high") {
        high += 1;
        if (l.websiteStatus !== "own_website") highNoSite += 1;
      } else if (l.activityTier === "medium") {
        medium += 1;
      } else {
        emerging += 1;
      }
    }
    return { high, medium, emerging, highNoSite };
  }, [leads]);

  // Chart 1: D3 Stacked Horizontal Bar Chart of Cuisine Types
  useEffect(() => {
    const svgEl = cuisineSvgRef.current;
    if (!svgEl || cuisineData.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const margin = { top: 12, right: 36, bottom: 28, left: 158 };
    const rowHeight = 32;
    const height = Math.max(220, cuisineData.length * rowHeight + margin.top + margin.bottom);
    const innerWidth = Math.max(180, cuisineWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("width", cuisineWidth).attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand<string>()
      .domain(cuisineData.map((d) => d.cuisine))
      .range([0, innerHeight])
      .padding(0.28);

    const maxTotal = d3.max(cuisineData, (d) => d.total) ?? 1;
    const x = d3
      .scaleLinear()
      .domain([0, maxTotal])
      .nice()
      .range([0, innerWidth]);

    // Gridlines
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(x.ticks(Math.min(5, maxTotal)))
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#e2e8f0")
      .attr("stroke-dasharray", "2,2");

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(Math.min(5, maxTotal))
          .tickFormat((d) => `${Math.round(Number(d))}`)
      )
      .call((axis) => axis.select(".domain").attr("stroke", "#cbd5e1"))
      .call((axis) =>
        axis
          .selectAll("text")
          .attr("fill", "#64748b")
          .attr("font-size", "11px")
          .style("font-family", "var(--font-mono)")
      );

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call((axis) => axis.select(".domain").remove())
      .call((axis) =>
        axis
          .selectAll("text")
          .attr("fill", (d) =>
            activeCuisineFilter === String(d) ? "#059669" : "#1e293b"
          )
          .attr("font-weight", (d) =>
            activeCuisineFilter === String(d) ? "700" : "500"
          )
          .attr("font-size", "12px")
          .style("cursor", "pointer")
          .text((d) => {
            const label = String(d);
            return label.length > 22 ? `${label.slice(0, 21)}…` : label;
          })
          .on("click", (_event, d) => {
            const label = String(d);
            onSelectCuisineFilter(
              activeCuisineFilter === label ? null : label
            );
          })
      );

    const stackKeys = ["none", "social", "own"] as const;
    const colorMap: Record<(typeof stackKeys)[number], string> = {
      none: "#059669",
      social: "#0d9488",
      own: "#94a3b8",
    };

    const stackedSeries = d3
      .stack<CuisineAggregate, (typeof stackKeys)[number]>()
      .keys(stackKeys)(cuisineData);

    const seriesGroups = g
      .selectAll("g.series")
      .data(stackedSeries)
      .join("g")
      .attr("class", "series")
      .attr("fill", (d) => colorMap[d.key]);

    seriesGroups
      .selectAll("rect")
      .data((d) => d)
      .join("rect")
      .attr("x", (d) => x(d[0]))
      .attr("y", (d) => y(d.data.cuisine) ?? 0)
      .attr("width", (d) => Math.max(0, x(d[1]) - x(d[0])))
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("opacity", (d) =>
        activeCuisineFilter && activeCuisineFilter !== d.data.cuisine
          ? 0.35
          : 1
      )
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        const rect = cuisineContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const row = d.data;
        const noOwnPct = Math.round(
          ((row.none + row.social) / Math.max(1, row.total)) * 100
        );
        setTooltip({
          chart: "cuisine",
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          title: row.cuisine,
          lines: [
            `Total détecté : ${row.total} établissements`,
            `Sans site propre : ${row.none + row.social} (${noOwnPct}%)`,
            `Aucun site : ${row.none} · Lien tiers : ${row.social} · Site actif : ${row.own}`,
            `Moyenne d'avis : ${row.avgReviews} avis`,
          ],
        });
      })
      .on("mousemove", (event) => {
        const rect = cuisineContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip((prev) =>
          prev
            ? {
                ...prev,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              }
            : null
        );
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_event, d) => {
        const label = d.data.cuisine;
        onSelectCuisineFilter(activeCuisineFilter === label ? null : label);
      });

    // Total counts at bar ends
    g.selectAll("text.bar-total")
      .data(cuisineData)
      .join("text")
      .attr("class", "bar-total")
      .attr("x", (d) => x(d.total) + 6)
      .attr("y", (d) => (y(d.cuisine) ?? 0) + y.bandwidth() / 2 + 4)
      .attr("fill", "#475569")
      .attr("font-size", "11px")
      .style("font-family", "var(--font-mono)")
      .text((d) => `${d.total}`);
  }, [cuisineData, cuisineWidth, activeCuisineFilter, onSelectCuisineFilter]);

  // Chart 2: D3 Activity Scatter / Bubble Plot (Reviews Volume vs Google Rating)
  useEffect(() => {
    const svgEl = scatterSvgRef.current;
    if (!svgEl || leads.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 24, bottom: 42, left: 48 };
    const height = 340;
    const innerWidth = Math.max(200, scatterWidth - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr("width", scatterWidth).attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const ratedLeads = leads.filter(
      (l) =>
        (!activeCuisineFilter ||
          (l.primaryTypeDisplayName?.trim() || "Restaurant") ===
            activeCuisineFilter)
    );

    const maxReviews = Math.max(
      250,
      d3.max(ratedLeads, (d) => d.userRatingCount) ?? 250
    );

    // Sqrt scale spreads 0..200 and 200..2000+ cleanly without log(0) issues
    const x = d3
      .scaleSqrt()
      .domain([0, maxReviews * 1.08])
      .range([0, innerWidth]);

    const minRating = Math.min(
      3.2,
      d3.min(ratedLeads, (d) => d.rating ?? 4.0) ?? 3.2
    );
    const y = d3
      .scaleLinear()
      .domain([Math.max(1, Math.floor(minRating * 2) / 2), 5.05])
      .range([innerHeight, 0]);

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, maxReviews])
      .range([5, 14]);

    // Quadrant highlight zone: High Activity (>= 150 reviews & >= 4.0★)
    const highZoneX = x(150);
    const highZoneY = y(4.0);
    if (highZoneX < innerWidth && highZoneY > 0) {
      g.append("rect")
        .attr("x", highZoneX)
        .attr("y", 0)
        .attr("width", Math.max(0, innerWidth - highZoneX))
        .attr("height", Math.max(0, highZoneY))
        .attr("fill", "#ecfdf5")
        .attr("opacity", 0.7);

      g.append("text")
        .attr("x", innerWidth - 6)
        .attr("y", 14)
        .attr("text-anchor", "end")
        .attr("fill", "#047857")
        .attr("font-size", "10px")
        .attr("font-weight", "600")
        .text("Zone Fort Potentiel (150+ avis · 4,0★+)");
    }

    // Threshold dashed lines
    if (150 <= maxReviews) {
      g.append("line")
        .attr("x1", highZoneX)
        .attr("x2", highZoneX)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#10b981")
        .attr("stroke-dasharray", "4,3")
        .attr("stroke-opacity", 0.6);
    }

    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", highZoneY)
      .attr("y2", highZoneY)
      .attr("stroke", "#10b981")
      .attr("stroke-dasharray", "4,3")
      .attr("stroke-opacity", 0.6);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d) => `${Math.round(Number(d))}`)
      )
      .call((axis) => axis.select(".domain").attr("stroke", "#cbd5e1"))
      .call((axis) =>
        axis
          .selectAll("text")
          .attr("fill", "#64748b")
          .attr("font-size", "11px")
          .style("font-family", "var(--font-mono)")
      );

    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((d) => Number(d).toFixed(1))
      )
      .call((axis) => axis.select(".domain").attr("stroke", "#cbd5e1"))
      .call((axis) =>
        axis
          .selectAll("text")
          .attr("fill", "#64748b")
          .attr("font-size", "11px")
          .style("font-family", "var(--font-mono)")
      );

    // Axis labels
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 34)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", "11px")
      .text("Volume d'avis clients (indicateur d'activité)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -36)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", "11px")
      .text("Note Google");

    const colorForLead = (l: RestaurantLead) => {
      if (l.websiteStatus === "none") return "#059669";
      if (l.websiteStatus === "social_or_aggregator") return "#0d9488";
      return "#64748b";
    };

    // Plot circles
    g.selectAll("circle.lead-dot")
      .data(ratedLeads)
      .join("circle")
      .attr("class", "lead-dot")
      .attr("cx", (d) => x(d.userRatingCount))
      .attr("cy", (d) => y(d.rating ?? 4.0))
      .attr("r", (d) => radiusScale(d.userRatingCount))
      .attr("fill", (d) => colorForLead(d))
      .attr("fill-opacity", (d) =>
        d.websiteStatus === "own_website" ? 0.5 : 0.85
      )
      .attr("stroke", (d) =>
        d.id === selectedLeadId ? "#0f172a" : "#ffffff"
      )
      .attr("stroke-width", (d) => (d.id === selectedLeadId ? 2.5 : 1.5))
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        const rect = scatterContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const statusLabel =
          d.websiteStatus === "none"
            ? "Aucun site web"
            : d.websiteStatus === "social_or_aggregator"
              ? "Lien tiers uniquement"
              : "Site web actif";
        setTooltip({
          chart: "scatter",
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          title: d.displayName,
          lines: [
            `${d.primaryTypeDisplayName || "Restaurant"} · ${statusLabel}`,
            `${d.rating !== null ? `${d.rating.toFixed(1)} ★` : "Note N/C"} · ${d.userRatingCount} avis`,
            "Cliquez pour ouvrir le dossier de prospection",
          ],
        });
      })
      .on("mousemove", (event) => {
        const rect = scatterContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip((prev) =>
          prev
            ? {
                ...prev,
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              }
            : null
        );
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", (_event, d) => {
        onSelectLead(d);
      });
  }, [
    leads,
    scatterWidth,
    selectedLeadId,
    activeCuisineFilter,
    onSelectLead,
  ]);

  if (leads.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <h1 className="font-display text-xl font-bold text-slate-900">
            Analyse graphique D3.js de la zone
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Aucun établissement n&apos;a encore été scanné. Lancez un scan dans
            Carte & Radar pour visualiser les types de cuisines et niveaux
            d&apos;activité.
          </p>
          <button
            type="button"
            onClick={onBackToMap}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            Aller au Radar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Header + Key Breakdown */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Répartition des cuisines & activité — {zoneLabel}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Visualisation D3.js des {leads.length} établissements détectés.
            Cliquez sur un type de cuisine ou un point pour filtrer ou ouvrir
            son dossier.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeCuisineFilter && (
            <button
              type="button"
              onClick={() => onSelectCuisineFilter(null)}
              className="px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              Filtre actif : {activeCuisineFilter} (Réinitialiser)
            </button>
          )}
          <button
            type="button"
            onClick={onBackToMap}
            className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Retour à la carte
          </button>
        </div>
      </div>

      {/* 4-column Activity Tier Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Fort potentiel (150+ avis)</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {activityCounts.high}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-0.5 tabular-nums">
            dont {activityCounts.highNoSite} sans site propre
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Activité régulière (40–149 avis)</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {activityCounts.medium}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Clientèle locale établie
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Émergents (&lt; 40 avis)</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {activityCounts.emerging}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Ouvertures récentes ou niches
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Catégories identifiées</div>
          <div className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {cuisineData.length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Types de restauration actifs
          </div>
        </div>
      </div>

      {/* Two D3 Charts Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Cuisine Breakdown */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Types de cuisines détectés
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Répartition par présence digitale (cliquez sur une barre pour
                filtrer)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                Aucun site
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />
                Lien tiers
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
                Site actif
              </span>
            </div>
          </div>

          <div
            ref={cuisineContainerRef}
            className="relative w-full pt-3 flex-1 min-h-[260px]"
          >
            <svg
              ref={cuisineSvgRef}
              role="img"
              aria-label="Graphique en barres D3 des types de cuisines et présence web"
              className="block overflow-visible"
            />
            {tooltip && tooltip.chart === "cuisine" && (
              <div
                className="pointer-events-none absolute z-30 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs space-y-0.5"
                style={{
                  left: Math.min(tooltip.x + 12, Math.max(0, cuisineWidth - 220)),
                  top: Math.max(8, tooltip.y - 12),
                }}
              >
                <div className="font-semibold">{tooltip.title}</div>
                {tooltip.lines.map((line, i) => (
                  <div key={i} className="text-slate-200 tabular-nums">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Chart 2: Activity Scatter Plot */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Niveau d&apos;activité vs Note Google
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chaque bulle représente un restaurant (cliquez pour ouvrir le
                dossier)
              </p>
            </div>
          </div>

          <div
            ref={scatterContainerRef}
            className="relative w-full pt-3 flex-1 min-h-[340px]"
          >
            <svg
              ref={scatterSvgRef}
              role="img"
              aria-label="Nuage de points D3 du niveau d'activité selon le volume d'avis et la note Google"
              className="block overflow-visible"
            />
            {tooltip && tooltip.chart === "scatter" && (
              <div
                className="pointer-events-none absolute z-30 bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs space-y-0.5"
                style={{
                  left: Math.min(tooltip.x + 12, Math.max(0, scatterWidth - 240)),
                  top: Math.max(8, tooltip.y - 12),
                }}
              >
                <div className="font-semibold">{tooltip.title}</div>
                {tooltip.lines.map((line, i) => (
                  <div key={i} className="text-slate-200 tabular-nums">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
