import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ListTodo,
  Loader2,
  X,
} from "lucide-react";
import { RestaurantLead, SavedProspectEntry } from "../types/prospect";
import { useGoogleWorkspaceAuth } from "../contexts/GoogleWorkspaceAuthContext";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  TasksAuthExpiredError,
  createFollowUpGoogleTask,
} from "../services/tasksService";

interface ProspectTasksFollowUpProps {
  lead: RestaurantLead;
  savedEntry?: SavedProspectEntry;
  onTaskCreated: (taskTitle: string, createdAtIso: string) => void;
}

function defaultDueDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultNotes(lead: RestaurantLead, savedEntry?: SavedProspectEntry): string {
  const lines: string[] = [
    `Établissement : ${lead.displayName}`,
    `Adresse : ${lead.formattedAddress}`,
  ];
  if (lead.nationalPhoneNumber) {
    lines.push(`Téléphone : ${lead.nationalPhoneNumber}`);
  }
  if (savedEntry?.recipientEmail) {
    lines.push(`E-mail : ${savedEntry.recipientEmail}`);
  }
  if (lead.googleMapsURI) {
    lines.push(`Google Maps : ${lead.googleMapsURI}`);
  }
  if (savedEntry?.notes) {
    lines.push(`Notes : ${savedEntry.notes}`);
  }
  return lines.join("\n");
}

export function ProspectTasksFollowUp({
  lead,
  savedEntry,
  onTaskCreated,
}: ProspectTasksFollowUpProps) {
  const {
    accessToken,
    needsAuth,
    isSigningIn,
    signIn,
    invalidateToken,
  } = useGoogleWorkspaceAuth();

  const [title, setTitle] = useState(
    () => `Relancer ${lead.displayName}`
  );
  const [dueDate, setDueDate] = useState(() => defaultDueDatePlusDays(3));
  const [notes, setNotes] = useState(() => buildDefaultNotes(lead, savedEntry));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);

  useEffect(() => {
    setTitle(`Relancer ${lead.displayName}`);
    setDueDate(defaultDueDatePlusDays(3));
    setNotes(buildDefaultNotes(lead, savedEntry));
    setConfirmOpen(false);
    setError(null);
    setCreatedBanner(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const applyPreset = (preset: "call" | "email" | "visit") => {
    if (preset === "call") {
      setTitle(`Appeler ${lead.displayName} (hors coup de feu)`);
      setDueDate(defaultDueDatePlusDays(2));
    } else if (preset === "email") {
      setTitle(`Relance e-mail : ${lead.displayName}`);
      setDueDate(defaultDueDatePlusDays(4));
    } else {
      setTitle(`Visite terrain : ${lead.displayName}`);
      setDueDate(defaultDueDatePlusDays(5));
    }
  };

  const handleOpenConfirm = () => {
    setError(null);
    if (!title.trim()) {
      setError("Veuillez saisir un titre de tâche.");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (!accessToken) return;
    setIsCreating(true);
    setError(null);

    try {
      const result = await createFollowUpGoogleTask({
        accessToken,
        title: title.trim(),
        notes,
        dueDate: dueDate || undefined,
      });
      const nowIso = new Date().toISOString();
      onTaskCreated(result.task.title, nowIso);
      setCreatedBanner(
        `Tâche « ${result.task.title} » ajoutée à la liste ${result.taskList.title}.`
      );
      setConfirmOpen(false);
    } catch (err) {
      if (err instanceof TasksAuthExpiredError) {
        invalidateToken();
      }
      setConfirmOpen(false);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer la tâche dans Google Tasks."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const hasToken = Boolean(accessToken) && !needsAuth;

  return (
    <section
      aria-label="Planifier une relance Google Tasks"
      className="border-t border-slate-200 pt-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">
            Relance &amp; Google Tasks
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Créez un rappel de suivi dans votre liste{" "}
            <span className="font-medium text-slate-800">
              RestoRadar Prospection
            </span>
            .
          </p>
        </div>
        {savedEntry?.lastTaskTitle && (
          <span className="text-[11px] text-emerald-700 font-medium whitespace-nowrap shrink-0">
            Dernière tâche planifiée
          </span>
        )}
      </div>

      {!hasToken ? (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
          <p className="text-xs text-slate-600">
            Connectez votre compte Google pour enregistrer des rappels de
            relance directement dans Google Tasks.
          </p>
          <GoogleSignInButton
            onClick={() => void signIn()}
            disabled={isSigningIn}
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset("call")}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap"
            >
              Appel J+2
            </button>
            <button
              type="button"
              onClick={() => applyPreset("email")}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap"
            >
              Relance e-mail J+4
            </button>
            <button
              type="button"
              onClick={() => applyPreset("visit")}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap"
            >
              Visite terrain J+5
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="gtask-title"
                className="block text-[11px] font-semibold text-slate-500 mb-1"
              >
                Titre du rappel
              </label>
              <input
                id="gtask-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="gtask-due"
                className="block text-[11px] font-semibold text-slate-500 mb-1"
              >
                Échéance
              </label>
              <div className="relative">
                <input
                  id="gtask-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="gtask-notes"
              className="block text-[11px] font-semibold text-slate-500 mb-1"
            >
              Notes de la tâche
            </label>
            <textarea
              id="gtask-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenConfirm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <ListTodo className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Planifier dans Google Tasks</span>
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {createdBanner && (
        <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{createdBanner}</span>
        </div>
      )}

      {/* Explicit Confirmation Modal for creating a Google Task */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gtask-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <h4
                id="gtask-confirm-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Confirmer la tâche Google Tasks
              </h4>
              <button
                type="button"
                onClick={() => !isCreating && setConfirmOpen(false)}
                aria-label="Fermer la confirmation"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600">
                Une nouvelle tâche va être ajoutée à votre liste Google Tasks{" "}
                <span className="font-semibold text-slate-900">
                  RestoRadar Prospection
                </span>
                .
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-20 shrink-0">
                    Titre
                  </span>
                  <span className="font-semibold text-slate-900">{title}</span>
                </div>
                {dueDate && (
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold text-slate-500 w-20 shrink-0">
                      Échéance
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-800 tabular-nums">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {new Date(`${dueDate}T09:00:00`).toLocaleDateString(
                        "fr-FR"
                      )}
                    </span>
                  </div>
                )}
              </div>

              {notes.trim() && (
                <div className="max-h-36 overflow-y-auto bg-white border border-slate-200 rounded-lg p-3 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {notes}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isCreating}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCreate()}
                disabled={isCreating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {isCreating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ListTodo className="w-3.5 h-3.5" />
                )}
                <span>
                  {isCreating ? "Création…" : "Confirmer et créer"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
