(function () {
    const STORAGE_KEY = 'beep-wedding-db';
    const FALLBACK_STATE = { convidados: [] };
    const SQLITE_DB_CONFIG = { name: 'beep_wedding.db', location: 'default' };
    const TABLE_NAME = 'convidados';
    const CREATE_CONVIDADOS_TABLE_SQL = `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            hash TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'Ausente',
            data_checkin TEXT
        )
    `;

    const CREATE_HASH_INDEX_SQL = `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_convidados_hash
        ON ${TABLE_NAME} (hash)
    `;

    const CREATE_STATUS_INDEX_SQL = `
        CREATE INDEX IF NOT EXISTS idx_convidados_status
        ON ${TABLE_NAME} (status)
    `;

    const database = {
        mode: 'unknown',
        sqliteDb: null,
        async initialize() {
            if (this.mode !== 'unknown') {
                return this.mode;
            }

            if (window.sqlitePlugin && typeof window.sqlitePlugin.openDatabase === 'function') {
                this.sqliteDb = window.sqlitePlugin.openDatabase(SQLITE_DB_CONFIG);
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
            if (this.mode === 'sqlite') {
                const row = await this.getFirstRow(
                    `
                        SELECT
                            COUNT(*) AS total,
                            SUM(CASE WHEN status = 'Presente' THEN 1 ELSE 0 END) AS present,
                            SUM(CASE WHEN status != 'Presente' THEN 1 ELSE 0 END) AS absent
                        FROM ${TABLE_NAME}
                    `
                );

                return {
                    total: Number(row.total || 0),
                    present: Number(row.present || 0),
                    absent: Number(row.absent || 0)
                };
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                const total = state.convidados.length;
                const present = state.convidados.filter((guest) => guest.status === 'Presente').length;
                const absent = state.convidados.filter((guest) => guest.status !== 'Presente').length;

                return { total, present, absent };
            }

            return { total: 0, present: 0, absent: 0 };
        },
        async ensureSchema() {
            await this.executeSql(CREATE_CONVIDADOS_TABLE_SQL);
            await this.executeSql(CREATE_HASH_INDEX_SQL);
            await this.executeSql(CREATE_STATUS_INDEX_SQL);
        },
        executeSql(sql, params) {
            const queryParams = Array.isArray(params) ? params : [];

            if (this.mode !== 'sqlite' || !this.sqliteDb) {
                return Promise.reject(new Error('SQLite indisponivel para execucao de query.'));
            }

            return new Promise((resolve, reject) => {
                this.sqliteDb.transaction(
                    (transaction) => {
                        transaction.executeSql(
                            sql,
                            queryParams,
                            (_tx, resultSet) => resolve(resultSet),
                            (_tx, error) => {
                                reject(error);
                                return false;
                            }
                        );
                    },
                    reject
                );
            });
        },
        async getFirstRow(sql, params) {
            const resultSet = await this.executeSql(sql, params);
            if (!resultSet || !resultSet.rows || resultSet.rows.length === 0) {
                return {};
            }

            return resultSet.rows.item(0) || {};
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