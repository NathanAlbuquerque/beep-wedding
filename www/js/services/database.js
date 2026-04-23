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
        async createGuest(guestData) {
            const guest = this.normalizeGuestPayload(guestData);

            if (this.mode === 'sqlite') {
                await this.executeSql(
                    `
                        INSERT INTO ${TABLE_NAME} (nome, hash, status, data_checkin)
                        VALUES (?, ?, ?, ?)
                    `,
                    [guest.nome, guest.hash, guest.status, guest.data_checkin]
                );
                return guest;
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                state.convidados.unshift({
                    id: Date.now(),
                    nome: guest.nome,
                    hash: guest.hash,
                    status: guest.status,
                    data_checkin: guest.data_checkin
                });
                this.writeFallbackState(state);
                return guest;
            }

            throw new Error('Banco de dados nao inicializado.');
        },
        async bulkInsertGuests(guestList) {
            const payload = Array.isArray(guestList) ? guestList : [];
            const guests = payload.map((guest) => this.normalizeGuestPayload(guest));

            if (guests.length === 0) {
                return { inserted: 0 };
            }

            if (this.mode === 'sqlite') {
                await this.executeInTransaction((transaction) => {
                    guests.forEach((guest) => {
                        transaction.executeSql(
                            `
                                INSERT INTO ${TABLE_NAME} (nome, hash, status, data_checkin)
                                VALUES (?, ?, ?, ?)
                            `,
                            [guest.nome, guest.hash, guest.status, guest.data_checkin]
                        );
                    });
                });

                return { inserted: guests.length };
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                guests.forEach((guest) => {
                    state.convidados.unshift({
                        id: Date.now() + Math.floor(Math.random() * 100000),
                        nome: guest.nome,
                        hash: guest.hash,
                        status: guest.status,
                        data_checkin: guest.data_checkin
                    });
                });
                this.writeFallbackState(state);
                return { inserted: guests.length };
            }

            throw new Error('Banco de dados nao inicializado.');
        },
        async listGuests(limit) {
            const safeLimit = Number(limit) > 0 ? Number(limit) : 30;

            if (this.mode === 'sqlite') {
                const resultSet = await this.executeSql(
                    `
                        SELECT id, nome, hash, status, data_checkin
                        FROM ${TABLE_NAME}
                        ORDER BY id DESC
                        LIMIT ?
                    `,
                    [safeLimit]
                );

                return this.rowsToArray(resultSet);
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                return state.convidados.slice(0, safeLimit);
            }

            return [];
        },
        async searchGuestsByName(searchTerm, limit) {
            const safeLimit = Number(limit) > 0 ? Number(limit) : 100;
            const term = String(searchTerm || '').trim().toLowerCase();

            if (!term) {
                return this.listGuests(safeLimit);
            }

            if (this.mode === 'sqlite') {
                const resultSet = await this.executeSql(
                    `
                        SELECT id, nome, hash, status, data_checkin
                        FROM ${TABLE_NAME}
                        WHERE LOWER(nome) LIKE ?
                        ORDER BY id DESC
                        LIMIT ?
                    `,
                    [`%${term}%`, safeLimit]
                );

                return this.rowsToArray(resultSet);
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                return state.convidados
                    .filter((guest) => String(guest.nome || '').toLowerCase().includes(term))
                    .slice(0, safeLimit);
            }

            return [];
        },
        async findGuestByHash(hashValue) {
            const hash = String(hashValue || '').trim();
            if (!hash) {
                return null;
            }

            if (this.mode === 'sqlite') {
                const row = await this.getFirstRow(
                    `
                        SELECT id, nome, hash, status, data_checkin
                        FROM ${TABLE_NAME}
                        WHERE hash = ?
                        LIMIT 1
                    `,
                    [hash]
                );

                return row && row.hash ? row : null;
            }

            if (this.mode === 'browser-storage') {
                const state = this.readFallbackState();
                return state.convidados.find((guest) => String(guest.hash) === hash) || null;
            }

            return null;
        },
        async ensureSchema() {
            await this.executeSql(CREATE_CONVIDADOS_TABLE_SQL);
            await this.executeSql(CREATE_HASH_INDEX_SQL);
            await this.executeSql(CREATE_STATUS_INDEX_SQL);
        },
        executeInTransaction(transactionHandler) {
            if (this.mode !== 'sqlite' || !this.sqliteDb) {
                return Promise.reject(new Error('SQLite indisponivel para transacao.'));
            }

            return new Promise((resolve, reject) => {
                this.sqliteDb.transaction(
                    (transaction) => {
                        transactionHandler(transaction);
                    },
                    reject,
                    resolve
                );
            });
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
        rowsToArray(resultSet) {
            if (!resultSet || !resultSet.rows) {
                return [];
            }

            const items = [];
            for (let index = 0; index < resultSet.rows.length; index += 1) {
                items.push(resultSet.rows.item(index));
            }

            return items;
        },
        normalizeGuestPayload(guestData) {
            const source = guestData || {};
            return {
                nome: String(source.nome || '').trim(),
                hash: String(source.hash || '').trim(),
                status: String(source.status || 'Ausente').trim() || 'Ausente',
                data_checkin: source.data_checkin || null
            };
        },
        ensureFallbackState() {
            if (!window.localStorage.getItem(STORAGE_KEY)) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_STATE));
            }
        },
        writeFallbackState(nextState) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
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