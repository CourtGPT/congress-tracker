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

function findCollection(payload) {
  const direct = Object.entries(payload || {}).find(([, value]) => Array.isArray(value));
  if (direct) return direct;
  if (payload?.Results && typeof payload.Results === 'object') {
    const nested = Object.entries(payload.Results).find(([, value]) => Array.isArray(value));
    if (nested) return nested;
  }
  return null;
}

async function paginate(path, { apiKey = requireApiKey(), fetchImpl = fetch, maxPages = 100, query = {}, concurrency = 1 } = {}) {
  const options = { apiKey, fetchImpl, maxPages, query };
  if (concurrency > 1) return paginateConcurrent(path, { ...options, concurrency });
  return paginateSequential(path, options);
}

async function paginateSequential(path, { apiKey = requireApiKey(), fetchImpl = fetch, maxPages = 100, query = {} } = {}) {
  const initialUrl = new URL(`${BASE_URL}${path}`);
  initialUrl.searchParams.set('limit', String(PAGE_SIZE));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') initialUrl.searchParams.set(key, String(value));
  }
  let url = initialUrl.toString();
  const items = [];
  for (let page = 0; page < maxPages && url; page += 1) {
    const payload = await requestJson(url, { apiKey, fetchImpl });
    const collection = findCollection(payload);
    if (!collection) throw new Error(`Congress.gov response for ${path} did not contain a collection`);
    items.push(...collection[1]);
    const next = payload.pagination?.next;
    if (next) {
      url = next.startsWith('http') ? next : `${BASE_URL}${next}`;
    } else if (payload.Results && Number(payload.Results.TotalCount) > Number(payload.Results.IndexStart) + Number(payload.Results.SetSize) - 1) {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('offset', String(Number(payload.Results.IndexStart) + Number(payload.Results.SetSize) - 1));
      url = nextUrl.toString();
    } else {
      url = '';
    }
  }
  return items;
}

async function paginateConcurrent(path, { apiKey = requireApiKey(), fetchImpl = fetch, maxPages = 100, query = {}, concurrency = 4 } = {}) {
  const initialUrl = new URL(`${BASE_URL}${path}`);
  initialUrl.searchParams.set('limit', String(PAGE_SIZE));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') initialUrl.searchParams.set(key, String(value));
  }

  const firstPayload = await requestJson(initialUrl.toString(), { apiKey, fetchImpl });
  const firstCollection = findCollection(firstPayload);
  if (!firstCollection) throw new Error(`Congress.gov response for ${path} did not contain a collection`);
  const total = Number(firstPayload.pagination?.count ?? firstPayload.Results?.TotalCount);
  if (!Number.isFinite(total)) throw new Error(`Congress.gov response for ${path} did not contain a pagination count for concurrent retrieval`);

  const pageCount = Math.min(Math.ceil(total / PAGE_SIZE), maxPages);
  const pages = new Array(pageCount);
  pages[0] = firstCollection[1];
  const offsets = Array.from({ length: pageCount - 1 }, (_, index) => (index + 1) * PAGE_SIZE);
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, offsets.length || 1));
  for (let start = 0; start < offsets.length; start += workerCount) {
    const batch = offsets.slice(start, start + workerCount);
    const results = await Promise.all(batch.map(async (offset) => {
      const pageUrl = new URL(initialUrl);
      pageUrl.searchParams.set('offset', String(offset));
      const payload = await requestJson(pageUrl.toString(), { apiKey, fetchImpl });
      const collection = findCollection(payload);
      if (!collection) throw new Error(`Congress.gov response for ${path} offset ${offset} did not contain a collection`);
      return { offset, records: collection[1] };
    }));
    for (const result of results) pages[result.offset / PAGE_SIZE] = result.records;
  }
  return pages.flat().slice(0, total);
}

function stableSort(records, keys = ['id', 'bioguideId', 'url', 'number']) {
  return [...records].sort((left, right) => {
    const leftKey = keys.map((key) => String(left[key] ?? '')).join('|');
    const rightKey = keys.map((key) => String(right[key] ?? '')).join('|');
    return leftKey.localeCompare(rightKey, 'en', { numeric: true });
  });
}

module.exports = { BASE_URL, PAGE_SIZE, findCollection, getMetrics, paginate, paginateConcurrent, requestJson, requireApiKey, resetMetrics, stableSort };
