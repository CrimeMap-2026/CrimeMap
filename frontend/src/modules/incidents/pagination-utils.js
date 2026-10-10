/** Keep the registry on a real page after deletions or concurrent imports. */
export function validIncidentPageOffset(offset, limit, total) {
  if (!Number.isInteger(offset) || offset < 0 ||
      !Number.isInteger(limit) || limit < 1 ||
      !Number.isInteger(total) || total < 0) {
    return 0;
  }
  if (total === 0) return 0;
  if (offset < total) return offset;
  return Math.floor((total - 1) / limit) * limit;
}
