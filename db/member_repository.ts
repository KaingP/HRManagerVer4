import Database from "better-sqlite3";
import {
    DAYS_LIST,
    LEGACY_SLOT_MAP,
    Member,
    SLOT_KEYS,
} from "../src/data_loader";

type MemberRow = {
    id: string;
    name: string;
    department: string | null;
    residence: string | null;
    vehicle: string | null;
    job: string | null;
    school: string | null;
    phone: string | null;
    is_standby: number;
    min_shifts: number;
    max_shifts: number;
};

function withAvailability(
    member: Member,
    availability: Set<string>,
    commitments: Set<string>,
): Member {
    const memberAvailability: Record<string, boolean> = {};
    const committedSlots: Record<string, boolean> = {};

    for (const day of DAYS_LIST) {
        for (const slot of SLOT_KEYS) {
            const key = `${day}|${slot}`;
            const legacySlot = LEGACY_SLOT_MAP[slot];
            const free = availability.has(key);
            const committed = commitments.has(key);
            memberAvailability[key] = free;
            committedSlots[key] = committed;
            if (legacySlot) {
                memberAvailability[`${day}|${legacySlot}`] = free;
                committedSlots[`${day}|${legacySlot}`] = committed;
            }
        }
    }

    return {
        ...member,
        availability: memberAvailability,
        committed_slots: committedSlots,
        total_free_slots: SLOT_KEYS.reduce(
            (count, slot) =>
                count +
                DAYS_LIST.filter((day) => availability.has(`${day}|${slot}`))
                    .length,
            0,
        ),
    };
}

export function countMembers(db: Database.Database): number {
    return Number(
        (
            db
                .prepare(
                    "SELECT COUNT(*) AS count FROM member WHERE active = 1",
                )
                .get() as {
                count: number;
            }
        ).count,
    );
}

export function replaceMembers(db: Database.Database, members: Member[]): void {
    const write = db.transaction(() => {
        db.prepare("UPDATE member SET active = 0").run();
        const insertMember = db.prepare(`
            INSERT INTO member(
                id, name, department, residence, vehicle, job, school, phone,
                is_standby, min_shifts, max_shifts, total_free_slots, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                department=excluded.department,
                residence=excluded.residence,
                vehicle=excluded.vehicle,
                job=excluded.job,
                school=excluded.school,
                phone=excluded.phone,
                is_standby=excluded.is_standby,
                min_shifts=excluded.min_shifts,
                max_shifts=excluded.max_shifts,
                total_free_slots=excluded.total_free_slots,
                active=1
        `);
        const clearAvailability = db.prepare(
            "DELETE FROM member_availability WHERE member_id = ?",
        );
        const clearCommitment = db.prepare(
            "DELETE FROM member_commitment WHERE member_id = ?",
        );
        const insertAvailability = db.prepare(
            "INSERT OR IGNORE INTO member_availability(member_id, day, slot) VALUES (?, ?, ?)",
        );
        const insertCommitment = db.prepare(
            "INSERT OR IGNORE INTO member_commitment(member_id, day, slot) VALUES (?, ?, ?)",
        );

        for (const member of members) {
            insertMember.run(
                member.member_id,
                member.name,
                member.department || null,
                member.residence || null,
                member.vehicle || null,
                member.job || null,
                member.school || null,
                member.phone || null,
                member.is_standby ? 1 : 0,
                member.min_shifts,
                member.max_shifts,
                member.total_free_slots,
            );
            clearAvailability.run(member.member_id);
            clearCommitment.run(member.member_id);
            for (const day of DAYS_LIST) {
                for (const slot of SLOT_KEYS) {
                    if (member.availability[`${day}|${slot}`]) {
                        insertAvailability.run(member.member_id, day, slot);
                    }
                    if (member.committed_slots[`${day}|${slot}`]) {
                        insertCommitment.run(member.member_id, day, slot);
                    }
                }
            }
        }
    });
    write();
}

export function loadMembers(db: Database.Database): Member[] {
    const rows = db
        .prepare(
            `
        SELECT id, name, department, residence, vehicle, job, school, phone,
               is_standby, min_shifts, max_shifts
        FROM member WHERE active = 1 ORDER BY id
    `,
        )
        .all() as MemberRow[];
    const availabilityRows = db
        .prepare("SELECT member_id, day, slot FROM member_availability")
        .all() as { member_id: string; day: string; slot: string }[];
    const commitmentRows = db
        .prepare("SELECT member_id, day, slot FROM member_commitment")
        .all() as { member_id: string; day: string; slot: string }[];
    const availability = new Map<string, Set<string>>();
    const commitments = new Map<string, Set<string>>();

    for (const row of availabilityRows) {
        if (!availability.has(row.member_id))
            availability.set(row.member_id, new Set());
        availability.get(row.member_id)!.add(`${row.day}|${row.slot}`);
    }
    for (const row of commitmentRows) {
        if (!commitments.has(row.member_id))
            commitments.set(row.member_id, new Set());
        commitments.get(row.member_id)!.add(`${row.day}|${row.slot}`);
    }

    return rows.map((row) =>
        withAvailability(
            {
                member_id: row.id,
                name: row.name,
                department: row.department || "",
                residence: row.residence || "",
                vehicle: row.vehicle || "",
                job: row.job || "",
                school: row.school || "",
                phone: row.phone || "",
                is_standby: Boolean(row.is_standby),
                availability: {},
                committed_slots: {},
                total_free_slots: 0,
                min_shifts: row.min_shifts,
                max_shifts: row.max_shifts,
            },
            availability.get(row.id) || new Set(),
            commitments.get(row.id) || new Set(),
        ),
    );
}
