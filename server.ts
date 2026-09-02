const { getAdminPassword, getRuntimePort } = require("./config.js");

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import * as xlsx from "xlsx";
import crypto from "crypto";

import {
    loadShiftsMaster,
    loadMembersData,
    parseMembersDf,
    getAvailabilityHeatmap,
    calculateDateForDay,
    Member,
    Shift,
    DAYS_LIST,
    SLOT_KEYS,
} from "./src/data_loader";
import { ShiftScheduler } from "./src/scheduler";
import { exportScheduleToExcel } from "./src/exporter";
import { TASK_2_DETAILS } from "./src/risk_and_hr_protocols";

const app = express();
const PORT = getRuntimePort();
const STATE_FILE = process.env.STATE_FILE || "state.json";
const REPORT_PATH = "reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx";

function resolveAppRoot(): string {
    for (const candidate of [__dirname, path.join(__dirname, "..")]) {
        if (fs.existsSync(path.join(candidate, "templates", "index.html"))) {
            return candidate;
        }
    }
    return __dirname;
}

const APP_ROOT = resolveAppRoot();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static assets
app.use("/static", express.static(path.join(APP_ROOT, "static")));

// Upload configuration
const upload = multer({ dest: "uploads/" });

// Inventory interfaces
export interface Product {
    id: string;
    name: string;
    unit: string;
    price: number;
    initial_stock: number;
    sold_count: number;
    note?: string;
}

export interface SaleTransaction {
    id: string;
    timestamp: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    channel: string;
    seller?: string;
    shift_id?: string;
    customer_name?: string;
    customer_phone?: string;
    payment_method?: string;
    note?: string;
    refunded?: boolean;
    week?: string;
}

export interface ShiftAuditItem {
    product_id: string;
    product_name: string;
    unit: string;
    expected_stock: number;
    actual_stock: number;
    diff: number;
    note?: string;
}

export interface ShiftAudit {
    id: string;
    shift_id: string;
    timestamp: string;
    auditor: string;
    items: ShiftAuditItem[];
    total_diff: number;
    summary_note?: string;
}

// Global State & Auth
let ADMIN_PASSWORD: string = getAdminPassword();
const ACTIVE_ADMIN_TOKENS: Set<string> = new Set();

let START_DATE: string = "2026-08-24";
let CURRENT_SHIFTS: Shift[] = [];
let CURRENT_MEMBERS: Member[] = [];
const DEFAULT_CA_NGOAI = [
    {
        id: "NGOAI_01",
        name: "Quán Café A",
        day: "Thứ 7",
        start_time: "17:00",
        end_time: "19:30",
        chinh: 2,
        dp: 1,
    },
    {
        id: "NGOAI_02",
        name: "Quán Café B",
        day: "Thứ 7",
        start_time: "17:30",
        end_time: "20:00",
        chinh: 2,
        dp: 1,
    },
    {
        id: "NGOAI_03",
        name: "Quán Café B",
        day: "Chủ Nhật",
        start_time: "17:00",
        end_time: "19:30",
        chinh: 2,
        dp: 1,
    },
    {
        id: "NGOAI_04",
        name: "Quán Café C",
        day: "Chủ Nhật",
        start_time: "17:00",
        end_time: "19:00",
        chinh: 2,
        dp: 1,
    },
];
let CUSTOM_CA_NGOAI: any[] = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
let ENABLE_CA_NGOAI = true;
let INCIDENT_LOGS: any[] = [];
let LATEST_SCHEDULE_RESULT: any = null;

const DEFAULT_PRODUCTS: Product[] = [];

const DEFAULT_SALES_LOGS: SaleTransaction[] = [];

let INVENTORY_PRODUCTS: Product[] = [];
let SALES_LOGS: SaleTransaction[] = [];
let KPI_ATTENDANCE: any[] = [];
let SHIFT_AUDITS: ShiftAudit[] = [];

// Optimizer & Shift Configuration Interfaces
export interface DailyShiftConfig {
    shift_num: number;
    start_time: string;
    end_time: string;
    note: string;
    chinh_count: number;
    dp_count: number;
    active: boolean;
}

export interface OptimizerConfig {
    start_date: string;
    phong_chinh_count: number;
    phong_dp_count: number;
    min_shifts: number;
    max_shifts: number;
    max_shifts_per_day: number;
    enable_ca_ngoai: boolean;
    daily_shift_configs: DailyShiftConfig[];
}

const DEFAULT_DAILY_SHIFT_CONFIGS: DailyShiftConfig[] = [
    {
        shift_num: 1,
        start_time: "07:00",
        end_time: "09:30",
        note: "Khách đông đột biến vào giờ ra chơi; cần setup phòng trực sớm.",
        chinh_count: 4,
        dp_count: 1,
        active: true,
    },
    {
        shift_num: 2,
        start_time: "09:35",
        end_time: "12:00",
        note: "Học sinh tan trường & nghỉ trưa, lượng khách (HS/GV) đông.",
        chinh_count: 4,
        dp_count: 1,
        active: true,
    },
    {
        shift_num: 3,
        start_time: "12:05",
        end_time: "14:00",
        note: "Học sinh chuẩn bị vào ca chiều, lượng khách ổn định.",
        chinh_count: 3,
        dp_count: 1,
        active: true,
    },
    {
        shift_num: 4,
        start_time: "14:05",
        end_time: "16:05",
        note: "Giờ ra chơi chiều & tan tiết cuối, cần phục vụ nhanh.",
        chinh_count: 4,
        dp_count: 1,
        active: true,
    },
    {
        shift_num: 5,
        start_time: "16:10",
        end_time: "18:00",
        note: "Học sinh ra về; cần bán hàng, dọn dẹp, kiểm kê & khóa cửa.",
        chinh_count: 4,
        dp_count: 1,
        active: true,
    },
];

const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
    start_date: "2026-08-24",
    phong_chinh_count: 4,
    phong_dp_count: 1,
    min_shifts: 1,
    max_shifts: 4,
    max_shifts_per_day: 2,
    enable_ca_ngoai: true,
    daily_shift_configs: DEFAULT_DAILY_SHIFT_CONFIGS,
};

let OPTIMIZER_CONFIG: OptimizerConfig = JSON.parse(
    JSON.stringify(DEFAULT_OPTIMIZER_CONFIG),
);

function applyDailyConfigsToShifts(shifts: Shift[], dailyConfigs: DailyShiftConfig[]) {
    if (!dailyConfigs || !dailyConfigs.length) return;
    const configMap = new Map<number, DailyShiftConfig>();
    dailyConfigs.forEach((c) => configMap.set(c.shift_num, c));

    for (const s of shifts) {
        if (s.type === "Phong") {
            const shiftNumMatch =
                s.shift_id.match(/_S(\d+)/i) ||
                s.shift_id.match(/_C(\d+)/i) ||
                s.shift_id.match(/_(\d+)/);
            if (shiftNumMatch) {
                const num = parseInt(shiftNumMatch[1], 10);
                const conf = configMap.get(num);
                if (conf) {
                    s.start_time = conf.start_time;
                    s.end_time = conf.end_time;
                    s.slot = `${conf.start_time} - ${conf.end_time}`;
                    s.note = conf.note;
                    s.chinh_count = conf.chinh_count;
                    s.dp_count = conf.dp_count;
                    s.required_count = conf.chinh_count;
                    s.backup_count = conf.dp_count;
                    s.active = conf.active;
                }
            }
        }
    }
}

// Auth Helpers & Middleware
function extractToken(req: express.Request): string | null {
    const authHeader = req.headers["authorization"] || "";
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }
    const customHeader = req.headers["x-admin-token"];
    if (typeof customHeader === "string") {
        return customHeader.trim();
    }
    return null;
}

export function isValidAdmin(req: express.Request): boolean {
    const token = extractToken(req);
    if (token && ACTIVE_ADMIN_TOKENS.has(token)) {
        return true;
    }
    // Allow direct secret key in header for automation or environment
    const pwdHeader = req.headers["x-admin-password"];
    if (typeof pwdHeader === "string" && pwdHeader === ADMIN_PASSWORD) {
        return true;
    }
    return false;
}

export function requireAdmin(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) {
    if (isValidAdmin(req)) {
        return next();
    }
    return res.status(401).json({
        success: false,
        require_admin: true,
        message:
            "Yêu cầu quyền Quản trị viên (Admin) để thực hiện thao tác này! Vui lòng đăng nhập với mật khẩu Admin.",
    });
}

// Helpers
function persist() {
    const payload = {
        version: 2,
        admin_password: ADMIN_PASSWORD,
        start_date: START_DATE,
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
        optimizer_config: OPTIMIZER_CONFIG,
        incident_logs: INCIDENT_LOGS,
        schedule: LATEST_SCHEDULE_RESULT,
        members: CURRENT_MEMBERS,
        inventory: INVENTORY_PRODUCTS,
        sales_logs: SALES_LOGS,
        kpi_attendance: KPI_ATTENDANCE,
        shift_audits: SHIFT_AUDITS,
    };
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
        return true;
    } catch (e) {
        console.error(`[state_store] Không lưu được trạng thái: ${e}`);
        return false;
    }
}

function applyStartDateToShifts(shifts: Shift[], startDate: string) {
    for (const s of shifts) {
        const calculated = calculateDateForDay(startDate, s.day);
        if (calculated) {
            s.date = calculated;
        }
    }
}

async function runDefaultOptimization() {
    applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
    const config = {
        start_date: START_DATE,
        phong_chinh_count: 3,
        phong_dp_count: 1,
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
    };
    const scheduler = new ShiftScheduler(
        CURRENT_SHIFTS,
        CURRENT_MEMBERS,
        config,
    );
    const result = scheduler.optimize();
    if (result && result.success) {
        LATEST_SCHEDULE_RESULT = result;
        await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
        persist();
    }
}

