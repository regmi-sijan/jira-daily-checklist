import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@forge/bridge";
import "./styles.css";

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function App() {
  const today = useMemo(() => localDateString(), []);
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({ projectKey: "", items: [] });
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (selectedDate = date) => {
    setError("");
    try {
      const result = await invoke("getInitialData", { date: selectedDate });
      setDate(selectedDate);
      setData(result);
      setDraft(result.template);
    } catch (caught) {
      setError(caught.message || "Could not load your checklist.");
    }
  }, [today]);

  useEffect(() => {
    load(today);
  }, [load, today]);

  const editDraft = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const addItem = () => {
    const summary = newItem.trim();
    if (!summary) return;
    if (summary.length > 255) {
      setError("Checklist item titles must be 255 characters or fewer.");
      return;
    }
    setDraft((current) => ({
      ...current,
      items: [...current.items, { id: crypto.randomUUID(), summary }],
    }));
    setNewItem("");
    setError("");
  };

  const saveTemplate = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const template = await invoke("saveTemplate", { template: draft });
      setDraft(template);
      setData((current) => ({ ...current, template }));
      setNotice("Checklist template saved.");
    } catch (caught) {
      setError(caught.message || "Could not save your template.");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await invoke("generateChecklist", { date: today });
      await load(today);
      setNotice("Today's Jira issues are ready.");
    } catch (caught) {
      await load(today);
      setError(caught.message || "Could not generate today's checklist.");
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (item, completed) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const day = await invoke("setItemCompleted", {
        date,
        itemId: item.templateItemId,
        completed,
      });
      setData((current) => ({ ...current, day }));
    } catch (caught) {
      setError(caught.message || "Could not update the Jira issue.");
    } finally {
      setBusy(false);
    }
  };

  const currentDay = data?.day;
  const isToday = date === today;
  const templateIsSaved = Boolean(data && JSON.stringify(draft) === JSON.stringify(data.template));
  const planCount = currentDay?.plannedItems?.length || 0;
  const createdCount = currentDay?.items?.length || 0;
  const needsRetry = Boolean(currentDay && createdCount < planCount);

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">JIRA WORKFLOW</p>
          <h1>Daily checklist</h1>
          <p className="subtitle">Turn your repeatable routine into Jira issues, one day at a time.</p>
        </div>
        <span className="date-chip">{today}</span>
      </header>

      {error && <div className="message error" role="alert">{error}</div>}
      {notice && <div className="message success" role="status">{notice}</div>}

      <section className="card template-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR ROUTINE</p>
            <h2>Checklist template</h2>
          </div>
          <button className="button secondary" onClick={saveTemplate} disabled={!data || busy}>
            Save template
          </button>
        </div>

        <label className="field-label" htmlFor="project">Jira project</label>
        <select
          id="project"
          className="control"
          value={draft.projectKey}
          onChange={(event) => editDraft({ projectKey: event.target.value })}
          disabled={!data || busy}
        >
          <option value="">Choose a project</option>
          {(data?.projects || []).map((project) => (
            <option key={project.id} value={project.key}>{project.name} ({project.key})</option>
          ))}
        </select>

        <label className="field-label item-label" htmlFor="new-item">Checklist items</label>
        <div className="add-row">
          <input
            id="new-item"
            className="control"
            value={newItem}
            maxLength={255}
            placeholder="e.g. Review open pull requests"
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addItem();
              }
            }}
          />
          <button className="button secondary" onClick={addItem} disabled={!newItem.trim() || busy}>
            Add item
          </button>
        </div>
        {draft.items.length ? (
          <ul className="template-list">
            {draft.items.map((item, index) => (
              <li key={item.id}>
                <span className="item-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="item-title">{item.summary}</span>
                <button
                  className="remove-button"
                  aria-label={`Remove ${item.summary}`}
                  onClick={() => editDraft({ items: draft.items.filter((entry) => entry.id !== item.id) })}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-hint">Add the tasks you want to repeat each day.</p>
        )}
      </section>

      <section className="card today-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{isToday ? "TODAY" : "CHECKLIST HISTORY"}</p>
            <h2>{isToday ? "Today's checklist" : `Checklist for ${date}`}</h2>
          </div>
          <div className="history-picker">
            <label htmlFor="history-date">View date</label>
            <select
              id="history-date"
              className="control"
              value={date}
              onChange={(event) => load(event.target.value)}
              disabled={!data || busy}
            >
              <option value={today}>{today} (today)</option>
              {(data?.dates || []).filter((entry) => entry !== today).map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          </div>
        </div>

        {isToday && (
          <div className="generate-row">
            <p>{needsRetry
              ? `${createdCount} of ${planCount} Jira issues created. Retry to finish the remaining items.`
              : currentDay
                ? `${createdCount} Jira issue${createdCount === 1 ? "" : "s"} created in ${currentDay.projectKey}.`
                : templateIsSaved
                  ? "Create today's Jira issues from your saved template."
                  : "Save your template changes before generating today's issues."}
            </p>
            <button
                className="button primary"
                onClick={generate}
                disabled={
                  busy ||
                  (currentDay ? !needsRetry : !templateIsSaved || !draft.projectKey || !draft.items.length)
                }
            >
                {busy
                  ? "Working…"
                  : needsRetry
                    ? "Retry creation"
                    : currentDay
                      ? "Checklist created"
                      : templateIsSaved
                        ? "Generate today"
                        : "Save template first"}
            </button>
          </div>
        )}

        {currentDay?.items?.length ? (
          <ul className="checklist">
            {currentDay.items.map((item) => (
              <li key={item.templateItemId} className={item.completed ? "completed" : ""}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => toggleItem(item, event.target.checked)}
                    disabled={!isToday || busy}
                  />
                  <span className="checkmark" aria-hidden="true" />
                  <span className="check-title">{item.summary}</span>
                </label>
                <a
                  className="issue-link"
                  href={`${(data?.siteUrl || "").replace(/\/$/, "")}/browse/${encodeURIComponent(item.issueKey)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.issueKey} ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-checklist">
            <div className="empty-icon">✓</div>
            <strong>{currentDay ? "No Jira issues were created for this day." : isToday ? "Your day is ready to begin." : "No checklist saved for this date."}</strong>
            <span>{currentDay ? "Review the template and retry creation if items are missing." : isToday ? "Save a template, then generate today's checklist." : "Past checklists appear here once they have been generated."}</span>
          </div>
        )}
      </section>

      <footer>Each checklist item creates a Jira Task. Completing an item moves its issue to Done.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
