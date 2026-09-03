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
import { renderAppsScript } from "./src/sheet_sync_script";
import {
    CompetitionConfig,
    CompetitionInput,
    DEFAULT_WEEKS,
    TOTAL_LABEL,
    buildSheetTables,
    computeProject,
    computeWeek,
    describeFormulas,
    makeDefaultCompetitionConfig,
    normalizeCompetitionConfig,
    resolveWeek,
    tableToCsv,
} from "./src/competition";

const app = express();
// Đọc cổng từ biến môi trường PORT (mặc định 3000) để chạy được song song
// nhiều instance / môi trường preview mà không phải sửa code.
const PORT = getRuntimePort();
const STATE_FILE = process.env.STATE_FILE || "state.json";
const REPORT_PATH = "reports/Lich_Truc_Toi_Uu_Hung_Vuong_Concert.xlsx";

function resolveAppRoot(): string {
    for (const candidate of [
        __dirname,
        path.join(__dirname, ".."),
        process.cwd(),
    ]) {
        if (fs.existsSync(path.join(candidate, "templates", "index.html"))) {
            return candidate;
        }
    }
    return process.cwd();
}

const APP_ROOT = resolveAppRoot();

// Middleware
app.use((req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    next();
});
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

export interface OnlineOrderItem {
    product_id?: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface OnlineOrder {
    id: string;
    customer_name: string;
    class_name: string;
    pickup_date: string;
    pickup_time_slot: string;
    shift_id: string;
    shift_label?: string;
    items: OnlineOrderItem[];
    total_amount: number;
    payment_status: "Chưa thanh toán" | "Đã thanh toán";
    note?: string;
    created_at: string;
}

interface PickupRequestItem extends OnlineOrderItem {}

export type PickupPaymentMethod = "IMMEDIATE_TRANSFER" | "PAY_LATER" | string;
export type PickupRequestStatus = "PENDING" | "APPROVED" | "CANCELLED" | "EXPIRED" | string;

export interface PickupRequest {
    id: string;
    member_id: string;
    member_name: string;
    items: PickupRequestItem[];
    total_amount: number;
    pickup_time: string;
    shift_id: string;
    shift_label?: string;
    payment_method: PickupPaymentMethod;
    payment_status: string;
    status: PickupRequestStatus;
    inventory_deducted: boolean;
    qr_url: string;
    note?: string;
    created_at: string;
    created_timestamp?: number;
    approved_at?: string;
    cancelled_at?: string;
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
    carried_from_prev?: number;
    resolution_type?: string; // "Khớp kho" | "Đã bù ngay" | "Bù sau" | "Cộng dồn chuyển ca sau" | "Hao hụt cho phép" | "Đang kiểm tra"
    resolution_note?: string;
    resolved_by?: string;
    resolved_at?: string;
    is_resolved?: boolean;
    carry_to_shift?: string;
    carry_qty?: number;
    unit_price?: number;
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
    overall_status?: string; // "KHỚP HOÀN TOÀN" | "ĐÃ XỬ LÝ XONG" | "CHỜ BÙ / CỘNG DỒN" | "ĐANG KIỂM TRA"
    carried_forward_shift?: string;
    resolved_count?: number;
    unresolved_count?: number;
    updated_at?: string;
}

export interface RestockItem {
    product_id: string;
    product_name: string;
    unit: string;
    quantity: number;
    unit_cost?: number;
    total_cost?: number;
    note?: string;
}

export interface RestockReceipt {
    id: string;
    timestamp: string;
    creator: string;
    supplier?: string;
    items: RestockItem[];
    total_items: number;
    total_cost: number;
    note?: string;
    reason?: string;
}

export interface DisciplineRecord {
    id: string;
    timestamp: string;
    member_id: string;
    member_name: string;
    type: "Cộng điểm" | "Trừ điểm";
    points_change: number;
    reason: string;
    performed_by: string;
    old_points: number;
    new_points: number;
}

// Global State & Auth
let ADMIN_PASSWORD: string = getAdminPassword();
const ACTIVE_ADMIN_TOKENS: Set<string> = new Set();
const ACTIVE_MEMBER_TOKENS = new Map<string, string>();

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

export interface SystemNotification {
    id: string;
    type:
        | "UNREACHABLE_BACKUP"
        | "REPLACEMENT_UPDATED"
        | "MEMBER_ADDED"
        | "GENERAL";
    title: string;
    message: string;
    shift_id: string;
    shift_day?: string;
    shift_slot?: string;
    absent_member_id?: string;
    absent_member_name?: string;
    backup_member_id?: string;
    backup_member_name?: string;
    created_at: string;
    timestamp_ms: number;
    target_role: "admin" | "staff" | "all";
    resolved: boolean;
}

let SYSTEM_NOTIFICATIONS: SystemNotification[] = [];
let SCHEDULE_VERSION: number = 1;

/* --- THI ĐUA PROJECT F&B --------------------------------------------------
   Cấu hình chu kỳ 3 tuần, bảng điểm trừ uy tín, trọng số và thiết lập đồng bộ
   Google Sheet. Toàn bộ công thức nằm ở src/competition.ts.
   ------------------------------------------------------------------------- */
let COMPETITION_CONFIG: CompetitionConfig = makeDefaultCompetitionConfig(
    crypto.randomBytes(18).toString("base64url"),
);

/** Tuần đang ghi nhận — mọi giao dịch/sự cố mới đều được gắn nhãn tuần này. */
function currentWeekTag(): string {
    return COMPETITION_CONFIG.active_week || DEFAULT_WEEKS[0];
}

function competitionInput(): CompetitionInput {
    return {
        members: CURRENT_MEMBERS,
        shifts:
            LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts
                ? LATEST_SCHEDULE_RESULT.assigned_shifts
                : [],
        sales: SALES_LOGS,
        incidents: INCIDENT_LOGS,
        config: COMPETITION_CONFIG,
        start_date: START_DATE,
    };
}

function addSystemNotification(
    notif: Omit<
        SystemNotification,
        "id" | "created_at" | "timestamp_ms" | "resolved"
    > & { id?: string; resolved?: boolean },
) {
    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const newNotif: SystemNotification = {
        id:
            notif.id ||
            `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        shift_id: notif.shift_id,
        shift_day: notif.shift_day,
        shift_slot: notif.shift_slot,
        absent_member_id: notif.absent_member_id,
        absent_member_name: notif.absent_member_name,
        backup_member_id: notif.backup_member_id,
        backup_member_name: notif.backup_member_name,
        created_at: timestamp,
        timestamp_ms: Date.now(),
        target_role: notif.target_role || "all",
        resolved: notif.resolved || false,
    };
    SYSTEM_NOTIFICATIONS.unshift(newNotif);
    if (SYSTEM_NOTIFICATIONS.length > 60) {
        SYSTEM_NOTIFICATIONS = SYSTEM_NOTIFICATIONS.slice(0, 60);
    }
    return newNotif;
}

const DEFAULT_PRODUCTS: Product[] = [];

const DEFAULT_SALES_LOGS: SaleTransaction[] = [];

let INVENTORY_PRODUCTS: Product[] = [];
let SALES_LOGS: SaleTransaction[] = [];
let RESTOCK_RECEIPTS: RestockReceipt[] = [];
let KPI_ATTENDANCE: any[] = [];
let SHIFT_AUDITS: ShiftAudit[] = [];
let ONLINE_ORDERS: OnlineOrder[] = [];
let PICKUP_REQUESTS: PickupRequest[] = [];
let MEMBER_DISCIPLINE_SCORES: Record<string, number> = {};
let DISCIPLINE_LOGS: DisciplineRecord[] = [];
let MEMBER_PASSWORDS: Record<string, string> = {};
let VIETQR_CONFIG = {
    bank_id: process.env.VIETQR_BANK_ID || "970422",
    account_no: process.env.VIETQR_ACCOUNT_NO || "0000000000",
    account_name: process.env.VIETQR_ACCOUNT_NAME || "HUNG VUONG FB",
};

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
    min_shifts: 3,
    max_shifts: 5,
    max_shifts_per_day: 2,
    enable_ca_ngoai: true,
    daily_shift_configs: DEFAULT_DAILY_SHIFT_CONFIGS,
};

let OPTIMIZER_CONFIG: OptimizerConfig = JSON.parse(
    JSON.stringify(DEFAULT_OPTIMIZER_CONFIG),
);

function getShiftNumber(s: {
    shift_id?: string;
    slot?: string;
    start_time?: string;
    type?: string;
}): number | null {
    if (s.type && s.type !== "Phong") return null;
    const id = (s.shift_id || "").trim().toUpperCase();

    // Check CA001 to CA035
    const caMatch = id.match(/CA0*(\d+)/i);
    if (caMatch) {
        const num = parseInt(caMatch[1], 10);
        if (num >= 1 && num <= 35) {
            return ((num - 1) % 5) + 1; // 1->1, 2->2, 3->3, 4->4, 5->5, 6->1, ...
        }
    }

    // Check suffix _S1.._S5 or _C1.._C5 or _1.._5 or S1..S5
    const sufMatch = id.match(/[_\-SC](\d+)$/i);
    if (sufMatch) {
        const num = parseInt(sufMatch[1], 10);
        return ((num - 1) % 5) + 1;
    }

    // Fallback: match by start_time or slot
    const st = (s.start_time || "").trim();
    const sl = (s.slot || "").trim();
    if (st.startsWith("07") || sl.includes("07") || sl.includes("7h")) return 1;
    if (st.startsWith("09") || sl.includes("09") || sl.includes("9h")) return 2;
    if (
        st.startsWith("11") ||
        st.startsWith("12") ||
        sl.includes("12") ||
        sl.includes("11h")
    )
        return 3;
    if (
        st.startsWith("13") ||
        st.startsWith("14") ||
        sl.includes("14") ||
        sl.includes("13h")
    )
        return 4;
    if (
        st.startsWith("15") ||
        st.startsWith("16") ||
        sl.includes("16") ||
        sl.includes("15h")
    )
        return 5;

    return null;
}

const STANDARD_SLOTS = [
    "07h00 - 09h30",
    "09h35 - 12h00",
    "12h05 - 14h00",
    "14h05 - 16h05",
    "16h10 - 18h00",
];
const LEGACY_SLOTS = [
    "7h - 9h",
    "9h - 11h",
    "11h - 13h",
    "13h - 15h",
    "15h - 17h",
];

function applyDailyConfigsToShifts(
    shifts: Shift[],
    dailyConfigs: DailyShiftConfig[],
) {
    if (!dailyConfigs || !dailyConfigs.length) return;
    const configMap = new Map<number, DailyShiftConfig>();
    dailyConfigs.forEach((c) => configMap.set(Number(c.shift_num), c));

    for (const s of shifts) {
        if (s.type === "Phong") {
            const num = getShiftNumber(s);
            if (num && configMap.has(num)) {
                const conf = configMap.get(num)!;
                if (conf.start_time) s.start_time = conf.start_time;
                if (conf.end_time) s.end_time = conf.end_time;
                const stdSlot =
                    STANDARD_SLOTS[num - 1] ||
                    `${conf.start_time} - ${conf.end_time}`;
                const legSlot = LEGACY_SLOTS[num - 1] || stdSlot;
                s.slot = `${conf.start_time} - ${conf.end_time}`;
                s.overlapping_slots = [
                    stdSlot,
                    legSlot,
                    `${conf.start_time} - ${conf.end_time}`,
                ];
                if (conf.note !== undefined) s.note = conf.note;
                const chinh = parseInt(String(conf.chinh_count), 10) || 4;
                const dp = parseInt(String(conf.dp_count), 10) || 0;
                s.chinh_count = chinh;
                s.dp_count = dp;
                s.required_count = chinh + dp;
                s.backup_count = dp;
                s.active = conf.active !== false;
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

function getMemberId(req: express.Request): string | null {
    const token = req.headers["x-member-token"];
    return typeof token === "string"
        ? ACTIVE_MEMBER_TOKENS.get(token) || null
        : null;
}

function requireMember(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) {
    if (getMemberId(req)) return next();
    return res
        .status(401)
        .json({
            success: false,
            message: "Vui lòng đăng nhập tài khoản thành viên.",
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
        restock_receipts: RESTOCK_RECEIPTS,
        kpi_attendance: KPI_ATTENDANCE,
        shift_audits: SHIFT_AUDITS,
        online_orders: ONLINE_ORDERS,
        pickup_requests: PICKUP_REQUESTS,
        member_discipline_scores: MEMBER_DISCIPLINE_SCORES,
        discipline_logs: DISCIPLINE_LOGS,
        member_passwords: MEMBER_PASSWORDS,
        vietqr_config: VIETQR_CONFIG,
        competition_config: COMPETITION_CONFIG,
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
    if (OPTIMIZER_CONFIG.daily_shift_configs) {
        applyDailyConfigsToShifts(
            CURRENT_SHIFTS,
            OPTIMIZER_CONFIG.daily_shift_configs,
        );
    }
    const config = {
        start_date: START_DATE,
        min_shifts_per_member: OPTIMIZER_CONFIG.min_shifts || 3,
        max_shifts_per_member: OPTIMIZER_CONFIG.max_shifts || 5,
        max_shifts_per_day: OPTIMIZER_CONFIG.max_shifts_per_day || 2,
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
        daily_shift_configs: OPTIMIZER_CONFIG.daily_shift_configs,
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

/**
 * Token đồng bộ Sheet phải sống sót qua mỗi lần khởi động lại, vì công thức
 * IMPORTDATA đã dán trong Google Sheet mang theo token cũ. Lần đầu chạy (state
 * chưa có token) thì ghi ngay xuống đĩa, không đợi một thao tác lưu khác.
 */
function persistFreshSheetToken(savedConfig: any) {
    if (savedConfig && savedConfig.sheet && savedConfig.sheet.token) return;
    if (persist()) {
        console.log(
            "[app] Đã lưu token đồng bộ Google Sheet lần đầu — token sẽ không đổi sau mỗi lần khởi động lại.",
        );
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
                RESTOCK_RECEIPTS = saved.restock_receipts || [];
                KPI_ATTENDANCE = saved.kpi_attendance || [];
                SHIFT_AUDITS = saved.shift_audits || [];
                ONLINE_ORDERS = saved.online_orders || [];
                PICKUP_REQUESTS = saved.pickup_requests || [];
                // Migration logic for legacy pickup requests
                PICKUP_REQUESTS.forEach((req: any) => {
                    if (!req.status || req.status === "Chờ Admin duyệt") req.status = "PENDING";
                    else if (req.status === "Đã duyệt") req.status = "APPROVED";
                    else if (req.status === "Từ chối" || req.status === "Đã hủy") req.status = "CANCELLED";

                    if (!req.payment_method || req.payment_method === "VietQR") {
                        req.payment_method = (req.status === "APPROVED" || req.payment_status === "Đã thanh toán") ? "IMMEDIATE_TRANSFER" : "PAY_LATER";
                    } else if (req.payment_method === "Tiền mặt") {
                        req.payment_method = "PAY_LATER";
                    }

                    if (req.inventory_deducted === undefined) {
                        req.inventory_deducted = req.status === "APPROVED";
                    }

                    if (!req.created_timestamp) {
                        req.created_timestamp = req.created_at ? (new Date(req.created_at).getTime() || Date.now()) : Date.now();
                    }
                    if (!req.pickup_time) {
                        req.pickup_time = req.created_at || new Date().toISOString();
                    }
                });
                MEMBER_DISCIPLINE_SCORES = saved.member_discipline_scores || {};
                DISCIPLINE_LOGS = saved.discipline_logs || [];
                MEMBER_PASSWORDS = saved.member_passwords || {};
                if (saved.vietqr_config) {
                    VIETQR_CONFIG = { ...VIETQR_CONFIG, ...saved.vietqr_config };
                }
                CURRENT_MEMBERS.forEach((member: any) => {
                    if (!MEMBER_PASSWORDS[member.member_id]) {
                        MEMBER_PASSWORDS[member.member_id] =
                            `HV@${member.member_id}`;
                    }
                });
                COMPETITION_CONFIG = normalizeCompetitionConfig(
                    saved.competition_config,
                    COMPETITION_CONFIG.sheet.token,
                );

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
    applyDailyConfigsToShifts(
        CURRENT_SHIFTS,
        OPTIMIZER_CONFIG.daily_shift_configs,
    );

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

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(APP_ROOT, "templates", "index.html"));
});

// AUTHENTICATION ROUTES
app.post("/api/auth/login", (req, res) => {
    const { password } = req.body || {};
    if (!password) {
        return res.status(400).json({
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

app.post("/api/member-auth/login", (req, res) => {
    const memberId = String(req.body?.member_id || "").trim();
    const password = String(req.body?.password || "");
    const member = CURRENT_MEMBERS.find(
        (item: any) => item.member_id === memberId,
    );
    if (!member || MEMBER_PASSWORDS[memberId] !== password) {
        return res
            .status(401)
            .json({
                success: false,
                message: "Mã thành viên hoặc mật khẩu không đúng.",
            });
    }
    const token = crypto.randomBytes(24).toString("hex");
    ACTIVE_MEMBER_TOKENS.set(token, memberId);
    return res.json({
        success: true,
        token,
        member: {
            id: member.member_id,
            member_id: member.member_id,
            name: member.name,
            department: member.department || "",
            phone: member.phone || "",
        },
    });
});

app.get("/api/member-auth/me", requireMember, (req, res) => {
    const memberId = getMemberId(req)!;
    const member: any = CURRENT_MEMBERS.find(
        (item: any) => item.member_id === memberId,
    );
    if (!member) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy thành viên." });
    }
    return res.json({
        success: true,
        member: {
            member_id: member.member_id,
            name: member.name,
            department: member.department || "",
            phone: member.phone || "",
        },
    });
});

app.post("/api/member-auth/change-password", requireMember, (req, res) => {
    const memberId = getMemberId(req)!;
    const oldPassword = String(req.body?.old_password || "");
    const newPassword = String(req.body?.new_password || "");
    if (!newPassword || newPassword.length < 4) {
        return res
            .status(400)
            .json({ success: false, message: "Mật khẩu mới phải từ 4 ký tự trở lên." });
    }
    if (MEMBER_PASSWORDS[memberId] && MEMBER_PASSWORDS[memberId] !== oldPassword) {
        return res
            .status(401)
            .json({ success: false, message: "Mật khẩu cũ không chính xác." });
    }
    MEMBER_PASSWORDS[memberId] = newPassword;
    persist();
    return res.json({ success: true, message: "Đổi mật khẩu thành công!" });
});

app.get("/api/member-auth/accounts", requireAdmin, (_req, res) => {
    res.json({
        success: true,
        accounts: CURRENT_MEMBERS.map((member: any) => ({
            member_id: member.member_id,
            name: member.name,
            department: member.department || "Chưa phân ban",
            password: MEMBER_PASSWORDS[member.member_id],
        })),
    });
});

app.post("/api/admin/member-auth/reset-password", requireAdmin, (req, res) => {
    const memberId = String(req.body?.member_id || "").trim();
    const newPassword = String(req.body?.new_password || "");
    if (!memberId || !newPassword) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu member_id hoặc new_password." });
    }
    const member = CURRENT_MEMBERS.find((m: any) => m.member_id === memberId);
    if (!member) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy thành viên." });
    }
    MEMBER_PASSWORDS[memberId] = newPassword;
    persist();
    return res.json({
        success: true,
        message: `Đã cập nhật mật khẩu cho ${member.name} (${memberId}).`,
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
        return res.status(400).json({
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
        return res.status(400).json({
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
        restock_receipts: RESTOCK_RECEIPTS,
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
        return res.status(400).json({
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

// RESTOCK MID-WEEK ENDPOINTS (Tạo Phiếu Nhập Hàng Giữa Tuần)
app.post("/api/inventory/restock", requireAdmin, (req, res) => {
    try {
        const data = req.body || {};
        let creator = String(data.creator || "").trim();
        if (!creator) creator = "Quản trị viên / Thủ kho";
        const supplier = String(data.supplier || "").trim();
        const reason = String(data.reason || "Nhập bổ sung giữa tuần").trim();
        const note = String(data.note || "").trim();

        // Support both multi-item (items array) or single item (product_id, quantity)
        let incomingItems: any[] = [];
        if (Array.isArray(data.items) && data.items.length > 0) {
            incomingItems = data.items;
        } else if (data.product_id) {
            incomingItems = [{
                product_id: data.product_id,
                product_name: data.product_name,
                unit: data.unit,
                quantity: data.quantity,
                unit_cost: data.unit_cost,
                note: data.item_note || note,
            }];
        }

        if (incomingItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Phiếu nhập hàng phải có ít nhất 1 sản phẩm!",
            });
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

        const validRestockItems: RestockItem[] = [];
        let totalCost = 0;
        let totalItems = 0;

        for (const it of incomingItems) {
            const pid = String(it.product_id || "").trim();
            const qty = Math.max(0, parseInt(String(it.quantity || "0"), 10));
            const unitCost = Math.max(0, parseInt(String(it.unit_cost || "0"), 10));
            const itemNote = String(it.note || "").trim();

            if (!pid || qty <= 0) continue;

            const existingProd = INVENTORY_PRODUCTS.find((p) => p.id === pid);
            if (!existingProd) continue;

            // Increment initial_stock so current_stock (initial_stock - sold_count) increases cleanly
            existingProd.initial_stock = (existingProd.initial_stock || 0) + qty;

            const itemTotalCost = unitCost * qty;
            totalCost += itemTotalCost;
            totalItems += qty;

            validRestockItems.push({
                product_id: existingProd.id,
                product_name: existingProd.name,
                unit: existingProd.unit,
                quantity: qty,
                unit_cost: unitCost > 0 ? unitCost : undefined,
                total_cost: itemTotalCost > 0 ? itemTotalCost : undefined,
                note: itemNote || undefined,
            });
        }

        if (validRestockItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Không có sản phẩm hoặc số lượng nhập hợp lệ (> 0)!",
            });
        }

        const nextNum = RESTOCK_RECEIPTS.length + 1;
        const receiptId = `NK${String(nextNum).padStart(3, "0")}`;

        const newReceipt: RestockReceipt = {
            id: receiptId,
            timestamp,
            creator,
            supplier: supplier || undefined,
            items: validRestockItems,
            total_items: totalItems,
            total_cost: totalCost,
            note: note || undefined,
            reason: reason || undefined,
        };

        RESTOCK_RECEIPTS.unshift(newReceipt);
        persist();

        const inv = getInventoryData();
        return res.json({
            success: true,
            message: `Tạo phiếu nhập hàng ${receiptId} thành công! Đã cộng thêm ${totalItems} món vào tồn kho.`,
            receipt: newReceipt,
            ...inv,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: `Lỗi xử lý phiếu nhập hàng: ${err.message}`,
        });
    }
});

app.get("/api/inventory/restock", (req, res) => {
    res.json({
        success: true,
        restock_receipts: RESTOCK_RECEIPTS,
    });
});

app.post("/api/inventory/restock/delete", requireAdmin, (req, res) => {
    try {
        const { id } = req.body || {};
        if (!id) {
            return res.status(400).json({ success: false, message: "Thiếu mã phiếu nhập" });
        }

        const receiptIdx = RESTOCK_RECEIPTS.findIndex((r) => r.id === id);
        if (receiptIdx === -1) {
            return res.status(404).json({ success: false, message: `Không tìm thấy phiếu nhập ${id}` });
        }

        // Roll back the stock
        const receipt = RESTOCK_RECEIPTS[receiptIdx];
        for (const it of receipt.items) {
            const prod = INVENTORY_PRODUCTS.find((p) => p.id === it.product_id);
            if (prod) {
                prod.initial_stock = Math.max(0, (prod.initial_stock || 0) - it.quantity);
            }
        }

        RESTOCK_RECEIPTS.splice(receiptIdx, 1);
        persist();

        const inv = getInventoryData();
        return res.json({
            success: true,
            message: `Đã hủy phiếu nhập ${id} và hoàn tác số lượng tồn kho tương ứng!`,
            ...inv,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: `Lỗi hủy phiếu nhập: ${err.message}`,
        });
    }
});

// DISCIPLINE / CREDIBILITY MANAGEMENT HELPERS & ENDPOINTS
function getDisciplineData() {
    const memberStats = CURRENT_MEMBERS.map((m) => {
        const currentPoints = MEMBER_DISCIPLINE_SCORES[m.member_id] !== undefined
            ? MEMBER_DISCIPLINE_SCORES[m.member_id]
            : 100;

        const memberLogs = DISCIPLINE_LOGS.filter((l) => l.member_id === m.member_id);
        const bonusLogs = memberLogs.filter((l) => l.type === "Cộng điểm");
        const penaltyLogs = memberLogs.filter((l) => l.type === "Trừ điểm");

        let grade = "🌟 Xuất sắc";
        let gradeBadgeClass = "high";
        if (currentPoints >= 100) {
            grade = "🌟 Xuất sắc";
            gradeBadgeClass = "high";
        } else if (currentPoints >= 85) {
            grade = "🟢 Tốt";
            gradeBadgeClass = "good";
        } else if (currentPoints >= 70) {
            grade = "🟡 Khá";
            gradeBadgeClass = "warning";
        } else {
            grade = "🔴 Cảnh cáo";
            gradeBadgeClass = "danger";
        }

        return {
            member_id: m.member_id,
            name: m.name,
            department: m.department || "Nhân sự",
            job: m.job || "Phục vụ",
            phone: m.phone || "-",
            points: currentPoints,
            grade,
            gradeBadgeClass,
            total_adjustments: memberLogs.length,
            bonus_count: bonusLogs.length,
            penalty_count: penaltyLogs.length,
            net_change: currentPoints - 100,
        };
    });

    memberStats.sort((a, b) => b.points - a.points);

    const totalMembers = memberStats.length;
    const avgPoints = totalMembers > 0
        ? Math.round((memberStats.reduce((sum, m) => sum + m.points, 0) / totalMembers) * 10) / 10
        : 100;
    const excellenceCount = memberStats.filter((m) => m.points >= 100).length;
    const goodCount = memberStats.filter((m) => m.points >= 85 && m.points < 100).length;
    const fairCount = memberStats.filter((m) => m.points >= 70 && m.points < 85).length;
    const warningCount = memberStats.filter((m) => m.points < 70).length;

    return {
        members: memberStats,
        logs: DISCIPLINE_LOGS,
        stats: {
            total_members: totalMembers,
            avg_points: avgPoints,
            excellence_count: excellenceCount,
            good_count: goodCount,
            fair_count: fairCount,
            warning_count: warningCount,
            total_logs: DISCIPLINE_LOGS.length,
        },
    };
}

app.get("/api/discipline", (req, res) => {
    res.json({
        success: true,
        ...getDisciplineData(),
    });
});

app.post("/api/discipline/adjust", requireAdmin, (req, res) => {
    try {
        const { member_id, type, points_change, reason, performed_by } = req.body || {};

        if (!member_id) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn nhân sự cần điều chỉnh điểm uy tín!" });
        }

        const member = CURRENT_MEMBERS.find((m) => m.member_id === member_id);
        if (!member) {
            return res.status(404).json({ success: false, message: `Không tìm thấy nhân sự có mã ${member_id}` });
        }

        const changeVal = Math.abs(parseInt(String(points_change || "0"), 10));
        if (changeVal <= 0) {
            return res.status(400).json({ success: false, message: "Số điểm thay đổi phải lớn hơn 0!" });
        }

        const isDeduct = type === "Trừ điểm" || type === "penalty";
        const actionType: "Cộng điểm" | "Trừ điểm" = isDeduct ? "Trừ điểm" : "Cộng điểm";
        const oldPoints = MEMBER_DISCIPLINE_SCORES[member_id] !== undefined
            ? MEMBER_DISCIPLINE_SCORES[member_id]
            : 100;

        const delta = isDeduct ? -changeVal : changeVal;
        const newPoints = Math.max(0, oldPoints + delta);

        MEMBER_DISCIPLINE_SCORES[member_id] = newPoints;

        const timestamp = new Date().toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour12: false,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const logId = `DISC_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record: DisciplineRecord = {
            id: logId,
            timestamp,
            member_id,
            member_name: member.name,
            type: actionType,
            points_change: delta,
            reason: String(reason || "Điều chỉnh kỷ luật / thưởng điểm").trim(),
            performed_by: String(performed_by || "Quản trị viên").trim(),
            old_points: oldPoints,
            new_points: newPoints,
        };

        DISCIPLINE_LOGS.unshift(record);
        persist();

        const data = getDisciplineData();
        return res.json({
            success: true,
            message: `Đã ${actionType.toLowerCase()} ${changeVal} điểm cho ${member.name}! (Điểm mới: ${newPoints}đ)`,
            record,
            ...data,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: `Lỗi điều chỉnh điểm kỷ luật: ${err.message}`,
        });
    }
});

