export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(
      'Cannot connect to the booking service. Check your connection and try again.',
      { cause: error },
    );
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A proxy or static host may return HTML instead of an API response.
  }
  if (response.status === 204 && response.ok) return null;
  if (!data || typeof data !== 'object') {
    throw Object.assign(
      new Error(
        'The booking service is unavailable. If running locally, restart the app with npm run dev.',
      ),
      { status: response.status },
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof data.error === 'string'
          ? data.error
          : 'Request failed. Please try again.',
      ),
      { status: response.status },
    );
  return data;
}
export const money = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
export const dateLabel = (date) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
