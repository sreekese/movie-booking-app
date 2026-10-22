// Sequential callbacks keep statements ordered on a transaction's connection.
export async function mapAsync(items, fn) {
  const result = [];
  for (const item of items) result.push(await fn(item));
  return result;
}
export async function filterAsync(items, fn) {
  const result = [];
  for (const item of items) if (await fn(item)) result.push(item);
  return result;
}
export async function someAsync(items, fn) {
  for (const item of items) if (await fn(item)) return true;
  return false;
}
