# 📖 HƯỚNG DẪN SỬ DỤNG HỆ THỐNG QUẢN LÝ & ĐIỀU PHỐI F&B SCHEDULER

Chào mừng bạn đến với **F&B Shift Scheduler**! Đây là tài liệu hướng dẫn từng bước chi tiết giúp Ban Quản Lý (Admin), Leader Ca và Nhân Sự vận hành mượt mà toàn bộ 10 chức năng của hệ thống.

---

## 📌 MỤC LỤC
1. [Khởi Động & Đăng Nhập Phân Quyền](#1-khởi-động--đăng-nhập-phân-quyền)
2. [Tab 1: Tổng Hợp Lịch Rảnh](#2-tab-1-tổng-hợp-lịch-rảnh)
3. [Tab 2: Phân Công Ca Trực (Xếp Lịch)](#3-tab-2-phân-công-ca-trực-xếp-lịch)
4. [Tab 3: Cơ Cấu Ca Trực & Tối Ưu Lịch Tự Động](#4-tab-3-cơ-cấu-ca-trực--tối-ưu-lịch-tự-động)
5. [Tab 4: Điều Phối Ca Vắng & Vi Phạm Nhân Sự](#5-tab-4-điều-phối-ca-vắng--vi-phạm-nhân-sự)
6. [Tab 5: Cộng Điểm Kỷ Luật](#6-tab-5-cộng-điểm-kỷ-luật)
7. [Tab 6: Thu Ngân POS Bán Hàng Realtime](#7-tab-6-thu-ngân-pos-bán-hàng-realtime)
8. [Tab 7: Kiểm Kê Ca Trực & Bàn Giao Tồn Kho](#8-tab-7-kiểm-kê-ca-trực--bàn-giao-tồn-kho)
9. [Tab 8: Kho Hàng & Quản Lý Doanh Thu](#9-tab-8-kho-hàng--quản-lý-doanh-thu)
10. [Tab 9: Best Seller & Theo Dõi KPI](#10-tab-9-best-seller--theo-dõi-kpi)
11. [Tab 10: Thi Đua F&B & Đồng Bộ Google Sheet](#11-tab-10-thi-đua-fb--đồng-bộ-google-sheet)
12. [Hỏi Đáp & Xử Lý Sự Cố Thường Gặp](#12-hỏi-đáp--xử-lý-sự-cố-thường-gặp)

---

## 1. 🔐 Khởi Động & Đăng Nhập Phân Quyền

* **Quyền Nhân Sự (Thành viên / Leader)**: Xem lịch trực cá nhân, thực hiện bán hàng POS thu ngân, kiểm kê ca trực và theo dõi bảng điểm thi đua.
* **Quyền Admin (Ban Quản Lý)**: Nhấp vào **"Đăng Nhập Admin"** trên góc phải thanh tiêu đề và nhập mật khẩu quản trị để mở khóa các công cụ:
  * Tinh chỉnh tham số ca trực & xếp lịch tự động bằng thuật toán OR-Tools.
  * Điều chỉnh điểm uy tín kỷ luật của nhân sự.
  * Nhập hàng, điều chỉnh kho & quản lý doanh thu.
  * Tùy chỉnh quy chế thi đua và sao lưu/khôi phục cài đặt.

---

## 2. 📊 Tab 1: Tổng Hợp Lịch Rảnh

Mục đích: Quan sát bức tranh tổng thể về thời gian rảnh của toàn bộ nhân sự trước khi phân công ca trực.

* **Bản đồ nhiệt (Heatmap)**: Xem màu sắc các ô ca trực trong tuần để biết ca nào đang đông người rảnh (xanh nõn chuối) và ca nào ít người đăng ký (đỏ/vàng).
* **Bộ lọc**: Chọn lọc theo ngày hoặc tìm kiếm theo tên thành viên / ban ngành.
* **Chỉ số bao phủ**: Theo dõi tỷ lệ đáp ứng nhu cầu nhân sự của từng ngày trong tuần.

---

## 3. 📅 Tab 2: Phân Công Ca Trực (Xếp Lịch)

Mục đích: Xem và tra cứu lịch phân công công tác chi tiết sau khi đã xếp lịch.

* **Xem lịch trực tuần**: Bảng hiển thị danh sách tất cả các ca trực trong tuần (Phòng Thanh Niên & Ca Bán Ngoài). Mỗi ca hiển thị rõ:
  * **Trực chính**: Danh sách nhân sự làm việc chính, người đứng đầu là Leader ca.
  * **Dự phòng (Standby)**: Nhân sự sẵn sàng hỗ trợ khi ca trực phát sinh ca vắng.
* **Lọc lịch cá nhân**: Nhập tên của bạn vào ô tìm kiếm để xem các ca mình được phân công.
* **Xuất Excel**: Nhấp nút **"Xuất Excel Bảng Phân Ca"** để tải file Excel `.xlsx` chính thức phục vụ in ấn hoặc gửi lên nhóm truyền thông.

---

## 4. ⚙️ Tab 3: Cơ Cấu Ca Trực & Tối Ưu Lịch Tự Động

Mục đích: Tùy chỉnh khung giờ, định mức nhân sự và chạy thuật toán tự động xếp lịch.

1. **Tinh chỉnh ca ngày thường (T2–T6) & Cuối tuần (T7, Chủ Nhật)**:
   * Chuyển đổi giữa 3 Tab: `Thứ 2 - Thứ 6`, `Thứ 7` và `Chủ Nhật`.
   * Cài đặt khung giờ bắt đầu / kết thúc cho 5 ca trực cố định.
   * Cài đặt số lượng nhân sự **Trực chính** và **Dự phòng** mong muốn cho từng ca.
2. **Chạy Xếp Lịch Tự Động (OR-Tools)**:
   * Nhấp **"Chạy Tối Ưu Xếp Lịch"**.
   * Hệ thống sẽ tự động cân bằng số ca rảnh, ưu tiên phân công Leader, đảm bảo công bằng giữa các ban ngành và giới hạn số ca tối đa/tuần của từng nhân sự.
3. **Quản lý ca bán ngoài & Đội ứng biến**:
   * Thêm/xóa các ca ngoài sự kiện đặc thù.
   * Tích chọn danh sách các nhân sự nòng cốt tham gia **Đội ứng biến khẩn cấp**.

---

## 5. 🚨 Tab 4: Điều Phối Ca Vắng & Vi Phạm Nhân Sự

Mục đích: Xử lý sự cố nhân sự đi trễ, vắng mặt real-time trong ca đang trực.

1. **Điểm danh ca trực**:
   * Chọn ca trực đang diễn ra.
   * Đánh dấu trạng thái cho từng nhân sự: **Có mặt**, **Đi trễ**, **Vắng có phép** hoặc **Vắng không phép**.
2. **Gọi nhân sự Backup (Thành viên thay thế)**:
   * Khi có nhân sự vắng, nhấp **"Đề xuất Backup khẩn cấp"**.
   * Hệ thống sẽ tự động lọc ra danh sách nhân sự trong Đội ứng biến / rảnh giờ đó có điểm uy tín cao nhất.
   * Nhấp chọn nhân sự thay thế để hệ thống ghi nhận thưởng điểm cho người đi trực thay và trừ điểm người vắng mặt.

---

## 6. ⚖️ Tab 5: Cộng Điểm Kỷ Luật

Mục đích: Quản lý quỹ điểm uy tín (bắt đầu từ 100đ) và đánh giá độ chuyên cần của thành viên.

* **Cộng thưởng / Trừ phạt điểm**:
  * Nhấp **"Tinh Chỉnh Điểm Uy Tín"**.
  * Chọn tên nhân sự, loại thao tác (Cộng / Trừ), nhập số điểm và lý do cụ thể (Ví dụ: *"Khen thưởng hỗ trợ dọn dẹp quầy ca 5"*, *"Phạt đi trễ 15 phút ca 1"*).
* **Phân loại tự động**:
  * `>= 100đ`: 🌟 **Xuất sắc**
  * `85đ - 99đ`: 🟢 **Tốt**
  * `70đ - 84đ`: 🟡 **Khá**
  * `< 70đ`: 🔴 **Cần nhắc nhở**

---

## 7. 🛒 Tab 6: Thu Ngân POS Bán Hàng Realtime

Mục đích: Bán hàng F&B tại điểm bán, in hóa đơn và thanh toán qua VietQR.

1. **Chọn sản phẩm**: Nhấp vào danh mục món ăn/nước uống để thêm vào giỏ hàng.
2. **Thanh toán VietQR**:
   * Chọn phương thức **Chuyển khoản VietQR**.
   * Hệ thống tự động phát sinh mã QR chuyển khoản chính xác số tiền đơn hàng.
   * Khách hàng quét mã QR trên ứng dụng Ngân hàng / Momo để thanh toán.
3. **Hoàn tất đơn hàng**: Nhấp **"Thanh Toán & In Hóa Đơn"**. Giao dịch sẽ được lưu trực tiếp vào doanh số ca trực tương ứng.

---

## 8. 📋 Tab 7: Kiểm Kê Ca Trực & Bàn Giao Tồn Kho

Mục đích: Kiểm tra lượng hàng hóa còn lại tại quầy sau mỗi ca làm việc.

1. **Nhập số lượng kiểm kê thực tế**: Nhân sự cuối ca nhập số lượng tồn thực tế của từng mặt hàng tại quầy.
2. **Đối chiếu chênh lệch**:
   * Hệ thống tự động so sánh: `Tồn lý thuyết = Tồn đầu ca - Số lượng đã bán trên POS`.
   * Hiển thị cảnh báo màu đỏ nếu phát sinh **Thất thoát** (Tồn thực tế < Tồn lý thuyết) hoặc màu xanh nếu **Dư thừa**.
3. **Lưu biên bản bàn giao**: Nhấp **"Lưu Biên Bản Bàn Giao"** để ca sau tiếp quản.

---

## 9. 📦 Tab 8: Kho Hàng & Quản Lý Doanh Thu

Mục đích: Quản lý giá sản phẩm, nhập hàng vào kho và theo dõi lợi nhuận.

* **Thêm / Sửa sản phẩm**: Cập nhật giá bán, giá vốn và định mức tồn kho tối thiểu.
* **Tạo phiếu nhập kho (Restock)**: Nhập số lượng hàng hóa mới về kho để tự động tăng số lượng tồn kho khả dụng.
* **Báo cáo doanh số**: Xem tổng doanh thu trong ngày/tuần, biểu đồ tỷ lệ thanh toán (Tiền mặt vs Chuyển khoản) và danh sách nhật ký giao dịch.

---

## 10. 🏆 Tab 9: Best Seller & Theo Dõi KPI

Mục đích: Theo dõi món F&B bán chạy nhất và chỉ số đóng góp của từng thành viên.

* **Top sản phẩm bán chạy**: Xem xếp hạng các món F&B hot nhất theo sản lượng (ly/suất) và tổng doanh thu mang lại.
* **Bảng xếp hạng cá nhân**: Theo dõi danh sách các thành viên đạt doanh số cao nhất trong quầy.
* **Quản lý đơn lấy hàng**: Theo dõi trạng thái các đơn đặt hàng trước / giao nhận lẻ.

---

## 11. 🥇 Tab 10: Thi Đua F&B & Đồng Bộ Google Sheet

Mục đích: Vinh danh cá nhân / tập thể xuất sắc và xuất báo cáo thi đua.

1. **Xem xếp hạng**:
   * Chuyển đổi giữa các tab **Cá Nhân**, **Nhóm Trực Ca** và **Thi Đua Theo Ban**.
   * Nhấp vào bất kỳ dòng nhân sự nào để hiển thị **Cửa sổ minh bạch công thức tính điểm** (Sản lượng bán x Trọng số + Điểm uy tín + Năng suất ca).
2. **Đồng bộ Google Sheet**:
   * Nhấp **"Cấu hình Google Sheet"**.
   * Sao chép đường dẫn `IMPORTDATA` dán trực tiếp vào Google Sheet để lấy dữ liệu tự động.
   * Hoặc tải file script `.gs` nạp vào Google Apps Script để kích hoạt đồng bộ 2 chiều real-time.

---

## 12. ❓ Hỏi Đáp & Xử Lý Sự Cố Thường Gặp

* **Q: Làm sao để đặt lại toàn bộ dữ liệu kiểm thử về trạng thái ban đầu?**
  * *Trả lời*: Đăng nhập tài khoản Admin -> Vào mục Cài đặt -> Nhấp "Xóa dữ liệu kiểm thử & Đặt lại hệ thống".
* **Q: Khi xếp lịch tự động báo lỗi không có giải pháp?**
  * *Trả lời*: Kiểm tra lại Tab 1 xem có ca trực nào bị 0 người đăng ký rảnh không, hoặc giảm bớt định mức số người trực chính/dự phòng bắt buộc ở Tab 3.
* **Q: Khách hàng chuyển khoản nhưng POS chưa nhận?**
  * *Trả lời*: Nhân sự đối chiếu mã giao dịch trên ứng dụng ngân hàng nhận tiền của shop, sau đó nhấn "Xác nhận đã nhận tiền mặt/CK" trên máy POS.

---

*Chúc dự án F&B của bạn vận hành hiệu quả và đạt nhiều thành tích xuất sắc!* 🚀
