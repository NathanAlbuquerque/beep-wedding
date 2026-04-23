document.addEventListener('deviceready', bootApp, false);
document.addEventListener('DOMContentLoaded', handleBrowserPreview, false);

let booted = false;

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

    renderSetupChecklist();
    await refreshSummary();

    const storageMode = window.BeepWeddingDatabase && window.BeepWeddingDatabase.getMode
        ? window.BeepWeddingDatabase.getMode()
        : 'local';

    setStatus(`Base pronta para operação offline (${storageMode}).`);
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
