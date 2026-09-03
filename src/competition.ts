/* ==========================================================================
   THI ĐUA PROJECT F&B — BỘ MÁY TÍNH ĐIỂM (Competition Engine)

   Toàn bộ công thức xét giải được tập trung tại file này để:
     · Giao diện, file Excel và Google Sheet luôn dùng CHUNG một nguồn số.
     · Có thể kiểm thử độc lập (tests/competition.test.ts).

   CHU KỲ: 3 tuần. Mỗi tuần tổng kết & reset BẢNG XẾP HẠNG (không xoá dữ liệu
   gốc) → tuần 3 chốt dữ liệu để xét giải Tổng Kết.

   THANG ĐIỂM
     · Cá nhân  (Toàn diện) = Sản lượng 40 + Năng suất 40 + Uy tín 20  = 100
     · Nhóm ca              = Sản lượng 70 + Uy tín 30                = 100
     · Tập thể Ban          = Sản lượng 40 + Hiệu suất 40 + Uy tín 20 = 100
   ========================================================================== */

import { Member } from "./data_loader";

export const DEFAULT_WEEKS = ["Tuần 1", "Tuần 2", "Tuần 3"];
export const TOTAL_LABEL = "TỔNG KẾT";

/** Điểm trừ uy tín theo từng loại vi phạm (có thể sửa trong giao diện). */
export const DEFAULT_PENALTIES: { [type: string]: number } = {
    "Đi trễ": 5,
    "Vắng không phép": 20,
    "Sử dụng điện thoại khi có khách": 5,
    "Mất tập trung": 5,
    "Bỏ quầy": 5,
    "Vắng đột xuất": 20,
    "Vắng mặt": 20,
    "Vắng mặt (Không gọi được dự phòng)": 20,
    "Xin nghỉ trước": 0,
    "Hủy ca": 0,
    "Có mặt": 0,
};

/** Các loại ghi nhận đồng nghĩa với "không thực sự trực ca". */
export const DEFAULT_ABSENCE_TYPES = [
    "Vắng không phép",
    "Vắng đột xuất",
    "Vắng mặt",
    "Vắng mặt (Không gọi được dự phòng)",
    "Xin nghỉ trước",
    "Hủy ca",
];

export interface CompetitionWeights {
    ind_sales: number;
    ind_prod: number;
    ind_rep: number;
    grp_sales: number;
    grp_rep: number;
    dept_sales: number;
    dept_prod: number;
    dept_rep: number;
}

export const DEFAULT_WEIGHTS: CompetitionWeights = {
    ind_sales: 40,
    ind_prod: 40,
    ind_rep: 20,
    grp_sales: 70,
    grp_rep: 30,
    dept_sales: 40,
    dept_prod: 40,
    dept_rep: 20,
};

export interface SheetSyncConfig {
    enabled: boolean;
    /** Chuỗi bí mật bắt buộc cho mọi endpoint đồng bộ Sheet. */
    token: string;
    /** Link Google Sheet do người dùng dán vào (dùng cho chiều Sheet → App). */
    url: string;
    sheet_id: string;
    /** gid của từng tab dùng cho chiều Sheet → App (tab nhập liệu). */
    gid_map: { [tab: string]: string };
    /** URL công khai của app, dùng để sinh công thức IMPORTDATA & Apps Script. */
    public_base_url: string;
    auto_interval_min: number;
    last_push_at: string;
    last_pull_at: string;
    last_pull_summary: string;
}

export interface CompetitionConfig {
    active_week: string;
    weeks: string[];
    base_reputation: number;
    penalties: { [type: string]: number };
    absence_types: string[];
    /** Không tính ca cho thành viên bị ghi nhận vắng ca đó. */
    exclude_absent_from_shift_count: boolean;
    weights: CompetitionWeights;
    /** Các tuần đã "chốt" (khoá bảng xếp hạng tuần). */
    locked_weeks: string[];
    /** Ảnh chụp bảng xếp hạng tại thời điểm chốt tuần. */
    snapshots: { [week: string]: any };
    sheet: SheetSyncConfig;
}

export function makeDefaultCompetitionConfig(token = ""): CompetitionConfig {
    return {
        active_week: DEFAULT_WEEKS[0],
        weeks: [...DEFAULT_WEEKS],
        base_reputation: 100,
        penalties: { ...DEFAULT_PENALTIES },
        absence_types: [...DEFAULT_ABSENCE_TYPES],
        exclude_absent_from_shift_count: true,
        weights: { ...DEFAULT_WEIGHTS },
        locked_weeks: [],
        snapshots: {},
        sheet: {
            enabled: false,
            token: token,
            url: "",
            sheet_id: "",
            gid_map: {},
            public_base_url: "",
            auto_interval_min: 5,
            last_push_at: "",
            last_pull_at: "",
            last_pull_summary: "",
        },
    };
}

