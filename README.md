# 📅 F&B Shift Scheduler - Hệ Thống Quản Lý & Điều Phối Nhân Sự F&B Thông Minh (Version 2)

**F&B Shift Scheduler** là giải pháp toàn diện dành cho việc quản lý lịch làm việc, phân công ca trực, điểm danh real-time, xử lý ca vắng khẩn cấp, quản lý kỷ luật, vận hành điểm bán POS thu ngân, kiểm kê tồn kho và tổ chức chương trình thi đua cho các mô hình vận hành F&B, dự án sinh viên và câu lạc bộ.

---

## 🚀 Các Bảng Chức Năng Cốt Lõi (10 Tab Chức Năng)

### 1. 📊 1. Tổng Hợp Lịch Rảnh (`tab-analytics`)
* **Bản đồ nhiệt (Heatmap) thời gian rảnh**: Thống kê khung giờ rảnh của toàn bộ nhân sự theo từng ngày trong tuần và từng ca trực.
* **Đo lường độ bao phủ**: Phân tích chi tiết tỷ lệ đáp ứng nhân sự, nhận biết nhanh các ca trực đang thiếu hoặc thừa người đăng ký.
* **Thống kê năng suất**: Tổng hợp số ca rảnh trung bình, biểu đồ phân bổ ca rảnh theo ban ngành và cá nhân.

### 2. 📅 2. Phân Công Ca Trực (`tab-schedule`)
* **Lịch trực toàn tuần trực quan**: Hiển thị bảng phân công ca trực chi tiết cho các ca Phòng Thanh Niên và Ca Bán Ngoài.
* **Phân tách nhóm trực**: Hiển thị rõ danh sách **Nhân sự trực chính** và **Nhân sự dự phòng (Standby)**, chỉ định rõ Leader ca.
* **Bộ lọc & Tìm kiếm đa năng**: Lọc lịch trực theo ngày, theo ban ngành, tìm kiếm tên nhân sự hoặc mã ca.
* **Cảnh báo xung đột & Audit**: Tự động phát hiện trùng lịch, ca thiếu Leader hoặc vượt quá giới hạn ca/tuần.
* **Xuất báo cáo Excel**: Xuất file Excel (`.xlsx`) bảng phân ca hoàn chỉnh chỉ với 1-click.

### 3. ⚙️ 3. Cơ Cấu Ca Trực (`tab-optimizer`)
* **Tinh chỉnh ca trực Trong tuần & Cuối tuần**: Thiết lập giờ bắt đầu/kết thúc, ghi chú vận hành, định mức số lượng nhân sự Chính và Dự phòng riêng biệt cho Thứ 2–Thứ 6, Thứ 7 và Chủ Nhật.
* **Thuật toán xếp lịch tự động (OR-Tools / Heuristics)**: 1-click tự động xếp lịch tối ưu dựa trên lịch rảnh, số ca tối đa/tuần, ưu tiên Leader và phân bổ công bằng giữa các ban.
* **Cấu hình ca ngoài & Đội ứng biến**: Tùy chỉnh danh sách ca bán ngoài đặc thù và danh sách thành viên tham gia đội ứng biến.
* **Sao lưu & Khôi phục cấu hình**: Lưu trữ và khôi phục dễ dàng các thiết lập tham số ca trực.

### 4. 🚨 4. Điều Phối Ca Vắng, Vi Phạm Nhân Sự (`tab-contingency`)
* **Điểm danh Real-time**: Ghi nhận tức thì trạng thái nhân sự tại ca đang diễn ra (Có mặt, Đi trễ, Vắng mặt không phép / có lý do).
* **Đề xuất Backup tự động**: Thuật toán tự động lọc và đề xuất danh sách nhân sự thay thế tốt nhất từ Đội ứng biến và nhóm rảnh giờ đó (sắp xếp theo điểm ưu tiên và độ tương thích).
* **Tự động liên vết kỷ luật**: Tự động trừ điểm uy tín khi vắng mặt hoặc cộng điểm thưởng khi nhận ca trực thay.
* **Nhật ký sự cố (Incident Log)**: Ghi nhận lịch sử báo vắng, gọi dự phòng và thay ca theo thời gian thực, hỗ trợ xuất báo cáo Excel.

### 5. ⚖️ 5. Cộng Điểm Kỷ Luật (`tab-discipline`)
* **Quản lý điểm uy tín nhân sự**: Mỗi nhân sự khởi điểm với 100 điểm uy tín.
* **Thưởng / Trừ điểm linh hoạt**: Ban quản lý/Admin chủ động cộng điểm thưởng hoặc trừ điểm phạt kèm lý do chi tiết.
* **Phân loại xếp hạng chuyên cần**: Tự động phân hạng thành viên (🌟 Xuất sắc, Tốt, Khá, Cần nhắc nhở) dựa trên quỹ điểm uy tín.
* **Nhật ký minh bạch**: Lưu trữ toàn bộ lịch sử biến động điểm uy tín, hỗ trợ tìm kiếm và tra cứu theo nhân sự.

### 6. 🛒 6. Thu Ngân (`tab-live-shift`)
* **Máy bán hàng POS Ca-Live**: Giao diện thu ngân tối ưu cho thiết bị di động và máy tính tại điểm bán.
* **Liên kết ca trực**: Ghi nhận hóa đơn trực tiếp theo ca đang chạy và nhân sự thu ngân đứng quầy.
* **Tích hợp VietQR động**: Tự động tạo mã QR chuyển khoản ngân hàng kèm giá tiền và nội dung chuyển khoản chuẩn.
* **Xử lý đơn hàng đa dạng**: Hỗ trợ thanh toán tiền mặt/chuyển khoản, in hóa đơn, hủy giao dịch và hoàn tiền.

