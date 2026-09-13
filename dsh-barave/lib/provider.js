// Brave Search API provider: GET {baseURL}/web/search with the
// X-Subscription-Token header. Brave is a plain REST endpoint, so this
// provider differs from the Anthropic-Messages-shaped DeepSeek provider.
// The module has ZERO runtime imports (node builtins only), so it loads
// reliably from any out-of-tree plugin location in the harness.
//
// Response mapping: web.results[] -> normalized WebSource with
// url/title/snippet(description)/publishedAt(page_age).

/** Stable id this provider registers under; the web section's `searchProvider` points at it. */
export const BRAVE_PROVIDER_ID = 'brave';

/** Default Brave endpoint (the operation `/web/search` is appended). */
export const BRAVE_DEFAULT_BASE_URL = 'https://api.search.brave.com/res/v1';

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-search-brave/0.1.0';

/** Strip simple HTML tags from a string (Brave's description carries markup). */
function stripHtml(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Map one Brave web result to a normalized source, or `undefined` when it
 * carries no usable URL (nothing to cite). Snippet prefers Brave's plain-text
 * `extra_snippets[]`, falling back to the tag-stripped `description`.
 */
export function mapBraveResult(result) {
  const url = typeof result.url === 'string' ? result.url.trim() : '';
  if (url.length === 0) return undefined;
  const title = typeof result.title === 'string' ? result.title.trim() : '';
  const pageAge = typeof result.page_age === 'string' ? result.page_age.trim() : '';
  const extra = Array.isArray(result.extra_snippets)
    ? result.extra_snippets.map((s) => (typeof s === 'string' ? s.trim() : '')).find((s) => s.length > 0)
    : undefined;
  const description = typeof result.description === 'string' ? stripHtml(result.description) : '';
  const snippet = (extra ?? description).trim();
  return {
    url,
    ...(title.length > 0 ? { title } : {}),
    ...(snippet.length > 0 ? { snippet } : {}),
    ...(pageAge.length > 0 ? { publishedAt: pageAge } : {}),
  };
}

/**
 * Map a Brave response envelope to a normalized search result. `truncated` is
 * always false here — the seam owns `maxResults` truncation (capSources).
 */
export function mapBraveResponse(response) {
  const sources = (response?.web?.results ?? [])
    .map(mapBraveResult)
    .filter((source) => source !== undefined);
  return { sources, truncated: false };
}

/** True for a fetch/`AbortSignal` abort. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * The Brave-backed search provider; HTTP redirects fail as WEB_PROVIDER_ERROR
 * (the provider throws a plain Error with a descriptive message).
 */
export class BraveSearchProvider {
  /** @param options - thunk projecting the current config per search (key may be async). */
  constructor(options) {
    this.options = options;
  }

  id = BRAVE_PROVIDER_ID;

  available() {
    const o = this.options();
    return URL.canParse(o.baseURL) && (o.maxUses === undefined || (Number.isInteger(o.maxUses) && o.maxUses > 0));
  }

  async search(request, signal) {
    // One snapshot for the whole operation.
    const o = this.options();
    const apiKey = await o.resolveApiKey();
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error(
        'web-search-brave: no Brave API key. Store it as the BRAVE_API_KEY credential, set the BRAVE_API_KEY env var, or pass a literal apiKey in the web-search-brave config.',
      );
    }
    const maxResults = request.maxResults ?? o.maxUses;
    const endpoint = `${o.baseURL.replace(/\/+$/, '')}/web/search`;
    let url;
    try {
      url = new URL(endpoint);
      url.searchParams.set('q', request.query);
      if (maxResults !== undefined) url.searchParams.set('count', String(maxResults));
    } catch (error) {
      throw new Error(`web-search-brave: invalid baseURL "${o.baseURL}": ${String(error)}`);
    }
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers: {
          'x-subscription-token': apiKey,
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        ...(signal !== undefined ? { signal } : {}),
      });
    } catch (error) {
      if (isAbortError(error)) throw new Error('web-search-brave: search aborted');
      throw new Error(`web-search-brave: search request failed: ${String(error)}`);
    }
    if (!response.ok) {
      let message = `Brave API error (HTTP ${response.status})`;
      try {
        const parsed = await response.json();
        const detail = parsed?.error ?? parsed?.message;
        if (typeof detail === 'string' && detail.length > 0) message = detail;
        else if (detail && typeof detail.message === 'string' && detail.message.length > 0) message = detail.message;
      } catch {
        // keep the HTTP-status message when the body is not JSON
      }
      throw new Error(`web-search-brave: ${message}`);
    }
    try {
      return mapBraveResponse(await response.json());
    } catch (error) {
      if (isAbortError(error)) throw new Error('web-search-brave: search aborted');
      throw new Error(`web-search-brave: unprocessable response body: ${String(error)}`);
    }
  }
}
