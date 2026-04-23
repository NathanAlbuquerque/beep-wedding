(function () {
    const STORAGE_KEY = 'beep-wedding-db';
    const FALLBACK_STATE = { guests: [] };

    const database = {
        mode: 'unknown',
        async initialize() {
            if (this.mode !== 'unknown') {
                return this.mode;
            }

            if (window.sqlitePlugin && typeof window.sqlitePlugin.openDatabase === 'function') {
                this.mode = 'sqlite';
                await this.ensureSchema();
                return this.mode;
            }

            this.mode = 'browser-storage';
            this.ensureFallbackState();
            return this.mode;
        },
        getMode() {
            return this.mode;
        },
        async getSummary() {
            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                const total = state.guests.length;
                const present = state.guests.filter((guest) => guest.status === 'Presente').length;
                const absent = state.guests.filter((guest) => guest.status !== 'Presente').length;

                return { total, present, absent };
            }

            return { total: 0, present: 0, absent: 0 };
        },
        async ensureSchema() {
            return new Promise((resolve, reject) => {
                const databaseInstance = window.sqlitePlugin.openDatabase({ name: 'beep_wedding.db', location: 'default' });

                databaseInstance.transaction(
                    (transaction) => {
                        transaction.executeSql(
                            `
                                CREATE TABLE IF NOT EXISTS guests (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    nome TEXT NOT NULL,
                                    hash TEXT NOT NULL UNIQUE,
                                    status TEXT NOT NULL DEFAULT 'Ausente',
                                    data_checkin TEXT
                                )
                            `
                        );
                    },
                    reject,
                    () => resolve()
                );
            });
        },
        ensureFallbackState() {
            if (!window.localStorage.getItem(STORAGE_KEY)) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_STATE));
            }
        },
        readFallbackState() {
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : FALLBACK_STATE;
            } catch (error) {
                return FALLBACK_STATE;
            }
        }
    };

    window.BeepWeddingDatabase = database;
}());