export class TasksAuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TasksAuthExpiredError";
  }
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: "needsAction" | "completed";
  updated?: string;
  webViewLink?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

const DEFAULT_TASK_LIST_TITLE = "RestoRadar Prospection";

async function parseTasksError(res: Response): Promise<never> {
  let detail = "";
  try {
    const json = (await res.json()) as {
      error?: { message?: string };
    };
    detail = json?.error?.message || "";
  } catch {
    // Ignore parse error
  }

  if (res.status === 401) {
    throw new TasksAuthExpiredError(
      "Votre session Google Tasks a expiré. Veuillez vous reconnecter avec Google."
    );
  }
  if (res.status === 403) {
    throw new TasksAuthExpiredError(
      detail ||
        "Autorisation Google Tasks insuffisante. Veuillez vous reconnecter pour accorder l'accès à Google Tasks."
    );
  }

  throw new Error(detail || `Erreur Google Tasks (HTTP ${res.status}).`);
}

export async function getOrCreateRestoRadarTaskList(
  accessToken: string
): Promise<GoogleTaskList> {
  const listRes = await fetch(
    "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=50",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!listRes.ok) {
    await parseTasksError(listRes);
  }

  const data = (await listRes.json()) as {
    items?: Array<{ id: string; title: string }>;
  };
  const existing = (data.items ?? []).find(
    (item) =>
      item.title.trim().toLowerCase() === DEFAULT_TASK_LIST_TITLE.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  const createRes = await fetch(
    "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: DEFAULT_TASK_LIST_TITLE }),
    }
  );

  if (!createRes.ok) {
    await parseTasksError(createRes);
  }

  const created = (await createRes.json()) as { id: string; title: string };
  return created;
}

export async function listRestoRadarTasks(
  accessToken: string
): Promise<{ taskList: GoogleTaskList; tasks: GoogleTaskItem[] }> {
  const taskList = await getOrCreateRestoRadarTaskList(accessToken);

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      taskList.id
    )}/tasks?showCompleted=false&showHidden=false&maxResults=50`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    await parseTasksError(res);
  }

  const data = (await res.json()) as {
    items?: GoogleTaskItem[];
  };
  const tasks = (data.items ?? []).sort((a, b) => {
    const dueA = a.due ? Date.parse(a.due) : Number.MAX_SAFE_INTEGER;
    const dueB = b.due ? Date.parse(b.due) : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });

  return { taskList, tasks };
}

export async function createFollowUpGoogleTask(params: {
  accessToken: string;
  title: string;
  notes?: string;
  dueDate?: string; // YYYY-MM-DD
}): Promise<{ taskList: GoogleTaskList; task: GoogleTaskItem }> {
  const title = params.title.trim();
  if (!title) {
    throw new Error("Le titre de la tâche est requis.");
  }

  const taskList = await getOrCreateRestoRadarTaskList(params.accessToken);
  const payload: Record<string, string> = {
    title,
  };
  if (params.notes?.trim()) {
    payload.notes = params.notes.trim();
  }
  if (params.dueDate) {
    // Google Tasks RFC 3339 timestamp for due date
    payload.due = `${params.dueDate}T09:00:00.000Z`;
  }

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      taskList.id
    )}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    await parseTasksError(res);
  }

  const task = (await res.json()) as GoogleTaskItem;
  return { taskList, task };
}

export async function completeGoogleTask(params: {
  accessToken: string;
  taskListId: string;
  taskId: string;
}): Promise<GoogleTaskItem> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      params.taskListId
    )}/tasks/${encodeURIComponent(params.taskId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "completed",
      }),
    }
  );

  if (!res.ok) {
    await parseTasksError(res);
  }

  return (await res.json()) as GoogleTaskItem;
}
