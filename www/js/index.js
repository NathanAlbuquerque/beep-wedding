document.addEventListener('deviceready', bootApp, false);
document.addEventListener('DOMContentLoaded', handleBrowserPreview, false);
window.addEventListener('hashchange', handleHashNavigation, false);
document.addEventListener('visibilitychange', handleVisibilityChange, false);

let booted = false;
let summaryTimer = null;
let currentGuests = [];
let selectedGuest = null;

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
    setupCheckinScanner();
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
    const searchInput = document.getElementById('guest-search');
    const downloadQrButton = document.getElementById('download-qr-button');
    const shareQrButton = document.getElementById('share-qr-button');
    const tableBody = document.getElementById('guest-list-body');

    if (guestForm) {
        guestForm.addEventListener('submit', handleGuestSubmit);
    }

    if (importButton) {
        importButton.addEventListener('click', handleImportGuests);
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            refreshGuestList();
        });
    }

    if (downloadQrButton) {
        downloadQrButton.addEventListener('click', handleDownloadQr);
    }

    if (shareQrButton) {
        shareQrButton.addEventListener('click', handleShareQr);
    }

    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const target = event.target;
            if (!target || !target.closest) {
                return;
            }

            const actionButton = target.closest('[data-qr-hash]');
            if (!actionButton) {
                return;
            }

            const hash = actionButton.getAttribute('data-qr-hash');
            selectGuestForQr(hash);
        });
    }
}

function setupCheckinScanner() {
    const scanButton = document.getElementById('scan-qr-button');
    const confirmPresenceButton = document.getElementById('confirm-presence-button');
    const guestExitButton = document.getElementById('guest-exit-button');

    if (scanButton) {
        scanButton.addEventListener('click', startQrScan);
    }

    if (confirmPresenceButton) {
        confirmPresenceButton.addEventListener('click', handleConfirmPresence);
    }

    if (guestExitButton) {
        guestExitButton.addEventListener('click', handleGuestExit);
    }
}

async function startQrScan() {
    setText('scan-feedback', 'Abrindo camera para leitura...');
    clearScanResult();

    try {
        const scannedHash = await scanQrCode();
        if (!scannedHash) {
            setText('scan-feedback', 'Leitura cancelada.');
            return;
        }

        const guest = await validateGuestByHash(scannedHash);

        if (!guest) {
            renderScanError(scannedHash);
            return;
        }

        renderScanSuccess(guest);
    } catch (error) {
        setText('scan-feedback', 'Falha ao ler QR Code. Tente novamente.');
    }
}

function scanQrCode() {
    return new Promise((resolve, reject) => {
        const barcodeScanner = window.cordova && window.cordova.plugins
            ? window.cordova.plugins.barcodeScanner
            : null;

        if (!barcodeScanner || typeof barcodeScanner.scan !== 'function') {
            const manualHash = window.prompt('Scanner indisponivel no preview. Cole o hash para validar:');
            resolve(manualHash ? String(manualHash).trim() : '');
            return;
        }

        barcodeScanner.scan(
            (result) => {
                if (!result || result.cancelled) {
                    resolve('');
                    return;
                }

                resolve(normalizeScannedHash(result.text));
            },
            (error) => reject(error),
            {
                preferFrontCamera: false,
                showFlipCameraButton: true,
                showTorchButton: true,
                disableAnimations: true,
                resultDisplayDuration: 0,
                formats: 'QR_CODE',
                prompt: 'Aponte para o QR Code do convite'
            }
        );
    });
}

function normalizeScannedHash(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }

    // Accept plain hashes and common payload wrappers like URL with ?hash=... or /invite/<hash>.
    try {
        const parsedUrl = new URL(raw);
        const queryHash = parsedUrl.searchParams.get('hash');
        if (queryHash) {
            return String(queryHash).trim();
        }

        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            return String(pathSegments[pathSegments.length - 1]).trim();
        }
    } catch (_error) {
        // Not a URL, keep raw payload.
    }

    return raw;
}

async function validateGuestByHash(hash) {
    if (!window.BeepWeddingDatabase || typeof window.BeepWeddingDatabase.findGuestByHash !== 'function') {
        return null;
    }

    return window.BeepWeddingDatabase.findGuestByHash(hash);
}

