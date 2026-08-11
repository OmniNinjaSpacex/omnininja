// OmniNinja — isolated Browserless/Playwright browser runtime.
// Every invocation creates a fresh browser connection for the current task.
// Production never falls back to an unsandboxed local Chromium instance.

import { validatePublicHttpUrl } from './public-http-url';

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

function requireBrowserlessToken(): string {
  if (!USE_BROWSERLESS) {
    throw new Error('BROWSERLESS_API_KEY não configurada no servidor');
  }
  return BROWSERLESS_TOKEN;
}

function browserlessEndpoint(): string {
  if (!/^[a-z0-9-]{1,64}$/i.test(BROWSERLESS_REGION)) {
    throw new Error('Região do navegador remoto inválida');
  }
  return `wss://${BROWSERLESS_REGION}.browserless.io?token=${encodeURIComponent(requireBrowserlessToken())}`;
}

async function createBrowser(): Promise<any> {
  const chromium = await getChromium();
  let browser: any;

  if (USE_BROWSERLESS) {
    // A fresh Browserless connection for this task/request. Never reuse a
    // process-global Browserless browser across tenants.
    browser = await chromium.connectOverCDP(browserlessEndpoint());
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

  return browser;
}

const PAGE_BROWSER = Symbol('omnininja.browser');

export async function createPage(): Promise<any> {
  const browser = await createBrowser();

  // A Browserless CDP connection normally exposes one isolated default context
  // for that remote browser session. Because connections are no longer global,
  // using this context cannot cross tenant boundaries.
  let context = browser.contexts?.()[0];
  if (!context) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: false,
    });
  }

  await context.route('**/*', async (route: any) => {
    const requestUrl = route.request().url();
    if (/^https?:/i.test(requestUrl)) {
      try {
        validatePublicHttpUrl(requestUrl);
      } catch {
        await route.abort('blockedbyclient');
        return;
      }
    }
    await route.continue();
  });

  const page = await context.newPage();
  page[PAGE_BROWSER] = browser;
  return page;
}

export async function closePage(page: any): Promise<void> {
  const context = page?.context?.();
  const browser = page?.[PAGE_BROWSER] || context?.browser?.();
  await page?.close?.().catch(() => {});
  await context?.close?.().catch(() => {});
  await browser?.close?.().catch(() => {});
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
    const safeUrl = validatePublicHttpUrl(url);
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