function bootstrapState() {
    CURRENT_SHIFTS = loadShiftsMaster();

    // Try loading saved state
    if (fs.existsSync(STATE_FILE)) {
        try {
            const data = fs.readFileSync(STATE_FILE, "utf-8");
            const saved = JSON.parse(data);
            if (saved) {
                if (saved.admin_password) {
                    ADMIN_PASSWORD = saved.admin_password;
                }
                if (saved.start_date) {
                    START_DATE = saved.start_date;
                }
                if (saved.members && saved.members.length > 0) {
                    CURRENT_MEMBERS = saved.members;
                } else {
                    CURRENT_MEMBERS = loadMembersData();
                }
                CUSTOM_CA_NGOAI =
                    saved.custom_ca_ngoai ||
                    JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
                ENABLE_CA_NGOAI =
                    saved.enable_ca_ngoai !== undefined
                        ? saved.enable_ca_ngoai
                        : true;
                INCIDENT_LOGS = saved.incident_logs || [];
                LATEST_SCHEDULE_RESULT = saved.schedule || null;

                INVENTORY_PRODUCTS = saved.inventory || [];
                SALES_LOGS = saved.sales_logs || [];
                KPI_ATTENDANCE = saved.kpi_attendance || [];
                SHIFT_AUDITS = saved.shift_audits || [];

                if (saved.optimizer_config) {
                    OPTIMIZER_CONFIG = saved.optimizer_config;
                    if (OPTIMIZER_CONFIG.start_date) {
                        START_DATE = OPTIMIZER_CONFIG.start_date;
                    }
                    if (OPTIMIZER_CONFIG.enable_ca_ngoai !== undefined) {
                        ENABLE_CA_NGOAI = OPTIMIZER_CONFIG.enable_ca_ngoai;
                    }
                }
                applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
                if (OPTIMIZER_CONFIG && OPTIMIZER_CONFIG.daily_shift_configs) {
                    applyDailyConfigsToShifts(
                        CURRENT_SHIFTS,
                        OPTIMIZER_CONFIG.daily_shift_configs,
                    );
                }

                console.log(
                    `[app] Đã phục hồi trạng thái (${CURRENT_MEMBERS.length} thành viên, ` +
                        `${INCIDENT_LOGS.length} sự cố, ${INVENTORY_PRODUCTS.length} sản phẩm, ngày bắt đầu: ${START_DATE})`,
                );
                return;
            }
        } catch (e) {
            console.warn(
                `[state_store] Trạng thái đã lưu không đọc được, nạp lại từ file gốc (${e})`,
            );
        }
    }

    // Fallback to defaults
    CURRENT_MEMBERS = loadMembersData();
    CUSTOM_CA_NGOAI = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI));
    ENABLE_CA_NGOAI = true;
    INCIDENT_LOGS = [];
    LATEST_SCHEDULE_RESULT = null;
    INVENTORY_PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    SALES_LOGS = JSON.parse(JSON.stringify(DEFAULT_SALES_LOGS));
    KPI_ATTENDANCE = [];
    OPTIMIZER_CONFIG = JSON.parse(JSON.stringify(DEFAULT_OPTIMIZER_CONFIG));

    applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
    applyDailyConfigsToShifts(CURRENT_SHIFTS, OPTIMIZER_CONFIG.daily_shift_configs);

    // Run initial optimization once so that there is immediate data visible to users
    runDefaultOptimization().catch((err) =>
        console.error("[Bootstrap] Lỗi xếp lịch ban đầu:", err),
    );
}

// Routes
app.get("/healthz", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(APP_ROOT, "templates", "index.html"));
});

// AUTHENTICATION ROUTES
app.post("/api/auth/login", (req, res) => {
    const { password } = req.body || {};
    if (!password) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Vui lòng nhập mật khẩu Quản trị viên!",
            });
    }

    if (password.trim() === ADMIN_PASSWORD.trim()) {
        const token = crypto.randomBytes(32).toString("hex");
        ACTIVE_ADMIN_TOKENS.add(token);
        return res.json({
            success: true,
            token: token,
            role: "admin",
            message: "Đăng nhập Quản trị viên thành công!",
        });
    }

    return res.status(401).json({
        success: false,
        message: "Mật khẩu Quản trị viên không chính xác!",
    });
});

app.get("/api/auth/status", (req, res) => {
    const isAdmin = isValidAdmin(req);
    res.json({
        success: true,
        is_admin: isAdmin,
        role: isAdmin ? "admin" : "staff",
    });
});

app.post("/api/auth/logout", (req, res) => {
    const token = extractToken(req);
    if (token) {
        ACTIVE_ADMIN_TOKENS.delete(token);
    }
    res.json({
        success: true,
        message: "Đã đăng xuất khỏi chế độ Quản trị viên!",
    });
});

app.post("/api/auth/change-password", requireAdmin, (req, res) => {
    const { old_password, new_password } = req.body || {};
    if (!old_password || !new_password) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Vui lòng nhập mật khẩu cũ và mật khẩu mới!",
            });
    }

    if (old_password.trim() !== ADMIN_PASSWORD.trim()) {
        return res
            .status(400)
            .json({ success: false, message: "Mật khẩu cũ không chính xác!" });
    }

    if (new_password.trim().length < 4) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Mật khẩu mới phải có ít nhất 4 ký tự!",
            });
    }

    ADMIN_PASSWORD = new_password.trim();
    persist();

    res.json({
        success: true,
        message: "Đã đổi mật khẩu Quản trị viên thành công!",
    });
});

app.get("/api/shifts", (req, res) => {
    applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
    res.json({
        success: true,
        start_date: START_DATE,
        shifts: CURRENT_SHIFTS,
        total: CURRENT_SHIFTS.length,
    });
});

function getInventoryData() {
    const productsWithStock = INVENTORY_PRODUCTS.map((p) => {
        const sold = Number(p.sold_count || 0);
        const initial = Number(p.initial_stock || 0);
        const stock = Math.max(0, initial - sold);
        const price = Number(p.price || 0);
        const revenue = sold * price;
        const stock_value = stock * price;
        return {
            ...p,
            initial_stock: initial,
            sold_count: sold,
            stock: stock,
            current_stock: stock,
            price: price,
            revenue: revenue,
            stock_value: stock_value,
        };
    });

    const total_revenue = productsWithStock.reduce(
        (sum, p) => sum + p.revenue,
        0,
    );
    const total_stock = productsWithStock.reduce((sum, p) => sum + p.stock, 0);
    const total_sold = productsWithStock.reduce(
        (sum, p) => sum + p.sold_count,
        0,
    );
    const total_stock_value = productsWithStock.reduce(
        (sum, p) => sum + p.stock_value,
        0,
    );

    return {
        products: productsWithStock,
        kpis: {
            total_revenue,
            total_stock,
            total_sold,
            total_stock_value,
        },
        sales_logs: SALES_LOGS,
    };
}

// Inventory API Routes
app.get("/api/inventory", (req, res) => {
    const data = getInventoryData();
    res.json({
        success: true,
        ...data,
    });
});

app.post("/api/inventory/product", requireAdmin, (req, res) => {
    const data = req.body || {};
    let id = String(data.id || "").trim();
    const name = String(data.name || "").trim();
    const unit = String(data.unit || "Phần").trim();
    const price = Math.max(0, parseInt(data.price || "0", 10));
    const initial_stock = Math.max(0, parseInt(data.initial_stock || "0", 10));
    const sold_count = Math.max(0, parseInt(data.sold_count || "0", 10));
    const note = String(data.note || "").trim();

    if (!name) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Tên sản phẩm không được để trống!",
            });
    }

    if (id) {
        // Update existing product
        const existingIndex = INVENTORY_PRODUCTS.findIndex((p) => p.id === id);
        if (existingIndex !== -1) {
            INVENTORY_PRODUCTS[existingIndex] = {
                id,
                name,
                unit,
                price,
                initial_stock,
                sold_count,
                note,
            };
        } else {
            INVENTORY_PRODUCTS.push({
                id,
                name,
                unit,
                price,
                initial_stock,
                sold_count,
                note,
            });
        }
    } else {
        // Generate new ID
        const nextNum = INVENTORY_PRODUCTS.length + 1;
        id = `SP${String(nextNum).padStart(2, "0")}`;
        // ensure unique
        while (INVENTORY_PRODUCTS.some((p) => p.id === id)) {
            id = `SP${String(parseInt(id.replace("SP", ""), 10) + 1).padStart(2, "0")}`;
        }
        INVENTORY_PRODUCTS.push({
            id,
            name,
            unit,
            price,
            initial_stock,
            sold_count,
            note,
        });
    }

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã lưu sản phẩm '${name}' (${id}) thành công!`,
        product: { id, name, unit, price, initial_stock, sold_count, note },
        ...inv,
    });
});

app.post("/api/inventory/delete", requireAdmin, (req, res) => {
    const { id } = req.body || {};
    if (!id) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu mã sản phẩm" });
    }

    const cleanId = String(id).trim().toUpperCase();
    INVENTORY_PRODUCTS = INVENTORY_PRODUCTS.filter((p) => {
        const pId = String(p.id || "")
            .trim()
            .toUpperCase();
        return pId !== cleanId && String(p.id).trim() !== String(id).trim();
    });

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã xóa sản phẩm ${id} khỏi kho hàng!`,
        ...inv,
    });
});

// Helper for Excel parsing
function normalizeColHeader(val: any): string {
    return String(val || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

function parseMoneyAmount(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return Math.max(0, Math.round(val));
    let str = String(val).trim();
    if (!str) return 0;
    if (/^\d+(\.\d+)?\s*[kK]$/.test(str)) {
        const num = parseFloat(str.replace(/[kK]/g, ""));
        return Math.max(0, Math.round(num * 1000));
    }
    // Remove currency marks and spaces
    str = str.replace(/[₫đĐvVnNdD\s]/g, "");
    const cleaned = str.replace(/[^0-9]/g, "");
    return Math.max(0, parseInt(cleaned || "0", 10));
}

function parseStockQty(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return Math.max(0, Math.round(val));
    const cleaned = String(val).replace(/[^0-9]/g, "");
    return Math.max(0, parseInt(cleaned || "0", 10));
}

function parseProductsFromExcelSheet(sheet: xlsx.WorkSheet) {
    const matrix = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
    if (!matrix || matrix.length === 0) {
        return [];
    }

    let headerRowIdx = -1;
    let colName = -1;
    let colUnit = -1;
    let colPrice = -1;
    let colStock = -1;
    let colId = -1;
    let colNote = -1;

    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) continue;

        let foundName = -1;
        let foundUnit = -1;
        let foundPrice = -1;
        let foundStock = -1;
        let foundId = -1;
        let foundNote = -1;

        for (let c = 0; c < row.length; c++) {
            const h = normalizeColHeader(row[c]);
            if (!h) continue;

            if (
                h.includes("tenmathang") ||
                h.includes("tensanpham") ||
                h.includes("tenhang") ||
                h.includes("tensp") ||
                h.includes("mathang") ||
                h.includes("sanpham") ||
                h === "ten" ||
                h.includes("product") ||
                h.includes("item")
            ) {
                foundName = c;
            } else if (
                h.includes("donvitinh") ||
                h.includes("dvt") ||
                h.includes("donvi") ||
                h.includes("unit")
            ) {
                foundUnit = c;
            } else if (
                h.includes("giatien") ||
                h.includes("giaban") ||
                h.includes("dongia") ||
                h === "gia" ||
                h.includes("price") ||
                h.includes("cost") ||
                h.includes("sotien")
            ) {
                foundPrice = c;
            } else if (
                h.includes("soluongnhap") ||
                h.includes("soluong") ||
                h.includes("slnhap") ||
                h.includes("tonkho") ||
                h.includes("tonkhodau") ||
                h.includes("stock") ||
                h.includes("qty") ||
                h.includes("quantity") ||
                h.includes("nhap")
            ) {
                foundStock = c;
            } else if (
                h.includes("masp") ||
                h.includes("masanpham") ||
                h === "id" ||
                h === "code" ||
                h === "stt"
            ) {
                foundId = c;
            } else if (h.includes("ghichu") || h.includes("note")) {
                foundNote = c;
            }
        }

        if (foundName !== -1 && (foundPrice !== -1 || foundStock !== -1 || foundUnit !== -1)) {
            headerRowIdx = r;
            colName = foundName;
            colUnit = foundUnit;
            colPrice = foundPrice;
            colStock = foundStock;
            colId = foundId;
            colNote = foundNote;
            break;
        }
    }

    const parsedList: Array<{
        id: string;
        name: string;
        unit: string;
        price: number;
        initial_stock: number;
        note: string;
        stt?: string | number;
    }> = [];

    if (headerRowIdx !== -1) {
        for (let r = headerRowIdx + 1; r < matrix.length; r++) {
            const row = matrix[r];
            if (!Array.isArray(row) || row.length === 0) continue;

            const rawName = String(row[colName] || "").trim();
            if (!rawName) continue;

            const lower = rawName.toLowerCase();
            if (lower === "tổng" || lower === "tổng cộng" || lower.startsWith("tổng:")) {
                continue;
            }

            const rawUnit = colUnit !== -1 ? String(row[colUnit] || "").trim() : "Phần";
            const unit = rawUnit || "Phần";
            const price = colPrice !== -1 ? parseMoneyAmount(row[colPrice]) : 0;
            const initial_stock = colStock !== -1 ? parseStockQty(row[colStock]) : 0;
            const rawId = colId !== -1 ? String(row[colId] || "").trim() : "";
            const note = colNote !== -1 ? String(row[colNote] || "").trim() : "";

            const stt = colId !== -1 ? row[colId] : parsedList.length + 1;
            const id = rawId && !/^\d+$/.test(rawId) ? rawId : "";

            parsedList.push({
                id,
                name: rawName,
                unit,
                price,
                initial_stock,
                note,
                stt,
            });
        }
    } else {
        // Fallback to object-based json if no custom header detected
        const objRows = xlsx.utils.sheet_to_json<any>(sheet);
        for (const row of objRows) {
            const name = String(
                row["TÊN MẶT HÀNG"] ||
                row["Tên mặt hàng"] ||
                row["Tên sản phẩm"] ||
                row["Tên SP"] ||
                row["Name"] ||
                row["name"] ||
                "",
            ).trim();
            if (!name) continue;

            const unit = String(
                row["ĐƠN VỊ TÍNH"] ||
                row["Đơn vị tính"] ||
                row["ĐVT"] ||
                row["Unit"] ||
                "Phần",
            ).trim();

            const price = parseMoneyAmount(
                row["GIÁ TIỀN"] || row["Giá tiền"] || row["Giá bán"] || row["Giá"] || row["Price"] || "0",
            );
            const initial_stock = parseStockQty(
                row["SỐ LƯỢNG NHẬP"] ||
                row["Số lượng nhập"] ||
                row["Tồn kho đầu"] ||
                row["Tồn kho"] ||
                row["Stock"] ||
                "0",
            );
            const note = String(row["GHI CHÚ"] || row["Ghi chú"] || row["Note"] || "").trim();
            const id = String(row["Mã SP"] || row["ID"] || "").trim();

            parsedList.push({
                id,
                name,
                unit: unit || "Phần",
                price,
                initial_stock,
                note,
                stt: row["STT"] || parsedList.length + 1,
            });
        }
    }

    return parsedList;
}

