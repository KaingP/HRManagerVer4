const fs = require('fs');
const file = 'state.json';
if (fs.existsSync(file)) {
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.inventory_products) {
        data.inventory_products = data.inventory_products.filter(p => p.id && typeof p.id === 'string' && !p.id.includes('MOCK'));
    }
    if (data.sales_logs) {
        data.sales_logs = data.sales_logs.filter(t => t.id && typeof t.id === 'string' && !t.id.includes('MOCK'));
    }
    if (data.incident_logs) {
        data.incident_logs = data.incident_logs.filter(i => i.id && typeof i.id === 'string' && !i.id.includes('MOCK'));
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log("Cleared mock data from state.json");
} else {
    console.log("state.json not found");
}
