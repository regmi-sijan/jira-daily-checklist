const api = require("@forge/api");
const { kvs } = require("@forge/kvs");
const Resolver = require("@forge/resolver").default;
const {
  findDoneTransition,
  findTransitionToStatus,
  getMissingPlannedItems,
  validateDate,
} = require("./checklist");

const resolver = new Resolver();
const PAGE_SIZE = 50;

function storagePrefix(context) {
  if (!context?.cloudId || !context?.accountId) {
    throw new Error("Could not identify your Jira site and account. Reload the page and try again.");
  }
  return `daily-checklist:${context.cloudId}:${context.accountId}`;
}

function storageKey(context, suffix) {
  return `${storagePrefix(context)}:${suffix}`;
}

async function jiraRequest(path, options = {}) {
  const response = await api.asUser().requestJira(path, options);
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }
  }

  if (!response.ok) {
    const details = data.errorMessages?.join(" ") || data.message || `HTTP ${response.status}`;
    throw new Error(`Jira request failed: ${details}`);
  }
  return data;
}

async function getProjects() {
  const projects = [];
  let startAt = 0;

  while (true) {
    const result = await jiraRequest(
      `/rest/api/3/project/search?startAt=${startAt}&maxResults=${PAGE_SIZE}&orderBy=name`,
    );
    const values = result.values || [];
    projects.push(...values.map(({ id, key, name }) => ({ id, key, name })));
    if (result.isLast || values.length === 0 || startAt + values.length >= result.total) {
      break;
    }
    startAt += values.length;
  }

  return projects;
}

function normalizeTemplate(template) {
  const projectKey = typeof template?.projectKey === "string" ? template.projectKey.trim() : "";
  const items = Array.isArray(template?.items)
    ? template.items
        .filter((item) => item && typeof item.id === "string" && typeof item.summary === "string")
        .map((item) => ({ id: item.id, summary: item.summary.trim() }))
        .filter((item) => item.summary)
    : [];
  return { projectKey, items };
}

async function readDates(context) {
  const value = await kvs.get(storageKey(context, "dates"));
  return Array.isArray(value) ? [...new Set(value.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort().reverse() : [];
}

async function writeDay(context, day) {
  await kvs.set(storageKey(context, `day:${day.date}`), day);
}

async function getIssue(issueKey) {
  const result = await jiraRequest(api.route`/rest/api/3/issue/${issueKey}?fields=status`);
  if (!result.fields?.status?.id) {
    throw new Error(`Could not read the current Jira status for ${issueKey}.`);
  }
  return result.fields.status;
}

async function getTransitions(issueKey) {
  const result = await jiraRequest(api.route`/rest/api/3/issue/${issueKey}/transitions`);
  return result.transitions || [];
}

async function moveIssue(issueKey, transitionId) {
  await jiraRequest(api.route`/rest/api/3/issue/${issueKey}/transitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transition: { id: String(transitionId) } }),
  });
}

resolver.define("getInitialData", async ({ payload, context }) => {
  const date = validateDate(payload?.date);
  const prefix = storagePrefix(context);
  const [projects, rawTemplate, day, dates] = await Promise.all([
    getProjects(),
    kvs.get(`${prefix}:template`),
    kvs.get(`${prefix}:day:${date}`),
    readDates(context),
  ]);
  return {
    date,
    projects,
    template: normalizeTemplate(rawTemplate),
    day: day || null,
    dates,
    siteUrl: context.siteUrl || "",
  };
});

resolver.define("saveTemplate", async ({ payload, context }) => {
  const template = normalizeTemplate(payload?.template);
  if (!template.projectKey) {
    throw new Error("Choose a Jira project before saving the checklist.");
  }
  if (!template.items.length) {
    throw new Error("Add at least one checklist item before saving.");
  }
  if (template.items.some((item) => item.summary.length > 255)) {
    throw new Error("Checklist item titles must be 255 characters or fewer.");
  }
  if (new Set(template.items.map((item) => item.id)).size !== template.items.length) {
    throw new Error("Checklist item identifiers must be unique. Reload the page and try again.");
  }

  await kvs.set(storageKey(context, "template"), template);
  return template;
});

resolver.define("generateChecklist", async ({ payload, context }) => {
  const date = validateDate(payload?.date);
  const key = storageKey(context, `day:${date}`);
  const template = normalizeTemplate(await kvs.get(storageKey(context, "template")));
  let day = await kvs.get(key);

  if (!day) {
    if (!template.projectKey || !template.items.length) {
      throw new Error("Save a project and at least one checklist item before generating today's checklist.");
    }
    day = {
      date,
      projectKey: template.projectKey,
      plannedItems: template.items,
      items: [],
      createdAt: new Date().toISOString(),
    };
    await writeDay(context, day);
    const dates = await readDates(context);
    if (!dates.includes(date)) {
      await kvs.set(storageKey(context, "dates"), [...dates, date].sort().reverse());
    }
  }

  const pending = getMissingPlannedItems(day.plannedItems || [], day.items || []);
  for (const plannedItem of pending) {
    const created = await jiraRequest("/rest/api/3/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          project: { key: day.projectKey },
          summary: plannedItem.summary,
          issuetype: { name: "Task" },
        },
      }),
    });
    if (!created.key) {
      throw new Error("Jira did not return an issue key after creating a checklist item.");
    }

    day.items.push({
      templateItemId: plannedItem.id,
      summary: plannedItem.summary,
      issueKey: created.key,
      completed: false,
      originalStatusId: null,
    });
    await writeDay(context, day);
  }

  return day;
});

resolver.define("setItemCompleted", async ({ payload, context }) => {
  const date = validateDate(payload?.date);
  if (typeof payload?.itemId !== "string" || typeof payload?.completed !== "boolean") {
    throw new Error("A checklist item and its completion state are required.");
  }

  const key = storageKey(context, `day:${date}`);
  const day = await kvs.get(key);
  const item = day?.items?.find((entry) => entry.templateItemId === payload.itemId);
  if (!item) {
    throw new Error("That checklist item could not be found. Reload the page and try again.");
  }

  const currentStatus = await getIssue(item.issueKey);
  if (payload.completed) {
    if (currentStatus.statusCategory?.key !== "done") {
      if (!item.originalStatusId) {
        item.originalStatusId = String(currentStatus.id);
        await writeDay(context, day);
      }
      const doneTransition = findDoneTransition(await getTransitions(item.issueKey));
      if (!doneTransition) {
        throw new Error(`No available Jira transition can move ${item.issueKey} to Done.`);
      }
      await moveIssue(item.issueKey, doneTransition.id);
    }
    item.completed = true;
  } else {
    if (!item.completed) {
      return day;
    }
    if (String(currentStatus.id) !== item.originalStatusId) {
      if (!item.originalStatusId) {
        throw new Error(`The original Jira status for ${item.issueKey} is unknown; it cannot be restored safely.`);
      }
      const originalTransition = findTransitionToStatus(
        await getTransitions(item.issueKey),
        item.originalStatusId,
      );
      if (!originalTransition) {
        throw new Error(`No available Jira transition can restore ${item.issueKey} to its previous status.`);
      }
      await moveIssue(item.issueKey, originalTransition.id);
    }
    item.completed = false;
  }

  await writeDay(context, day);
  return day;
});

exports.handler = resolver.getDefinitions();
