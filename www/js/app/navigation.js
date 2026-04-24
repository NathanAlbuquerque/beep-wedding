(function initializeNavigation(windowObject) {
    const app = windowObject.BeepWeddingApp || {};

    app.setupNavigation = function setupNavigation() {
        const navButtons = document.querySelectorAll('[data-nav-target]');

        navButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.getAttribute('data-nav-target');
                app.navigateToScreen(target, true);
            });
        });

        app.handleHashNavigation();
    };

    app.handleHashNavigation = function handleHashNavigation() {
        const hash = windowObject.location.hash.replace('#', '').trim();
        const targetScreen = hash || 'dashboard';
        app.navigateToScreen(targetScreen, false);
    };

    app.navigateToScreen = function navigateToScreen(screenName, updateHash) {
        if (app.state && app.state.scannerActive && screenName !== 'checkin' && typeof app.cancelQrScan === 'function') {
            app.cancelQrScan();
        }

        const validScreens = ['dashboard', 'convidados', 'checkin'];
        const targetScreen = validScreens.includes(screenName) ? screenName : 'dashboard';

        document.querySelectorAll('[data-screen]').forEach((screen) => {
            const isActive = screen.getAttribute('data-screen') === targetScreen;
            screen.classList.toggle('is-active', isActive);
            screen.setAttribute('aria-hidden', String(!isActive));
        });

        document.querySelectorAll('[data-nav-target]').forEach((button) => {
            const isActive = button.getAttribute('data-nav-target') === targetScreen;
            button.classList.toggle('is-active', isActive);
        });

        if (updateHash) {
            windowObject.location.hash = targetScreen;
        }
    };

    windowObject.BeepWeddingApp = app;
}(window));
