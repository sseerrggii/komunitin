import { boot } from "quasar/wrappers";
import VueI18n from "vue-i18n";
import DefaultMessages from "src/i18n/en-us/index.json";
import langs from "src/i18n";
import { LocalStorage, QVueGlobals } from "quasar";
import { formatRelative, Locale } from "date-fns";

/**
 * Default to english language.
 */
const DEFAULT_LANG = "en-us";
/**
 * LocalStorage key for the saved locale.
 */
const LOCALE_KEY = "lang";

/**
 * THe current date locale.
 */
let dateLocale = undefined as Locale | undefined;

/**
 * VueI18n instance with default locale preloaded.
 *
 * Important: Call the boot function before using this variable!
 */
export let i18n: VueI18n;

/**
 * Return locale if it is a defined language for this app,
 * or the default language code (English) instead.
 * **/
function normalizeLocale(locale: string): string {
  return (locale in langs) ? locale : DEFAULT_LANG;
}

/**
 * Return the user locale based on previous session or browser.
 */
function getCurrentLocale($q: QVueGlobals): string {
  // Option 1: Locale saved in LocalStorage from previous session.
  const savedLang = LocalStorage.getItem(LOCALE_KEY);
  if (savedLang !== null) {
    return savedLang as string;
  }
  // Option 2: Use browser language if supported.
  const quasarLang = $q.lang.getLocale() ?? DEFAULT_LANG;
  return normalizeLocale(quasarLang);
}

// Set VueI18n lang.
async function setI18nLocale(locale: string) {
  if (i18n.locale !== locale) {
    const messages = (await import(`src/i18n/${locale}`)).default;
    i18n.setLocaleMessage(locale, messages);
    i18n.locale = locale;
  }
}

// Set Quasar lang.
async function setQuasarLang($q: QVueGlobals, lang: string) {
  const messages = (await import(`quasar/lang/${lang}`)).default;
  $q.lang.set(messages);
}

async function setDateLocale(locale: string) {
  if (locale.includes("-")) {
    locale = locale.split("-",2).map((value, index) => (index > 0 ? value.toUpperCase() : value)).join("-");
  }
  dateLocale = (await import(`date-fns/locale/${locale}/index.js`)).default;
}
/**
 * Asynchronously sets the current locale.
 * **/
async function setLocale($q: QVueGlobals, locale: string) {
  const lang = normalizeLocale(locale);
  await Promise.all([
    setI18nLocale(lang),
    setQuasarLang($q, lang),
    setDateLocale(lang)
  ]);
  localStorage.setItem(LOCALE_KEY, locale);
}

// Default export for Quasar boot files.
export default boot(async ({ app, Vue }) => {
  // Install 'vue-i18n' plugin.
  Vue.use(VueI18n);

  i18n = new VueI18n({
    locale: DEFAULT_LANG,
    fallbackLocale: DEFAULT_LANG,
    messages: {
      [DEFAULT_LANG]: DefaultMessages
    }
  });
  // Add $i18n variable in app.
  app.i18n = i18n;
  // Get Quasar from the Vue constructor prototype.
  const $q = Vue.prototype.$q;
  // Set current locale.
  await setLocale($q, getCurrentLocale($q));

  // Add setLocale function to Vue prototype.
  Vue.prototype.$setLocale = async function(locale: string) {
    // Get Quasar from this Vue instance.
    await setLocale(this.$q, locale);
  };

  // Add date filter to Vue.
  Vue.filter("date", (date: string) =>
    formatRelative(new Date(date), new Date(), {
      locale: dateLocale
    })
  );
});

declare module "vue/types/vue" {
  interface Vue {
    $setLocale: (locale: string) => Promise<void>;
    $formatDate: (date: Date) => string;
  }
}
