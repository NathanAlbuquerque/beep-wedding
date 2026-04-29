(function initializeCore(windowObject) {
    const app = windowObject.BeepWeddingApp || {};
    const configuredEventName = windowObject.BEEP_WEDDING_EVENT_NAME || windowObject.BEEP_WEDDING_EVENT || '';

    app.state = app.state || {
        booted: false,
        summaryTimer: null,
        currentGuests: [],
        selectedGuest: null,
        historyLog: [],
        scannerActive: false,
        toastTimer: null
    };

    app.config = app.config || {
        eventName: String(configuredEventName || '').trim() || 'Casamento Denyse & Nathan'
    };

    app.normalizeGuestPassword = function normalizeGuestPassword(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
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

    app.applyEventTitle = function applyEventTitle() {
        const titleElement = document.getElementById('event-title');
        if (!titleElement) {
            return;
        }

        titleElement.textContent = String(app.config.eventName || 'Beep Wedding');
    };

    app.showToast = function showToast(message, tone) {
        const toast = document.getElementById('app-toast');
        if (!toast) {
            return;
        }

        if (app.state.toastTimer) {
            windowObject.clearTimeout(app.state.toastTimer);
            app.state.toastTimer = null;
        }

        toast.textContent = String(message || '');
        toast.classList.remove('is-success', 'is-error', 'is-visible');

        const toneClass = String(tone || '').toLowerCase() === 'error' ? 'is-error' : 'is-success';
        toast.classList.add(toneClass, 'is-visible');
        toast.setAttribute('aria-hidden', 'false');

        app.state.toastTimer = windowObject.setTimeout(() => {
            toast.classList.remove('is-visible');
            toast.setAttribute('aria-hidden', 'true');
            app.state.toastTimer = null;
        }, 2200);
    };

    app.generateGuestHash = function generateGuestHash() {
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const digits = '23456789';
        const pick = (characters) => characters.charAt(Math.floor(Math.random() * characters.length));

        return `${pick(letters)}${pick(digits)}${pick(letters)}${pick(digits)}`;
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
        if (typeof app.refreshHistory === 'function') {
            try {
                await app.refreshHistory();
            } catch (_e) {
                // ignore
            }
        }
    };

    app.getHistoryStorageKey = function getHistoryStorageKey() {
        return 'beepWeddingHistoryLog';
    };

    app.loadHistoryLog = function loadHistoryLog() {
        try {
            const raw = windowObject.localStorage.getItem(app.getHistoryStorageKey());
            const parsed = raw ? JSON.parse(raw) : [];
            app.state.historyLog = Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            app.state.historyLog = [];
        }

        return app.state.historyLog;
    };

    app.saveHistoryLog = function saveHistoryLog() {
        try {
            windowObject.localStorage.setItem(app.getHistoryStorageKey(), JSON.stringify(app.state.historyLog || []));
        } catch (_error) {
            // ignore storage errors
        }
    };

    app.appendHistoryEntry = function appendHistoryEntry(entry) {
        const nextEntry = {
            nome: String(entry && entry.nome ? entry.nome : ''),
            hash: String(entry && entry.hash ? entry.hash : ''),
            status: String(entry && entry.status ? entry.status : ''),
            time: String(entry && entry.time ? entry.time : new Date().toISOString())
        };

        app.state.historyLog = Array.isArray(app.state.historyLog) ? app.state.historyLog : [];
        app.state.historyLog.unshift(nextEntry);
        app.state.historyLog = app.state.historyLog.slice(0, 100);
        app.saveHistoryLog();
    };

    app.refreshHistory = async function refreshHistory() {
        const container = document.getElementById('history-list');
        if (!container) {
            return;
        }

        if (!Array.isArray(app.state.historyLog) || app.state.historyLog.length === 0) {
            app.loadHistoryLog();
        }

        const records = (app.state.historyLog || [])
            .filter((r) => r && r.time)
            .slice(0, 50);

        if (records.length === 0) {
            container.innerHTML = '<div class="guest-block-empty">Nenhum registro recente.</div>';
            return;
        }

        container.innerHTML = records.map((r) => {
            const t = new Date(r.time);
            const time = isNaN(t.getTime()) ? String(r.time) : t.toLocaleString('pt-BR');
            return `<article class="guest-block-item"><div class="guest-block-main"><div class="guest-block-field"><strong class="guest-block-value guest-block-value-name">${app.escapeHtml(r.nome)}</strong></div><div class="guest-block-field"><span class="guest-block-value guest-block-value-status"><span class="status-badge ${app.mapStatusClass(r.status)}">${app.escapeHtml(r.status)}</span></span></div></div><div class="guest-block-meta"><small>${time}</small></div></article>`;
        }).join('');
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
        app.applyEventTitle();
        app.loadHistoryLog();

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
