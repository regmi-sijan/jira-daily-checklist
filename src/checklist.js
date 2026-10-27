function validateDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must use the YYYY-MM-DD format.");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Date is not a valid calendar day.");
  }

  return value;
}

function getMissingPlannedItems(plannedItems, createdItems) {
  const createdIds = new Set(createdItems.map((item) => item.templateItemId));
  return plannedItems.filter((item) => !createdIds.has(item.id));
}

function findDoneTransition(transitions) {
  return transitions.find(
    (transition) =>
      transition.to?.statusCategory?.key === "done" ||
      transition.to?.name?.toLowerCase() === "done",
  );
}

function findTransitionToStatus(transitions, statusId) {
  return transitions.find((transition) => String(transition.to?.id) === String(statusId));
}

module.exports = {
  findDoneTransition,
  findTransitionToStatus,
  getMissingPlannedItems,
  validateDate,
};