function renderScanSuccess(guest) {
    const card = document.getElementById('scan-result-card');
    const confirmPresenceButton = document.getElementById('confirm-presence-button');
    const guestExitButton = document.getElementById('guest-exit-button');
    if (card) {
        card.setAttribute('aria-hidden', 'false');
        card.classList.remove('is-error');
        card.classList.add('is-success');
    }

    if (confirmPresenceButton) {
        confirmPresenceButton.disabled = false;
    }

    if (guestExitButton) {
        guestExitButton.disabled = false;
    }

    setText('scan-feedback', 'Convidado validado com sucesso.');
    setText('scan-result-title', 'Convidado encontrado');
    setText('scan-guest-name', String(guest.nome || '-'));
    setText('scan-guest-status', String(guest.status || '-'));
    setText('scan-guest-hash', String(guest.hash || '-'));
}

function renderScanError(hash) {
    selectedGuest = null;

    const card = document.getElementById('scan-result-card');
    const confirmPresenceButton = document.getElementById('confirm-presence-button');
    const guestExitButton = document.getElementById('guest-exit-button');
    if (card) {
        card.setAttribute('aria-hidden', 'false');
        card.classList.remove('is-success');
        card.classList.add('is-error');
    }

    if (confirmPresenceButton) {
        confirmPresenceButton.disabled = true;
    }

    if (guestExitButton) {
        guestExitButton.disabled = true;
    }

    setText('scan-feedback', 'Convidado nao encontrado, por favor leia o QR Code novamente.');
    setText('scan-result-title', 'QR invalido ou nao cadastrado');
    setText('scan-guest-name', '-');
    setText('scan-guest-status', '-');
    setText('scan-guest-hash', String(hash || '-'));
}

function clearScanResult() {
    selectedGuest = null;

    const card = document.getElementById('scan-result-card');
    const confirmPresenceButton = document.getElementById('confirm-presence-button');
    const guestExitButton = document.getElementById('guest-exit-button');
    if (card) {
        card.setAttribute('aria-hidden', 'true');
        card.classList.remove('is-success');
        card.classList.remove('is-error');
    }

    if (confirmPresenceButton) {
        confirmPresenceButton.disabled = true;
    }

    if (guestExitButton) {
        guestExitButton.disabled = true;
    }

    setText('scan-result-title', 'Convidado encontrado');
    setText('scan-guest-name', '-');
    setText('scan-guest-status', '-');
    setText('scan-guest-hash', '-');
}

async function handleConfirmPresence() {
    await handleAccessAction('Presente', 'Presença confirmada com sucesso.');
}

async function handleGuestExit() {
    await handleAccessAction('Saiu', 'Saída registrada com sucesso.');
}

