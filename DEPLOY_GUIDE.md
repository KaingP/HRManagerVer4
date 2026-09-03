# HƯỚNG DẪN ĐƯA ỨNG DỤNG LÊN WEB & CẤU HÌNH PHÂN QUYỀN (RBAC)

Hệ thống đã được thiết kế hoàn chỉnh với cơ chế **Role-Based Access Control (Phân quyền người dùng)**:
1. **Chế độ Nhân viên (Mặc định cho mọi máy truy cập qua Web)**:
   - Xem toàn bộ Lịch Trực tuần, sơ đồ ca trực.
   - Thao tác tại **Ca-Live & POS**: Bán hàng thu ngân theo ca trực, tích hợp phím tắt `Enter` thanh toán tức thì.
   - **Điểm danh & Báo vắng/sự cố**: Điểm danh có mặt, báo trễ, báo vắng đột xuất và chọn người thay thế từ danh sách gợi ý dự phòng.
   - Không thể can thiệp sửa đổi bảng phân ca, không thể chạy tối ưu, không thể nạp/sửa dữ liệu nhân sự, không thể sửa tồn kho hoặc xóa sản phẩm.
2. **Chế độ Quản Trị Viên (Admin - Dành cho bạn)**:
   - Nạp dữ liệu Excel / Google Sheets ca trực.
   - Chạy thuật toán xếp ca tối ưu tự động Google OR-Tools.
   - Chỉnh sửa thủ công Trưởng ca, đổi vai trò, đổi nhiệm vụ ca trực.
   - Quản lý danh mục kho hàng: Thêm/Sửa/Xóa sản phẩm, nhập Excel danh mục hàng, chỉnh sửa tồn kho.
   - Đổi mật khẩu quản trị bất cứ lúc nào qua nút chìa khóa trên thanh Topbar.

---

## Mật khẩu Admin mặc định
- **Mật khẩu khởi tạo**: `hungvuong2026`
- **Cách đổi**: Đăng nhập Admin -> Bấm vào biểu tượng chìa khóa 🔑 ở góc trên bên phải -> Nhập mật khẩu mới.

---

## 3 CÁCH ĐƯA ỨNG DỤNG LÊN WEB MIỄN PHÍ

