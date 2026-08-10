// OmniNinja - Browser Agent
// Suporta 3 modos:
//  1. BROWSERLESS (cloud) - quando BROWSERLESS_API_KEY esta definida.
//  2. BROWSERLESS TAKEOVER - usuario entra manualmente via liveURL e o agente
//     reconecta na mesma sessao autenticada.
//  3. LOCAL Chromium - fallback quando nao ha chave Browserless.

import { AsyncLocalStorage } from 'node:async_hooks';

let _chromium: any = null;
async function getChromium(): Promise<any> {
  if (_chromium) return _chromium;
  const pw = await import('playwright-core');
  _chromium = pw.chromium;
  return _chromium;
}

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_KEY || '';
const BROWSERLESS_REGION = process.env.BROWSERLESS_REGION || 'production-sfo';
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false';

const USE_BROWSERLESS = BROWSERLESS_TOKEN.length > 10;

let browserInstance: any = null;
let launchPromise: Promise<any> | null = null;

type BrowserSessionContext = {
  browserWSEndpoint?: string;
  browser?: any;
};

const browserSessionStorage = new AsyncLocalStorage<BrowserSessionContext>();

export interface InteractiveBrowserSession {
  liveURL: string;
  browserWSEndpoint: string;
  browserQLEndpoint?: string;
  expiresInMs: number;
}

export function getBrowserMode(): 'browserless' | 'local' {
  return USE_BROWSERLESS ? 'browserless' : 'local';
}

function requireBrowserlessToken(): string {
  if (!USE_BROWSERLESS) {
    throw new Error('BROWSERLESS_API_KEY nao configurada no servidor');
  }
  return BROWSERLESS_TOKEN;
}

function validateReconnectEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const allowedHost = url.hostname === `${BROWSERLESS_REGION}.browserless.io` || url.hostname.endsWith('.browserless.io');
  if (url.protocol !== 'wss:' || !allowedHost) {
    throw new Error('Browserless reconnect endpoint invalido');
  }
  return url;
}

function browserlessReconnectURL(endpoint: string): string {
  const token = requireBrowserlessToken();
  const url = validateReconnectEndpoint(endpoint);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function createInteractiveBrowserSession(
  initialUrl = 'https://console.aws.amazon.com/',
  requestedTimeoutMs = 10 * 60 * 1000,
): Promise<InteractiveBrowserSession> {
  const token = requireBrowserlessToken();

  const parsed = new URL(initialUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('initialUrl precisa ser http ou https');
  }

  // Evita sessoes esquecidas. O cliente pode criar uma nova quando precisar.
  const timeoutMs = Math.max(60_000, Math.min(requestedTimeoutMs, 30 * 60 * 1000));
  const endpoint = `https://${BROWSERLESS_REGION}.browserless.io/stealth/bql?token=${encodeURIComponent(token)}`;

  const query = `
    mutation StartInteractiveSession($url: String!, $timeout: Float!) {
      goto(url: $url, waitUntil: domContentLoaded) { status }
      liveURL(timeout: $timeout, interactable: true, resizable: true) { liveURL }
      reconnect(timeout: $timeout) { browserQLEndpoint browserWSEndpoint }
    }
  `;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { url: parsed.toString(), timeout: timeoutMs },
      operationName: 'StartInteractiveSession',
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok || payload?.errors?.length) {
    const detail = payload?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Browserless live session falhou: ${detail}`);
  }

  const liveURL = payload?.data?.liveURL?.liveURL;
  const browserWSEndpoint = payload?.data?.reconnect?.browserWSEndpoint;
  const browserQLEndpoint = payload?.data?.reconnect?.browserQLEndpoint;

  if (!liveURL || !browserWSEndpoint) {
    throw new Error('Browserless nao retornou liveURL/reconnect endpoint');
  }

  validateReconnectEndpoint(browserWSEndpoint);

  return {
    liveURL,
    browserWSEndpoint,
    browserQLEndpoint,
    expiresInMs: timeoutMs,
  };
}

/**
 * Executa uma tarefa dentro de uma sessao Browserless especifica sem usar
 * estado global entre usuarios. AsyncLocalStorage mantem a sessao vinculada
 * apenas ao request atual.
 */
export async function runWithBrowserSession<T>(
  browserWSEndpoint: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!browserWSEndpoint) return fn();
  validateReconnectEndpoint(browserWSEndpoint);
  return browserSessionStorage.run({ browserWSEndpoint }, fn);
}

async function connectToTakeoverSession(): Promise<any | null> {
  const store = browserSessionStorage.getStore();
  if (!store?.browserWSEndpoint) return null;

  if (store.browser?.isConnected?.()) return store.browser;

  const chromium = await getChromium();
  const browser = await chromium.connectOverCDP(browserlessReconnectURL(store.browserWSEndpoint));
  store.browser = browser;
  return browser;
}

export async function getBrowser(): Promise<any> {
  const takeoverBrowser = await connectToTakeoverSession();
  if (takeoverBrowser) return takeoverBrowser;

  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (launchPromise) return launchPromise;

  launchPromise = (async () => {
    const chromium = await getChromium();
    let browser: any;

    if (USE_BROWSERLESS) {
      const wsUrl = `wss://${BROWSERLESS_REGION}.browserless.io?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`;
      browser = await chromium.connectOverCDP(wsUrl);
    } else {
      const launchOpts: any = {
        headless: HEADLESS,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-gpu', '--no-zygote', '--single-process', '--window-size=1280,720',
        ],
      };
      if (EXECUTABLE) launchOpts.executablePath = EXECUTABLE;
      browser = await chromium.launch(launchOpts);
    }

    browserInstance = browser;
    launchPromise = null;
    browser.on('disconnected', () => { browserInstance = null; launchPromise = null; });
    return browser;
  })();

  return launchPromise;
}

