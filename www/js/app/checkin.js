(function initializeCheckin(windowObject) {
    const app = windowObject.BeepWeddingApp || {};

    app.setupCheckinScanner = function setupCheckinScanner() {
        const scanButton = document.getElementById('scan-qr-button');
        const confirmPresenceButton = document.getElementById('confirm-presence-button');
        const guestExitButton = document.getElementById('guest-exit-button');

        if (scanButton) {
            scanButton.addEventListener('click', app.startQrScan);
        }

        if (confirmPresenceButton) {
            confirmPresenceButton.addEventListener('click', app.handleConfirmPresence);
        }

        if (guestExitButton) {
            guestExitButton.addEventListener('click', app.handleGuestExit);
        }
    };

    app.startQrScan = async function startQrScan() {
        app.setText('scan-feedback', 'Abrindo camera para leitura...');
        app.clearScanResult();

        try {
            const scannedHash = await app.scanQrCode();
            if (!scannedHash) {
                app.setText('scan-feedback', 'Leitura cancelada.');
                return;
            }

            const guest = await app.validateGuestByHash(scannedHash);
            if (!guest) {
                app.renderScanError();
                return;
            }

            app.state.selectedGuest = guest;
            app.renderScanSuccess(guest);
        } catch (_error) {
            app.setText('scan-feedback', 'Falha ao ler QR Code. Tente novamente.');
        }
    };

    app.scanQrCode = function scanQrCode() {
        return new Promise((resolve, reject) => {
            const mlkitScanner = windowObject.cordova && windowObject.cordova.plugins && windowObject.cordova.plugins.mlkit
                ? windowObject.cordova.plugins.mlkit.barcodeScanner
                : null;

            if (mlkitScanner && typeof mlkitScanner.scan === 'function') {
                mlkitScanner.scan(
                    {
                        barcodeFormats: {
                            QRCode: true,
                            Aztec: false,
                            CodaBar: false,
                            Code39: false,
                            Code93: false,
                            Code128: false,
                            DataMatrix: false,
                            EAN13: false,
                            EAN8: false,
                            ITF: false,
                            PDF417: false,
                            UPCA: false,
                            UPCE: false
                        },
                        beepOnSuccess: false,
                        vibrateOnSuccess: false,
                        detectorSize: 0.72,
                        rotateCamera: false
                    },
                    (result) => {
                        if (!result || !result.text) {
                            resolve('');
                            return;
                        }

                        resolve(app.normalizeScannedHash(result.text));
                    },
                    reject
                );
                return;
            }

            const barcodeScanner = windowObject.cordova && windowObject.cordova.plugins
                ? windowObject.cordova.plugins.barcodeScanner
                : null;

            if (barcodeScanner && typeof barcodeScanner.scan === 'function') {
                barcodeScanner.scan(
                    (result) => {
                        if (!result || result.cancelled) {
                            resolve('');
                            return;
                        }

                        resolve(app.normalizeScannedHash(result.text));
                    },
                    reject,
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
                return;
            }

            const manualHash = windowObject.prompt('Scanner indisponivel no preview. Cole o hash para validar:');
            resolve(manualHash ? String(manualHash).trim() : '');
        });
    };

    app.normalizeScannedHash = function normalizeScannedHash(value) {
        const raw = String(value || '').trim();
        if (!raw) {
            return '';
        }

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
            // Not a URL, return original value.
        }

        return raw;
    };

    app.validateGuestByHash = async function validateGuestByHash(hash) {
        if (!windowObject.BeepWeddingDatabase || typeof windowObject.BeepWeddingDatabase.findGuestByHash !== 'function') {
            return null;
        }

        return windowObject.BeepWeddingDatabase.findGuestByHash(hash);
    };

    app.renderScanSuccess = function renderScanSuccess(guest) {
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

        app.setText('scan-feedback', 'Convidado validado com sucesso.');
        app.setText('scan-result-title', 'Convidado encontrado');
        app.setText('scan-guest-name', String(guest.nome || '-'));
        app.setText('scan-guest-status', String(guest.status || '-'));
    };

    app.renderScanError = function renderScanError() {
        app.state.selectedGuest = null;

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

        app.setText('scan-feedback', 'Convidado nao encontrado, por favor leia o QR Code novamente.');
        app.setText('scan-result-title', 'QR invalido ou nao cadastrado');
        app.setText('scan-guest-name', '-');
        app.setText('scan-guest-status', '-');
    };

    app.clearScanResult = function clearScanResult() {
        app.state.selectedGuest = null;

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

        app.setText('scan-result-title', 'Convidado encontrado');
        app.setText('scan-guest-name', '-');
        app.setText('scan-guest-status', '-');
    };

    app.handleConfirmPresence = async function handleConfirmPresence() {
        await app.handleAccessAction('Presente', 'Presenca confirmada com sucesso.');
    };

    app.handleGuestExit = async function handleGuestExit() {
        await app.handleAccessAction('Saiu', 'Saida registrada com sucesso.');
    };

    app.handleAccessAction = async function handleAccessAction(nextStatus, successMessage) {
        if (!app.state.selectedGuest) {
            app.setText('scan-feedback', 'Leia um QR Code valido antes de executar a acao.');
            return;
        }

        try {
            const updatedGuest = await windowObject.BeepWeddingDatabase.updateGuestStatus(
                app.state.selectedGuest.hash,
                nextStatus,
                new Date().toISOString()
            );

            if (!updatedGuest) {
                app.setText('scan-feedback', 'Nao foi possivel atualizar o convidado.');
                return;
            }

            app.state.selectedGuest = updatedGuest;
            app.renderScanSuccess(updatedGuest);
            app.setText('scan-feedback', successMessage);

            await app.refreshSummary();
            await app.refreshGuestList();
        } catch (_error) {
            app.setText('scan-feedback', 'Nao foi possivel atualizar o status do convidado.');
        }
    };

    windowObject.BeepWeddingApp = app;
}(window));