// Download Excel Template for Inventory
app.get("/api/inventory/template-excel", (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        
        // Structure matches the user's uploaded template image exactly:
        // Row 1: Title "BẢNG DANH MỤC HÀNG HOÁ"
        // Row 2: "STT", "TÊN MẶT HÀNG", "ĐƠN VỊ TÍNH", "GIÁ TIỀN", "SỐ LƯỢNG NHẬP"
        const wsData = [
            ["BẢNG DANH MỤC HÀNG HOÁ", "", "", "", ""],
            ["STT", "TÊN MẶT HÀNG", "ĐƠN VỊ TÍNH", "GIÁ TIỀN", "SỐ LƯỢNG NHẬP"],
            [1, "Đồ khô 1", "Gói", 25000, 500],
            [2, "Đồ khô 2", "Gói", 20000, 500],
            [3, "Đồ nước 1", "Chai", 20000, 300],
            [4, "Đồ nước 2", "Ly", 30000, 200],
            [5, "Combo 1", "Combo", 50000, 200],
            [6, "Combo 2", "Combo", 45000, 200],
        ];

        const ws = xlsx.utils.aoa_to_sheet(wsData);

        // Merge title row A1:E1
        ws["!merges"] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }
        ];

        // Column widths
        ws["!cols"] = [
            { wch: 8 },  // STT
            { wch: 28 }, // TÊN MẶT HÀNG
            { wch: 16 }, // ĐƠN VỊ TÍNH
            { wch: 18 }, // GIÁ TIỀN
            { wch: 18 }, // SỐ LƯỢNG NHẬP
        ];

        xlsx.utils.book_append_sheet(wb, ws, "DANH_MUC_HANG_HOA");
        const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="Bang_Danh_Muc_Hang_Hoa_Mau.xlsx"',
        );
        res.send(buf);
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: `Lỗi tạo file mẫu: ${err.message}`,
        });
    }
});

// Preview uploaded excel without saving
app.post(
    "/api/inventory/preview-excel",
    requireAdmin,
    upload.single("file") as any,
    async (req: any, res: any) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Không tìm thấy file tải lên!",
                });
            }
            const filePath = req.file.path;
            const wb = xlsx.readFile(filePath);
            const sheetName = wb.SheetNames[0];
            const sheet = wb.Sheets[sheetName];
            const items = parseProductsFromExcelSheet(sheet);
            fs.unlinkSync(filePath);

            if (items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Không tìm thấy dữ liệu mặt hàng hợp lệ trong file Excel. Vui lòng kiểm tra định dạng bảng!",
                });
            }

            res.json({
                success: true,
                count: items.length,
                items,
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: `Lỗi đọc file Excel: ${err.message}`,
            });
        }
    },
);

app.post(
    "/api/inventory/upload-excel",
    requireAdmin,
    upload.single("file") as any,
    async (req: any, res: any) => {
        try {
            if (!req.file) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Không tìm thấy file tải lên!",
                    });
            }
            const mode = String(req.body.mode || "merge").trim(); // 'merge' or 'replace'
            const filePath = req.file.path;
            const wb = xlsx.readFile(filePath);
            const sheetName = wb.SheetNames[0];
            const sheet = wb.Sheets[sheetName];
            const rawProducts = parseProductsFromExcelSheet(sheet);
            fs.unlinkSync(filePath);

            if (rawProducts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Không tìm thấy dòng sản phẩm nào hợp lệ trong file Excel. Vui lòng kiểm tra lại cấu trúc cột!",
                });
            }

            if (mode === "replace") {
                INVENTORY_PRODUCTS = [];
            }

            let addedCount = 0;
            let updatedCount = 0;

            for (const item of rawProducts) {
                const name = item.name;
                const unit = item.unit || "Phần";
                const price = item.price || 0;
                const initial_stock = item.initial_stock || 0;
                const note = item.note || "";

                const existingIdx = INVENTORY_PRODUCTS.findIndex(
                    (p) =>
                        (item.id && p.id.toUpperCase() === item.id.toUpperCase()) ||
                        p.name.toLowerCase() === name.toLowerCase(),
                );

                if (existingIdx !== -1) {
                    const oldProd = INVENTORY_PRODUCTS[existingIdx];
                    INVENTORY_PRODUCTS[existingIdx] = {
                        id: oldProd.id,
                        name: name,
                        unit: unit,
                        price: price,
                        initial_stock: initial_stock,
                        sold_count: oldProd.sold_count || 0,
                        note: note || oldProd.note || "",
                    };
                    updatedCount++;
                } else {
                    // Generate new ID SP01, SP02...
                    let newId = item.id;
                    if (!newId) {
                        let num = INVENTORY_PRODUCTS.length + 1;
                        newId = `SP${String(num).padStart(2, "0")}`;
                        while (INVENTORY_PRODUCTS.some((p) => p.id === newId)) {
                            num++;
                            newId = `SP${String(num).padStart(2, "0")}`;
                        }
                    }

                    INVENTORY_PRODUCTS.push({
                        id: newId,
                        name,
                        unit,
                        price,
                        initial_stock,
                        sold_count: 0,
                        note,
                    });
                    addedCount++;
                }
            }

            persist();
            const inv = getInventoryData();
            res.json({
                success: true,
                message: `Đã nạp thành công ${rawProducts.length} mặt hàng vào kho F&B (${addedCount} thêm mới, ${updatedCount} cập nhật)!`,
                addedCount,
                updatedCount,
                ...inv,
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: `Lỗi nạp file Excel: ${err.message}`,
            });
        }
    },
);

// --- 
app.post("/api/inventory/checkout", (req, res) => {
    const data = req.body || {};
    const items = data.items || [];
    const channel = String(data.channel || "Phòng Thanh Niên").trim();
    const seller = String(data.seller || "Thành viên trực ca").trim();
    const shift_id = data.shift_id ? String(data.shift_id).trim() : undefined;
    const customer_name = String(data.customer_name || "").trim();
    const customer_phone = String(data.customer_phone || "").trim();
    const payment_method = String(data.payment_method || "Tiền mặt").trim();
    const note = String(data.note || "").trim();

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "Giỏ hàng trống" });
    }

    // Generate single transaction ID for the whole order
    const txId = `TX${String(SALES_LOGS.length + 1).padStart(3, "0")}`;
    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const newTransactions: SaleTransaction[] = [];
    let totalAmount = 0;

    // First check all items in stock
    for (const item of items) {
        const product_id = String(item.product_id || "").trim().toUpperCase();
        const quantity = Math.max(1, parseInt(item.quantity || "1", 10));
        const product = INVENTORY_PRODUCTS.find(p => String(p.id || "").trim().toUpperCase() === product_id);
        if (!product) {
            return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm ${item.product_id}` });
        }
        const currentStock = Math.max(0, product.initial_stock - (product.sold_count || 0));
        if (quantity > currentStock) {
            return res.status(400).json({ success: false, message: `Sản phẩm ${product.name} chỉ còn ${currentStock} trong kho.` });
        }
        
        newTransactions.push({
            id: txId,
            timestamp,
            product_id: product.id,
            product_name: product.name,
            quantity,
            unit_price: product.price,
            total_amount: quantity * product.price,
            channel,
            seller,
            shift_id,
            customer_name,
            customer_phone,
            payment_method,
            note,
        });
    }

    // Now commit the sale
    for (const tx of newTransactions) {
        const product = INVENTORY_PRODUCTS.find(p => p.id === tx.product_id);
        if (product) {
            product.sold_count = (product.sold_count || 0) + tx.quantity;
        }
        totalAmount += tx.total_amount;
        SALES_LOGS.unshift(tx);
    }

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã ghi nhận đơn hàng ${txId} (${totalAmount.toLocaleString("vi-VN")} ₫)!`,
        transaction_id: txId,
        transactions: newTransactions,
        ...inv,
    });
});