async function handleAccessAction(nextStatus, successMessage) {
    if (!selectedGuest) {
        setText('scan-feedback', 'Leia um QR Code valido antes de executar a acao.');
        return;
    }

    try {
        const updatedGuest = await window.BeepWeddingDatabase.updateGuestStatus(
            selectedGuest.hash,
            nextStatus,
            new Date().toISOString()
        );

        if (!updatedGuest) {
            setText('scan-feedback', 'Nao foi possivel atualizar o convidado.');
            return;
        }

        selectedGuest = updatedGuest;
        renderScanSuccess(updatedGuest);
        setText('scan-guest-status', String(updatedGuest.status || nextStatus));
        setText('scan-feedback', successMessage);

        await refreshSummary();
        await refreshGuestList();
    } catch (error) {
        setText('scan-feedback', 'Nao foi possivel atualizar o status do convidado.');
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
    if (!tableBody || !window.BeepWeddingDatabase) {
        return;
    }

    const searchInput = document.getElementById('guest-search');
    const term = searchInput ? searchInput.value.trim() : '';
    const canSearch = typeof window.BeepWeddingDatabase.searchGuestsByName === 'function';

    const guests = canSearch
        ? await window.BeepWeddingDatabase.searchGuestsByName(term, 300)
        : await window.BeepWeddingDatabase.listGuests(300);

    currentGuests = guests;

    setText('guest-list-total', `${guests.length} itens`);

    if (guests.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">Nenhum convidado cadastrado ainda.</td></tr>';
        clearQrPreview();
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
                    <td><button class="table-action" type="button" data-qr-hash="${escapeHtml(guest.hash || '')}">Ver QR</button></td>
                </tr>
            `;
        })
        .join('');

    if (selectedGuest) {
        const updatedSelected = guests.find((guest) => guest.hash === selectedGuest.hash);
        if (updatedSelected) {
            renderGuestQr(updatedSelected);
            return;
        }
    }

    clearQrPreview();
}

function selectGuestForQr(hash) {
    const selected = currentGuests.find((guest) => String(guest.hash) === String(hash));
    if (!selected) {
        setText('qr-feedback', 'Convidado nao encontrado para gerar QR Code.');
        return;
    }

    renderGuestQr(selected);
}

function renderGuestQr(guest) {
    selectedGuest = guest;

    const qrPanel = document.getElementById('qr-panel');
    const qrContainer = document.getElementById('guest-qr-code');
    const downloadButton = document.getElementById('download-qr-button');
    const shareButton = document.getElementById('share-qr-button');

    if (!qrContainer || !window.QRCode) {
        setText('qr-feedback', 'Biblioteca QRCode indisponivel.');
        return;
    }

    qrContainer.innerHTML = '';
    new window.QRCode(qrContainer, {
        text: String(guest.hash || ''),
        width: 190,
        height: 190,
        correctLevel: window.QRCode.CorrectLevel.H
    });

    if (qrPanel) {
        qrPanel.setAttribute('aria-hidden', 'false');
    }

    if (downloadButton) {
        downloadButton.disabled = false;
    }

    if (shareButton) {
        shareButton.disabled = false;
    }

    setText('qr-guest-name', String(guest.nome || 'Convidado'));
    setText('qr-hash', String(guest.hash || '-'));
    setText('qr-feedback', 'QR Code gerado com sucesso.');
}

function clearQrPreview() {
    selectedGuest = null;

    const qrContainer = document.getElementById('guest-qr-code');
    const downloadButton = document.getElementById('download-qr-button');
    const shareButton = document.getElementById('share-qr-button');

    if (qrContainer) {
        qrContainer.innerHTML = '';
    }

    if (downloadButton) {
        downloadButton.disabled = true;
    }

    if (shareButton) {
        shareButton.disabled = true;
    }

    setText('qr-guest-name', 'Selecione um convidado');
    setText('qr-hash', '-');
    setText('qr-feedback', '');
}

function getQrImageDataUrl() {
    const qrContainer = document.getElementById('guest-qr-code');
    if (!qrContainer) {
        return null;
    }

    const canvas = qrContainer.querySelector('canvas');
    if (canvas && typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
    }

    const image = qrContainer.querySelector('img');
    if (image && image.src) {
        return image.src;
    }

    return null;
}

function handleDownloadQr() {
    if (!selectedGuest) {
        setText('qr-feedback', 'Selecione um convidado antes de baixar o QR.');
        return;
    }

    const dataUrl = getQrImageDataUrl();
    if (!dataUrl) {
        setText('qr-feedback', 'Nao foi possivel gerar a imagem para download.');
        return;
    }

    const fileName = `qr-${String(selectedGuest.nome || 'convidado').replace(/\s+/g, '-').toLowerCase()}.png`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setText('qr-feedback', 'Imagem do QR baixada com sucesso.');
}

async function handleShareQr() {
    if (!selectedGuest) {
        setText('qr-feedback', 'Selecione um convidado antes de compartilhar.');
        return;
    }

    const dataUrl = getQrImageDataUrl();
    const shareMessage = `Convite Beep Wedding - ${selectedGuest.nome} - hash ${selectedGuest.hash}`;

    try {
        if (window.plugins && window.plugins.socialsharing && typeof window.plugins.socialsharing.shareWithOptions === 'function') {
            await new Promise((resolve, reject) => {
                window.plugins.socialsharing.shareWithOptions(
                    {
                        message: shareMessage,
                        files: dataUrl ? [dataUrl] : undefined,
                        subject: 'Convite Beep Wedding'
                    },
                    resolve,
                    reject
                );
            });

            setText('qr-feedback', 'Compartilhamento enviado com sucesso.');
            return;
        }

        if (navigator.share) {
            await navigator.share({
                title: 'Convite Beep Wedding',
                text: shareMessage
            });
            setText('qr-feedback', 'Compartilhamento enviado com sucesso.');
            return;
        }

        setText('qr-feedback', 'Compartilhamento indisponivel neste dispositivo.');
    } catch (error) {
        setText('qr-feedback', 'Nao foi possivel compartilhar o QR Code.');
    }
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