/** Ghép cấu hình đã lưu với mặc định (tránh lỗi khi nâng cấp phiên bản). */
export function normalizeCompetitionConfig(saved: any, token = ""): CompetitionConfig {
    const base = makeDefaultCompetitionConfig(token);
    if (!saved || typeof saved !== "object") return base;
    const weeks = Array.isArray(saved.weeks) && saved.weeks.length > 0 ? saved.weeks.map(String) : base.weeks;
    return {
        active_week: weeks.includes(saved.active_week) ? saved.active_week : weeks[0],
        weeks,
        base_reputation: Number(saved.base_reputation) > 0 ? Number(saved.base_reputation) : 100,
        penalties: { ...base.penalties, ...(saved.penalties || {}) },
        absence_types: Array.isArray(saved.absence_types) && saved.absence_types.length > 0
            ? saved.absence_types.map(String)
            : base.absence_types,
        exclude_absent_from_shift_count: saved.exclude_absent_from_shift_count !== false,
        weights: { ...base.weights, ...(saved.weights || {}) },
        locked_weeks: Array.isArray(saved.locked_weeks) ? saved.locked_weeks.map(String) : [],
        snapshots: saved.snapshots && typeof saved.snapshots === "object" ? saved.snapshots : {},
        sheet: { ...base.sheet, ...(saved.sheet || {}), token: (saved.sheet && saved.sheet.token) || token },
    };
}

/* --------------------------------------------------------------------------
   1. DỮ LIỆU VÀO
   -------------------------------------------------------------------------- */

export interface SaleLike {
    id?: string;
    timestamp?: string;
    quantity?: number;
    total_amount?: number;
    seller?: string;
    seller_id?: string;
    shift_id?: string;
    channel?: string;
    refunded?: boolean;
    week?: string;
}

export interface IncidentLike {
    id?: any;
    shift_id?: string;
    status_type?: string;
    member?: string;
    absent_member?: string;
    absent_member_id?: string;
    replacement_member?: string;
    replacement_member_id?: string;
    note?: string;
    timestamp?: string;
    week?: string;
}