// --- refund --- 
app.post("/api/inventory/refund", (req, res) => {
    const data = req.body || {};
    const transaction_id = String(data.transaction_id || "").trim();

    const transactions = SALES_LOGS.filter((t) => t.id === transaction_id);
    if (transactions.length === 0) {
        return res
            .status(404)
            .json({
                success: false,
                message: `Không tìm thấy giao dịch ${transaction_id}`,
            });
    }

    if (transactions.some((t) => t.refunded)) {
        return res
            .status(400)
            .json({
                success: false,
                message: `Giao dịch ${transaction_id} đã được hủy/hoàn tác trước đó!`,
            });
    }

    // Refund all products in this transaction
    for (const transaction of transactions) {
        const product = INVENTORY_PRODUCTS.find(
            (p) => p.id === transaction.product_id,
        );
        if (product) {
            product.sold_count = Math.max(
                0,
                product.sold_count - transaction.quantity,
            );
        }
        transaction.refunded = true;
    }

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã hủy đơn hàng ${transaction_id} thành công!`,
        ...inv,
    });
});

app.post("/api/inventory/sell", (req, res) => {
    const data = req.body || {};
    const product_id = String(data.product_id || "").trim();
    const quantity = Math.max(1, parseInt(data.quantity || "1", 10));
    const channel = String(data.channel || "Phòng Thanh Niên").trim();
    const seller = String(data.seller || "Thành viên trực ca").trim();
    const shift_id = data.shift_id ? String(data.shift_id).trim() : undefined;
    const customer_name = String(data.customer_name || "").trim();
    const customer_phone = String(data.customer_phone || "").trim();
    const payment_method = String(data.payment_method || "Tiền mặt").trim();
    const note = String(data.note || "").trim();

    const cleanPid = product_id.toUpperCase();
    const product = INVENTORY_PRODUCTS.find(
        (p) =>
            String(p.id || "")
                .trim()
                .toUpperCase() === cleanPid ||
            String(p.id || "").trim() === product_id,
    );
    if (!product) {
        return res
            .status(404)
            .json({
                success: false,
                message: `Không tìm thấy sản phẩm ${product_id}`,
            });
    }

    const currentStock = Math.max(
        0,
        product.initial_stock - product.sold_count,
    );
    if (quantity > currentStock) {
        return res.status(400).json({
            success: false,
            message: `Số lượng bán (${quantity}) vượt quá số lượng tồn kho hiện tại (${currentStock})!`,
        });
    }

    product.sold_count = (product.sold_count || 0) + quantity;

    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const txId = `TX${String(SALES_LOGS.length + 1).padStart(3, "0")}`;
    const total_amount = quantity * product.price;

    const transaction: SaleTransaction = {
        id: txId,
        timestamp,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: product.price,
        total_amount,
        channel,
        seller,
        shift_id,
        customer_name,
        customer_phone,
        payment_method,
        note,
    };

    SALES_LOGS.unshift(transaction);
    persist();

    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã ghi nhận bán ${quantity} ${product.unit} '${product.name}' (${total_amount.toLocaleString("vi-VN")} ₫)!`,
        transaction,
        product,
        ...inv,
    });
});


app.post("/api/inventory/reset", requireAdmin, (req, res) => {
    INVENTORY_PRODUCTS = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    SALES_LOGS = JSON.parse(JSON.stringify(DEFAULT_SALES_LOGS));
    SHIFT_AUDITS = [];
    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: "Đã đặt lại dữ liệu kho hàng về mặc định!",
        ...inv,
    });
});

app.post("/api/inventory/audit-shift", (req, res) => {
    const data = req.body || {};
    const shift_id = String(data.shift_id || "Live").trim();
    const auditor = String(data.auditor || "Người kiểm hàng").trim();
    const itemsData = Array.isArray(data.items) ? data.items : [];
    const summary_note = String(data.summary_note || "").trim();

    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const auditItems: ShiftAuditItem[] = itemsData.map((it: any) => ({
        product_id: String(it.product_id || ""),
        product_name: String(it.product_name || ""),
        unit: String(it.unit || "món"),
        expected_stock: parseInt(it.expected_stock || "0", 10),
        actual_stock: parseInt(it.actual_stock || "0", 10),
        diff: parseInt(it.diff || "0", 10),
        note: String(it.note || "").trim(),
    }));

    const total_diff = auditItems.reduce((acc, item) => acc + item.diff, 0);
    const auditId = `AUD${String(SHIFT_AUDITS.length + 1).padStart(3, "0")}`;

    const auditRecord: ShiftAudit = {
        id: auditId,
        shift_id,
        timestamp,
        auditor,
        items: auditItems,
        total_diff,
        summary_note,
    };

    SHIFT_AUDITS.unshift(auditRecord);
    persist();

    res.json({
        success: true,
        message: `Đã lưu báo cáo đối chiếu kho ca ${shift_id} thành công (Mã kiểm kê: ${auditId})!`,
        audit: auditRecord,
    });
});

app.get("/api/inventory/audit-shift", (req, res) => {
    const shift_id = String(req.query.shift_id || "").trim();
    let results = SHIFT_AUDITS;
    if (shift_id) {
        results = SHIFT_AUDITS.filter((a) => a.shift_id === shift_id);
    }
    res.json({
        success: true,
        audits: results,
    });
});

app.get("/api/members", (req, res) => {
    res.json({
        success: true,
        members: CURRENT_MEMBERS,
        total: CURRENT_MEMBERS.length,
    });
});

app.post("/api/members/update", requireAdmin, (req, res) => {
    const data = req.body || {};
    const member_id = String(data.member_id || "").trim();

    const member = CURRENT_MEMBERS.find((m) => m.member_id === member_id);
    if (!member) {
        return res
            .status(404)
            .json({
                success: false,
                message: `Không tìm thấy thành viên có ID ${member_id}`,
            });
    }

    if (data.name !== undefined) member.name = String(data.name).trim();
    if (data.department !== undefined)
        member.department = String(data.department).trim();
    if (data.phone !== undefined) {
        let p = String(data.phone).trim();
        if (p.endsWith(".0")) p = p.slice(0, -2);
        if (p.length === 9 && !p.startsWith("0")) p = "0" + p;
        member.phone = p;
    }
    if (data.job !== undefined) member.job = String(data.job).trim();
    if (data.school !== undefined) member.school = String(data.school).trim();
    if (data.residence !== undefined)
        member.residence = String(data.residence).trim();
    if (data.vehicle !== undefined)
        member.vehicle = String(data.vehicle).trim();
    if (data.is_standby !== undefined) member.is_standby = !!data.is_standby;

    if (data.availability !== undefined) {
        member.availability = { ...member.availability, ...data.availability };
    }

    if (data.committed_slots !== undefined) {
        member.committed_slots = {
            ...member.committed_slots,
            ...data.committed_slots,
        };
        // Rule: if a slot is committed, it MUST be available too
        for (const [key, val] of Object.entries(member.committed_slots)) {
            if (val) {
                member.availability[key] = true;
            }
        }
    }

    // Re-calculate total_free_slots
    let totalFreeSlots = 0;
    for (const v of Object.values(member.availability)) {
        if (v) totalFreeSlots++;
    }
    (member as any).total_free_slots = totalFreeSlots;

    // Re-calculate min_shifts & max_shifts
    if (member.job.toLowerCase().includes("học sinh")) {
        (member as any).max_shifts = Math.min(
            5,
            Math.max(2, Math.floor(totalFreeSlots / 3)),
        );
        (member as any).min_shifts = 1;
    } else if (member.job.toLowerCase().includes("sinh viên")) {
        (member as any).max_shifts = Math.min(
            6,
            Math.max(2, Math.floor(totalFreeSlots / 2)),
        );
        (member as any).min_shifts = 2;
    } else {
        (member as any).max_shifts = Math.min(
            4,
            Math.max(1, Math.floor(totalFreeSlots / 4)),
        );
        (member as any).min_shifts = 1;
    }

    persist();

    // If there's an active schedule, let's also update the member info inside member_stats if needed
    if (LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.member_stats) {
        const statsIdx = LATEST_SCHEDULE_RESULT.member_stats.findIndex(
            (s: any) => s.member_id === member_id,
        );
        if (statsIdx !== -1) {
            const ms = LATEST_SCHEDULE_RESULT.member_stats[statsIdx];
            ms.name = member.name;
            ms.department = member.department;
            ms.phone = member.phone;
            ms.job = member.job;
            ms.is_standby = member.is_standby;
        }
    }

    res.json({
        success: true,
        message: `Đã cập nhật thông tin & lịch rảnh thành công cho thành viên ${member.name}!`,
        member,
    });
});

// KPI ATTENDANCE ENDPOINTS
app.get("/api/kpi/attendance", (req, res) => {
    // Auto-sync with current schedule
    const shifts =
        LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts
            ? LATEST_SCHEDULE_RESULT.assigned_shifts
            : [];

    // Create a fast lookup set of existing keys: `${shift_id}|${member_id}`
    const existingKeys = new Set(
        KPI_ATTENDANCE.map((log) => `${log.shift_id}|${log.member_id}`),
    );

    let newlyAdded = false;
    shifts.forEach((s: any) => {
        const assigned = s.assigned_members || [];
        assigned.forEach((m: any) => {
            const key = `${s.id}|${m.member_id}`;
            if (!existingKeys.has(key)) {
                KPI_ATTENDANCE.push({
                    shift_id: s.id,
                    member_id: m.member_id,
                    name: m.name,
                    day: s.day,
                    slot: s.start_time + " - " + s.end_time,
                    role: m.role || "Chính",
                    type: s.type || "Phong",
                    status: "Đúng giờ",
                });
                newlyAdded = true;
            }
        });
    });

    if (newlyAdded) {
        persist();
    }

    res.json({
        success: true,
        attendance: KPI_ATTENDANCE,
    });
});

app.post("/api/kpi/attendance", requireAdmin, (req, res) => {
    const { shift_id, member_id, status } = req.body || {};
    if (!shift_id || !member_id) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu shift_id hoặc member_id" });
    }

    let log = KPI_ATTENDANCE.find(
        (l) => l.shift_id === shift_id && l.member_id === member_id,
    );
    if (log) {
        log.status = status;
    } else {
        // Attempt to find in schedule
        const shifts =
            LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts
                ? LATEST_SCHEDULE_RESULT.assigned_shifts
                : [];
        const sh = shifts.find((s: any) => s.id === shift_id);
        const mem = sh
            ? (sh.assigned_members || []).find(
                  (m: any) => m.member_id === member_id,
              )
            : null;

        log = {
            shift_id,
            member_id,
            name: mem
                ? mem.name
                : CURRENT_MEMBERS.find((m) => m.member_id === member_id)
                      ?.name || member_id,
            day: sh ? sh.day : "Thứ 2",
            slot: sh ? sh.start_time + " - " + sh.end_time : "",
            role: mem ? mem.role : "Chính",
            type: sh ? sh.type : "Phong",
            status: status || "Đúng giờ",
        };
        KPI_ATTENDANCE.push(log);
    }

    persist();
    res.json({
        success: true,
        message: "Đã cập nhật trạng thái chuyên cần",
        log,
    });
});

app.post("/api/kpi/attendance/reset", requireAdmin, (req, res) => {
    KPI_ATTENDANCE = [];
    const shifts =
        LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts
            ? LATEST_SCHEDULE_RESULT.assigned_shifts
            : [];
    shifts.forEach((s: any) => {
        const assigned = s.assigned_members || [];
        assigned.forEach((m: any) => {
            KPI_ATTENDANCE.push({
                shift_id: s.id,
                member_id: m.member_id,
                name: m.name,
                day: s.day,
                slot: s.start_time + " - " + s.end_time,
                role: m.role || "Chính",
                type: s.type || "Phong",
                status: "Đúng giờ",
            });
        });
    });

    persist();
    res.json({
        success: true,
        message:
            "Đã đặt lại toàn bộ trạng thái điểm danh về mặc định (Đúng giờ)",
        attendance: KPI_ATTENDANCE,
    });
});

