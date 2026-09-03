# 📅 F&B Shift Scheduler - Hệ Thống Xếp Lịch & Điều Phối Nhân Sự F&B Thông Minh (Version 2)

**F&B Shift Scheduler** là giải pháp quản lý lịch làm việc, điểm danh thời gian thực và xử lý sự cố nhân sự khẩn cấp dành riêng cho các mô hình vận hành nhà hàng, quán cà phê và dịch vụ F&B. Hệ thống kết hợp thuật toán xếp ca tự động tối ưu (Heuristics) cùng bộ công cụ xử lý ca vắng đột xuất và tích hợp cổng bán hàng POS giả lập giúp tối ưu hiệu suất nhân sự vượt trội.

---

## ✨ Các Tính Năng Cốt Lõi

### 1. ⚙️ Xếp Lịch Tự Động Thông Minh (Auto-Scheduler)
* **Tự động hóa hoàn toàn**: Phân bổ ca trực tự động chỉ với 1-click dựa trên các điều kiện ràng buộc nâng cao (Lịch rảnh của nhân sự, số lượng ca tối đa mỗi tuần, vai trò tối thiểu trong ca).
* **Quản lý cấu hình linh hoạt**: Định cấu hình thời gian ca, phân chia rõ ràng giữa nhóm **Nhân sự chính (Core)** và **Nhân sự dự phòng (Standby)**, chỉ định Leader cho từng ca trực.
* **Audit & Phát hiện xung đột**: Tự động rà soát lịch để cảnh báo tức thì các vi phạm (Trùng lịch, vượt quá ca làm quy định, thiếu Leader ca).

### 2. 🚨 Quản Lý Ca Vắng & Phương Án Dự Phòng Khẩn Cấp (Contingency & Live Attendance)
* **Điểm danh Real-time**: Điểm danh nhanh trạng thái chuyên cần trực tiếp ngay tại ca đang diễn ra (Có mặt, Đi trễ, Vắng đột xuất).
* **Nhóm Standby thông minh**: Phân tách rõ rệt nhân sự dự phòng, tự động ẩn điểm danh chuẩn và chỉ kích hoạt khi nhấn báo ⚠️ *Có bất thường*.
* **Đề xuất Backup tự động**: Khi có nhân sự vắng, thuật toán tự động lọc và đề xuất danh sách người thay thế tốt nhất từ Đội ứng biến và những người rảnh lịch theo thời gian thực (sắp xếp theo điểm ưu tiên và độ tương thích).
* **Lưu trữ & Xác nhận tập trung**: Cơ chế lưu nháp trạng thái điểm danh và xác nhận hàng loạt qua nút bấm **"Lưu Điểm Danh & Gọi Backup"** cố định dưới góc màn hình nhằm tối ưu hóa trải nghiệm điều phối.

### 3. 🛍️ Giả Lập Bán Hàng & Đo Lường Doanh Thu (Live POS & Sales Analytics)
* **Đồng bộ hóa bán hàng**: Tích hợp module bán hàng POS trực tiếp liên kết với ca trực đang chạy. Ghi nhận hóa đơn dựa trên nhân sự đang trực tiếp bán hàng.
* **Đo lường hiệu suất**: Tính toán doanh thu thực tế đóng góp của từng nhân viên để phục vụ đánh giá xếp hạng KPIs cuối tháng.

### 4. 📊 Báo Cáo Chuyên Cần & Xuất Excel Chuyên Nghiệp (Compliance & Reports)
* **Thống kê chuyên sâu**: Ghi nhận chi tiết lịch sử sự cố (Đi muộn, vắng không phép, vắng khẩn cấp, người thay thế).
* **Xuất Excel nhanh chóng**: Xuất toàn bộ báo cáo phân tích ca vắng, phương án dự phòng và nhật ký sự cố ra file Excel (`.xlsx`) chuẩn hóa để phục vụ công tác tính lương HR.

