app.post("/api/inventory/checkout", (req, res) => {
    const data = req.body || {};
    const items = data.items || [];
    const channel = String(data.channel || "Phòng Thanh Niên").trim();
    const seller = String(data.seller || "Thành viên trực ca").trim();
    const shift_id = data.shift_id ? String(data.shift_id).trim() : undefined;
    const customer_name = String(data.customer_name || "").trim();
    const customer_phone = String(data.customer_phone || "").trim();
    const payment_method = String(data.payment_method || "Tiền mặt").trim();
    const note = String(data.note || "").trim();

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "Giỏ hàng trống" });
    }

    // Generate single transaction ID for the whole order
    const txId = `TX${String(SALES_LOGS.length + 1).padStart(3, "0")}`;
    const timestamp = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const newTransactions: SaleTransaction[] = [];
    let totalAmount = 0;

    // First check all items in stock
    for (const item of items) {
        const product_id = String(item.product_id || "").trim().toUpperCase();
        const quantity = Math.max(1, parseInt(item.quantity || "1", 10));
        const product = INVENTORY_PRODUCTS.find(p => String(p.id || "").trim().toUpperCase() === product_id);
        if (!product) {
            return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm ${item.product_id}` });
        }
        const currentStock = Math.max(0, product.initial_stock - (product.sold_count || 0));
        if (quantity > currentStock) {
            return res.status(400).json({ success: false, message: `Sản phẩm ${product.name} chỉ còn ${currentStock} trong kho.` });
        }
        
        newTransactions.push({
            id: txId,
            timestamp,
            product_id: product.id,
            product_name: product.name,
            quantity,
            unit_price: product.price,
            total_amount: quantity * product.price,
            channel,
            seller,
            shift_id,
            customer_name,
            customer_phone,
            payment_method,
            note,
        });
    }

    // Now commit the sale
    for (const tx of newTransactions) {
        const product = INVENTORY_PRODUCTS.find(p => p.id === tx.product_id);
        if (product) {
            product.sold_count = (product.sold_count || 0) + tx.quantity;
        }
        totalAmount += tx.total_amount;
        SALES_LOGS.unshift(tx);
    }

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã ghi nhận đơn hàng ${txId} (${totalAmount.toLocaleString("vi-VN")} ₫)!`,
        transaction_id: txId,
        transactions: newTransactions,
        ...inv,
    });
});
