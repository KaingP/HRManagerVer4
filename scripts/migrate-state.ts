/**
 * scripts/migrate-state.ts
 * Đọc state.json hiện tại → insert vào SQLite (data.db).
 *
 *   npx tsx scripts/migrate-state.ts [--state state.json]
 *
 * Tự bỏ qua các bản ghi vi phạm FK (shift_id / product_id / member_id không tồn tại)
 * và ghi log để bạn kiểm tra lại.
 */
import fs from "fs";
import path from "path";
import { getDb, closeDb } from "../db/db";

interface StateShape {
    version: number;
    admin_password?: string;
    start_date?: string;
    enable_ca_ngoai?: boolean;
    custom_ca_ngoai?: any[];
    optimizer_config?: any;
    incident_logs?: any[];
    schedule?: any;
    members?: any[];
    inventory?: any[];
    sales_logs?: any[];
    restock_receipts?: any[];
    kpi_attendance?: any[];
    shift_audits?: any[];
    online_orders?: any[];
    pickup_requests?: any[];
    member_discipline_scores?: Record<string, number>;
    discipline_logs?: any[];
    member_passwords?: Record<string, string>;
    vietqr_config?: any;
    competition_config?: any;
}

function parseDateLoose(s: any): string | null {
    if (!s) return null;
    if (typeof s !== "string") return null;
    const t = s.trim();
    if (!t) return null;
    const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return t;
}