export interface CompetitionInput {
    members: Member[];
    /** LATEST_SCHEDULE_RESULT.assigned_shifts */
    shifts: any[];
    sales: SaleLike[];
    incidents: IncidentLike[];
    config: CompetitionConfig;
    /** Ngày bắt đầu chu kỳ (yyyy-mm-dd) — dùng để suy ra tuần từ mốc thời gian. */
    start_date?: string;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
/** Chuẩn hoá theo giá trị cao nhất rồi nhân trọng số. */
const norm = (value: number, max: number, weight: number) =>
    max > 0 ? (Math.max(0, value) / max) * weight : 0;

/* --------------------------------------------------------------------------
   2. XÁC ĐỊNH TUẦN CỦA MỘT BẢN GHI
   Ưu tiên trường `week` đã gắn; nếu chưa có thì suy ra từ mốc thời gian so
   với ngày bắt đầu chu kỳ; cuối cùng mới rơi về tuần đầu tiên.
   -------------------------------------------------------------------------- */

/** Đọc "dd/mm/yyyy hh:mm" (vi-VN) hoặc "yyyy-mm-dd" thành mốc ms. */
export function parseVnTimestamp(raw?: string): number | null {
    if (!raw) return null;
    const s = String(raw).trim();
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return null;
}

export function deriveWeekFromTimestamp(
    timestamp: string | undefined,
    startDate: string | undefined,
    weeks: string[],
): string | null {
    const ts = parseVnTimestamp(timestamp);
    const start = parseVnTimestamp(startDate);
    if (ts === null || start === null) return null;
    const dayDiff = Math.floor((ts - start) / 86400000);
    if (dayDiff < 0) return weeks[0];
    const idx = Math.min(weeks.length - 1, Math.floor(dayDiff / 7));
    return weeks[idx];
}

export function resolveWeek(
    record: { week?: string; timestamp?: string },
    weeks: string[],
    startDate?: string,
): string {
    const tagged = (record.week || "").trim();
    if (tagged && weeks.includes(tagged)) return tagged;
    const derived = deriveWeekFromTimestamp(record.timestamp, startDate, weeks);
    return derived || weeks[0];
}

/* --------------------------------------------------------------------------
   3. KIỂU DỮ LIỆU KẾT QUẢ
   -------------------------------------------------------------------------- */

export interface ViolationRow {
    type: string;
    penalty: number;
    shift_id?: string;
    timestamp?: string;
    note?: string;
}

export interface MemberWeekRow {
    member_id: string;
    name: string;
    department: string;
    /** Sản lượng bán hàng cá nhân tuyệt đối (xét Best Seller). */
    individual_sales: number;
    individual_revenue: number;
    /** Tổng sản lượng quy đổi các ca trong tuần. */
    equivalent_sales: number;
    shifts_participated: number;
    /** Năng suất = sản lượng quy đổi / số ca. */
    productivity: number;
    violations: ViolationRow[];
    penalty_total: number;
    reputation: number;
    sales_score: number;
    prod_score: number;
    rep_score: number;
    total_score: number;
    participated: boolean;
    shift_ids: string[];
}

export interface ShiftGroupRow {
    shift_id: string;
    label: string;
    day: string;
    date: string;
    slot: string;
    channel: string;
    type_label: string;
    group_sales: number;
    group_revenue: number;
    member_count: number;
    members: string[];
    equivalent_per_member: number;
    avg_reputation: number;
    sales_score: number;
    rep_score: number;
    total_score: number;
}

export interface DeptRow {
    department: string;
    member_total: number;
    member_participated: number;
    total_equivalent_sales: number;
    total_shifts: number;
    total_individual_sales: number;
    avg_contribution: number;
    avg_productivity: number;
    avg_reputation: number;
    sales_score: number;
    prod_score: number;
    rep_score: number;
    total_score: number;
}

export interface WeekResult {
    week: string;
    locked: boolean;
    members: MemberWeekRow[];
    shift_groups: ShiftGroupRow[];
    departments: DeptRow[];
    best_seller: MemberWeekRow | null;
    all_rounder: MemberWeekRow | null;
    podium: ShiftGroupRow[];
    totals: {
        sales_qty: number;
        revenue: number;
        active_shifts: number;
        participants: number;
        violations: number;
        max_equivalent: number;
        max_productivity: number;
        max_group_sales: number;
        max_group_reputation: number;
    };
}

export interface ProjectMemberRow {
    member_id: string;
    name: string;
    department: string;
    total_individual_sales: number;
    total_individual_revenue: number;
    total_equivalent_sales: number;
    total_shifts: number;
    weeks_counted: number;
    week_scores: { [week: string]: number | null };
    avg_total_score: number;
    avg_sales_score: number;
    avg_prod_score: number;
    avg_rep_score: number;
    avg_reputation: number;
    total_violations: number;
}

export interface ProjectResult {
    weeks: WeekResult[];
    best_seller_project: ProjectMemberRow[];
    all_round_project: ProjectMemberRow[];
    departments: DeptRow[];
    weekly_podiums: {
        week: string;
        best_seller: MemberWeekRow | null;
        all_rounder: MemberWeekRow | null;
        groups: ShiftGroupRow[];
    }[];
    totals: {
        sales_qty: number;
        revenue: number;
        participants: number;
        violations: number;
        active_shifts: number;
    };
}

/* --------------------------------------------------------------------------
   4. TÍNH ĐIỂM MỘT TUẦN
   -------------------------------------------------------------------------- */

interface ShiftMeta {
    shift_id: string;
    day: string;
    date: string;
    slot: string;
    location: string;
    type_label: string;
    members: { member_id: string; name: string }[];
}

function indexShifts(shifts: any[]): Map<string, ShiftMeta> {
    const map = new Map<string, ShiftMeta>();
    (shifts || []).forEach((s: any) => {
        const id = String(s.shift_id || s.id || "").trim();
        if (!id) return;
        map.set(id, {
            shift_id: id,
            day: s.day || "",
            date: s.date || "",
            slot: s.slot || `${s.start_time || ""} - ${s.end_time || ""}`,
            location: s.location || s.type_label || "",
            type_label: s.type === "Ngoai" ? "Bán ngoài" : "Kênh chính",
            members: (s.assigned_members || []).map((m: any) => ({
                member_id: String(m.member_id || ""),
                name: String(m.name || ""),
            })),
        });
    });
    return map;
}

const normName = (s?: string) =>
    String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

function blankMemberRow(m: Member): MemberWeekRow {
    return {
        member_id: m.member_id,
        name: m.name,
        department: (m.department || "Chưa rõ Ban").trim(),
        individual_sales: 0,
        individual_revenue: 0,
        equivalent_sales: 0,
        shifts_participated: 0,
        productivity: 0,
        violations: [],
        penalty_total: 0,
        reputation: 0,
        sales_score: 0,
        prod_score: 0,
        rep_score: 0,
        total_score: 0,
        participated: false,
        shift_ids: [],
    };
}

export function computeWeek(input: CompetitionInput, week: string): WeekResult {
    const cfg = input.config;
    const weeks = cfg.weeks;
    const W = cfg.weights;
    const base = cfg.base_reputation || 100;
    const shiftIndex = indexShifts(input.shifts);

    const rows = new Map<string, MemberWeekRow>();
    const byName = new Map<string, MemberWeekRow>();
    (input.members || []).forEach((m) => {
        const row = blankMemberRow(m);
        rows.set(m.member_id, row);
        if (!byName.has(normName(m.name))) byName.set(normName(m.name), row);
    });
    const findMember = (id?: string, name?: string): MemberWeekRow | null => {
        if (id && rows.has(id)) return rows.get(id) as MemberWeekRow;
        const byN = byName.get(normName(name));
        return byN || null;
    };

    // 1. Lọc dữ liệu thuộc tuần đang xét (bỏ giao dịch đã hoàn trả).
    const sales = (input.sales || []).filter(
        (tx) => !tx.refunded && resolveWeek(tx, weeks, input.start_date) === week,
    );
    const incidents = (input.incidents || []).filter(
        (inc) => resolveWeek(inc, weeks, input.start_date) === week,
    );

    // 2. Sản lượng bán hàng cá nhân tuyệt đối → xét giải Best Seller.
    sales.forEach((tx) => {
        const mem = findMember(tx.seller_id, tx.seller);
        if (!mem) return;
        mem.individual_sales += Number(tx.quantity) || 0;
        mem.individual_revenue += Number(tx.total_amount) || 0;
    });

    // 3. Vi phạm → điểm uy tín (khởi điểm `base`, trừ dần theo bảng cấu hình).
    const absentByShift = new Map<string, Set<string>>();
    incidents.forEach((inc) => {
        const type = String(inc.status_type || "").trim();
        if (!type) return;
        const mem = findMember(
            inc.absent_member_id,
            inc.absent_member || inc.member,
        );
        if (!mem) return;
        const penalty = Number(cfg.penalties[type] || 0);
        if (penalty > 0) {
            mem.penalty_total += penalty;
            mem.violations.push({
                type,
                penalty,
                shift_id: inc.shift_id,
                timestamp: inc.timestamp,
                note: inc.note,
            });
        }
        if (cfg.absence_types.includes(type) && inc.shift_id) {
            const key = String(inc.shift_id);
            if (!absentByShift.has(key)) absentByShift.set(key, new Set());
            (absentByShift.get(key) as Set<string>).add(mem.member_id);
        }
    });

    // 4. Nhóm trực ca: chỉ tính các ca CÓ hoạt động trong tuần (có giao dịch
    //    hoặc có ghi nhận sự cố) — mỗi ca xét riêng, không cộng dồn giữa các ca.
    const agg = new Map<string, { sales: number; revenue: number }>();
    const touch = (id?: string) => {
        const key = String(id || "").trim();
        if (!key) return null;
        if (!agg.has(key)) agg.set(key, { sales: 0, revenue: 0 });
        return agg.get(key) as { sales: number; revenue: number };
    };
    sales.forEach((tx) => {
        const slot = touch(tx.shift_id);
        if (!slot) return;
        slot.sales += Number(tx.quantity) || 0;
        slot.revenue += Number(tx.total_amount) || 0;
    });
    incidents.forEach((inc) => touch(inc.shift_id));

    const groups: ShiftGroupRow[] = [];
    agg.forEach((val, shiftId) => {
        const meta = shiftIndex.get(shiftId);
        const roster = meta ? meta.members : [];
        const participants = roster
            .map((r) => findMember(r.member_id, r.name))
            .filter((r): r is MemberWeekRow => !!r)
            .filter((r) =>
                !cfg.exclude_absent_from_shift_count ||
                !(absentByShift.get(shiftId) || new Set()).has(r.member_id),
            );

        // Sản lượng quy đổi ca = Tổng sản phẩm ca / Số thành viên tham gia ca
        const perMember = safeDiv(val.sales, participants.length);
        participants.forEach((p) => {
            p.equivalent_sales += perMember;
            p.shifts_participated += 1;
            p.shift_ids.push(shiftId);
        });

        groups.push({
            shift_id: shiftId,
            label: meta ? `${meta.day} · ${meta.slot}` : shiftId,
            day: meta ? meta.day : "",
            date: meta ? meta.date : "",
            slot: meta ? meta.slot : "",
            channel: meta ? meta.location : "",
            type_label: meta ? meta.type_label : "Kênh chính",
            group_sales: val.sales,
            group_revenue: val.revenue,
            member_count: participants.length,
            members: participants.map((p) => p.name),
            equivalent_per_member: round2(perMember),
            avg_reputation: 0,
            sales_score: 0,
            rep_score: 0,
            total_score: 0,
        });
    });

    // 5. Điểm cá nhân: chuẩn hoá theo người cao nhất tuần.
    const memberRows = Array.from(rows.values());
    memberRows.forEach((m) => {
        m.reputation = Math.max(0, base - m.penalty_total);
        m.productivity = safeDiv(m.equivalent_sales, m.shifts_participated);
        m.participated = m.shifts_participated > 0 || m.individual_sales > 0;
    });
    const maxEquiv = Math.max(0, ...memberRows.map((m) => m.equivalent_sales));
    const maxProd = Math.max(0, ...memberRows.map((m) => m.productivity));
    memberRows.forEach((m) => {
        m.sales_score = round2(norm(m.equivalent_sales, maxEquiv, W.ind_sales));
        m.prod_score = round2(norm(m.productivity, maxProd, W.ind_prod));
        // Uy tín cá nhân dùng thang tuyệt đối: (base - vi phạm) / base * 20
        m.rep_score = round2((m.reputation / base) * W.ind_rep);
        m.total_score = round2(m.sales_score + m.prod_score + m.rep_score);
        m.equivalent_sales = round2(m.equivalent_sales);
        m.productivity = round2(m.productivity);
    });

    // 6. Điểm nhóm ca: Sản lượng 70% + Uy tín bình quân nhóm 30%.
    groups.forEach((g) => {
        const reps = g.members
            .map((n) => byName.get(normName(n)))
            .filter((r): r is MemberWeekRow => !!r)
            .map((r) => r.reputation);
        g.avg_reputation = round2(
            reps.length > 0 ? reps.reduce((a, b) => a + b, 0) / reps.length : 0,
        );
    });
    const maxGroupSales = Math.max(0, ...groups.map((g) => g.group_sales));
    const maxGroupRep = Math.max(0, ...groups.map((g) => g.avg_reputation));
    groups.forEach((g) => {
        g.sales_score = round2(norm(g.group_sales, maxGroupSales, W.grp_sales));
        g.rep_score = round2(norm(g.avg_reputation, maxGroupRep, W.grp_rep));
        g.total_score = round2(g.sales_score + g.rep_score);
    });
    groups.sort((a, b) => b.total_score - a.total_score || b.group_sales - a.group_sales);

    // 7. Xếp hạng & tổng hợp.
    const eligible = memberRows.filter((m) => m.participated);
    const bestSeller = [...eligible]
        .filter((m) => m.individual_sales > 0)
        .sort((a, b) => b.individual_sales - a.individual_sales)[0] || null;
    const allRounder = [...eligible]
        .filter((m) => m.shifts_participated > 0)
        .sort((a, b) => b.total_score - a.total_score)[0] || null;

    return {
        week,
        locked: cfg.locked_weeks.includes(week),
        members: memberRows.sort((a, b) => b.total_score - a.total_score),
        shift_groups: groups,
        departments: computeDepartments([memberRows], cfg),
        best_seller: bestSeller,
        all_rounder: allRounder,
        podium: groups.slice(0, 3),
        totals: {
            sales_qty: sales.reduce((s, tx) => s + (Number(tx.quantity) || 0), 0),
            revenue: sales.reduce((s, tx) => s + (Number(tx.total_amount) || 0), 0),
            active_shifts: groups.length,
            participants: eligible.length,
            violations: memberRows.reduce((s, m) => s + m.violations.length, 0),
            max_equivalent: round2(maxEquiv),
            max_productivity: round2(maxProd),
            max_group_sales: maxGroupSales,
            max_group_reputation: maxGroupRep,
        },
    };
}

/* --------------------------------------------------------------------------
   5. TẬP THỂ XUẤT SẮC THEO BAN
   Đánh giá theo BÌNH QUÂN để loại bỏ lợi thế Ban đông người:
     · Đóng góp BQ (40%) = Tổng SL quy đổi của Ban / Số thành viên thực tế tham gia
     · Hiệu suất BQ (40%) = Tổng SL quy đổi của Ban / Tổng số ca tham gia
     · Uy tín BQ  (20%)  = Uy tín trung bình của thành viên trong Ban
   Cả ba chỉ số đều được chuẩn hoá theo Ban cao nhất rồi nhân trọng số.
   -------------------------------------------------------------------------- */
export function computeDepartments(
    weekRows: MemberWeekRow[][],
    cfg: CompetitionConfig,
): DeptRow[] {
    const W = cfg.weights;
    const acc = new Map<string, {
        row: DeptRow;
        ids: Set<string>;
        activeIds: Set<string>;
        repSamples: number[];
    }>();

    weekRows.forEach((rowsOfWeek) => {
        rowsOfWeek.forEach((m) => {
            const dept = (m.department || "Chưa rõ Ban").trim();
            if (!acc.has(dept)) {
                acc.set(dept, {
                    row: {
                        department: dept,
                        member_total: 0,
                        member_participated: 0,
                        total_equivalent_sales: 0,
                        total_shifts: 0,
                        total_individual_sales: 0,
                        avg_contribution: 0,
                        avg_productivity: 0,
                        avg_reputation: 0,
                        sales_score: 0,
                        prod_score: 0,
                        rep_score: 0,
                        total_score: 0,
                    },
                    ids: new Set(),
                    activeIds: new Set(),
                    repSamples: [],
                });
            }
            const bucket = acc.get(dept)!;
            bucket.ids.add(m.member_id);
            bucket.row.total_equivalent_sales += m.equivalent_sales;
            bucket.row.total_shifts += m.shifts_participated;
            bucket.row.total_individual_sales += m.individual_sales;
            if (m.shifts_participated > 0) {
                bucket.activeIds.add(m.member_id);
                bucket.repSamples.push(m.reputation);
            }
        });
    });

    const list: DeptRow[] = [];
    acc.forEach((bucket) => {
        const r = bucket.row;
        r.member_total = bucket.ids.size;
        r.member_participated = bucket.activeIds.size;
        r.total_equivalent_sales = round2(r.total_equivalent_sales);
        r.avg_contribution = round2(safeDiv(r.total_equivalent_sales, r.member_participated));
        r.avg_productivity = round2(safeDiv(r.total_equivalent_sales, r.total_shifts));
        r.avg_reputation = round2(
            bucket.repSamples.length > 0
                ? bucket.repSamples.reduce((a, b) => a + b, 0) / bucket.repSamples.length
                : 0,
        );
        list.push(r);
    });

    const maxContrib = Math.max(0, ...list.map((d) => d.avg_contribution));
    const maxProd = Math.max(0, ...list.map((d) => d.avg_productivity));
    const maxRep = Math.max(0, ...list.map((d) => d.avg_reputation));
    list.forEach((d) => {
        d.sales_score = round2(norm(d.avg_contribution, maxContrib, W.dept_sales));
        d.prod_score = round2(norm(d.avg_productivity, maxProd, W.dept_prod));
        d.rep_score = round2(norm(d.avg_reputation, maxRep, W.dept_rep));
        d.total_score = round2(d.sales_score + d.prod_score + d.rep_score);
    });

    return list.sort((a, b) => b.total_score - a.total_score);
}

/* --------------------------------------------------------------------------
   6. TỔNG KẾT 3 TUẦN
     · Best Seller of Project : cộng dồn sản lượng cá nhân cả 3 tuần.
     · All Round Member       : TRUNG BÌNH điểm toàn diện đã chuẩn hoá của các
       tuần có tham gia (công bằng cho người làm nhiều/ít ca).
     · Tập thể theo Ban       : bình quân trên dữ liệu gộp 3 tuần.
   -------------------------------------------------------------------------- */
export function computeProject(input: CompetitionInput): ProjectResult {
    const cfg = input.config;
    const weekResults = cfg.weeks.map((w) => computeWeek(input, w));

    const acc = new Map<string, ProjectMemberRow>();
    weekResults.forEach((wr) => {
        wr.members.forEach((m) => {
            if (!acc.has(m.member_id)) {
                acc.set(m.member_id, {
                    member_id: m.member_id,
                    name: m.name,
                    department: m.department,
                    total_individual_sales: 0,
                    total_individual_revenue: 0,
                    total_equivalent_sales: 0,
                    total_shifts: 0,
                    weeks_counted: 0,
                    week_scores: {},
                    avg_total_score: 0,
                    avg_sales_score: 0,
                    avg_prod_score: 0,
                    avg_rep_score: 0,
                    avg_reputation: 0,
                    total_violations: 0,
                });
            }
            const p = acc.get(m.member_id)!;
            p.total_individual_sales += m.individual_sales;
            p.total_individual_revenue += m.individual_revenue;
            p.total_equivalent_sales += m.equivalent_sales;
            p.total_shifts += m.shifts_participated;
            p.total_violations += m.violations.length;
            if (m.shifts_participated > 0) {
                p.week_scores[wr.week] = m.total_score;
                p.weeks_counted += 1;
                p.avg_total_score += m.total_score;
                p.avg_sales_score += m.sales_score;
                p.avg_prod_score += m.prod_score;
                p.avg_rep_score += m.rep_score;
                p.avg_reputation += m.reputation;
            } else {
                p.week_scores[wr.week] = null;
            }
        });
    });

    const projectRows = Array.from(acc.values()).map((p) => ({
        ...p,
        total_equivalent_sales: round2(p.total_equivalent_sales),
        avg_total_score: round2(safeDiv(p.avg_total_score, p.weeks_counted)),
        avg_sales_score: round2(safeDiv(p.avg_sales_score, p.weeks_counted)),
        avg_prod_score: round2(safeDiv(p.avg_prod_score, p.weeks_counted)),
        avg_rep_score: round2(safeDiv(p.avg_rep_score, p.weeks_counted)),
        avg_reputation: round2(safeDiv(p.avg_reputation, p.weeks_counted)),
    }));

    return {
        weeks: weekResults,
        best_seller_project: [...projectRows]
            .filter((p) => p.total_individual_sales > 0)
            .sort((a, b) => b.total_individual_sales - a.total_individual_sales),
        all_round_project: [...projectRows]
            .filter((p) => p.weeks_counted > 0)
            .sort((a, b) => b.avg_total_score - a.avg_total_score),
        departments: computeDepartments(weekResults.map((w) => w.members), cfg),
        weekly_podiums: weekResults.map((w) => ({
            week: w.week,
            best_seller: w.best_seller,
            all_rounder: w.all_rounder,
            groups: w.podium,
        })),
        totals: {
            sales_qty: weekResults.reduce((s, w) => s + w.totals.sales_qty, 0),
            revenue: weekResults.reduce((s, w) => s + w.totals.revenue, 0),
            participants: projectRows.filter((p) => p.weeks_counted > 0).length,
            violations: weekResults.reduce((s, w) => s + w.totals.violations, 0),
            active_shifts: weekResults.reduce((s, w) => s + w.totals.active_shifts, 0),
        },
    };
}

/* --------------------------------------------------------------------------
   7. XUẤT BẢNG PHẲNG (dùng chung cho Excel, CSV và Google Sheet)
   -------------------------------------------------------------------------- */

export interface SheetTable {
    key: string;
    name: string;
    headers: string[];
    rows: (string | number | null)[][];
    note?: string;
}

export function describeFormulas(cfg: CompetitionConfig): SheetTable {
    const W = cfg.weights;
    const base = cfg.base_reputation;
    const rows: (string | number | null)[][] = [
        ["Chu kỳ", "3 tuần", `Tuần 1 → Tuần 2 → Tuần 3. Hết mỗi tuần: tổng kết & reset BẢNG XẾP HẠNG tuần, dữ liệu gốc giữ nguyên để xét Tổng Kết.`],
        ["Best Seller tuần", "1 giải/tuần", "Thành viên có TỔNG SẢN LƯỢNG BÁN HÀNG CÁ NHÂN tuyệt đối cao nhất trong tuần."],
        ["All-Rounder tuần", "1 giải/tuần", `Điểm Toàn Diện = Điểm Sản Lượng (${W.ind_sales}) + Điểm Năng Suất (${W.ind_prod}) + Điểm Uy Tín (${W.ind_rep}) = ${W.ind_sales + W.ind_prod + W.ind_rep} điểm.`],
        ["→ Sản lượng quy đổi ca", "Công thức", "Tổng sản phẩm ca ÷ Số thành viên tham gia ca."],
        ["→ Sản lượng quy đổi cá nhân", "Công thức", "Tổng sản lượng quy đổi của tất cả các ca trong tuần."],
        ["→ Điểm Sản Lượng", "Công thức", `(SL quy đổi cá nhân ÷ SL quy đổi cao nhất tuần) × ${W.ind_sales}.`],
        ["→ Năng suất cá nhân", "Công thức", "Tổng SL quy đổi ÷ Tổng số ca tham gia."],
        ["→ Điểm Năng Suất", "Công thức", `(Năng suất cá nhân ÷ Năng suất cao nhất tuần) × ${W.ind_prod}.`],
        ["→ Điểm Uy Tín", "Công thức", `(${base} − Tổng điểm vi phạm trong tuần) × ${round2(W.ind_rep / base)}.`],
        ["Giải Nhóm Trực Ca", "3 giải/tuần", `Nhất – Nhì – Ba. Xét riêng từng ca trực (kênh chính & bán ngoài), KHÔNG cộng dồn giữa các ca. Điểm Nhóm = Sản Lượng (${W.grp_sales}) + Uy Tín (${W.grp_rep}).`],
        ["→ Điểm Sản Lượng nhóm", "Công thức", `(Sản lượng nhóm ÷ Sản lượng nhóm cao nhất) × ${W.grp_sales}.`],
        ["→ Điểm Uy Tín nhóm", "Công thức", `Bình quân uy tín nhóm = Tổng uy tín thành viên trong ca ÷ Số thành viên. Điểm = (BQ nhóm ÷ BQ nhóm cao nhất) × ${W.grp_rep}.`],
        ["Best Seller Tổng Kết", "1 giải", "Cộng dồn tổng sản lượng bán hàng cá nhân cả 3 tuần — người cao nhất đạt giải."],
        ["All Round Member of Project", "1 giải", "TRUNG BÌNH điểm toàn diện đã chuẩn hoá của các tuần có tham gia."],
        ["Tập Thể Xuất Sắc theo Ban", "5 Ban", `Đóng góp BQ (${W.dept_sales}) + Hiệu suất BQ (${W.dept_prod}) + Uy tín BQ (${W.dept_rep}) = ${W.dept_sales + W.dept_prod + W.dept_rep} điểm, tính trên bình quân toàn Ban.`],
        ["→ Đóng góp bình quân", "Công thức", "Tổng SL quy đổi của Ban ÷ Số thành viên thực tế tham gia Project."],
        ["→ Hiệu suất bình quân", "Công thức", "Tổng SL quy đổi của Ban ÷ Tổng số ca tham gia."],
        ["→ Uy tín bình quân", "Công thức", "Uy tín trung bình của thành viên trong Ban cả 3 tuần, chuẩn hoá theo Ban cao nhất."],
        ["Uy tín khởi điểm", base, "Mỗi thành viên bắt đầu mỗi tuần với số điểm này."],
    ];
    Object.keys(cfg.penalties)
        .filter((k) => Number(cfg.penalties[k]) > 0)
        .forEach((k) => rows.push([`Trừ điểm: ${k}`, -Number(cfg.penalties[k]), "Điểm trừ uy tín mỗi lần vi phạm."]));
    return { key: "quy_che", name: "QUY_CHE", headers: ["Hạng mục", "Giá trị", "Diễn giải"], rows };
}

export function buildSheetTables(
    input: CompetitionInput,
    project: ProjectResult,
): SheetTable[] {
    const cfg = input.config;
    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const tables: SheetTable[] = [];

    tables.push({
        key: "tong_quan",
        name: "TONG_QUAN",
        headers: ["Chỉ số", "Giá trị"],
        rows: [
            ["Cập nhật lúc", now],
            ["Tuần đang ghi nhận", cfg.active_week],
            ["Các tuần đã chốt", cfg.locked_weeks.join(", ") || "(chưa chốt tuần nào)"],
            ["Tổng sản lượng 3 tuần (sp)", project.totals.sales_qty],
            ["Tổng doanh thu 3 tuần (đ)", project.totals.revenue],
            ["Số ca có hoạt động", project.totals.active_shifts],
            ["Số thành viên tham gia", project.totals.participants],
            ["Số lượt vi phạm", project.totals.violations],
            ["Best Seller of Project", project.best_seller_project[0]
                ? `${project.best_seller_project[0].name} (${project.best_seller_project[0].total_individual_sales} sp)`
                : "—"],
            ["All Round Member of Project", project.all_round_project[0]
                ? `${project.all_round_project[0].name} (${project.all_round_project[0].avg_total_score} đ)`
                : "—"],
            ["Tập thể xuất sắc", project.departments[0]
                ? `${project.departments[0].department} (${project.departments[0].total_score} đ)`
                : "—"],
        ],
    });

    const weeklyDetail: (string | number | null)[][] = [];
    const weeklyGroups: (string | number | null)[][] = [];
    const violationRows: (string | number | null)[][] = [];
    project.weeks.forEach((wr) => {
        wr.members
            .filter((m) => m.participated)
            .forEach((m, idx) => {
                weeklyDetail.push([
                    wr.week, idx + 1, m.name, m.department,
                    m.individual_sales, m.individual_revenue,
                    m.equivalent_sales, m.shifts_participated, m.productivity,
                    m.penalty_total, m.reputation,
                    m.sales_score, m.prod_score, m.rep_score, m.total_score,
                    wr.best_seller && wr.best_seller.member_id === m.member_id ? "BEST SELLER" : "",
                    wr.all_rounder && wr.all_rounder.member_id === m.member_id ? "ALL-ROUNDER" : "",
                ]);
                m.violations.forEach((v) =>
                    violationRows.push([wr.week, m.name, m.department, v.type, -v.penalty, v.shift_id || "", v.timestamp || "", v.note || ""]),
                );
            });
        wr.shift_groups.forEach((g, idx) => {
            weeklyGroups.push([
                wr.week, idx + 1, ["🥇 Nhất", "🥈 Nhì", "🥉 Ba"][idx] || "",
                g.shift_id, g.day, g.slot, g.type_label, g.channel,
                g.group_sales, g.group_revenue, g.member_count, g.equivalent_per_member,
                g.avg_reputation, g.sales_score, g.rep_score, g.total_score,
                g.members.join(", "),
            ]);
        });
    });

    tables.push({
        key: "chi_tiet_tuan",
        name: "CHI_TIET_TUAN",
        note: "Bảng tính chi tiết từng tuần — mọi số trung gian đều hiển thị để đối chiếu.",
        headers: [
            "Tuần", "Hạng", "Thành viên", "Ban",
            "SL cá nhân (sp)", "Doanh thu cá nhân (đ)",
            "SL quy đổi", "Số ca", "Năng suất",
            "Điểm vi phạm", "Uy tín",
            `Đ.Sản lượng (${cfg.weights.ind_sales})`,
            `Đ.Năng suất (${cfg.weights.ind_prod})`,
            `Đ.Uy tín (${cfg.weights.ind_rep})`,
            "TỔNG ĐIỂM (100)", "Giải Best Seller", "Giải All-Rounder",
        ],
        rows: weeklyDetail,
    });

    tables.push({
        key: "nhom_truc",
        name: "NHOM_TRUC_CA",
        note: "Xét riêng từng ca trực, 3 giải mỗi tuần (Nhất – Nhì – Ba).",
        headers: [
            "Tuần", "Hạng", "Giải", "Mã ca", "Ngày/Thứ", "Khung giờ", "Kênh", "Địa điểm",
            "Sản lượng nhóm (sp)", "Doanh thu nhóm (đ)", "Số TV trong ca", "SL quy đổi/người",
            "BQ uy tín nhóm",
            `Đ.Sản lượng (${cfg.weights.grp_sales})`,
            `Đ.Uy tín (${cfg.weights.grp_rep})`,
            "TỔNG ĐIỂM (100)", "Thành viên",
        ],
        rows: weeklyGroups,
    });

    tables.push({
        key: "best_seller_tong_ket",
        name: "BEST_SELLER_TONG_KET",
        headers: ["Hạng", "Thành viên", "Ban", "Tổng SL 3 tuần (sp)", "Tổng SL quy đổi", "Tổng số ca"],
        rows: project.best_seller_project.map((p, i) => [
            i + 1, p.name, p.department, p.total_individual_sales, p.total_equivalent_sales, p.total_shifts,
        ]),
    });

    tables.push({
        key: "all_round_project",
        name: "ALL_ROUND_PROJECT",
        note: "Trung bình điểm toàn diện chuẩn hoá của các tuần có tham gia.",
        headers: [
            "Hạng", "Thành viên", "Ban",
            ...cfg.weeks.map((w) => `Điểm ${w}`),
            "Số tuần tham gia", "ĐIỂM TRUNG BÌNH", "Uy tín BQ", "Tổng số ca",
        ],
        rows: project.all_round_project.map((p, i) => [
            i + 1, p.name, p.department,
            ...cfg.weeks.map((w) => (p.week_scores[w] === null || p.week_scores[w] === undefined ? "—" : p.week_scores[w] as number)),
            p.weeks_counted, p.avg_total_score, p.avg_reputation, p.total_shifts,
        ]),
    });

    tables.push({
        key: "tap_the_ban",
        name: "TAP_THE_BAN",
        note: "Đánh giá bình quân toàn Ban — loại bỏ lợi thế quy mô nhân sự.",
        headers: [
            "Hạng", "Ban", "Tổng TV", "TV thực tế tham gia",
            "Tổng SL quy đổi", "Tổng số ca", "Tổng SL cá nhân",
            "Đóng góp BQ", "Hiệu suất BQ", "Uy tín BQ",
            `Đ.Sản lượng (${cfg.weights.dept_sales})`,
            `Đ.Hiệu suất (${cfg.weights.dept_prod})`,
            `Đ.Uy tín (${cfg.weights.dept_rep})`,
            "TỔNG ĐIỂM (100)",
        ],
        rows: project.departments.map((d, i) => [
            i + 1, d.department, d.member_total, d.member_participated,
            d.total_equivalent_sales, d.total_shifts, d.total_individual_sales,
            d.avg_contribution, d.avg_productivity, d.avg_reputation,
            d.sales_score, d.prod_score, d.rep_score, d.total_score,
        ]),
    });

    tables.push({
        key: "vi_pham",
        name: "NHAT_KY_VI_PHAM",
        headers: ["Tuần", "Thành viên", "Ban", "Loại vi phạm", "Điểm trừ", "Mã ca", "Thời điểm", "Ghi chú"],
        rows: violationRows,
    });

    tables.push(describeFormulas(cfg));

    tables.push({
        key: "nhap_ban_hang",
        name: "NHAP_BAN_HANG",
        note: "TAB NHẬP LIỆU (Sheet → App). Điền dòng mới rồi bấm đồng bộ; cột Tuần để trống sẽ lấy tuần đang ghi nhận.",
        headers: ["Tuần", "Mã ca", "Người bán", "Sản phẩm", "Số lượng", "Đơn giá", "Kênh", "Ghi chú"],
        rows: [[cfg.active_week, "", "", "", "", "", "Phòng Thanh Niên", ""]],
    });

    tables.push({
        key: "nhap_vi_pham",
        name: "NHAP_VI_PHAM",
        note: "TAB NHẬP LIỆU (Sheet → App). Loại vi phạm phải khớp bảng QUY_CHE.",
        headers: ["Tuần", "Mã ca", "Thành viên", "Loại vi phạm", "Ghi chú"],
        rows: [[cfg.active_week, "", "", "Đi trễ", ""]],
    });

    return tables;
}

export function tableToCsv(table: SheetTable): string {
    const esc = (v: any) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [table.headers, ...table.rows]
        .map((r) => r.map(esc).join(","))
        .join("\r\n");
}
