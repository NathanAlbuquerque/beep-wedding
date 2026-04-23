(function () {
    const setupChecklist = [
        {
            title: 'Banco local offline',
            description: 'SQLite está instalado e preparado para sustentar o fluxo sem internet, com fallback para preview web.'
        },
        {
            title: 'Permissão de câmera',
            description: 'Base pronta para o leitor de QR Code usar a câmera do dispositivo na etapa de check-in.'
        },
        {
            title: 'Armazenamento e mídia',
            description: 'Suporte preparado para leitura de planilhas e geração de imagens compartilháveis no celular.'
        }
    ];

    window.BeepWeddingPermissions = {
        getSetupChecklist() {
            return setupChecklist.slice();
        }
    };
}());