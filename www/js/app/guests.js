(function initializeGuests(windowObject) {
    const app = windowObject.BeepWeddingApp || {};

    app.setupGuestManagement = function setupGuestManagement() {
        const guestForm = document.getElementById('guest-form');
        const importButton = document.getElementById('import-button');
        const searchInput = document.getElementById('guest-search');
        const downloadQrButton = document.getElementById('download-qr-button');
        const shareQrButton = document.getElementById('share-qr-button');
        const tableBody = document.getElementById('guest-list-body');
        const qrModal = document.getElementById('qr-modal');
        const importModal = document.getElementById('import-modal');

        document.querySelectorAll('[data-modal-close]').forEach((button) => {
            button.addEventListener('click', app.closeQrModal);
        });

        document.querySelectorAll('[data-open-import-modal]').forEach((button) => {
            button.addEventListener('click', app.openImportModal);
        });

        document.querySelectorAll('[data-import-modal-close]').forEach((button) => {
            button.addEventListener('click', app.closeImportModal);
        });

        if (guestForm) {
            guestForm.addEventListener('submit', app.handleGuestSubmit);
        }

        if (importButton) {
            importButton.addEventListener('click', app.handleImportGuests);
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                app.refreshGuestList();
            });
        }

        if (downloadQrButton) {
            downloadQrButton.addEventListener('click', app.handleDownloadQr);
        }

        if (shareQrButton) {
            shareQrButton.addEventListener('click', app.handleShareQr);
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
                app.selectGuestForQr(hash);
            });
        }

        if (qrModal) {
            qrModal.addEventListener('click', (event) => {
                if (event.target && event.target.hasAttribute && event.target.hasAttribute('data-modal-close')) {
                    app.closeQrModal();
                }
            });
        }

        if (importModal) {
            importModal.addEventListener('click', (event) => {
                if (event.target && event.target.hasAttribute && event.target.hasAttribute('data-import-modal-close')) {
                    app.closeImportModal();
                }
            });
        }
    };

    app.openImportModal = function openImportModal() {
        const importModal = document.getElementById('import-modal');
        const fileInput = document.getElementById('guest-file');

        if (importModal) {
            importModal.classList.add('is-open');
            importModal.setAttribute('aria-hidden', 'false');
        }

        if (fileInput) {
            fileInput.focus();
        }

        app.setText('import-feedback', '');
    };

    app.closeImportModal = function closeImportModal() {
        const importModal = document.getElementById('import-modal');

        if (importModal) {
            importModal.classList.remove('is-open');
            importModal.setAttribute('aria-hidden', 'true');
        }
    };

    app.handleGuestSubmit = async function handleGuestSubmit(event) {
        event.preventDefault();

        const input = document.getElementById('guest-name');
        const nome = input ? input.value.trim() : '';

        if (!nome) {
            app.setText('guest-feedback', 'Informe o nome para cadastrar o convidado.');
            return;
        }

        const hash = app.generateGuestHash();

        try {
            await windowObject.BeepWeddingDatabase.createGuest({
                nome,
                hash,
                status: 'Ausente',
                data_checkin: null
            });

            if (input) {
                input.value = '';
            }

            app.setText('guest-feedback', 'Convidado salvo com sucesso.');
            await app.refreshSummary();
            await app.refreshGuestList();
        } catch (_error) {
            app.setText('guest-feedback', 'Nao foi possivel salvar o convidado. Tente novamente.');
        }
    };

    app.handleImportGuests = async function handleImportGuests() {
        const input = document.getElementById('guest-file');
        const file = input && input.files ? input.files[0] : null;

        if (!file) {
            app.setText('import-feedback', 'Selecione um arquivo CSV ou XLSX antes de importar.');
            return;
        }

        try {
            const rows = await app.readGuestFile(file);
            const guestsToInsert = rows
                .map((row) => String(row || '').trim())
                .filter((nome) => Boolean(nome))
                .map((nome) => ({
                    nome,
                    hash: app.generateGuestHash(),
                    status: 'Ausente',
                    data_checkin: null
                }));

            if (guestsToInsert.length === 0) {
                app.setText('import-feedback', 'Nenhum nome valido foi encontrado no arquivo.');
                return;
            }

            const result = await windowObject.BeepWeddingDatabase.bulkInsertGuests(guestsToInsert);
            app.setText('import-feedback', `${result.inserted} convidados importados com sucesso.`);

            if (input) {
                input.value = '';
            }

            await app.refreshSummary();
            await app.refreshGuestList();

            windowObject.setTimeout(() => {
                app.closeImportModal();
                app.setText('import-feedback', '');
            }, 700);
        } catch (_error) {
            app.setText('import-feedback', 'Falha ao importar arquivo. Verifique o formato e tente novamente.');
        }
    };

    app.readGuestFile = async function readGuestFile(file) {
        const extension = (file.name.split('.').pop() || '').toLowerCase();

        if (extension === 'csv') {
            const text = await app.readFileAsText(file);
            return app.parseCsvRows(text);
        }

        if (extension === 'xlsx') {
            const buffer = await app.readFileAsArrayBuffer(file);
            return app.parseXlsxRows(buffer);
        }

        throw new Error('Formato nao suportado.');
    };

    app.readFileAsText = function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsText(file, 'utf-8');
        });
    };

    app.readFileAsArrayBuffer = function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    app.parseCsvRows = function parseCsvRows(text) {
        const lines = text.replace(/\r/g, '\n').split('\n').filter((line) => line.trim().length > 0);
        if (lines.length === 0) {
            return [];
        }

        const headerRow = app.splitCsvLine(lines[0]).map((column) => column.toLowerCase().trim());
        const nameColumnIndex = headerRow.findIndex((column) => ['nome', 'name', 'convidado'].includes(column));
        const hasHeader = nameColumnIndex >= 0;
        const dataStartIndex = hasHeader ? 1 : 0;
        const fallbackIndex = hasHeader ? nameColumnIndex : 0;

        return lines.slice(dataStartIndex)
            .map((line) => app.splitCsvLine(line)[fallbackIndex] || '')
            .map((value) => String(value).trim());
    };

    app.splitCsvLine = function splitCsvLine(line) {
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
    };

    app.parseXlsxRows = function parseXlsxRows(buffer) {
        if (!windowObject.XLSX || typeof windowObject.XLSX.read !== 'function') {
            throw new Error('Biblioteca XLSX indisponivel.');
        }

        const workbook = windowObject.XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            return [];
        }

        const firstSheet = workbook.Sheets[firstSheetName];
        const rows = windowObject.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false });
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
    };

    app.refreshGuestList = async function refreshGuestList() {
        const tableBody = document.getElementById('guest-list-body');
        if (!tableBody || !windowObject.BeepWeddingDatabase) {
            return;
        }

        const searchInput = document.getElementById('guest-search');
        const term = searchInput ? searchInput.value.trim() : '';
        const canSearch = typeof windowObject.BeepWeddingDatabase.searchGuestsByName === 'function';

        const guests = canSearch
            ? await windowObject.BeepWeddingDatabase.searchGuestsByName(term, 300)
            : await windowObject.BeepWeddingDatabase.listGuests(300);

        app.state.currentGuests = guests;
        app.setText('guest-list-total', `${guests.length} itens`);

        if (guests.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3">Nenhum convidado cadastrado ainda.</td></tr>';
            return;
        }

        tableBody.innerHTML = guests
            .map((guest) => {
                const status = String(guest.status || 'Ausente');
                return `
                    <tr>
                        <td>${app.escapeHtml(guest.nome || '')}</td>
                        <td><span class="status-badge ${app.mapStatusClass(status)}">${app.escapeHtml(status)}</span></td>
                        <td class="guest-table-action-cell"><button class="table-action" type="button" data-qr-hash="${app.escapeHtml(guest.hash || '')}"><span class="button-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16 16h2v2h-2zM16 20h2v2h-2zM20 16h2v2h-2zM20 20h2v2h-2z"></path></svg></span><span>Abrir QR</span></button></td>
                    </tr>
                `;
            })
            .join('');
    };

    app.selectGuestForQr = function selectGuestForQr(hash) {
        const selected = app.state.currentGuests.find((guest) => String(guest.hash) === String(hash));
        if (!selected) {
            app.setText('qr-feedback', 'Convidado nao encontrado para gerar QR Code.');
            return;
        }

        app.renderGuestQr(selected);
    };

    app.renderGuestQr = function renderGuestQr(guest) {
        app.state.selectedGuest = guest;

        const qrModal = document.getElementById('qr-modal');
        const qrTitle = document.getElementById('qr-modal-title');
        const qrContainer = document.getElementById('guest-qr-code');
        const downloadButton = document.getElementById('download-qr-button');
        const shareButton = document.getElementById('share-qr-button');

        if (!qrContainer || !windowObject.QRCode) {
            app.setText('qr-feedback', 'Biblioteca QRCode indisponivel.');
            return;
        }

        qrContainer.innerHTML = '';
        new windowObject.QRCode(qrContainer, {
            text: String(guest.hash || ''),
            width: 190,
            height: 190,
            correctLevel: windowObject.QRCode.CorrectLevel.H
        });

        if (qrTitle) {
            qrTitle.textContent = String(guest.nome || 'Convidado');
        }

        if (downloadButton) {
            downloadButton.disabled = false;
        }

        if (shareButton) {
            shareButton.disabled = false;
        }

        if (qrModal) {
            qrModal.classList.add('is-open');
            qrModal.setAttribute('aria-hidden', 'false');
        }

        app.setText('qr-feedback', 'QR Code gerado com sucesso.');
    };

    app.closeQrModal = function closeQrModal() {
        const qrModal = document.getElementById('qr-modal');

        if (qrModal) {
            qrModal.classList.remove('is-open');
            qrModal.setAttribute('aria-hidden', 'true');
        }

        app.clearQrPreview();
    };

    app.clearQrPreview = function clearQrPreview() {
        app.state.selectedGuest = null;

        const qrContainer = document.getElementById('guest-qr-code');
        const downloadButton = document.getElementById('download-qr-button');
        const shareButton = document.getElementById('share-qr-button');
        const qrTitle = document.getElementById('qr-modal-title');

        if (qrContainer) {
            qrContainer.innerHTML = '';
        }

        if (downloadButton) {
            downloadButton.disabled = true;
        }

        if (shareButton) {
            shareButton.disabled = true;
        }

        if (qrTitle) {
            qrTitle.textContent = 'Selecione um convidado';
        }

        app.setText('qr-feedback', '');
    };

    app.getQrImageDataUrl = function getQrImageDataUrl() {
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
    };

    app.handleDownloadQr = function handleDownloadQr() {
        if (!app.state.selectedGuest) {
            app.setText('qr-feedback', 'Selecione um convidado antes de baixar o QR.');
            return;
        }

        const dataUrl = app.getQrImageDataUrl();
        if (!dataUrl) {
            app.setText('qr-feedback', 'Nao foi possivel gerar a imagem para download.');
            return;
        }

        const fileName = `qr-${String(app.state.selectedGuest.nome || 'convidado').replace(/\s+/g, '-').toLowerCase()}.png`;
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        app.setText('qr-feedback', 'Imagem do QR baixada com sucesso.');
    };

    app.handleShareQr = async function handleShareQr() {
        if (!app.state.selectedGuest) {
            app.setText('qr-feedback', 'Selecione um convidado antes de compartilhar.');
            return;
        }

        const dataUrl = app.getQrImageDataUrl();
        const shareMessage = `Convite Beep Wedding - ${app.state.selectedGuest.nome}`;

        try {
            if (windowObject.plugins && windowObject.plugins.socialsharing && typeof windowObject.plugins.socialsharing.shareWithOptions === 'function') {
                await new Promise((resolve, reject) => {
                    windowObject.plugins.socialsharing.shareWithOptions(
                        {
                            message: shareMessage,
                            files: dataUrl ? [dataUrl] : undefined,
                            subject: 'Convite Beep Wedding'
                        },
                        resolve,
                        reject
                    );
                });

                app.setText('qr-feedback', 'Compartilhamento enviado com sucesso.');
                return;
            }

            if (navigator.share) {
                await navigator.share({
                    title: 'Convite Beep Wedding',
                    text: shareMessage
                });
                app.setText('qr-feedback', 'Compartilhamento enviado com sucesso.');
                return;
            }

            app.setText('qr-feedback', 'Compartilhamento indisponivel neste dispositivo.');
        } catch (_error) {
            app.setText('qr-feedback', 'Nao foi possivel compartilhar o QR Code.');
        }
    };

    windowObject.BeepWeddingApp = app;
}(window));