### CÁCH 1: Dùng Render.com (Miễn phí, chạy online 24/7 trên Cloud) - KHUYÊN DÙNG
1. Tạo tài khoản tại [render.com](https://render.com).
2. Đẩy (push) mã nguồn dự án này lên GitHub của bạn (repository Private hoặc Public).
3. Tại Dashboard của Render, chọn **New +** -> **Web Service** -> Kết nối tới repository GitHub vừa tạo.
4. Cấu hình các thông số:
   - **Name**: `hungvuong-concert-scheduler`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Tại mục **Environment Variables** (Tùy chọn):
   - `ADMIN_PASSWORD`: Nhập mật khẩu bí mật của bạn (ví dụ: `hungvuong2026` hoặc mật khẩu tùy chọn).
   - `PORT`: `3000`
6. Bấm **Create Web Service**. Sau 1-2 phút, Render sẽ cấp cho bạn một đường link web dạng:
   `https://hungvuong-concert-scheduler.onrender.com`
   -> Mọi người có thể truy cập link này bằng điện thoại hoặc máy tính để điểm danh và bán hàng.

---

### CÁCH 2: Chia sẻ ngay từ máy tính của bạn qua Cloudflare Tunnel (Hoàn toàn miễn phí, có link HTTPS ngay lập tức)
Nếu bạn muốn máy tính của bạn làm server chính và phát link HTTPS cho thành viên truy cập:
1. Chạy ứng dụng trên máy:
   ```bash
   npm run dev
   ```
2. Tải công cụ `cloudflared` (hoặc dùng `ngrok` / `localtunnel`):
   ```bash
   # Nếu dùng npx localtunnel:
   npx localtunnel --port 3000
   ```
   Hoặc nếu có `cloudflared`:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Cloudflare/Localtunnel sẽ sinh ra một đường dẫn HTTPS miễn phí (ví dụ `https://hungvuong-shifts.loca.lt`). Gửi link này cho thành viên là xong!

---

### CÁCH 3: Triển khai bằng Docker trên bất kỳ máy chủ VPS hoặc Cloud nào
Dự án đã có sẵn file `Dockerfile`. Bạn chỉ cần chạy:
```bash
# Build Docker image
docker build -t hungvuong-scheduler .

# Chạy container trên cổng 3000
docker run -d -p 3000:3000 -e ADMIN_PASSWORD=hungvuong2026 hungvuong-scheduler
```

---

## BẬT ĐỒNG BỘ GOOGLE SHEET CHO TAB THI ĐUA

Đồng bộ chỉ chạy được khi Google gọi được vào app, nên phải làm **sau** khi đã deploy theo một trong ba cách trên.

1. Mở app → tab **Thi Đua Project F&B** → tab con **Google Sheet**.
2. Điền **URL công khai của app** đúng địa chỉ vừa deploy (ví dụ `https://hungvuong-shifts.onrender.com`, không có dấu `/` ở cuối). Nếu ô này còn trống hoặc app đang ở `localhost`, tab sẽ hiện cảnh báo màu cam và Google sẽ không lấy được số liệu.
3. Dán **Link Google Sheet của bạn**, tick **Bật đồng bộ Google Sheet**, rồi bấm **Lưu kết nối**.
4. Chọn một trong hai cách:
   * **Cách A (nhanh, một chiều App → Sheet)**: copy từng công thức `IMPORTDATA(...)` ở cột bên phải, dán vào ô **A1** của tab tương ứng trong Google Sheet.
   * **Cách B (hai chiều)**: bấm **Tạo mã Apps Script**, tải file `CompetitionSync.gs`, mở Google Sheet → **Extensions → Apps Script**, dán toàn bộ nội dung, lưu, rồi tải lại Sheet. Menu **Thi Đua F&B** sẽ xuất hiện với các lệnh lấy số liệu, gửi dữ liệu nhập tay về app và bật tự động đồng bộ mỗi giờ.
5. Chia sẻ quyền xem Google Sheet cho HR. Hai tab `NHAP_BAN_HANG` và `NHAP_VI_PHAM` là nơi HR nhập tay; app sẽ đọc ngược hai tab này (Cách B) hoặc qua nút **Lấy dữ liệu từ Sheet** trong app.

### Lưu ý bảo mật của tính năng này
- Các endpoint `/api/competition/sheet/csv`, `/json` và `/ingest` **mở ra Internet** và chỉ được bảo vệ bằng **token bí mật** trong URL, không phải bằng mật khẩu Admin — vì Google Sheet không đăng nhập được. Ai có token là đọc và ghi được số liệu thi đua.
- Chỉ chia sẻ token và file `.gs` trong nội bộ HR. Nghi bị lộ thì bấm **Đổi token** trong app rồi dán lại công thức / tải lại file `.gs` mới.
- Nếu chưa cần tính năng này, để trống ô link và **không tick** *Bật đồng bộ* — khi đó các endpoint trên không phục vụ dữ liệu.

---

## KIỂM TRA PHÂN QUYỀN TRÊN GIAO DIỆN
- Khi mở web ở chế độ thường (Nhân viên):
  - Nút **"Nạp Dữ Liệu / Google Sheet"** và **"Chạy Tối Ưu Hóa (OR-Tools)"** sẽ tự động được ẩn.
  - Mục **"Tinh Chỉnh Tham Số, Tối Ưu Hóa"** bị khóa có biểu tượng ổ khóa 🔒. Nếu bấm vào sẽ có thông báo yêu cầu đăng nhập Admin.
  - Tại bảng Danh Mục Hàng & Kho: Nút Thêm SP, Nhập Excel và các nút Xóa/Sửa SP bị ẩn, chỉ giữ lại nút **Bán Hàng** và máy POS Ca-Live.
  - Bảng Điểm danh và Ca-Live hoạt động đầy đủ cho nhân sự trong ca.
- Khi bấm **"Đăng nhập Admin"** và điền mật khẩu:
  - Toàn bộ giao diện quản trị, đổi ca, nạp dữ liệu và sửa kho hàng sẽ lập tức mở khóa.