app.post("/api/discipline/reset-member", requireAdmin, (req, res) => {
    try {
        const { member_id } = req.body || {};
        if (!member_id) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn nhân sự" });
        }

        const member = CURRENT_MEMBERS.find((m) => m.member_id === member_id);
        if (!member) {
            return res.status(404).json({ success: false, message: "Không tìm thấy nhân sự" });
        }

        const oldPoints = MEMBER_DISCIPLINE_SCORES[member_id] !== undefined
            ? MEMBER_DISCIPLINE_SCORES[member_id]
            : 100;

        MEMBER_DISCIPLINE_SCORES[member_id] = 100;

        const timestamp = new Date().toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour12: false,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        const record: DisciplineRecord = {
            id: `DISC_RST_${Date.now()}`,
            timestamp,
            member_id,
            member_name: member.name,
            type: "Cộng điểm",
            points_change: 100 - oldPoints,
            reason: "Reset điểm uy tín về mặc định 100đ",
            performed_by: "Quản trị viên",
            old_points: oldPoints,
            new_points: 100,
        };

        DISCIPLINE_LOGS.unshift(record);
        persist();

        const data = getDisciplineData();
        return res.json({
            success: true,
            message: `Đã khôi phục điểm uy tín của ${member.name} về mặc định 100đ!`,
            ...data,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: `Lỗi reset điểm: ${err.message}`,
        });
    }
});

app.post("/api/discipline/delete-log", requireAdmin, (req, res) => {
    try {
        const { log_id } = req.body || {};
        if (!log_id) {
            return res.status(400).json({ success: false, message: "Thiếu mã nhật ký" });
        }

        const idx = DISCIPLINE_LOGS.findIndex((l) => l.id === log_id);
        if (idx === -1) {
            return res.status(404).json({ success: false, message: "Không tìm thấy nhật ký này" });
        }

        const targetLog = DISCIPLINE_LOGS[idx];
        const memberId = targetLog.member_id;
        if (memberId && MEMBER_DISCIPLINE_SCORES[memberId] !== undefined) {
            MEMBER_DISCIPLINE_SCORES[memberId] = Math.max(0, MEMBER_DISCIPLINE_SCORES[memberId] - targetLog.points_change);
        }

        DISCIPLINE_LOGS.splice(idx, 1);
        persist();

        const data = getDisciplineData();
        return res.json({
            success: true,
            message: `Đã xóa nhật ký kỷ luật và hoàn tác điểm!`,
            ...data,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            message: `Lỗi xóa nhật ký: ${err.message}`,
        });
    }
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
    const matrix = xlsx.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: "",
    });
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

        if (
            foundName !== -1 &&
            (foundPrice !== -1 || foundStock !== -1 || foundUnit !== -1)
        ) {
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
            if (
                lower === "tổng" ||
                lower === "tổng cộng" ||
                lower.startsWith("tổng:")
            ) {
                continue;
            }

            const rawUnit =
                colUnit !== -1 ? String(row[colUnit] || "").trim() : "Phần";
            const unit = rawUnit || "Phần";
            const price = colPrice !== -1 ? parseMoneyAmount(row[colPrice]) : 0;
            const initial_stock =
                colStock !== -1 ? parseStockQty(row[colStock]) : 0;
            const rawId = colId !== -1 ? String(row[colId] || "").trim() : "";
            const note =
                colNote !== -1 ? String(row[colNote] || "").trim() : "";

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
                row["GIÁ TIỀN"] ||
                    row["Giá tiền"] ||
                    row["Giá bán"] ||
                    row["Giá"] ||
                    row["Price"] ||
                    "0",
            );
            const initial_stock = parseStockQty(
                row["SỐ LƯỢNG NHẬP"] ||
                    row["Số lượng nhập"] ||
                    row["Tồn kho đầu"] ||
                    row["Tồn kho"] ||
                    row["Stock"] ||
                    "0",
            );
            const note = String(
                row["GHI CHÚ"] || row["Ghi chú"] || row["Note"] || "",
            ).trim();
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
        ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

        // Column widths
        ws["!cols"] = [
            { wch: 8 }, // STT
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

// Helper: Match Online Order Date & Slot to System Shift
function normalizeDateStr(d: string): string {
    if (!d) return "";
    const clean = String(d).trim();
    if (clean.includes("/")) {
        const parts = clean.split("/");
        if (parts.length === 3) {
            if (parts[2].length === 4)
                return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
            if (parts[0].length === 4)
                return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        }
    }
    if (clean.includes("-")) {
        const parts = clean.split("-");
        if (parts.length === 3) {
            if (parts[0].length === 4)
                return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
            if (parts[2].length === 4)
                return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
    }
    return clean;
}

function stripAccents(str: string): string {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function parseExcelDate(val: any): string {
    if (!val) return "";
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, "0");
        const d = String(val.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    if (typeof val === "number" && val > 20000 && val < 60000) {
        const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
        const y = jsDate.getFullYear();
        const m = String(jsDate.getMonth() + 1).padStart(2, "0");
        const d = String(jsDate.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    return normalizeDateStr(String(val || ""));
}

function matchShiftForOnlineOrder(
    pickupDateStr: string,
    slotStr: string,
    shifts: Shift[],
): Shift | null {
    if (!shifts || shifts.length === 0) return null;

    const normSlot = (slotStr || "").toLowerCase();

    let caNumber = -1;
    const caMatch = normSlot.match(/ca\s*(\d+)/i);
    if (caMatch) {
        caNumber = parseInt(caMatch[1]);
    }

    let slotIndex = -1;
    if (caNumber > 0) slotIndex = caNumber - 1;
    else if (
        normSlot.includes("7h") ||
        normSlot.includes("07h") ||
        normSlot.includes("07:00")
    )
        slotIndex = 0;
    else if (
        normSlot.includes("9h") ||
        normSlot.includes("09h") ||
        normSlot.includes("09:35")
    )
        slotIndex = 1;
    else if (
        normSlot.includes("12h") ||
        normSlot.includes("11h") ||
        normSlot.includes("12:05")
    )
        slotIndex = 2;
    else if (
        normSlot.includes("14h") ||
        normSlot.includes("13h") ||
        normSlot.includes("14:05")
    )
        slotIndex = 3;
    else if (
        normSlot.includes("16h") ||
        normSlot.includes("15h") ||
        normSlot.includes("16:10")
    )
        slotIndex = 4;

    const targetDateNorm = normalizeDateStr(pickupDateStr);

    // 1. Try matching by normalized date
    if (targetDateNorm) {
        const dateShifts = shifts.filter(
            (s) => normalizeDateStr(s.date) === targetDateNorm,
        );
        if (dateShifts.length > 0) {
            if (caNumber > 0) {
                const matchCa = dateShifts.find(
                    (s) =>
                        (s.slot &&
                            new RegExp(`ca\\s*${caNumber}\\b`, "i").test(
                                s.slot,
                            )) ||
                        (s.shift_id &&
                            new RegExp(`(?:ca|s)?0*${caNumber}$`, "i").test(
                                s.shift_id,
                            )),
                );
                if (matchCa) return matchCa;
            }
            if (slotIndex >= 0 && dateShifts[slotIndex]) {
                return dateShifts[slotIndex];
            }
            const matchSlot = dateShifts.find(
                (s) =>
                    (s.slot && s.slot.toLowerCase().includes(normSlot)) ||
                    (s.start_time &&
                        normSlot.includes(s.start_time.toLowerCase())),
            );
            if (matchSlot) return matchSlot;
            return dateShifts[0];
        }
    }

    // 2. Try match by day name (e.g. "Thứ 2", "Thứ Hai")
    let dayOfWeekStr = "";
    if (targetDateNorm && targetDateNorm.includes("-")) {
        const d = new Date(targetDateNorm);
        if (!isNaN(d.getTime())) {
            const days = [
                "Chủ Nhật",
                "Thứ Hai",
                "Thứ Ba",
                "Thứ Tư",
                "Thứ Năm",
                "Thứ Sáu",
                "Thứ Bảy",
            ];
            dayOfWeekStr = days[d.getDay()];
        }
    }

    const dayShifts = shifts.filter(
        (s) =>
            s.day &&
            (s.day.toLowerCase().includes(pickupDateStr.toLowerCase()) ||
                (dayOfWeekStr &&
                    s.day.toLowerCase().includes(dayOfWeekStr.toLowerCase()))),
    );
    if (dayShifts.length > 0) {
        if (caNumber > 0) {
            const matchCa = dayShifts.find(
                (s) =>
                    (s.slot &&
                        new RegExp(`ca\\s*${caNumber}\\b`, "i").test(s.slot)) ||
                    (s.shift_id &&
                        new RegExp(`(?:ca|s)?0*${caNumber}$`, "i").test(
                            s.shift_id,
                        )),
            );
            if (matchCa) return matchCa;
        }
        if (slotIndex >= 0 && dayShifts[slotIndex]) {
            return dayShifts[slotIndex];
        }
        return dayShifts[0];
    }

    // 3. Fallback: match by ca number across shifts
    if (caNumber > 0) {
        const matchCa = shifts.find(
            (s) =>
                (s.slot &&
                    new RegExp(`ca\\s*${caNumber}\\b`, "i").test(s.slot)) ||
                (s.shift_id &&
                    new RegExp(`(?:ca|s)?0*${caNumber}$`, "i").test(
                        s.shift_id,
                    )),
        );
        if (matchCa) return matchCa;
    }

    if (slotIndex >= 0 && shifts[slotIndex]) {
        return shifts[slotIndex];
    }

    return shifts[0] || null;
}

// Helper: Parse Online Orders from Excel File (Supports Matrix Columns as well as Pair Columns)
function parseOnlineOrdersExcel(
    buffer: Buffer,
    shifts: Shift[],
    products: Product[],
): OnlineOrder[] {
    const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read as 2D array to accurately identify the header row
    const rawRows: any[][] = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
    });
    if (!rawRows || rawRows.length === 0) return [];

    // Find the header row (index where "họ và tên" or "khách hàng" or "họ tên" or "lớp" is present)
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
        const row = rawRows[r];
        const rowStrs = row.map((c) => stripAccents(String(c)));
        if (
            rowStrs.some(
                (s) =>
                    s.includes("hovaten") ||
                    s.includes("hoten") ||
                    s.includes("khachhang") ||
                    (s.includes("ten") &&
                        rowStrs.some((s2) => s2.includes("lop"))),
            )
        ) {
            headerRowIdx = r;
            break;
        }
    }

    // Fallback: if not found, assume row 0
    if (headerRowIdx === -1) headerRowIdx = 0;

    const headerRow = rawRows[headerRowIdx] || [];
    const colMap: {
        nameCol: number;
        classCol: number;
        dateCol: number;
        slotCol: number;
        productCols: {
            colIdx: number;
            headerText: string;
            matchedProduct?: Product;
        }[];
    } = {
        nameCol: -1,
        classCol: -1,
        dateCol: -1,
        slotCol: -1,
        productCols: [],
    };

    headerRow.forEach((colVal, colIdx) => {
        const txt = String(colVal || "").trim();
        if (!txt) return;
        const norm = stripAccents(txt);

        if (
            colMap.nameCol === -1 &&
            (norm.includes("hovaten") ||
                norm.includes("hoten") ||
                norm.includes("khachhang") ||
                norm === "ten" ||
                norm === "name")
        ) {
            colMap.nameCol = colIdx;
        } else if (
            colMap.classCol === -1 &&
            (norm.includes("lop") ||
                norm.includes("class") ||
                norm.includes("donvi"))
        ) {
            colMap.classCol = colIdx;
        } else if (
            colMap.dateCol === -1 &&
            (norm.includes("ngaydukienlay") ||
                norm.includes("ngaylay") ||
                norm.includes("ngaydukien") ||
                norm.includes("ngay") ||
                norm.includes("date"))
        ) {
            colMap.dateCol = colIdx;
        } else if (
            colMap.slotCol === -1 &&
            (norm.includes("khunggiolayca") ||
                norm.includes("khunggiolay") ||
                norm.includes("khunggio") ||
                norm.includes("calay") ||
                norm === "ca" ||
                norm === "slot" ||
                norm.includes("timeslot"))
        ) {
            colMap.slotCol = colIdx;
        } else {
            // Check if this column is a product column
            let matched = products.find(
                (p) =>
                    p.name.trim().toLowerCase() === txt.toLowerCase() ||
                    p.id.trim().toLowerCase() === txt.toLowerCase() ||
                    stripAccents(p.name) === norm ||
                    stripAccents(p.id) === norm,
            );
            if (!matched) {
                matched = products.find(
                    (p) =>
                        norm.includes(stripAccents(p.name)) ||
                        stripAccents(p.name).includes(norm),
                );
            }
            colMap.productCols.push({
                colIdx,
                headerText: txt,
                matchedProduct: matched,
            });
        }
    });

    const newOrders: OnlineOrder[] = [];

    // Parse data rows starting after headerRowIdx
    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;

        const customerName =
            colMap.nameCol >= 0 ? String(row[colMap.nameCol] || "").trim() : "";
        const className =
            colMap.classCol >= 0
                ? String(row[colMap.classCol] || "").trim()
                : "";
        const rawDate = colMap.dateCol >= 0 ? row[colMap.dateCol] : "";
        const slotVal =
            colMap.slotCol >= 0 ? String(row[colMap.slotCol] || "").trim() : "";

        if (!customerName && !className && !rawDate && !slotVal) {
            continue; // skip empty rows
        }

        const pickupDate = parseExcelDate(rawDate);
        const orderItems: OnlineOrderItem[] = [];

        // 1. Matrix/column-per-product format (Matches user's uploaded image)
        colMap.productCols.forEach((pCol) => {
            const cellVal = row[pCol.colIdx];
            if (cellVal === "" || cellVal === null || cellVal === undefined)
                return;
            const qty =
                parseFloat(String(cellVal).replace(/[^0-9\.]/g, "")) || 0;
            if (qty > 0) {
                let prod = pCol.matchedProduct;
                const prodName = prod ? prod.name : pCol.headerText;
                let prodId = prod
                    ? prod.id
                    : `SP_${stripAccents(pCol.headerText).substring(0, 8).toUpperCase()}`;
                const unitPrice = prod ? prod.price : 20000;

                // Auto-register missing product in INVENTORY_PRODUCTS if needed
                if (!prod) {
                    const existing = INVENTORY_PRODUCTS.find(
                        (p) =>
                            p.id === prodId ||
                            stripAccents(p.name) === stripAccents(prodName),
                    );
                    if (!existing) {
                        const newProd: Product = {
                            id: prodId,
                            name: prodName,
                            unit: "Ly",
                            price: unitPrice,
                            initial_stock: 100,
                            sold_count: 0,
                            note: "Tạo từ Excel đơn online",
                        };
                        INVENTORY_PRODUCTS.push(newProd);
                        pCol.matchedProduct = newProd;
                    } else {
                        prodId = existing.id;
                    }
                }

                orderItems.push({
                    product_id: prodId,
                    product_name: prodName,
                    quantity: qty,
                    unit_price: unitPrice,
                    total_price: qty * unitPrice,
                });
            }
        });

        // 2. Pair columns fallback ("Mặt hàng 1", "Số lượng 1")
        if (orderItems.length === 0) {
            for (let i = 0; i < headerRow.length; i++) {
                const hNorm = stripAccents(String(headerRow[i] || ""));
                if (
                    hNorm.includes("mathang") ||
                    hNorm.includes("tenhang") ||
                    hNorm.includes("sanpham")
                ) {
                    const itemName = String(row[i] || "").trim();
                    if (itemName) {
                        let qty = 1;
                        if (i + 1 < row.length) {
                            const nextHNorm = stripAccents(
                                String(headerRow[i + 1] || ""),
                            );
                            if (
                                nextHNorm.includes("soluong") ||
                                nextHNorm.includes("sl")
                            ) {
                                qty =
                                    parseFloat(
                                        String(row[i + 1]).replace(
                                            /[^0-9\.]/g,
                                            "",
                                        ),
                                    ) || 1;
                            }
                        }
                        const matched = products.find(
                            (p) =>
                                p.name.toLowerCase() ===
                                    itemName.toLowerCase() ||
                                p.id.toLowerCase() === itemName.toLowerCase(),
                        );
                        orderItems.push({
                            product_id: matched ? matched.id : "",
                            product_name: matched ? matched.name : itemName,
                            quantity: qty,
                            unit_price: matched ? matched.price : 20000,
                            total_price:
                                qty * (matched ? matched.price : 20000),
                        });
                    }
                }
            }
        }

        const totalAmount = orderItems.reduce(
            (sum, item) => sum + item.total_price,
            0,
        );
        const mappedShift = matchShiftForOnlineOrder(
            pickupDate,
            slotVal,
            shifts,
        );

        const caMatch = (slotVal || "").match(/ca\s*(\d+)/i);
        const caNumStr = caMatch ? `Ca ${caMatch[1]}` : slotVal || "Ca 1";

        const newOrder: OnlineOrder = {
            id: `ORD_ONLINE_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${r}`,
            customer_name: customerName || "Khách Hàng Online",
            class_name: className || "K.XĐ",
            pickup_date: pickupDate || "Chưa xác định",
            pickup_time_slot: slotVal || caNumStr,
            shift_id: mappedShift
                ? mappedShift.shift_id
                : caMatch
                  ? `CA00${caMatch[1]}`
                  : shifts[0]?.shift_id || "CA001",
            shift_label: mappedShift
                ? `${mappedShift.day} (${mappedShift.date || pickupDate}) - ${mappedShift.slot || slotVal}`
                : slotVal
                  ? `${pickupDate} - ${slotVal}`
                  : "Ca Lấy",
            items: orderItems,
            total_amount: totalAmount,
            payment_status: "Chưa thanh toán",
            created_at: new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            }),
        };

        newOrders.push(newOrder);
    }

    return newOrders;
}