### 7. 📋 7. Kiểm Kê Ca Trực (`tab-shift-audit`)
* **Đối chiếu tồn kho đầu / cuối ca**: Nhập số lượng tồn đầu ca và kiểm kê tồn thực tế cuối ca.
* **Tự động tính chênh lệch**: So sánh tự động giữa Tồn lý thuyết (Tồn đầu - Xuất bán POS) và Tồn thực tế để phát hiện thất thoát/dư thừa.
* **Biên bản bàn giao ca**: Lưu nhật ký kiểm kê ca trực và biên bản bàn giao tài sản giữa các kíp trực.

### 8. 📦 8. Kho Hàng, Doanh Thu (`tab-inventory`)
* **Quản lý danh mục sản phẩm**: Quản lý tên món, mã hàng, giá bán, số lượng tồn kho và mức cảnh báo sắp hết hàng.
* **Nhập kho & Phiếu nhập hàng**: Tạo phiếu nhập hàng (Restock receipts) và theo dõi biến động hàng tồn kho.
* **Báo cáo doanh thu F&B**: Thống kê tổng doanh thu, số lượng đơn bán, doanh số theo kênh bán và nhật ký bán hàng chi tiết.

### 9. 🏆 9. Best Seller (`tab-kpi`)
* **Bảng xếp hạng sản phẩm bán chạy**: Thống kê top món F&B có sản lượng và doanh thu cao nhất.
* **Đo lường KPI nhân sự**: Theo dõi đóng góp doanh số của từng thành viên và từng ca trực.
* **Quản lý lấy hàng & Giao nhận**: Theo dõi tiến độ giao hàng và chỉ số KPI doanh thu F&B.

### 10. 🥇 10. Thi Đua F&B (`tab-competition`)
* **Chu kỳ thi đua 3 tuần (8 hạng mục giải thưởng)**:
  * 5 Giải tuần: `Best Seller`, `Best All-Rounder`, `Nhóm Trực Ca Xuất Sắc` (Nhất/Nhì/Ba).
  * 3 Giải tổng kết chu kỳ: `Best Seller of Project F&B`, `All Round Member of Project`, `Giải Tập Thể Xuất Sắc Theo Ban`.
* **Minh bạch công thức**: Nhấp vào bất kỳ dòng xếp hạng nào để hiển thị chi tiết công thức đã thay số (Sản lượng, Năng suất, Điểm uy tín).
* **Tùy chỉnh quy chế**: Cho phép Admin tùy chỉnh bộ trọng số tính điểm, điểm uy tín ban đầu và danh mục vi phạm.
* **Đồng bộ Google Sheet hai chiều**: Tích hợp mã Google Apps Script tự động đồng bộ dữ liệu giữa App và Google Sheet.

---

## 🔗 Đồng Bộ Google Sheet (Tab Thi Đua)

Ứng dụng hỗ trợ kết nối hai chiều với Google Sheet qua chìa khóa bí mật (Token):
* **Cách A (IMPORTDATA)**: Dán công thức đọc dữ liệu 1 chiều từ App lên Google Sheet.
* **Cách B (Google Apps Script)**: Tải file script `.gs` tích hợp vào Google Sheet để đồng bộ dữ liệu 2 chiều (Đọc báo cáo từ App & Đẩy dữ liệu bán hàng/vi phạm từ Sheet về App).

---

## 🛠️ Công Nghệ Sử Dụng

* **Frontend**: HTML5, CSS3 (Tailwind CSS, FontAwesome Icons), Vanilla JavaScript (ES6+), Recharts / D3.js.
* **Backend**: Node.js, Express.js, TypeScript (`tsx`).
* **Thuật toán**: Google OR-Tools / Constraint Programming Heuristics.
* **Xử lý Excel**: `exceljs` & `xlsx` (SheetJS) phục vụ đọc/ghi file Excel chuẩn hóa.

---

## 💻 Hướng Dẫn Khởi Chạy Dự Án

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chạy ở chế độ Phát triển (Development)
```bash
npm run dev
```
Truy cập ứng dụng tại địa chỉ: `http://localhost:3000`

### 3. Biên dịch & Chạy Production (Build)
```bash
npm run build
npm start
```

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
├── src/
│   ├── scheduler.ts            # Thuật toán phân công ca trực tự động
│   ├── data_loader.ts          # Đọc & xử lý dữ liệu từ các file Excel
│   ├── competition.ts          # Logic & công thức chấm điểm thi đua F&B
│   ├── risk_and_hr_protocols.ts# Quy trình điều phối backup & kỷ luật
│   ├── exporter.ts             # Xuất báo cáo lịch trực & sự cố ra Excel
│   └── sheet_sync_script.ts    # Mã Google Apps Script đồng bộ Google Sheet
├── templates/
│   └── index.html              # Giao diện chính ứng dụng (Single-Page Dashboard)
├── static/
│   ├── css/                    # Tùy chỉnh CSS & cấu hình giao diện
│   └── js/
│       └── app.js              # Logic xử lý giao diện, POS, Điểm danh & Thi đua
├── Danh_sach_dang_ky_truc_ca_50_nguoi.xlsx # Dữ liệu 50 thành viên đăng ký
├── Danh_sach_ca.xlsx           # Dữ liệu cấu trúc ca trực & đăng ký
├── server.ts                   # Express Backend Server điều khiển toàn bộ API
├── package.json                # Khai báo dependencies & scripts
└── README.md                   # Tài liệu hướng dẫn hệ thống
```
