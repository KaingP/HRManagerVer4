import * as fs from 'fs';
import * as path from 'path';
import * as xlsx from 'xlsx';

export interface Shift {
  shift_id: string;
  type: 'Phong' | 'Ngoai';
  type_label: string;
  day: string;
  date: string;
  location: string;
  start_time: string;
  end_time: string;
  slot: string;
  required_count: number;
  backup_count: number;
  active: boolean;
  note: string;
  chinh_count?: number;
  dp_count?: number;
  overlapping_slots?: string[];
}

export interface Member {
  member_id: string;
  name: string;
  department: string;
  residence: string;
  vehicle: string;
  job: string;
  school: string;
  phone: string;
  is_standby: boolean;
  availability: { [key: string]: boolean }; // key: "Day|Slot"
  committed_slots: { [key: string]: boolean }; // key: "Day|Slot"
  total_free_slots: number;
  min_shifts: number;
  max_shifts: number;
}

export const DAY_MAP: { [key: string]: string } = {
  'thứ 2': 'Thứ 2',
  'thứ hai': 'Thứ 2',
  'thứ2': 'Thứ 2',
  't2': 'Thứ 2',
  'thứ 3': 'Thứ 3',
  'thứ ba': 'Thứ 3',
  'thứ3': 'Thứ 3',
  't3': 'Thứ 3',
  'thứ 4': 'Thứ 4',
  'thứ tư': 'Thứ 4',
  'thứ4': 'Thứ 4',
  't4': 'Thứ 4',
  'thứ 5': 'Thứ 5',
  'thứ năm': 'Thứ 5',
  'thứ5': 'Thứ 5',
  't5': 'Thứ 5',
  'thứ 6': 'Thứ 6',
  'thứ sáu': 'Thứ 6',
  'thứ6': 'Thứ 6',
  't6': 'Thứ 6',
  'thứ 7': 'Thứ 7',
  'thứ bảy': 'Thứ 7',
  'thứ bẩy': 'Thứ 7',
  'thứ7': 'Thứ 7',
  't7': 'Thứ 7',
  'chủ nhật': 'Chủ Nhật',
  'cn': 'Chủ Nhật'
};

export const SLOT_KEYS = [
  '07h00 - 09h30',
  '09h35 - 12h00',
  '12h05 - 14h00',
  '14h05 - 16h05',
  '16h10 - 18h00'
];

export const LEGACY_SLOT_MAP: { [key: string]: string } = {
  '7h - 9h': '07h00 - 09h30',
  '9h - 11h': '09h35 - 12h00',
  '11h - 13h': '12h05 - 14h00',
  '13h - 15h': '14h05 - 16h05',
  '15h - 17h': '16h10 - 18h00',
  '07h00 - 09h30': '7h - 9h',
  '09h35 - 12h00': '9h - 11h',
  '12h05 - 14h00': '11h - 13h',
  '14h05 - 16h05': '13h - 15h',
  '16h10 - 18h00': '15h - 17h'
};

export const DAYS_LIST = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export const DAY_ORDER: { [key: string]: number } = {
  'Thứ 2': 0,
  'Thứ 3': 1,
  'Thứ 4': 2,
  'Thứ 5': 3,
  'Thứ 6': 4,
  'Thứ 7': 5,
  'Chủ Nhật': 6
};

