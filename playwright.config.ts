import { defineConfig } from '@playwright/test';

const PORT = 3100;
const PASSWORD = 'test'; // la usa el servidor de pruebas y tests/e2e/helpers.ts; no es la real

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'es-ES', timezoneId: 'Europe/Madrid' },
  projects: [
    {
      name: 'brave',
      // shortcut: solo Brave en local; en CI PW_BROWSER='' usa el Chromium de Playwright. Firefox/WebKit, cuando se quieran
      use: { browserName: 'chromium', launchOptions: { executablePath: (process.env.PW_BROWSER ?? '/usr/bin/brave-origin') || undefined } },
    },
  ],
  // build + start: es lo que se despliega, y no choca con un `next dev` abierto en el 3000
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { APP_PASSWORD: PASSWORD },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
