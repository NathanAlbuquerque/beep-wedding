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
    setupGuestManagement();
    renderSetupChecklist();
    await refreshSummary();
    await refreshGuestList();
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
        refreshGuestList();
    }
}

function setupGuestManagement() {
    const guestForm = document.getElementById('guest-form');
    const importButton = document.getElementById('import-button');

    if (guestForm) {
        guestForm.addEventListener('submit', handleGuestSubmit);
    }

    if (importButton) {
        importButton.addEventListener('click', handleImportGuests);
    }
}

async function handleGuestSubmit(event) {
    event.preventDefault();

    const input = document.getElementById('guest-name');
    const nome = input ? input.value.trim() : '';

    if (!nome) {
        setText('guest-feedback', 'Informe o nome para cadastrar o convidado.');
        return;
    }

    const hash = generateGuestHash();

    try {
        await window.BeepWeddingDatabase.createGuest({
            nome,
            hash,
            status: 'Ausente',
            data_checkin: null
        });

        if (input) {
            input.value = '';
        }

        setText('guest-feedback', `Convidado salvo com hash ${hash}.`);
        await refreshSummary();
        await refreshGuestList();
    } catch (error) {
        setText('guest-feedback', 'Nao foi possivel salvar o convidado. Tente novamente.');
    }
}

async function handleImportGuests() {
    const input = document.getElementById('guest-file');
    const file = input && input.files ? input.files[0] : null;

    if (!file) {
        setText('import-feedback', 'Selecione um arquivo CSV ou XLSX antes de importar.');
        return;
    }

    try {
        const rows = await readGuestFile(file);
        const guestsToInsert = rows
            .map((row) => String(row || '').trim())
            .filter((nome) => Boolean(nome))
            .map((nome) => ({
                nome,
                hash: generateGuestHash(),
                status: 'Ausente',
                data_checkin: null
            }));

        if (guestsToInsert.length === 0) {
            setText('import-feedback', 'Nenhum nome valido foi encontrado no arquivo.');
            return;
        }

        const result = await window.BeepWeddingDatabase.bulkInsertGuests(guestsToInsert);
        setText('import-feedback', `${result.inserted} convidados importados com sucesso.`);

        if (input) {
            input.value = '';
        }

        await refreshSummary();
        await refreshGuestList();
    } catch (error) {
        setText('import-feedback', 'Falha ao importar arquivo. Verifique o formato e tente novamente.');
    }
}

async function readGuestFile(file) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();

    if (extension === 'csv') {
        const text = await readFileAsText(file);
        return parseCsvRows(text);
    }

    if (extension === 'xlsx') {
        const buffer = await readFileAsArrayBuffer(file);
        return parseXlsxRows(buffer);
    }

    throw new Error('Formato nao suportado.');
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
    });
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseCsvRows(text) {
    const lines = text.replace(/\r/g, '\n').split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }

    const headerRow = splitCsvLine(lines[0]).map((column) => column.toLowerCase().trim());
    const nameColumnIndex = headerRow.findIndex((column) => ['nome', 'name', 'convidado'].includes(column));
    const hasHeader = nameColumnIndex >= 0;
    const dataStartIndex = hasHeader ? 1 : 0;
    const fallbackIndex = hasHeader ? nameColumnIndex : 0;

    return lines.slice(dataStartIndex)
        .map((line) => splitCsvLine(line)[fallbackIndex] || '')
        .map((value) => String(value).trim());
}

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (quoted && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }

        if ((char === ',' || char === ';') && !quoted) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function parseXlsxRows(buffer) {
    if (!window.XLSX || typeof window.XLSX.read !== 'function') {
        throw new Error('Biblioteca XLSX indisponivel.');
    }

    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return [];
    }

    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    const header = (rows[0] || []).map((column) => String(column).toLowerCase().trim());
    const nameColumnIndex = header.findIndex((column) => ['nome', 'name', 'convidado'].includes(column));
    const hasHeader = nameColumnIndex >= 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const columnIndex = hasHeader ? nameColumnIndex : 0;

    return dataRows
        .map((row) => (Array.isArray(row) ? row[columnIndex] : ''))
        .map((value) => String(value || '').trim());
}

async function refreshGuestList() {
    const tableBody = document.getElementById('guest-list-body');
    if (!tableBody || !window.BeepWeddingDatabase || !window.BeepWeddingDatabase.listGuests) {
        return;
    }

    const guests = await window.BeepWeddingDatabase.listGuests(40);
    setText('guest-list-total', `${guests.length} itens`);

    if (guests.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3">Nenhum convidado cadastrado ainda.</td></tr>';
        return;
    }

    tableBody.innerHTML = guests
        .map((guest) => {
            const status = String(guest.status || 'Ausente');
            return `
                <tr>
                    <td>${escapeHtml(guest.nome || '')}</td>
                    <td><span class="status-badge ${mapStatusClass(status)}">${escapeHtml(status)}</span></td>
                    <td>${escapeHtml(guest.hash || '')}</td>
                </tr>
            `;
        })
        .join('');
}

function generateGuestHash() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    const random = Math.random().toString(16).slice(2);
    const now = Date.now().toString(16);
    return `${now}-${random}`;
}

function mapStatusClass(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'presente') {
        return 'status-presente';
    }
    if (value === 'saiu') {
        return 'status-saiu';
    }
    return 'status-ausente';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
