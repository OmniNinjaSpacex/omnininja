// OmniNinja — Real Browser Agent (Chromium LOCAL, sem Browserless)
// Roda um Chromium real no Ubuntu via Playwright. Cada task ganha um context
// isolado (cookies/storage separados), permitindo múltiplos usuários em paralelo.
// Em produção multiusuário, defina PLAYWRIGHT_BROWSERS_PATH para um diretório
// compartilhado e os browsers são instalados uma vez.

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright-core';

// Em vez de conectar ao Browserless, lançamos um Chromium local.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE aponta para o binário; se não setado,
// o Playwright usa o browser que baixou via `playwright install chromium`.
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false';

// Singleton de browser (reutilizado entre tasks; cada task ganha um context).
let browserInstance: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (launchPromise) return launchPromise;

  launchPromise = (async () => {
    const launchOpts: any = {
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // importante em containers/Ubuntu compartilhado
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--window-size=1280,720',
      ],
    };
    if (EXECUTABLE) launchOpts.executablePath = EXECUTABLE;

    const browser = await chromium.launch(launchOpts);
    browserInstance = browser;
    launchPromise = null;

    // se o browser cair, limpa para re-lançar na próxima chamada
    browser.on('disconnected', () => {
      browserInstance = null;
      launchPromise = null;
    });
    return browser;
  })();

  return launchPromise;
}

export async function createPage(): Promise<Page> {
  const browser = await getBrowser();
  // Context isolado por chamada -> isolamento entre usuários/tasks.
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });
  // Bloqueia recursos pesados opcionais (mantém rápido em Ubuntu compartilhado).
  await context.route('**/*.{woff,woff2,mp4,webm,ogg}', (route) => route.abort().catch(() => {}));
  const page = await context.newPage();
  return page;
}

export interface BrowserActionResult {
  screenshot?: string; // base64
  url?: string;
  title?: string;
  text?: string;
  error?: string;
}

async function screenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  return buf.toString('base64');
}

async function waitForStable(page: Page) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(500);
}

export const browserTools = {
  navigate: async (page: Page, url: string): Promise<BrowserActionResult> => {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    return {
      screenshot: await screenshot(page),
      url: page.url(),
      title: await page.title(),
    };
  },

  click: async (page: Page, selector: string): Promise<BrowserActionResult> => {
    await page.click(selector, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  type: async (page: Page, selector: string, text: string): Promise<BrowserActionResult> => {
    await page.fill(selector, text, { timeout: 5000 }).catch(() => {
      page.keyboard.type(text).catch(() => {});
    });
    await page.waitForTimeout(200);
    return { screenshot: await screenshot(page) };
  },

  scroll_down: async (page: Page): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page) };
  },

  scroll_up: async (page: Page): Promise<BrowserActionResult> => {
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(300);
    return { screenshot: await screenshot(page) };
  },

  screenshot: async (page: Page): Promise<BrowserActionResult> => {
    return { screenshot: await screenshot(page), url: page.url(), title: await page.title() };
  },

  get_text: async (page: Page): Promise<BrowserActionResult> => {
    const text = await page.innerText('body').catch(() => '');
    return { text: text.slice(0, 5000), screenshot: await screenshot(page) };
  },

  get_html: async (page: Page): Promise<BrowserActionResult> => {
    const html = await page.content().catch(() => '');
    return { text: html.slice(0, 5000) };
  },

  execute_js: async (page: Page, script: string): Promise<BrowserActionResult> => {
    const result = await page.evaluate(script).catch((e) => `Error: ${e.message}`);
    return { text: String(result).slice(0, 3000), screenshot: await screenshot(page) };
  },

  press_key: async (page: Page, key: string): Promise<BrowserActionResult> => {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    return { screenshot: await screenshot(page) };
  },

  go_back: async (page: Page): Promise<BrowserActionResult> => {
    await page.goBack({ timeout: 10000 }).catch(() => {});
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },

  go_forward: async (page: Page): Promise<BrowserActionResult> => {
    await page.goForward({ timeout: 10000 }).catch(() => {});
    await waitForStable(page);
    return { screenshot: await screenshot(page), url: page.url() };
  },
};

export async function closeBrowser() {
  // No modelo local, mantemos o browser singleton ligado entre tasks
  // (custo de lançar é alto). Ele é fechado só no shutdown do processo.
  // Cada task fecha seu próprio context ao terminar a page.
}
