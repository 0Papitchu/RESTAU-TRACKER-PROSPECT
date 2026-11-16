import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HardDrive,
  ListTodo,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  BatchStrategy,
  PipelineStatus,
  RestaurantLead,
  SavedProspectEntry,
  formatPriceLevel,
} from "../types/prospect";
import { useGoogleWorkspaceAuth } from "../contexts/GoogleWorkspaceAuthContext";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  GmailAuthExpiredError,
  GmailReplyStatus,
  checkProspectGmailReplies,
} from "../services/gmailService";
import {
  GoogleTaskItem,
  GoogleTaskList,
  TasksAuthExpiredError,
  completeGoogleTask,
  listRestoRadarTasks,
} from "../services/tasksService";

interface ShortlistViewProps {
  entries: SavedProspectEntry[];
  isCloudSynced: boolean;
  cloudError: string | null;
  onUpdateStatus: (placeId: string, status: PipelineStatus) => void;
  onRemoveEntry: (placeId: string) => void;
  onOpenFromSaved: (placeId: string) => void;
}

export function ShortlistView({
  entries,
  isCloudSynced,
  cloudError,
  onUpdateStatus,
  onRemoveEntry,
  onOpenFromSaved,
}: ShortlistViewProps) {
  const {
    accessToken,
    needsAuth,
    isSigningIn,
    signIn,
    invalidateToken,
  } = useGoogleWorkspaceAuth();
  const hasGoogleToken = Boolean(accessToken) && !needsAuth;

  const [statusFilter, setStatusFilter] = useState<PipelineStatus | "all">(
    "all"
  );

  // Gmail reply tracking map keyed by placeId
  const [replyMap, setReplyMap] = useState<Record<string, GmailReplyStatus>>(
    {}
  );
  const [isCheckingAllReplies, setIsCheckingAllReplies] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Google Tasks state
  const [taskList, setTaskList] = useState<GoogleTaskList | null>(null);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [pendingCompleteTask, setPendingCompleteTask] =
    useState<GoogleTaskItem | null>(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  const filtered = entries.filter((e) =>
    statusFilter === "all" ? true : e.status === statusFilter
  );

  const loadTasks = useCallback(async () => {
    if (!accessToken || needsAuth) return;
    setIsLoadingTasks(true);
    setTasksError(null);
    try {
      const res = await listRestoRadarTasks(accessToken);
      setTaskList(res.taskList);
      setTasks(res.tasks);
    } catch (err) {
      if (err instanceof TasksAuthExpiredError) {
        invalidateToken();
      }
      setTasksError(
        err instanceof Error
          ? err.message
          : "Impossible de charger Google Tasks."
      );
    } finally {
      setIsLoadingTasks(false);
    }
  }, [accessToken, needsAuth, invalidateToken]);

  useEffect(() => {
    if (hasGoogleToken) {
      void loadTasks();
    } else {
      setTasks([]);
      setTaskList(null);
    }
  }, [hasGoogleToken, loadTasks]);

  const handleCheckAllReplies = async () => {
    if (!accessToken) return;
    const targets = entries.filter(
      (e) => e.recipientEmail || e.lastGmailThreadId
    );
    if (targets.length === 0) {
      setReplyError(
        "Aucun prospect n'a encore d'e-mail destinataire ou d'envoi Gmail enregistré."
      );
      return;
    }

    setIsCheckingAllReplies(true);
    setReplyError(null);
    try {
      const updates: Record<string, GmailReplyStatus> = { ...replyMap };
      for (const item of targets.slice(0, 15)) {
        const res = await checkProspectGmailReplies({
          accessToken,
          recipientEmail: item.recipientEmail,
          threadId: item.lastGmailThreadId,
        });
        updates[item.placeId] = res;
      }
      setReplyMap(updates);
    } catch (err) {
      if (err instanceof GmailAuthExpiredError) {
        invalidateToken();
      }
      setReplyError(
        err instanceof Error
          ? err.message
          : "Impossible de vérifier les réponses Gmail."
      );
    } finally {
      setIsCheckingAllReplies(false);
    }
  };

  const handleConfirmCompleteTask = async () => {
    if (!pendingCompleteTask || !taskList || !accessToken) return;
    setIsCompletingTask(true);
    setTasksError(null);
    try {
      await completeGoogleTask({
        accessToken,
        taskListId: taskList.id,
        taskId: pendingCompleteTask.id,
      });
      setTasks((prev) => prev.filter((t) => t.id !== pendingCompleteTask.id));
      setPendingCompleteTask(null);
    } catch (err) {
      if (err instanceof TasksAuthExpiredError) {
        invalidateToken();
      }
      setPendingCompleteTask(null);
      setTasksError(
        err instanceof Error
          ? err.message
          : "Impossible de marquer la tâche comme terminée."
      );
    } finally {
      setIsCompletingTask(false);
    }
  };

  const exportMarkdown = () => {
    const lines: string[] = [
      `# Dossier de prospection RestoRadar (${new Date().toLocaleDateString("fr-FR")})`,
      "",
    ];
    filtered.forEach((entry, i) => {
      lines.push(`## ${i + 1}. ${entry.displayName}`);
      lines.push(`- Statut : ${entry.status}`);
      lines.push(`- Adresse : ${entry.formattedAddress}`);
      if (entry.nationalPhoneNumber) {
        lines.push(`- Téléphone : ${entry.nationalPhoneNumber}`);
      }
      if (entry.recipientEmail) {
        lines.push(`- E-mail : ${entry.recipientEmail}`);
      }
      if (entry.notes) {
        lines.push(`- Notes : ${entry.notes}`);
      }
      if (entry.kit) {
        lines.push(`- Diagnostic : ${entry.kit.opportunityDiagnosis}`);
        lines.push(`- Objet Email : ${entry.kit.emailSubject}`);
        lines.push(`- Message WhatsApp : ${entry.kit.whatsappMessage}`);
      }
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prospection-restoradar.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const escapeCsv = (val: unknown) => {
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    };
    const header = [
      "Nom",
      "Catégorie",
      "Adresse",
      "Note",
      "Avis",
      "Statut web",
      "Téléphone",
      "Email",
      "Statut pipeline",
      "Dernier envoi Gmail",
      "Dernière tâche",
      "Notes",
      "Google Maps",
    ];
    const rows = filtered.map((e) => [
      e.displayName,
      e.primaryTypeDisplayName || "Restaurant",
      e.formattedAddress,
      e.rating ?? "",
      e.userRatingCount,
      e.websiteStatus,
      e.nationalPhoneNumber || "",
      e.recipientEmail || "",
      e.status,
      e.lastGmailSentAt || "",
      e.lastTaskTitle || "",
      e.notes || "",
      e.googleMapsURI || "",
    ]);

    const csvContent =
      "\uFEFF" +
      [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prospection-restoradar.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Ma Shortlist de Prospection
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-600">
            <span>
              Suivez vos prospects sélectionnés, vos e-mails Gmail et vos
              relances.
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
              {isCloudSynced ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">
                    Synchronisé sur Firestore
                  </span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                  <span>Stockage local navigateur</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: "all", label: "Tous" },
                { id: "a_contacter", label: "À contacter" },
                { id: "contacte", label: "Contactés" },
                { id: "rdv_pris", label: "RDV pris" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {hasGoogleToken && entries.length > 0 && (
            <button
              type="button"
              onClick={() => void handleCheckAllReplies()}
              disabled={isCheckingAllReplies}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isCheckingAllReplies ? "animate-spin" : ""
                }`}
              />
              <span>
                {isCheckingAllReplies
                  ? "Vérification Gmail…"
                  : "Vérifier réponses Gmail"}
              </span>
            </button>
          )}

          {filtered.length > 0 && (
            <>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Exporter CSV</span>
              </button>
              <button
                type="button"
                onClick={exportMarkdown}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exporter (.md)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {cloudError && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Synchronisation Firestore : {cloudError}</span>
        </div>
      )}

      {replyError && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{replyError}</span>
        </div>
      )}

      {/* Google Tasks Follow-up Panel */}
      <section
        aria-label="Relances Google Tasks"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Tâches de relance Google Tasks
            </h2>
            {taskList && (
              <span className="text-xs text-slate-500">
                · Liste : {taskList.title}
              </span>
            )}
          </div>

          {hasGoogleToken && (
            <button
              type="button"
              onClick={() => void loadTasks()}
              disabled={isLoadingTasks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoadingTasks ? "animate-spin" : ""}`}
              />
              <span>Actualiser</span>
            </button>
          )}
        </div>

        {!hasGoogleToken ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-600">
              Connectez votre compte Google pour synchroniser votre shortlist
              dans Firestore, suivre les réponses Gmail et gérer vos relances
              Google Tasks.
            </p>
            <GoogleSignInButton
              onClick={() => void signIn()}
              disabled={isSigningIn}
              className="!h-9 !text-xs"
            />
          </div>
        ) : tasksError ? (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
            {tasksError}
          </div>
        ) : isLoadingTasks && tasks.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Chargement des tâches de relance…</span>
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-slate-500">
            Aucune tâche de relance ouverte dans Google Tasks. Ouvrez la fiche
            d&apos;un restaurant pour en planifier une.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {task.title}
                  </div>
                  {task.notes && (
                    <div className="text-slate-500 truncate max-w-xl mt-0.5">
                      {task.notes.replace(/\n+/g, " · ")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {task.due && (
                    <span className="text-slate-600 tabular-nums whitespace-nowrap">
                      Échéance :{" "}
                      {new Date(task.due).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingCompleteTask(task)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Terminer</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="font-display text-base font-semibold text-slate-900">
            Aucun prospect enregistré dans cette vue
          </p>
          <p className="text-sm text-slate-600">
            Cliquez sur l&apos;icône signet d&apos;un restaurant sans site web
            dans l&apos;onglet Carte & Radar pour l&apos;ajouter ici.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Établissement</th>
                  <th className="py-3 px-4">Activité Google</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Suivi Gmail / IA</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((entry) => {
                  const reply = replyMap[entry.placeId];
                  return (
                    <tr
                      key={entry.placeId}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {entry.displayName}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {entry.formattedAddress}
                        </div>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-xs text-slate-700">
                        {entry.rating ? `${entry.rating.toFixed(1)} ★` : "N/C"} ·{" "}
                        {entry.userRatingCount} avis
                      </td>
                      <td className="py-3 px-4 tabular-nums text-xs text-slate-700">
                        <div>{entry.nationalPhoneNumber || "—"}</div>
                        {entry.recipientEmail && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                            {entry.recipientEmail}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={entry.status}
                          onChange={(e) =>
                            onUpdateStatus(
                              entry.placeId,
                              e.target.value as PipelineStatus
                            )
                          }
                          className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        >
                          <option value="a_contacter">À contacter</option>
                          <option value="contacte">Contacté</option>
                          <option value="rdv_pris">RDV pris</option>
                          <option value="archive">Archivé</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-xs space-y-0.5">
                        {reply?.hasReply ? (
                          <div className="font-semibold text-emerald-700">
                            Réponse Gmail reçue
                          </div>
                        ) : entry.lastGmailSentAt ? (
                          <div className="text-slate-700 tabular-nums">
                            Envoyé le{" "}
                            {new Date(entry.lastGmailSentAt).toLocaleDateString(
                              "fr-FR"
                            )}
                          </div>
                        ) : null}
                        {entry.kit ? (
                          <div className="font-medium text-emerald-700 truncate max-w-[200px]">
                            Dossier : {entry.kit.recommendedSolutionTitle}
                          </div>
                        ) : !entry.lastGmailSentAt && !reply?.hasReply ? (
                          <span className="text-slate-400">Non préparé</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {entry.googleMapsURI && (
                            <a
                              href={entry.googleMapsURI}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded border border-slate-200"
                              title="Voir sur Google Maps"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenFromSaved(entry.placeId)}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
                          >
                            Ouvrir
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveEntry(entry.placeId)}
                            aria-label={`Supprimer ${entry.displayName}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded border border-slate-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation dialog before marking Google Task completed */}
      {pendingCompleteTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-task-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3
                id="complete-task-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Terminer la tâche Google Tasks
              </h3>
              <button
                type="button"
                onClick={() => !isCompletingTask && setPendingCompleteTask(null)}
                aria-label="Fermer"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-xs text-slate-600 space-y-2">
              <p>
                Confirmez-vous vouloir marquer cette tâche comme terminée dans
                Google Tasks ?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900">
                {pendingCompleteTask.title}
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingCompleteTask(null)}
                disabled={isCompletingTask}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmCompleteTask()}
                disabled={isCompletingTask}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg"
              >
                {isCompletingTask && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StrategyViewProps {
  zoneLabel: string;
  topNoWebsiteLeads: RestaurantLead[];
  onSelectLead: (lead: RestaurantLead) => void;
}

export function BatchStrategyView({
  zoneLabel,
  topNoWebsiteLeads,
  onSelectLead,
}: StrategyViewProps) {
  const [offerAngle, setOfferAngle] = useState(
    "Site vitrine + Réservation directe & Menu QR sans commission"
  );
  const [strategy, setStrategy] = useState<BatchStrategy | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateBatch = async () => {
    if (topNoWebsiteLeads.length === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/prospect/batch-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneLabel,
          offerAngle,
          leads: topNoWebsiteLeads.slice(0, 8).map((l) => ({
            id: l.id,
            displayName: l.displayName,
            formattedAddress: l.formattedAddress,
            primaryTypeDisplayName: l.primaryTypeDisplayName,
            rating: l.rating,
            userRatingCount: l.userRatingCount,
            priceLevel: formatPriceLevel(l.priceLevel),
            websiteStatus: l.websiteStatus,
            websiteURI: l.websiteURI,
            nationalPhoneNumber: l.nationalPhoneNumber,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'analyse de zone.");
      }
      setStrategy(data.strategy);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur de génération du plan."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              Plan d&apos;attaque sur la zone : {zoneLabel}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              {topNoWebsiteLeads.length > 0
                ? `${topNoWebsiteLeads.length} restaurants sans site web identifiés dans le scan actuel. Priorisez vos prises de contact selon leur volume d'activité.`
                : "Scannez d'abord une zone dans Carte & Radar pour identifier les restaurants sans site web à fort potentiel."}
            </p>
          </div>
          <button
            type="button"
            disabled={topNoWebsiteLeads.length === 0 || isGenerating}
            onClick={() => void handleGenerateBatch()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {isGenerating
                ? "Préparation du plan…"
                : "Générer le plan d'attaque IA"}
            </span>
          </button>
        </div>

        <div>
          <label
            htmlFor="batch-offer-input"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Positionnement de votre offre
          </label>
          <input
            id="batch-offer-input"
            type="text"
            value={offerAngle}
            onChange={(e) => setOfferAngle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        {error && (
          <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {strategy && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
            <h2 className="font-display text-base font-bold text-slate-900">
              Synthèse de la zone
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              {strategy.zoneSummary}
            </p>
            <div className="pt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <span className="font-semibold">Conseil terrain : </span>
              {strategy.dailyRoutineTip}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Cibles priorisées à démarcher en premier
              </h2>
            </div>
            <div className="divide-y divide-slate-200">
              {strategy.prioritizedTargets.map((target, idx) => {
                const matchingLead = topNoWebsiteLeads.find(
                  (l) =>
                    l.displayName.toLowerCase() ===
                    target.restaurantName.toLowerCase()
                );
                return (
                  <div key={idx} className="p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-display text-base font-semibold text-slate-900">
                        {idx + 1}. {target.restaurantName}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-emerald-700">
                          Canal conseillé : {target.suggestedChannel}
                        </span>
                        {matchingLead && (
                          <button
                            type="button"
                            onClick={() => onSelectLead(matchingLead)}
                            className="px-3 py-1 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md"
                          >
                            Préparer le dossier
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        Pourquoi maintenant :{" "}
                      </span>
                      {target.priorityReason}
                    </p>
                    <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <span className="text-xs font-semibold text-slate-500 block mb-0.5">
                        Accroche recommandée
                      </span>
                      « {target.recommendedHook} »
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
