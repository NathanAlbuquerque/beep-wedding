(function bootstrap(windowObject) {
    const app = windowObject.BeepWeddingApp;

    if (!app) {
        throw new Error('BeepWeddingApp nao inicializado. Verifique a ordem dos scripts.');
    }

    async function handleBrowserPreview() {
        if (windowObject.cordova) {
            return;
        }

        await app.boot();
    }

    function hideStartupScreen() {
        const startupScreen = document.getElementById('startup-screen');
        const appShell = document.querySelector('.app-shell');

        if (startupScreen) {
            startupScreen.classList.add('is-hidden');
            startupScreen.setAttribute('aria-hidden', 'true');
        }

        if (appShell) {
            appShell.setAttribute('aria-hidden', 'false');
        }

        document.body.classList.remove('startup-locked');
    }

    function setupStartupScreen() {
        const startButton = document.getElementById('start-app-button');

        if (!startButton) {
            hideStartupScreen();
            return;
        }

        startButton.addEventListener('click', hideStartupScreen, { once: true });
    }

    document.addEventListener('DOMContentLoaded', setupStartupScreen, false);

    document.addEventListener('deviceready', () => {
        if (windowObject.navigator && windowObject.navigator.splashscreen && typeof windowObject.navigator.splashscreen.hide === 'function') {
            windowObject.navigator.splashscreen.hide();
        }

        app.boot();
    }, false);

    document.addEventListener('DOMContentLoaded', handleBrowserPreview, false);

    windowObject.addEventListener('hashchange', () => {
        if (typeof app.handleHashNavigation === 'function') {
            app.handleHashNavigation();
        }
    }, false);

    document.addEventListener('visibilitychange', () => {
        app.handleVisibilityChange();
    }, false);

    document.addEventListener('pause', () => {
        if (typeof app.cancelQrScan === 'function') {
            app.cancelQrScan();
        }
    }, false);

    windowObject.addEventListener('beforeunload', () => {
        if (typeof app.cancelQrScan === 'function') {
            app.cancelQrScan();
        }
    }, false);
}(window));