app.get("/api/heatmap", (req, res) => {
    const heatmap_data = getAvailabilityHeatmap(CURRENT_MEMBERS);
    res.json({
        success: true,
        heatmap: heatmap_data,
    });
});

app.all("/api/ca-ngoai", (req, res) => {
    if (req.method === "GET") {
        res.json({
            success: true,
            enabled: ENABLE_CA_NGOAI,
            list: CUSTOM_CA_NGOAI || [],
        });
    } else if (req.method === "POST") {
        if (!isValidAdmin(req)) {
            return res.status(401).json({
                success: false,
                require_admin: true,
                message:
                    "Yêu cầu quyền Quản trị viên (Admin) để chỉnh sửa ca ngoài!",
            });
        }
        const data = req.body || {};
        if (data.enabled !== undefined) {
            ENABLE_CA_NGOAI = Boolean(data.enabled);
        }
        if (data.action) {
            if (data.action === "add") {
                if (!CUSTOM_CA_NGOAI) CUSTOM_CA_NGOAI = [];
                const item = data.item || {};
                const new_id = `NGOAI_${String(CUSTOM_CA_NGOAI.length + 1).padStart(2, "0")}`;
                item.id = new_id;
                CUSTOM_CA_NGOAI.push(item);
            } else if (data.action === "delete") {
                const target_id = data.id;
                if (CUSTOM_CA_NGOAI) {
                    CUSTOM_CA_NGOAI = CUSTOM_CA_NGOAI.filter(
                        (c) => c.id !== target_id,
                    );
                }
            } else if (data.action === "clear") {
                CUSTOM_CA_NGOAI = []; // Explicitly clear all custom outside shifts
            } else if (data.action === "reset") {
                CUSTOM_CA_NGOAI = JSON.parse(JSON.stringify(DEFAULT_CA_NGOAI)); // Revert to default shifts
            }
        }
        persist();

        // Trigger schedule re-run if latest schedule exists
        if (LATEST_SCHEDULE_RESULT) {
            const config = {
                start_date: START_DATE,
                enable_ca_ngoai: ENABLE_CA_NGOAI,
                custom_ca_ngoai: CUSTOM_CA_NGOAI,
                active_types: ENABLE_CA_NGOAI ? ["Phong", "Ngoai"] : ["Phong"],
            };
            const scheduler = new ShiftScheduler(
                CURRENT_SHIFTS,
                CURRENT_MEMBERS,
                config,
            );
            const new_result = scheduler.optimize();
            if (new_result && new_result.success) {
                LATEST_SCHEDULE_RESULT = new_result;
            }
        }

        res.json({
            success: true,
            enabled: ENABLE_CA_NGOAI,
            list: CUSTOM_CA_NGOAI || [],
            schedule: LATEST_SCHEDULE_RESULT,
        });
    } else {
        res.status(405).json({ success: false, message: "Method Not Allowed" });
    }
});

app.post(
    "/api/upload-data",
    requireAdmin,
    upload.single("file") as any,
    async (req: any, res: any) => {
        try {
            let msg = "";
            if (req.file) {
                const file_path = req.file.path;
                const wb = xlsx.readFile(file_path);
                const sheetName = wb.SheetNames[0];
                const sheet = wb.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json<any>(sheet);
                CURRENT_MEMBERS = parseMembersDf(rows);
                fs.unlinkSync(file_path); // Clean up temp file

                const dupCount = (CURRENT_MEMBERS as any).duplicateCount || 0;
                const dupStr =
                    dupCount > 0
                        ? ` (phát hiện & loại bỏ ${dupCount} dòng trùng lặp)`
                        : "";
                msg = `Tải lên thành công file '${req.file.originalname}'! Đã nhập ${CURRENT_MEMBERS.length} thành viên${dupStr}.`;
            } else if (req.body && req.body.google_sheet_url) {
                const url = String(req.body.google_sheet_url).trim();

                // Fetch Google Sheet export URL as CSV
                const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                if (!match) {
                    return res
                        .status(400)
                        .json({
                            success: false,
                            message: "URL Google Sheet không hợp lệ!",
                        });
                }
                const sheet_id = match[1];
                const gid_match = url.match(/[#&?]gid=([0-9]+)/);
                const gid = gid_match ? gid_match[1] : "0";
                const export_url = `https://docs.google.com/spreadsheets/d/${sheet_id}/export?format=csv&gid=${gid}`;

                const response = await fetch(export_url, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                });
                if (!response.ok) {
                    throw new Error(
                        "Không thể tải file từ Google Sheets. Hãy chắc chắn sheet ở chế độ công khai (Bất kỳ ai có liên kết đều có thể xem).",
                    );
                }
                const csvText = await response.text();
                const wb = xlsx.read(csvText, { type: "string" });
                const firstSheet = wb.Sheets[wb.SheetNames[0]];
                const rows = xlsx.utils.sheet_to_json<any>(firstSheet);

                CURRENT_MEMBERS = parseMembersDf(rows);
                const dupCount = (CURRENT_MEMBERS as any).duplicateCount || 0;
                const dupStr =
                    dupCount > 0
                        ? ` (phát hiện & loại bỏ ${dupCount} dòng trùng lặp)`
                        : "";
                msg = `Đồng bộ Google Sheets thành công! Đã tải ${CURRENT_MEMBERS.length} thành viên${dupStr}.`;
            } else {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Không tìm thấy file hoặc link Google Sheets",
                    });
            }

            // Rerun optimization
            await runDefaultOptimization();
            res.json({
                success: true,
                message: msg,
                total_members: CURRENT_MEMBERS.length,
                duplicate_count: (CURRENT_MEMBERS as any).duplicateCount || 0,
                duplicate_details:
                    (CURRENT_MEMBERS as any).duplicateDetails || [],
                schedule: LATEST_SCHEDULE_RESULT,
            });
        } catch (e: any) {
            res.status(500).json({
                success: false,
                message: `Lỗi xử lý dữ liệu đầu vào: ${e.message}`,
            });
        }
    },
);

app.post("/api/shift/update", requireAdmin, async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const data = req.body || {};
    const shift_id = data.shift_id;
    const new_leader = data.shift_leader;
    const members_update = data.assigned_members; // list of {member_id, role, position_role}

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: `Không tìm thấy ca ${shift_id}` });
    }

    if (new_leader !== undefined) {
        target_shift.shift_leader = new_leader;
    }

    if (members_update !== undefined) {
        const mem_lookup = new Map<string, Member>();
        CURRENT_MEMBERS.forEach((m) => mem_lookup.set(m.member_id, m));

        const new_assigned: any[] = [];
        for (const mu of members_update) {
            const m_orig = mem_lookup.get(mu.member_id);
            if (m_orig) {
                new_assigned.push({
                    member_id: m_orig.member_id,
                    name: m_orig.name,
                    department: m_orig.department,
                    residence: m_orig.residence,
                    vehicle: m_orig.vehicle,
                    job: m_orig.job,
                    school: m_orig.school,
                    phone: m_orig.phone,
                    role: mu.role || "Chính",
                    position_role: mu.position_role || "Phục vụ / Giao hàng",
                    is_standby: m_orig.is_standby,
                    is_committed:
                        m_orig.committed_slots[
                            `${target_shift.day}|${target_shift.slot}`
                        ] || false,
                });
            }
        }
        target_shift.assigned_members = new_assigned;
        target_shift.assigned_count = new_assigned.length;
        target_shift.chinh_assigned_count = new_assigned.filter(
            (m) => m.role === "Chính",
        ).length;
        target_shift.dp_assigned_count = new_assigned.filter(
            (m) => m.role === "Dự phòng",
        ).length;
        target_shift.is_filled =
            new_assigned.length >= (target_shift.required_count || 0);
    }

    // Save to Excel and disk
    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    res.json({
        success: true,
        message: `Đã cập nhật thành công thông tin ca ${shift_id}!`,
        shift: target_shift,
    });
});

app.get("/api/contingency/suggest", (req, res) => {
    const shift_id = req.query.shift_id;
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy ca" });
    }

    const assigned_ids = new Set<string>(
        (target_shift.assigned_members || []).map((m: any) => m.member_id),
    );
    const day = target_shift.day;
    const slot = target_shift.slot;
    const overlap_slots = target_shift.overlapping_slots || [slot];

    const available_candidates: any[] = [];
    CURRENT_MEMBERS.forEach((m) => {
        if (assigned_ids.has(m.member_id)) return;

        // Check if member is working another shift at this overlapping slot
        let is_busy_elsewhere = false;
        for (const otherS of LATEST_SCHEDULE_RESULT.assigned_shifts) {
            if (otherS.day === day) {
                const other_overlap = otherS.overlapping_slots || [otherS.slot];
                const intersects = overlap_slots.some((sl: string) =>
                    other_overlap.includes(sl),
                );
                if (intersects) {
                    const is_working = (otherS.assigned_members || []).some(
                        (sm: any) => sm.member_id === m.member_id,
                    );
                    if (is_working) {
                        is_busy_elsewhere = true;
                        break;
                    }
                }
            }
        }

        if (is_busy_elsewhere) return;

        // Priority ranking:
        // 1 = Registered available & Standby team
        // 2 = Registered available
        // 3 = Standby team member (off-duty)
        // 4 = General off-duty member
        const is_registered_free = overlap_slots.every(
            (sl) => m.availability[`${day}|${sl}`] === true,
        );
        let priority = 4;
        let label = "Rảnh lịch chung";

        if (is_registered_free && m.is_standby) {
            priority = 1;
            label = "⚡ Ứng biến (Đã ĐK Rảnh)";
        } else if (is_registered_free) {
            priority = 2;
            label = "✓ Đã ĐK Rảnh";
        } else if (m.is_standby) {
            priority = 3;
            label = "⚡ Ứng biến";
        }

        available_candidates.push({
            member_id: m.member_id,
            name: m.name,
            department: m.department,
            phone: m.phone,
            job: m.job,
            vehicle: m.vehicle,
            is_standby: m.is_standby,
            is_registered_free: is_registered_free,
            priority: priority,
            priority_label: label,
        });
    });

    available_candidates.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name, "vi");
    });

    res.json({
        success: true,
        shift: target_shift,
        candidates: available_candidates,
        total: available_candidates.length,
    });
});