export async function createPage(): Promise<any> {
  const browser = await getBrowser();
  let context: any;

  if (USE_BROWSERLESS) {
    const contexts = browser.contexts();
    context = contexts[0] || (await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    }));
  } else {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    });
    await context.route('**/*.{woff,woff2,mp4,webm,ogg}', (r: any) => r.abort().catch(() => {}));
  }

  // Em takeover, reutiliza a pagina em que o usuario acabou de fazer login.
  const existing = context.pages?.() || [];
  if (browserSessionStorage.getStore()?.browserWSEndpoint && existing.length > 0) {
    return existing[0];
  }

  return context.newPage();
}

export interface BrowserActionResult {
  screenshot?: string; url?: string; title?: string; text?: string; error?: string;
}

async function screenshot(page: any): Promise<string> {
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  return buf.toString('base64');
}

async function waitForStable(page: any) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(500);
}

export const browserTools = {
  navigate: async (page: any, url: string): Promise<BrowserActionResult> => {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url(), title: await page.title() };
  },
  click: async (page: any, selector: string): Promise<BrowserActionResult> => {
    await page.click(selector, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page), url: page.url() };
  },
  type: async (page: any, selector: string, text: string): Promise<BrowserActionResult> => {
    await page.fill(selector, text, { timeout: 5000 }).catch(() => { page.keyboard.type(text).catch(() => {}); });
    await page.waitForTimeout(200);
    return { screenshot: await screenshot(page) };
  },
  scroll_down: async (page: any): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, 600); await page.waitForTimeout(300);
    return { screenshot: await screenshot(page) };
  },
  scroll_up: async (page: any): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, -600); await page.waitForTimeout(300);
    return { screenshot: await screenshot(page) };
  },
  screenshot: async (page: any): Promise<BrowserActionResult> => {
    return { screenshot: await screenshot(page), url: page.url(), title: await page.title() };
  },
  get_text: async (page: any): Promise<BrowserActionResult> => {
    const text = await page.innerText('body').catch(() => '');
    return { text: text.slice(0, 5000), screenshot: await screenshot(page) };
  },
  get_html: async (page: any): Promise<BrowserActionResult> => {
    const html = await page.content().catch(() => '');
    return { text: html.slice(0, 5000) };
  },
  execute_js: async (page: any, script: string): Promise<BrowserActionResult> => {
    const result = await page.evaluate(script).catch((e: any) => `Error: ${e.message}`);
    return { text: String(result).slice(0, 3000), screenshot: await screenshot(page) };
  },
  press_key: async (page: any, key: string): Promise<BrowserActionResult> => {
    await page.keyboard.press(key); await page.waitForTimeout(200);
    return { screenshot: await screenshot(page) };
  },
  go_back: async (page: any): Promise<BrowserActionResult> => {
    await page.goBack({ timeout: 10000 }).catch(() => {});
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },
  go_forward: async (page: any): Promise<BrowserActionResult> => {
    await page.goForward({ timeout: 10000 }).catch(() => {});
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },
};

export async function closeBrowser() {
  const store = browserSessionStorage.getStore();
  if (store?.browser) {
    await store.browser.close().catch(() => {});
    store.browser = undefined;
    return;
  }

  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
