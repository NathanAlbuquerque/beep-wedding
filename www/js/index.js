document.addEventListener('deviceready', bootApp, false);
document.addEventListener('DOMContentLoaded', handleBrowserPreview, false);
window.addEventListener('hashchange', handleHashNavigation, false);
document.addEventListener('visibilitychange', handleVisibilityChange, false);

let booted = false;
let summaryTimer = null;

async function bootApp() {
    if (booted) {
        return;
    }

    booted = true;
    await initializeBaseState();
}

async function handleBrowserPreview() {
    if (window.cordova) {
        return;
    }

    await bootApp();
}

async function initializeBaseState() {
    setStatus('Preparando armazenamento local...');

    if (window.BeepWeddingDatabase) {
        await window.BeepWeddingDatabase.initialize();
    }

    setupNavigation();
    renderSetupChecklist();
    await refreshSummary();
    startSummaryAutoRefresh();

    const storageMode = window.BeepWeddingDatabase && window.BeepWeddingDatabase.getMode
        ? window.BeepWeddingDatabase.getMode()
        : 'local';

    setStatus(`Base pronta para operação offline (${storageMode}).`);
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('[data-nav-target]');

    navButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-nav-target');
            navigateToScreen(target, true);
        });
    });

    handleHashNavigation();
}

function handleHashNavigation() {
    const hash = window.location.hash.replace('#', '').trim();
    const targetScreen = hash || 'dashboard';
    navigateToScreen(targetScreen, false);
}

function navigateToScreen(screenName, updateHash) {
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
        window.location.hash = targetScreen;
    }
}

function startSummaryAutoRefresh() {
    if (summaryTimer) {
        window.clearInterval(summaryTimer);
    }

    summaryTimer = window.setInterval(() => {
        refreshSummary();
    }, 3000);
}

function handleVisibilityChange() {
    if (!document.hidden) {
        refreshSummary();
    }
}

function renderSetupChecklist() {
    const checklist = document.getElementById('setup-checklist');

    if (!checklist || !window.BeepWeddingPermissions) {
        return;
    }

    checklist.innerHTML = window.BeepWeddingPermissions.getSetupChecklist()
        .map((item) => `<li><div><strong>${item.title}</strong><p>${item.description}</p></div></li>`)
        .join('');
}

async function refreshSummary() {
    const summary = window.BeepWeddingDatabase && window.BeepWeddingDatabase.getSummary
        ? await window.BeepWeddingDatabase.getSummary()
        : { total: 0, present: 0, absent: 0 };

    setText('metric-total', summary.total ?? 0);
    setText('metric-present', summary.present ?? 0);
    setText('metric-absent', summary.absent ?? 0);
    setText('last-sync', `Atualizado as ${new Date().toLocaleTimeString('pt-BR')}`);
}

function setStatus(message) {
    setText('app-status', message);
}

function setText(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
        element.textContent = String(value);
    }
}
