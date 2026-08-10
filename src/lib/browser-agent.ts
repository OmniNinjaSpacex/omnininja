// OmniNinja — isolated Browserless/Playwright browser runtime.
// Browser state is scoped to the current task/request via AsyncLocalStorage.
// Production never falls back to an unsandboxed local Chromium instance.

import { AsyncLocalStorage } from 'node:async_hooks';

let chromiumModule: any = null;
async function getChromium(): Promise<any> {
  if (chromiumModule) return chromiumModule;
  const playwright = await import('playwright-core');
  chromiumModule = playwright.chromium;
  return chromiumModule;
}

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_KEY || '';
const BROWSERLESS_REGION = process.env.BROWSERLESS_REGION || 'production-sfo';
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false';
const USE_BROWSERLESS = BROWSERLESS_TOKEN.length > 10;

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
    throw new Error('BROWSERLESS_API_KEY não configurada no servidor');
  }
  return BROWSERLESS_TOKEN;
}

function validateReconnectEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Browserless reconnect endpoint inválido');
  }

  const expectedHost = `${BROWSERLESS_REGION}.browserless.io`;
  if (url.protocol !== 'wss:' || url.hostname !== expectedHost) {
    throw new Error('Browserless reconnect endpoint fora da região configurada');
  }
  return url;
}

function browserlessReconnectURL(endpoint: string): string {
  const token = requireBrowserlessToken();
  const url = validateReconnectEndpoint(endpoint);
  url.searchParams.set('token', token);
  return url.toString();
}

function validateHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL precisa usar http ou https');
  }
  return url.toString();
}

export async function createInteractiveBrowserSession(
  initialUrl = 'https://www.google.com/',
  requestedTimeoutMs = 10 * 60 * 1000,
): Promise<InteractiveBrowserSession> {
  const token = requireBrowserlessToken();
  const safeInitialUrl = validateHttpUrl(initialUrl);
  const timeoutMs = Math.max(60_000, Math.min(Number(requestedTimeoutMs) || 600_000, 30 * 60 * 1000));
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
      variables: { url: safeInitialUrl, timeout: timeoutMs },
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
    throw new Error('Browserless não retornou liveURL/reconnect endpoint');
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
 * Every Agent run gets its own async browser context, even when no explicit
 * takeover endpoint is supplied. This prevents global browser/cookie sharing.
 */
export async function runWithBrowserSession<T>(
  browserWSEndpoint: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (browserWSEndpoint) validateReconnectEndpoint(browserWSEndpoint);

  const context: BrowserSessionContext = { browserWSEndpoint };
  return browserSessionStorage.run(context, async () => {
    try {
      return await fn();
    } finally {
      if (context.browser) {
        await context.browser.close().catch(() => {});
        context.browser = undefined;
      }
    }
  });
}

async function createBrowserForCurrentContext(): Promise<any> {
  const store = browserSessionStorage.getStore();
  if (store?.browser?.isConnected?.()) return store.browser;

  const chromium = await getChromium();
  let browser: any;

  if (store?.browserWSEndpoint) {
    browser = await chromium.connectOverCDP(browserlessReconnectURL(store.browserWSEndpoint));
  } else if (USE_BROWSERLESS) {
    // A fresh Browserless connection for this task/request. Never reuse a
    // process-global Browserless browser across tenants.
    const wsUrl = `wss://${BROWSERLESS_REGION}.browserless.io?token=${encodeURIComponent(requireBrowserlessToken())}`;
    browser = await chromium.connectOverCDP(wsUrl);
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Browser cloud indisponível: BROWSERLESS_API_KEY é obrigatória em produção');
    }

    const launchOpts: any = {
      headless: HEADLESS,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,720',
      ],
    };
    if (EXECUTABLE) launchOpts.executablePath = EXECUTABLE;
    browser = await chromium.launch(launchOpts);
  }

  if (store) store.browser = browser;
  return browser;
}

export async function getBrowser(): Promise<any> {
  return createBrowserForCurrentContext();
}

export async function createPage(): Promise<any> {
  const browser = await getBrowser();
  const store = browserSessionStorage.getStore();

  // A Browserless CDP connection normally exposes one isolated default context
  // for that remote browser session. Because connections are no longer global,
  // using this context cannot cross tenant boundaries.
  let context = browser.contexts?.()[0];
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    });
  }

  const existing = context.pages?.() || [];
  if (store?.browserWSEndpoint && existing.length > 0) {
    return existing[0];
  }

  return context.newPage();
}

export interface BrowserActionResult {
  screenshot?: string;
  url?: string;
  title?: string;
  text?: string;
  error?: string;
}

async function screenshot(page: any): Promise<string> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}

async function waitForStable(page: any) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(300);
}

export const browserTools = {
  navigate: async (page: any, url: string): Promise<BrowserActionResult> => {
    const safeUrl = validateHttpUrl(url);
    await page.goto(safeUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    return {
      screenshot: await screenshot(page),
      url: page.url(),
      title: await page.title(),
    };
  },

  click: async (page: any, selector: string): Promise<BrowserActionResult> => {
    await page.click(selector, { timeout: 8000 });
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  type: async (page: any, selector: string, text: string): Promise<BrowserActionResult> => {
    await page.fill(selector, text, { timeout: 8000 });
    await page.waitForTimeout(200);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  scroll_down: async (page: any): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  scroll_up: async (page: any): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  screenshot: async (page: any): Promise<BrowserActionResult> => ({
    screenshot: await screenshot(page),
    url: page.url(),
    title: await page.title(),
  }),

  get_text: async (page: any): Promise<BrowserActionResult> => {
    const text = await page.innerText('body');
    return { text: text.slice(0, 8000), screenshot: await screenshot(page), url: page.url() };
  },

  get_html: async (page: any): Promise<BrowserActionResult> => {
    const html = await page.content();
    return { text: html.slice(0, 12000), url: page.url() };
  },

  execute_js: async (page: any, script: string): Promise<BrowserActionResult> => {
    const result = await page.evaluate(script);
    return { text: String(result).slice(0, 5000), screenshot: await screenshot(page), url: page.url() };
  },

  press_key: async (page: any, key: string): Promise<BrowserActionResult> => {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  go_back: async (page: any): Promise<BrowserActionResult> => {
    await page.goBack({ timeout: 10000 });
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  go_forward: async (page: any): Promise<BrowserActionResult> => {
    await page.goForward({ timeout: 10000 });
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },
};

export async function closeBrowser() {
  const store = browserSessionStorage.getStore();
  if (store?.browser) {
    await store.browser.close().catch(() => {});
    store.browser = undefined;
  }
}
