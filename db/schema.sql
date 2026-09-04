PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS app_process_lock (
    name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

-- =========================================================
-- 1. THÀNH VIÊN
-- =========================================================
CREATE TABLE IF NOT EXISTS member (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT,
    residence TEXT,
    vehicle TEXT,
    job TEXT,
    school TEXT,
    phone TEXT,
    is_standby INTEGER NOT NULL DEFAULT 0,
    min_shifts INTEGER NOT NULL DEFAULT 3,
    max_shifts INTEGER NOT NULL DEFAULT 5,
    total_free_slots INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_member_department ON member(department);
CREATE INDEX IF NOT EXISTS idx_member_phone ON member(phone);

-- Availability & Commitment: chỉ lưu (day, slot) có giá trị true để tiết kiệm
CREATE TABLE IF NOT EXISTS member_availability (
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    PRIMARY KEY (member_id, day, slot)
);
CREATE INDEX IF NOT EXISTS idx_avail_day_slot ON member_availability(day, slot);

CREATE TABLE IF NOT EXISTS member_commitment (
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    PRIMARY KEY (member_id, day, slot)
);

-- =========================================================
-- 2 + 3 + 4. LỊCH TRỰC
-- =========================================================
CREATE TABLE IF NOT EXISTS shift (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'Phong',           -- Phong | Ngoai
    type_label TEXT,
    day TEXT NOT NULL,
    date TEXT,
    slot TEXT,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    required_count INTEGER NOT NULL DEFAULT 0,
    chinh_count INTEGER NOT NULL DEFAULT 0,
    dp_count INTEGER NOT NULL DEFAULT 0,
    backup_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    overlapping_slots_json TEXT,
    shift_leader TEXT,
    is_filled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shift_date ON shift(date);
CREATE INDEX IF NOT EXISTS idx_shift_type_day ON shift(type, day);

CREATE TABLE IF NOT EXISTS shift_assignment (
    shift_id TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                 -- Chính | Dự phòng
    position_role TEXT,
    is_standby INTEGER NOT NULL DEFAULT 0,
    is_committed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (shift_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_member ON shift_assignment(member_id);

CREATE TABLE IF NOT EXISTS optimizer_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    start_date TEXT,
    phong_chinh_count INTEGER NOT NULL DEFAULT 4,
    phong_dp_count INTEGER NOT NULL DEFAULT 1,
    min_shifts INTEGER NOT NULL DEFAULT 3,
    max_shifts INTEGER NOT NULL DEFAULT 5,
    max_shifts_per_day INTEGER NOT NULL DEFAULT 2,
    enable_ca_ngoai INTEGER NOT NULL DEFAULT 1,
    daily_shift_configs_json TEXT NOT NULL DEFAULT '[]',
    custom_ca_ngoai_json TEXT NOT NULL DEFAULT '[]'
);

-- =========================================================
-- 5. ĐIỂM DANH & SỰ CỐ
-- =========================================================
CREATE TABLE IF NOT EXISTS attendance_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    status TEXT NOT NULL,    -- Có mặt | Đi trễ | Vắng KP | Xin nghỉ | Hủy ca
    late_minutes INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (shift_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_att_member_status ON attendance_record(member_id, status);
CREATE INDEX IF NOT EXISTS idx_att_shift ON attendance_record(shift_id);

CREATE TABLE IF NOT EXISTS kpi_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    name TEXT NOT NULL,
    day TEXT NOT NULL,
    slot TEXT NOT NULL,
    role TEXT,
    type TEXT,
    status TEXT,
    shift_id TEXT,
    date TEXT,
    week TEXT
);
CREATE INDEX IF NOT EXISTS idx_kpi_member ON kpi_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_kpi_shift ON kpi_attendance(shift_id);
CREATE INDEX IF NOT EXISTS idx_kpi_week ON kpi_attendance(week);

CREATE TABLE IF NOT EXISTS shift_incident (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    day TEXT,
    date TEXT,
    slot TEXT,
    location TEXT,
    status_type TEXT,
    late_minutes INTEGER NOT NULL DEFAULT 0,
    absent_member TEXT,
    absent_member_id TEXT,
    replacement_member TEXT,
    replacement_member_id TEXT,
    response_time TEXT,
    unreachable_ids_json TEXT,
    resolution TEXT,
    note TEXT,
    timestamp TEXT,
    week TEXT
);
CREATE INDEX IF NOT EXISTS idx_inc_shift ON shift_incident(shift_id);
CREATE INDEX IF NOT EXISTS idx_inc_week ON shift_incident(week);

-- =========================================================
-- 6. KỶ LUẬT
-- =========================================================
CREATE TABLE IF NOT EXISTS discipline_score (
    member_id TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    current_points INTEGER NOT NULL DEFAULT 100,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discipline_log (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    type TEXT NOT NULL,    -- Cộng điểm | Trừ điểm
    points_change INTEGER NOT NULL,
    old_points INTEGER NOT NULL,
    new_points INTEGER NOT NULL,
    reason TEXT,
    performed_by TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dl_member_ts ON discipline_log(member_id, timestamp);

-- =========================================================
-- 7-10. THI ĐUA
-- =========================================================
CREATE TABLE IF NOT EXISTS competition_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_week TEXT,
    weeks_json TEXT NOT NULL DEFAULT '["Tuần 1","Tuần 2","Tuần 3"]',
    weights_json TEXT NOT NULL DEFAULT '{}',
    sheet_token TEXT,
    sheet_url TEXT,
    reputation_rules_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS competition_week (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_tag TEXT NOT NULL UNIQUE,
    closed_at TEXT,
    total_sales REAL NOT NULL DEFAULT 0,
    total_revenue REAL NOT NULL DEFAULT 0,
    total_shifts INTEGER NOT NULL DEFAULT 0,
    total_members INTEGER NOT NULL DEFAULT 0,
    total_incidents INTEGER NOT NULL DEFAULT 0,
    best_seller_id TEXT,
    best_allrounder_id TEXT
);

-- =========================================================
-- 11. KHO & BÁN
-- =========================================================
CREATE TABLE IF NOT EXISTS product (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Phần',
    price INTEGER NOT NULL DEFAULT 0,
    initial_stock INTEGER NOT NULL DEFAULT 0,
    sold_count INTEGER NOT NULL DEFAULT 0,
    note TEXT
);

CREATE TABLE IF NOT EXISTS sale_transaction (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL DEFAULT 0,
    channel TEXT,
    shift_id TEXT,
    seller TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    payment_method TEXT,
    note TEXT,
    refunded INTEGER NOT NULL DEFAULT 0,
    week TEXT
);
CREATE INDEX IF NOT EXISTS idx_sale_shift_ts ON sale_transaction(shift_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sale_product_ts ON sale_transaction(product_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sale_week ON sale_transaction(week);

CREATE TABLE IF NOT EXISTS restock_receipt (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    creator TEXT NOT NULL,
    supplier TEXT,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_cost INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS restock_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id TEXT NOT NULL REFERENCES restock_receipt(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Phần',
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost INTEGER,
    total_cost INTEGER,
    note TEXT
);

CREATE TABLE IF NOT EXISTS shift_audit (
    id TEXT PRIMARY KEY,
    shift_id TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    auditor TEXT NOT NULL,
    summary_note TEXT,
    overall_status TEXT,
    total_diff INTEGER NOT NULL DEFAULT 0,
    carried_forward_shift TEXT,
    resolved_count INTEGER,
    unresolved_count INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_shift_ts ON shift_audit(shift_id, timestamp);

CREATE TABLE IF NOT EXISTS shift_audit_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id TEXT NOT NULL REFERENCES shift_audit(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Phần',
    expected_stock INTEGER NOT NULL DEFAULT 0,
    actual_stock INTEGER NOT NULL DEFAULT 0,
    diff INTEGER NOT NULL DEFAULT 0,
    carried_from_prev INTEGER,
    resolution_type TEXT,
    resolution_note TEXT,
    resolved_by TEXT,
    resolved_at TEXT,
    is_resolved INTEGER NOT NULL DEFAULT 0,
    carry_to_shift TEXT,
    carry_qty INTEGER,
    unit_price INTEGER,
    note TEXT
);

CREATE TABLE IF NOT EXISTS online_order (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    class_name TEXT,
    pickup_date TEXT NOT NULL,
    pickup_time_slot TEXT NOT NULL,
    shift_id TEXT REFERENCES shift(id) ON DELETE SET NULL,
    shift_label TEXT,
    total_amount INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'Chưa thanh toán',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_pickup_date ON online_order(pickup_date);

CREATE TABLE IF NOT EXISTS online_order_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES online_order(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price INTEGER NOT NULL DEFAULT 0,
    total_price INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pickup_request (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    total_amount INTEGER NOT NULL DEFAULT 0,
    pickup_time TEXT NOT NULL,
    shift_id TEXT REFERENCES shift(id) ON DELETE SET NULL,
    shift_label TEXT,
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    inventory_deducted INTEGER NOT NULL DEFAULT 0,
    qr_url TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_timestamp INTEGER NOT NULL,
    approved_at TEXT,
    cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pickup_status_time ON pickup_request(status, pickup_time);
CREATE INDEX IF NOT EXISTS idx_pickup_member ON pickup_request(member_id);

CREATE TABLE IF NOT EXISTS pickup_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL REFERENCES pickup_request(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES product(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price INTEGER NOT NULL DEFAULT 0,
    total_price INTEGER NOT NULL DEFAULT 0
);

-- =========================================================
-- 12. AUTH & CẤU HÌNH
-- =========================================================
CREATE TABLE IF NOT EXISTS admin_password (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_password (
    member_id TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vietqr_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bank_id TEXT NOT NULL,
    account_no TEXT NOT NULL,
    account_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_notification (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    shift_id TEXT,
    shift_day TEXT,
    shift_slot TEXT,
    absent_member_id TEXT,
    absent_member_name TEXT,
    backup_member_id TEXT,
    backup_member_name TEXT,
    target_role TEXT NOT NULL DEFAULT 'all',
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    timestamp_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_resolved_ts ON system_notification(resolved, created_at);

-- =========================================================
-- VIEW: Member stats (nhóm 3)
-- =========================================================
CREATE VIEW IF NOT EXISTS v_member_stats AS
SELECT
    m.id AS member_id,
    m.name,
    m.department,
    COUNT(DISTINCT CASE WHEN s.type='Phong' THEN a.shift_id END) AS phong_shifts,
    COUNT(DISTINCT CASE WHEN s.type='Ngoai' THEN a.shift_id END) AS ngoai_shifts,
    COUNT(DISTINCT a.shift_id) AS total_shifts
FROM member m
LEFT JOIN shift_assignment a ON a.member_id = m.id
LEFT JOIN shift s ON s.id = a.shift_id
GROUP BY m.id;

-- =========================================================
-- VIEW: Schedule audit (nhóm 4)
-- =========================================================
CREATE VIEW IF NOT EXISTS v_schedule_audit AS
SELECT
    s.id AS shift_id,
    s.day,
    s.date,
    s.slot,
    s.required_count,
    COUNT(a.member_id) AS filled_count,
    CASE WHEN COUNT(a.member_id) < s.required_count THEN 'THIEU_NGUOI' ELSE 'OK' END AS status
FROM shift s
LEFT JOIN shift_assignment a ON a.shift_id = s.id
GROUP BY s.id;