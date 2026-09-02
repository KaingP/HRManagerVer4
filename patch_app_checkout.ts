async function handleCheckoutLivePOS() {
    const keys = Object.keys(liveCart);
    const msg = document.getElementById("livePOSMsg");
    if (keys.length === 0) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Giỏ hàng đang trống! Hãy chọn sản phẩm trước.";
        }
        return;
    }

    const seller =
        document.getElementById("livePOSSelectSeller")?.value || "Thu ngân ca";
    const custName = document.getElementById("livePOSCustomerName")?.value.trim() || "";
    const custPhone = document.getElementById("livePOSCustomerPhone")?.value.trim() || "";
    const paymentMethod = document.getElementById("livePOSPaymentMethod")?.value || "Tiền mặt";
    const rawNote = document.getElementById("livePOSInputNote")?.value.trim() || "";
    const shiftId = currentSelectedLiveShiftId || "Live";
    const channelName = `Ca ${shiftId}`;

    if (msg) {
        msg.className = "swap-msg";
        msg.textContent = "Đang thanh toán và ghi nhận giao dịch...";
    }

    try {
        const itemsToCheckout = [];
        for (const id of keys) {
            itemsToCheckout.push({
                product_id: id,
                quantity: liveCart[id].quantity
            });
        }

        const res = await fetch("/api/inventory/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: itemsToCheckout,
                channel: channelName,
                seller: seller,
                shift_id: shiftId,
                customer_name: custName,
                customer_phone: custPhone,
                payment_method: paymentMethod,
                note: rawNote || `Bán hàng POS tại Ca-Live ${shiftId}`,
            }),
        });
        
        const data = await res.json();
        if (data.success) {
            liveCart = {};
            renderLiveCart();
            if (document.getElementById("livePOSCustomerName")) document.getElementById("livePOSCustomerName").value = "";
            if (document.getElementById("livePOSCustomerPhone")) document.getElementById("livePOSCustomerPhone").value = "";
            if (document.getElementById("livePOSInputNote")) document.getElementById("livePOSInputNote").value = "";
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
                setTimeout(() => {
                    msg.textContent = "";
                    msg.className = "swap-msg";
                }, 3000);
            }
            
            globalInventoryData = data;
            renderInventoryKPIs(data.kpis);
            renderInventoryTable(data.products || []);
            renderSalesLogsTable(data.sales_logs || []);
            populateSaleProductOptions(data.products || []);
            renderLivePOSProductGrid();
            if (currentSelectedLiveShiftId) {
                renderLiveShiftSalesTable(currentSelectedLiveShiftId);
            }
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi khi ghi nhận.";
            }
        }
    } catch (e) {
        console.error(e);
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi hệ thống khi thanh toán.";
        }
    }
}
