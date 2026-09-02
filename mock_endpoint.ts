app.post("/api/competition/seed", (req, res) => {
    // Xóa dữ liệu mẫu cũ (nếu có)
    for (let i = SALES_LOGS.length - 1; i >= 0; i--) {
        if (SALES_LOGS[i].id.startsWith("TX_MOCK_")) SALES_LOGS.splice(i, 1);
    }
    for (let i = INCIDENT_LOGS.length - 1; i >= 0; i--) {
        if (INCIDENT_LOGS[i].id.startsWith("INC_MOCK_")) INCIDENT_LOGS.splice(i, 1);
    }

    const shiftsToUse = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
    
    if (shiftsToUse.length === 0) {
        return res.json({ success: false, message: "Chưa có lịch trực. Vui lòng xếp lịch tự động (OR-Tools) trước khi tạo dữ liệu mẫu." });
    }

    // Lặp qua tất cả các ca trực đã xếp để tạo doanh số thực tế cho từng ca
    shiftsToUse.forEach((shift: any, index: number) => {
        const assignedMembers = shift.assigned_members || [];
        if (assignedMembers.length === 0) return;

        // Mô phỏng 1 ca có từ 2 đến 10 đơn hàng
        const numOrders = Math.floor(Math.random() * 8) + 2; 

        for (let i = 0; i < numOrders; i++) {
            // Chọn ngẫu nhiên 1 người bán trong ca
            const seller = assignedMembers[Math.floor(Math.random() * assignedMembers.length)].name;
            const quantity = Math.floor(Math.random() * 5) + 1; // 1-5 sản phẩm
            const unit_price = 15000;

            SALES_LOGS.push({
                id: `TX_MOCK_${Date.now()}_${index}_${i}`,
                timestamp: new Date().toLocaleString(),
                product_id: "F&B_MOCK",
                product_name: "Sản phẩm Demo F&B",
                quantity: quantity,
                unit_price: unit_price,
                total_amount: quantity * unit_price,
                channel: "Phòng Thanh Niên",
                seller: seller,
                shift_id: shift.shift_id,
                refunded: false
            });
        }

        // Thi thoảng tạo lỗi vi phạm (Đi trễ, vắng đột xuất)
        if (Math.random() < 0.15) { // 15% xác suất có lỗi trong ca
            const badMember = assignedMembers[Math.floor(Math.random() * assignedMembers.length)].name;
            const isLate = Math.random() > 0.5;
            INCIDENT_LOGS.push({
                id: `INC_MOCK_${Date.now()}_${index}`,
                shift_id: shift.shift_id,
                member: badMember,
                status_type: isLate ? "Đi trễ" : "Vắng đột xuất",
                note: "Lỗi vi phạm mẫu để kiểm thử"
            });
        }
    });

    persist();
    res.json({ success: true, message: "Đã tạo dữ liệu giao dịch bán hàng và vi phạm thực tế cho các ca trực." });
});