export function calculateDateForDay(startDateStr: string, dayName: string): string {
  if (!startDateStr) return '';
  let baseDate: Date;
  if (startDateStr.includes('-')) {
    const parts = startDateStr.split('-').map(Number);
    baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
  } else if (startDateStr.includes('/')) {
    const parts = startDateStr.split('/').map(Number);
    if (parts[2] > 1000) {
      baseDate = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  } else {
    baseDate = new Date(startDateStr);
  }

  if (isNaN(baseDate.getTime())) return '';

  const offset = DAY_ORDER[dayName] !== undefined ? DAY_ORDER[dayName] : 0;
  const targetDate = new Date(baseDate);
  targetDate.setDate(baseDate.getDate() + offset);

  const dd = String(targetDate.getDate()).padStart(2, '0');
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const yyyy = targetDate.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function parseDaysFromText(text: any): Set<string> {
  const days = new Set<string>();
  if (text === null || text === undefined || text === '') return days;
  const textStr = String(text).trim();
  const textLower = textStr.toLowerCase();
  if (textLower.includes('không rảnh') || textLower.includes('ko rảnh') || textLower.includes('bận')) {
    return days;
  }
  for (const [rawKey, standardDay] of Object.entries(DAY_MAP)) {
    const escaped = rawKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(textLower) || textLower.includes(rawKey)) {
      days.add(standardDay);
    }
  }
  return days;
}

export function excelNumToTime(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return str;
}

export function normalizeTimeSlot(startTime: any, endTime: any): string {
  const sStr = excelNumToTime(startTime);
  const eStr = excelNumToTime(endTime);

  if (sStr.includes('07:') || sStr.startsWith('7:') || sStr.startsWith('7h')) {
    return '07h00 - 09h30';
  } else if (sStr.includes('09:') || sStr.startsWith('9:') || sStr.startsWith('9h')) {
    return '09h35 - 12h00';
  } else if (sStr.includes('11:') || sStr.includes('12:00') || sStr.includes('12:05') || sStr.startsWith('11h') || sStr.startsWith('12h')) {
    return '12h05 - 14h00';
  } else if (sStr.includes('13:') || sStr.includes('14:') || sStr.startsWith('13h') || sStr.startsWith('14h')) {
    return '14h05 - 16h05';
  } else if (sStr.includes('15:') || sStr.includes('16:') || sStr.startsWith('15h') || sStr.startsWith('16h')) {
    return '16h10 - 18h00';
  } else if (sStr.includes('17:') || sStr.includes('17h')) {
    return '17h00 - 19h30';
  }
  return `${sStr} - ${eStr}`;
}

export function loadShiftsMaster(filePath: string = "Danh_sach_ca.xlsx"): Shift[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets['CaTruc'];
  if (!sheet) return [];
  const rows = xlsx.utils.sheet_to_json<any>(sheet);
  const shifts: Shift[] = [];

  for (const row of rows) {
    const shiftId = String(row['Mã ca'] || '').trim();
    if (!shiftId) continue;
    const shiftType = String(row['Loại'] || '').trim();
    const dayName = String(row['Thứ'] || '').trim();
    const dateVal = String(row['Ngày'] || '').trim();
    const location = String(row['Điểm bán'] || '').trim();
    const rawStart = excelNumToTime(row['Bắt đầu']);
    const rawEnd = excelNumToTime(row['Kết thúc']);
    const isPhong = shiftType.toLowerCase().includes('phong');

    let startT = rawStart.length >= 5 ? rawStart.slice(0, 5) : rawStart;
    let endT = rawEnd.length >= 5 ? rawEnd.slice(0, 5) : rawEnd;
    let slot = normalizeTimeSlot(startT, endT);
    let note = row['Ghi chú'] && row['Ghi chú'] !== 'nan' ? String(row['Ghi chú']) : '';
    let reqCount = parseInt(row['Số người trực']);

    if (isPhong) {
      if (slot === '07h00 - 09h30' || shiftId.endsWith('1') || shiftId.endsWith('6')) {
        startT = '07:00'; endT = '09:30'; slot = '07h00 - 09h30'; reqCount = 5;
        note = note || 'Khách đông đột biến vào giờ ra chơi; cần setup phòng trực sớm.';
      } else if (slot === '09h35 - 12h00' || shiftId.endsWith('2') || shiftId.endsWith('7')) {
        startT = '09:35'; endT = '12:00'; slot = '09h35 - 12h00'; reqCount = 5;
        note = note || 'Học sinh tan trường & nghỉ trưa, lượng khách (HS/GV) đông.';
      } else if (slot === '12h05 - 14h00' || shiftId.endsWith('3') || shiftId.endsWith('8')) {
        startT = '12:05'; endT = '14:00'; slot = '12h05 - 14h00'; reqCount = 4;
        note = note || 'Học sinh chuẩn bị vào ca chiều, lượng khách ổn định.';
      } else if (slot === '14h05 - 16h05' || shiftId.endsWith('4') || shiftId.endsWith('9')) {
        startT = '14:05'; endT = '16:05'; slot = '14h05 - 16h05'; reqCount = 5;
        note = note || 'Giờ ra chơi chiều & tan tiết cuối, cần phục vụ nhanh.';
      } else if (slot === '16h10 - 18h00' || shiftId.endsWith('5') || shiftId.endsWith('0')) {
        startT = '16:10'; endT = '18:00'; slot = '16h10 - 18h00'; reqCount = 5;
        note = note || 'Học sinh ra về; cần bán hàng, dọn dẹp, kiểm kê & khóa cửa.';
      }
    }

    if (isNaN(reqCount) || reqCount <= 0) {
      reqCount = isPhong ? 5 : 3;
    }

    shifts.push({
      shift_id: shiftId,
      type: isPhong ? 'Phong' : 'Ngoai',
      type_label: isPhong ? 'Phòng Thanh Niên' : 'Điểm bán ngoài',
      day: dayName,
      date: dateVal,
      location: location && location !== 'nan' && location !== 'undefined' ? location : (isPhong ? 'Phòng Thanh Niên' : 'Điểm bán ngoài'),
      start_time: startT,
      end_time: endT,
      slot: slot,
      required_count: reqCount,
      chinh_count: slot === '12h05 - 14h00' ? 3 : 4,
      dp_count: 1,
      backup_count: 1,
      active: true,
      note: note
    });
  }
  return shifts;
}

export function parseMembersDf(rows: any[], sheet?: xlsx.WorkSheet): Member[] {
  const members: Member[] = [];
  if ((!rows || rows.length === 0) && !sheet) return members;

  // Build matrix representation
  let matrix: any[][] = [];

  if (sheet) {
    matrix = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  } else if (rows && rows.length > 0) {
    if (Array.isArray(rows[0])) {
      matrix = rows;
    } else {
      const keys = Object.keys(rows[0]);
      matrix.push(keys);
      for (const rowObj of rows) {
        matrix.push(keys.map(k => rowObj[k]));
      }
    }
  }

  if (matrix.length === 0) return members;

  // Find header row in matrix
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const rowLine = (matrix[r] || []).map(cell => String(cell || '')).join(' ').toLowerCase();
    if (
      (rowLine.includes('họ') || rowLine.includes('tên') || rowLine.includes('member') || rowLine.includes('name')) &&
      (rowLine.includes('ban') || rowLine.includes('sđt') || rowLine.includes('điện thoại') || rowLine.includes('rảnh') || rowLine.includes('cam kết') || rowLine.includes('trường') || rowLine.includes('phone'))
    ) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }

  const headerRow = (matrix[headerRowIdx] || []).map(cell => String(cell || '').trim());
  const dataRowsMatrix = matrix.slice(headerRowIdx + 1);

  // Column index maps
  let colName = -1;
  let colDept = -1;
  let colResidence = -1;
  let colVehicle = -1;
  let colJob = -1;
  let colSchool = -1;
  let colPhone = -1;
  let colStandby = -1;

  const slotColMap: { [key: string]: number } = {};
  const commitColMap: { [key: string]: number } = {};

  for (let c = 0; c < headerRow.length; c++) {
    const colStr = headerRow[c];
    const colLower = colStr.toLowerCase().replaceAll('\n', ' ');

    if (colName === -1 && (colLower.includes('họ và tên') || colLower.includes('họ tên') || (colLower.includes('tên') && !colLower.includes('trường')))) {
      colName = c;
    } else if (colDept === -1 && (colLower.includes('ban') || colLower.includes('bộ phận'))) {
      colDept = c;
    } else if (colResidence === -1 && (colLower.includes('sinh sống') || colLower.includes('nơi ở') || colLower.includes('địa chỉ'))) {
      colResidence = c;
    } else if (colVehicle === -1 && (colLower.includes('phương tiện') || colLower.includes('di chuyển'))) {
      colVehicle = c;
    } else if (colJob === -1 && (colLower.includes('công việc') || colLower.includes('nghề nghiệp'))) {
      colJob = c;
    } else if (colSchool === -1 && (colLower.includes('trường') || colLower.includes('thpt'))) {
      colSchool = c;
    } else if (colPhone === -1 && (colLower.includes('điện thoại') || colLower.includes('sđt') || colLower.includes('phone'))) {
      colPhone = c;
    } else if (colStandby === -1 && (colLower.includes('ứng biến') || colLower.includes('linh hoạt'))) {
      colStandby = c;
    }

    if (colLower.includes('rảnh') && !colLower.includes('cam kết')) {
      if (colLower.includes('7h')) slotColMap['07h00 - 09h30'] = c;
      else if (colLower.includes('9h')) slotColMap['09h35 - 12h00'] = c;
      else if (colLower.includes('11h') || colLower.includes('12h')) slotColMap['12h05 - 14h00'] = c;
      else if (colLower.includes('13h') || colLower.includes('14h')) slotColMap['14h05 - 16h05'] = c;
      else if (colLower.includes('15h') || colLower.includes('16h')) slotColMap['16h10 - 18h00'] = c;
    }

    if (colLower.includes('cam kết')) {
      if (colLower.includes('7h')) commitColMap['07h00 - 09h30'] = c;
      else if (colLower.includes('9h')) commitColMap['09h35 - 12h00'] = c;
      else if (colLower.includes('11h') || colLower.includes('12h')) commitColMap['12h05 - 14h00'] = c;
      else if (colLower.includes('13h') || colLower.includes('14h')) commitColMap['14h05 - 16h05'] = c;
      else if (colLower.includes('15h') || colLower.includes('16h')) commitColMap['16h10 - 18h00'] = c;
    }
  }

  // Deduplication & Parsing
  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();
  let duplicateCount = 0;
  const duplicateDetails: string[] = [];
  const validDataRows: any[][] = [];

  for (let i = dataRowsMatrix.length - 1; i >= 0; i--) {
    const row = dataRowsMatrix[i];
    if (!row || row.length === 0) continue;

    const rawName = colName !== -1 ? String(row[colName] || '').trim() : '';
    let phoneVal = colPhone !== -1 ? String(row[colPhone] || '').trim() : '';

    if (!rawName && !phoneVal) continue;

    if (phoneVal.endsWith('.0')) {
      phoneVal = phoneVal.slice(0, -2);
    }
    if (phoneVal.length === 9 && !phoneVal.startsWith('0')) {
      phoneVal = '0' + phoneVal;
    }

    const nameKey = rawName.toLowerCase().replace(/\s+/g, ' ');
    const phoneKey = phoneVal;

    let isDuplicate = false;
    if (nameKey && seenNames.has(nameKey)) {
      isDuplicate = true;
      duplicateDetails.push(`Trùng tên: "${rawName}"`);
    } else if (phoneKey && phoneKey !== '0900000000' && phoneKey !== '090.000.0000' && seenPhones.has(phoneKey)) {
      isDuplicate = true;
      duplicateDetails.push(`Trùng SĐT: "${rawName}" (${phoneVal})`);
    }

    if (isDuplicate) {
      duplicateCount++;
    } else {
      if (nameKey) seenNames.add(nameKey);
      if (phoneKey && phoneKey !== '0900000000' && phoneKey !== '090.000.0000') seenPhones.add(phoneKey);
      validDataRows.unshift(row);
    }
  }

  for (let idx = 0; idx < validDataRows.length; idx++) {
    const row = validDataRows[idx];
    const memberId = `TV${String(idx + 1).padStart(3, '0')}`;

    const name = colName !== -1 && row[colName] ? String(row[colName]).trim() : `Thành viên ${idx + 1}`;
    const dept = colDept !== -1 && row[colDept] ? String(row[colDept]).trim() : 'Ban Sự kiện';
    const residence = colResidence !== -1 && row[colResidence] ? String(row[colResidence]).trim() : 'Bình Dương';
    const vehicle = colVehicle !== -1 && row[colVehicle] ? String(row[colVehicle]).trim() : 'Xe máy';
    const job = colJob !== -1 && row[colJob] ? String(row[colJob]).trim() : 'Học sinh ( Cấp 3 )';
    const school = colSchool !== -1 && row[colSchool] ? String(row[colSchool]).trim() : '';

    let phoneVal = colPhone !== -1 && row[colPhone] ? String(row[colPhone]).trim() : '0900000000';
    if (phoneVal.endsWith('.0')) {
      phoneVal = phoneVal.slice(0, -2);
    }
    if (phoneVal.length === 9 && !phoneVal.startsWith('0')) {
      phoneVal = '0' + phoneVal;
    }

    const flexibleResp = colStandby !== -1 && row[colStandby] ? String(row[colStandby]).trim().toLowerCase() : '';
    const isStandby = flexibleResp.includes('có') || flexibleResp.includes('yes');

    // Availability & Committed slots
    const availability: { [key: string]: boolean } = {};
    const committedSlots: { [key: string]: boolean } = {};

    for (const [slotName, cIdx] of Object.entries(slotColMap)) {
      const cellVal = row[cIdx];
      const freeDays = parseDaysFromText(cellVal);
      const legacySlot = LEGACY_SLOT_MAP[slotName];
      for (const d of DAYS_LIST) {
        const isFree = freeDays.has(d);
        availability[`${d}|${slotName}`] = isFree;
        if (legacySlot) availability[`${d}|${legacySlot}`] = isFree;
      }
    }

    for (const [slotName, cIdx] of Object.entries(commitColMap)) {
      const cellVal = row[cIdx];
      const commitDays = parseDaysFromText(cellVal);
      const legacySlot = LEGACY_SLOT_MAP[slotName];
      for (const d of DAYS_LIST) {
        const hasCommit = commitDays.has(d);
        committedSlots[`${d}|${slotName}`] = hasCommit;
        if (legacySlot) committedSlots[`${d}|${legacySlot}`] = hasCommit;
        if (hasCommit) {
          availability[`${d}|${slotName}`] = true;
          if (legacySlot) availability[`${d}|${legacySlot}`] = true;
        }
      }
    }

    for (const d of DAYS_LIST) {
      for (const slotName of SLOT_KEYS) {
        const key = `${d}|${slotName}`;
        if (availability[key] === undefined) availability[key] = false;
        if (committedSlots[key] === undefined) committedSlots[key] = false;
      }
    }

    let totalFreeSlots = 0;
    for (const v of Object.values(availability)) {
      if (v) totalFreeSlots++;
    }

    let maxShifts = 4;
    let minShifts = 1;

    if (job.toLowerCase().includes('học sinh')) {
      maxShifts = Math.min(5, Math.max(2, Math.floor(totalFreeSlots / 3)));
      minShifts = 1;
    } else if (job.toLowerCase().includes('sinh viên')) {
      maxShifts = Math.min(6, Math.max(2, Math.floor(totalFreeSlots / 2)));
      minShifts = 2;
    } else {
      maxShifts = Math.min(4, Math.max(1, Math.floor(totalFreeSlots / 4)));
      minShifts = 1;
    }

    members.push({
      member_id: memberId,
      name,
      department: dept,
      residence,
      vehicle,
      job,
      school,
      phone: phoneVal,
      is_standby: isStandby,
      availability,
      committed_slots: committedSlots,
      total_free_slots: totalFreeSlots,
      min_shifts: minShifts,
      max_shifts: maxShifts
    });
  }

  (members as any).duplicateCount = duplicateCount;
  (members as any).duplicateDetails = duplicateDetails;

  return members;
}