// Online Orders API Routes
app.get("/api/online-orders", (req, res) => {
    const shift_id = req.query.shift_id ? String(req.query.shift_id) : "";
    let result = ONLINE_ORDERS;
    if (shift_id) {
        result = ONLINE_ORDERS.filter((o) => o.shift_id === shift_id);
    }
    res.json({
        success: true,
        online_orders: result,
    });
});

app.post(
    "/api/online-orders/upload-excel",
    requireAdmin,
    upload.single("file") as any,
    (req: any, res: any) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng chọn file Excel để tải lên!",
                });
            }
            let fileBuffer: Buffer | null = req.file.buffer || null;
            if (!fileBuffer && req.file.path && fs.existsSync(req.file.path)) {
                fileBuffer = fs.readFileSync(req.file.path);
                try {
                    fs.unlinkSync(req.file.path);
                } catch (e) {}
            }
            if (!fileBuffer) {
                return res.status(400).json({
                    success: false,
                    message: "Không thể đọc nội dung file Excel tải lên!",
                });
            }
            const parsed = parseOnlineOrdersExcel(
                fileBuffer,
                CURRENT_SHIFTS,
                INVENTORY_PRODUCTS,
            );
            if (parsed.length === 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Không tìm thấy dữ liệu đơn hàng hợp lệ trong file Excel! Vui lòng tải file mẫu để xem định dạng đúng.",
                });
            }
            ONLINE_ORDERS = [...ONLINE_ORDERS, ...parsed];
            persist();
            res.json({
                success: true,
                message: `Đã nhập thành công ${parsed.length} đơn hàng online từ Excel!`,
                count: parsed.length,
                online_orders: ONLINE_ORDERS,
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: `Lỗi xử lý file Excel đơn online: ${err.message}`,
            });
        }
    },
);

app.post("/api/online-orders/create", (req, res) => {
    try {
        const {
            customer_name,
            class_name,
            pickup_date,
            pickup_time_slot,
            items,
            payment_status,
        } = req.body || {};
        if (
            !customer_name ||
            !pickup_date ||
            !pickup_time_slot ||
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập đầy đủ thông tin khách hàng, ngày lấy, khung giờ và ít nhất 1 sản phẩm!",
            });
        }

        const orderItems: OnlineOrderItem[] = items.map((it: any) => {
            const prod = INVENTORY_PRODUCTS.find(
                (p) =>
                    p.id === it.product_id ||
                    p.name.toLowerCase() ===
                        (it.product_name || "").toLowerCase(),
            );
            const pQty = Number(it.quantity) || 1;
            const pPrice = prod ? prod.price : Number(it.unit_price) || 0;
            return {
                product_id: prod ? prod.id : it.product_id || "",
                product_name: prod ? prod.name : it.product_name || "Sản phẩm",
                quantity: pQty,
                unit_price: pPrice,
                total_price: pQty * pPrice,
            };
        });

        const totalAmount = orderItems.reduce(
            (sum, item) => sum + item.total_price,
            0,
        );
        const mappedShift = matchShiftForOnlineOrder(
            pickup_date,
            pickup_time_slot,
            CURRENT_SHIFTS,
        );

        const newOrder: OnlineOrder = {
            id: `ORD_MANUAL_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            customer_name: String(customer_name).trim(),
            class_name: String(class_name || "K.XĐ").trim(),
            pickup_date: String(pickup_date).trim(),
            pickup_time_slot: String(pickup_time_slot).trim(),
            shift_id: mappedShift
                ? mappedShift.shift_id
                : CURRENT_SHIFTS.length > 0
                  ? CURRENT_SHIFTS[0].shift_id
                  : "UNKNOWN",
            shift_label: mappedShift
                ? `${mappedShift.day} (${mappedShift.date || ""}) - ${mappedShift.slot || mappedShift.start_time}`
                : `${pickup_date} - ${pickup_time_slot}`,
            items: orderItems,
            total_amount: totalAmount,
            payment_status:
                payment_status === "Đã thanh toán"
                    ? "Đã thanh toán"
                    : "Chưa thanh toán",
            created_at: new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            }),
        };

        if (newOrder.payment_status === "Đã thanh toán") {
            const nowTime = new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            });
            newOrder.items.forEach((item) => {
                if (item.product_id) {
                    const prod = INVENTORY_PRODUCTS.find(
                        (p) => p.id === item.product_id,
                    );
                    if (prod) {
                        prod.sold_count =
                            (prod.sold_count || 0) + item.quantity;
                    }
                }
                SALES_LOGS.push({
                    id: `SALE_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: nowTime,
                    product_id: item.product_id || "ONLINE",
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_amount: item.total_price,
                    channel: "Online",
                    seller: "Manual Online",
                    shift_id: newOrder.shift_id,
                    customer_name: `${newOrder.customer_name} (${newOrder.class_name})`,
                    payment_method: "Đơn Online",
                    note: `Thanh toán đơn online thủ công ${newOrder.id}`,
                    refunded: false,
                    week: currentWeekTag(),
                });
            });
        }

        ONLINE_ORDERS.unshift(newOrder);
        persist();

        res.json({
            success: true,
            message: "Đã thêm đơn hàng online thủ công thành công!",
            order: newOrder,
            online_orders: ONLINE_ORDERS,
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: `Lỗi tạo đơn hàng: ${err.message}`,
        });
    }
});

function matchShiftByPickupTime(
    pickupTimeStr: string,
    shifts: Shift[],
): { shift_id: string; shift_label: string } {
    const fallback = {
        shift_id: shifts && shifts[0] ? shifts[0].shift_id : "CA001",
        shift_label: shifts && shifts[0]
            ? `${shifts[0].day} (${shifts[0].date || ""}) - ${shifts[0].slot || shifts[0].start_time}`
            : "Ca 1",
    };

    if (!pickupTimeStr || !shifts || shifts.length === 0) {
        return fallback;
    }

    let targetDate = "";
    let targetTime = "";

    if (pickupTimeStr.includes("T")) {
        const parts = pickupTimeStr.split("T");
        targetDate = parts[0];
        targetTime = parts[1].slice(0, 5);
    } else if (pickupTimeStr.includes(" ")) {
        const parts = pickupTimeStr.split(" ");
        if (parts[0].includes("-") || parts[0].includes("/")) {
            targetDate = parts[0];
            targetTime = parts[1].slice(0, 5);
        } else {
            targetTime = parts[0].slice(0, 5);
            targetDate = parts[1];
        }
    } else if (pickupTimeStr.includes(":")) {
        targetTime = pickupTimeStr.slice(0, 5);
    }

    const normDate = normalizeDateStr(targetDate);

    // Determine Day of Week
    let dayOfWeekStr = "";
    if (normDate && normDate.includes("-")) {
        const d = new Date(normDate + "T00:00:00");
        if (!isNaN(d.getTime())) {
            const days = [
                "Chủ Nhật",
                "Thứ 2",
                "Thứ 3",
                "Thứ 4",
                "Thứ 5",
                "Thứ 6",
                "Thứ 7",
            ];
            dayOfWeekStr = days[d.getDay()];
        }
    }

    // Filter shifts for this date / day
    let candidateShifts = shifts.filter((s) => {
        if (normDate && s.date && normalizeDateStr(s.date) === normDate) return true;
        if (dayOfWeekStr && s.day && s.day.toLowerCase().includes(dayOfWeekStr.toLowerCase())) return true;
        return false;
    });

    if (candidateShifts.length === 0) {
        candidateShifts = shifts;
    }

    const timeToMinutes = (t: string) => {
        if (!t) return 0;
        const [h, m] = t.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const targetMinutes = targetTime ? timeToMinutes(targetTime) : -1;

    if (targetMinutes >= 0) {
        // 1. Check if time falls within [start_time, end_time]
        for (const s of candidateShifts) {
            const startM = timeToMinutes(s.start_time);
            const endM = timeToMinutes(s.end_time);
            if (startM <= targetMinutes && targetMinutes <= endM) {
                return {
                    shift_id: s.shift_id,
                    shift_label: `${s.day} (${s.date || ""}) - ${s.slot || s.start_time + " - " + s.end_time}`,
                };
            }
        }

        // 2. Fallback: Find closest shift by time difference
        let closestShift = candidateShifts[0];
        let minDiff = Infinity;
        for (const s of candidateShifts) {
            const startM = timeToMinutes(s.start_time);
            const endM = timeToMinutes(s.end_time);
            const diff = Math.min(
                Math.abs(targetMinutes - startM),
                Math.abs(targetMinutes - endM),
            );
            if (diff < minDiff) {
                minDiff = diff;
                closestShift = s;
            }
        }

        return {
            shift_id: closestShift.shift_id,
            shift_label: `${closestShift.day} (${closestShift.date || ""}) - ${closestShift.slot || closestShift.start_time + " - " + closestShift.end_time}`,
        };
    }

    const first = candidateShifts[0] || shifts[0];
    return {
        shift_id: first.shift_id,
        shift_label: `${first.day} (${first.date || ""}) - ${first.slot || first.start_time + " - " + first.end_time}`,
    };
}

function checkAndExpirePickupRequests(): boolean {
    const now = Date.now();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
    let changed = false;

    for (const req of PICKUP_REQUESTS) {
        const isPending =
            req.status === "PENDING" || req.status === "Chờ Admin duyệt";
        if (isPending) {
            const createdTime =
                req.created_timestamp ||
                (req.created_at ? new Date(req.created_at).getTime() : NaN);

            if (!isNaN(createdTime) && now - createdTime >= THREE_DAYS_MS) {
                req.status = "EXPIRED";
                req.payment_status = "Tự động hủy (Quá hạn 3 ngày)";
                if (req.inventory_deducted) {
                    req.items.forEach((item) => {
                        const product = INVENTORY_PRODUCTS.find(
                            (p) => p.id === item.product_id,
                        );
                        if (product) {
                            product.sold_count = Math.max(
                                0,
                                (product.sold_count || 0) - item.quantity,
                            );
                        }
                    });
                    req.inventory_deducted = false;
                }
                req.cancelled_at = new Date().toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                });
                changed = true;
            }
        }
    }
    if (changed) {
        persist();
    }
    return changed;
}

// Chạy cron kiểm tra tự động hủy đơn sau 3 ngày (định kỳ 5 phút)
setInterval(checkAndExpirePickupRequests, 5 * 60 * 1000);

function pickupQrUrl(amount: number, requestId: string) {
    const bankId = VIETQR_CONFIG.bank_id || "970422";
    const accountNo = VIETQR_CONFIG.account_no || "0000000000";
    const accountName = encodeURIComponent(
        VIETQR_CONFIG.account_name || "HUNG VUONG FB",
    );
    const description = encodeURIComponent(requestId);
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${description}&accountName=${accountName}`;
}

function addPickupSales(request: PickupRequest) {
    const now = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });
    const exists = SALES_LOGS.some((s) => s.note === `Request ${request.id}`);
    if (exists) return;

    request.items.forEach((item) =>
        SALES_LOGS.push({
            id: `SALE_REQ_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: now,
            product_id: item.product_id || "ONLINE",
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_price,
            channel: "Member Pickup",
            seller: request.member_name,
            customer_name: request.member_name,
            payment_method: request.payment_method,
            note: `Request ${request.id}`,
            refunded: false,
            week: currentWeekTag(),
        }),
    );
}

