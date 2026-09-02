app.get("/api/competition/stats", (req, res) => {
    const week = req.query.week || "TỔNG KẾT";
    const shifts = LATEST_SCHEDULE_RESULT && LATEST_SCHEDULE_RESULT.assigned_shifts ? LATEST_SCHEDULE_RESULT.assigned_shifts : [];
    
    let memberStats = CURRENT_MEMBERS.map(m => ({
        member_id: m.member_id,
        name: m.name,
        department: m.department,
        individual_sales: 0,
        group_sales_contrib: 0,
        shifts_participated: 0,
        reputation: 100,
        productivity: 0,
        total_score: 0,
        sales_score: 0,
        prod_score: 0,
        rep_score: 0,
        violations: []
    }));
    
    // 1. Individual Sales (Best Seller)
    SALES_LOGS.forEach(tx => {
        if (tx.seller && !tx.refunded) {
            const member = memberStats.find(m => m.name === tx.seller);
            if (member) member.individual_sales += tx.quantity;
        }
    });
    
    // 2. Shift Groups & Equivalent Sales
    let shiftGroups = {};
    SALES_LOGS.forEach(tx => {
        if (!tx.refunded && tx.shift_id) {
            if (!shiftGroups[tx.shift_id]) {
                shiftGroups[tx.shift_id] = { shift_id: tx.shift_id, total_sales: 0, members: [] };
            }
            shiftGroups[tx.shift_id].total_sales += tx.quantity;
        }
    });
    
    shifts.forEach((s: any) => {
        if (!shiftGroups[s.shift_id]) {
            shiftGroups[s.shift_id] = { shift_id: s.shift_id, total_sales: 0, members: [] };
        }
        const assignedNames = (s.assigned_members || []).map((m: any) => m.name);
        shiftGroups[s.shift_id].members = assignedNames;
        
        // Members participated
        assignedNames.forEach((name: string) => {
            const mem = memberStats.find(m => m.name === name);
            if (mem) mem.shifts_participated += 1;
        });
    });
    
    Object.values(shiftGroups).forEach((sg: any) => {
        const memCount = sg.members.length;
        if (memCount > 0) {
            const equivalent = sg.total_sales / memCount;
            sg.equivalent = equivalent;
            sg.members.forEach((name: string) => {
                const mem = memberStats.find(m => m.name === name);
                if (mem) mem.group_sales_contrib += equivalent;
            });
        } else {
            sg.equivalent = 0;
        }
    });
    
    // 3. Reputation (Incidents)
    INCIDENT_LOGS.forEach(inc => {
        if (inc.status_type) {
            const mem = memberStats.find(m => m.name === inc.member);
            if (mem) {
                let penalty = 0;
                if (inc.status_type === "Đi trễ") penalty = 5;
                if (inc.status_type === "Vắng đột xuất" || inc.status_type === "Vắng không phép") penalty = 20;
                if (inc.status_type === "Sử dụng điện thoại") penalty = 5;
                if (penalty > 0) {
                    mem.reputation -= penalty;
                    mem.violations.push({ type: inc.status_type, penalty });
                }
            }
        }
    });
    
    // Calculate final scores
    let maxGroupContrib = Math.max(0.001, ...memberStats.map(m => m.group_sales_contrib));
    
    memberStats.forEach(m => {
        m.productivity = m.shifts_participated > 0 ? (m.group_sales_contrib / m.shifts_participated) : 0;
    });
    let maxProductivity = Math.max(0.001, ...memberStats.map(m => m.productivity));
    
    memberStats.forEach(m => {
        m.sales_score = (m.group_sales_contrib / maxGroupContrib) * 40;
        m.prod_score = (m.productivity / maxProductivity) * 40;
        m.rep_score = (m.reputation) * 0.2; // 100 * 0.2 = 20 max
        m.total_score = m.sales_score + m.prod_score + m.rep_score;
    });
    
    // Department stats
    let deptMap: any = {};
    memberStats.forEach(m => {
        const dept = (m.department || "Không rõ").replace("Ban ", "");
        if (!deptMap[dept]) deptMap[dept] = { department: dept, members: [], total_sales_contrib: 0, total_productivity: 0, total_reputation: 0 };
        deptMap[dept].members.push(m);
        deptMap[dept].total_sales_contrib += m.group_sales_contrib;
        deptMap[dept].total_productivity += m.productivity;
        deptMap[dept].total_reputation += m.reputation;
    });
    
    let depts = Object.values(deptMap).map((d: any) => {
        const cnt = d.members.length || 1;
        d.avg_sales_contrib = d.total_sales_contrib / cnt;
        d.avg_productivity = d.total_productivity / cnt;
        d.avg_reputation = d.total_reputation / cnt;
        return d;
    });
    
    let maxDeptSales = Math.max(0.001, ...depts.map(d => d.avg_sales_contrib));
    let maxDeptProd = Math.max(0.001, ...depts.map(d => d.avg_productivity));
    
    depts.forEach((d: any) => {
        d.sales_score = (d.avg_sales_contrib / maxDeptSales) * 40;
        d.prod_score = (d.avg_productivity / maxDeptProd) * 40;
        d.rep_score = d.avg_reputation * 0.2;
        d.total_score = d.sales_score + d.prod_score + d.rep_score;
    });
    
    // Group Stats
    let sGroups = Object.values(shiftGroups).map((sg: any) => {
        let totalRep = 0;
        sg.members.forEach((name: string) => {
            const mem = memberStats.find(m => m.name === name);
            if (mem) totalRep += mem.reputation;
        });
        sg.avg_reputation = sg.members.length > 0 ? (totalRep / sg.members.length) : 100;
        return sg;
    });
    
    let maxShiftSales = Math.max(0.001, ...sGroups.map((sg: any) => sg.total_sales));
    let maxShiftRep = Math.max(0.001, ...sGroups.map((sg: any) => sg.avg_reputation));
    
    sGroups.forEach((sg: any) => {
        sg.sales_score = (sg.total_sales / maxShiftSales) * 70;
        sg.rep_score = (sg.avg_reputation / maxShiftRep) * 30;
        sg.total_score = sg.sales_score + sg.rep_score;
    });

    res.json({
        success: true,
        week,
        best_seller: [...memberStats].sort((a,b) => b.individual_sales - a.individual_sales).slice(0, 5),
        all_rounder: [...memberStats].sort((a,b) => b.total_score - a.total_score).slice(0, 10),
        departments: [...depts].sort((a: any,b: any) => b.total_score - a.total_score),
        shift_groups: [...sGroups].filter((sg:any) => sg.members.length > 0 && sg.total_sales > 0).sort((a: any,b: any) => b.total_score - a.total_score).slice(0, 10),
    });
});
