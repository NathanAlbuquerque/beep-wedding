(function initializeCheckin(windowObject) {
    const app = windowObject.BeepWeddingApp || {};

    app.setupCheckinScanner = function setupCheckinScanner() {
        const scanButton = document.getElementById('scan-qr-button');
        const cancelScanButton = document.getElementById('cancel-scan-button');
        const scannerOverlayClose = document.getElementById('scanner-overlay-close');
        const confirmPresenceButton = document.getElementById('confirm-presence-button');
        const guestExitButton = document.getElementById('guest-exit-button');

        if (scanButton) {
            scanButton.addEventListener('click', app.startQrScan);
        }

        if (cancelScanButton) {
            cancelScanButton.addEventListener('click', app.requestScanCancel);
        }

        if (scannerOverlayClose) {
            scannerOverlayClose.addEventListener('click', app.requestScanCancel);
        }

        if (confirmPresenceButton) {
            confirmPresenceButton.addEventListener('click', app.handleConfirmPresence);
        }

        if (guestExitButton) {
            guestExitButton.addEventListener('click', app.handleGuestExit);
        }
    };

    app.requestScanCancel = function requestScanCancel() {
        app.cancelQrScan().finally(() => {
            app.setScannerUiActive(false);
            app.showToast('Leitura cancelada.', 'error');
        });
    };

    app.getScannerProfile = function getScannerProfile() {
        const profile = app.config && app.config.scannerProfile
            ? app.config.scannerProfile
            : {};

        return {
            name: String(profile.name || 'queue-safe-native'),
            strategy: String(profile.strategy || 'native-first').toLowerCase(),
            mlKitDetectorSize: Number(profile.mlKitDetectorSize) > 0 ? Number(profile.mlKitDetectorSize) : 0.78,
            mlKitRotateCamera: Boolean(profile.mlKitRotateCamera),
            mlKitVibrateOnSuccess: Boolean(profile.mlKitVibrateOnSuccess),
            mlKitBeepOnSuccess: Boolean(profile.mlKitBeepOnSuccess),
            nativeShowTorchButton: profile.nativeShowTorchButton !== false,
            nativeDisableSuccessBeep: profile.nativeDisableSuccessBeep !== false,
            nativeDisableAnimations: profile.nativeDisableAnimations !== false
        };
    };

    app.startQrScan = async function startQrScan() {
        if (app.state.scannerActive) {
            return;
        }

        const mlKitScanner = app.getMlKitScanner();
        const nativeScanner = app.getNativeBarcodeScanner();
        const profile = app.getScannerProfile();

        app.showToast(nativeScanner
            ? `Abrindo camera nativa (${profile.name})...`
            : (mlKitScanner
                ? `Abrindo leitor por ML Kit (${profile.name})...`
                : 'Abrindo camera para leitura...'));
        app.clearScanResult();
        app.setScannerUiActive(true);

        try {
            const scannedHash = await app.scanQrCode();
            if (!scannedHash) {
                app.showToast('Leitura cancelada.', 'error');
                return;
            }

            const guest = await app.validateGuestByHash(scannedHash);
            if (!guest) {
                app.showToast('QR lido, mas o convidado nao foi encontrado na base.', 'error');
                app.renderScanError();
                return;
            }

            app.state.selectedGuest = guest;
            app.renderScanSuccess(guest);
        } catch (error) {
            const message = error && error.message
                ? String(error.message)
                : 'Falha ao ler QR Code. Tente novamente.';
            app.showToast(message, 'error');
        } finally {
            app.setScannerUiActive(false);
        }
    };

    app.scanQrCode = function scanQrCode() {
        const profile = app.getScannerProfile();
        const strategy = profile.strategy === 'mlkit-first' ? 'mlkit-first' : 'native-first';

        const orderedAttempts = strategy === 'mlkit-first'
            ? ['mlkit', 'native', 'legacy']
            : ['native', 'mlkit', 'legacy'];

        let lastError = null;

        return orderedAttempts.reduce((promiseChain, attemptName) => {
            return promiseChain.then((result) => {
                if (result && result.found) {
                    return result;
                }

                if (result && result.cancelled) {
                    return result;
                }

                const runner = attemptName === 'native'
                    ? app.scanWithNativeBarcode
                    : attemptName === 'mlkit'
                        ? app.scanWithMlKit
                        : app.scanWithLegacyQrScanner;

                return runner()
                    .then((value) => {
                        if (value === '') {
                            return { found: false, cancelled: true, value: '' };
                        }

                        if (!value) {
                            return { found: false, cancelled: false, value: '' };
                        }

                        return { found: true, cancelled: false, value };
                    })
                    .catch((error) => {
                        if (app.isScannerCancelError(error)) {
                            return { found: false, cancelled: true, value: '' };
                        }

                        lastError = error;
                        return { found: false, cancelled: false, value: '' };
                    });
            });
        }, Promise.resolve({ found: false, cancelled: false, value: '' }))
            .then((finalResult) => {
                if (finalResult.cancelled) {
                    return '';
                }

                if (finalResult.found) {
                    return finalResult.value;
                }

                throw (lastError || new Error('Nao foi possivel ler o QR Code com os leitores disponiveis.'));
            });
    };

    app.scanWithNativeBarcode = function scanWithNativeBarcode() {
        return new Promise((resolve, reject) => {
            const nativeScanner = app.getNativeBarcodeScanner();
            const profile = app.getScannerProfile();

            if (!nativeScanner || typeof nativeScanner.scan !== 'function') {
                reject(new Error('Leitor nativo indisponivel.'));
                return;
            }

            nativeScanner.scan((result) => {
                if (!result || result.cancelled) {
                    resolve('');
                    return;
                }

                const normalized = app.normalizeScannedHash(result.text || result.data || '');
                resolve(normalized || null);
            }, (error) => {
                reject(new Error(app.getScannerErrorMessage(error)));
            }, {
                preferFrontCamera: false,
                showFlipCameraButton: false,
                showTorchButton: profile.nativeShowTorchButton,
                disableSuccessBeep: profile.nativeDisableSuccessBeep,
                disableAnimations: profile.nativeDisableAnimations,
                prompt: 'Aponte a camera para o QR Code do convidado',
                formats: 'QR_CODE',
                resultDisplayDuration: 0
            });
        });
    };

    app.scanWithMlKit = function scanWithMlKit() {
        return new Promise((resolve, reject) => {
            const scanner = app.getMlKitScanner();
            if (!scanner || typeof scanner.scan !== 'function') {
                reject(new Error('Leitor ML Kit indisponivel.'));
                return;
            }

            const profile = app.getScannerProfile();
            scanner.scan({
                barcodeFormats: {
                    Code128: false,
                    Code39: false,
                    Code93: false,
                    CodaBar: false,
                    DataMatrix: false,
                    EAN13: false,
                    EAN8: false,
                    ITF: false,
                    QRCode: true,
                    UPCA: false,
                    UPCE: false,
                    PDF417: false,
                    Aztec: false
                },
                beepOnSuccess: profile.mlKitBeepOnSuccess,
                vibrateOnSuccess: profile.mlKitVibrateOnSuccess,
                detectorSize: profile.mlKitDetectorSize,
                rotateCamera: profile.mlKitRotateCamera
            }, (result) => {
                const text = result && (result.text || result.data);
                if (!text) {
                    resolve(null);
                    return;
                }

                resolve(app.normalizeScannedHash(text));
            }, (error) => {
                if (app.isScannerCancelError(error)) {
                    resolve('');
                    return;
                }

                reject(new Error(app.getScannerErrorMessage(error)));
            });
        });
    };

    app.scanWithLegacyQrScanner = function scanWithLegacyQrScanner() {
        return new Promise((resolve, reject) => {
            const scanner = windowObject.QRScanner;

            if (!scanner || typeof scanner.prepare !== 'function' || typeof scanner.scan !== 'function') {
                reject(new Error('Leitor legado indisponivel.'));
                return;
            }

            app.prepareQrScanner()
                .then(() => app.showQrScanner())
                .then(() => {
                    scanner.scan((error, contents) => {
                        app.hideQrScanner();

                        if (error) {
                            if (app.isScannerCancelError(error)) {
                                resolve('');
                                return;
                            }

                            reject(new Error(app.getScannerErrorMessage(error)));
                            return;
                        }

                        resolve(app.normalizeScannedHash(contents));
                    });
                })
                .catch((error) => {
                    app.hideQrScanner();
                    reject(error instanceof Error ? error : new Error(app.getScannerErrorMessage(error)));
                });
        });
    };

    app.getMlKitScanner = function getMlKitScanner() {
        if (!windowObject.cordova || !windowObject.cordova.plugins || !windowObject.cordova.plugins.mlkit) {
            return null;
        }

        const scanner = windowObject.cordova.plugins.mlkit.barcodeScanner;
        if (!scanner || typeof scanner.scan !== 'function') {
            return null;
        }

        return scanner;
    };

    app.getNativeBarcodeScanner = function getNativeBarcodeScanner() {
        if (!windowObject.cordova || !windowObject.cordova.plugins) {
            return null;
        }

        const scanner = windowObject.cordova.plugins.barcodeScanner;
        if (!scanner || typeof scanner.scan !== 'function') {
            return null;
        }

        return scanner;
    };

    app.prepareQrScanner = function prepareQrScanner() {
        return new Promise((resolve, reject) => {
            windowObject.QRScanner.prepare((error, status) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (status && status.denied) {
                    reject(new Error('Permissao de camera negada.'));
                    return;
                }

                resolve(status || {});
            });
        });
    };

    app.showQrScanner = function showQrScanner() {
        return new Promise((resolve, reject) => {
            windowObject.QRScanner.show((error, status) => {
                if (error) {
                    reject(error);
                    return;
                }

                app.state.scannerActive = true;
                resolve(status || {});
            });
        });
    };

    app.hideQrScanner = function hideQrScanner() {
        const scanner = windowObject.QRScanner;
        if (!scanner || typeof scanner.hide !== 'function') {
            app.state.scannerActive = false;
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            scanner.hide(() => {
                app.state.scannerActive = false;
                resolve();
            });
        });
    };

    app.destroyQrScanner = function destroyQrScanner() {
        const scanner = windowObject.QRScanner;
        if (!scanner || typeof scanner.destroy !== 'function') {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            scanner.destroy(() => resolve());
        });
    };

    app.cancelQrScan = function cancelQrScan() {
        app.setScannerUiActive(false);
        return Promise.resolve();
    };

    app.setScannerUiActive = function setScannerUiActive(isActive) {
        const active = Boolean(isActive);
        const cancelScanButton = document.getElementById('cancel-scan-button');
        const scannerOverlay = document.getElementById('scanner-overlay');

        app.state.scannerActive = active;
        document.body.classList.toggle('scanner-active', active);
        document.documentElement.classList.toggle('scanner-active', active);

        if (cancelScanButton) {
            cancelScanButton.hidden = !active;
        }

        if (scannerOverlay) {
            scannerOverlay.setAttribute('aria-hidden', String(!active));
        }
    };

    app.getScannerErrorMessage = function getScannerErrorMessage(error) {
        if (!error) {
            return 'Falha ao ler QR Code. Tente novamente.';
        }

        if (typeof error === 'string') {
            return error;
        }

        if (typeof error.code === 'number') {
            switch (error.code) {
                case 1:
                    return 'Permissao de camera negada.';
                case 2:
                    return 'Acesso a camera restrito neste dispositivo.';
                case 3:
                case 4:
                case 5:
                    return 'Camera indisponivel para leitura do QR Code.';
                case 6:
                    return 'Leitura cancelada.';
                case 7:
                    return 'Luz do dispositivo indisponivel.';
                case 8:
                    return 'Nao foi possivel abrir as configuracoes do dispositivo.';
                default:
                    break;
            }
        }

        if (error.name === 'SCAN_CANCELED') {
            return 'Leitura cancelada.';
        }

        if (error.message) {
            return String(error.message);
        }

        if (error.error) {
            return String(error.error);
        }

        return 'Falha ao ler QR Code. Tente novamente.';
    };

    app.isScannerCancelError = function isScannerCancelError(error) {
        const message = String(
            (error && (error.message || error.error)) || ''
        ).toUpperCase();

        return Boolean(
            error && (
                error.code === 6 ||
                error.name === 'SCAN_CANCELED' ||
                error.cancelled === true ||
                message.includes('USER_CANCELLED') ||
                message.includes('CANCEL')
            )
        );
    };

    app.normalizeScannedHash = function normalizeScannedHash(value) {
        const raw = String(value || '').trim();
        if (!raw) {
            return '';
        }

        if (raw[0] === '{' && raw[raw.length - 1] === '}') {
            try {
                const parsed = JSON.parse(raw);
                const jsonHash = parsed.hash || parsed.codigo || parsed.code || parsed.token;
                if (jsonHash) {
                    return String(jsonHash).trim();
                }
            } catch (_error) {
                // Ignore invalid JSON and keep parsing as plain string.
            }
        }

        try {
            const parsedUrl = new URL(raw);
            const queryHash = parsedUrl.searchParams.get('hash')
                || parsedUrl.searchParams.get('codigo')
                || parsedUrl.searchParams.get('code')
                || parsedUrl.searchParams.get('token');
            if (queryHash) {
                return String(queryHash).trim();
            }

            if (parsedUrl.hash) {
                const fragment = parsedUrl.hash.replace(/^#/, '').trim();
                if (fragment) {
                    return fragment;
                }
            }

            const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
            if (pathSegments.length > 0) {
                return String(pathSegments[pathSegments.length - 1]).trim();
            }
        } catch (_error) {
            // Not a URL, return original value.
        }

        const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        if (uuidMatch) {
            return String(uuidMatch[0]).trim();
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

        app.showToast('Convidado validado com sucesso.', 'success');
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
            card.setAttribute('aria-hidden', 'true');
            card.classList.remove('is-success');
            card.classList.add('is-error');
        }

        if (confirmPresenceButton) {
            confirmPresenceButton.disabled = true;
        }

        if (guestExitButton) {
            guestExitButton.disabled = true;
        }

        app.showToast('Convidado nao encontrado, por favor leia o QR Code novamente.', 'error');
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
            app.showToast('Leia um QR Code valido antes de executar a acao.', 'error');
            return;
        }

        try {
            const updatedGuest = await windowObject.BeepWeddingDatabase.updateGuestStatus(
                app.state.selectedGuest.hash,
                nextStatus,
                new Date().toISOString()
            );

            if (!updatedGuest) {
                app.showToast('Nao foi possivel atualizar o convidado.', 'error');
                return;
            }

            app.state.selectedGuest = updatedGuest;
            app.renderScanSuccess(updatedGuest);
            app.showToast(successMessage, 'success');

            await app.refreshSummary();
            await app.refreshGuestList();
        } catch (_error) {
            app.showToast('Nao foi possivel atualizar o status do convidado.', 'error');
        }
    };

    windowObject.BeepWeddingApp = app;
}(window));