function removePickupSales(requestId: string) {
    SALES_LOGS = SALES_LOGS.filter((s) => s.note !== `Request ${requestId}`);
}

app.get("/api/vietqr-config", (_req, res) => {
    res.json({
        success: true,
        config: VIETQR_CONFIG,
    });
});

app.get("/api/admin/vietqr-config", (_req, res) => {
    res.json({
        success: true,
        config: VIETQR_CONFIG,
    });
});

app.post("/api/admin/vietqr-config", requireAdmin, (req, res) => {
    const { bank_id, account_no, account_name } = req.body || {};
    if (bank_id) VIETQR_CONFIG.bank_id = String(bank_id).trim();
    if (account_no) VIETQR_CONFIG.account_no = String(account_no).trim();
    if (account_name) VIETQR_CONFIG.account_name = String(account_name).trim();
    persist();
    res.json({
        success: true,
        config: VIETQR_CONFIG,
        message: "Đã cập nhật thông tin tài khoản VietQR thành công!",
    });
});

app.post("/api/pickup-requests", requireMember, (req, res) => {
    const memberId = getMemberId(req)!;
    const member: any = CURRENT_MEMBERS.find(
        (item: any) => item.member_id === memberId,
    );
    if (!member) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy thông tin thành viên." });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
        return res
            .status(400)
            .json({
                success: false,
                message: "Đơn hàng phải có ít nhất một sản phẩm.",
            });
    }
    const requestItems: PickupRequestItem[] = [];
    for (const raw of items) {
        const product = INVENTORY_PRODUCTS.find(
            (item) => item.id === raw.product_id,
        );
        const quantity = Number(raw.quantity);
        if (!product || !Number.isInteger(quantity) || quantity < 1) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Sản phẩm hoặc số lượng không hợp lệ.",
                });
        }
        const available =
            (product.initial_stock || 0) - (product.sold_count || 0);
        if (quantity > available) {
            return res
                .status(409)
                .json({
                    success: false,
                    message: `Sản phẩm "${product.name}" chỉ còn ${available} ${product.unit || "món"} trong kho (bạn yêu cầu ${quantity}).`,
                });
        }
        requestItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity,
            unit_price: product.price,
            total_price: product.price * quantity,
        });
    }
    const id = `REQ_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const total = requestItems.reduce((sum, item) => sum + item.total_price, 0);

    // Thời gian lấy hàng & Ca trực tự động
    const rawPickupTime = req.body?.pickup_time ? String(req.body.pickup_time).trim() : "";
    const pickup_time = rawPickupTime || new Date().toISOString();
    const matchedShift = matchShiftByPickupTime(pickup_time, CURRENT_SHIFTS);

    // Hình thức thanh toán (Chỉ có 2 hình thức: IMMEDIATE_TRANSFER hoặc PAY_LATER)
    const rawPayment = req.body?.payment_method;
    const isImmediate =
        rawPayment === "IMMEDIATE_TRANSFER" ||
        rawPayment === "qr_now" ||
        rawPayment === "VietQR" && req.body?.payment_timing !== "later";
    const payment_method: PickupPaymentMethod = isImmediate ? "IMMEDIATE_TRANSFER" : "PAY_LATER";

    let payment_status = "";
    let status: PickupRequestStatus = "PENDING";
    let inventory_deducted = false;

    const nowStr = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });

    if (payment_method === "IMMEDIATE_TRANSFER") {
        // 1. Chuyển khoản ngay: Trừ thẳng kho, hoàn thành ngay, KHÔNG cộng doanh số ca trực
        requestItems.forEach((item) => {
            const p = INVENTORY_PRODUCTS.find(
                (product) => product.id === item.product_id,
            );
            if (p) {
                p.sold_count = (p.sold_count || 0) + item.quantity;
            }
        });
        inventory_deducted = true;
        status = "APPROVED";
        payment_status = "Đã thanh toán";
    } else {
        // 2. Thanh toán sau: Trạng thái PENDING, CHƯA trừ tồn kho, KHÔNG cộng doanh số ca trực
        inventory_deducted = false;
        status = "PENDING";
        payment_status = "Chờ thanh toán";
    }

    const request: PickupRequest = {
        id,
        member_id: memberId,
        member_name: member.name,
        items: requestItems,
        total_amount: total,
        pickup_time,
        shift_id: matchedShift.shift_id,
        shift_label: matchedShift.shift_label,
        payment_method,
        payment_status,
        status,
        inventory_deducted,
        qr_url: pickupQrUrl(total, id),
        note: req.body?.note ? String(req.body.note).trim() : "",
        created_at: nowStr,
        created_timestamp: Date.now(),
        approved_at: isImmediate ? nowStr : undefined,
    };

    PICKUP_REQUESTS.unshift(request);
    persist();
    res.json({
        success: true,
        request,
        message: isImmediate
            ? `Đã tạo yêu cầu lấy hàng ${id} thành công và trừ tồn kho ca ${matchedShift.shift_id}.`
            : `Đã tạo yêu cầu lấy hàng ${id} thành công! Đơn đang chờ Admin duyệt trước khi trừ tồn kho.`,
    });
});

app.get("/api/pickup-requests", requireMember, (req, res) => {
    checkAndExpirePickupRequests();
    const memberId = getMemberId(req)!;
    const memberRequests = PICKUP_REQUESTS.filter(
        (request) => request.member_id === memberId,
    );
    const totalOrders = memberRequests.length;
    const totalAmount = memberRequests.reduce(
        (sum, r) => sum + (r.total_amount || 0),
        0,
    );
    const paidAmount = memberRequests
        .filter((r) => r.payment_status === "Đã thanh toán" || r.status === "APPROVED" || r.status === "Đã duyệt")
        .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const pendingAmount = memberRequests
        .filter(
            (r) =>
                r.status === "PENDING" ||
                r.status === "Chờ Admin duyệt" ||
                (r.payment_status !== "Đã thanh toán" && r.status !== "CANCELLED" && r.status !== "EXPIRED" && r.status !== "Từ chối" && r.status !== "Đã hủy"),
        )
        .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const pendingApprovalCount = memberRequests.filter(
        (r) => r.status === "PENDING" || r.status === "Chờ Admin duyệt",
    ).length;
    const approvedCount = memberRequests.filter(
        (r) => r.status === "APPROVED" || r.status === "Đã duyệt",
    ).length;

    res.json({
        success: true,
        requests: memberRequests,
        stats: {
            total_orders: totalOrders,
            total_amount: totalAmount,
            paid_amount: paidAmount,
            pending_amount: pendingAmount,
            pending_approval_count: pendingApprovalCount,
            approved_count: approvedCount,
        },
    });
});

app.post(
    "/api/pickup-requests/:id/payment-confirmation",
    requireMember,
    (req, res) => {
        const request = PICKUP_REQUESTS.find(
            (item) =>
                item.id === req.params.id &&
                item.member_id === getMemberId(req),
        );
        if (!request)
            return res
                .status(404)
                .json({ success: false, message: "Không tìm thấy request." });
        if (request.status === "CANCELLED" || request.status === "EXPIRED" || request.status === "Từ chối" || request.status === "Đã hủy")
            return res
                .status(409)
                .json({
                    success: false,
                    message: "Request này đã bị từ chối, đã hủy hoặc đã hết hạn.",
                });

        const action = req.body?.action;
        if (action === "pay_later") {
            request.payment_method = "PAY_LATER";
            request.payment_status = "Chờ thanh toán (Chuyển sau)";
        } else {
            request.payment_method = "IMMEDIATE_TRANSFER";
            request.payment_status = "Đã xác nhận chuyển khoản";
        }
        persist();
        res.json({
            success: true,
            request,
            message: "Đã cập nhật trạng thái thanh toán.",
        });
    },
);

app.post("/api/pickup-requests/:id/auto-confirm", requireMember, (req, res) => {
    const memberId = getMemberId(req);
    const request = PICKUP_REQUESTS.find(
        (item) => item.id === req.params.id && item.member_id === memberId,
    );
    if (!request) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy đơn hàng." });
    }
    if (request.status === "CANCELLED" || request.status === "EXPIRED" || request.status === "Từ chối" || request.status === "Đã hủy") {
        return res.status(409).json({
            success: false,
            message: "Đơn hàng này đã bị từ chối, đã hủy hoặc đã hết hạn.",
        });
    }

    // Nếu chưa trừ kho, thực hiện trừ kho bây giờ
    if (!request.inventory_deducted) {
        for (const item of request.items) {
            const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
            if (!product) {
                return res.status(409).json({
                    success: false,
                    message: `Không thể xác nhận: Không tìm thấy sản phẩm "${item.product_name}" trong kho.`,
                });
            }
            const available = (product.initial_stock || 0) - (product.sold_count || 0);
            if (item.quantity > available) {
                return res.status(409).json({
                    success: false,
                    message: `Không thể xác nhận: Sản phẩm "${product.name}" chỉ còn ${available} ${product.unit || "món"} trong kho.`,
                });
            }
        }
        request.items.forEach((item) => {
            const product = INVENTORY_PRODUCTS.find(p => p.id === item.product_id);
            if (product) {
                product.sold_count = (product.sold_count || 0) + item.quantity;
            }
        });
        request.inventory_deducted = true;
    }

    request.payment_status = "Đã thanh toán";
    request.status = "APPROVED";
    request.approved_at = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });
    // QUY TẮC: KHÔNG CỘNG DOANH SỐ VÀO CA TRỰC
    persist();
    res.json({
        success: true,
        request,
        message: "Chuyển khoản thành công! Giao dịch đã được tự động xác nhận.",
    });
});

app.post("/api/pickup-requests/:id/cancel", requireMember, (req, res) => {
    const isAdmin = isValidAdmin(req);
    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: "Lịch sử đã ghi nhận. Thành viên không thể hủy đơn, chỉ Quản trị viên (Admin) mới có quyền hủy đơn và hoàn trả kho.",
        });
    }

    const request = PICKUP_REQUESTS.find((item) => item.id === req.params.id);
    if (!request) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy yêu cầu lấy hàng." });
    }
    if (request.status === "CANCELLED" || request.status === "Đã hủy") {
        return res.status(409).json({
            success: false,
            message: "Đơn hàng này đã được hủy trước đó.",
        });
    }

    // Hoàn lại kho nếu đã từng trừ kho
    let restoredCount = 0;
    if (request.inventory_deducted) {
        request.items.forEach((item) => {
            const product = INVENTORY_PRODUCTS.find(
                (p) => p.id === item.product_id,
            );
            if (product) {
                product.sold_count = Math.max(
                    0,
                    (product.sold_count || 0) - item.quantity,
                );
                restoredCount += item.quantity;
            }
        });
        request.inventory_deducted = false;
    }

    request.status = "CANCELLED";
    request.payment_status = "Đã hủy";
    request.cancelled_at = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });
    removePickupSales(request.id);
    persist();
    res.json({
        success: true,
        request,
        message: restoredCount > 0
            ? `Admin đã hủy đơn ${request.id} và hoàn trả ${restoredCount} sản phẩm vào tồn kho.`
            : `Admin đã hủy đơn ${request.id} thành công.`,
    });
});

app.post(
    "/api/admin/pickup-requests/:id/confirm-transaction",
    requireAdmin,
    (req, res) => {
        const request = PICKUP_REQUESTS.find(
            (item) => item.id === req.params.id,
        );
        if (!request) {
            return res
                .status(404)
                .json({ success: false, message: "Không tìm thấy đơn hàng." });
        }
        if (request.status === "CANCELLED" || request.status === "EXPIRED" || request.status === "Đã hủy" || request.status === "Từ chối") {
            return res.status(409).json({
                success: false,
                message: "Đơn hàng này đã bị hủy, từ chối hoặc đã hết hạn quá 3 ngày.",
            });
        }
        if (request.status === "APPROVED" || request.status === "Đã duyệt") {
            return res.status(409).json({
                success: false,
                message: "Đơn hàng này đã được phê duyệt trước đó.",
            });
        }

        // Nếu chưa trừ kho (ví dụ đơn Thanh toán sau), kiểm tra và trừ tồn kho ngay
        if (!request.inventory_deducted) {
            for (const item of request.items) {
                const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
                if (!product) {
                    return res.status(409).json({
                        success: false,
                        message: `Không thể duyệt: Không tìm thấy sản phẩm "${item.product_name}" trong kho.`,
                    });
                }
                const available = (product.initial_stock || 0) - (product.sold_count || 0);
                if (item.quantity > available) {
                    return res.status(409).json({
                        success: false,
                        message: `Không thể duyệt: Sản phẩm "${product.name}" chỉ còn ${available} ${product.unit || "món"} trong kho (đơn yêu cầu ${item.quantity}).`,
                    });
                }
            }

            request.items.forEach((item) => {
                const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
                if (product) {
                    product.sold_count = (product.sold_count || 0) + item.quantity;
                }
            });
            request.inventory_deducted = true;
        }

        request.status = "APPROVED";
        request.payment_status = "Đã thanh toán";
        request.approved_at = new Date().toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
        });
        // QUY TẮC QUAN TRỌNG: KHÔNG ĐƯỢC CỘNG VÀO DOANH SỐ CỦA CA TRỰC ĐÓ
        persist();
        res.json({
            success: true,
            request,
            message: `Admin đã phê duyệt đơn ${request.id} thành công và trừ tồn kho ca ${request.shift_id || ""}.`,
        });
    },
);

// Alias /approve cho admin
app.post("/api/admin/pickup-requests/:id/approve", requireAdmin, (req, res) => {
    const request = PICKUP_REQUESTS.find(
        (item) => item.id === req.params.id,
    );
    if (!request) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy đơn hàng." });
    }
    if (request.status === "CANCELLED" || request.status === "EXPIRED" || request.status === "Đã hủy" || request.status === "Từ chối") {
        return res.status(409).json({
            success: false,
            message: "Đơn hàng này đã bị hủy, từ chối hoặc đã hết hạn quá 3 ngày.",
        });
    }
    if (request.status === "APPROVED" || request.status === "Đã duyệt") {
        return res.status(409).json({
            success: false,
            message: "Đơn hàng này đã được phê duyệt trước đó.",
        });
    }

    if (!request.inventory_deducted) {
        for (const item of request.items) {
            const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
            if (!product) {
                return res.status(409).json({
                    success: false,
                    message: `Không thể duyệt: Không tìm thấy sản phẩm "${item.product_name}" trong kho.`,
                });
            }
            const available = (product.initial_stock || 0) - (product.sold_count || 0);
            if (item.quantity > available) {
                return res.status(409).json({
                    success: false,
                    message: `Không thể duyệt: Sản phẩm "${product.name}" chỉ còn ${available} ${product.unit || "món"} trong kho (đơn yêu cầu ${item.quantity}).`,
                });
            }
        }

        request.items.forEach((item) => {
            const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
            if (product) {
                product.sold_count = (product.sold_count || 0) + item.quantity;
            }
        });
        request.inventory_deducted = true;
    }

    request.status = "APPROVED";
    request.payment_status = "Đã thanh toán";
    request.approved_at = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
    });
    persist();
    res.json({
        success: true,
        request,
        message: `Admin đã phê duyệt đơn ${request.id} thành công và trừ tồn kho ca ${request.shift_id || ""}.`,
    });
});

app.post(
    "/api/admin/pickup-requests/:id/cancel",
    requireAdmin,
    (req, res) => {
        const request = PICKUP_REQUESTS.find(
            (item) => item.id === req.params.id,
        );
        if (!request) {
            return res
                .status(404)
                .json({ success: false, message: "Không tìm thấy đơn hàng." });
        }
        if (request.status === "CANCELLED" || request.status === "Đã hủy") {
            return res.status(409).json({
                success: false,
                message: "Đơn hàng này đã được hủy trước đó.",
            });
        }
        // Hoàn lại kho nếu đã từng trừ kho
        let restoredCount = 0;
        if (request.inventory_deducted) {
            request.items.forEach((item) => {
                const product = INVENTORY_PRODUCTS.find(
                    (p) => p.id === item.product_id,
                );
                if (product) {
                    product.sold_count = Math.max(
                        0,
                        (product.sold_count || 0) - item.quantity,
                    );
                    restoredCount += item.quantity;
                }
            });
            request.inventory_deducted = false;
        }
        request.status = "CANCELLED";
        request.payment_status = "Đã hủy";
        request.cancelled_at = new Date().toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
        });
        removePickupSales(request.id);
        persist();
        res.json({
            success: true,
            request,
            message: restoredCount > 0
                ? `Admin đã hủy đơn ${request.id} và hoàn trả lại ${restoredCount} sản phẩm vào tồn kho.`
                : `Admin đã hủy đơn ${request.id} thành công.`,
        });
    },
);

app.get("/api/admin/pickup-requests", requireAdmin, (_req, res) => {
    checkAndExpirePickupRequests();
    const totalOrders = PICKUP_REQUESTS.length;
    const totalAmount = PICKUP_REQUESTS.reduce(
        (sum, r) => sum + (r.total_amount || 0),
        0,
    );
    const paidAmount = PICKUP_REQUESTS
        .filter((r) => r.payment_status === "Đã thanh toán" || r.status === "APPROVED" || r.status === "Đã duyệt")
        .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const pendingAmount = PICKUP_REQUESTS
        .filter(
            (r) =>
                r.status === "PENDING" ||
                r.status === "Chờ Admin duyệt" ||
                (r.payment_status !== "Đã thanh toán" && r.status !== "CANCELLED" && r.status !== "EXPIRED" && r.status !== "Từ chối" && r.status !== "Đã hủy"),
        )
        .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    const pendingApprovalCount = PICKUP_REQUESTS.filter(
        (r) => r.status === "PENDING" || r.status === "Chờ Admin duyệt",
    ).length;

    res.json({
        success: true,
        requests: PICKUP_REQUESTS,
        stats: {
            total_orders: totalOrders,
            total_amount: totalAmount,
            paid_amount: paidAmount,
            pending_amount: pendingAmount,
            pending_approval_count: pendingApprovalCount,
        },
    });
});

app.post(
    "/api/admin/pickup-requests/:id/decision",
    requireAdmin,
    (req, res) => {
        const request = PICKUP_REQUESTS.find(
            (item) => item.id === req.params.id,
        );
        if (!request)
            return res
                .status(404)
                .json({ success: false, message: "Không tìm thấy request." });
        if (request.status !== "PENDING" && request.status !== "Chờ Admin duyệt")
            return res
                .status(409)
                .json({
                    success: false,
                    message: "Request này đã được xử lý trước đó hoặc đã hết hạn.",
                });

        const decision = req.body?.decision;
        if (decision === "approve") {
            if (!request.inventory_deducted) {
                for (const item of request.items) {
                    const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
                    if (!product) {
                        return res.status(409).json({
                            success: false,
                            message: `Không thể duyệt: Không tìm thấy sản phẩm "${item.product_name}" trong kho.`,
                        });
                    }
                    const available = (product.initial_stock || 0) - (product.sold_count || 0);
                    if (item.quantity > available) {
                        return res.status(409).json({
                            success: false,
                            message: `Không thể duyệt: Sản phẩm "${product.name}" chỉ còn ${available} ${product.unit || "món"} trong kho.`,
                        });
                    }
                }
                request.items.forEach((item) => {
                    const product = INVENTORY_PRODUCTS.find((p) => p.id === item.product_id);
                    if (product) {
                        product.sold_count = (product.sold_count || 0) + item.quantity;
                    }
                });
                request.inventory_deducted = true;
            }
            request.status = "APPROVED";
            request.payment_status = "Đã thanh toán";
            request.approved_at = new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            });
        } else if (decision === "reject") {
            if (request.inventory_deducted) {
                request.items.forEach((item) => {
                    const product = INVENTORY_PRODUCTS.find(
                        (entry) => entry.id === item.product_id,
                    );
                    if (product)
                        product.sold_count = Math.max(
                            0,
                            (product.sold_count || 0) - item.quantity,
                        );
                });
                request.inventory_deducted = false;
            }
            request.status = "CANCELLED";
            request.payment_status = "Từ chối";
            request.cancelled_at = new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            });
            removePickupSales(request.id);
        } else {
            return res.status(400).json({
                success: false,
                message: "Quyết định không hợp lệ.",
            });
        }
        persist();
        res.json({
            success: true,
            request,
            message: `Đã cập nhật đơn ${request.id}: ${request.status} (${request.payment_status}).`,
        });
    },
);

app.post(
    "/api/admin/pickup-requests/:id/payment-status",
    requireAdmin,
    (req, res) => {
        const request = PICKUP_REQUESTS.find(
            (item) => item.id === req.params.id,
        );
        if (!request)
            return res
                .status(404)
                .json({ success: false, message: "Không tìm thấy request." });

        const { payment_status } = req.body || {};
        if (!payment_status) {
            return res
                .status(400)
                .json({ success: false, message: "Thiếu payment_status!" });
        }

        request.payment_status = payment_status;
        if (payment_status === "Đã thanh toán") {
            if (request.status === "Chờ Admin duyệt") {
                request.status = "Đã duyệt";
            }
            addPickupSales(request);
        } else {
            removePickupSales(request.id);
        }
        persist();
        res.json({
            success: true,
            request,
            message: `Admin đã quyết định trạng thái thanh toán của đơn ${request.id} là "${payment_status}".`,
        });
    },
);

app.post("/api/online-orders/update-status", requireAdmin, (req, res) => {
    try {
        const { order_id, payment_status } = req.body || {};
        if (!order_id || !payment_status) {
            return res.status(400).json({
                success: false,
                message: "Thiếu order_id hoặc payment_status!",
            });
        }
        const orderIndex = ONLINE_ORDERS.findIndex((o) => o.id === order_id);
        if (orderIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng online!",
            });
        }
        const order = ONLINE_ORDERS[orderIndex];
        const oldStatus = order.payment_status;
        order.payment_status = payment_status;

        // If changed to "Đã thanh toán", update inventory stock/sales
        if (
            oldStatus !== "Đã thanh toán" &&
            payment_status === "Đã thanh toán"
        ) {
            const nowTime = new Date().toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
            });
            order.items.forEach((item) => {
                if (item.product_id) {
                    const prod = INVENTORY_PRODUCTS.find(
                        (p) => p.id === item.product_id,
                    );
                    if (prod) {
                        prod.sold_count =
                            (prod.sold_count || 0) + item.quantity;
                    }
                }
                SALES_LOGS.push({
                    id: `SALE_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: nowTime,
                    product_id: item.product_id || "ONLINE",
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_amount: item.total_price,
                    channel: "Online",
                    seller: "Online Auto",
                    shift_id: order.shift_id,
                    customer_name: `${order.customer_name} (${order.class_name})`,
                    payment_method: "Đơn Online",
                    note: `Thanh toán đơn online ${order.id}`,
                    refunded: false,
                    week: currentWeekTag(),
                });
            });
        } else if (
            oldStatus === "Đã thanh toán" &&
            payment_status === "Chưa thanh toán"
        ) {
            // Revert inventory sold_count
            order.items.forEach((item) => {
                if (item.product_id) {
                    const prod = INVENTORY_PRODUCTS.find(
                        (p) => p.id === item.product_id,
                    );
                    if (prod && (prod.sold_count || 0) >= item.quantity) {
                        prod.sold_count -= item.quantity;
                    }
                }
            });
        }

        persist();
        res.json({
            success: true,
            message: `Đã chuyển trạng thái đơn hàng thành '${payment_status}'!`,
            order,
            online_orders: ONLINE_ORDERS,
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: `Lỗi cập nhật trạng thái đơn: ${err.message}`,
        });
    }
});