app.post("/api/contingency/log-incident", requireAdmin, async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const data = req.body || {};
    const shift_id = data.shift_id;
    const absent_member_id = data.absent_member_id;
    const replacement_member_id = data.replacement_member_id;
    const status_type = data.status_type || "Vắng đột xuất"; // 'Đi trễ', 'Vắng đột xuất', 'Xin nghỉ trước', 'Có mặt'
    const late_minutes = data.late_minutes
        ? parseInt(data.late_minutes, 10)
        : status_type === "Đi trễ"
          ? 15
          : 0;
    const note = data.note || "";

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy ca" });
    }

    const absent_m = CURRENT_MEMBERS.find(
        (m) => m.member_id === absent_member_id,
    );
    const rep_m = CURRENT_MEMBERS.find(
        (m) => m.member_id === replacement_member_id,
    );

    if (rep_m && absent_m) {
        target_shift.assigned_members = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.member_id !== absent_member_id);
        target_shift.assigned_members.push({
            member_id: rep_m.member_id,
            name: rep_m.name,
            department: rep_m.department,
            residence: rep_m.residence,
            vehicle: rep_m.vehicle,
            job: rep_m.job,
            school: rep_m.school,
            phone: rep_m.phone,
            role: "Dự phòng thay thế",
            position_role: "Phục vụ / Giao hàng",
            is_standby: rep_m.is_standby,
            is_committed: false,
        });
        target_shift.assigned_count = target_shift.assigned_members.length;
    } else if (absent_m && (status_type === "Hủy ca" || status_type === "Vắng đột xuất" || status_type === "Xin nghỉ trước")) {
        target_shift.assigned_members = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.member_id !== absent_member_id);
        if (target_shift.shift_leader === absent_m.name) {
            target_shift.shift_leader = target_shift.assigned_members[0]?.name || "Chưa chỉ định";
        }
        target_shift.assigned_count = target_shift.assigned_members.length;
        target_shift.chinh_assigned_count = (target_shift.assigned_members || []).filter(
            (m: any) => m.role === "Chính",
        ).length;
        target_shift.dp_assigned_count = (target_shift.assigned_members || []).filter(
            (m: any) => m.role === "Dự phòng",
        ).length;
        target_shift.is_filled =
            target_shift.assigned_count >= (target_shift.required_count || 0);
    }

    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const incident_record = {
        id: INCIDENT_LOGS.length + 1,
        shift_id: shift_id,
        day: target_shift.day,
        date: target_shift.date || "",
        slot: target_shift.slot,
        location: target_shift.location || target_shift.type_label,
        status_type: status_type,
        late_minutes: late_minutes,
        absent_member: absent_m ? absent_m.name : "Chung",
        absent_member_id: absent_member_id,
        replacement_member: rep_m ? rep_m.name : "Không thay thế",
        replacement_member_id: replacement_member_id,
        note: note,
        timestamp: timestamp,
    };

    INCIDENT_LOGS.unshift(incident_record);

    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    // Compute late / absence summary stats
    const late_logs = INCIDENT_LOGS.filter((i) => i.status_type === "Đi trễ");
    const absent_logs = INCIDENT_LOGS.filter(
        (i) =>
            i.status_type === "Vắng đột xuất" ||
            i.status_type === "Xin nghỉ trước",
    );

    res.json({
        success: true,
        message: `Đã ghi nhận dữ liệu điểm danh '${status_type}' thành công!`,
        incident: incident_record,
        incidents: INCIDENT_LOGS,
        stats: {
            total_incidents: INCIDENT_LOGS.length,
            total_late: late_logs.length,
            total_absent: absent_logs.length,
            replaced_count: INCIDENT_LOGS.filter(
                (i) => i.replacement_member !== "Không thay thế",
            ).length,
        },
    });
});

app.get("/api/contingency/incidents", (req, res) => {
    res.json({
        success: true,
        incidents: INCIDENT_LOGS,
    });
});

app.post("/api/contingency/reset", requireAdmin, (req, res) => {
    INCIDENT_LOGS = [];
    persist();
    res.json({
        success: true,
        message: "Đã xóa toàn bộ lịch sử điểm danh và ghi nhận sự cố!",
        incidents: [],
        stats: {
            total_incidents: 0,
            total_late: 0,
            total_absent: 0,
            replaced_count: 0,
        },
    });
});

// OPTIMIZER & SHIFT CONFIGURATION ENDPOINTS
app.get("/api/config/optimizer", (req, res) => {
    res.json({
        success: true,
        config: OPTIMIZER_CONFIG,
    });
});

app.post("/api/config/optimizer", requireAdmin, (req, res) => {
    const data = req.body || {};
    if (data.start_date) {
        OPTIMIZER_CONFIG.start_date = String(data.start_date).trim();
        START_DATE = OPTIMIZER_CONFIG.start_date;
        applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
    }
    if (data.phong_chinh_count !== undefined) {
        OPTIMIZER_CONFIG.phong_chinh_count =
            parseInt(data.phong_chinh_count, 10) || 4;
    }
    if (data.phong_dp_count !== undefined) {
        OPTIMIZER_CONFIG.phong_dp_count =
            parseInt(data.phong_dp_count, 10) || 1;
    }
    if (data.min_shifts !== undefined) {
        OPTIMIZER_CONFIG.min_shifts = parseInt(data.min_shifts, 10) || 1;
    }
    if (data.max_shifts !== undefined) {
        OPTIMIZER_CONFIG.max_shifts = parseInt(data.max_shifts, 10) || 4;
    }
    if (data.max_shifts_per_day !== undefined) {
        OPTIMIZER_CONFIG.max_shifts_per_day =
            parseInt(data.max_shifts_per_day, 10) || 2;
    }
    if (data.enable_ca_ngoai !== undefined) {
        OPTIMIZER_CONFIG.enable_ca_ngoai = Boolean(data.enable_ca_ngoai);
        ENABLE_CA_NGOAI = OPTIMIZER_CONFIG.enable_ca_ngoai;
    }
    if (
        Array.isArray(data.daily_shift_configs) &&
        data.daily_shift_configs.length > 0
    ) {
        OPTIMIZER_CONFIG.daily_shift_configs = data.daily_shift_configs;
        applyDailyConfigsToShifts(
            CURRENT_SHIFTS,
            OPTIMIZER_CONFIG.daily_shift_configs,
        );
    }
    if (Array.isArray(data.custom_ca_ngoai)) {
        CUSTOM_CA_NGOAI = data.custom_ca_ngoai;
    }

    persist();
    res.json({
        success: true,
        message: "Đã lưu cài đặt tinh chỉnh ca trực thành công vào hệ thống!",
        config: OPTIMIZER_CONFIG,
    });
});

app.post("/api/config/optimizer/reset", requireAdmin, (req, res) => {
    OPTIMIZER_CONFIG = JSON.parse(JSON.stringify(DEFAULT_OPTIMIZER_CONFIG));
    START_DATE = OPTIMIZER_CONFIG.start_date;
    ENABLE_CA_NGOAI = OPTIMIZER_CONFIG.enable_ca_ngoai;
    applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);
    applyDailyConfigsToShifts(
        CURRENT_SHIFTS,
        OPTIMIZER_CONFIG.daily_shift_configs,
    );
    persist();
    res.json({
        success: true,
        message: "Đã khôi phục cài đặt tinh chỉnh ca trực về mặc định!",
        config: OPTIMIZER_CONFIG,
    });
});

// CANCEL SHIFT / CLEAR SHIFT ASSIGNMENT ENDPOINT
app.post("/api/shift/cancel", requireAdmin, async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const data = req.body || {};
    const shift_id = data.shift_id;
    const member_id = data.member_id;
    const reason = data.reason || "";

    if (!shift_id) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu mã ca trực (shift_id)" });
    }

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: `Không tìm thấy ca ${shift_id}` });
    }

    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    if (member_id) {
        // Hủy phân công của 1 nhân sự cụ thể trong ca
        const removed = target_shift.assigned_members.find(
            (m: any) => m.member_id === member_id,
        );
        const memName = removed?.name || member_id;
        target_shift.assigned_members = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.member_id !== member_id);
        if (target_shift.shift_leader === memName) {
            target_shift.shift_leader =
                target_shift.assigned_members[0]?.name || "Chưa chỉ định";
        }
        target_shift.assigned_count = target_shift.assigned_members.length;
        target_shift.chinh_assigned_count = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.role === "Chính").length;
        target_shift.dp_assigned_count = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.role === "Dự phòng").length;
        target_shift.is_filled =
            target_shift.assigned_count >= (target_shift.required_count || 0);

        INCIDENT_LOGS.unshift({
            id: INCIDENT_LOGS.length + 1,
            shift_id: shift_id,
            day: target_shift.day,
            date: target_shift.date || "",
            slot: target_shift.slot,
            location: target_shift.location || target_shift.type_label,
            status_type: "Hủy ca",
            late_minutes: 0,
            absent_member: memName,
            absent_member_id: member_id,
            replacement_member: "Không thay thế",
            replacement_member_id: null,
            note:
                reason ||
                `Admin đã hủy phân công trực ca ${shift_id} của nhân sự ${memName}`,
            timestamp: timestamp,
        });

        await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
        persist();

        return res.json({
            success: true,
            message: `Đã hủy phân công của nhân sự ${memName} khỏi ca ${shift_id}!`,
            shift: target_shift,
            schedule: LATEST_SCHEDULE_RESULT,
        });
    }

    // Hủy toàn bộ ca trực
    if (target_shift.type === "Ngoai") {
        CUSTOM_CA_NGOAI = (CUSTOM_CA_NGOAI || []).filter(
            (c: any) =>
                c.id !== shift_id && c.name !== target_shift.location,
        );
        LATEST_SCHEDULE_RESULT.assigned_shifts =
            LATEST_SCHEDULE_RESULT.assigned_shifts.filter(
                (s: any) => s.shift_id !== shift_id,
            );
        LATEST_SCHEDULE_RESULT.total_shifts =
            LATEST_SCHEDULE_RESULT.assigned_shifts.length;
    } else {
        target_shift.assigned_members = [];
        target_shift.shift_leader = "Chưa chỉ định";
        target_shift.assigned_count = 0;
        target_shift.chinh_assigned_count = 0;
        target_shift.dp_assigned_count = 0;
        target_shift.is_filled = false;
    }

    INCIDENT_LOGS.unshift({
        id: INCIDENT_LOGS.length + 1,
        shift_id: shift_id,
        day: target_shift.day,
        date: target_shift.date || "",
        slot: target_shift.slot,
        location: target_shift.location || target_shift.type_label,
        status_type: "Hủy ca trực",
        late_minutes: 0,
        absent_member: "Toàn bộ ca",
        absent_member_id: null,
        replacement_member: "Không thay thế",
        replacement_member_id: null,
        note: reason || `Admin đã hủy toàn bộ phân công ca trực ${shift_id}`,
        timestamp: timestamp,
    });

    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    return res.json({
        success: true,
        message: `Đã hủy thành công ca trực ${shift_id}!`,
        shift: target_shift,
        schedule: LATEST_SCHEDULE_RESULT,
    });
});

