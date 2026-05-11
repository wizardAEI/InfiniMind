export function formatProjectDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Updated now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTrashDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Deleted now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
