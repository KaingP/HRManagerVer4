/**
 * Kiểm thử bộ công thức thi đua Project F&B (src/competition.ts).
 *
 * Các con số kỳ vọng trong file này được tính tay theo quy chế:
 *   - Cá nhân: Sản lượng 40% + Năng suất 40% + Uy tín 20%
 *   - Nhóm trực ca: Sản lượng 70% + Uy tín 30% (xét riêng từng ca)
 *   - Tập thể Ban: Đóng góp TB 40% + Hiệu suất TB 40% + Uy tín TB 20%
 *   - TỔNG KẾT All Round: trung bình điểm ĐÃ chuẩn hoá của các tuần có tham gia
 * Nếu một thay đổi làm lệch các con số này thì hoặc quy chế đã đổi, hoặc có lỗi.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
    CompetitionInput,
    DEFAULT_WEEKS,
    buildSheetTables,
    computeProject,
    computeWeek,
    describeFormulas,
    makeDefaultCompetitionConfig,
    normalizeCompetitionConfig,
    resolveWeek,
    tableToCsv,
} from "../src/competition";

const [W1, W2, W3] = DEFAULT_WEEKS;

const members = [
    { member_id: "M1", name: "An", department: "Ban Truyền Thông" },
    { member_id: "M2", name: "Bình", department: "Ban Truyền Thông" },
    { member_id: "M3", name: "Cường", department: "Ban Hậu Cần" },
    { member_id: "M4", name: "Dung", department: "Ban Hậu Cần" },
] as any[];

const shifts = [
    {
        shift_id: "S1", day: "Thứ 2", date: "01/09/2026", slot: "Sáng", type: "Chinh",
        assigned_members: [{ member_id: "M1", name: "An" }, { member_id: "M2", name: "Bình" }],
    },
    {
        shift_id: "S2", day: "Thứ 2", date: "01/09/2026", slot: "Chiều", type: "Ngoai",
        assigned_members: [{ member_id: "M3", name: "Cường" }, { member_id: "M4", name: "Dung" }],
    },
    {
        shift_id: "S3", day: "Thứ 3", date: "08/09/2026", slot: "Sáng", type: "Chinh",
        assigned_members: [{ member_id: "M3", name: "Cường" }],
    },
];

const sale = (id: string, week: string, shift_id: string, seller_id: string, quantity: number) =>
    ({ id, week, shift_id, seller_id, quantity, total_amount: quantity * 1000 });

function makeInput(over: Partial<CompetitionInput> = {}): CompetitionInput {
    return {
        members,
        shifts,
        // Tuần 1: ca S1 bán 80 sp (An 60 + Bình 20), ca S2 bán 40 sp (Cường 30 + Dung 10).
        // Tuần 2: ca S3 chỉ có Cường, bán 50 sp.
        sales: [
            sale("TX1", W1, "S1", "M1", 60),
            sale("TX2", W1, "S1", "M2", 20),
            sale("TX3", W1, "S2", "M3", 30),
            sale("TX4", W1, "S2", "M4", 10),
            sale("TX5", W2, "S3", "M3", 50),
        ],
        // Bình đi trễ ở ca S1 tuần 1 → −5 điểm uy tín.
        incidents: [
            { id: 1, week: W1, shift_id: "S1", status_type: "Đi trễ", absent_member_id: "M2" },
        ],
        config: makeDefaultCompetitionConfig("test-token"),
        start_date: "01/09/2026",
        ...over,
    };
}

const byId = (rows: any[], id: string) => rows.find((r) => r.member_id === id);

test("Giải A — Best Seller tuần lấy sản lượng cá nhân tuyệt đối", () => {
    const wk = computeWeek(makeInput(), W1);
    assert.equal(wk.best_seller!.member_id, "M1");
    assert.equal(wk.best_seller!.individual_sales, 60);
    assert.equal(byId(wk.members, "M2").individual_sales, 20);
    // Doanh thu đi kèm để đối chiếu với sổ bán hàng.
    assert.equal(byId(wk.members, "M1").individual_revenue, 60000);
});

test("Giải B — sản lượng quy đổi chia đều theo số thành viên trong ca", () => {
    const wk = computeWeek(makeInput(), W1);
    // S1: 80 sp / 2 người = 40; S2: 40 sp / 2 người = 20.
    assert.equal(byId(wk.members, "M1").equivalent_sales, 40);
    assert.equal(byId(wk.members, "M2").equivalent_sales, 40);
    assert.equal(byId(wk.members, "M3").equivalent_sales, 20);
    assert.equal(byId(wk.members, "M4").equivalent_sales, 20);
    // Năng suất = quy đổi / số ca tham gia.
    assert.equal(byId(wk.members, "M1").productivity, 40);
    assert.equal(byId(wk.members, "M1").shifts_participated, 1);
});

test("Giải B — điểm tổng hợp 40/40/20 và người thắng", () => {
    const wk = computeWeek(makeInput(), W1);
    const an = byId(wk.members, "M1");
    const binh = byId(wk.members, "M2");
    const cuong = byId(wk.members, "M3");

    // An là mốc cao nhất cả sản lượng quy đổi (40) và năng suất (40).
    assert.equal(an.sales_score, 40);
    assert.equal(an.prod_score, 40);
    assert.equal(an.reputation, 100);
    assert.equal(an.rep_score, 20);
    assert.equal(an.total_score, 100);

    // Bình bị trừ 5 → uy tín 95 → 95/100 × 20 = 19.
    assert.equal(binh.reputation, 95);
    assert.equal(binh.penalty_total, 5);
    assert.equal(binh.rep_score, 19);
    assert.equal(binh.total_score, 99);

    // Cường: 20/40 × 40 = 20 cho cả sản lượng và năng suất.
    assert.equal(cuong.sales_score, 20);
    assert.equal(cuong.prod_score, 20);
    assert.equal(cuong.total_score, 60);

    assert.equal(wk.all_rounder!.member_id, "M1");
});

test("Giải C — nhóm trực ca xét riêng từng ca, 70/30", () => {
    const wk = computeWeek(makeInput(), W1);
    const s1 = wk.shift_groups.find((g) => g.shift_id === "S1")!;
    const s2 = wk.shift_groups.find((g) => g.shift_id === "S2")!;

    assert.equal(s1.group_sales, 80);
    assert.equal(s1.equivalent_per_member, 40);
    assert.equal(s1.avg_reputation, 97.5); // (100 + 95) / 2
    assert.equal(s1.sales_score, 70); // 80/80 × 70
    assert.equal(s1.rep_score, 29.25); // 97.5/100 × 30
    assert.equal(s1.total_score, 99.25);

    assert.equal(s2.sales_score, 35); // 40/80 × 70
    assert.equal(s2.rep_score, 30); // 100/100 × 30
    assert.equal(s2.total_score, 65);

    // Podium tối đa 3 hạng, xếp theo điểm nhóm.
    assert.deepEqual(wk.podium.map((g) => g.shift_id), ["S1", "S2"]);
    assert.equal(s2.type_label, "Bán ngoài");
    assert.equal(s1.type_label, "Kênh chính");
});

test("Chỉ tính các ca có hoạt động trong tuần đang xét", () => {
    const wk1 = computeWeek(makeInput(), W1);
    const wk2 = computeWeek(makeInput(), W2);
    assert.deepEqual(wk1.shift_groups.map((g) => g.shift_id).sort(), ["S1", "S2"]);
    assert.deepEqual(wk2.shift_groups.map((g) => g.shift_id), ["S3"]);
    // Tuần 3 chưa có dữ liệu → không có ca, không có giải.
    const wk3 = computeWeek(makeInput(), W3);
    assert.equal(wk3.shift_groups.length, 0);
    assert.equal(wk3.best_seller, null);
    assert.equal(wk3.all_rounder, null);
});

test("Vắng không phép bị trừ 20 và không tính vào số người chia ca", () => {
    // Bình vắng ca S1 nên không có giao dịch nào của Bình trong tuần.
    const input = makeInput({
        sales: [
            sale("TX1", W1, "S1", "M1", 60),
            sale("TX3", W1, "S2", "M3", 30),
            sale("TX4", W1, "S2", "M4", 10),
        ],
        incidents: [
            { id: 2, week: W1, shift_id: "S1", status_type: "Vắng không phép", absent_member_id: "M2" },
        ],
    });
    const wk = computeWeek(input, W1);
    const an = byId(wk.members, "M1");
    const binh = byId(wk.members, "M2");

    assert.equal(binh.penalty_total, 20);
    assert.equal(binh.reputation, 80);
    // Bình bị loại khỏi mẫu số → An gánh trọn 60 sp của ca S1.
    assert.equal(an.equivalent_sales, 60);
    assert.equal(an.shifts_participated, 1);
    assert.equal(binh.shifts_participated, 0);
    assert.equal(binh.participated, false);
    // Người vắng không kéo điểm uy tín trung bình của ca xuống nữa.
    assert.equal(wk.shift_groups.find((g) => g.shift_id === "S1")!.member_count, 1);

    // Tắt cờ thì quay lại chia đều cho cả người vắng.
    const cfg = { ...input.config, exclude_absent_from_shift_count: false };
    const wkKeep = computeWeek({ ...input, config: cfg }, W1);
    assert.equal(byId(wkKeep.members, "M1").equivalent_sales, 30);
    assert.equal(byId(wkKeep.members, "M2").equivalent_sales, 30);
    assert.equal(byId(wkKeep.members, "M2").shifts_participated, 1);
});

test("Tập thể Ban — đóng góp TB chia theo số người THỰC tham gia", () => {
    const wk = computeWeek(makeInput(), W1);
    const tt = wk.departments.find((d) => d.department.includes("Truyền Thông"))!;
    const hc = wk.departments.find((d) => d.department.includes("Hậu Cần"))!;

    assert.equal(tt.member_participated, 2);
    assert.equal(tt.total_equivalent_sales, 80);
    assert.equal(tt.avg_contribution, 40); // 80 / 2 người tham gia
    assert.equal(tt.avg_productivity, 40); // 80 / 2 ca
    assert.equal(tt.avg_reputation, 97.5);
    assert.equal(tt.sales_score, 40);
    assert.equal(tt.prod_score, 40);
    assert.equal(tt.rep_score, 19.5); // 97.5/100 × 20 — uy tín cũng được chuẩn hoá
    assert.equal(tt.total_score, 99.5);

    assert.equal(hc.avg_contribution, 20);
    assert.equal(hc.sales_score, 20);
    assert.equal(hc.rep_score, 20);
    assert.equal(hc.total_score, 60);
});

test("TỔNG KẾT A — Best Seller cộng dồn 3 tuần có thể khác người thắng tuần", () => {
    const project = computeProject(makeInput());
    // An thắng tuần 1 (60 sp) nhưng Cường cộng dồn 30 + 50 = 80 sp.
    assert.equal(project.weeks[0].best_seller!.member_id, "M1");
    assert.equal(project.best_seller_project[0].member_id, "M3");
    assert.equal(project.best_seller_project[0].total_individual_sales, 80);
});

test("TỔNG KẾT B — trung bình điểm đã chuẩn hoá, không dồn dữ liệu thô", () => {
    const project = computeProject(makeInput());
    const an = project.all_round_project.find((p) => p.member_id === "M1")!;
    const cuong = project.all_round_project.find((p) => p.member_id === "M3")!;

    // An chỉ làm tuần 1 → chỉ lấy trung bình trên tuần có tham gia.
    assert.equal(an.weeks_counted, 1);
    assert.equal(an.week_scores[W1], 100);
    assert.equal(an.week_scores[W2], null);
    assert.equal(an.week_scores[W3], null);
    assert.equal(an.avg_total_score, 100);

    // Cường: tuần 1 = 60 điểm, tuần 2 = 100 điểm (một mình nên là mốc cao nhất).
    assert.equal(cuong.weeks_counted, 2);
    assert.equal(cuong.week_scores[W1], 60);
    assert.equal(cuong.week_scores[W2], 100);
    assert.equal(cuong.avg_total_score, 80);

    // Nhờ lấy trung bình chuẩn hoá, người làm ít ca không bị vùi.
    assert.equal(project.all_round_project[0].member_id, "M1");
    // Điểm thành phần trung bình cũng phải cộng lại đúng tổng.
    assert.equal(
        Math.round((cuong.avg_sales_score + cuong.avg_prod_score + cuong.avg_rep_score) * 100) / 100,
        cuong.avg_total_score,
    );
});

test("TỔNG KẾT C — Ban tính trên 3 tuần bằng trung bình, bỏ lợi thế đông người", () => {
    const project = computeProject(makeInput());
    const tt = project.departments.find((d) => d.department.includes("Truyền Thông"))!;
    const hc = project.departments.find((d) => d.department.includes("Hậu Cần"))!;

    // Truyền Thông: 80 quy đổi / 2 người / 2 ca. Hậu Cần: 40 + 50 = 90 quy đổi / 2 người / 3 ca.
    assert.equal(tt.total_equivalent_sales, 80);
    assert.equal(hc.total_equivalent_sales, 90);
    assert.equal(tt.avg_contribution, 40);
    assert.equal(hc.avg_contribution, 45);
    assert.equal(tt.avg_productivity, 40); // 80 / 2 ca
    assert.equal(hc.avg_productivity, 30); // 90 / 3 ca
    // Chuẩn hoá theo Ban dẫn đầu từng hạng mục.
    assert.equal(hc.sales_score, 40);
    assert.equal(tt.sales_score, round2((40 / 45) * 40));
    assert.equal(tt.prod_score, 40);
    assert.equal(hc.prod_score, 30); // 30/40 × 40
    // Tổng điểm mỗi Ban là tổng 3 thành phần.
    [tt, hc].forEach((d) => {
        assert.equal(
            Math.round((d.sales_score + d.prod_score + d.rep_score) * 100) / 100,
            d.total_score,
        );
    });
});

test("Xác định tuần: ưu tiên nhãn, sau đó suy ra từ mốc thời gian", () => {
    assert.equal(resolveWeek({ week: W2 }, DEFAULT_WEEKS, "01/09/2026"), W2);
    // Không có nhãn → tính theo block 7 ngày kể từ ngày bắt đầu.
    assert.equal(resolveWeek({ timestamp: "03/09/2026 10:00" }, DEFAULT_WEEKS, "01/09/2026"), W1);
    assert.equal(resolveWeek({ timestamp: "09/09/2026 10:00" }, DEFAULT_WEEKS, "01/09/2026"), W2);
    assert.equal(resolveWeek({ timestamp: "16/09/2026 10:00" }, DEFAULT_WEEKS, "01/09/2026"), W3);
    // Ngoài chu kỳ thì kẹp về tuần cuối, thiếu dữ liệu thì về tuần đầu.
    assert.equal(resolveWeek({ timestamp: "30/12/2026" }, DEFAULT_WEEKS, "01/09/2026"), W3);
    assert.equal(resolveWeek({}, DEFAULT_WEEKS, "01/09/2026"), W1);
});

test("Giao dịch hoàn trả không được tính vào bất kỳ giải nào", () => {
    const input = makeInput();
    input.sales = input.sales.map((tx) =>
        tx.id === "TX1" ? { ...tx, refunded: true } : tx,
    );
    const wk = computeWeek(input, W1);
    assert.equal(byId(wk.members, "M1").individual_sales, 0);
    // Ca S1 chỉ còn 20 sp → 10 sp mỗi người.
    assert.equal(wk.shift_groups.find((g) => g.shift_id === "S1")!.group_sales, 20);
    assert.equal(byId(wk.members, "M1").equivalent_sales, 10);
});

test("Cấu hình: chuẩn hoá bản lưu và giữ nguyên token đồng bộ", () => {
    const cfg = normalizeCompetitionConfig(
        { active_week: W2, base_reputation: 90, penalties: { "Đi trễ": 7 }, locked_weeks: [W1] },
        "fallback-token",
    );
    assert.equal(cfg.active_week, W2);
    assert.equal(cfg.base_reputation, 90);
    assert.equal(cfg.penalties["Đi trễ"], 7);
    assert.deepEqual(cfg.locked_weeks, [W1]);
    assert.equal(cfg.sheet.token, "fallback-token");
    // Bản lưu rỗng vẫn phải ra cấu hình dùng được.
    const blank = normalizeCompetitionConfig(undefined, "t");
    assert.deepEqual(blank.weeks, DEFAULT_WEEKS);
    assert.equal(blank.weights.ind_sales, 40);
    assert.equal(blank.weights.grp_sales, 70);
});

test("Đổi bảng điểm trừ trong cấu hình phải ra kết quả khác", () => {
    const input = makeInput();
    const cfg = { ...input.config, penalties: { ...input.config.penalties, "Đi trễ": 50 } };
    const wk = computeWeek({ ...input, config: cfg }, W1);
    assert.equal(byId(wk.members, "M2").reputation, 50);
    assert.equal(byId(wk.members, "M2").rep_score, 10);
});

test("Tuần đã chốt được đánh dấu locked", () => {
    const input = makeInput();
    const cfg = { ...input.config, locked_weeks: [W1] };
    assert.equal(computeWeek({ ...input, config: cfg }, W1).locked, true);
    assert.equal(computeWeek({ ...input, config: cfg }, W2).locked, false);
});

test("Quy chế hiển thị được sinh từ cấu hình đang chạy", () => {
    const cfg = makeDefaultCompetitionConfig("t");
    const table = describeFormulas(cfg);
    const flat = table.rows.map((r) => r.join(" | ")).join("\n");
    assert.match(flat, /40/);
    assert.match(flat, /70/);
    assert.match(flat, /Đi trễ/);
    // Đổi trọng số thì bảng quy chế phải đổi theo, không hard-code.
    const custom = describeFormulas({
        ...cfg,
        weights: { ...cfg.weights, ind_sales: 55 },
    });
    assert.match(custom.rows.map((r) => r.join(" ")).join("\n"), /55/);
});

test("Bảng xuất Sheet có đủ tab và CSV escape đúng", () => {
    const input = makeInput();
    const tables = buildSheetTables(input, computeProject(input));
    const names = tables.map((t) => t.name);
    [
        "TONG_QUAN", "CHI_TIET_TUAN", "NHOM_TRUC_CA", "BEST_SELLER_TONG_KET",
        "ALL_ROUND_PROJECT", "TAP_THE_BAN", "NHAT_KY_VI_PHAM", "QUY_CHE",
        "NHAP_BAN_HANG", "NHAP_VI_PHAM",
    ].forEach((n) => assert.ok(names.includes(n), `thiếu tab ${n}`));
    // key là slug dùng cho ?tab=, phải là duy nhất.
    const keys = tables.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);

    tables.forEach((t) => {
        t.rows.forEach((r) => assert.equal(r.length, t.headers.length, `lệch cột ở ${t.key}`));
    });

    const csv = tableToCsv({
        key: "T", name: "T",
        headers: ["a", "b"],
        rows: [['có "trích dẫn"', "có, dấu phẩy"]],
    });
    assert.equal(csv, 'a,b\r\n"có ""trích dẫn""","có, dấu phẩy"');
});

const round2 = (n: number) => Math.round(n * 100) / 100;
