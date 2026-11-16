import { LocateFixed, Loader2, LogOut, Mail } from "lucide-react";
import { useGoogleWorkspaceAuth } from "../contexts/GoogleWorkspaceAuthContext";
import { GoogleSignInButton } from "./GoogleSignInButton";

export type ActiveTab =
  | "radar"
  | "opportunities"
  | "analytics"
  | "shortlist"
  | "strategy";

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onGeolocate: () => void;
  isGeolocating: boolean;
  shortlistCount: number;
  noWebsiteCount: number;
}

export function TopBar({
  activeTab,
  onSelectTab,
  onGeolocate,
  isGeolocating,
  shortlistCount,
  noWebsiteCount,
}: TopBarProps) {
  const { user, accessToken, needsAuth, isSigningIn, signIn, signOut } =
    useGoogleWorkspaceAuth();
  const isGoogleReady = Boolean(accessToken) && !needsAuth;

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: "radar", label: "Carte & Radar" },
    {
      id: "opportunities",
      label:
        noWebsiteCount > 0
          ? `Sans site (${noWebsiteCount})`
          : "Pépites sans site",
    },
    { id: "analytics", label: "Analyse D3" },
    {
      id: "shortlist",
      label: shortlistCount > 0 ? `Shortlist (${shortlistCount})` : "Shortlist",
    },
    { id: "strategy", label: "Plan d'attaque" },
  ];

  return (
    <>
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-8 shrink-0 z-30">
        <button
          type="button"
          onClick={() => onSelectTab("radar")}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
        >
          RestoRadar
        </button>

        <nav
          aria-label="Navigation principale"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded ${
                  isActive
                    ? "text-slate-900"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-emerald-600" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          {isGoogleReady ? (
            <div className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg max-w-[220px]">
              <Mail className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span className="truncate" title={user?.email || "Gmail connecté"}>
                {user?.email || "Gmail connecté"}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Déconnecter Google"
                title="Déconnecter Google"
                className="text-emerald-700 hover:text-slate-900 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="hidden lg:block">
              <GoogleSignInButton
                onClick={() => void signIn()}
                disabled={isSigningIn}
                className="!h-9 !text-xs"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onGeolocate}
            disabled={isGeolocating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {isGeolocating ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{isGeolocating ? "Localisation…" : "Autour de moi"}</span>
          </button>
        </div>
      </header>

      <nav
        aria-label="Navigation mobile"
        className="md:hidden bg-white border-b border-slate-200 px-4 flex items-center gap-4 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? "border-emerald-600 text-slate-900"
                  : "border-transparent text-slate-500"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
