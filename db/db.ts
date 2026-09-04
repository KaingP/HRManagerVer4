import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.db");
const SCHEMA_PATHS = [
    path.join(__dirname, "schema.sql"),
    path.join(process.cwd(), "db", "schema.sql"),
];

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (_db) return _db;

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const isFresh = !fs.existsSync(DB_PATH);
    _db = new Database(DB_PATH);
    _db.pragma("foreign_keys = ON");
    _db.pragma("journal_mode = WAL");
    _db.pragma("synchronous = NORMAL");

    if (isFresh) {
        const schemaPath = SCHEMA_PATHS.find((candidate) =>
            fs.existsSync(candidate),
        );
        if (!schemaPath) throw new Error("Không tìm thấy db/schema.sql");
        const schema = fs.readFileSync(schemaPath, "utf-8");
        _db.exec(schema);
        console.log(`[db] Khởi tạo database mới tại ${DB_PATH}`);
    } else {
        // Re-apply schema is idempotent nhờ IF NOT EXISTS — đảm bảo view/table mới tồn tại
        const schemaPath = SCHEMA_PATHS.find((candidate) =>
            fs.existsSync(candidate),
        );
        if (!schemaPath) throw new Error("Không tìm thấy db/schema.sql");
        const schema = fs.readFileSync(schemaPath, "utf-8");
        _db.exec(schema);
    }

    const memberColumns = _db.prepare("PRAGMA table_info(member)").all() as {
        name: string;
    }[];
    if (!memberColumns.some((column) => column.name === "active")) {
        _db.exec(
            "ALTER TABLE member ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
        );
    }
    _db.exec("CREATE INDEX IF NOT EXISTS idx_member_active ON member(active)");

    return _db;
}

export function closeDb() {
    if (_db) {
        _db.close();
        _db = null;
    }
}

// Helper: transaction wrapper an toàn
export function tx<T>(fn: (db: Database.Database) => T): T {
    const db = getDb();
    const wrapped = db.transaction(fn);
    return wrapped(db);
}
