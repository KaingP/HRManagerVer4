app.post("/api/inventory/refund", (req, res) => {
    const data = req.body || {};
    const transaction_id = String(data.transaction_id || "").trim();

    const transactions = SALES_LOGS.filter((t) => t.id === transaction_id);
    if (transactions.length === 0) {
        return res
            .status(404)
            .json({
                success: false,
                message: `Không tìm thấy giao dịch ${transaction_id}`,
            });
    }

    if (transactions.some((t) => t.refunded)) {
        return res
            .status(400)
            .json({
                success: false,
                message: `Giao dịch ${transaction_id} đã được hủy/hoàn tác trước đó!`,
            });
    }

    // Refund all products in this transaction
    for (const transaction of transactions) {
        const product = INVENTORY_PRODUCTS.find(
            (p) => p.id === transaction.product_id,
        );
        if (product) {
            product.sold_count = Math.max(
                0,
                product.sold_count - transaction.quantity,
            );
        }
        transaction.refunded = true;
    }

    persist();
    const inv = getInventoryData();
    res.json({
        success: true,
        message: `Đã hủy đơn hàng ${transaction_id} thành công!`,
        ...inv,
    });
});