app.get("/api/online-orders/template-excel", (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        // Product list: prioritize active products from inventory, or default chemistry drinks
        const productList =
            INVENTORY_PRODUCTS.length > 0
                ? INVENTORY_PRODUCTS.map((p) => p.name)
                : [
                      "Glutamic Acid",
                      "[CU(NH3)4](OH)2",
                      "Lysine",
                      "(C17H35COO)C3H5",
                  ];

        const headerRow = [
            "Họ và tên",
            "Lớp",
            "Ngày dự kiến lấy",
            "Khung giờ lấy (Ca)",
            ...productList,
        ];

        const wsData: any[][] = [
            headerRow,
            [
                "Nguyễn Văn A",
                "12A1",
                "2026-08-25",
                "Ca 1: 07h00 - 09h30",
                2,
                1,
                1,
                0,
            ],
            [
                "Trần Thị B",
                "11T2",
                "2026-08-25",
                "Ca 2: 09h35 - 12h00",
                1,
                2,
                2,
                0,
            ],
            [
                "Lê Văn C",
                "10T1",
                "2026-08-26",
                "Ca 3: 12h05 - 14h00",
                3,
                0,
                0,
                0,
            ],
            [
                "Phạm Minh D",
                "12H1",
                "2026-08-26",
                "Ca 4: 14h05 - 16h30",
                0,
                2,
                0,
                1,
            ],
        ];

        const ws = xlsx.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [
            { wch: 22 }, // Họ và tên
            { wch: 10 }, // Lớp
            { wch: 18 }, // Ngày dự kiến lấy
            { wch: 24 }, // Khung giờ lấy (Ca)
            ...productList.map(() => ({ wch: 18 })),
        ];
        xlsx.utils.book_append_sheet(wb, ws, "DON_HANG_ONLINE");
        const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="Mau_Nhap_Don_Hang_Online.xlsx"',
        );
        res.send(buf);
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: `Lỗi tạo file mẫu: ${err.message}`,
        });
    }
});

app.post("/api/online-orders/delete", requireAdmin, (req, res) => {
    try {
        const { order_id, clear_all } = req.body || {};
        if (clear_all) {
            ONLINE_ORDERS = [];
            PICKUP_REQUESTS = [];
            MEMBER_PASSWORDS = {};
            CURRENT_MEMBERS.forEach((member: any) => {
                MEMBER_PASSWORDS[member.member_id] = `HV@${member.member_id}`;
            });
        } else if (order_id) {
            ONLINE_ORDERS = ONLINE_ORDERS.filter((o) => o.id !== order_id);
        }
        persist();
        res.json({
            success: true,
            message: clear_all
                ? "Đã xóa tất cả đơn hàng online!"
                : "Đã xóa đơn hàng online thành công!",
            online_orders: ONLINE_ORDERS,
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: `Lỗi xóa đơn hàng: ${err.message}`,
        });
    }
});