export function loadMembersData(filePath: string = "Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx"): Member[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const wb = xlsx.readFile(filePath);
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) return [];
  const rows = xlsx.utils.sheet_to_json<any>(sheet);
  return parseMembersDf(rows, sheet);
}

export function getAvailabilityHeatmap(members: Member[]) {
  const slots = ['7h - 9h', '9h - 11h', '11h - 13h', '13h - 15h', '15h - 17h'];
  const totalMembers = members.length || 1;

  const heatmap: any[] = [];
  for (const day of DAYS_LIST) {
    const dayRow: any = {
      day: day,
      slots: []
    };
    for (const slot of slots) {
      const freeMembers: any[] = [];
      for (const m of members) {
        if (m.availability[`${day}|${slot}`]) {
          freeMembers.push({
            member_id: m.member_id,
            name: m.name,
            department: m.department,
            phone: m.phone,
            job: m.job,
            is_standby: m.is_standby
          });
        }
      }

      const count = freeMembers.length;
      const pct = parseFloat(((count / totalMembers) * 100).toFixed(1));

      let level = 0;
      if (count === 0) {
        level = 0;
      } else if (count < totalMembers * 0.2) {
        level = 1;
      } else if (count < totalMembers * 0.4) {
        level = 2;
      } else if (count < totalMembers * 0.6) {
        level = 3;
      } else {
        level = 4;
      }

      dayRow.slots.push({
        slot: slot,
        count: count,
        percentage: pct,
        level: level,
        free_members: freeMembers
      });
    }
    heatmap.push(dayRow);
  }

  return {
    days: DAYS_LIST,
    slots: slots,
    total_members: totalMembers,
    matrix: heatmap
  };
}
