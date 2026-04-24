(function initializeCore(windowObject) {
    const app = windowObject.BeepWeddingApp || {};

    app.state = app.state || {
        booted: false,
        summaryTimer: null,
        currentGuests: [],
        selectedGuest: null,
        scannerActive: false
    };

    app.setText = function setText(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = String(value);
        }
    };

    app.setStatus = function setStatus(message) {
        app.setText('app-status', message);
    };

    app.generateGuestHash = function generateGuestHash() {
        if (windowObject.crypto && typeof windowObject.crypto.randomUUID === 'function') {
            return windowObject.crypto.randomUUID();
        }

        const random = Math.random().toString(16).slice(2);
        const now = Date.now().toString(16);
        return `${now}-${random}`;
    };

    app.mapStatusClass = function mapStatusClass(status) {
        const value = String(status || '').toLowerCase();
        if (value === 'presente') {
            return 'status-presente';
        }
        if (value === 'saiu') {
            return 'status-saiu';
        }
        return 'status-ausente';
    };

    app.escapeHtml = function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    app.renderSetupChecklist = function renderSetupChecklist() {
        const checklist = document.getElementById('setup-checklist');
        if (!checklist || !windowObject.BeepWeddingPermissions) {
            return;
        }

        checklist.innerHTML = windowObject.BeepWeddingPermissions.getSetupChecklist()
            .map((item) => `<li><div><strong>${item.title}</strong><p>${item.description}</p></div></li>`)
            .join('');
    };

    app.refreshSummary = async function refreshSummary() {
        const summary = windowObject.BeepWeddingDatabase && windowObject.BeepWeddingDatabase.getSummary
            ? await windowObject.BeepWeddingDatabase.getSummary()
            : { total: 0, present: 0, absent: 0 };

        app.setText('metric-total', summary.total ?? 0);
        app.setText('metric-present', summary.present ?? 0);
        app.setText('metric-absent', summary.absent ?? 0);
        app.setText('last-sync', `Atualizado as ${new Date().toLocaleTimeString('pt-BR')}`);
    };

    app.startSummaryAutoRefresh = function startSummaryAutoRefresh() {
        if (app.state.summaryTimer) {
            windowObject.clearInterval(app.state.summaryTimer);
        }

        app.state.summaryTimer = windowObject.setInterval(() => {
            app.refreshSummary();
        }, 3000);
    };

    app.handleVisibilityChange = function handleVisibilityChange() {
        if (!document.hidden) {
            app.refreshSummary();
            if (typeof app.refreshGuestList === 'function') {
                app.refreshGuestList();
            }
        }
    };

    app.initializeBaseState = async function initializeBaseState() {
        app.setStatus('Preparando armazenamento local...');

        if (windowObject.BeepWeddingDatabase) {
            await windowObject.BeepWeddingDatabase.initialize();
        }

        if (typeof app.setupNavigation === 'function') {
            app.setupNavigation();
        }
        if (typeof app.setupGuestManagement === 'function') {
            app.setupGuestManagement();
        }
        if (typeof app.setupCheckinScanner === 'function') {
            app.setupCheckinScanner();
        }

        app.renderSetupChecklist();
        await app.refreshSummary();
        if (typeof app.refreshGuestList === 'function') {
            await app.refreshGuestList();
        }
        app.startSummaryAutoRefresh();

        app.setStatus('Sistema pronto para operacao.');
    };

    app.boot = async function boot() {
        if (app.state.booted) {
            return;
        }

        app.state.booted = true;
        await app.initializeBaseState();
    };

    windowObject.BeepWeddingApp = app;
}(window));
