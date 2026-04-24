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

    document.addEventListener('deviceready', () => {
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
}(window));
