import Vue from 'vue';

import KError, { KErrorCode } from '../KError';
import { Notify } from 'quasar'
import { i18n } from './i18n'
import { boot } from 'quasar/wrappers';


/**
 * Get the localized message for the error.
 * 
 * @param error The error.
 */
function getLocalizedMessage(error: KError): string {
  return i18n.t(error.getTranslationKey()).toString();
}

/**
 * Show error to the user.
 * 
 * @param error The error to be shown.
 */
function showError(error: KError) {
  Notify.create({
    color: 'negative',
    position: 'top',
    message: getLocalizedMessage(error)
  });
}

/**
 * Write an error line to the JavaScript console.
 * 
 * @param error The error to be logged.
 */
function logError(error: KError) {
  // eslint-disable-next-line no-console
  console.error(`[${error.code}] ${error}`);
}

/**
 * Log error produced while trying to handle the error. 
 */
function logErrorHandling(error: Error) {
  // eslint-disable-next-line no-console
  console.error(`[${KErrorCode.ErrorHandling}] Error while handling another error: ${error.message}`);
}

export function handleError(error: KError): void {
  logError(error);
  showError(error);
}

declare module 'vue/types/vue' {
  interface Vue {
    /**
     * Main function for error handling.
     * 
     * Use this function when you can continue the execution but you want to log the error anyway. Otherwise
     * just throw the KError.
     * 
     * @param error The error to handle
     */
    $handleError: typeof handleError;
  }
} 

function vueWarnHandler(message: string, vm: Vue, trace: string) {
  const error = new KError(KErrorCode.VueWarning, message + trace, {message, trace, vm});
  try {
    handleError(error);
  }
  catch (exception) {
    logErrorHandling(error);
  }
}

/**
 * Register global error handler for errors occurred outside Vue components. 
 */
if (window !== undefined) {
  window.addEventListener('error', function(event: ErrorEvent) {
    // This error is thrown but is harmless, so we can safely ignore it.
    // In fact, it is mandatory that we ignore it since otherwise we enter 
    // in an infinite loop due to the notification widget.
    if (event.message.includes("ResizeObserver loop limit exceeded")) {
      // TODO: Maybe remove this warning in production.
      if (process.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(event.message);
      }
      return;
    }
    let kerror: KError;
    if (event.error instanceof KError) {
      kerror = event.error;
    }
    else {
      kerror = new KError(KErrorCode.UnknownScript, event.message, {url: event.filename , line: event.lineno, column: event.colno, error: event.error})
    }
    try {
      handleError(kerror);
    }
    catch(error) {
      logErrorHandling(kerror);
    }
  });
}

export default boot(({Vue}) => {
  // Add handleError() function to Vue prototype.
  Vue.prototype.$handleError = handleError;
  // Set Vue warning handler.
  Vue.config.warnHandler = vueWarnHandler;
});