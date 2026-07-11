const BASE_URL = 'https://api.congress.gov/v3';
const PAGE_SIZE = 250;
const metrics = { requests: 0, retries: 0 };

function requireApiKey(env = process.env) {
  if (!env.CONGRESS_API_KEY) throw new Error('CONGRESS_API_KEY environment variable is required');
  return env.CONGRESS_API_KEY;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson(url, { apiKey, fetchImpl = fetch, maxRetries = 3, timeoutMs = 30000 } = {}) {
  let attempt = 0;
  while (true) {
    const requestUrl = new URL(url);
    if (!requestUrl.searchParams.has('api_key')) requestUrl.searchParams.set('api_key', apiKey);
    if (!requestUrl.searchParams.has('format')) requestUrl.searchParams.set('format', 'json');
    metrics.requests += 1;
    const response = await fetchImpl(requestUrl.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new Error('Congress.gov returned invalid JSON');
      }
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= maxRetries) {
      throw new Error(`Congress.gov request failed with HTTP ${response.status}`);
    }
    const retryAfter = Number(response.headers?.get?.('retry-after') || 0);
    const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * (2 ** attempt), 8000);
    attempt += 1;
    metrics.retries += 1;
    await sleep(delay);
  }
}

function resetMetrics() {
  metrics.requests = 0;
  metrics.retries = 0;
}

function getMetrics() {
  return { ...metrics };
}

async function paginate(path, { apiKey = requireApiKey(), fetchImpl = fetch, maxPages = 100, query = {} } = {}) {
  const initialUrl = new URL(`${BASE_URL}${path}`);
  initialUrl.searchParams.set('limit', String(PAGE_SIZE));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') initialUrl.searchParams.set(key, String(value));
  }
  let url = initialUrl.toString();
  const items = [];
  for (let page = 0; page < maxPages && url; page += 1) {
    const payload = await requestJson(url, { apiKey, fetchImpl });
    const collection = Object.entries(payload).find(([, value]) => Array.isArray(value));
    if (!collection) throw new Error(`Congress.gov response for ${path} did not contain a collection`);
    items.push(...collection[1]);
    const next = payload.pagination?.next;
    url = next ? (next.startsWith('http') ? next : `${BASE_URL}${next}`) : '';
  }
  return items;
}

function stableSort(records, keys = ['id', 'bioguideId', 'url', 'number']) {
  return [...records].sort((left, right) => {
    const leftKey = keys.map((key) => String(left[key] ?? '')).join('|');
    const rightKey = keys.map((key) => String(right[key] ?? '')).join('|');
    return leftKey.localeCompare(rightKey, 'en', { numeric: true });
  });
}

module.exports = { BASE_URL, PAGE_SIZE, getMetrics, paginate, requestJson, requireApiKey, resetMetrics, stableSort };