// Download Excel Template for Member Availability Schedule
app.get("/api/members/template-excel", (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        const wsData = [
            [
                "Họ và tên của bạn?",
                "Bạn là thành viên của ban?",
                "Nơi sinh sống của bạn",
                "Phương tiện di chuyển bạn thường sử dụng?",
                "Công việc hiện tại",
                "Bạn đang là học sinh trường THPT nào?",
                "Số điện thoại",
                "Lịch rảnh của bạn [7h - 10h]",
                "Lịch rảnh của bạn [9h - 12h]",
                "Lịch rảnh của bạn [11h - 14h]",
                "Lịch rảnh của bạn [13h - 16h]",
                "Lịch rảnh của bạn [15h - 18h]",
                'Nếu có nhiều thời gian, bạn có cân nhắc tham gia vào "Đội ứng biến linh hoạt" không?',
                "Hãy điền 1 khung giờ bạn cam kết có thể tham gia trực ca? [7h - 10h]",
                "Hãy điền 1 khung giờ bạn cam kết có thể tham gia trực ca? [9h - 12h]",
                "Hãy điền 1 khung giờ bạn cam kết có thể tham gia trực ca? [11h - 14h]",
                "Hãy điền 1 khung giờ bạn cam kết có thể tham gia trực ca? [13h - 16h]",
                "Hãy điền 1 khung giờ bạn cam kết có thể tham gia trực ca? [15h - 18h]",
            ],
            [
                "Nguyễn Vân Anh",
                "Ban Nhân sự",
                "Thuận An",
                "Được đưa đón",
                "Học sinh ( Cấp 3 )",
                "TRỊNH HOÀI ĐỨC",
                "0923883626",
                "Thứ 7",
                "Thứ 7",
                "Thứ 7",
                "Thứ 3",
                "Chủ nhật",
                "Có",
                "Không rảnh ngày nào",
                "Không rảnh ngày nào",
                "Chủ nhật",
                "Thứ 7",
                "Không rảnh ngày nào",
            ],
            [
                "Hoàng Bảo Sơn",
                "Ban Tài chính chiến lược",
                "TP. Hồ Chí Minh",
                "Đi bộ",
                "Học sinh ( Cấp 3 )",
                "THPT CHUYÊN HÙNG VƯƠNG",
                "0822646861",
                "Thứ 7",
                "Thứ 5",
                "Thứ 3",
                "Thứ 6",
                "Thứ 3",
                "Không",
                "Không rảnh ngày nào",
                "Không rảnh ngày nào",
                "Không rảnh ngày nào",
                "Không rảnh ngày nào",
                "Không rảnh ngày nào",
            ],
        ];

        const ws = xlsx.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [
            { wch: 22 }, // Họ và tên
            { wch: 25 }, // Ban
            { wch: 18 }, // Nơi sinh sống
            { wch: 22 }, // Phương tiện
            { wch: 20 }, // Công việc
            { wch: 28 }, // Trường
            { wch: 15 }, // SĐT
            { wch: 20 }, // Rảnh 7-10
            { wch: 20 }, // Rảnh 9-12
            { wch: 20 }, // Rảnh 11-14
            { wch: 20 }, // Rảnh 13-16
            { wch: 20 }, // Rảnh 15-18
            { wch: 30 }, // Ứng biến
            { wch: 25 }, // Cam kết 7-10
            { wch: 25 }, // Cam kết 9-12
            { wch: 25 }, // Cam kết 11-14
            { wch: 25 }, // Cam kết 13-16
            { wch: 25 }, // Cam kết 15-18
        ];

        xlsx.utils.book_append_sheet(wb, ws, "DANH_SACH_THANH_VIEN");
        const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="Danh_Sach_Lich_Ranh_Thanh_Vien_Mau.xlsx"',
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
                    message:
                        "Không tìm thấy dữ liệu mặt hàng hợp lệ trong file Excel. Vui lòng kiểm tra định dạng bảng!",
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
                return res.status(400).json({
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
                    message:
                        "Không tìm thấy dòng sản phẩm nào hợp lệ trong file Excel. Vui lòng kiểm tra lại cấu trúc cột!",
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
                        (item.id &&
                            p.id.toUpperCase() === item.id.toUpperCase()) ||
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
        return res
            .status(400)
            .json({ success: false, message: "Giỏ hàng trống" });
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
        const product_id = String(item.product_id || "")
            .trim()
            .toUpperCase();
        const quantity = Math.max(1, parseInt(item.quantity || "1", 10));
        const product = INVENTORY_PRODUCTS.find(
            (p) =>
                String(p.id || "")
                    .trim()
                    .toUpperCase() === product_id,
        );
        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Không tìm thấy sản phẩm ${item.product_id}`,
            });
        }
        const currentStock = Math.max(
            0,
            product.initial_stock - (product.sold_count || 0),
        );
        if (quantity > currentStock) {
            return res.status(400).json({
                success: false,
                message: `Sản phẩm ${product.name} chỉ còn ${currentStock} trong kho.`,
            });
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
            week: currentWeekTag(),
        });
    }

    // Now commit the sale
    for (const tx of newTransactions) {
        const product = INVENTORY_PRODUCTS.find((p) => p.id === tx.product_id);
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
        return res.status(404).json({
            success: false,
            message: `Không tìm thấy giao dịch ${transaction_id}`,
        });
    }

    if (transactions.some((t) => t.refunded)) {
        return res.status(400).json({
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
        return res.status(404).json({
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
        week: currentWeekTag(),
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
    RESTOCK_RECEIPTS = [];
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
    let auditor = String(data.auditor || "").trim();

    // Tự động gán Ca trưởng là người kiểm hàng nếu chưa chọn hoặc để mặc định
    if ((!auditor || auditor === "Người kiểm hàng" || auditor === "Bộ phận kiểm hàng" || auditor === "Người kiểm hàng ca") && LATEST_SCHEDULE_RESULT?.assigned_shifts) {
        const foundShift = LATEST_SCHEDULE_RESULT.assigned_shifts.find((s: any) => s.shift_id === shift_id);
        if (foundShift?.shift_leader && foundShift.shift_leader !== "Chưa chỉ định") {
            auditor = foundShift.shift_leader;
        }
    }
    if (!auditor) {
        auditor = "Người kiểm hàng ca";
    }

    const itemsData = Array.isArray(data.items) ? data.items : [];
    const summary_note = String(data.summary_note || "").trim();
    const target_rollover_shift = String(data.carried_forward_shift || "").trim();

    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    let resolvedCount = 0;
    let unresolvedCount = 0;

    const auditItems: ShiftAuditItem[] = itemsData.map((it: any) => {
        const diff = parseInt(it.diff || "0", 10);
        let resType = String(it.resolution_type || "").trim();
        if (!resType) {
            resType = diff === 0 ? "Khớp kho" : "Chưa xử lý";
        }

        const isResolved =
            resType === "Khớp kho" ||
            resType === "Đã bù ngay" ||
            resType === "Hao hụt cho phép" ||
            resType === "Đã trừ quỹ ca";

        if (diff !== 0) {
            if (isResolved) {
                resolvedCount++;
            } else {
                unresolvedCount++;
            }
        }

        const unitPrice = parseInt(it.unit_price || "0", 10) ||
            (INVENTORY_PRODUCTS.find((p) => p.id === it.product_id)?.price || 0);

        return {
            product_id: String(it.product_id || ""),
            product_name: String(it.product_name || ""),
            unit: String(it.unit || "món"),
            expected_stock: parseInt(it.expected_stock || "0", 10),
            actual_stock: parseInt(it.actual_stock || "0", 10),
            diff: diff,
            carried_from_prev: parseInt(it.carried_from_prev || "0", 10) || 0,
            resolution_type: resType,
            resolution_note: String(it.resolution_note || it.note || "").trim(),
            resolved_by: String(it.resolved_by || (isResolved ? auditor : "")).trim(),
            resolved_at: isResolved ? timestamp : (it.resolved_at || ""),
            is_resolved: isResolved,
            carry_to_shift: String(it.carry_to_shift || (resType === "Cộng dồn chuyển ca sau" ? target_rollover_shift : "")).trim(),
            carry_qty: resType === "Cộng dồn chuyển ca sau" ? Math.abs(diff) : (parseInt(it.carry_qty || "0", 10) || 0),
            unit_price: unitPrice,
            note: String(it.note || "").trim(),
        };
    });

    const total_diff = auditItems.reduce((acc, item) => acc + item.diff, 0);
    const hasDiff = auditItems.some((item) => item.diff !== 0);

    let overall_status = "KHỚP HOÀN TOÀN";
    if (hasDiff) {
        if (unresolvedCount === 0) {
            overall_status = "ĐÃ XỬ LÝ XONG";
        } else if (auditItems.some((i) => i.resolution_type === "Cộng dồn chuyển ca sau")) {
            overall_status = "CỘNG DỒN CHUYỂN CA";
        } else {
            overall_status = "CHỜ BÙ / XỬ LÝ";
        }
    }

    const auditId = `AUD${String(SHIFT_AUDITS.length + 1).padStart(3, "0")}`;

    const auditRecord: ShiftAudit = {
        id: auditId,
        shift_id,
        timestamp,
        auditor,
        items: auditItems,
        total_diff,
        summary_note,
        overall_status,
        carried_forward_shift: target_rollover_shift,
        resolved_count: resolvedCount,
        unresolved_count: unresolvedCount,
        updated_at: timestamp,
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

app.post("/api/inventory/audit-shift/update-resolution", (req, res) => {
    const { audit_id, product_id, resolution_type, resolution_note, resolved_by, carry_to_shift } = req.body || {};
    if (!audit_id) {
        return res.status(400).json({ success: false, message: "Thiếu audit_id" });
    }

    const audit = SHIFT_AUDITS.find((a) => a.id === audit_id);
    if (!audit) {
        return res.status(404).json({ success: false, message: `Không tìm thấy báo cáo kiểm kê ${audit_id}` });
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

    const isResolvedType = (type: string) =>
        type === "Khớp kho" ||
        type === "Đã bù ngay" ||
        type === "Hao hụt cho phép" ||
        type === "Đã trừ quỹ ca";

    if (product_id) {
        const item = (audit.items || []).find((it) => it.product_id === product_id);
        if (item) {
            item.resolution_type = resolution_type || item.resolution_type || "Chưa xử lý";
            if (resolution_note !== undefined) item.resolution_note = resolution_note;
            if (resolved_by !== undefined) item.resolved_by = resolved_by;
            if (carry_to_shift !== undefined) item.carry_to_shift = carry_to_shift;
            item.is_resolved = isResolvedType(item.resolution_type);
            item.resolved_at = item.is_resolved ? timestamp : "";
        }
    } else if (resolution_type) {
        // Apply resolution to all discrepant items in audit
        (audit.items || []).forEach((item) => {
            if (item.diff !== 0) {
                item.resolution_type = resolution_type;
                if (resolution_note !== undefined) item.resolution_note = resolution_note;
                if (resolved_by !== undefined) item.resolved_by = resolved_by;
                if (carry_to_shift !== undefined) item.carry_to_shift = carry_to_shift;
                item.is_resolved = isResolvedType(resolution_type);
                item.resolved_at = item.is_resolved ? timestamp : "";
            }
        });
    }

    // Recompute counts & status
    let resolvedCount = 0;
    let unresolvedCount = 0;
    (audit.items || []).forEach((item) => {
        if (item.diff !== 0) {
            if (item.is_resolved) resolvedCount++;
            else unresolvedCount++;
        }
    });
    audit.resolved_count = resolvedCount;
    audit.unresolved_count = unresolvedCount;
    audit.updated_at = timestamp;

    const hasDiff = (audit.items || []).some((item) => item.diff !== 0);
    if (!hasDiff) {
        audit.overall_status = "KHỚP HOÀN TOÀN";
    } else if (unresolvedCount === 0) {
        audit.overall_status = "ĐÃ XỬ LÝ XONG";
    } else if ((audit.items || []).some((i) => i.resolution_type === "Cộng dồn chuyển ca sau")) {
        audit.overall_status = "CỘNG DỒN CHUYỂN CA";
    } else {
        audit.overall_status = "CHỜ BÙ / XỬ LÝ";
    }

    persist();
    res.json({
        success: true,
        message: `Đã cập nhật hướng xử lý chênh lệch cho báo cáo ${audit_id}!`,
        audit,
    });
});

app.post("/api/inventory/audit-shift/rollover-to-shift", (req, res) => {
    const { from_audit_id, from_shift_id, to_shift_id, note, resolved_by } = req.body || {};
    if (!to_shift_id) {
        return res.status(400).json({ success: false, message: "Thiếu ca đích (to_shift_id) để cộng dồn!" });
    }

    let targetAudits = SHIFT_AUDITS;
    if (from_audit_id) {
        targetAudits = SHIFT_AUDITS.filter((a) => a.id === from_audit_id);
    } else if (from_shift_id) {
        targetAudits = SHIFT_AUDITS.filter((a) => a.shift_id === from_shift_id);
    }

    if (targetAudits.length === 0) {
        return res.status(404).json({ success: false, message: "Không tìm thấy đợt kiểm kê phù hợp để chuyển giao cộng dồn!" });
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

    let rolledCount = 0;
    targetAudits.forEach((audit) => {
        audit.carried_forward_shift = to_shift_id;
        (audit.items || []).forEach((it) => {
            if (it.diff !== 0 && !it.is_resolved) {
                it.resolution_type = "Cộng dồn chuyển ca sau";
                it.carry_to_shift = to_shift_id;
                it.carry_qty = Math.abs(it.diff);
                it.resolution_note = note || `Đã chuyển giao cộng dồn chênh lệch sang ca ${to_shift_id}`;
                if (resolved_by) it.resolved_by = resolved_by;
                it.resolved_at = timestamp;
                rolledCount++;
            }
        });
        audit.overall_status = "CỘNG DỒN CHUYỂN CA";
        audit.updated_at = timestamp;
    });

    persist();
    res.json({
        success: true,
        message: `✓ Đã chuyển giao cộng dồn ${rolledCount} mặt hàng chênh lệch sang ca ${to_shift_id}!`,
        rolled_items_count: rolledCount,
        to_shift_id,
    });
});

app.get("/api/inventory/audit-shift/pending-rollover", (req, res) => {
    const shift_id = String(req.query.shift_id || "").trim();
    
    // Find all items that are either designated to carry over to shift_id,
    // or are from the immediately previous audit with unresolved discrepancies
    const pendingItems: Array<{
        from_audit_id: string;
        from_shift_id: string;
        from_timestamp: string;
        product_id: string;
        product_name: string;
        unit: string;
        diff: number;
        resolution_type: string;
        resolution_note?: string;
    }> = [];

    SHIFT_AUDITS.forEach((audit) => {
        (audit.items || []).forEach((it) => {
            if (it.diff !== 0) {
                const isCarriedToThis = it.carry_to_shift === shift_id;
                const isGeneralPending = !it.is_resolved && it.resolution_type === "Cộng dồn chuyển ca sau" && (!it.carry_to_shift || it.carry_to_shift === shift_id);
                if (isCarriedToThis || isGeneralPending) {
                    pendingItems.push({
                        from_audit_id: audit.id,
                        from_shift_id: audit.shift_id,
                        from_timestamp: audit.timestamp,
                        product_id: it.product_id,
                        product_name: it.product_name,
                        unit: it.unit,
                        diff: it.diff,
                        resolution_type: it.resolution_type || "Cộng dồn chuyển ca sau",
                        resolution_note: it.resolution_note,
                    });
                }
            }
        });
    });

    res.json({
        success: true,
        shift_id,
        pending_rollovers: pendingItems,
    });
});

app.delete("/api/inventory/audit-shift/:id", requireAdmin, (req, res) => {
    const id = req.params.id;
    const initialLen = SHIFT_AUDITS.length;
    SHIFT_AUDITS = SHIFT_AUDITS.filter((a) => a.id !== id);
    if (SHIFT_AUDITS.length < initialLen) {
        persist();
        res.json({ success: true, message: `Đã xóa báo cáo kiểm kê ${id}!` });
    } else {
        res.status(404).json({ success: false, message: `Không tìm thấy báo cáo kiểm kê ${id}` });
    }
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
        return res.status(404).json({
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
            const key = `${s.shift_id}|${m.member_id}`;
            if (!existingKeys.has(key)) {
                KPI_ATTENDANCE.push({
                    shift_id: s.shift_id,
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
        const sh = shifts.find((s: any) => s.shift_id === shift_id);
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
                CURRENT_MEMBERS = parseMembersDf(rows, sheet);
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
                    return res.status(400).json({
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

                CURRENT_MEMBERS = parseMembersDf(rows, firstSheet);
                const dupCount = (CURRENT_MEMBERS as any).duplicateCount || 0;
                const dupStr =
                    dupCount > 0
                        ? ` (phát hiện & loại bỏ ${dupCount} dòng trùng lặp)`
                        : "";
                msg = `Đồng bộ Google Sheets thành công! Đã tải ${CURRENT_MEMBERS.length} thành viên${dupStr}.`;
            } else {
                return res.status(400).json({
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
                const isLeader = target_shift.shift_leader === m_orig.name || target_shift.shift_leader === m_orig.member_id;
                const posRole = isLeader ? "📦 Kiểm kê hàng & Chốt ca (Ca trưởng)" : (mu.position_role || "Phục vụ / Giao hàng");
                const role = isLeader ? "Chính" : (mu.role || "Chính");
                new_assigned.push({
                    member_id: m_orig.member_id,
                    name: m_orig.name,
                    department: m_orig.department,
                    residence: m_orig.residence,
                    vehicle: m_orig.vehicle,
                    job: m_orig.job,
                    school: m_orig.school,
                    phone: m_orig.phone,
                    role: role,
                    position_role: posRole,
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
    } else if (new_leader && target_shift.assigned_members) {
        target_shift.assigned_members.forEach((m: any) => {
            if (m.name === new_leader || m.member_id === new_leader) {
                m.position_role = "📦 Kiểm kê hàng & Chốt ca (Ca trưởng)";
                m.role = "Chính";
            }
        });
    }

    // Save to Excel and disk
    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();
    SCHEDULE_VERSION++;

    res.json({
        success: true,
        message: `Đã cập nhật thành công thông tin ca ${shift_id}!`,
        shift: target_shift,
        schedule_version: SCHEDULE_VERSION,
    });
});

app.post("/api/shift/add-member", requireAdmin, async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const data = req.body || {};
    const shift_id = data.shift_id;
    const member_id = data.member_id;
    const role = data.role === "Dự phòng" ? "Dự phòng" : "Chính";
    const position_role =
        data.position_role ||
        (role === "Chính" ? "Bán hàng F&B" : "⚡ Dự bị tiếp ứng");
    const set_as_leader = Boolean(data.set_as_leader);

    if (!shift_id || !member_id) {
        return res.status(400).json({
            success: false,
            message: "Thiếu thông tin ca trực hoặc nhân sự",
        });
    }

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: `Không tìm thấy ca ${shift_id}` });
    }

    const member = CURRENT_MEMBERS.find((m) => m.member_id === member_id);
    if (!member) {
        return res.status(404).json({
            success: false,
            message: `Không tìm thấy nhân sự mã ${member_id}`,
        });
    }

    target_shift.assigned_members = target_shift.assigned_members || [];
    const existingIndex = target_shift.assigned_members.findIndex(
        (m: any) => m.member_id === member_id,
    );

    if (existingIndex >= 0) {
        target_shift.assigned_members[existingIndex].role = role;
        target_shift.assigned_members[existingIndex].position_role =
            position_role;
    } else {
        target_shift.assigned_members.push({
            member_id: member.member_id,
            name: member.name,
            department: member.department,
            residence: member.residence,
            vehicle: member.vehicle,
            job: member.job,
            school: member.school,
            phone: member.phone,
            role: role,
            position_role: position_role,
            is_standby: member.is_standby,
            is_committed:
                member.committed_slots?.[
                    `${target_shift.day}|${target_shift.slot}`
                ] || false,
        });
    }

    if (set_as_leader) {
        target_shift.shift_leader = member.name;
    } else if (
        !target_shift.shift_leader ||
        target_shift.shift_leader === "Chưa chỉ định"
    ) {
        target_shift.shift_leader = member.name;
    }

    target_shift.assigned_count = target_shift.assigned_members.length;
    target_shift.chinh_assigned_count = target_shift.assigned_members.filter(
        (m: any) => m.role === "Chính",
    ).length;
    target_shift.dp_assigned_count = target_shift.assigned_members.filter(
        (m: any) => m.role === "Dự phòng",
    ).length;
    target_shift.is_filled =
        target_shift.assigned_count >= (target_shift.required_count || 0);

    SCHEDULE_VERSION++;
    addSystemNotification({
        type: "MEMBER_ADDED",
        title: "Thêm nhân sự vào ca trực",
        message: `Admin đã thêm ${member.name} (${role} - ${position_role}) vào Ca ${shift_id}`,
        shift_id: shift_id,
        shift_day: target_shift.day,
        shift_slot: target_shift.slot,
        target_role: "all",
    });

    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    return res.json({
        success: true,
        message: `Đã thêm thành công ${member.name} vào ca ${shift_id}!`,
        shift: target_shift,
        schedule_version: SCHEDULE_VERSION,
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
        // 1 = Ứng biến có thời gian rảnh trùng giờ
        // 2 = Nhân sự có thời gian rảnh trùng giờ
        // 3 = Ứng biến còn lại
        // 4 = Nhân sự còn lại
        const is_registered_free = overlap_slots.every(
            (sl) => m.availability[`${day}|${sl}`] === true,
        );
        let priority = 4;
        let label = "👥 Nhân sự còn lại";
        let category = "other_members";

        if (is_registered_free && m.is_standby) {
            priority = 1;
            label = "🌟 Ứng biến có thời gian rảnh trùng giờ";
            category = "standby_free";
        } else if (is_registered_free) {
            priority = 2;
            label = "⏰ Nhân sự có thời gian rảnh trùng giờ";
            category = "member_free";
        } else if (m.is_standby) {
            priority = 3;
            label = "🛡️ Ứng biến còn lại";
            category = "standby_other";
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
            category: category,
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

app.post("/api/contingency/log-incident", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const data = req.body || {};
    const shift_id = data.shift_id;
    const absent_member_id = data.absent_member_id;
    const replacement_member_id = data.replacement_member_id;
    const status_type = data.status_type || "Vắng không phép"; // 'Có mặt', 'Đi trễ', 'Mất tập trung', 'Bỏ quầy', 'Vắng không phép', 'Vắng đột xuất', 'Xin nghỉ trước'
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

    const isAbsentStatus =
        status_type === "Vắng không phép" ||
        status_type === "Vắng đột xuất" ||
        status_type === "Vắng mặt" ||
        status_type === "Xin nghỉ trước" ||
        status_type === "Hủy ca" ||
        status_type.includes("Vắng");

    if (rep_m) {
        const alreadyHasRep = (target_shift.assigned_members || []).some(
            (m: any) => m.member_id === rep_m.member_id,
        );
        if (!alreadyHasRep) {
            target_shift.assigned_members.push({
                member_id: rep_m.member_id,
                name: rep_m.name,
                department: rep_m.department,
                residence: rep_m.residence,
                vehicle: rep_m.vehicle,
                job: rep_m.job,
                school: rep_m.school,
                phone: rep_m.phone,
                role: "Dự phòng",
                position_role: "Phục vụ / Giao hàng",
                is_standby: rep_m.is_standby,
                is_committed: false,
            });
        }
        target_shift.assigned_count = target_shift.assigned_members.length;
        target_shift.chinh_assigned_count = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.role === "Chính").length;
        target_shift.dp_assigned_count = (
            target_shift.assigned_members || []
        ).filter((m: any) => m.role !== "Chính").length;
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

    const resp_time =
        data.response_time !== undefined && data.response_time !== null
            ? parseInt(data.response_time, 10)
            : rep_m || replacement_member_id
              ? late_minutes > 0
                  ? late_minutes
                  : Math.floor(Math.random() * 7) + 6
              : null;

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
        response_time: resp_time,
        note: note,
        timestamp: timestamp,
        week: currentWeekTag(),
    };

    INCIDENT_LOGS.unshift(incident_record);

    SCHEDULE_VERSION++;
    if (
        status_type.includes("Không gọi được") ||
        status_type.includes("Không liên lạc được")
    ) {
        addSystemNotification({
            type: "UNREACHABLE_BACKUP",
            title: "🚨 KHẨN CẤP: Không Gọi Được Dự Phòng!",
            message: `Ca ${shift_id} (${target_shift.day} - ${target_shift.slot}): Không liên lạc được dự phòng ${rep_m ? rep_m.name : replacement_member_id || ""} thay cho ${absent_m ? absent_m.name : absent_member_id || "thành viên vắng"}. Trưởng ca yêu cầu Admin điều phối ngay!`,
            shift_id: shift_id,
            shift_day: target_shift.day,
            shift_slot: target_shift.slot,
            absent_member_id: absent_member_id,
            absent_member_name: absent_m?.name || "",
            backup_member_id: replacement_member_id,
            backup_member_name: rep_m?.name || "",
            target_role: "admin",
        });
    }

    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    // Compute late / absence summary stats
    const late_logs = INCIDENT_LOGS.filter((i) => i.status_type === "Đi trễ");
    const absent_logs = INCIDENT_LOGS.filter(
        (i) =>
            i.status_type === "Vắng đột xuất" ||
            i.status_type === "Xin nghỉ trước" ||
            i.status_type === "Vắng không phép" ||
            i.status_type === "Vắng mặt" ||
            i.status_type.includes("Vắng"),
    );

    res.json({
        success: true,
        message: `Đã ghi nhận dữ liệu điểm danh '${status_type}' thành công!`,
        incident: incident_record,
        incidents: INCIDENT_LOGS,
        schedule_version: SCHEDULE_VERSION,
        stats: {
            total_incidents: INCIDENT_LOGS.length,
            total_late: late_logs.length,
            total_absent: absent_logs.length,
            replaced_count: INCIDENT_LOGS.filter(
                (i) =>
                    i.replacement_member &&
                    i.replacement_member !== "Không thay thế",
            ).length,
        },
    });
});

app.post("/api/contingency/report-unreachable", async (req, res) => {
    if (!LATEST_SCHEDULE_RESULT) {
        return res
            .status(400)
            .json({ success: false, message: "Chưa có lịch trực" });
    }

    const { shift_id, backup_member_id, absent_member_id, note } =
        req.body || {};
    if (!shift_id) {
        return res
            .status(400)
            .json({ success: false, message: "Thiếu shift_id" });
    }

    const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
        (s: any) => s.shift_id === shift_id,
    );
    if (!target_shift) {
        return res
            .status(404)
            .json({ success: false, message: "Không tìm thấy ca trực" });
    }

    const absent_m = CURRENT_MEMBERS.find(
        (m) => m.member_id === absent_member_id,
    );
    const backup_m = CURRENT_MEMBERS.find(
        (m) => m.member_id === backup_member_id,
    );

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
        status_type: "Vắng mặt (Không gọi được dự phòng)",
        late_minutes: 0,
        absent_member: absent_m
            ? absent_m.name
            : absent_member_id || "Chưa xác định",
        absent_member_id: absent_member_id,
        replacement_member: "Không thay thế",
        replacement_member_id: null,
        response_time: null,
        note:
            note ||
            `Trưởng ca không liên lạc được nhân sự dự phòng ${backup_m ? backup_m.name : backup_member_id || "dự phòng"}, báo cáo Quản Trị Viên điều phối người khác`,
        timestamp: timestamp,
        week: currentWeekTag(),
    };

    INCIDENT_LOGS.unshift(incident_record);

    // Ghi nhận trực tiếp vào lịch sử của ca trực
    if (!target_shift.history) {
        target_shift.history = [];
    }
    target_shift.history.unshift(incident_record);

    // Cập nhật trạng thái thành viên trong ca trực
    if (Array.isArray(target_shift.assigned_members)) {
        target_shift.assigned_members.forEach((m: any) => {
            if (m.member_id === absent_member_id) {
                m.attendance_status = "Vắng không phép";
                m.replacement_status = "Không gọi được dự phòng (Chờ Admin)";
            }
            if (m.member_id === backup_member_id) {
                m.attendance_status = "Không gọi được";
                m.is_unreachable = true;
            }
        });
    }

    // Cập nhật KPI Attendance
    const kpiEntry = KPI_ATTENDANCE.find(
        (k: any) => k.shift_id === shift_id && k.member_id === absent_member_id,
    );
    if (kpiEntry) {
        kpiEntry.status = "Vắng không phép";
    }

    SCHEDULE_VERSION++;
    const urgentNotif = addSystemNotification({
        type: "UNREACHABLE_BACKUP",
        title: "🚨 KHẨN CẤP: Không Gọi Được Dự Phòng!",
        message: `Ca ${shift_id} (${target_shift.day} - ${target_shift.slot}): Không liên lạc được dự phòng ${backup_m ? backup_m.name : backup_member_id || ""} thay cho ${absent_m ? absent_m.name : absent_member_id || "thành viên vắng"}. Trưởng ca yêu cầu Admin điều phối ngay!`,
        shift_id: shift_id,
        shift_day: target_shift.day,
        shift_slot: target_shift.slot,
        absent_member_id: absent_member_id,
        absent_member_name: absent_m?.name || "",
        backup_member_id: backup_member_id,
        backup_member_name: backup_m?.name || "",
        target_role: "admin",
    });

    await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
    persist();

    return res.json({
        success: true,
        message: `Đã ghi nhận sự cố không gọi được dự phòng và gửi thông báo khẩn cấp đến Quản Trị Viên!`,
        incident: incident_record,
        incidents: INCIDENT_LOGS,
        schedule_version: SCHEDULE_VERSION,
        notification: urgentNotif,
        shift: target_shift,
        shift_id: shift_id,
        absent_member_name: absent_m
            ? absent_m.name
            : absent_member_id || "Thành viên vắng",
        backup_member_name: backup_m
            ? backup_m.name
            : backup_member_id || "Nhân sự dự phòng",
    });
});

app.post(
    "/api/contingency/update-replacement",
    requireAdmin,
    async (req, res) => {
        if (!LATEST_SCHEDULE_RESULT) {
            return res
                .status(400)
                .json({ success: false, message: "Chưa có lịch trực" });
        }

        const {
            incident_id,
            timestamp,
            shift_id,
            absent_member,
            replacement_member_id,
            note,
        } = req.body || {};

        let target_incident: any = null;
        if (
            incident_id !== undefined &&
            incident_id !== null &&
            incident_id !== ""
        ) {
            const numId = Number(incident_id);
            target_incident = INCIDENT_LOGS.find(
                (i: any) =>
                    i.id === numId || String(i.id) === String(incident_id),
            );
        } else if (timestamp) {
            target_incident = INCIDENT_LOGS.find(
                (i: any) => i.timestamp === timestamp,
            );
        } else if (shift_id && absent_member) {
            target_incident = INCIDENT_LOGS.find(
                (i: any) =>
                    i.shift_id === shift_id &&
                    i.absent_member === absent_member,
            );
        }

        if (!target_incident) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy bản ghi sự cố cần chỉnh sửa",
            });
        }

        const targetShiftId = target_incident.shift_id;
        const target_shift = LATEST_SCHEDULE_RESULT.assigned_shifts.find(
            (s: any) => s.shift_id === targetShiftId,
        );

        const old_rep_id = target_incident.replacement_member_id;

        if (
            replacement_member_id &&
            replacement_member_id !== "none" &&
            replacement_member_id !== "no_replacement"
        ) {
            const new_rep = CURRENT_MEMBERS.find(
                (m) => m.member_id === replacement_member_id,
            );
            if (!new_rep) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy nhân sự thay thế được chọn",
                });
            }

            target_incident.replacement_member = new_rep.name;
            target_incident.replacement_member_id = new_rep.member_id;
            if (note !== undefined && note !== "") {
                target_incident.note = note;
            }

            if (target_shift) {
                // Remove old replacement from assigned members if present
                if (old_rep_id && old_rep_id !== new_rep.member_id) {
                    target_shift.assigned_members = (
                        target_shift.assigned_members || []
                    ).filter((m: any) => m.member_id !== old_rep_id);
                }
                // Add new replacement if not already in assigned members
                const alreadyAssigned = (
                    target_shift.assigned_members || []
                ).some((m: any) => m.member_id === new_rep.member_id);
                if (!alreadyAssigned) {
                    target_shift.assigned_members.push({
                        member_id: new_rep.member_id,
                        name: new_rep.name,
                        department: new_rep.department,
                        residence: new_rep.residence,
                        vehicle: new_rep.vehicle,
                        job: new_rep.job,
                        school: new_rep.school,
                        phone: new_rep.phone,
                        role: "Dự phòng thay thế",
                        position_role: "⚡ Dự bị tiếp ứng",
                        is_standby: new_rep.is_standby,
                        is_committed: false,
                    });
                }
                target_shift.assigned_count =
                    target_shift.assigned_members.length;
                target_shift.dp_assigned_count = (
                    target_shift.assigned_members || []
                ).filter((m: any) => m.role !== "Chính").length;
            }
        } else {
            // Remove replacement
            target_incident.replacement_member = "Không thay thế";
            target_incident.replacement_member_id = "";
            if (note !== undefined && note !== "") {
                target_incident.note = note;
            }

            if (target_shift && old_rep_id) {
                target_shift.assigned_members = (
                    target_shift.assigned_members || []
                ).filter((m: any) => m.member_id !== old_rep_id);
                target_shift.assigned_count =
                    target_shift.assigned_members.length;
                target_shift.dp_assigned_count = (
                    target_shift.assigned_members || []
                ).filter((m: any) => m.role !== "Chính").length;
            }
        }

        if (target_shift && target_shift.history) {
            const histItem = target_shift.history.find(
                (h: any) =>
                    h.id === target_incident.id ||
                    h.timestamp === target_incident.timestamp,
            );
            if (histItem) {
                histItem.replacement_member =
                    target_incident.replacement_member;
                histItem.replacement_member_id =
                    target_incident.replacement_member_id;
                histItem.note = target_incident.note;
            }
        }

        SCHEDULE_VERSION++;

        // Add notification for staff accounts
        addSystemNotification({
            type: "REPLACEMENT_UPDATED",
            title: "Cập nhật nhân sự thay thế",
            message: `Admin đã điều phối ${target_incident.replacement_member} tiếp ứng cho Ca ${targetShiftId}`,
            shift_id: targetShiftId,
            shift_day: target_shift?.day,
            shift_slot: target_shift?.slot,
            absent_member_id: target_incident.absent_member_id,
            absent_member_name: target_incident.absent_member,
            backup_member_id: target_incident.replacement_member_id,
            backup_member_name: target_incident.replacement_member,
            target_role: "all",
        });

        // Mark any urgent notification for this shift as resolved
        SYSTEM_NOTIFICATIONS.forEach((n) => {
            if (
                n.shift_id === targetShiftId &&
                n.type === "UNREACHABLE_BACKUP"
            ) {
                n.resolved = true;
            }
        });

        await exportScheduleToExcel(LATEST_SCHEDULE_RESULT, REPORT_PATH);
        persist();

        res.json({
            success: true,
            message: `Đã cập nhật nhân sự thay thế cho ca ${targetShiftId} thành công!`,
            incident: target_incident,
            incidents: INCIDENT_LOGS,
            schedule_version: SCHEDULE_VERSION,
            shift: target_shift,
        });
    },
);

app.get("/api/notifications", (req, res) => {
    const role = (req.query.role as string) || "all";
    const since_version = parseInt(req.query.since_version as string, 10) || 0;

    const filtered = SYSTEM_NOTIFICATIONS.filter((n) => {
        if (role === "admin") return true;
        return n.target_role === "all" || n.target_role === "staff";
    });

    res.json({
        success: true,
        notifications: filtered.slice(0, 30),
        schedule_version: SCHEDULE_VERSION,
        has_new_version: SCHEDULE_VERSION > since_version,
        server_time: Date.now(),
    });
});

app.post("/api/notifications/resolve", requireAdmin, (req, res) => {
    const { notification_id, shift_id } = req.body || {};
    if (notification_id) {
        const notif = SYSTEM_NOTIFICATIONS.find(
            (n) => n.id === notification_id,
        );
        if (notif) notif.resolved = true;
    } else if (shift_id) {
        SYSTEM_NOTIFICATIONS.forEach((n) => {
            if (n.shift_id === shift_id) n.resolved = true;
        });
    }
    res.json({ success: true, message: "Đã đánh dấu xử lý thông báo" });
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

app.post("/api/contingency/delete-incident", requireAdmin, (req, res) => {
    const { id, timestamp, shift_id, absent_member } = req.body || {};

    if (id !== undefined && id !== null) {
        const numId = Number(id);
        INCIDENT_LOGS = INCIDENT_LOGS.filter(
            (item: any) => item.id !== numId && String(item.id) !== String(id),
        );
    } else if (timestamp) {
        INCIDENT_LOGS = INCIDENT_LOGS.filter(
            (item: any) => item.timestamp !== timestamp,
        );
    } else if (shift_id && absent_member) {
        INCIDENT_LOGS = INCIDENT_LOGS.filter(
            (item: any) =>
                !(
                    item.shift_id === shift_id &&
                    item.absent_member === absent_member
                ),
        );
    }

    persist();

    const late_logs = INCIDENT_LOGS.filter(
        (i: any) => i.status_type === "Đi trễ",
    );
    const absent_logs = INCIDENT_LOGS.filter(
        (i: any) =>
            i.status_type === "Vắng đột xuất" ||
            i.status_type === "Xin nghỉ trước" ||
            i.status_type === "Vắng không phép" ||
            i.status_type === "Vắng mặt",
    );

    res.json({
        success: true,
        message: "Đã xóa bản ghi thành công!",
        incidents: INCIDENT_LOGS,
        stats: {
            total_incidents: INCIDENT_LOGS.length,
            total_late: late_logs.length,
            total_absent: absent_logs.length,
            replaced_count: INCIDENT_LOGS.filter(
                (i: any) =>
                    i.replacement_member &&
                    i.replacement_member !== "Không thay thế",
            ).length,
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
            week: currentWeekTag(),
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
            (c: any) => c.id !== shift_id && c.name !== target_shift.location,
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
        week: currentWeekTag(),
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
        OPTIMIZER_CONFIG.phong_chinh_count =
            parseInt(data.phong_chinh_count, 10) || 4;
    }
    if (data.phong_dp_count !== undefined) {
        OPTIMIZER_CONFIG.phong_dp_count =
            parseInt(data.phong_dp_count, 10) || 1;
    }
    if (data.min_shifts !== undefined) {
        OPTIMIZER_CONFIG.min_shifts = parseInt(data.min_shifts, 10) || 3;
    }
    if (data.max_shifts !== undefined) {
        OPTIMIZER_CONFIG.max_shifts = parseInt(data.max_shifts, 10) || 5;
    }
    if (data.max_shifts_per_day !== undefined) {
        OPTIMIZER_CONFIG.max_shifts_per_day =
            parseInt(data.max_shifts_per_day, 10) || 2;
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

    const config = {
        start_date: START_DATE,
        min_shifts_per_member: parseInt(
            data.min_shifts || OPTIMIZER_CONFIG.min_shifts || "3",
            10,
        ),
        max_shifts_per_member: parseInt(
            data.max_shifts || OPTIMIZER_CONFIG.max_shifts || "5",
            10,
        ),
        max_shifts_per_day: parseInt(
            data.max_shifts_per_day ||
                OPTIMIZER_CONFIG.max_shifts_per_day ||
                "2",
            10,
        ),
        enable_ca_ngoai: ENABLE_CA_NGOAI,
        custom_ca_ngoai: CUSTOM_CA_NGOAI,
        active_types: ENABLE_CA_NGOAI ? ["Phong", "Ngoai"] : ["Phong"],
        daily_shift_configs: OPTIMIZER_CONFIG.daily_shift_configs,
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
        return res.status(400).json({
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
        return res.status(400).json({
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

/**
 * Bảng xếp hạng thi đua Project F&B.
 *
 * Toàn bộ phép tính được uỷ quyền cho src/competition.ts để giao diện web,
 * file Excel và Google Sheet luôn dùng chung một bộ công thức duy nhất.
 * Response giữ nguyên 4 khoá cũ (best_seller / all_rounder / departments /
 * shift_groups) để giao diện hiện tại không vỡ, đồng thời bổ sung dữ liệu
 * trung gian (mẫu số chuẩn hoá, chi tiết vi phạm, điểm từng tuần…) cho phần
 * hiển thị minh bạch công thức.
 */
app.get("/api/competition/stats", (req, res) => {
    const requested = String(req.query.week || TOTAL_LABEL);
    const isTotal = !COMPETITION_CONFIG.weeks.includes(requested);
    const week = isTotal ? TOTAL_LABEL : requested;

    const input = competitionInput();
    const project = computeProject(input);
    const weekResult = isTotal
        ? null
        : project.weeks.find((w) => w.week === week) ||
          computeWeek(input, week);

    let bestSellerRows: any[];
    let allRounderRows: any[];
    let deptRows: any[];
    let groupRows: any[];

    if (weekResult) {
        // Xem theo tuần: số liệu thuần của tuần đó.
        bestSellerRows = [...weekResult.members]
            .filter((m) => m.individual_sales > 0)
            .sort((a, b) => b.individual_sales - a.individual_sales);
        allRounderRows = [...weekResult.members]
            .filter((m) => m.participated)
            .sort((a, b) => b.total_score - a.total_score);
        deptRows = weekResult.departments;
        groupRows = weekResult.shift_groups;
    } else {
        // TỔNG KẾT 3 tuần: Best Seller cộng dồn sản lượng, All Round lấy
        // trung bình điểm tổng hợp ĐÃ chuẩn hoá của các tuần có tham gia.
        bestSellerRows = project.best_seller_project.map((p) => ({
            member_id: p.member_id,
            name: p.name,
            department: p.department,
            individual_sales: p.total_individual_sales,
            individual_revenue: p.total_individual_revenue,
            shifts_participated: p.total_shifts,
            weeks_counted: p.weeks_counted,
            week_scores: p.week_scores,
        }));
        allRounderRows = project.all_round_project.map((p) => ({
            member_id: p.member_id,
            name: p.name,
            department: p.department,
            individual_sales: p.total_individual_sales,
            equivalent_sales: p.total_equivalent_sales,
            shifts_participated: p.total_shifts,
            weeks_counted: p.weeks_counted,
            week_scores: p.week_scores,
            reputation: p.avg_reputation,
            sales_score: p.avg_sales_score,
            prod_score: p.avg_prod_score,
            rep_score: p.avg_rep_score,
            total_score: p.avg_total_score,
        }));
        deptRows = project.departments;
        // Giải nhóm trực ca không cộng dồn qua các tuần: chỉ liệt kê podium mỗi tuần.
        groupRows = project.weekly_podiums.reduce(
            (acc: any[], p) =>
                acc.concat(p.groups.map((g) => ({ ...g, week: p.week }))),
            [],
        );
    }
    res.json({
        success: true,
        week,
        is_total: isTotal,
        locked: weekResult ? weekResult.locked : false,

        // --- Khoá cũ: giữ nguyên hình dạng cho giao diện hiện tại ---------
        best_seller: bestSellerRows.slice(0, 20),
        all_rounder: allRounderRows.slice(0, 30),
        departments: deptRows,
        shift_groups: groupRows
            .filter((g: any) => g.member_count > 0)
            .slice(0, 24),

        // --- Dữ liệu mở rộng: minh bạch công thức ------------------------
        config: {
            active_week: COMPETITION_CONFIG.active_week,
            weeks: COMPETITION_CONFIG.weeks,
            total_label: TOTAL_LABEL,
            base_reputation: COMPETITION_CONFIG.base_reputation,
            penalties: COMPETITION_CONFIG.penalties,
            weights: COMPETITION_CONFIG.weights,
            locked_weeks: COMPETITION_CONFIG.locked_weeks,
            exclude_absent_from_shift_count:
                COMPETITION_CONFIG.exclude_absent_from_shift_count,
        },
        awards: weekResult
            ? {
                  best_seller: weekResult.best_seller,
                  all_rounder: weekResult.all_rounder,
                  podium: weekResult.podium,
              }
            : {
                  best_seller: project.best_seller_project[0] || null,
                  all_rounder: project.all_round_project[0] || null,
                  podium: [],
              },
        week_detail: weekResult,
        week_summaries: project.weeks.map((w) => ({
            week: w.week,
            locked: w.locked,
            totals: w.totals,
            best_seller: w.best_seller
                ? {
                      name: w.best_seller.name,
                      value: w.best_seller.individual_sales,
                  }
                : null,
            all_rounder: w.all_rounder
                ? { name: w.all_rounder.name, value: w.all_rounder.total_score }
                : null,
            podium: w.podium.map((g) => ({
                shift_id: g.shift_id,
                label: g.label,
                total_score: g.total_score,
            })),
        })),
        project: {
            best_seller: project.best_seller_project,
            all_round: project.all_round_project,
            departments: project.departments,
            weekly_podiums: project.weekly_podiums,
            totals: project.totals,
        },
        totals: weekResult ? weekResult.totals : project.totals,
        formulas: describeFormulas(COMPETITION_CONFIG),
    });
});
app.post("/api/competition/seed", (req, res) => {
    // Xóa dữ liệu mẫu cũ (nếu có)
    for (let i = SALES_LOGS.length - 1; i >= 0; i--) {
        if (SALES_LOGS[i].id.startsWith("TX_MOCK_")) SALES_LOGS.splice(i, 1);
    }
    for (let i = INCIDENT_LOGS.length - 1; i >= 0; i--) {
        if (INCIDENT_LOGS[i].id.startsWith("INC_MOCK_"))
            INCIDENT_LOGS.splice(i, 1);
    }

    const shiftsToUse =
        LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts
            ? LATEST_SCHEDULE_RESULT.assigned_shifts
            : [];

    if (shiftsToUse.length === 0) {
        return res.json({
            success: false,
            message:
                "Chưa có lịch trực. Vui lòng xếp lịch tự động (OR-Tools) trước khi tạo dữ liệu mẫu.",
        });
    }

    // Lặp qua tất cả các ca trực đã xếp để tạo doanh số thực tế cho từng ca
    shiftsToUse.forEach((shift: any, index: number) => {
        const assignedMembers = shift.assigned_members || [];
        if (assignedMembers.length === 0) return;

        // Mô phỏng 1 ca có từ 2 đến 10 đơn hàng
        const numOrders = Math.floor(Math.random() * 8) + 2;

        for (let i = 0; i < numOrders; i++) {
            // Chọn ngẫu nhiên 1 người bán trong ca
            const seller =
                assignedMembers[
                    Math.floor(Math.random() * assignedMembers.length)
                ].name;
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
                week: weekStr,
            });
        }

        // Thi thoảng tạo lỗi vi phạm (Đi trễ, Mất tập trung, Bỏ quầy, Vắng không phép)
        if (Math.random() < 0.2) {
            // 20% xác suất có lỗi trong ca
            const badMember =
                assignedMembers[
                    Math.floor(Math.random() * assignedMembers.length)
                ];
            const violationTypes = [
                "Đi trễ",
                "Mất tập trung",
                "Bỏ quầy",
                "Vắng không phép",
            ];
            const chosenViolation =
                violationTypes[
                    Math.floor(Math.random() * violationTypes.length)
                ];
            const randomWeekIndex = Math.floor(Math.random() * 3) + 1;
            const hasBackup = Math.random() < 0.6;
            INCIDENT_LOGS.push({
                id: `INC_MOCK_${Date.now()}_${index}`,
                shift_id: shift.shift_id,
                member: badMember.name,
                absent_member: badMember.name,
                absent_member_id: badMember.member_id,
                replacement_member: hasBackup
                    ? "Dự phòng tiếp ứng"
                    : "Không thay thế",
                replacement_member_id: hasBackup ? "MEM_DP_MOCK" : null,
                response_time: hasBackup
                    ? Math.floor(Math.random() * 8) + 6
                    : null,
                status_type: chosenViolation,
                note: `Vi phạm mẫu: ${chosenViolation}`,
                week: `Tuần ${randomWeekIndex}`,
                timestamp: `0${randomWeekIndex}/09/2026 10:00`,
            });
        }
    });

    persist();
    res.json({
        success: true,
        message:
            "Đã tạo dữ liệu giao dịch bán hàng và vi phạm thực tế cho các ca trực.",
    });
});

/* ==========================================================================
   THI ĐUA PROJECT F&B — CẤU HÌNH, CHỐT TUẦN & ĐỒNG BỘ GOOGLE SHEET
   ========================================================================== */

/** Che token khi trả cấu hình cho client chưa đăng nhập Admin. */
function publicCompetitionConfig(req: express.Request) {
    const admin = isValidAdmin(req);
    const { sheet, snapshots, ...rest } = COMPETITION_CONFIG;
    return {
        ...rest,
        total_label: TOTAL_LABEL,
        snapshot_weeks: Object.keys(snapshots || {}),
        sheet: {
            enabled: sheet.enabled,
            url: sheet.url,
            sheet_id: sheet.sheet_id,
            public_base_url: sheet.public_base_url,
            auto_interval_min: sheet.auto_interval_min,
            last_push_at: sheet.last_push_at,
            last_pull_at: sheet.last_pull_at,
            last_pull_summary: sheet.last_pull_summary,
            gid_map: admin ? sheet.gid_map || {} : {},
            token: admin ? sheet.token : "",
            has_token: !!sheet.token,
        },
    };
}

app.get("/api/competition/config", (req, res) => {
    res.json({ success: true, config: publicCompetitionConfig(req) });
});

/**
 * Cập nhật quy chế: tuần đang chạy, điểm uy tín khởi điểm, bảng điểm trừ,
 * trọng số từng hạng mục và thông tin Google Sheet. Chỉ Admin được sửa vì
 * đây là dữ liệu quyết định thắng/thua của giải.
 */
app.post("/api/competition/config", requireAdmin, (req, res) => {
    const body = req.body || {};
    const cfg = COMPETITION_CONFIG;

    if (
        typeof body.active_week === "string" &&
        cfg.weeks.includes(body.active_week)
    ) {
        cfg.active_week = body.active_week;
    }
    if (Array.isArray(body.weeks) && body.weeks.length > 0) {
        cfg.weeks = body.weeks
            .map((w: any) => String(w).trim())
            .filter(Boolean);
        if (!cfg.weeks.includes(cfg.active_week))
            cfg.active_week = cfg.weeks[0];
    }
    const base = Number(body.base_reputation);
    if (Number.isFinite(base) && base > 0) cfg.base_reputation = base;

    if (body.penalties && typeof body.penalties === "object") {
        const next: { [k: string]: number } = {};
        Object.keys(body.penalties).forEach((k) => {
            const key = String(k).trim();
            const val = Number(body.penalties[k]);
            if (key && Number.isFinite(val) && val >= 0) next[key] = val;
        });
        if (Object.keys(next).length > 0) cfg.penalties = next;
    }
    if (Array.isArray(body.absence_types)) {
        cfg.absence_types = body.absence_types
            .map((t: any) => String(t).trim())
            .filter(Boolean);
    }
    if (typeof body.exclude_absent_from_shift_count === "boolean") {
        cfg.exclude_absent_from_shift_count =
            body.exclude_absent_from_shift_count;
    }
    if (body.weights && typeof body.weights === "object") {
        Object.keys(cfg.weights).forEach((k) => {
            const val = Number((body.weights as any)[k]);
            if (Number.isFinite(val) && val >= 0) (cfg.weights as any)[k] = val;
        });
    }
    if (body.sheet && typeof body.sheet === "object") {
        const s = body.sheet;
        if (typeof s.enabled === "boolean") cfg.sheet.enabled = s.enabled;
        if (typeof s.url === "string") {
            cfg.sheet.url = s.url.trim();
            const m = cfg.sheet.url.match(
                /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
            );
            if (m) cfg.sheet.sheet_id = m[1];
        }
        if (typeof s.sheet_id === "string" && s.sheet_id.trim())
            cfg.sheet.sheet_id = s.sheet_id.trim();
        if (typeof s.public_base_url === "string") {
            cfg.sheet.public_base_url = s.public_base_url
                .trim()
                .replace(/\/+$/, "");
        }
        if (s.gid_map && typeof s.gid_map === "object")
            cfg.sheet.gid_map = s.gid_map;
        const iv = Number(s.auto_interval_min);
        if (Number.isFinite(iv) && iv >= 0) cfg.sheet.auto_interval_min = iv;
        if (s.rotate_token === true)
            cfg.sheet.token = crypto.randomBytes(18).toString("base64url");
    }

    persist();
    res.json({
        success: true,
        config: publicCompetitionConfig(req),
        message: "Đã lưu quy chế thi đua.",
    });
});

/**
 * "Chốt tuần": lưu ảnh chụp bảng xếp hạng của tuần rồi khoá lại và chuyển
 * sang tuần kế tiếp. KHÔNG xoá bất kỳ dữ liệu nguồn nào — HR vẫn cần đủ 3
 * tuần để xét các giải TỔNG KẾT; việc "reset" chỉ là reset bảng hiển thị tuần.
 */
app.post("/api/competition/close-week", requireAdmin, (req, res) => {
    const week = String(
        (req.body && req.body.week) || COMPETITION_CONFIG.active_week,
    );
    if (!COMPETITION_CONFIG.weeks.includes(week)) {
        return res
            .status(400)
            .json({ success: false, message: `Tuần không hợp lệ: ${week}` });
    }
    const result = computeWeek(competitionInput(), week);
    COMPETITION_CONFIG.snapshots[week] = {
        week,
        closed_at: new Date().toLocaleString("vi-VN"),
        best_seller: result.best_seller,
        all_rounder: result.all_rounder,
        podium: result.podium,
        members: result.members.filter((m) => m.participated),
        shift_groups: result.shift_groups,
        departments: result.departments,
        totals: result.totals,
    };
    if (!COMPETITION_CONFIG.locked_weeks.includes(week)) {
        COMPETITION_CONFIG.locked_weeks.push(week);
    }
    // Chuyển con trỏ sang tuần chưa chốt gần nhất.
    const nextWeek = COMPETITION_CONFIG.weeks.find(
        (w) => !COMPETITION_CONFIG.locked_weeks.includes(w),
    );
    COMPETITION_CONFIG.active_week =
        nextWeek ||
        COMPETITION_CONFIG.weeks[COMPETITION_CONFIG.weeks.length - 1];

    persist();
    res.json({
        success: true,
        message: nextWeek
            ? `Đã chốt ${week}. Bảng xếp hạng tuần được lưu lại, dữ liệu nguồn giữ nguyên. Tuần đang chạy: ${nextWeek}.`
            : `Đã chốt ${week}. Cả 3 tuần đã hoàn tất — có thể xét các giải TỔNG KẾT.`,
        active_week: COMPETITION_CONFIG.active_week,
        all_closed: !nextWeek,
        snapshot: COMPETITION_CONFIG.snapshots[week],
    });
});

/** Mở lại tuần đã chốt (khi HR phát hiện dữ liệu cần bổ sung). */
app.post("/api/competition/reopen-week", requireAdmin, (req, res) => {
    const week = String((req.body && req.body.week) || "");
    if (!COMPETITION_CONFIG.weeks.includes(week)) {
        return res
            .status(400)
            .json({ success: false, message: `Tuần không hợp lệ: ${week}` });
    }
    COMPETITION_CONFIG.locked_weeks = COMPETITION_CONFIG.locked_weeks.filter(
        (w) => w !== week,
    );
    COMPETITION_CONFIG.active_week = week;
    persist();
    res.json({
        success: true,
        message: `Đã mở lại ${week} để cập nhật dữ liệu.`,
        active_week: week,
    });
});

/** Ảnh chụp bảng xếp hạng đã chốt của một tuần. */
app.get("/api/competition/snapshot", (req, res) => {
    const week = String(req.query.week || "");
    const snap = COMPETITION_CONFIG.snapshots[week];
    if (!snap)
        return res
            .status(404)
            .json({ success: false, message: `Chưa chốt ${week}.` });
    res.json({ success: true, snapshot: snap });
});
/* --------------------------------------------------------------------------
   ĐỒNG BỘ GOOGLE SHEET
   Bảo mật: mọi endpoint dưới đây là endpoint công khai trên mạng, chỉ được
   bảo vệ bằng token bí mật (?token= hoặc header x-sheet-token). Ai có token
   đọc/ghi được số liệu thi đua — đừng dán token vào nơi công khai, và dùng
   nút "Đổi token" khi nghi ngờ bị lộ.
   -------------------------------------------------------------------------- */

function sheetTokenOk(req: express.Request): boolean {
    const expected = COMPETITION_CONFIG.sheet.token || "";
    if (!expected) return false;
    const raw =
        req.query.token ||
        req.headers["x-sheet-token"] ||
        (req.body && req.body.token);
    const got = typeof raw === "string" ? raw : "";
    if (got.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    } catch {
        return false;
    }
}

function requireSheetToken(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) {
    if (isValidAdmin(req)) return next();
    if (!sheetTokenOk(req)) {
        return res.status(401).json({
            success: false,
            message: "Token đồng bộ Sheet không hợp lệ.",
        });
    }
    // Công tắc "Bật đồng bộ Google Sheet" phải thực sự đóng cửa: khi HR tắt nó,
    // token cũng không đọc/ghi được số liệu nữa (chỉ Admin đăng nhập mới xem).
    if (!COMPETITION_CONFIG.sheet.enabled) {
        return res.status(403).json({
            success: false,
            message:
                "Đồng bộ Google Sheet đang tắt. Bật lại ở tab Thi Đua → Google Sheet.",
        });
    }
    return next();
}

function currentSheetTables() {
    const input = competitionInput();
    return buildSheetTables(input, computeProject(input));
}

/** Toàn bộ bảng dưới dạng JSON — Apps Script gọi endpoint này để ghi vào Sheet. */
app.get("/api/competition/sheet/json", requireSheetToken, (req, res) => {
    const tables = currentSheetTables();
    COMPETITION_CONFIG.sheet.last_push_at = new Date().toLocaleString("vi-VN");
    res.json({
        success: true,
        generated_at: COMPETITION_CONFIG.sheet.last_push_at,
        active_week: COMPETITION_CONFIG.active_week,
        tables,
    });
});

/**
 * Một tab dưới dạng CSV. Dùng trực tiếp trong Google Sheet:
 *   =IMPORTDATA("https://<host>/api/competition/sheet/csv?tab=tong_quan&token=<token>")
 */
app.get("/api/competition/sheet/csv", requireSheetToken, (req, res) => {
    const want = String(req.query.tab || "tong_quan")
        .trim()
        .toLowerCase();
    const tables = currentSheetTables();
    const table = tables.find(
        (t) => t.key === want || t.name.toLowerCase() === want,
    );
    if (!table) {
        return res
            .status(404)
            .type("text/plain; charset=utf-8")
            .send(
                `Không có tab "${want}". Các tab: ${tables.map((t) => t.key).join(", ")}`,
            );
    }
    COMPETITION_CONFIG.sheet.last_push_at = new Date().toLocaleString("vi-VN");
    res.setHeader("Cache-Control", "no-store");
    // BOM để Google Sheet/Excel đọc đúng tiếng Việt.
    res.type("text/csv; charset=utf-8").send("﻿" + tableToCsv(table));
});

/** Danh mục tab (để dựng công thức IMPORTDATA trong giao diện). */
app.get("/api/competition/sheet/tabs", (req, res) => {
    res.json({
        success: true,
        tabs: currentSheetTables().map((t) => ({
            key: t.key,
            name: t.name,
            note: (t as any).note || "",
            columns: t.headers.length,
            rows: t.rows.length,
        })),
    });
});

const SHEET_SALE_PREFIX = "TX_SHEET_";
const SHEET_INCIDENT_PREFIX = "INC_SHEET_";

/**
 * Chiều Sheet → App. Nhận nội dung 2 tab nhập liệu và thay thế toàn bộ bản
 * ghi có nguồn gốc từ Sheet (nên gọi lại nhiều lần vẫn cho cùng kết quả,
 * không sinh dữ liệu trùng). Dữ liệu nhập trong app không bị ảnh hưởng.
 */
function ingestSheetRows(sales: any[], violations: any[]) {
    const weeks = COMPETITION_CONFIG.weeks;
    const pickWeek = (raw: any) => {
        const w = String(raw || "").trim();
        return weeks.includes(w) ? w : COMPETITION_CONFIG.active_week;
    };
    const stamp = new Date().toLocaleString("vi-VN");

    for (let i = SALES_LOGS.length - 1; i >= 0; i--) {
        if (String(SALES_LOGS[i].id || "").startsWith(SHEET_SALE_PREFIX))
            SALES_LOGS.splice(i, 1);
    }
    for (let i = INCIDENT_LOGS.length - 1; i >= 0; i--) {
        if (String(INCIDENT_LOGS[i].id || "").startsWith(SHEET_INCIDENT_PREFIX))
            INCIDENT_LOGS.splice(i, 1);
    }

    let salesAdded = 0;
    let skipped = 0;
    (Array.isArray(sales) ? sales : []).forEach((row, idx) => {
        const sellerName = String(row.seller || row["Người bán"] || "").trim();
        const qty = Number(
            row.quantity !== undefined ? row.quantity : row["Số lượng"],
        );
        if (!sellerName || !Number.isFinite(qty) || qty <= 0) {
            skipped += 1;
            return;
        }
        const member = CURRENT_MEMBERS.find(
            (m) => m.name.trim().toLowerCase() === sellerName.toLowerCase(),
        );
        if (!member) {
            skipped += 1;
            return;
        }
        const price =
            Number(
                row.unit_price !== undefined ? row.unit_price : row["Đơn giá"],
            ) || 0;
        SALES_LOGS.push({
            id: `${SHEET_SALE_PREFIX}${idx}_${Date.now()}`,
            timestamp: stamp,
            product_id: "SHEET",
            product_name: String(
                row.product || row["Sản phẩm"] || "Nhập từ Sheet",
            ),
            quantity: qty,
            unit_price: price,
            total_amount: qty * price,
            channel: String(row.channel || row["Kênh"] || "Nhập từ Sheet"),
            seller: member.name,
            shift_id:
                String(row.shift_id || row["Mã ca"] || "").trim() || undefined,
            note: String(row.note || row["Ghi chú"] || ""),
            week: pickWeek(row.week || row["Tuần"]),
        } as any);
        salesAdded += 1;
    });

    let incidentsAdded = 0;
    (Array.isArray(violations) ? violations : []).forEach((row, idx) => {
        const name = String(row.member || row["Thành viên"] || "").trim();
        const type = String(
            row.status_type || row["Loại vi phạm"] || "",
        ).trim();
        if (!name || !type) {
            skipped += 1;
            return;
        }
        const member = CURRENT_MEMBERS.find(
            (m) => m.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (!member) {
            skipped += 1;
            return;
        }
        INCIDENT_LOGS.push({
            id: `${SHEET_INCIDENT_PREFIX}${idx}_${Date.now()}`,
            shift_id: String(row.shift_id || row["Mã ca"] || "").trim(),
            member: member.name,
            absent_member: member.name,
            absent_member_id: member.member_id,
            status_type: type,
            note: String(row.note || row["Ghi chú"] || "Nhập từ Google Sheet"),
            week: pickWeek(row.week || row["Tuần"]),
            timestamp: stamp,
        });
        incidentsAdded += 1;
    });

    const summary = `Nhận ${salesAdded} dòng bán hàng, ${incidentsAdded} dòng vi phạm${skipped ? `, bỏ qua ${skipped} dòng không hợp lệ` : ""}.`;
    COMPETITION_CONFIG.sheet.last_pull_at = stamp;
    COMPETITION_CONFIG.sheet.last_pull_summary = summary;
    persist();
    return { salesAdded, incidentsAdded, skipped, summary };
}

app.post("/api/competition/sheet/ingest", requireSheetToken, (req, res) => {
    const body = req.body || {};
    const result = ingestSheetRows(
        body.sales || body.NHAP_BAN_HANG,
        body.violations || body.NHAP_VI_PHAM,
    );
    res.json({ success: true, ...result, message: result.summary });
});
/** Đọc CSV (kể cả ô có dấu phẩy/ngoặc kép) thành danh sách object theo header. */
function csvToObjects(text: string): any[] {
    const clean = text.replace(/^﻿/, "");
    const wb = xlsx.read(clean, { type: "string", raw: false });
    const first = wb.SheetNames[0];
    if (!first) return [];
    return xlsx.utils.sheet_to_json(wb.Sheets[first], { defval: "" }) as any[];
}

const publishedCsvUrl = (sheetId: string, gid: string) =>
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid || "0")}`;

/**
 * App tự tải 2 tab nhập liệu từ Google Sheet (Sheet phải được chia sẻ
 * "Anyone with the link"). Cần gid của từng tab trong cấu hình gid_map.
 */
app.post("/api/competition/sheet/pull", requireAdmin, async (req, res) => {
    const sheet = COMPETITION_CONFIG.sheet;
    const sheetId = String(
        (req.body && req.body.sheet_id) || sheet.sheet_id || "",
    ).trim();
    if (!sheetId) {
        return res.status(400).json({
            success: false,
            message:
                "Chưa có Sheet ID. Dán link Google Sheet vào phần cấu hình trước.",
        });
    }
    const gidSales = String(
        (req.body && req.body.gid_sales) ||
            sheet.gid_map["nhap_ban_hang"] ||
            "",
    );
    const gidViolations = String(
        (req.body && req.body.gid_violations) ||
            sheet.gid_map["nhap_vi_pham"] ||
            "",
    );
    if (!gidSales && !gidViolations) {
        return res.status(400).json({
            success: false,
            message:
                "Chưa có gid của tab NHAP_BAN_HANG / NHAP_VI_PHAM (số sau #gid= trên URL của tab).",
        });
    }

    try {
        const fetchTab = async (gid: string) => {
            if (!gid) return [];
            const r = await fetch(publishedCsvUrl(sheetId, gid), {
                redirect: "follow",
            });
            if (!r.ok)
                throw new Error(
                    `Không tải được tab gid=${gid} (HTTP ${r.status}).`,
                );
            return csvToObjects(await r.text());
        };
        const [salesRows, violationRows] = await Promise.all([
            fetchTab(gidSales),
            fetchTab(gidViolations),
        ]);
        const result = ingestSheetRows(salesRows, violationRows);
        res.json({ success: true, ...result, message: result.summary });
    } catch (err: any) {
        res.status(502).json({
            success: false,
            message: `Lỗi khi tải Google Sheet: ${err && err.message ? err.message : err}. Kiểm tra Sheet đã chia sẻ công khai chưa.`,
        });
    }
});

/** Xuất toàn bộ bảng thi đua ra một file Excel nhiều sheet. */
app.get("/api/competition/export-excel", (req, res) => {
    const tables = currentSheetTables();
    const wb = xlsx.utils.book_new();
    tables.forEach((t) => {
        const aoa: any[][] = [];
        if ((t as any).note) aoa.push([(t as any).note]);
        aoa.push(t.headers);
        t.rows.forEach((r) => aoa.push(r));
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        ws["!cols"] = t.headers.map((h) => ({
            wch: Math.max(12, Math.min(38, String(h).length + 6)),
        }));
        // Tên sheet trong Excel tối đa 31 ký tự.
        xlsx.utils.book_append_sheet(wb, ws, t.name.slice(0, 31));
    });
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="ThiDua_ProjectFnB_${stamp}.xlsx"`,
    );
    res.type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ).send(buf);
});

/**
 * Sinh mã Apps Script đã điền sẵn URL + token để dán vào Google Sheet
 * (Extensions → Apps Script). Chỉ Admin xem được vì có chứa token.
 */
app.get("/api/competition/sheet/appscript", requireAdmin, (req, res) => {
    const sheet = COMPETITION_CONFIG.sheet;
    const base =
        sheet.public_base_url ||
        `${req.protocol}://${req.get("host") || `localhost:${PORT}`}`;
    const tabs = currentSheetTables();
    const outputTabs = tabs
        .filter((t) => !t.key.startsWith("nhap_"))
        .map((t) => t.name);
    const code = renderAppsScript(
        base.replace(/\/+$/, ""),
        sheet.token,
        outputTabs,
    );
    if (String(req.query.download || "") === "1") {
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="CompetitionSync.gs"',
        );
    }
    res.type("text/plain; charset=utf-8").send(code);
});

app.get("/api/competition/sheet/instructions", requireAdmin, (req, res) => {
    const sheet = COMPETITION_CONFIG.sheet;
    const base =
        sheet.public_base_url ||
        `${req.protocol}://${req.get("host") || `localhost:${PORT}`}`;
    const clean = base.replace(/\/+$/, "");
    res.json({
        success: true,
        base_url: clean,
        token: sheet.token,
        local_warning: /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(clean)
            ? "App đang chạy nội bộ nên Google không truy cập được. Muốn đồng bộ tự động, hãy deploy app ra Internet rồi điền URL công khai vào ô bên dưới."
            : "",
        importdata: currentSheetTables()
            .filter((t) => !t.key.startsWith("nhap_"))
            .map((t) => ({
                tab: t.name,
                formula: `=IMPORTDATA("${clean}/api/competition/sheet/csv?tab=${t.key}&token=${sheet.token}")`,
            })),
        endpoints: {
            json: `${clean}/api/competition/sheet/json?token=${sheet.token}`,
            csv: `${clean}/api/competition/sheet/csv?tab=<tab>&token=${sheet.token}`,
            ingest: `${clean}/api/competition/sheet/ingest`,
        },
    });
});

// App Start
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    // Run bootstrap
    bootstrapState();
    checkAndExpirePickupRequests();
});
