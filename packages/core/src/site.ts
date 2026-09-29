// The only place the site host is defined (PLAN §0). Change the domain here and nowhere else.
export const SITE_URL = 'https://whirlpick.vercel.app';
export const FALLBACK_SITE_URLS = ['https://getwhirlpick.vercel.app', 'https://whirlpickapp.vercel.app'] as const;
export const REPO_URL = 'https://github.com/btahir/whirlpick';
export const SCHEMA_URLS = {
  whirl: `${SITE_URL}/schema/whirl-v1.json`,
  receipt: `${SITE_URL}/schema/receipt-v1.json`,
} as const;
export const APP_NAME = 'Whirlpick';
export const APP_VERSION = '0.1.0';