### 5. 🏆 Thi Đua Project F&B (Chu Kỳ 3 Tuần, 8 Giải Thưởng)
* **Chu kỳ & chốt tuần**: Chu kỳ gồm 3 tuần. Hết Tuần 1 và Tuần 2 thì tổng kết rồi **reset bảng xếp hạng tuần**; hết Tuần 3 thì tổng kết và khoá dữ liệu cả chu kỳ. Reset chỉ áp dụng cho bảng xếp hạng — **dữ liệu gốc của cả 3 tuần không bao giờ bị xoá**, vì các giải tổng kết cần đến chúng.
* **5 giải mỗi tuần**: `Best Seller` (sản lượng cá nhân cao nhất) · `Best All-Rounder` (Sản lượng 40% + Năng suất 40% + Uy tín 20%) · `Nhóm Trực Ca Xuất Sắc` Nhất / Nhì / Ba (Sản lượng nhóm 70% + Uy tín nhóm 30%, mỗi ca xét riêng, **không cộng dồn giữa các ca**).
* **3 giải tổng kết**: `Best Seller of Project F&B` (cộng dồn sản lượng 3 tuần) · `All Round Member of Project` (trung bình điểm toàn diện **đã chuẩn hoá** của các tuần có tham gia, để công bằng giữa người trực nhiều ca và ít ca) · `Giải Tập Thể Xuất Sắc Theo Ban` (Đóng góp BQ 40% + Hiệu suất BQ 40% + Uy tín BQ 20%).
* **Trực quan hoá công thức**: Bấm vào **bất kỳ dòng nào** trong ba bảng xếp hạng để bung ra đúng công thức đã thay số của dòng đó (sản lượng quy đổi, mẫu số chuẩn hoá, điểm từng thành phần, tổng điểm) — HR giải thích được mọi con số mà không cần mở code.
* **Quy chế sửa trực tiếp**: Điểm uy tín khởi điểm, danh mục vi phạm và điểm trừ, bộ trọng số của cả 3 nhóm giải, tuần đang ghi nhận và trạng thái chốt tuần đều cấu hình được trong tab con **Quy Chế & Công Thức** (tổng trọng số mỗi nhóm được kiểm tra phải bằng 100).
* **Đồng bộ Google Sheet hai chiều**: App ↔ Sheet dùng chung một bộ công thức nên số liệu luôn khớp. Xem [Đồng Bộ Google Sheet](#-đồng-bộ-google-sheet-cho-tab-thi-đua) bên dưới.

---

## 🔗 Đồng Bộ Google Sheet Cho Tab Thi Đua

Mở tab **Thi Đua Project F&B → Google Sheet**. Có hai cách, dùng chung một token bí mật do app sinh ra:

| | Cách A — Dán công thức | Cách B — Apps Script |
| --- | --- | --- |
| Chiều dữ liệu | Một chiều: App → Sheet | Hai chiều: App ↔ Sheet |
| Cách làm | Dán công thức `IMPORTDATA(...)` vào ô A1 của từng tab | Tải file `CompetitionSync.gs` từ app, dán vào **Extensions → Apps Script** của Sheet |
| Cập nhật | Google tự làm mới định kỳ | Menu **Thi Đua F&B** trên Sheet, hoặc bật trigger tự động mỗi giờ |
| Nhập liệu từ Sheet | Không | Có: hai tab `NHAP_BAN_HANG` và `NHAP_VI_PHAM` được đọc ngược về app |

Yêu cầu bắt buộc: **Google phải gọi được vào app**. Khi app còn chạy ở `localhost`, tab Google Sheet sẽ hiện cảnh báo và cả hai cách đều không hoạt động — hãy deploy app ra Internet trước (xem `DEPLOY_GUIDE.md`) rồi điền URL công khai vào ô *URL công khai của app*.

> ⚠️ Token trong công thức và trong file `.gs` là **chìa khoá đọc/ghi số liệu thi đua**. Chỉ chia sẻ trong nội bộ HR; nếu nghi bị lộ, bấm **Đổi token** rồi dán lại công thức mới.


---

## 🛠️ Công Nghệ Sử Dụng

* **Frontend**: HTML5, CSS3 (Tailwind CSS, FontAwesome Icons), Vanilla JavaScript (ES6+), thư viện vẽ biểu đồ Recharts/D3.
* **Backend**: Node.js, Express.js, TypeScript (`ts-node`).
* **Xuất báo cáo**: Thư viện `exceljs` để khởi tạo báo cáo định dạng bảng biểu Excel chất lượng cao.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu hệ thống
* Đã cài đặt **Node.js** (Phiên bản v18 trở lên được khuyến nghị).
* Quản lý gói bằng **npm** (đi kèm sẵn trong Node.js).

### 2. Cài đặt các gói phụ thuộc
Mở terminal tại thư mục gốc của dự án và chạy lệnh sau để tải các thư viện cần thiết:
```bash
npm install
```

### 3. Khởi chạy ở chế độ phát triển (Development)
Sử dụng script có sẵn để chạy dev server trên cổng mặc định (máy chủ sẽ tự động lắng nghe thay đổi và tải lại):
```bash
npm run dev
```
Truy cập ứng dụng tại địa chỉ: `http://localhost:3000`

### 4. Biên dịch và Đóng gói (Production Build)
Để biên dịch dự án sang mã Javascript tối ưu phục vụ triển khai thực tế:
```bash
npm run build
npm start
```

---

## 📂 Sơ Đồ Cấu Trúc Thư Mục Chính

```text
├── src/
│   ├── competition.ts     # Toàn bộ công thức chấm điểm thi đua (tuần + tổng kết)
│   ├── sheet_sync_script.ts # Sinh mã Apps Script đồng bộ hai chiều với Google Sheet
│   └── types/             # Định nghĩa cấu trúc kiểu dữ liệu TypeScript
├── templates/
│   └── index.html         # Giao diện ứng dụng chính (Single-page Dashboard)
├── static/
│   ├── css/               # Các tùy chỉnh giao diện và cấu hình Tailwind CSS
│   └── js/
│       └── app.js         # Toàn bộ logic tương tác phía Frontend, POS và Điểm danh
├── server.ts              # Máy chủ API chính điều khiển xếp lịch, chấm điểm Backup & POS
├── package.json           # Danh sách thư viện và cấu hình các script khởi chạy
└── README.md              # Tài liệu hướng dẫn sử dụng (File này)
```

---

## 📝 Quy Trình Điểm Danh & Điều Phối Đạt Chuẩn
1. Chọn ca đang hoạt động tại thanh chọn **Ca trực Live**.
2. Rà soát danh sách nhân sự chính. Nếu có người vắng, bấm **Vắng mặt** 🚨.
3. Dropdown đề xuất danh sách Đội ứng biến sẽ hiện ra, lựa chọn nhân sự thay thế tối ưu nhất.
4. Rà soát lại tất cả các nhân sự khác rồi bấm **"Lưu Điểm Danh & Gọi Backup"** để lưu trạng thái và kích hoạt điều phối.
5. Kiểm tra lịch sử sự cố được cập nhật tức thì tại tab **Báo cáo Ca Vắng & Backup** và tải file Excel báo cáo khi cần thiết.