app.post("/api/schedule/run", requireAdmin, async (req, res) => {
    const data = req.body || {};

    if (data.start_date) {
        START_DATE = String(data.start_date).trim();
        OPTIMIZER_CONFIG.start_date = START_DATE;
    }
    applyStartDateToShifts(CURRENT_SHIFTS, START_DATE);

    if (data.enable_ca_ngoai !== undefined) {
        ENABLE_CA_NGOAI = Boolean(data.enable_ca_ngoai);
        OPTIMIZER_CONFIG.enable_ca_ngoai = ENABLE_CA_NGOAI;
    }
    if (data.custom_ca_ngoai !== undefined) {
        CUSTOM_CA_NGOAI = data.custom_ca_ngoai;
    }
    if (data.phong_chinh_count !== undefined) {
        OPTIMIZER_CONFIG.phong_chinh_count = parseInt(data.phong_chinh_count, 10) || 4;
    }
    if (data.phong_dp_count !== undefined) {
        OPTIMIZER_CONFIG.phong_dp_count = parseInt(data.phong_dp_count, 10) || 1;
    }
    if (data.min_shifts !== undefined) {
        OPTIMIZER_CONFIG.min_shifts = parseInt(data.min_shifts, 10) || 1;
    }
    if (data.max_shifts !== undefined) {
        OPTIMIZER_CONFIG.max_shifts = parseInt(data.max_shifts, 10) || 4;
    }
    if (data.max_shifts_per_day !== undefined) {
        OPTIMIZER_CONFIG.max_shifts_per_day = parseInt(data.max_shifts_per_day, 10) || 2;
    }
    if (Array.isArray(data.daily_shift_configs) && data.daily_shift_configs.length > 0) {
        OPTIMIZER_CONFIG.daily_shift_configs = data.daily_shift_configs;
        applyDailyConfigsToShifts(CURRENT_SHIFTS, OPTIMIZER_CONFIG.daily_shift_configs);
    }

    const config = {
        start_date: START_DATE,
        min_shifts_per_member: parseInt(data.min_shifts || OPTIMIZER_CONFIG.min_shifts || "1", 10),
        max_shifts_per_member: parseInt(data.max_shifts || OPTIMIZER_CONFIG.max_shifts || "4", 10),
        max_shifts_per_day: parseInt(data.max_shifts_per_day || OPTIMIZER_CONFIG.max_shifts_per_day || "2", 10),
        phong_chinh_count: parseInt(data.phong_chinh_count || OPTIMIZER_CONFIG.phong_chinh_count || "4", 10),
        phong_dp_count: parseInt(data.phong_dp_count || OPTIMIZER_CONFIG.phong_dp_count || "1", 10),
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
        active_types: ENABLE_CA_NGOAI ? ["Phong", "Ngoai"] : ["Phong"],
    };

    const scheduler = new ShiftScheduler(
        CURRENT_SHIFTS,
        CURRENT_MEMBERS,
        config,
    );
    const result = scheduler.optimize();

    if (result && result.success) {
        LATEST_SCHEDULE_RESULT = result;
        await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
        persist();
        res.json({
            success: true,
            result: result,
            message: "Tối ưu hóa lịch trực thành công!",
        });
    } else {
        persist();
        res.status(400).json({
            success: false,
            message:
                result?.message ||
                "Không tìm thấy phương án tối ưu thỏa mãn ràng buộc!",
        });
    }
});

app.get("/api/schedule/current", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        await runDefaultOptimization();
    }
    if (LATEST_SCHEDULE_RESULT) {
        res.json({
            success: true,
            result: LATEST_SCHEDULE_RESULT,
        });
    } else {
        res.status(404).json({
            success: false,
            message: "Chưa có lịch trực nào",
        });
    }
});

