// --- COMPETITION LOGIC ---
document.querySelectorAll('#comp-tabs .p-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#comp-tabs .p-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('.comp-pane').forEach(p => {
            p.style.display = 'none';
        });
        const target = e.target.getAttribute('data-target');
        const pane = document.getElementById(target);
        if (pane) {
            pane.style.display = 'block';
        }
    });
});

async function loadCompetitionStats(week = "TỔNG KẾT") {
    try {
        const res = await fetch(`/api/competition/stats?week=${encodeURIComponent(week)}`);
        const data = await res.json();
        if (data.success) {
            renderCompetitionStats(data);
        }
    } catch (e) {
        console.error("Lỗi tải thi đua:", e);
    }
}

function renderCompetitionStats(data) {
    // 1. Best Seller
    const bsList = document.getElementById('compListBestSeller');
    if (bsList) {
        bsList.innerHTML = '';
        if (data.best_seller.length === 0) {
            bsList.innerHTML = '<div style="padding: 10px; text-align: center; opacity: 0.7;">Chưa có dữ liệu. Hãy tạo giao dịch bán hàng ở ca bất kỳ.</div>';
        } else {
            data.best_seller.forEach((m, idx) => {
                if(m.individual_sales > 0) {
                    bsList.innerHTML += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 10px; border-radius: var(--radius-sm); background: var(--lacquer-3); border: 1px solid var(--rule);">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-weight: bold; width: 24px; text-align: center; color: ${idx===0 ? '#ff9800' : 'var(--text-color)'};">#${idx+1}</span>
                                <span style="font-weight: 500;">${m.name}</span>
                            </div>
                            <div style="font-weight: bold; color: var(--ink-hi);">${m.individual_sales} <span style="font-size: 0.8rem; font-weight: normal; color: var(--ink-dim);">sp</span></div>
                        </div>
                    `;
                }
            });
        }
    }

    // 2. All Rounder
    const arList = document.getElementById('compListAllRounder');
    if (arList) {
        arList.innerHTML = '';
        if (data.all_rounder.length === 0) {
            arList.innerHTML = '<div style="padding: 10px; text-align: center; opacity: 0.7;">Chưa có dữ liệu.</div>';
        } else {
            data.all_rounder.forEach((m, idx) => {
                if(m.total_score > 0) {
                    arList.innerHTML += `
                        <div style="display: flex; flex-direction: column; padding: 12px; margin-bottom: 10px; border-radius: var(--radius-sm); background: var(--lacquer-3); border: 1px solid var(--rule);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-weight: bold; width: 24px; text-align: center; color: ${idx===0 ? '#4caf50' : 'var(--text-color)'};">#${idx+1}</span>
                                    <span style="font-weight: 500;">${m.name}</span>
                                </div>
                                <div style="font-weight: bold; font-size: 1.1rem; color: var(--ink-hi);">${m.total_score.toFixed(1)} <span style="font-size: 0.8rem; font-weight: normal; color: var(--ink-dim);">điểm</span></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--ink-dim);">
                                <span>SL: ${m.sales_score.toFixed(1)}</span>
                                <span>HS: ${m.prod_score.toFixed(1)}</span>
                                <span>UT: ${m.rep_score.toFixed(1)}</span>
                            </div>
                        </div>
                    `;
                }
            });
        }
    }

    // 3. Shift Groups
    const sTable = document.getElementById('compTableShift');
    if (sTable) {
        sTable.innerHTML = '';
        if (data.shift_groups.length === 0) {
            sTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; opacity: 0.7;">Chưa có dữ liệu nhóm ca trực. Hãy xếp ca và ghi nhận bán hàng.</td></tr>';
        } else {
            data.shift_groups.forEach((sg, idx) => {
                sTable.innerHTML += `
                    <tr>
                        <td style="font-weight: bold; text-align: center; color: ${idx===0?'#2196f3':''};">#${idx+1}</td>
                        <td>
                            <div style="font-weight: bold;">${sg.shift_id}</div>
                            <div style="font-size: 0.85rem; color: var(--ink-dim);">${sg.members.join(", ")}</div>
                        </td>
                        <td style="text-align: center;">${sg.sales_score.toFixed(1)}</td>
                        <td style="text-align: center;">${sg.rep_score.toFixed(1)}</td>
                        <td style="text-align: center; font-weight: bold; color: var(--ink-hi);">${sg.total_score.toFixed(1)}</td>
                    </tr>
                `;
            });
        }
    }

    // 4. Departments
    const dTable = document.getElementById('compTableDept');
    if (dTable) {
        dTable.innerHTML = '';
        if (data.departments.length === 0) {
            dTable.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; opacity: 0.7;">Chưa có dữ liệu ban.</td></tr>';
        } else {
            data.departments.forEach((d, idx) => {
                dTable.innerHTML += `
                    <tr>
                        <td style="font-weight: bold; text-align: center; color: ${idx===0?'#9c27b0':''};">#${idx+1}</td>
                        <td style="font-weight: bold;">${d.department}</td>
                        <td style="text-align: center;">${d.sales_score.toFixed(1)}</td>
                        <td style="text-align: center;">${d.prod_score.toFixed(1)}</td>
                        <td style="text-align: center;">${d.rep_score.toFixed(1)}</td>
                        <td style="text-align: center; font-weight: bold; color: var(--ink-hi);">${d.total_score.toFixed(1)}</td>
                    </tr>
                `;
            });
        }
    }
}