function num(v: any, def = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function bool(v: any, def = false): number {
    if (v === undefined || v === null) return def ? 1 : 0;
    return v ? 1 : 0;
}

function safeJson(v: any, fb = "[]"): string {
    try {
        return JSON.stringify(v ?? null);
    } catch {
        return fb;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const statePath =
        args[args.indexOf("--state") + 1] ||
        process.env.STATE_FILE ||
        path.join(process.cwd(), "state.json");

    if (!fs.existsSync(statePath)) {
        console.error(`Không tìm thấy ${statePath}`);
        process.exit(1);
    }

    console.log(`[migrate] Đọc ${statePath} ...`);
    const state: StateShape = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    const db = getDb();
    console.log(`[migrate] Kết nối DB thành công.`);

    db.exec("BEGIN");
    try {
        // ==== 1. Admin password ====
        if (state.admin_password) {
            db.prepare(
                "INSERT OR REPLACE INTO admin_password(id, password) VALUES (1, ?)",
            ).run(state.admin_password);
        }

        // ==== 2. VietQR config ====
        if (state.vietqr_config && typeof state.vietqr_config === "object") {
            const v = state.vietqr_config;
            db.prepare(
                `INSERT OR REPLACE INTO vietqr_config(id, bank_id, account_no, account_name)
                 VALUES (1, ?, ?, ?)`,
            ).run(
                String(v.bank_id || "970422"),
                String(v.account_no || "0000000000"),
                String(v.account_name || "HUNG VUONG FB"),
            );
        }

        // ==== 3. Optimizer config ====
        if (state.optimizer_config) {
            const oc = state.optimizer_config;
            db.prepare(
                `INSERT OR REPLACE INTO optimizer_config(
                    id, start_date, phong_chinh_count, phong_dp_count,
                    min_shifts, max_shifts, max_shifts_per_day,
                    enable_ca_ngoai, daily_shift_configs_json, custom_ca_ngoai_json
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                oc.start_date || state.start_date || null,
                num(oc.phong_chinh_count, 4),
                num(oc.phong_dp_count, 1),
                num(oc.min_shifts, 3),
                num(oc.max_shifts, 5),
                num(oc.max_shifts_per_day, 2),
                bool(oc.enable_ca_ngoai, true),
                safeJson(oc.daily_shift_configs, "[]"),
                safeJson(state.custom_ca_ngoai, "[]"),
            );
        }

        // ==== 4. Members ====
        const insertMember = db.prepare(
            `INSERT OR REPLACE INTO member(
                id, name, department, residence, vehicle, job, school,
                phone, is_standby, min_shifts, max_shifts, total_free_slots
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertAvail = db.prepare(
            "INSERT OR IGNORE INTO member_availability(member_id, day, slot) VALUES (?, ?, ?)",
        );
        const insertCommit = db.prepare(
            "INSERT OR IGNORE INTO member_commitment(member_id, day, slot) VALUES (?, ?, ?)",
        );

        let membersInserted = 0;
        for (const m of state.members || []) {
            insertMember.run(
                String(m.member_id),
                String(m.name || ""),
                m.department || null,
                m.residence || null,
                m.vehicle || null,
                m.job || null,
                m.school || null,
                m.phone || null,
                bool(m.is_standby),
                num(m.min_shifts, 3),
                num(m.max_shifts, 5),
                num(m.total_free_slots, 0),
            );
            membersInserted++;
            for (const [key, val] of Object.entries(m.availability || {})) {
                if (val) {
                    const [day, slot] = String(key).split("|");
                    if (day && slot) insertAvail.run(m.member_id, day, slot);
                }
            }
            for (const [key, val] of Object.entries(m.committed_slots || {})) {
                if (val) {
                    const [day, slot] = String(key).split("|");
                    if (day && slot) insertCommit.run(m.member_id, day, slot);
                }
            }
        }
        console.log(`[migrate] Members: ${membersInserted}`);

        // ==== 5. Shifts & assignments ====
        const insertShift = db.prepare(
            `INSERT OR REPLACE INTO shift(
                id, type, type_label, day, date, slot, start_time, end_time,
                location, required_count, chinh_count, dp_count, backup_count,
                active, note, overlapping_slots_json, shift_leader, is_filled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertAssign = db.prepare(
            `INSERT OR REPLACE INTO shift_assignment(
                shift_id, member_id, role, position_role, is_standby, is_committed
            ) VALUES (?, ?, ?, ?, ?, ?)`,
        );

        let shiftsInserted = 0;
        let assignmentsInserted = 0;
        for (const s of state.schedule?.assigned_shifts || []) {
            insertShift.run(
                String(s.shift_id),
                String(s.type || "Phong"),
                s.type_label || null,
                String(s.day || ""),
                parseDateLoose(s.date),
                s.slot || null,
                s.start_time || null,
                s.end_time || null,
                s.location || null,
                num(s.required_count, 0),
                num(s.chinh_count, 0),
                num(s.dp_count, 0),
                num(s.backup_count, 0),
                bool(s.active, true),
                s.note || null,
                safeJson(s.overlapping_slots, "[]"),
                s.shift_leader || null,
                bool(s.is_filled),
            );
            shiftsInserted++;
            for (const m of s.assigned_members || []) {
                insertAssign.run(
                    String(s.shift_id),
                    String(m.member_id),
                    String(m.role || "Chính"),
                    m.position_role || null,
                    bool(m.is_standby),
                    bool(m.is_committed),
                );
                assignmentsInserted++;
            }
        }
        console.log(
            `[migrate] Shifts: ${shiftsInserted}, Assignments: ${assignmentsInserted}`,
        );

        // ==== Build FK valid sets ====
        const validShiftIds = new Set(
            (db.prepare("SELECT id FROM shift").all() as any[]).map(
                (r) => r.id,
            ),
        );
        const validProductIds = new Set<string>();
        const validMemberIds = new Set(
            (db.prepare("SELECT id FROM member").all() as any[]).map(
                (r) => r.id,
            ),
        );

        // ==== 6. Products ====
        const insertProd = db.prepare(
            `INSERT OR REPLACE INTO product(id, name, unit, price, initial_stock, sold_count, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        let prodsInserted = 0;
        for (const p of state.inventory || []) {
            insertProd.run(
                String(p.id),
                String(p.name),
                String(p.unit || "Phần"),
                num(p.price, 0),
                num(p.initial_stock, 0),
                num(p.sold_count, 0),
                p.note || null,
            );
            prodsInserted++;
            validProductIds.add(String(p.id));
        }
        console.log(`[migrate] Products: ${prodsInserted}`);

        // ==== 6.5. Hồi sinh sản phẩm bị xóa nhưng vẫn còn sales_logs liên kết ====
        // Trong state.json cũ, các SP05/SP_TEST_RBAC/F&B_MOCK đã bị xóa khỏi inventory
        // nhưng sale_transaction vẫn còn. Tự tạo lại bản ghi product với giá 0 để FK hợp lệ.
        const lastKnownName = new Map<string, string>();
        const lastKnownPrice = new Map<string, number>();
        for (const t of state.sales_logs || []) {
            if (t.product_id && !validProductIds.has(String(t.product_id))) {
                if (t.product_name) lastKnownName.set(String(t.product_id), String(t.product_name));
                if (t.unit_price) lastKnownPrice.set(String(t.product_id), num(t.unit_price, 0));
            }
        }
        let rescued = 0;
        for (const [pid, name] of lastKnownName) {
            insertProd.run(
                pid,
                name,
                "Phần",
                lastKnownPrice.get(pid) ?? 0,
                0,
                0,
                "(đã xoá khỏi kho nhưng còn lịch sử bán)",
            );
            validProductIds.add(pid);
            rescued++;
        }
        if (rescued > 0)
            console.log(`[migrate] Hồi sinh sản phẩm bị FK orphan: ${rescued}`);

        // ==== 7. KPI attendance ====
        const insertKpi = db.prepare(
            `INSERT INTO kpi_attendance(
                member_id, name, day, slot, role, type, status, shift_id, date, week
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let kpiInserted = 0;
        let kpiSkipped = 0;
        for (const k of state.kpi_attendance || []) {
            const mid = String(k.member_id || "");
            const sid = k.shift_id || null;
            if (mid && !validMemberIds.has(mid)) {
                kpiSkipped++;
                continue;
            }
            if (sid && !validShiftIds.has(sid)) {
                kpiSkipped++;
                continue;
            }
            insertKpi.run(
                mid,
                String(k.name || ""),
                String(k.day || ""),
                String(k.slot || ""),
                k.role || null,
                k.type || null,
                k.status || null,
                sid,
                parseDateLoose(k.date),
                k.week || null,
            );
            kpiInserted++;
        }
        console.log(
            `[migrate] KPI attendance: ${kpiInserted}${kpiSkipped ? ` (skipped ${kpiSkipped})` : ""}`,
        );

        // ==== 8. Shift incidents ====
        const insertInc = db.prepare(
            `INSERT OR REPLACE INTO shift_incident(
                id, shift_id, day, date, slot, location, status_type,
                late_minutes, absent_member, absent_member_id,
                replacement_member, replacement_member_id,
                response_time, unreachable_ids_json, resolution,
                note, timestamp, week
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let incidentsInserted = 0;
        let incidentsSkipped = 0;
        for (const i of state.incident_logs || []) {
            const sid = String(i.shift_id || "");
            if (sid && !validShiftIds.has(sid)) {
                incidentsSkipped++;
                continue;
            }
            insertInc.run(
                String(i.id || `inc_${incidentsInserted}`),
                sid,
                i.day || null,
                parseDateLoose(i.date),
                i.slot || null,
                i.location || null,
                i.status_type || null,
                num(i.late_minutes, 0),
                i.absent_member || null,
                i.absent_member_id || null,
                i.replacement_member || null,
                i.replacement_member_id || null,
                i.response_time || null,
                safeJson(i.unreachable_ids, "[]"),
                i.resolution || null,
                i.note || null,
                i.timestamp || null,
                i.week || null,
            );
            incidentsInserted++;
        }
        console.log(
            `[migrate] Incidents: ${incidentsInserted}${incidentsSkipped ? ` (skipped ${incidentsSkipped})` : ""}`,
        );

        // ==== 9. Discipline scores ====
        const insertScore = db.prepare(
            "INSERT OR REPLACE INTO discipline_score(member_id, current_points) VALUES (?, ?)",
        );
        let scoresInserted = 0;
        for (const [mid, pts] of Object.entries(
            state.member_discipline_scores || {},
        )) {
            if (!validMemberIds.has(mid)) continue;
            insertScore.run(String(mid), num(pts, 100));
            scoresInserted++;
        }
        console.log(`[migrate] Discipline scores: ${scoresInserted}`);

        // ==== 10. Discipline logs ====
        const insertDl = db.prepare(
            `INSERT OR REPLACE INTO discipline_log(
                id, member_id, member_name, type, points_change,
                old_points, new_points, reason, performed_by, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let dlInserted = 0;
        for (const l of state.discipline_logs || []) {
            if (!validMemberIds.has(String(l.member_id || ""))) continue;
            insertDl.run(
                String(l.id || `disc_${dlInserted}`),
                String(l.member_id || ""),
                String(l.member_name || ""),
                String(l.type || "Cộng điểm"),
                num(l.points_change, 0),
                num(l.old_points, 100),
                num(l.new_points, 100),
                l.reason || null,
                l.performed_by || null,
                l.timestamp || null,
            );
            dlInserted++;
        }
        console.log(`[migrate] Discipline logs: ${dlInserted}`);

        // ==== 11. Member passwords ====
        const insertPwd = db.prepare(
            "INSERT OR REPLACE INTO member_password(member_id, password) VALUES (?, ?)",
        );
        let pwdInserted = 0;
        for (const [mid, pwd] of Object.entries(state.member_passwords || {})) {
            if (!validMemberIds.has(mid)) continue;
            insertPwd.run(String(mid), String(pwd));
            pwdInserted++;
        }
        console.log(`[migrate] Member passwords: ${pwdInserted}`);

        // ==== 12. Competition config ====
        if (state.competition_config) {
            const cc = state.competition_config;
            db.prepare(
                `INSERT OR REPLACE INTO competition_config(
                    id, active_week, weeks_json, weights_json,
                    sheet_token, sheet_url, reputation_rules_json
                ) VALUES (1, ?, ?, ?, ?, ?, ?)`,
            ).run(
                cc.active_week || "Tuần 1",
                safeJson(cc.weeks, '["Tuần 1","Tuần 2","Tuần 3"]'),
                safeJson(cc.weights, "{}"),
                cc.sheet?.token || null,
                cc.sheet?.url || null,
                safeJson(
                    {
                        base_reputation: cc.base_reputation,
                        penalties: cc.penalties,
                        absence_types: cc.absence_types,
                        exclude_absent_from_shift_count:
                            cc.exclude_absent_from_shift_count,
                    },
                    "{}",
                ),
            );
        }

        // ==== 13. Sale transactions ====
        const insertSale = db.prepare(
            `INSERT OR REPLACE INTO sale_transaction(
                id, timestamp, product_id, product_name, quantity,
                unit_price, total_amount, channel, shift_id, seller,
                customer_name, customer_phone, payment_method, note,
                refunded, week
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let salesInserted = 0;
        let salesSkipped = 0;
        for (const s of state.sales_logs || []) {
            const pid = s.product_id || null;
            const sid = s.shift_id || null;
            if (pid && !validProductIds.has(pid)) {
                salesSkipped++;
                continue;
            }
            if (sid && !validShiftIds.has(sid)) {
                salesSkipped++;
                continue;
            }
            insertSale.run(
                String(s.id || `tx_${salesInserted}`),
                String(s.timestamp || ""),
                pid,
                String(s.product_name || ""),
                num(s.quantity, 0),
                num(s.unit_price, 0),
                num(s.total_amount, 0),
                s.channel || null,
                sid,
                s.seller || null,
                s.customer_name || null,
                s.customer_phone || null,
                s.payment_method || null,
                s.note || null,
                bool(s.refunded),
                s.week || null,
            );
            salesInserted++;
        }
        console.log(
            `[migrate] Sales: ${salesInserted}${salesSkipped ? ` (skipped ${salesSkipped})` : ""}`,
        );

        // ==== 14. Restock receipts ====
        const insertRcpt = db.prepare(
            `INSERT OR REPLACE INTO restock_receipt(
                id, timestamp, creator, supplier, total_items, total_cost, reason, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertRi = db.prepare(
            `INSERT INTO restock_item(
                receipt_id, product_id, product_name, unit, quantity, unit_cost, total_cost, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let receiptsInserted = 0;
        for (const r of state.restock_receipts || []) {
            insertRcpt.run(
                String(r.id),
                String(r.timestamp || ""),
                String(r.creator || ""),
                r.supplier || null,
                num(r.total_items, 0),
                num(r.total_cost, 0),
                r.reason || null,
                r.note || null,
            );
            for (const it of r.items || []) {
                if (!validProductIds.has(String(it.product_id))) continue;
                insertRi.run(
                    String(r.id),
                    String(it.product_id),
                    String(it.product_name || ""),
                    String(it.unit || "Phần"),
                    num(it.quantity, 0),
                    num(it.unit_cost, 0),
                    num(it.total_cost, 0),
                    it.note || null,
                );
            }
            receiptsInserted++;
        }
        console.log(`[migrate] Restock receipts: ${receiptsInserted}`);

        // ==== 15. Shift audits ====
        const insertAudit = db.prepare(
            `INSERT OR REPLACE INTO shift_audit(
                id, shift_id, timestamp, auditor, summary_note, overall_status,
                total_diff, carried_forward_shift, resolved_count, unresolved_count, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertAuditItem = db.prepare(
            `INSERT INTO shift_audit_item(
                audit_id, product_id, product_name, unit, expected_stock, actual_stock, diff,
                carried_from_prev, resolution_type, resolution_note, resolved_by, resolved_at,
                is_resolved, carry_to_shift, carry_qty, unit_price, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let auditsInserted = 0;
        for (const a of state.shift_audits || []) {
            const sid = String(a.shift_id || "");
            if (sid && !validShiftIds.has(sid)) continue;
            insertAudit.run(
                String(a.id),
                sid,
                String(a.timestamp || ""),
                String(a.auditor || ""),
                a.summary_note || null,
                a.overall_status || null,
                num(a.total_diff, 0),
                a.carried_forward_shift || null,
                a.resolved_count ?? null,
                a.unresolved_count ?? null,
                a.updated_at || null,
            );
            for (const it of a.items || []) {
                if (!validProductIds.has(String(it.product_id))) continue;
                insertAuditItem.run(
                    String(a.id),
                    String(it.product_id),
                    String(it.product_name || ""),
                    String(it.unit || "Phần"),
                    num(it.expected_stock, 0),
                    num(it.actual_stock, 0),
                    num(it.diff, 0),
                    it.carried_from_prev ?? null,
                    it.resolution_type || null,
                    it.resolution_note || null,
                    it.resolved_by || null,
                    it.resolved_at || null,
                    bool(it.is_resolved),
                    it.carry_to_shift || null,
                    it.carry_qty ?? null,
                    it.unit_price ?? null,
                    it.note || null,
                );
            }
            auditsInserted++;
        }
        console.log(`[migrate] Shift audits: ${auditsInserted}`);

        // ==== 16. Online orders ====
        const insertOrder = db.prepare(
            `INSERT OR REPLACE INTO online_order(
                id, customer_name, class_name, pickup_date, pickup_time_slot,
                shift_id, shift_label, total_amount, payment_status, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertOi = db.prepare(
            `INSERT INTO online_order_item(
                order_id, product_id, product_name, quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        let ordersInserted = 0;
        for (const o of state.online_orders || []) {
            const sid = o.shift_id || null;
            if (sid && !validShiftIds.has(sid)) continue;
            insertOrder.run(
                String(o.id),
                String(o.customer_name || ""),
                o.class_name || null,
                String(o.pickup_date || ""),
                String(o.pickup_time_slot || ""),
                sid,
                o.shift_label || null,
                num(o.total_amount, 0),
                String(o.payment_status || "Chưa thanh toán"),
                o.note || null,
                o.created_at || null,
            );
            for (const it of o.items || []) {
                const pid = it.product_id || null;
                if (pid && !validProductIds.has(pid)) continue;
                insertOi.run(
                    String(o.id),
                    pid,
                    String(it.product_name || ""),
                    num(it.quantity, 0),
                    num(it.unit_price, 0),
                    num(it.total_price, 0),
                );
            }
            ordersInserted++;
        }
        console.log(`[migrate] Online orders: ${ordersInserted}`);

        // ==== 17. Pickup requests ====
        const insertPickup = db.prepare(
            `INSERT OR REPLACE INTO pickup_request(
                id, member_id, member_name, total_amount, pickup_time,
                shift_id, shift_label, payment_method, payment_status, status,
                inventory_deducted, qr_url, note, created_at, created_timestamp,
                approved_at, cancelled_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertPi = db.prepare(
            `INSERT INTO pickup_item(
                request_id, product_id, product_name, quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        let pickupsInserted = 0;
        for (const p of state.pickup_requests || []) {
            const mid = String(p.member_id || "");
            if (mid && !validMemberIds.has(mid)) continue;
            const ts = num(p.created_timestamp, 0) || Date.now();
            insertPickup.run(
                String(p.id),
                mid,
                String(p.member_name || ""),
                num(p.total_amount, 0),
                String(p.pickup_time || ""),
                p.shift_id || null,
                p.shift_label || null,
                String(p.payment_method || "PAY_LATER"),
                String(p.payment_status || "Chưa thanh toán"),
                String(p.status || "PENDING"),
                bool(p.inventory_deducted),
                p.qr_url || null,
                p.note || null,
                p.created_at || null,
                ts,
                p.approved_at || null,
                p.cancelled_at || null,
            );
            for (const it of p.items || []) {
                const pid = it.product_id || null;
                if (pid && !validProductIds.has(pid)) continue;
                insertPi.run(
                    String(p.id),
                    pid,
                    String(it.product_name || ""),
                    num(it.quantity, 0),
                    num(it.unit_price, 0),
                    num(it.total_price, 0),
                );
            }
            pickupsInserted++;
        }
        console.log(`[migrate] Pickup requests: ${pickupsInserted}`);

        db.exec("COMMIT");
        console.log(`[migrate] Hoàn tất.`);
    } catch (err) {
        db.exec("ROLLBACK");
        console.error("[migrate] LỖI, đã rollback:", err);
        throw err;
    } finally {
        closeDb();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});