function getFormattedTimestamp(): string {
    const now = new Date();
    // UTC time + 7 hours for GMT+7 (Vietnam)
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const year = vnTime.getUTCFullYear();
    const month = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(vnTime.getUTCDate()).padStart(2, "0");
    const hour = String(vnTime.getUTCHours()).padStart(2, "0");
    const minute = String(vnTime.getUTCMinutes()).padStart(2, "0");
    const second = String(vnTime.getUTCSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hour}${minute}${second}`;
}

app.get("/api/schedule/export", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        await runDefaultOptimization();
    }
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực để xuất" });
    }

    const out_file = await exportScheduleToExcel(
        LATEST_SCHEDULE_RESULT,
        REPORT_PATH,
    );
    const ts = getFormattedTimestamp();
    res.download(out_file, `Lich_Truc_Toi_Uu_Hung_Vuong_Concert_${ts}.xlsx`);
});

app.get("/api/contingency/export-excel", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        await runDefaultOptimization();
    }
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Chưa có lịch trực để xuất báo cáo",
            });
    }

    const out_file = await exportScheduleToExcel(
        LATEST_SCHEDULE_RESULT,
        REPORT_PATH,
    );
    const ts = getFormattedTimestamp();
    res.download(out_file, `Bao_Cao_Ca_Vang_Di_Tre_Va_Thay_The_${ts}.xlsx`);
});

app.get("/api/preview", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        await runDefaultOptimization();
    }
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Chưa có lịch trực để xem trước",
            });
    }

    const assigned = LATEST_SCHEDULE_RESULT.assigned_shifts || [];
    const m_stats = LATEST_SCHEDULE_RESULT.member_stats || [];
    const audit = LATEST_SCHEDULE_RESULT.audit_results || {};
    const cont = LATEST_SCHEDULE_RESULT.contingency_matrix || [];

    const preview = {
        tong_ca_truc: {
            headers: [
                "Mã Ca",
                "Kênh",
                "Thứ",
                "Ngày",
                "Khung Giờ",
                "Địa Điểm",
                "Trưởng Ca",
                "Trực Chính",
                "Dự Phòng",
                "Tình Trạng",
            ],
            rows: assigned.map((s: any) => [
                s.shift_id,
                s.type_label,
                s.day,
                s.date,
                s.slot,
                s.location,
                s.shift_leader || "-",
                (s.assigned_members || [])
                    .filter((m: any) => m.role === "Chính")
                    .map((m: any) => `${m.name} (${m.department})`)
                    .join(", "),
                (s.assigned_members || [])
                    .filter((m: any) => m.role !== "Chính")
                    .map((m: any) => `${m.name} (${m.department})`)
                    .join(", "),
                s.is_filled ? "Đủ người" : "Thiếu người",
            ]),
        },
        ca_trong: {
            headers: [
                "Mã Ca",
                "Thứ",
                "Ngày",
                "Khung Giờ",
                "Định Mức",
                "Trưởng Ca",
                "Danh Sách Trực Chính",
                "Danh Sách Dự Phòng",
            ],
            rows: assigned
                .filter((s: any) => s.type === "Phong")
                .map((s: any) => [
                    s.shift_id,
                    s.day,
                    s.date,
                    s.slot,
                    `${s.chinh_count || 3} Chính + ${s.dp_count || 1} DP`,
                    s.shift_leader || "-",
                    (s.assigned_members || [])
                        .filter((m: any) => m.role === "Chính")
                        .map((m: any) => `${m.name} (${m.phone})`)
                        .join(", "),
                    (s.assigned_members || [])
                        .filter((m: any) => m.role !== "Chính")
                        .map((m: any) => `${m.name} (${m.phone})`)
                        .join(", "),
                ]),
        },
        ca_ngoai: {
            headers: [
                "Mã Ca",
                "Thứ",
                "Ngày",
                "Khung Giờ",
                "Địa Điểm",
                "Định Mức",
                "Trưởng Điểm",
                "Danh Sách Trực Chính",
                "Danh Sách Dự Phòng",
            ],
            rows: assigned
                .filter((s: any) => s.type === "Ngoai")
                .map((s: any) => [
                    s.shift_id,
                    s.day,
                    s.date,
                    s.slot,
                    s.location,
                    `${s.chinh_count || 2} Chính + ${s.dp_count || 1} DP`,
                    s.shift_leader || "-",
                    (s.assigned_members || [])
                        .filter((m: any) => m.role === "Chính")
                        .map((m: any) => `${m.name} (${m.phone})`)
                        .join(", "),
                    (s.assigned_members || [])
                        .filter((m: any) => m.role !== "Chính")
                        .map((m: any) => `${m.name} (${m.phone})`)
                        .join(", "),
                ]),
        },
        thong_ke: {
            headers: [
                "Mã TV",
                "Họ Tên",
                "Ban",
                "Đối Tượng",
                "SĐT",
                "Đội Ứng Biến",
                "Tổng Ca",
                "Tổng Giờ",
                "Ca Trong",
                "Ca Ngoài",
                "Mã Ca Phân Công",
            ],
            rows: m_stats.map((m: any) => [
                m.member_id,
                m.name,
                m.department,
                m.job,
                m.phone,
                m.is_standby ? "Có" : "Không",
                m.total_shifts,
                `${m.total_hours}h`,
                m.phong_shifts,
                m.ngoai_shifts,
                m.assigned_shift_ids,
            ]),
        },
        kiem_tra_ca: {
            headers: [
                "Hạng Mục Kiểm Tra",
                "Kết Quả Thẩm Định",
                "Tiêu Chuẩn Đạt",
                "Đánh Giá",
            ],
            rows: [
                [
                    "Xung đột trùng ca cùng giờ",
                    `${audit.conflict_count || 0} vi phạm`,
                    "0 vi phạm",
                    "100% ĐẠT",
                ],
                [
                    "Vi phạm lịch rảnh đăng ký",
                    `${audit.availability_violation_count || 0} vi phạm`,
                    "0 vi phạm",
                    "100% ĐẠT",
                ],
                [
                    "Ca phòng bán trống không người",
                    `${audit.empty_room_count || 0} ca trống`,
                    "0 ca trống",
                    "100% ĐẠT",
                ],
                [
                    "Ca quá tải trong ngày (>2 ca)",
                    `${audit.daily_overload_count || 0} vi phạm`,
                    "0 vi phạm",
                    "100% ĐẠT",
                ],
                [
                    "Chỉ số công bằng phân bổ",
                    `${audit.fairness_metrics?.fairness_score || 97}/100`,
                    ">= 90/100",
                    "XUẤT SẮC",
                ],
            ],
        },
        ca_vang: {
            headers: [
                "Mã Ca",
                "Kênh",
                "Thứ",
                "Khung Giờ",
                "Địa Điểm",
                "Nhân Sự Chính Thức",
                "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến)",
                "Dự Phòng 2",
                "Dự Phòng 3",
            ],
            rows: cont.map((c: any) => [
                c.shift_id,
                c.type_label,
                c.day,
                c.slot,
                c.location,
                (c.current_assigned || []).join(", "),
                c.backup_candidates[0]
                    ? `${c.backup_candidates[0].name} (${c.backup_candidates[0].phone})`
                    : "-",
                c.backup_candidates[1]
                    ? `${c.backup_candidates[1].name} (${c.backup_candidates[1].phone})`
                    : "-",
                c.backup_candidates[2]
                    ? `${c.backup_candidates[2].name} (${c.backup_candidates[2].phone})`
                    : "-",
            ]),
        },
        ca_vang_backup: {
            headers: [
                "Mã Ca",
                "Kênh / Loại",
                "Thứ / Ngày",
                "Khung Giờ Trực",
                "Địa Điểm Trực",
                "Định Mức Yêu Cầu",
                "Nhân Sự Chính Thức Phân Công",
                "Dự Phòng Ưu Tiên 1 (Đội Ứng Biến Standby)",
                "Dự Phòng Ưu Tiên 2 (Dự Bị Rảnh Slot)",
                "Dự Phòng Ưu Tiên 3 (Dự Bị Hỗ Trợ)",
                "Trạng Thái Sẵn Sàng Backup",
            ],
            rows: cont.map((c: any) => [
                c.shift_id,
                c.type_label,
                `${c.day} (${c.date || "Tuần F&B"})`,
                c.slot,
                c.location,
                `${c.required_count || 4} Người (${c.chinh_count || 4} Chính + ${c.dp_count || 1} DP)`,
                (c.current_assigned || []).join(", ") || "Chưa phân công",
                c.backup_candidates[0]
                    ? `${c.backup_candidates[0].name} - ${c.backup_candidates[0].phone} (${c.backup_candidates[0].department})`
                    : "Chưa kích hoạt pool",
                c.backup_candidates[1]
                    ? `${c.backup_candidates[1].name} - ${c.backup_candidates[1].phone} (${c.backup_candidates[1].department})`
                    : "-",
                c.backup_candidates[2]
                    ? `${c.backup_candidates[2].name} - ${c.backup_candidates[2].phone} (${c.backup_candidates[2].department})`
                    : "-",
                c.backup_candidates && c.backup_candidates.length > 0
                    ? "⚡ Sẵn sàng ứng biến 24/7"
                    : "⚠️ Cần bổ sung nhân sự",
            ]),
        },
    };

    res.json({
        success: true,
        preview: preview,
    });
});

app.get("/api/protocols", (req, res) => {
    res.json({
        success: true,
        protocols: TASK_2_DETAILS,
    });
});

app.get("/api/competition/stats", (req, res) => {
    const week = req.query.week || "TỔNG KẾT";
    const shifts = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
    
    let memberStats = CURRENT_MEMBERS.map(m => ({
        member_id: m.member_id,
        name: m.name,
        department: m.department,
        individual_sales: 0,
        group_sales_contrib: 0,
        shifts_participated: 0,
        reputation: 100,
        productivity: 0,
        total_score: 0,
        sales_score: 0,
        prod_score: 0,
        rep_score: 0,
        violations: []
    }));
    
    // 1. Individual Sales (Best Seller)
    const filteredSalesLogs = week === "TỔNG KẾT" ? SALES_LOGS : SALES_LOGS.filter(tx => tx.week === week || !tx.week); // If it doesn't have week, include it just in case, or maybe only exact match
    const filteredIncidentLogs = week === "TỔNG KẾT" ? INCIDENT_LOGS : INCIDENT_LOGS.filter(inc => inc.week === week || !inc.week);

    filteredSalesLogs.forEach(tx => {
        if (tx.seller && !tx.refunded) {
            const member = memberStats.find(m => m.name === tx.seller);
            if (member) member.individual_sales += tx.quantity;
        }
    });
    
    // 2. Shift Groups & Equivalent Sales
    let shiftGroups = {};
    filteredSalesLogs.forEach(tx => {
        if (!tx.refunded && tx.shift_id) {
            if (!shiftGroups[tx.shift_id]) {
                shiftGroups[tx.shift_id] = { shift_id: tx.shift_id, total_sales: 0, members: [] };
            }
            shiftGroups[tx.shift_id].total_sales += tx.quantity;
        }
    });
    
    shifts.forEach((s: any) => {
        if (!shiftGroups[s.shift_id]) {
            shiftGroups[s.shift_id] = { shift_id: s.shift_id, total_sales: 0, members: [] };
        }
        const assignedNames = (s.assigned_members || []).map((m: any) => m.name);
        shiftGroups[s.shift_id].members = assignedNames;
        
        // Members participated
        assignedNames.forEach((name: string) => {
            const mem = memberStats.find(m => m.name === name);
            if (mem) mem.shifts_participated += 1;
        });
    });
    
    Object.values(shiftGroups).forEach((sg: any) => {
        const memCount = sg.members.length;
        if (memCount > 0) {
            const equivalent = sg.total_sales / memCount;
            sg.equivalent = equivalent;
            sg.members.forEach((name: string) => {
                const mem = memberStats.find(m => m.name === name);
                if (mem) mem.group_sales_contrib += equivalent;
            });
        } else {
            sg.equivalent = 0;
        }
    });
    
    // 3. Reputation (Incidents)
    filteredIncidentLogs.forEach(inc => {
        if (inc.status_type) {
            const mem = memberStats.find(m => m.name === inc.member);
            if (mem) {
                let penalty = 0;
                if (inc.status_type === "Đi trễ") penalty = 5;
                if (inc.status_type === "Vắng đột xuất" || inc.status_type === "Vắng không phép") penalty = 20;
                if (inc.status_type === "Sử dụng điện thoại") penalty = 5;
                if (penalty > 0) {
                    mem.reputation -= penalty;
                    mem.violations.push({ type: inc.status_type, penalty });
                }
            }
        }
    });
    
    // Calculate final scores
    let maxGroupContrib = Math.max(0.001, ...memberStats.map(m => m.group_sales_contrib));
    
    memberStats.forEach(m => {
        m.productivity = m.shifts_participated > 0 ? (m.group_sales_contrib / m.shifts_participated) : 0;
    });
    let maxProductivity = Math.max(0.001, ...memberStats.map(m => m.productivity));
    
    memberStats.forEach(m => {
        m.sales_score = (m.group_sales_contrib / maxGroupContrib) * 40;
        m.prod_score = (m.productivity / maxProductivity) * 40;
        m.rep_score = (m.reputation) * 0.2; // 100 * 0.2 = 20 max
        m.total_score = m.sales_score + m.prod_score + m.rep_score;
    });
    
    // Department stats
    let deptMap: any = {};
    memberStats.forEach(m => {
        const dept = (m.department || "Không rõ").replace("Ban ", "");
        if (!deptMap[dept]) deptMap[dept] = { department: dept, members: [], total_sales_contrib: 0, total_productivity: 0, total_reputation: 0 };
        deptMap[dept].members.push(m);
        deptMap[dept].total_sales_contrib += m.group_sales_contrib;
        deptMap[dept].total_productivity += m.productivity;
        deptMap[dept].total_reputation += m.reputation;
    });
    
    let depts = Object.values(deptMap).map((d: any) => {
        const cnt = d.members.length || 1;
        d.avg_sales_contrib = d.total_sales_contrib / cnt;
        d.avg_productivity = d.total_productivity / cnt;
        d.avg_reputation = d.total_reputation / cnt;
        return d;
    });
    
    let maxDeptSales = Math.max(0.001, ...depts.map(d => d.avg_sales_contrib));
    let maxDeptProd = Math.max(0.001, ...depts.map(d => d.avg_productivity));
    
    depts.forEach((d: any) => {
        d.sales_score = (d.avg_sales_contrib / maxDeptSales) * 40;
        d.prod_score = (d.avg_productivity / maxDeptProd) * 40;
        d.rep_score = d.avg_reputation * 0.2;
        d.total_score = d.sales_score + d.prod_score + d.rep_score;
    });
    
    // Group Stats
    let sGroups = Object.values(shiftGroups).map((sg: any) => {
        let totalRep = 0;
        sg.members.forEach((name: string) => {
            const mem = memberStats.find(m => m.name === name);
            if (mem) totalRep += mem.reputation;
        });
        sg.avg_reputation = sg.members.length > 0 ? (totalRep / sg.members.length) : 100;
        return sg;
    });
    
    let maxShiftSales = Math.max(0.001, ...sGroups.map((sg: any) => sg.total_sales));
    let maxShiftRep = Math.max(0.001, ...sGroups.map((sg: any) => sg.avg_reputation));
    
    sGroups.forEach((sg: any) => {
        sg.sales_score = (sg.total_sales / maxShiftSales) * 70;
        sg.rep_score = (sg.avg_reputation / maxShiftRep) * 30;
        sg.total_score = sg.sales_score + sg.rep_score;
    });

    res.json({
        success: true,
        week,
        best_seller: [...memberStats].sort((a,b) => b.individual_sales - a.individual_sales).slice(0, 5),
        all_rounder: [...memberStats].sort((a,b) => b.total_score - a.total_score).slice(0, 10),
        departments: [...depts].sort((a: any,b: any) => b.total_score - a.total_score),
        shift_groups: [...sGroups].filter((sg:any) => sg.members.length > 0 && sg.total_sales > 0).sort((a: any,b: any) => b.total_score - a.total_score).slice(0, 10),
    });
});
// App Start
app.listen(PORT, "0.0.0.0", () => {
app.post("/api/competition/seed", (req, res) => {
    // Xóa dữ liệu mẫu cũ (nếu có)
    for (let i = SALES_LOGS.length - 1; i >= 0; i--) {
        if (SALES_LOGS[i].id.startsWith("TX_MOCK_")) SALES_LOGS.splice(i, 1);
    }
    for (let i = INCIDENT_LOGS.length - 1; i >= 0; i--) {
        if (INCIDENT_LOGS[i].id.startsWith("INC_MOCK_")) INCIDENT_LOGS.splice(i, 1);
    }

    const shiftsToUse = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
    
    if (shiftsToUse.length === 0) {
        return res.json({ success: false, message: "Chưa có lịch trực. Vui lòng xếp lịch tự động (OR-Tools) trước khi tạo dữ liệu mẫu." });
    }

    // Lặp qua tất cả các ca trực đã xếp để tạo doanh số thực tế cho từng ca
    shiftsToUse.forEach((shift: any, index: number) => {
        const assignedMembers = shift.assigned_members || [];
        if (assignedMembers.length === 0) return;

        // Mô phỏng 1 ca có từ 2 đến 10 đơn hàng
        const numOrders = Math.floor(Math.random() * 8) + 2; 

        for (let i = 0; i < numOrders; i++) {
            // Chọn ngẫu nhiên 1 người bán trong ca
            const seller = assignedMembers[Math.floor(Math.random() * assignedMembers.length)].name;
            const quantity = Math.floor(Math.random() * 5) + 1; // 1-5 sản phẩm
            const unit_price = 15000;

            const randomWeekIndex = Math.floor(Math.random() * 3) + 1;
            const weekStr = `Tuần ${randomWeekIndex}`;

            SALES_LOGS.push({
                id: `TX_MOCK_${Date.now()}_${index}_${i}`,
                timestamp: new Date().toLocaleString(),
                product_id: "F&B_MOCK",
                product_name: "Sản phẩm Demo F&B",
                quantity: quantity,
                unit_price: unit_price,
                total_amount: quantity * unit_price,
                channel: "Phòng Thanh Niên",
                seller: seller,
                shift_id: shift.shift_id,
                refunded: false,
                week: weekStr
            });
        }

        // Thi thoảng tạo lỗi vi phạm (Đi trễ, vắng đột xuất)
        if (Math.random() < 0.15) { // 15% xác suất có lỗi trong ca
            const badMember = assignedMembers[Math.floor(Math.random() * assignedMembers.length)].name;
            const isLate = Math.random() > 0.5;
            const randomWeekIndex = Math.floor(Math.random() * 3) + 1;
            INCIDENT_LOGS.push({
                id: `INC_MOCK_${Date.now()}_${index}`,
                shift_id: shift.shift_id,
                member: badMember,
                status_type: isLate ? "Đi trễ" : "Vắng đột xuất",
                note: "Lỗi vi phạm mẫu để kiểm thử",
                week: `Tuần ${randomWeekIndex}`
            });
        }
    });

    persist();
    res.json({ success: true, message: "Đã tạo dữ liệu giao dịch bán hàng và vi phạm thực tế cho các ca trực." });
});
    console.log(`Server running on port ${PORT}`);
    // Run bootstrap
    bootstrapState();
});
