// OmniNinja - Browser Agent
// Suporta 2 modos:
//  1. BROWSERLESS (cloud) - quando BROWSERLESS_API_KEY esta definida.
//     Conecta via connectOverCDP ao wss://production-sfo.browserless.io
//     Mais rapido, escalavel, nao consome RAM do Ubuntu.
//  2. LOCAL Chromium - fallback. Roda Chromium local via Playwright.
//     Usado quando nao ha chave Browserless.

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

export function getBrowserMode(): 'browserless' | 'local' {
  return USE_BROWSERLESS ? 'browserless' : 'local';
}

export async function getBrowser(): Promise<any> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (launchPromise) return launchPromise;

  launchPromise = (async () => {
    const chromium = await getChromium();
    let browser: any;

    if (USE_BROWSERLESS) {
      const wsUrl = `wss://${BROWSERLESS_REGION}.browserless.io?token=${BROWSERLESS_TOKEN}`;
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

  const page = await context.newPage();
  return page;
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
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
