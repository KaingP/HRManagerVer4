/**
 * Sinh mã Google Apps Script dùng để đồng bộ hai chiều giữa app và Google Sheet.
 *
 * Vì token nằm trong mã sinh ra, endpoint trả về nội dung này phải là
 * endpoint chỉ Admin truy cập được.
 */

const HEADER_FILL = "#1f2933";

export function renderAppsScript(
    baseUrl: string,
    token: string,
    tabs: string[],
): string {
    const list = tabs.map((t) => "  '" + t.replace(/'/g, "\\'") + "'").join(",\n");
    return `/**
 * ĐỒNG BỘ THI ĐUA PROJECT F&B  <->  GOOGLE SHEET
 * Dán toàn bộ file này vào Extensions -> Apps Script của Google Sheet, lưu lại,
 * rồi tải lại Sheet. Menu "Thi Đua F&B" sẽ xuất hiện trên thanh công cụ.
 *
 * Sinh tự động từ app lúc: ${new Date().toLocaleString("vi-VN")}
 * KHÔNG chia sẻ file này ra ngoài: nó chứa token truy cập số liệu thi đua.
 */

var APP_BASE_URL = '${baseUrl}';
var SYNC_TOKEN = '${token}';

/** Các tab do app ghi ra (sẽ bị ghi đè mỗi lần đồng bộ). */
var OUTPUT_TABS = [
${list}
];

/** Hai tab người dùng tự nhập, app sẽ đọc lên. */
var INPUT_SALES_TAB = 'NHAP_BAN_HANG';
var INPUT_VIOLATION_TAB = 'NHAP_VI_PHAM';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Thi Đua F&B')
    .addItem('1. Lấy số liệu từ App  (App -> Sheet)', 'pullFromApp')
    .addItem('2. Gửi dữ liệu đã nhập  (Sheet -> App)', 'pushToApp')
    .addSeparator()
    .addItem('Đồng bộ hai chiều', 'fullSync')
    .addItem('Bật tự động đồng bộ mỗi giờ', 'installHourlyTrigger')
    .addItem('Tắt tự động đồng bộ', 'removeTriggers')
    .addToUi();
}

function apiGet_(pathAndQuery) {
  var url = APP_BASE_URL + pathAndQuery +
    (pathAndQuery.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(SYNC_TOKEN);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('App trả về HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

/** App -> Sheet: ghi toàn bộ bảng xếp hạng, chi tiết và quy chế. */
function pullFromApp() {
  var data = apiGet_('/api/competition/sheet/json');
  if (!data || !data.success) throw new Error('App không trả về dữ liệu hợp lệ.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var written = 0;

  data.tables.forEach(function (table) {
    // Không ghi đè hai tab nhập liệu của người dùng.
    if (table.name === INPUT_SALES_TAB || table.name === INPUT_VIOLATION_TAB) {
      ensureInputTab_(ss, table);
      return;
    }
    var sheet = ss.getSheetByName(table.name) || ss.insertSheet(table.name);
    sheet.clear();

    var rows = [];
    if (table.note) rows.push([table.note]);
    rows.push(table.headers);
    table.rows.forEach(function (r) { rows.push(r); });

    var width = table.headers.length;
    var padded = rows.map(function (r) {
      var out = r.slice(0, width);
      while (out.length < width) out.push('');
      return out;
    });

    sheet.getRange(1, 1, padded.length, width).setValues(padded);

    var headerRow = table.note ? 2 : 1;
    var header = sheet.getRange(headerRow, 1, 1, width);
    header.setFontWeight('bold').setBackground('${HEADER_FILL}').setFontColor('#ffffff');
    sheet.setFrozenRows(headerRow);
    if (table.note) {
      sheet.getRange(1, 1, 1, width).merge().setFontStyle('italic').setFontColor('#6b7280');
    }
    sheet.autoResizeColumns(1, Math.min(width, 20));
    written++;
  });

  var stamp = ss.getSheetByName('TONG_QUAN');
  if (stamp) {
    stamp.getRange(1, 1).setNote('Cập nhật lúc ' + new Date().toLocaleString('vi-VN'));
  }
  SpreadsheetApp.getActive().toast('Đã cập nhật ' + written + ' tab từ app.', 'Thi Đua F&B', 5);
}

/** Tạo tab nhập liệu kèm tiêu đề nếu người dùng chưa có. */
function ensureInputTab_(ss, table) {
  var sheet = ss.getSheetByName(table.name);
  if (!sheet) {
    sheet = ss.insertSheet(table.name);
    var rows = [[table.note || ''], table.headers];
    sheet.getRange(1, 1, rows.length, table.headers.length).setValues(
      rows.map(function (r) {
        var out = r.slice(0, table.headers.length);
        while (out.length < table.headers.length) out.push('');
        return out;
      })
    );
    sheet.getRange(2, 1, 1, table.headers.length)
      .setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
    sheet.setFrozenRows(2);
    sheet.autoResizeColumns(1, table.headers.length);
  }
}

/** Đọc một tab nhập liệu thành mảng object theo tiêu đề ở dòng 2. */
function readInputTab_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 3) return [];
  var headers = values[1].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 2; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    var hasData = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var cell = row[c];
      obj[headers[c]] = cell === null || cell === undefined ? '' : cell;
      if (String(cell).trim() !== '') hasData = true;
    }
    if (hasData) out.push(obj);
  }
  return out;
}

/** Sheet -> App: gửi hai tab nhập liệu về app. */
function pushToApp() {
  var payload = {
    token: SYNC_TOKEN,
    sales: readInputTab_(INPUT_SALES_TAB),
    violations: readInputTab_(INPUT_VIOLATION_TAB)
  };
  var res = UrlFetchApp.fetch(APP_BASE_URL + '/api/competition/sheet/ingest', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('App trả về HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  var data = JSON.parse(res.getContentText());
  SpreadsheetApp.getActive().toast(data.message || 'Đã gửi dữ liệu về app.', 'Thi Đua F&B', 6);
}

/** Gửi dữ liệu nhập tay lên trước, rồi lấy lại bảng xếp hạng mới nhất. */
function fullSync() {
  pushToApp();
  pullFromApp();
}

function installHourlyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('fullSync').timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast('Đã bật tự động đồng bộ mỗi giờ.', 'Thi Đua F&B', 5);
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'fullSync') ScriptApp.deleteTrigger(t);
  });
}
`;
}
