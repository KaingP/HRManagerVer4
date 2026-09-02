export function seedCompetitionData(SALES_LOGS, INCIDENT_LOGS, CURRENT_SHIFTS) {
    if (SALES_LOGS.length === 0) {
        console.log("Seeding mock sales data...");
        const mockSellers = ["Dương Ngọc Nam", "Đỗ Thị Anh", "Lê Quốc Mai", "Huỳnh Quốc Khang", "Hoàng Minh Hương"];
        for(let i=0; i<15; i++) {
            SALES_LOGS.push({
                id: `TX_MOCK_${i}`,
                timestamp: new Date().toLocaleString(),
                product_id: "P01",
                product_name: "Mock Product",
                quantity: Math.floor(Math.random() * 10) + 1,
                unit_price: 10000,
                total_amount: 10000 * (Math.floor(Math.random() * 10) + 1),
                channel: "Phòng Thanh Niên",
                seller: mockSellers[i % mockSellers.length],
                shift_id: "T2_SANG_PHONG",
                refunded: false
            });
        }
        for(let i=0; i<5; i++) {
            INCIDENT_LOGS.push({
                id: `INC_MOCK_${i}`,
                shift_id: "T2_SANG_PHONG",
                member: mockSellers[i % mockSellers.length],
                status_type: i % 2 === 0 ? "Đi trễ" : "Vắng đột xuất",
                note: "Mock incident"
            });
        }
    }
}
