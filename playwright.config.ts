import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

type Engine = 'chromium' | 'firefox' | 'webkit';
type Project = NonNullable<PlaywrightTestConfig['projects']>[number];

const PORT = 3100;
const PASSWORD = 'test'; // la usa el servidor de pruebas y tests/e2e/helpers.ts; no es la real

// En CI (o con PW_TODOS=1, si están instalados) cada dispositivo usa su motor real: WebKit para iPhone/iPad, Chromium para Android y Firefox en escritorio.
// En local, por defecto, todo corre en Chromium (Brave) con el tamaño, la densidad y el táctil de cada dispositivo: vale para maquetación, no para fallos propios de Safari o Firefox.
const real = !!process.env.CI || !!process.env.PW_TODOS;

// shortcut: Brave solo en local; en CI el workflow pone PW_BROWSER='' y se usa el Chromium de Playwright
const braveOrPlaywright = { executablePath: (process.env.PW_BROWSER ?? '/usr/bin/brave-origin') || undefined };
const launch = (engine: Engine) => (engine === 'chromium' ? { launchOptions: braveOrPlaywright } : {});

// Qué specs corren en cada tipo de proyecto. movil.spec solo en dispositivos; a11y solo en los marcados
const FUNCIONAL_EN_DISPOSITIVOS = ['movil', 'busqueda', 'calendario'];
const specs = (...names: string[]) => new RegExp(`(${names.join('|')})\\.spec`);

const desktops: Project[] = [
  ...(real ? (['chromium', 'firefox', 'webkit'] as const) : (['chromium'] as const)).map((engine): Project => ({
    name: `${engine}-escritorio`,
    testIgnore: /movil\.spec/,
    use: { browserName: engine, ...launch(engine) },
  })),
  { name: 'chromium-escritorio-grande', testIgnore: /movil\.spec/, use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, ...launch('chromium') } },
];

// Cada dispositivo se prueba en vertical y en horizontal. a11y: además se pasa axe (el contraste no cambia con el tamaño, pero la maquetación sí)
const DEVICES: { name: string; device: string; a11y?: boolean }[] = [
  // móviles, de más pequeño a más grande
  { name: 'iphone-se', device: 'iPhone SE', a11y: true }, // 320 px: el límite de «caber»
  { name: 'galaxy-s9', device: 'Galaxy S9+' },
  { name: 'iphone-15', device: 'iPhone 15' },
  { name: 'pixel-7', device: 'Pixel 7', a11y: true },
  { name: 'galaxy-s24', device: 'Galaxy S24' },
  { name: 'iphone-15-pro-max', device: 'iPhone 15 Pro Max' },
  // tabletas
  { name: 'galaxy-tab-s9', device: 'Galaxy Tab S9' },
  { name: 'ipad-mini', device: 'iPad Mini', a11y: true },
  { name: 'ipad-pro-11', device: 'iPad Pro 11' },
  // plegables
  { name: 'fold-6-cerrado', device: 'Galaxy Z Fold 6 Cover', a11y: true }, // pantalla exterior, alta y estrecha
  { name: 'fold-6-abierto', device: 'Galaxy Z Fold 6', a11y: true }, // pantalla interior, casi cuadrada
  { name: 'fold-7-abierto', device: 'Galaxy Z Fold 7' },
];

const phones: Project[] = DEVICES.flatMap(({ name, device, a11y }) =>
  (['vertical', 'horizontal'] as const).map((orientation): Project => {
    const descriptor = devices[orientation === 'vertical' ? device : `${device} landscape`];
    if (!descriptor) throw new Error(`Playwright no conoce el dispositivo «${device}» (${orientation})`);
    const engine: Engine = real ? descriptor.defaultBrowserType : 'chromium';
    return {
      name: `${engine}-${name}-${orientation}`,
      testMatch: specs(...FUNCIONAL_EN_DISPOSITIVOS, ...(a11y ? ['a11y'] : [])),
      use: { ...descriptor, browserName: engine, ...launch(engine) },
    };
  }),
);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'es-ES', timezoneId: 'Europe/Madrid' },
  projects: [...desktops, ...phones],
  // build + start: es lo que se despliega, y no choca con un `next dev` abierto en el 3000
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { APP_PASSWORD: PASSWORD },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
