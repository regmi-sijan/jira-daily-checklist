const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findDoneTransition,
  findTransitionToStatus,
  getMissingPlannedItems,
  validateDate,
} = require("../src/checklist");

test("accepts a real ISO calendar date", () => {
  assert.equal(validateDate("2026-10-27"), "2026-10-27");
});

test("rejects malformed or impossible dates", () => {
  assert.throws(() => validateDate("10/27/2026"), /YYYY-MM-DD/);
  assert.throws(() => validateDate("2026-02-30"), /valid calendar day/);
});

test("finds planned checklist items that have not yet become Jira issues", () => {
  const planned = [
    { id: "one", summary: "Review PRs" },
    { id: "two", summary: "Update tickets" },
  ];
  assert.deepEqual(getMissingPlannedItems(planned, [{ templateItemId: "one" }]), [planned[1]]);
});

test("selects a transition into Jira's Done status category", () => {
  const transitions = [
    { id: "11", to: { id: "2", name: "In Progress", statusCategory: { key: "indeterminate" } } },
    { id: "12", to: { id: "3", name: "Resolved", statusCategory: { key: "done" } } },
  ];
  assert.equal(findDoneTransition(transitions), transitions[1]);
});

test("selects a transition back to the recorded Jira status", () => {
  const transitions = [
    { id: "21", to: { id: "1", name: "To Do" } },
    { id: "22", to: { id: "3", name: "Done" } },
  ];
  assert.equal(findTransitionToStatus(transitions, "1"), transitions[0]);
});
