// Client-side Application Controller for Hùng Vương Concert Scheduler

let currentAdminToken = localStorage.getItem("hv_admin_token") || null;
let currentUserRole = "staff";

// Toast Notification System
function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    let bg = "rgba(15, 23, 42, 0.95)";
    let border = "1px solid rgba(255, 255, 255, 0.15)";
    let icon = "fa-solid fa-circle-info";
    let iconColor = "#38bdf8";

    if (type === "success") {
        bg = "rgba(6, 78, 59, 0.95)";
        border = "1px solid #10b981";
        icon = "fa-solid fa-circle-check";
        iconColor = "#34d399";
    } else if (type === "error") {
        bg = "rgba(127, 29, 29, 0.95)";
        border = "1px solid #ef4444";
        icon = "fa-solid fa-triangle-exclamation";
        iconColor = "#f87171";
    } else if (type === "warning") {
        bg = "rgba(120, 53, 15, 0.95)";
        border = "1px solid #f59e0b";
        icon = "fa-solid fa-triangle-exclamation";
        iconColor = "#fbbf24";
    }

    toast.style.cssText = `background: ${bg}; border: ${border}; color: #ffffff; padding: 12px 18px; border-radius: 8px; font-size: 13.5px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 10px; max-width: 420px; pointer-events: auto; animation: slideIn 0.3s ease-out; backdrop-filter: blur(8px);`;
    toast.innerHTML = `<i class="${icon}" style="color: ${iconColor}; font-size: 16px;"></i> <span>${esc(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s ease-out, transform 0.4s ease-out";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function showToastSuccess(message) {
    showToast(message, "success");
}

document.addEventListener("DOMContentLoaded", async () => {
    initThemeToggle();
    initTabs();
    initMoreMenu();
    initModals();
    initEventListeners();
    await checkAuthStatus();
    loadSavedOptimizerConfig();
    loadCurrentSchedule();
    loadCaNgoaiList();
    loadHeatmapData();
    loadIncidentLogs();
    loadProtocols();
    loadInventoryData();
    initOnlineOrdersExcelHandlers();
    loadOnlineOrders();
    startRealtimeSync();
});

let globalScheduleData = null;
let globalShifts = [];
let globalMembers = [];
let globalCaNgoai = [];
let globalPreviewData = null;
let globalInventoryData = { products: [], sales_logs: [] };
let globalIncidentLogs = [];
let currentEditingShift = null;

// Ba tab này không nằm ở thanh đáy trên điện thoại; chúng ở trong bảng "Thêm".
const MORE_TABS = ["tab-inventory", "tab-audit", "tab-protocols", "tab-kpi"];

// AUTHENTICATION & RBAC HELPERS
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (currentAdminToken) {
        if (options.headers instanceof Headers) {
            options.headers.set("Authorization", `Bearer ${currentAdminToken}`);
        } else {
            options.headers["Authorization"] = `Bearer ${currentAdminToken}`;
        }
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
        const cloned = response.clone();
        try {
            const data = await cloned.json();
            if (data.require_admin) {
                openAdminLoginModal(
                    data.message ||
                        "Thao tác này yêu cầu quyền Quản trị viên. Vui lòng đăng nhập để tiếp tục.",
                );
            }
        } catch (e) {}
    }
    return response;
}

async function checkAuthStatus() {
    try {
        const res = await authFetch("/api/auth/status");
        const data = await res.json();
        currentUserRole = data.role || (data.is_admin ? "admin" : "staff");
        updateAuthUI(data.is_admin === true);
    } catch (e) {
        currentUserRole = "staff";
        updateAuthUI(false);
    }
}

function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);
    document.body.classList.toggle("dark-theme", !isLight);

    const toggleBtn = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const themeLabel = document.getElementById("themeLabel");
    if (toggleBtn) {
        toggleBtn.setAttribute(
            "aria-label",
            isLight
                ? "Chuyển sang giao diện tối"
                : "Chuyển sang giao diện sáng",
        );
        toggleBtn.title = isLight
            ? "Chuyển sang giao diện tối"
            : "Chuyển sang giao diện sáng";
    }
    if (themeIcon) {
        themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
    if (themeLabel) {
        themeLabel.textContent = isLight ? "Dark" : "Light";
    }

    localStorage.setItem("hv_theme", isLight ? "light" : "dark");
}

function initThemeToggle() {
    const savedTheme = localStorage.getItem("hv_theme");
    const prefersLight =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
    const initialTheme = savedTheme || (prefersLight ? "light" : "dark");
    applyTheme(initialTheme);

    const toggleBtn = document.getElementById("themeToggle");
    toggleBtn?.addEventListener("click", () => {
        const isLight = document.body.classList.contains("light-theme");
        applyTheme(isLight ? "dark" : "light");
    });
}

function updateTopbarAdminActions(targetTab) {
    const activeTab = targetTab || document.querySelector(".tab-content.active")?.id || "tab-schedule";
    const btnUpload = document.getElementById("btnOpenUploadModal");
    const btnQuick = document.getElementById("btnQuickOptimize");
    const isOptimizerTab = (activeTab === "tab-optimizer");
    const showAdminTools = (currentUserRole === "admin" && isOptimizerTab);

    if (btnUpload) {
        btnUpload.style.display = showAdminTools ? "inline-flex" : "none";
    }
    if (btnQuick) {
        btnQuick.style.display = showAdminTools ? "inline-flex" : "none";
    }
}

function updateAuthUI(isAdmin) {
    document.body.classList.toggle("admin-mode", isAdmin);
    document.body.classList.toggle("staff-mode", !isAdmin);

    const roleBadge = document.getElementById("roleBadge");
    const roleIcon = document.getElementById("roleIcon");
    const roleText = document.getElementById("roleText");
    const btnToggle = document.getElementById("btnAuthToggle");
    const btnIcon = document.getElementById("btnAuthIcon");
    const btnText = document.getElementById("btnAuthText");
    const btnChangePwd = document.getElementById("btnOpenChangePwdModal");

    if (isAdmin) {
        if (roleBadge) {
            roleBadge.className = "role-badge admin-role";
            if (roleIcon) roleIcon.className = "fa-solid fa-shield-halved";
            if (roleText) roleText.textContent = "Quản Trị Viên";
        }
        if (btnToggle) {
            btnToggle.className = "btn-auth-toggle btn-logout";
            if (btnIcon) btnIcon.className = "fa-solid fa-right-from-bracket";
            if (btnText) btnText.textContent = "Đăng xuất Admin";
            btnToggle.title = "Thoát khỏi chế độ Quản trị viên";
        }
        if (btnChangePwd) btnChangePwd.style.display = "inline-flex";
    } else {
        if (roleBadge) {
            roleBadge.className = "role-badge staff-role";
            if (roleIcon) roleIcon.className = "fa-solid fa-user-check";
            if (roleText) roleText.textContent = "Chế độ Nhân Viên";
        }
        if (btnToggle) {
            btnToggle.className = "btn-auth-toggle btn-login";
            if (btnIcon) btnIcon.className = "fa-solid fa-lock";
            if (btnText) btnText.textContent = "Đăng nhập Admin";
            btnToggle.title = "Đăng nhập để chỉnh sửa ca và kho hàng";
        }
        if (btnChangePwd) btnChangePwd.style.display = "none";
    }

    // Update Topbar Admin Actions (only visible in admin mode AND on optimizer tab)
    updateTopbarAdminActions();

    // Toggle live shift attendance action buttons: Admin gets "Thêm người vào ca", Staff gets "Lưu điểm danh" & "Đặt lại"
    const btnConfirmAttendance = document.getElementById("btnConfirmLiveAttendance");
    const btnResetAttendance = document.getElementById("btnResetLiveAttendance");
    const btnAddMember = document.getElementById("btnAddMemberToLiveShift");

    if (isAdmin) {
        if (btnConfirmAttendance) btnConfirmAttendance.style.display = "none";
        if (btnResetAttendance) btnResetAttendance.style.display = "none";
        if (btnAddMember) btnAddMember.style.display = "inline-flex";
    } else {
        if (btnConfirmAttendance) btnConfirmAttendance.style.display = "inline-flex";
        if (btnResetAttendance) btnResetAttendance.style.display = "inline-flex";
        if (btnAddMember) btnAddMember.style.display = "none";
    }

    // Re-render components with role considerations
    if (globalScheduleData) {
        renderDutyBoard();
        renderMemberTable();
        if (currentSelectedLiveShiftId) {
            renderLiveShiftDetails(currentSelectedLiveShiftId);
        }
    }
    if (globalKpiAttendance) {
        renderKpiAttendance();
    }
    if (globalIncidentLogs) {
        renderIncidentLogs(globalIncidentLogs);
    }
    if (globalInventoryData && globalInventoryData.products) {
        renderInventoryTable(globalInventoryData.products);
    }

}

function openAdminLoginModal(notice) {
    const modal = document.getElementById("adminLoginModal");
    const msg = document.getElementById("adminLoginMsg");
    const input = document.getElementById("inputAdminPassword");
    if (!modal) return;

    if (msg) {
        if (notice) {
            msg.className = "swap-msg info";
            msg.textContent = notice;
            msg.style.display = "block";
        } else {
            msg.style.display = "none";
            msg.textContent = "";
        }
    }
    if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 150);
    }
    modal.classList.add("active");
}

function closeAdminLoginModal() {
    const modal = document.getElementById("adminLoginModal");
    if (modal) modal.classList.remove("active");
}

function openChangePasswordModal() {
    const modal = document.getElementById("changePasswordModal");
    const msg = document.getElementById("changePwdMsg");
    if (!modal) return;
    if (msg) {
        msg.style.display = "none";
        msg.textContent = "";
    }
    document.getElementById("inputOldPassword").value = "";
    document.getElementById("inputNewPassword").value = "";
    document.getElementById("inputConfirmNewPassword").value = "";
    modal.classList.add("active");
}

function closeChangePasswordModal() {
    const modal = document.getElementById("changePasswordModal");
    if (modal) modal.classList.remove("active");
}

// Tab Switching
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    const tabContents = document.querySelectorAll(".tab-content");
    const pageTitle = document.getElementById("pageTitle");
    const moreBtn = document.getElementById("btnMoreMenu");

    const titles = {
        "tab-schedule": "Lịch Trực Toàn Bộ Các Ngày Trong Tuần",
        "tab-optimizer":
            "Tinh Chỉnh Tham Số, Tối Ưu Hóa & Ca Bán Ngoài (OR-Tools)",
        "tab-inventory": "Kho Hàng & Quản Lý Doanh Thu F&B",
        "tab-ca-ngoai": "Quản Lý & Phân Bổ Ca Bán Ngoài",
        "tab-analytics": "Báo Cáo Thống Kê & Heatmap Thời Gian Rảnh",
        "tab-kpi": "Theo Dõi & Điểm Danh KPI Chuyên Cần Nhân Sự",
        "tab-competition": "Bảng Vàng Thi Đua Cá Nhân & Nhóm",
        "tab-audit": "Kiểm Tra Tính Hợp Lệ & Thẩm Định Quy Chuẩn",
        "tab-contingency": "Quản Lý Ca Vắng, Đi Trễ & Nhân Sự Dự Phòng",
        "tab-protocols":
            "Quy Trình Quản Trị Nhân Sự & Dự Trù Rủi Ro (Nhiệm Vụ 2)",
        "tab-live-shift": "Ca-Live & POS Bán Hàng Realtime",
        "tab-orders": "Sổ Đơn Hàng & Chi Tiết Bán Hàng Tất Cả Các Ca",
    };

    navItems.forEach((item) => {
        const label = item.querySelector(".nav-full")?.textContent.trim();
        if (label && !item.title) item.title = label;

        item.addEventListener("click", () => {
            let targetTab = item.getAttribute("data-tab");
            if (!targetTab) return;
            if (targetTab === "tab-ca-ngoai") targetTab = "tab-optimizer";

            // Protect optimizer tab for Admin only
            if (targetTab === "tab-optimizer" && currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Mục Tinh Chỉnh & Tối Ưu Lịch Trực yêu cầu quyền Quản trị viên (Admin). Vui lòng đăng nhập Admin để truy cập.",
                );
                return;
            }

            navItems.forEach((n) => n.classList.remove("active"));
            tabContents.forEach((t) => t.classList.remove("active"));

            item.classList.add("active");
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add("active");

            if (moreBtn)
                moreBtn.classList.toggle(
                    "active",
                    MORE_TABS.includes(targetTab),
                );

            if (targetTab === "tab-inventory" || targetTab === "tab-orders") {
                loadInventoryData();
            } else if (targetTab === "tab-kpi") {
                loadKpiData();
            } else if (targetTab === "tab-competition") {
                loadCompetitionStats();
            } else if (targetTab === "tab-contingency") {
                populateIncidentShiftDropdown();
                if (currentSelectedLiveShiftId) {
                    loadLiveShiftDetailsAndCandidates(currentSelectedLiveShiftId);
                } else {
                    populateLiveShiftDropdown();
                }
            } else if (targetTab === "tab-live-shift") {
                if (currentSelectedLiveShiftId) {
                    renderLiveShiftSalesTable(currentSelectedLiveShiftId);
                }
            }

            if (pageTitle && titles[targetTab]) {
                pageTitle.textContent = titles[targetTab];
            }

            // Sync topbar admin actions visibility
            updateTopbarAdminActions(targetTab);
        });
    });

    // Initialize initial topbar state
    const initialActiveTab = document.querySelector(".tab-content.active")?.id || "tab-schedule";
    if (pageTitle && titles[initialActiveTab]) {
        pageTitle.textContent = titles[initialActiveTab];
    }
    updateTopbarAdminActions(initialActiveTab);
}

function initMoreMenu() {
    const sheet = document.getElementById("moreSheet");
    const trigger = document.getElementById("btnMoreMenu");
    if (!sheet || !trigger) return;

    const setOpen = (open) => {
        sheet.classList.toggle("active", open);
        trigger.setAttribute("aria-expanded", String(open));
    };

    trigger.addEventListener("click", () =>
        setOpen(!sheet.classList.contains("active")),
    );
    sheet.addEventListener("click", (e) => {
        if (e.target === sheet) setOpen(false);
    });
    sheet
        .querySelectorAll(".nav-item")
        .forEach((b) => b.addEventListener("click", () => setOpen(false)));
    document.getElementById("btnMorePreview")?.addEventListener("click", () => {
        setOpen(false);
        openPreviewModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sheet.classList.contains("active"))
            setOpen(false);
    });
}

// Confirmation Modal System (2-step confirmation)
let currentConfirmCallback = null;

function openConfirmModal({
    title,
    message,
    confirmBtnText = "Xác Nhận Xóa",
    onConfirm,
}) {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnProceed = document.getElementById("btnConfirmProceed");
    if (!modal) return;

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${esc(title || "Xác Nhận Hành Động")}</span>`;
    }
    if (msgEl) {
        msgEl.innerHTML = esc(
            message || "Bạn có chắc chắn muốn thực hiện hành động này?",
        );
    }
    if (btnProceed) {
        btnProceed.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${esc(confirmBtnText)}`;
    }
    currentConfirmCallback = onConfirm;
    modal.classList.add("active");
}

function closeConfirmModal() {
    const modal = document.getElementById("confirmModal");
    if (modal) modal.classList.remove("active");
    currentConfirmCallback = null;
}

function initModals() {
    // Shift Edit Modal
    const shiftModal = document.getElementById("shiftEditModal");
    document
        .getElementById("btnCloseShiftModal")
        ?.addEventListener("click", () =>
            shiftModal.classList.remove("active"),
        );
    document
        .getElementById("btnCancelShiftEdit")
        ?.addEventListener("click", () =>
            shiftModal.classList.remove("active"),
        );

    // Upload Data Modal
    const uploadModal = document.getElementById("uploadDataModal");
    const handleOpenUploadModal = () => {
        if (currentUserRole !== "admin") {
            openAdminLoginModal(
                "Bạn cần đăng nhập quyền Quản trị viên để nạp dữ liệu lịch trực!",
            );
            return;
        }
        if (uploadModal) uploadModal.classList.add("active");
    };

    document
        .getElementById("btnOpenUploadModal")
        ?.addEventListener("click", handleOpenUploadModal);
    document
        .getElementById("btnOptimizerUploadTrigger")
        ?.addEventListener("click", handleOpenUploadModal);
    document
        .getElementById("btnCloseUploadModal")
        ?.addEventListener("click", () =>
            uploadModal.classList.remove("active"),
        );

    // Preview Modal
    const previewModal = document.getElementById("previewModal");
    document
        .getElementById("btnOpenPreviewModal")
        ?.addEventListener("click", openPreviewModal);
    document
        .getElementById("btnClosePreviewModal")
        ?.addEventListener("click", () =>
            previewModal.classList.remove("active"),
        );

    // Product Modal
    const productModal = document.getElementById("productModal");
    document
        .getElementById("btnCloseProductModal")
        ?.addEventListener("click", () =>
            productModal?.classList.remove("active"),
        );
    document
        .getElementById("btnCancelProductModal")
        ?.addEventListener("click", () =>
            productModal?.classList.remove("active"),
        );

    // Sale Modal
    const saleModal = document.getElementById("recordSaleModal");
    document
        .getElementById("btnCloseSaleModal")
        ?.addEventListener("click", () =>
            saleModal?.classList.remove("active"),
        );
    document
        .getElementById("btnCancelSaleModal")
        ?.addEventListener("click", () =>
            saleModal?.classList.remove("active"),
        );

    // Admin Login Modal
    document
        .getElementById("btnCloseLoginModal")
        ?.addEventListener("click", closeAdminLoginModal);
    document
        .getElementById("btnCancelLoginModal")
        ?.addEventListener("click", closeAdminLoginModal);

    // Change Password Modal
    document
        .getElementById("btnCloseChangePwdModal")
        ?.addEventListener("click", closeChangePasswordModal);
    document
        .getElementById("btnCancelChangePwdModal")
        ?.addEventListener("click", closeChangePasswordModal);
    document
        .getElementById("btnOpenChangePwdModal")
        ?.addEventListener("click", openChangePasswordModal);

    // Confirmation Modal (2-step)
    document
        .getElementById("btnCloseConfirmModal")
        ?.addEventListener("click", closeConfirmModal);
    document
        .getElementById("btnConfirmCancel")
        ?.addEventListener("click", closeConfirmModal);
    document
        .getElementById("btnConfirmProceed")
        ?.addEventListener("click", async () => {
            if (typeof currentConfirmCallback === "function") {
                const cb = currentConfirmCallback;
                closeConfirmModal();
                await cb();
            } else {
                closeConfirmModal();
            }
        });

    // Close modals on clicking backdrop
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                backdrop.classList.remove("active");
                if (backdrop.id === "confirmModal")
                    currentConfirmCallback = null;
            }
        });
    });
}

function initEventListeners() {
    // Auth Toggle Button (Login / Logout)
    document
        .getElementById("btnAuthToggle")
        ?.addEventListener("click", async () => {
            if (currentUserRole === "admin") {
                // Logout
                try {
                    await authFetch("/api/auth/logout", { method: "POST" });
                } catch (e) {}
                currentAdminToken = null;
                currentUserRole = "staff";
                localStorage.removeItem("hv_admin_token");
                updateAuthUI(false);
            } else {
                // Open Login
                openAdminLoginModal();
            }
        });

    // Toggle show/hide password
    document
        .getElementById("btnToggleShowPassword")
        ?.addEventListener("click", () => {
            const inp = document.getElementById("inputAdminPassword");
            const icon = document.getElementById("iconShowPassword");
            if (!inp) return;
            if (inp.type === "password") {
                inp.type = "text";
                if (icon) icon.className = "fa-solid fa-eye-slash";
            } else {
                inp.type = "password";
                if (icon) icon.className = "fa-solid fa-eye";
            }
        });

    // Admin Login Form Submit
    document
        .getElementById("adminLoginForm")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const pwd =
                document.getElementById("inputAdminPassword")?.value || "";
            const remember =
                document.getElementById("chkRememberAdmin")?.checked;
            const msg = document.getElementById("adminLoginMsg");

            if (!pwd) return;
            if (msg) {
                msg.className = "swap-msg info";
                msg.textContent = "Đang xác thực mật khẩu...";
                msg.style.display = "block";
            }

            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pwd }),
                });
                const data = await res.json();
                if (data.success && data.token) {
                    currentAdminToken = data.token;
                    currentUserRole = "admin";
                    if (remember) {
                        localStorage.setItem("hv_admin_token", data.token);
                    } else {
                        sessionStorage.setItem("hv_admin_token", data.token);
                    }
                    if (msg) {
                        msg.className = "swap-msg success";
                        msg.textContent =
                            "Đăng nhập thành công! Đang kích hoạt quyền Quản trị viên...";
                    }
                    updateAuthUI(true);
                    setTimeout(() => {
                        closeAdminLoginModal();
                    }, 700);
                } else {
                    if (msg) {
                        msg.className = "swap-msg error";
                        msg.textContent =
                            data.message ||
                            "Mật khẩu Quản trị viên không đúng!";
                    }
                }
            } catch (err) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent = "Lỗi kết nối máy chủ: " + err.message;
                }
            }
        });

    // Change Password Form Submit
    document
        .getElementById("changePasswordForm")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPwd =
                document.getElementById("inputOldPassword")?.value || "";
            const newPwd =
                document.getElementById("inputNewPassword")?.value || "";
            const confirmPwd =
                document.getElementById("inputConfirmNewPassword")?.value || "";
            const msg = document.getElementById("changePwdMsg");

            if (newPwd !== confirmPwd) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent =
                        "Mật khẩu mới và xác nhận mật khẩu không khớp nhau!";
                    msg.style.display = "block";
                }
                return;
            }

            if (msg) {
                msg.className = "swap-msg info";
                msg.textContent = "Đang đổi mật khẩu...";
                msg.style.display = "block";
            }

            try {
                const res = await authFetch("/api/auth/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        old_password: oldPwd,
                        new_password: newPwd,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    if (msg) {
                        msg.className = "swap-msg success";
                        msg.textContent =
                            data.message || "Đổi mật khẩu thành công!";
                    }
                    setTimeout(() => {
                        closeChangePasswordModal();
                    }, 1200);
                } else {
                    if (msg) {
                        msg.className = "swap-msg error";
                        msg.textContent =
                            data.message || "Đổi mật khẩu thất bại!";
                    }
                }
            } catch (err) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent = "Lỗi máy chủ: " + err.message;
                }
            }
        });

    // Quick optimize button
    document
        .getElementById("btnQuickOptimize")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để chạy thuật toán tối ưu xếp ca!",
                );
                return;
            }
            runOptimizerWithParams(getOptimizerFullConfigFromUI());
        });

    // Member Stats Search input
    document
        .getElementById("memberStatsSearchInput")
        ?.addEventListener("input", () => {
            renderMemberTable();
        });

    // Optimizer Form & Save Config
    document
        .getElementById("optimizerForm")
        ?.addEventListener("submit", (e) => {
            e.preventDefault();
            handleSaveOptimizerConfig();
        });

    document
        .getElementById("btnSaveOptimizerSettingsHeader")
        ?.addEventListener("click", handleSaveOptimizerConfig);

    // Optimizer Config Backup & Restore Listeners
    document
        .getElementById("btnSaveOptimizerSettings")
        ?.addEventListener("click", handleSaveOptimizerConfig);

    document
        .getElementById("btnExportOptimizerConfigJson")
        ?.addEventListener("click", handleExportOptimizerConfigJson);

    document
        .getElementById("btnTriggerImportOptimizerConfig")
        ?.addEventListener("click", () => {
            document.getElementById("inputImportOptimizerConfigJson")?.click();
        });

    document
        .getElementById("inputImportOptimizerConfigJson")
        ?.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleImportOptimizerConfigJson(e.target.files[0]);
                e.target.value = "";
            }
        });

    document
        .getElementById("btnResetOptimizerDefaults")
        ?.addEventListener("click", handleResetOptimizerDefaults);

    // Cancel Shift Button in Modal
    document
        .getElementById("btnDeleteOrCancelShift")
        ?.addEventListener("click", handleCancelCurrentShift);

    // Inventory Event Listeners
    document
        .getElementById("btnOpenAddProductModal")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để thêm sản phẩm mới vào kho hàng!",
                );
                return;
            }
            openProductModalForAdd();
        });
    document
        .getElementById("btnOpenRecordSaleModal")
        ?.addEventListener("click", () => openQuickSaleModal());
    document
        .getElementById("productForm")
        ?.addEventListener("submit", handleSaveProduct);
    document
        .getElementById("recordSaleForm")
        ?.addEventListener("submit", handleSaveSale);
    document
        .getElementById("saleSelectProduct")
        ?.addEventListener("change", updateSaleCalcTotal);
    document
        .getElementById("saleInputQty")
        ?.addEventListener("input", updateSaleCalcTotal);

    // Master Toggle Ca Ngoài (Enable/Disable below section)
    const masterNgoaiCheckbox = document.getElementById("chkMasterNgoai");
    masterNgoaiCheckbox?.addEventListener("change", async (e) => {
        if (currentUserRole !== "admin") {
            e.preventDefault();
            e.target.checked = !e.target.checked;
            openAdminLoginModal(
                "Bạn cần đăng nhập quyền Quản trị viên để thay đổi cài đặt ca bán ngoài!",
            );
            return;
        }
        const enabled = e.target.checked;
        updateCaNgoaiPanelState(enabled);
        await authFetch("/api/ca-ngoai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: enabled }),
        });
    });

    // Add Ca Ngoài Form
    document
        .getElementById("formAddCaNgoai")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để thêm ca bán ngoài!",
                );
                return;
            }
            const name = document.getElementById("inputNgoaiName").value.trim();
            const day = document.getElementById("selectNgoaiDay").value;
            const startT = document
                .getElementById("inputNgoaiStart")
                .value.trim();
            const endT = document.getElementById("inputNgoaiEnd").value.trim();
            const chinh = parseInt(
                document.getElementById("selectNgoaiChinh").value,
            );
            const dp = parseInt(document.getElementById("selectNgoaiDP").value);

            if (!name) return;

            const newItem = {
                name: name,
                day: day,
                start_time: startT,
                end_time: endT,
                chinh: chinh,
                dp: dp,
            };

            const res = await authFetch("/api/ca-ngoai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add", item: newItem }),
            });
            const data = await res.json();
            if (data.success) {
                globalCaNgoai = data.list;
                renderCaNgoaiTable();
                document.getElementById("inputNgoaiName").value = "";
            }
        });

    // Clear all Ca Ngoài with 2-step confirmation modal
    document
        .getElementById("btnClearAllCaNgoai")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để xóa ca bán ngoài!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Xóa Tất Cả Ca Bán Ngoài",
                message:
                    "Bạn có chắc chắn muốn xóa tất cả các ca bán ngoài? Toàn bộ danh sách điểm ca ngoài đã cấu hình sẽ bị xóa.",
                confirmBtnText: "Xác Nhận Xóa Hết",
                onConfirm: async () => {
                    try {
                        const res = await authFetch("/api/ca-ngoai", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "clear" }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            globalCaNgoai = [];
                            renderCaNgoaiTable();
                            loadCurrentSchedule();
                        }
                    } catch (e) {
                        console.error("Error clearing ca ngoai:", e);
                    }
                },
            });
        });

    // Reset Incidents / Late Attendance History with 2-step confirmation modal
    document
        .getElementById("btnResetIncidents")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để xóa lịch sử điểm danh!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Xóa Lịch Sử Điểm Danh & Sự Cố",
                message:
                    "Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm danh, báo cáo đi trễ, vắng mặt và nhân sự thay thế? Dữ liệu này sẽ được đặt lại về 0.",
                confirmBtnText: "Xóa Lịch Sử",
                onConfirm: async () => {
                    try {
                        const res = await authFetch("/api/contingency/reset", {
                            method: "POST",
                        });
                        const data = await res.json();
                        if (data.success) {
                            loadIncidentLogs();
                            loadCurrentSchedule();
                        }
                    } catch (e) {
                        console.error("Error resetting incidents:", e);
                    }
                },
            });
        });

    // Filter Listeners
    document.querySelectorAll("#channelFilter .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll("#channelFilter .filter-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderDutyBoard();
        });
    });

    document
        .getElementById("dayFilter")
        ?.addEventListener("change", renderDutyBoard);
    document
        .getElementById("memberSearchInput")
        ?.addEventListener("input", renderDutyBoard);

    // Upload & Sync Data
    document
        .getElementById("btnSyncGoogleSheet")
        ?.addEventListener("click", handleSyncGoogleSheet);
    document
        .getElementById("btnUploadFile")
        ?.addEventListener("click", handleUploadFile);

    // Shift Edit Save
    document
        .getElementById("btnSaveShiftEdit")
        ?.addEventListener("click", handleSaveShiftEdit);

    // Incident Shift Select Change
    document
        .getElementById("incidentShiftSelect")
        ?.addEventListener("change", handleIncidentShiftChange);
    document
        .getElementById("btnSubmitIncident")
        ?.addEventListener("click", handleSubmitIncident);

    // Preview Sheet Tabs
    document.querySelectorAll(".p-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".p-tab-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderPreviewSheet(btn.getAttribute("data-sheet"));
        });
    });

    // Copy for Google Sheets
    document
        .getElementById("btnCopyForGSheets")
        ?.addEventListener("click", copyCurrentPreviewTable);

    // Protocols Sub-tabs
    document.querySelectorAll(".p-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".p-nav-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderProtocolSection(btn.getAttribute("data-sec"));
        });
    });

    // Ca-Live & POS Event Listeners
    document
        .getElementById("liveShiftSelect")
        ?.addEventListener("change", (e) => {
            const val = e.target.value;
            const posSelect = document.getElementById("livePOSShiftSelect");
            if (posSelect && posSelect.value !== val) posSelect.value = val;
            loadLiveShiftDetailsAndCandidates(val);
        });

    document
        .getElementById("livePOSShiftSelect")
        ?.addEventListener("change", (e) => {
            const val = e.target.value;
            const attSelect = document.getElementById("liveShiftSelect");
            if (attSelect && attSelect.value !== val) attSelect.value = val;
            loadLiveShiftDetailsAndCandidates(val);
        });

    document
        .getElementById("btnClearLiveCart")
        ?.addEventListener("click", () => {
            liveCart = {};
            renderLiveCart();
        });

    document
        .getElementById("btnCheckoutLivePOS")
        ?.addEventListener("click", handleCheckoutLivePOS);

    // Hỗ trợ phím tắt Enter tại tab 'Ca-Live' để xác nhận thanh toán nhanh chóng
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const liveTab = document.getElementById("tab-live-shift");
            if (liveTab && liveTab.classList.contains("active")) {
                const keys = Object.keys(liveCart || {});
                if (keys.length > 0) {
                    e.preventDefault();
                    handleCheckoutLivePOS();
                }
            }
        }
    });

    document.getElementById("btnPOSQuickAdd")?.addEventListener("click", () => {
        const prodId = document.getElementById("livePOSQuickSelect")?.value;
        if (!prodId) {
            alert(
                "Vui lòng chọn 1 sản phẩm từ danh sách để thêm vào giỏ hàng!",
            );
            return;
        }
        addToLiveCart(prodId);
    });

    document
        .getElementById("btnToggleLiveHeader")
        ?.addEventListener("click", () => {
            const body = document.getElementById("liveHeaderBody");
            const icon = document.getElementById("iconToggleLiveHeader");
            const txt = document.getElementById("textToggleLiveHeader");
            if (!body) return;
            const isHidden = body.style.display === "none";
            body.style.display = isHidden ? "flex" : "none";
            if (icon)
                icon.className = isHidden
                    ? "fa-solid fa-chevron-up"
                    : "fa-solid fa-chevron-down";
            if (txt) txt.textContent = isHidden ? "Thu gọn" : "Mở rộng";
        });

    document
        .getElementById("btnLiveOpenIncidentModal")
        ?.addEventListener("click", () => {
            const sel = document.getElementById("liveShiftSelect");
            if (sel && sel.value) {
                switchToTab("tab-contingency");
                const incSel = document.getElementById("incidentShiftSelect");
                if (incSel) {
                    incSel.value = sel.value;
                    handleIncidentShiftChange();
                }
            }
        });

    // Upload Product Catalog Excel Modal Event Listeners
    initInventoryExcelUpload();

    // Export Contingency Incident Excel
    document
        .getElementById("btnExportIncidentExcel")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để xuất file Excel ca vắng & dự phòng!");
                return;
            }
            exportIncidentLogsExcel();
        });

    // Contingency Shift Search input listener
    document
        .getElementById("contingencyShiftSearch")
        ?.addEventListener("input", (e) => {
            populateLiveShiftDropdown(e.target.value);
        });


    // KPI Event Listeners
    document
        .getElementById("kpiShiftSearchInput")
        ?.addEventListener("input", renderKpiAttendance);
    document
        .getElementById("kpiMemberSearchInput")
        ?.addEventListener("input", renderKpiLeaderboard);
    document
        .getElementById("btnResetKpiAttendance")
        ?.addEventListener("click", async () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để đặt lại trạng thái điểm danh!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Đặt Lại Điểm Danh",
                message:
                    "Bạn có chắc chắn muốn đặt lại trạng thái điểm danh của tất cả thành viên về mặc định (Đúng giờ)?",
                confirmBtnText: "Đặt Lại Toàn Bộ",
                onConfirm: async () => {
                    try {
                        const res = await authFetch(
                            "/api/kpi/attendance/reset",
                            { method: "POST" },
                        ).then((r) => r.json());
                        if (res.success) {
                            globalKpiAttendance = res.attendance || [];
                            renderKpiAll();
                        }
                    } catch (e) {
                        console.error("Error resetting KPI attendance:", e);
                    }
                },
            });
        });
    document
        .getElementById("btnExportKpiReport")
        ?.addEventListener("click", () => {
            exportKpiReportCSV();
        });

    startLiveClock();
}

function updateCaNgoaiPanelState(enabled) {
    const grid = document.getElementById("outsideShiftsGrid");
    if (!grid) return;

    if (enabled) {
        grid.classList.remove("disabled-panel");
        document
            .querySelectorAll(
                "#formAddCaNgoai input, #formAddCaNgoai select, #formAddCaNgoai button, #btnClearAllCaNgoai",
            )
            .forEach((el) => {
                el.disabled = false;
            });
    } else {
        grid.classList.add("disabled-panel");
        document
            .querySelectorAll(
                "#formAddCaNgoai input, #formAddCaNgoai select, #formAddCaNgoai button, #btnClearAllCaNgoai",
            )
            .forEach((el) => {
                el.disabled = true;
            });
    }
}

// Load Initial Schedule
async function loadCurrentSchedule() {
    try {
        const [resSched, resShifts, resMembers] = await Promise.all([
            fetch("/api/schedule/current").then((r) => r.json()),
            fetch("/api/shifts").then((r) => r.json()),
            fetch("/api/members").then((r) => r.json()),
        ]);

        if (resShifts.success) globalShifts = resShifts.shifts;
        if (resMembers.success) globalMembers = resMembers.members;

        if (resSched.success) {
            globalScheduleData = resSched.result;
            if (globalScheduleData && globalScheduleData.start_date) {
                const dateInp = document.getElementById("cfgStartDate");
                if (dateInp) dateInp.value = globalScheduleData.start_date;
            }
            populateUI();
        }
    } catch (err) {
        console.error("Error loading schedule:", err);
    }
}

// Load Ca Ngoài List
async function loadCaNgoaiList() {
    try {
        const res = await fetch("/api/ca-ngoai");
        const data = await res.json();
        if (data.success) {
            globalCaNgoai = data.list || [];
            const masterCb = document.getElementById("chkMasterNgoai");
            if (masterCb) {
                masterCb.checked = data.enabled;
                updateCaNgoaiPanelState(data.enabled);
            }
            renderCaNgoaiTable();
        }
    } catch (e) {
        console.error("Error loading ca ngoai:", e);
    }
}

// Render Ca Ngoài Table
function renderCaNgoaiTable() {
    const tbody = document.getElementById("caNgoaiTableBody");
    if (!tbody) return;

    if (!globalCaNgoai.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="text-align: center; padding: 24px 12px; color: var(--ink-dim);">Chưa có ca bán ngoài nào. Thêm từ bảng bên trái.</td></tr>`;
        return;
    }

    let html = "";
    globalCaNgoai.forEach((item, idx) => {
        html += `
            <tr>
                <td class="cell-center mk-num" style="text-align: center; padding: 8px 6px;">${idx + 1}</td>
                <td style="padding: 8px 10px;"><strong style="color: var(--ink-hi);">${item.name}</strong></td>
                <td class="cell-center" style="text-align: center; padding: 8px 6px; white-space: nowrap;">${item.day}</td>
                <td class="cell-center mk-num" style="text-align: center; padding: 8px 6px; white-space: nowrap;">${item.start_time}</td>
                <td class="cell-center mk-num" style="text-align: center; padding: 8px 6px; white-space: nowrap;">${item.end_time}</td>
                <td class="cell-center mk-lead" style="text-align: center; padding: 8px 6px; white-space: nowrap; font-weight: 700;">${item.chinh}</td>
                <td class="cell-center mk-dp" style="text-align: center; padding: 8px 6px; white-space: nowrap; font-weight: 700;">${item.dp}</td>
                <td class="cell-center" style="text-align: center; padding: 8px 6px; white-space: nowrap;">
                    <button class="btn-delete-row" onclick="deleteCaNgoaiItem('${item.id}')" style="padding: 3px 8px; font-size: 0.75rem; min-height: 26px; border-radius: 4px;" title="Xóa ca ngoài này">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.deleteCaNgoaiItem = async function (id) {
    const res = await fetch("/api/ca-ngoai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: id }),
    });
    const data = await res.json();
    if (data.success) {
        globalCaNgoai = data.list;
        renderCaNgoaiTable();
    }
};

// ---------------------------------------------------------------------------
// Trạng thái chờ giải.
// Solve mất 15–25s ở máy này, lâu hơn trên Render. Chỉ một cái spinner thì
// người dùng tưởng treo và bấm lại → gửi thêm một lượt solve nữa.
// Ba bước dưới đây là ba bước quan sát được thật; server không báo tiến độ
// giữa chừng nên không bịa ra các mốc bên trong bộ giải.
// ---------------------------------------------------------------------------
const solveUI = {
    timer: null,
    start: 0,

    step(n, state) {
        const el = document.querySelector(`.solve-step[data-step="${n}"]`);
        if (!el) return;
        el.classList.remove("busy", "done");
        if (state) el.classList.add(state);
        const icon =
            state === "done"
                ? "fa-solid fa-check"
                : state === "busy"
                  ? "fa-solid fa-circle-notch fa-spin"
                  : "fa-regular fa-circle";
        el.querySelector("i").className = icon;
    },

    open() {
        const overlay = document.getElementById("solveOverlay");
        if (!overlay) return;
        this.start = Date.now();
        [1, 2, 3].forEach((n) => this.step(n, null));
        this.step(1, "busy");
        overlay.classList.add("active");

        const out = document.getElementById("solveElapsed");
        this.timer = setInterval(() => {
            if (out)
                out.textContent = Math.round((Date.now() - this.start) / 1000);
        }, 500);
    },

    close() {
        clearInterval(this.timer);
        this.timer = null;
        document.getElementById("solveOverlay")?.classList.remove("active");
    },

    seconds() {
        return Math.round((Date.now() - this.start) / 1000);
    },
};

// Optimizer Config Data Helpers
function getDailyShiftConfigsFromUI() {
    const configs = [];
    for (let i = 1; i <= 5; i++) {
        const start = document.getElementById(`shift${i}Start`)?.value || "07:00";
        const end = document.getElementById(`shift${i}End`)?.value || "09:30";
        const note = document.getElementById(`shift${i}Note`)?.value || "";
        const chinh = parseInt(document.getElementById(`shift${i}Chinh`)?.value || "4", 10);
        const dp = parseInt(document.getElementById(`shift${i}DP`)?.value || "1", 10);
        configs.push({
            shift_num: i,
            start_time: start,
            end_time: end,
            note: note,
            chinh_count: chinh,
            dp_count: dp,
            active: true,
        });
    }
    return configs;
}

function applyDailyShiftConfigsToUI(configs) {
    if (!Array.isArray(configs) || !configs.length) return;
    configs.forEach((c) => {
        const num = c.shift_num;
        const startInput = document.getElementById(`shift${num}Start`);
        const endInput = document.getElementById(`shift${num}End`);
        const noteInput = document.getElementById(`shift${num}Note`);
        const chinhInput = document.getElementById(`shift${num}Chinh`);
        const dpInput = document.getElementById(`shift${num}DP`);

        if (startInput && c.start_time) startInput.value = c.start_time;
        if (endInput && c.end_time) endInput.value = c.end_time;
        if (noteInput && c.note !== undefined) noteInput.value = c.note;
        if (chinhInput && c.chinh_count !== undefined) chinhInput.value = c.chinh_count;
        if (dpInput && c.dp_count !== undefined) dpInput.value = c.dp_count;
    });
}

function getOptimizerFullConfigFromUI() {
    const startDate = document.getElementById("cfgStartDate")?.value || "2026-08-24";
    const minShifts = parseInt(document.getElementById("cfgMinShifts")?.value || "3", 10);
    const maxShifts = parseInt(document.getElementById("cfgMaxShifts")?.value || "5", 10);
    const maxDaily = parseInt(document.getElementById("cfgMaxDaily")?.value || "2", 10);
    const enableCaNgoai = document.getElementById("chkMasterNgoai")
        ? document.getElementById("chkMasterNgoai").checked
        : true;
    const dailyConfigs = getDailyShiftConfigsFromUI();

    return {
        start_date: startDate,
        min_shifts: minShifts,
        max_shifts: maxShifts,
        max_shifts_per_day: maxDaily,
        enable_ca_ngoai: enableCaNgoai,
        daily_shift_configs: dailyConfigs,
        custom_ca_ngoai: globalCaNgoai,
    };
}

function applyOptimizerConfigToUI(config) {
    if (!config) return;
    if (config.start_date) {
        const inp = document.getElementById("cfgStartDate");
        if (inp) inp.value = config.start_date;
    }
    if (config.phong_chinh_count !== undefined) {
        const inp = document.getElementById("cfgPhongChinh");
        if (inp) inp.value = config.phong_chinh_count;
    }
    if (config.phong_dp_count !== undefined) {
        const inp = document.getElementById("cfgPhongDP");
        if (inp) inp.value = config.phong_dp_count;
    }
    if (config.min_shifts !== undefined) {
        const inp = document.getElementById("cfgMinShifts");
        if (inp) inp.value = config.min_shifts;
    }
    if (config.max_shifts !== undefined) {
        const inp = document.getElementById("cfgMaxShifts");
        if (inp) inp.value = config.max_shifts;
    }
    if (config.max_shifts_per_day !== undefined) {
        const inp = document.getElementById("cfgMaxDaily");
        if (inp) inp.value = config.max_shifts_per_day;
    }
    if (config.enable_ca_ngoai !== undefined) {
        const cb = document.getElementById("chkMasterNgoai");
        if (cb) {
            cb.checked = config.enable_ca_ngoai;
            updateCaNgoaiPanelState(config.enable_ca_ngoai);
        }
    }
    if (config.daily_shift_configs) {
        applyDailyShiftConfigsToUI(config.daily_shift_configs);
    }
}

async function loadSavedOptimizerConfig() {
    try {
        const res = await fetch("/api/config/optimizer");
        const data = await res.json();
        if (data.success && data.config) {
            applyOptimizerConfigToUI(data.config);
        }
    } catch (e) {
        console.warn("Could not load optimizer config:", e);
    }
}

async function handleSaveOptimizerConfig() {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để lưu cấu hình tinh chỉnh ca!");
        return;
    }
    const config = getOptimizerFullConfigFromUI();
    const msg = document.getElementById("optimizerConfigMsg");
    try {
        const res = await authFetch("/api/config/optimizer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = "✓ Đã lưu toàn bộ cài đặt tinh chỉnh ca vào hệ thống máy chủ an toàn!";
                msg.style.display = "block";
                setTimeout(() => { msg.style.display = "none"; }, 4000);
            }
            showToastSuccess("Đã sao lưu cài đặt tinh chỉnh ca trực thành công!");
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = "Lỗi khi lưu cài đặt: " + data.message;
                msg.style.display = "block";
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối máy chủ: " + e.message;
            msg.style.display = "block";
        }
    }
}

function handleExportOptimizerConfigJson() {
    const config = getOptimizerFullConfigFromUI();
    const jsonStr = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Cai_Dat_Tinh_Chinh_Ca_Truc_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToastSuccess("Đã tải xuống file sao lưu cài đặt JSON thành công!");
}

async function handleImportOptimizerConfigJson(file) {
    if (!file) return;
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để nạp cấu hình tinh chỉnh ca!");
        return;
    }
    try {
        const text = await file.text();
        const config = JSON.parse(text);
        if (!config || typeof config !== "object") {
            throw new Error("File JSON không hợp lệ");
        }
        applyOptimizerConfigToUI(config);

        // Save immediately to server
        const res = await authFetch("/api/config/optimizer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
        const data = await res.json();
        const msg = document.getElementById("optimizerConfigMsg");
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = "✓ Đã khôi phục và lưu cài đặt tinh chỉnh ca từ file sao lưu!";
                msg.style.display = "block";
                setTimeout(() => { msg.style.display = "none"; }, 4000);
            }
            showToastSuccess("Đã nạp file sao lưu cài đặt thành công!");
        } else {
            alert("Đã áp dụng vào giao diện nhưng lưu server thất bại: " + data.message);
        }
    } catch (e) {
        alert("Lỗi đọc file sao lưu JSON: " + e.message);
    }
}

async function handleResetOptimizerDefaults() {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để khôi phục cài đặt mặc định!");
        return;
    }
    if (!confirm("Bạn có chắc chắn muốn khôi phục tất cả thông số tinh chỉnh ca trực về giá trị mặc định chuẩn?")) {
        return;
    }
    try {
        const res = await authFetch("/api/config/optimizer/reset", {
            method: "POST",
        });
        const data = await res.json();
        if (data.success && data.config) {
            applyOptimizerConfigToUI(data.config);
            const msg = document.getElementById("optimizerConfigMsg");
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = "✓ Đã khôi phục toàn bộ cài đặt tinh chỉnh về thông số chuẩn mặc định!";
                msg.style.display = "block";
                setTimeout(() => { msg.style.display = "none"; }, 4000);
            }
            showToastSuccess("Đã khôi phục cài đặt mặc định thành công!");
        }
    } catch (e) {
        alert("Lỗi khi khôi phục cài đặt: " + e.message);
    }
}

// Run Optimizer API
async function runOptimizerWithParams(params) {
    const btn = document.getElementById("btnRunOptimizer");
    const quickBtn = document.getElementById("btnQuickOptimize");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML =
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang giải bài toán tối ưu với OR-Tools...';
    }
    if (quickBtn) quickBtn.disabled = true;
    solveUI.open();

    try {
        const isNgoaiEnabled = document.getElementById("chkMasterNgoai")
            ? document.getElementById("chkMasterNgoai").checked
            : true;
        const currentConfig = getOptimizerFullConfigFromUI();
        const payload = {
            ...currentConfig,
            ...params,
            enable_ca_ngoai: isNgoaiEnabled,
            custom_ca_ngoai: globalCaNgoai,
        };
        const req = authFetch("/api/schedule/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        solveUI.step(1, "done");
        solveUI.step(2, "busy");

        const res = await req;
        const data = await res.json();
        solveUI.step(2, "done");
        solveUI.step(3, "busy");

        if (data.success) {
            globalScheduleData = data.result;
            populateUI();
            solveUI.step(3, "done");
            // Không alert khi thành công: bảng phân ca cập nhật tại chỗ và dải
            // trên đầu bảng đã nói rõ còn thiếu ai hay đủ cả. Một hộp thoại
            // nữa chỉ bắt bấm thêm một lần.
            switchToTab("tab-schedule");
        } else {
            alert(
                "Không giải được bài toán: " + (data.message || "lỗi không rõ"),
            );
        }
    } catch (e) {
        alert(
            "Mất kết nối tới server sau " +
                solveUI.seconds() +
                " giây: " +
                e.message,
        );
    } finally {
        solveUI.close();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML =
                '<i class="fa-solid fa-play"></i> Thực Thi Thuật Toán Phân Ca Tối Ưu (Google OR-Tools CP-SAT)';
        }
        if (quickBtn) quickBtn.disabled = false;
    }
}

// Chuyển tab bằng cách bấm hộ vào nav item — dùng lại đúng một đường đi của
// initTabs() thay vì tự bật/tắt class ở nơi thứ hai.
function switchToTab(tabId) {
    document.querySelector(`.nav-menu .nav-item[data-tab="${tabId}"]`)?.click();
}

function populateUI() {
    if (!globalScheduleData) return;

    renderDutyBoard();
    renderKPIs();
    renderMemberTable();
    renderAuditResults();
    loadProtocols();
    loadHeatmapData();
    populateIncidentShiftDropdown();
    populateLiveShiftDropdown();
}

// ---------------------------------------------------------------------------
// BẢNG PHÂN CA
// Trước đây 39 ca đổ ra 39 card giống nhau, phải cuộn hết mới biết ca nào
// thiếu người. Nay là lưới ngày × khung giờ: ô thiếu người hiện thành dòng kẻ
// trống chờ điền tên, thấy ngay từ xa. Trên điện thoại lưới 7 cột không đọc
// được, nên cùng dữ liệu đó render thành agenda theo ngày.
// ---------------------------------------------------------------------------

const BOARD_DAYS = [
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
    "Chủ Nhật",
];
const DAY_ABBR = {
    "Thứ 2": "T2",
    "Thứ 3": "T3",
    "Thứ 4": "T4",
    "Thứ 5": "T5",
    "Thứ 6": "T6",
    "Thứ 7": "T7",
    "Chủ Nhật": "CN",
};
const BOARD_SLOTS = [
    "07:00 - 09:30",
    "09:35 - 12:00",
    "12:05 - 14:00",
    "14:05 - 16:05",
    "16:10 - 18:00",
];

const SLOT_LABEL_MAP = {
    "07:00 - 09:30": { ca: "Ca 1", time: "07:00 – 09:30" },
    "09:35 - 12:00": { ca: "Ca 2", time: "09:35 – 12:00" },
    "12:05 - 14:00": { ca: "Ca 3", time: "12:05 – 14:00" },
    "14:05 - 16:05": { ca: "Ca 4", time: "14:05 – 16:05" },
    "16:10 - 18:00": { ca: "Ca 5", time: "16:10 – 18:00" },
};
const NGOAI_ROW = "__ngoai__";

let agendaDay = null;

function esc(str) {
    return String(str ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );
}

// Phân loại hàng cho ca trực trên bảng tuần (Ca 1 -> Ca 5 cho phòng, hoặc Ca ngoài ở dưới cùng)
function boardRowOf(shift) {
    if (!shift) return NGOAI_ROW;

    // Nếu rõ ràng là ca ngoài
    if (
        shift.type === "Ngoai" ||
        (shift.type_label && shift.type_label.toLowerCase().includes("ngoài")) ||
        (shift.location && !shift.location.toLowerCase().includes("phòng") && shift.type !== "Phong")
    ) {
        return NGOAI_ROW;
    }

    const slotStr = String(shift.slot || "").trim();
    const startStr = String(shift.start_time || "").trim();
    const idStr = String(shift.shift_id || "").trim();

    // 1. Khớp chính xác với BOARD_SLOTS
    if (BOARD_SLOTS.includes(slotStr)) return slotStr;

    // 2. Nhận diện Ca 1 (07:00 - 09:30)
    if (
        startStr.startsWith("07") ||
        startStr.startsWith("7:") ||
        startStr.startsWith("7h") ||
        slotStr.includes("07h00") ||
        slotStr.includes("7h - 9h") ||
        slotStr.includes("07:00") ||
        idStr.endsWith("1") ||
        idStr.endsWith("6")
    ) {
        return "07:00 - 09:30";
    }

    // 3. Nhận diện Ca 2 (09:35 - 12:00)
    if (
        startStr.startsWith("09") ||
        startStr.startsWith("9:") ||
        startStr.startsWith("9h") ||
        slotStr.includes("09h35") ||
        slotStr.includes("9h - 11h") ||
        slotStr.includes("09:35") ||
        idStr.endsWith("2") ||
        idStr.endsWith("7")
    ) {
        return "09:35 - 12:00";
    }

    // 4. Nhận diện Ca 3 (12:05 - 14:00)
    if (
        startStr.startsWith("11") ||
        startStr.startsWith("12:0") ||
        startStr.startsWith("12h") ||
        slotStr.includes("12h05") ||
        slotStr.includes("11h - 13h") ||
        slotStr.includes("12:05") ||
        idStr.endsWith("3") ||
        idStr.endsWith("8")
    ) {
        return "12:05 - 14:00";
    }

    // 5. Nhận diện Ca 4 (14:05 - 16:05)
    if (
        startStr.startsWith("13") ||
        startStr.startsWith("14:0") ||
        startStr.startsWith("14h") ||
        slotStr.includes("14h05") ||
        slotStr.includes("13h - 15h") ||
        slotStr.includes("14:05") ||
        idStr.endsWith("4") ||
        idStr.endsWith("9")
    ) {
        return "14:05 - 16:05";
    }

    // 6. Nhận diện Ca 5 (16:10 - 18:00)
    if (
        startStr.startsWith("15") ||
        startStr.startsWith("16:1") ||
        startStr.startsWith("16h") ||
        slotStr.includes("16h10") ||
        slotStr.includes("15h - 17h") ||
        slotStr.includes("16:10") ||
        idStr.endsWith("5") ||
        idStr.endsWith("0")
    ) {
        return "16:10 - 18:00";
    }

    // Mặc định ca phòng nếu không xác định được
    if (shift.type === "Phong") {
        return "07:00 - 09:30";
    }

    return NGOAI_ROW;
}

function getFilteredShifts() {
    const channelFilter =
        document
            .querySelector("#channelFilter .filter-btn.active")
            ?.getAttribute("data-filter") || "all";
    const dayFilter = document.getElementById("dayFilter")?.value || "all";
    const searchQuery = (
        document.getElementById("memberSearchInput")?.value || ""
    )
        .toLowerCase()
        .trim();

    return (globalScheduleData?.assigned_shifts || []).filter((s) => {
        if (channelFilter !== "all" && s.type !== channelFilter) return false;
        if (dayFilter !== "all" && s.day !== dayFilter) return false;
        if (searchQuery) {
            const hit =
                s.shift_id.toLowerCase().includes(searchQuery) ||
                s.location.toLowerCase().includes(searchQuery) ||
                (s.assigned_members || []).some(
                    (m) =>
                        m &&
                        (((m.name || "").toLowerCase().includes(searchQuery)) ||
                        ((m.department || "").toLowerCase().includes(searchQuery)) ||
                        ((m.phone || "").includes(searchQuery))),
                );
            if (!hit) return false;
        }
        return true;
    });
}

function shiftGap(s) {
    return Math.max(0, (s.required_count || 0) - (s.assigned_count || 0));
}

function renderDutyBoard() {
    const container = document.getElementById("scheduleGrid");
    if (!container || !globalScheduleData) return;

    const filtered = getFilteredShifts();

    if (filtered.length === 0) {
        container.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-folder-open"></i> Không có ca trực nào khớp bộ lọc.</div>`;
        return;
    }

    // Gom theo hàng (khung giờ) × cột (ngày), và lấy ngày dương lịch cho tiêu đề
    const buckets = {};
    const dateOfDay = {};
    filtered.forEach((s) => {
        const key = boardRowOf(s) + "|" + s.day;
        (buckets[key] = buckets[key] || []).push(s);
        if (s.type === "Phong" && s.date && !dateOfDay[s.day])
            dateOfDay[s.day] = s.date;
    });

    const rows = BOARD_SLOTS.filter((sl) =>
        BOARD_DAYS.some((d) => buckets[sl + "|" + d]),
    );
    if (filtered.some((s) => boardRowOf(s) === NGOAI_ROW)) rows.push(NGOAI_ROW);

    const totalGap = filtered.reduce((n, s) => n + shiftGap(s), 0);
    const shortShifts = filtered.filter((s) => shiftGap(s) > 0);

    container.innerHTML = [
        renderAlertStrip(filtered, shortShifts, totalGap),
        renderBoardGrid(rows, buckets, dateOfDay),
        renderAgenda(filtered, shortShifts),
    ].join("");
}

function getMemberShiftCounts() {
    const counts = {};
    if (!globalScheduleData || !globalScheduleData.assigned_shifts)
        return counts;
    globalScheduleData.assigned_shifts.forEach((s) => {
        if (!s) return;
        (s.assigned_members || []).forEach((m) => {
            // Cảnh báo vi phạm số ca không tính những ca dự phòng (chỉ tính ca trực chính)
            if (m && m.name && m.role === "Chính") {
                counts[m.name] = (counts[m.name] || 0) + 1;
            }
        });
    });
    return counts;
}

function getMaxShiftsLimit() {
    if (
        globalScheduleData &&
        globalScheduleData.config &&
        globalScheduleData.config.max_shifts_per_member
    ) {
        return parseInt(globalScheduleData.config.max_shifts_per_member, 10);
    }
    const el = document.getElementById("cfgMaxShifts");
    return el ? parseInt(el.value, 10) || 5 : 5;
}

function renderAlertStrip(filtered, shortShifts, totalGap) {
    const isAdmin = currentUserRole === "admin";
    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();
    const overlimitMembers = Object.keys(shiftCounts).filter(
        (name) => shiftCounts[name] > maxShifts,
    );

    let overlimitBanner = "";
    // Chỉ hiển thị cảnh báo vượt ca cho Admin, nhân sự chỉ xem bảng phân ca tuần thông thường
    if (isAdmin && overlimitMembers.length > 0) {
        overlimitBanner = `<div class="alert-strip danger-overlimit" style="margin-bottom: 8px; background: rgba(220, 38, 38, 0.18); border: 1px solid var(--cinnabar); color: #FCA5A5; padding: 10px 14px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 10px; font-size: 13px;">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--cinnabar); font-size: 16px;"></i>
            <span><strong>CẢNH BÁO VI PHẠM SỐ CA:</strong> Có <b>${overlimitMembers.length}</b> cá nhân bị xếp quá số ca tối đa (${maxShifts} ca/người): <b>${overlimitMembers.map((n) => `${esc(n)} (${shiftCounts[n]}/${maxShifts} ca)`).join(", ")}</b> — <span style="color: #FF8080; font-weight: 700;">Highlight đỏ trực tiếp trên lịch</span></span>
        </div>`;
    }

    let statusStrip = "";
    if (!isAdmin) {
        statusStrip = `<div class="alert-strip ok" style="background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #34d399;">
                    <i class="fa-solid fa-calendar-check" style="color: #10b981;"></i>
                    <span><strong>Bảng Phân Ca Tuần:</strong> Lịch phân công ca trực tuần cho nhân sự (${filtered.length} ca trực). Nhân sự theo dõi ca trực và vị trí phụ trách bên dưới.</span>
                </div>`;
    } else if (totalGap === 0) {
        statusStrip = `<div class="alert-strip ok">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>Đủ người cả <b>${filtered.length}</b> ca. Bảng phân công đã hoàn chỉnh.</span>
                </div>`;
    } else {
        const names = shortShifts
            .slice(0, 4)
            .map((s) => `${esc(DAY_ABBR[s.day] || s.day)} ${esc(s.slot)}`)
            .join(" · ");
        const more =
            shortShifts.length > 4 ? ` +${shortShifts.length - 4} ca nữa` : "";
        statusStrip = `<div class="alert-strip warn">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Thiếu <b>${totalGap}</b> người ở <b>${shortShifts.length}</b> ca: ${names}${more}</span>
                </div>`;
    }

    return overlimitBanner + statusStrip;
}

function renderBoardGrid(rows, buckets, dateOfDay) {
    const isAdmin = currentUserRole === "admin";
    let cells = `<div class="board-corner">Giờ</div>`;
    BOARD_DAYS.forEach((d) => {
        cells += `<div class="board-daylabel">${esc(DAY_ABBR[d])}
                    ${dateOfDay[d] ? `<small>${esc(dateOfDay[d])}</small>` : ""}
                  </div>`;
    });

    rows.forEach((row) => {
        if (row === NGOAI_ROW) {
            cells += `<div class="board-slotlabel" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 6px 4px;">
                        <b style="color: var(--cinnabar, #e05638); font-size: 11.5px; white-space: nowrap;">Ngoài</b>
                        <small style="font-size: 9px; opacity: 0.85; white-space: nowrap; color: var(--paper-ink-dim);">Điểm bán</small>
                      </div>`;
        } else {
            const meta = SLOT_LABEL_MAP[row];
            const caName = meta ? meta.ca : "";
            const timeStr = meta ? meta.time : row;
            cells += `<div class="board-slotlabel" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 6px 4px;">
                        ${caName ? `<b style="font-size: 11.5px; color: var(--paper-ink); margin-bottom: 2px; white-space: nowrap;">${caName}</b>` : ""}
                        <small style="font-size: 8.8px; font-weight: 600; color: var(--paper-ink-dim); line-height: 1.25; white-space: nowrap;">${esc(timeStr)}</small>
                      </div>`;
        }

        BOARD_DAYS.forEach((day) => {
            const list = buckets[row + "|" + day];
            if (!list || !list.length) {
                cells += `<div class="cell cell-none" aria-hidden="true"></div>`;
                return;
            }
            const short = list.some((s) => shiftGap(s) > 0);
            cells += `<div class="cell ${short ? "cell-short" : ""}">
                        ${list.map(renderShiftSlip).join("")}
                      </div>`;
        });
    });

    const overlimitLegend = isAdmin
        ? `<span style="display:inline-flex; align-items:center; gap:5px; color:#FF8080; font-size:12px; font-weight:600;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--cinnabar);"></i> vượt ca max</span>`
        : "";

    return `<div class="board">
                <div class="board-top">
                    <h3>Bảng phân công tuần</h3>
                    <span class="board-meta">${isAdmin ? "Bấm vào ca để sửa nhân sự & quản lý" : "Bấm vào ca để xem chi tiết"}</span>
                </div>
                <div class="board-scroll">
                    <div class="duty-board" style="grid-template-rows: auto repeat(${rows.length}, minmax(92px, auto))">
                        ${cells}
                    </div>
                </div>
                <div class="board-legend">
                    <span class="lg-filled"><i></i> đã phân công</span>
                    <span class="lg-dp"><i></i> dự phòng</span>
                    <span class="lg-blank"><i></i> chưa có người</span>
                    <span class="lg-lead"><i class="fa-solid fa-star"></i> trưởng ca</span>
                    ${overlimitLegend}
                </div>
            </div>`;
}

// Một "phiếu ca" trong ô lưới. Mỗi suất cần người là một dòng kẻ:
// có tên thì kẻ đậm, dự phòng thì kẻ chấm, chưa ai thì kẻ đỏ son bỏ trống.
function renderShiftSlip(s) {
    const isAdmin = currentUserRole === "admin";
    const gap = shiftGap(s);
    const members = (s.assigned_members || []).filter(Boolean);
    const chinh = members.filter((m) => m && m.role === "Chính");
    const dp = members.filter((m) => m && m.role !== "Chính");
    const chinhCount = chinh.length;
    const totalAssigned = s.assigned_count || members.length;

    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();

    let hasOverlimit = false;
    let lines = "";
    chinh.concat(dp).forEach((m) => {
        if (!m) return;
        const mName = m.name || "N/A";
        const isLeader = s.shift_leader === mName;
        const isDp = m.role !== "Chính";
        const totalCount = shiftCounts[mName] || 0;
        const isOver = isAdmin && totalCount > maxShifts;
        if (isOver) hasOverlimit = true;

        const overClass = isOver ? "line-overlimit" : "";
        const titleText = `${esc(mName)} — ${esc(m.department || "")}${isAdmin ? ` (${totalCount}/${maxShifts} ca)` : ""}${isOver ? " [⚠️ VƯỢT QUÁ SỐ CA TỐI ĐA]" : ""} — Nhiệm vụ: ${esc(m.task || "Bán hàng F&B")}`;

        lines += `<span class="assign-line ${isDp ? "line-dp" : "line-filled"} ${overClass}" title="${titleText}">
                    <span class="assign-name">${esc(mName)}${isOver ? " ⚠️" : ""}</span>
                    ${isLeader ? '<i class="lead-mark fa-solid fa-star" title="Trưởng ca"></i>' : ""}
                  </span>`;
    });
    for (let i = 0; i < gap; i++)
        lines += `<span class="assign-line line-blank"></span>`;

    return `<button type="button" class="shift-slip ${hasOverlimit ? "has-overlimit-shift" : ""}" onclick="openShiftEditModal('${esc(s.shift_id)}')"
                    title="${esc(s.shift_id)} — ${esc(s.location)} (${esc(s.slot)})">
                <span class="cell-top">
                    <span class="cell-code">${esc(s.shift_id)} ${hasOverlimit ? "🚨" : ""}</span>
                    <span class="cell-count" title="Số người trực chính / Tổng số người được sắp trong ca">${chinhCount}/${totalAssigned}</span>
                </span>
                <span class="assign-lines">${lines}</span>
            </button>`;
}

// --- Biến thể điện thoại: chọn ngày rồi cuộn dọc theo khung giờ -------------
function renderAgenda(filtered, shortShifts) {
    const isAdmin = currentUserRole === "admin";
    const daysPresent = BOARD_DAYS.filter((d) =>
        filtered.some((s) => s.day === d),
    );
    if (!daysPresent.length) return "";

    const gapDays = new Set(shortShifts.map((s) => s.day));
    if (!agendaDay || !daysPresent.includes(agendaDay)) {
        agendaDay = daysPresent.find((d) => gapDays.has(d)) || daysPresent[0];
    }

    const strip = daysPresent
        .map((d) => {
            const dayShifts = filtered.filter((s) => s.day === d);
            const dayGap = dayShifts.reduce((n, s) => n + shiftGap(s), 0);
            return `<button type="button" class="agenda-day ${d === agendaDay ? "active" : ""} ${dayGap ? "has-gap" : ""}"
                        onclick="selectAgendaDay('${esc(d)}')">
                    ${esc(DAY_ABBR[d])}
                    <small>${dayGap ? "thiếu " + dayGap : dayShifts.length + " ca"}</small>
                </button>`;
        })
        .join("");

    const minutesOf = (t) => {
        const [h, m] = String(t || "0:00")
            .split(":")
            .map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    const ofDay = filtered
        .filter((s) => s.day === agendaDay)
        .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));

    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();

    const list = ofDay
        .map((s) => {
            const gap = shiftGap(s);
            const members = (s.assigned_members || []).filter(Boolean);
            const chinh = members.filter((m) => m && m.role === "Chính");
            const dp = members.filter((m) => m && m.role !== "Chính");

            let people = chinh
                .concat(dp)
                .map((m) => {
                    if (!m) return "";
                    const mName = m.name || "N/A";
                    const isLeader = s.shift_leader === mName;
                    const isDp = m.role !== "Chính";
                    const totalCount = shiftCounts[mName] || 0;
                    const isOver = isAdmin && totalCount > maxShifts;

                    return `<span class="agenda-person ${isDp ? "dp" : ""} ${isLeader ? "lead" : ""} ${isOver ? "overlimit" : ""}">
                        <span class="dot"></span>
                        <span>${esc(mName)}</span>
                        ${isOver ? `<span class="tag overlimit-tag" style="background:#991B1B; color:#FFF; font-weight:700;">⚠️ ${totalCount}/${maxShifts} ca</span>` : `<span class="tag">${isLeader ? "Trưởng ca" : isDp ? "Dự phòng" : esc((m.department || "").replace("Ban ", ""))}</span>`}
                    </span>`;
                })
                .join("");
            for (let i = 0; i < gap; i++) {
                people += `<span class="agenda-gap"><i class="fa-solid fa-user-plus"></i> Còn trống một suất</span>`;
            }

            const chinhCount = chinh.length;
            const totalAssigned = s.assigned_count || members.length;
            return `<button type="button" class="agenda-shift ${gap ? "is-short" : ""}"
                        onclick="openShiftEditModal('${esc(s.shift_id)}')">
                    <span class="agenda-shift-head">
                        <strong>${esc(s.slot)}</strong>
                        <span>${esc(s.location)}<br>${esc(s.shift_id)} · ${chinhCount}/${totalAssigned} người</span>
                    </span>
                    <span class="agenda-roster">${people}</span>
                </button>`;
        })
        .join("");

    return `<div class="agenda">
                <div class="agenda-days">${strip}</div>
                <div class="agenda-list">${list}</div>
            </div>`;
}

window.selectAgendaDay = function (day) {
    agendaDay = day;
    renderDutyBoard();
};

// Open Shift Edit Modal
window.openShiftEditModal = function (shiftId) {
    if (!globalScheduleData) return;
    const s = globalScheduleData.assigned_shifts.find(
        (item) => item.shift_id === shiftId,
    );
    if (!s) return;

    currentEditingShift = s;
    const isAdmin = currentUserRole === "admin";
    const disabledAttr = isAdmin ? "" : "disabled";
    const modal = document.getElementById("shiftEditModal");

    document.getElementById("modalShiftTitle").innerHTML = isAdmin
        ? `<i class="fa-solid fa-pen-to-square"></i> Chi Tiết & Chỉnh Sửa Ca ${esc(s.shift_id)} (${esc(s.day)} - ${esc(s.slot)})`
        : `<i class="fa-solid fa-eye"></i> Chi Tiết Ca Trực ${esc(s.shift_id)} (${esc(s.day)} - ${esc(s.slot)}) <span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(255,255,255,0.15); margin-left:8px;">Chỉ Xem</span>`;

    let leaderOptions = "";
    (s.assigned_members || []).forEach((m) => {
        if (!m) return;
        const mName = m.name || "N/A";
        const sel = s.shift_leader === mName ? "selected" : "";
        leaderOptions += `<option value="${esc(mName)}" ${sel}>⭐ ${esc(mName)} (${esc(m.department || "")} - ${esc(m.role || "")})</option>`;
    });

    const shiftLocation =
        s.location ||
        (s.type === "Ngoai" ? "Điểm Bán Ngoài Ca" : "Phòng Thanh Niên");

    let membersListHtml = "";
    (s.assigned_members || []).forEach((m, idx) => {
        if (!m) return;
        const mName = m.name || "N/A";
        const isDp = m.role !== "Chính";
        const defaultRole = isDp
            ? "⚡ Dự bị tiếp ứng & Hỗ trợ"
            : idx === 0
              ? "💵 Thu ngân / Nhập sheet"
              : idx === 1
                ? "📦 Kiểm kê hàng"
                : "🛵 Phục vụ / Giao hàng";
        const posRole = m.position_role || defaultRole;

        const removeBtn = isAdmin
            ? `<button type="button" class="btn-action-sm btn-action-delete" style="padding: 2px 7px; font-size: 11px; margin-left: 6px; background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);" onclick="handleCancelMemberInShift('${m.member_id}', '${esc(mName)}')" title="Rút nhân sự này khỏi ca trực"><i class="fa-solid fa-user-minus"></i> Hủy</button>`
            : "";

        membersListHtml += `
            <div class="member-edit-row ${isDp ? "is-dp-row" : ""}">
                <div class="mer-who">
                    <div class="mer-name-line">
                        <span class="mer-index">#${idx + 1}</span>
                        <strong>${esc(mName)}</strong>
                        <span class="mer-dept-pill">${esc((m.department || "").replace("Ban ", ""))}</span>
                        ${s.shift_leader === mName ? '<span class="mer-lead-badge"><i class="fa-solid fa-star"></i> Trưởng ca</span>' : ""}
                        ${removeBtn}
                    </div>
                    <div class="mer-meta">
                        <span><i class="fa-solid fa-phone"></i> ${esc(m.phone)}</span>
                        <span>&bull;</span>
                        <span><i class="fa-solid fa-motorcycle"></i> ${esc(m.vehicle || "Không xe")}</span>
                    </div>
                </div>
                <div class="mer-controls">
                    <div class="mer-ctrl-item">
                        <span class="mer-ctrl-lbl">Vai trò</span>
                        <select class="custom-select member-role-select" data-member-id="${m.member_id}" ${disabledAttr} onchange="handleRoleChangeInModal(this, '${m.member_id}')">
                            <option value="Chính" ${!isDp ? "selected" : ""}>Trực chính</option>
                            <option value="Dự phòng" ${isDp ? "selected" : ""}>Dự phòng</option>
                        </select>
                    </div>
                    <div class="mer-ctrl-item">
                        <span class="mer-ctrl-lbl">Nhiệm vụ cụ thể</span>
                        <select class="custom-select member-position-select" data-member-id="${m.member_id}" id="pos_sel_${m.member_id}" ${disabledAttr}>
                            <option value="🛵 Phục vụ / Giao hàng" ${posRole.includes("Phục vụ") ? "selected" : ""}>🛵 Phục vụ / Giao hàng</option>
                            <option value="💵 Thu ngân / Nhập sheet" ${posRole.includes("Thu ngân") ? "selected" : ""}>💵 Thu ngân / Nhập sheet</option>
                            <option value="📦 Kiểm kê hàng" ${posRole.includes("Kiểm kê") ? "selected" : ""}>📦 Kiểm kê hàng</option>
                            <option value="⚡ Dự bị tiếp ứng & Hỗ trợ" ${posRole.includes("Dự bị") ? "selected" : ""}>⚡ Dự bị tiếp ứng & Hỗ trợ</option>
                            <option value="🥤 Pha chế & Chuẩn bị" ${posRole.includes("Pha chế") ? "selected" : ""}>🥤 Pha chế & Chuẩn bị</option>
                            <option value="📣 Tiếp thị & Chào khách" ${posRole.includes("Tiếp thị") ? "selected" : ""}>📣 Tiếp thị & Chào khách</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });

    const readOnlyNotice = !isAdmin
        ? `<div class="swap-msg info" style="display:block; margin-bottom: 12px; background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2);"><i class="fa-solid fa-lock"></i> <b>Chế độ chỉ xem:</b> Nhân viên không phải Admin không thể chỉnh sửa thông tin ca trực. Vui lòng đăng nhập Quản trị viên để thay đổi.</div>`
        : "";

    const chinhCount = (s.assigned_members || []).filter((m) => m.role === "Chính").length;
    const totalAssigned = s.assigned_count || (s.assigned_members || []).length;

    const bodyHtml = `
        ${readOnlyNotice}
        <div class="shift-modal-summary-banner">
            <div class="sms-loc"><i class="fa-solid fa-location-dot"></i> <strong>${esc(shiftLocation)}</strong> &bull; <span class="sms-time">${esc(s.day)} (${esc(s.slot)})</span></div>
            <div class="sms-meta">Loại ca: <b>${esc(s.type_label)}</b> &bull; Quy mô: <b>${chinhCount}/${totalAssigned} người</b></div>
        </div>

        <div class="form-group mb-16">
            <label><i class="fa-solid fa-star text-gold"></i> <strong>Chỉ định Trưởng ca (Ca trưởng):</strong></label>
            <select id="modalSelectLeader" class="custom-select" ${disabledAttr}>${leaderOptions}</select>
        </div>
        <div class="form-group">
            <label><i class="fa-solid fa-users"></i> <strong>Phân công vị trí & nhiệm vụ (${s.assigned_count} người trong ca):</strong></label>
            <div class="member-edit-list" style="max-height: 290px; overflow-y: auto;">
                ${membersListHtml}
            </div>
        </div>
        <div id="modalShiftStatusMsg" class="swap-msg" style="margin-top: 10px;"></div>
    `;

    document.getElementById("modalShiftBody").innerHTML = bodyHtml;

    const saveBtn = document.getElementById("btnSaveShiftEdit");
    if (saveBtn) {
        saveBtn.style.display = isAdmin ? "inline-flex" : "none";
    }

    const cancelBtn = document.getElementById("btnDeleteOrCancelShift");
    if (cancelBtn) {
        cancelBtn.style.display = isAdmin ? "inline-flex" : "none";
    }

    modal.classList.add("active");
};

window.handleRoleChangeInModal = function (roleSelect, memberId) {
    if (currentUserRole !== "admin") return;
    const posSelect = document.getElementById(`pos_sel_${memberId}`);
    if (roleSelect.value === "Dự phòng" && posSelect) {
        posSelect.value = "⚡ Dự bị tiếp ứng & Hỗ trợ";
    } else if (
        roleSelect.value === "Chính" &&
        posSelect &&
        posSelect.value === "⚡ Dự bị tiếp ứng & Hỗ trợ"
    ) {
        posSelect.value = "🛵 Phục vụ / Giao hàng";
    }
};

window.handleCancelMemberInShift = async function (memberId, memberName) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để hủy nhân sự khỏi ca!");
        return;
    }
    if (!currentEditingShift) return;

    if (!confirm(`Bạn có chắc chắn muốn rút thành viên "${memberName}" khỏi ca trực ${currentEditingShift.shift_id}?`)) {
        return;
    }

    try {
        const res = await authFetch("/api/shift/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: currentEditingShift.shift_id,
                member_id: memberId,
                reason: `Admin rút thành viên ${memberName} khỏi ca trực`,
            }),
        });
        const data = await res.json();
        if (data.success) {
            if (data.cancelled_entire_shift) {
                if (globalScheduleData && globalScheduleData.assigned_shifts) {
                    globalScheduleData.assigned_shifts = globalScheduleData.assigned_shifts.filter(
                        (s) => s.shift_id !== currentEditingShift.shift_id,
                    );
                }
                document.getElementById("shiftEditModal")?.classList.remove("active");
            } else if (data.shift) {
                const idx = globalScheduleData.assigned_shifts.findIndex(
                    (s) => s.shift_id === currentEditingShift.shift_id,
                );
                if (idx !== -1) {
                    globalScheduleData.assigned_shifts[idx] = data.shift;
                }
                openShiftEditModal(currentEditingShift.shift_id);
            }

            renderDutyBoard();
            populateLiveShiftDropdown();
            loadIncidentLogs();
            showToastSuccess(`Đã rút thành viên ${memberName} khỏi ca trực!`);
        } else {
            alert("Lỗi khi hủy thành viên: " + (data.message || "Lỗi không xác định"));
        }
    } catch (e) {
        alert("Lỗi kết nối máy chủ: " + e.message);
    }
};

async function handleCancelCurrentShift() {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để hủy ca trực!");
        return;
    }
    if (!currentEditingShift) return;

    const shiftInfo = `Ca ${currentEditingShift.shift_id} (${currentEditingShift.day} ${currentEditingShift.slot} - ${currentEditingShift.location || "Phòng Thanh Niên"})`;

    openConfirmModal({
        title: "Xác Nhận Hủy Toàn Bộ Ca Trực",
        message: `Bạn có chắc chắn muốn HỦY HOÀN TOÀN ca trực "${shiftInfo}"? Tất cả thành viên trong ca sẽ được giải phóng và ghi nhận sự cố hủy ca.`,
        confirmBtnText: "Hủy Ca Trực",
        onConfirm: async () => {
            try {
                const res = await authFetch("/api/shift/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        shift_id: currentEditingShift.shift_id,
                        cancel_all: true,
                        reason: "Quản trị viên hủy toàn bộ ca trực",
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    if (globalScheduleData && globalScheduleData.assigned_shifts) {
                        globalScheduleData.assigned_shifts = globalScheduleData.assigned_shifts.filter(
                            (s) => s.shift_id !== currentEditingShift.shift_id,
                        );
                    }
                    document.getElementById("shiftEditModal")?.classList.remove("active");
                    renderDutyBoard();
                    populateLiveShiftDropdown();
                    loadIncidentLogs();
                    showToastSuccess(`Đã hủy ca trực ${currentEditingShift.shift_id} thành công!`);
                } else {
                    alert("Lỗi khi hủy ca: " + (data.message || "Lỗi không xác định"));
                }
            } catch (e) {
                alert("Lỗi kết nối: " + e.message);
            }
        },
    });
}

async function handleSaveShiftEdit() {
    if (currentUserRole !== "admin") {
        if (typeof openAdminLoginModal === "function") {
            openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để chỉnh sửa thông tin ca trực!");
        } else {
            alert("Nhân viên bình thường không thể chỉnh sửa ca trực. Vui lòng đăng nhập quyền Admin!");
        }
        return;
    }

    if (!currentEditingShift) return;

    const newLeader = document.getElementById("modalSelectLeader")?.value;
    const memberUpdates = [];
    const msg = document.getElementById("modalShiftStatusMsg");

    const roleMap = new Map();
    document.querySelectorAll(".member-role-select").forEach((sel) => {
        roleMap.set(sel.getAttribute("data-member-id"), sel.value);
    });

    document.querySelectorAll(".member-position-select").forEach((sel) => {
        const memId = sel.getAttribute("data-member-id");
        memberUpdates.push({
            member_id: memId,
            role: roleMap.get(memId) || "Chính",
            position_role: sel.value,
        });
    });

    try {
        const res = await authFetch("/api/shift/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: currentEditingShift.shift_id,
                shift_leader: newLeader,
                assigned_members: memberUpdates,
            }),
        });
        const data = await res.json();
        if (data.success) {
            const idx = globalScheduleData.assigned_shifts.findIndex(
                (s) => s.shift_id === currentEditingShift.shift_id,
            );
            if (idx !== -1) {
                globalScheduleData.assigned_shifts[idx] = data.shift;
            }

            renderDutyBoard();
            populateLiveShiftDropdown();
            if (currentSelectedLiveShiftId) {
                renderLiveShiftDetails(currentSelectedLiveShiftId);
            }
            if (typeof renderContingencyTab === "function") {
                renderContingencyTab();
            }
            if (typeof renderKpiAttendance === "function") {
                renderKpiAttendance();
            }
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent =
                    "✓ Đã cập nhật Trưởng ca và phân công nhiệm vụ thành công!";
            }
            setTimeout(() => {
                document
                    .getElementById("shiftEditModal")
                    ?.classList.remove("active");
            }, 600);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi cập nhật";
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi cập nhật: " + e.message;
        }
    }
}

// Heatmap Data Loading & Rendering
async function loadHeatmapData() {
    try {
        const res = await fetch("/api/heatmap");
        const data = await res.json();
        if (data.success) {
            renderHeatmapTable(data.heatmap);
        }
    } catch (e) {
        console.error("Error loading heatmap:", e);
    }
}

function renderHeatmapTable(heatmapData) {
    const container = document.getElementById("heatmapContainer");
    if (!container || !heatmapData) return;

    const slots = heatmapData.slots;
    const matrix = heatmapData.matrix;

    let tableHtml = `
        <table class="heatmap-table">
            <thead>
                <tr>
                    <th class="heat-day-col">Thứ / Khung Giờ</th>
                    ${slots.map((s) => `<th>${s}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
    `;

    matrix.forEach((row) => {
        tableHtml += `<tr><td>${row.day}</td>`;
        row.slots.forEach((cell) => {
            const memberNames =
                (cell.free_members || [])
                    .slice(0, 10)
                    .map((m) => (m && m.name ? m.name : ""))
                    .filter(Boolean)
                    .join(", ") + ((cell.free_members || []).length > 10 ? "..." : "");
            tableHtml += `
                <td class="lvl-${cell.level}" title="${row.day} (${cell.slot}): ${cell.count} thành viên rảnh\n${memberNames}">
                    <div class="heat-cell-val">${cell.count}</div>
                    <div class="heat-cell-pct">${cell.percentage}% TV rảnh</div>
                </td>
            `;
        });
        tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

// KPI Rendering
function renderKPIs() {
    const summary = globalScheduleData.summary || {};
    const audit = globalScheduleData.audit_results || {};

    document.getElementById("kpiTotalMembers").textContent =
        summary.total_members || 50;
    document.getElementById("kpiTotalShifts").textContent =
        summary.total_active_shifts || 70;
    document.getElementById("kpiAvgShifts").textContent = (
        summary.avg_shifts_per_member || 3.9
    ).toFixed(1);
    document.getElementById("kpiFairness").textContent =
        `${audit.fairness_metrics?.fairness_score || 97}%`;
}

// Member Workload Table
function renderMemberTable() {
    const tbody = document.getElementById("memberTableBody");
    if (!tbody || !globalScheduleData) return;

    const stats = globalScheduleData.member_stats || [];
    const searchInp = document.getElementById("memberStatsSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    let html = "";
    stats.forEach((m) => {
        // Filter by query if present
        if (query) {
            const nameMatch = (m.name || "").toLowerCase().includes(query);
            const deptMatch = (m.department || "")
                .toLowerCase()
                .includes(query);
            const phoneMatch = (m.phone || "").toLowerCase().includes(query);
            const idMatch = (m.member_id || "").toLowerCase().includes(query);
            const jobMatch = (m.job || "").toLowerCase().includes(query);
            if (
                !nameMatch &&
                !deptMatch &&
                !phoneMatch &&
                !idMatch &&
                !jobMatch
            ) {
                return; // Skip this member
            }
        }

        const standbyBadge = m.is_standby
            ? `<span class="mk-ok"><i class="fa-solid fa-circle-check"></i> Có</span>`
            : `<span class="mk-none">Không</span>`;

        html += `
            <tr>
                <td><strong>${m.member_id}</strong></td>
                <td><strong>${m.name}</strong></td>
                <td>${m.department}</td>
                <td>${m.job}</td>
                <td class="mk-num">${m.phone}</td>
                <td>${standbyBadge}</td>
                <td><span class="mk-num">${m.total_shifts}</span></td>
                <td class="mk-num">${m.total_hours}h</td>
                <td class="mk-num">${m.phong_shifts}</td>
                <td class="mk-num">${m.ngoai_shifts}</td>
                <td><span class="mk-lead">${m.committed_matched}</span></td>
                <td class="cell-center">
                    ${
                        currentUserRole === "admin"
                            ? `
                        <button type="button" class="btn-action-sm" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 3px 8px; font-size: 11px;" onclick="openEditMemberModal('${m.member_id}')" title="Sửa lịch rảnh / thông tin">
                            <i class="fa-solid fa-user-gear"></i> Chỉnh sửa
                        </button>
                    `
                            : `
                        <span style="color: var(--ink-dim); font-size: 11px;">Chỉ xem</span>
                    `
                    }
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Audit Results Rendering
function renderAuditResults() {
    const audit = globalScheduleData.audit_results || {};
    const grid = document.getElementById("auditChecklistGrid");
    if (!grid) return;

    const items = [
        {
            title: "Chống Xung Đột Trùng Ca (Ca Trong vs Ca Ngoài)",
            desc: `Đã kiểm tra ${globalScheduleData.assigned_shifts?.length} ca trực. Phát hiện: ${audit.conflict_count} vi phạm.`,
            passed: audit.conflict_count === 0,
        },
        {
            title: "Tuân Thủ Lịch Rảnh Cá Nhân Đã Đăng Ký",
            desc: `100% thành viên chỉ được phân bổ vào các khung giờ đã đăng ký rảnh (kể cả ca ngoài lệch khung giờ). Phát hiện: ${audit.availability_violation_count} vi phạm.`,
            passed: audit.availability_violation_count === 0,
        },
        {
            title: "Quy Tắc Không Để Phòng Bán Trống",
            desc: `Phòng Thanh Niên THPT Chuyên Hùng Vương luôn có người trực liên tục. Số ca trống: ${audit.empty_room_count}.`,
            passed: audit.empty_room_count === 0,
        },
        {
            title: "Giới Hạn Khối Lượng Trực Hàng Ngày (<=2 ca/ngày)",
            desc: `Đảm bảo sức khỏe và lịch học của thành viên học sinh/sinh viên. Phát hiện: ${audit.daily_overload_count} ca quá tải.`,
            passed: audit.daily_overload_count === 0,
        },
    ];

    let html = "";
    items.forEach((it) => {
        html += `
            <div class="audit-card">
                <div class="audit-status-icon ${it.passed ? "pass" : "fail"}">
                    <i class="fa-solid ${it.passed ? "fa-circle-check" : "fa-circle-xmark"}"></i>
                </div>
                <div class="audit-info">
                    <h5>${it.title}</h5>
                    <p>${it.desc}</p>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

// Incident Management & Live Suggestion
function populateIncidentShiftDropdown() {
    const sel = document.getElementById("incidentShiftSelect");
    if (!sel || !globalScheduleData) return;

    let opts = '<option value="">-- Chọn ca trực phát sinh sự cố --</option>';
    globalScheduleData.assigned_shifts.forEach((s) => {
        opts += `<option value="${s.shift_id}">${s.shift_id} - ${s.day} ${s.slot} (${s.type_label})</option>`;
    });
    sel.innerHTML = opts;
}

async function handleIncidentShiftChange() {
    const shiftId = document.getElementById("incidentShiftSelect")?.value;
    const absentSel = document.getElementById("incidentAbsentSelect");
    const repSel = document.getElementById("incidentReplacementSelect");
    const hint = document.getElementById("replacementHint");

    if (!shiftId || !globalScheduleData) {
        if (absentSel)
            absentSel.innerHTML =
                '<option value="">-- Chọn thành viên --</option>';
        if (repSel)
            repSel.innerHTML =
                '<option value="">-- Chọn nhân sự thay thế --</option>';
        return;
    }

    const s = globalScheduleData.assigned_shifts.find(
        (item) => item.shift_id === shiftId,
    );
    if (!s) return;

    let absentOpts =
        '<option value="">-- Chọn người vắng / đi trễ / đổi ca --</option>';
    (s.assigned_members || []).forEach((m) => {
        if (!m) return;
        const mName = m.name || m.member_id;
        absentOpts += `<option value="${m.member_id}">${esc(mName)} (${esc(m.role || "")} - ${esc(m.department || "")})</option>`;
    });
    if (absentSel) absentSel.innerHTML = absentOpts;

    try {
        if (hint) hint.textContent = "Đang tra cứu nhân sự khả dụng...";
        const res = await fetch(`/api/contingency/suggest?shift_id=${shiftId}`);
        const data = await res.json();
        if (data && data.success) {
            let repOpts =
                '<option value="">-- Chọn nhân sự thay thế --</option>';
            (data.candidates || []).forEach((c) => {
                if (!c) return;
                const cName = c.name || c.member_id;
                const badge =
                    c.priority_label ||
                    (c.is_standby ? "⚡ [Đội ứng biến]" : "✓ Rảnh");
                repOpts += `<option value="${c.member_id}">${badge} ${cName} - ${c.department || ""} (SĐT: ${c.phone || ""})</option>`;
            });
            if (repSel) repSel.innerHTML = repOpts;
            if (hint)
                hint.textContent = `Tìm thấy ${data.total} ứng viên khả dụng (Ưu tiên theo Đội ứng biến & Lịch đã đăng ký rảnh)`;
        }
    } catch (e) {
        if (hint) hint.textContent = "Lỗi tra cứu nhân sự: " + e.message;
    }
}

async function handleSubmitIncident() {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để ghi nhận sự cố / đổi ca trực!");
        return;
    }

    const shiftId = document.getElementById("incidentShiftSelect")?.value;
    const absentId = document.getElementById("incidentAbsentSelect")?.value;
    const repId = document.getElementById("incidentReplacementSelect")?.value;
    const statusType = document.getElementById("incidentStatusSelect")?.value;
    const note = document.getElementById("incidentNote")?.value;
    const msg = document.getElementById("incidentResultMsg");

    if (!shiftId) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn ca trực!";
        }
        return;
    }

    try {
        const res = await authFetch("/api/contingency/log-incident", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: shiftId,
                absent_member_id: absentId,
                replacement_member_id: repId,
                status_type: statusType,
                note: note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            loadIncidentLogs();
            loadCurrentSchedule();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi: " + e.message;
        }
    }
}

async function loadIncidentLogs() {
    try {
        const res = await fetch("/api/contingency/incidents");
        const data = await res.json();
        if (data.success) {
            globalIncidentLogs = data.incidents || [];
            renderIncidentLogs(globalIncidentLogs);
            renderKpiStats();
        }
    } catch (e) {
        console.error("Error loading incidents:", e);
    }
}

function renderIncidentLogs(incidents) {
    const container = document.getElementById("incidentLogsList");
    const tbody = document.getElementById("lateAbsenceTableBody");
    const kpiLate = document.getElementById("kpiLateCount");
    const kpiAbsent = document.getElementById("kpiAbsentCount");
    const kpiReplaced = document.getElementById("kpiReplacedCount");

    const isAdmin = (currentUserRole === "admin");

    // For staff (non-admin), filter logs to only show incidents in the current selected shift
    let displayedIncidents = (incidents || []).slice();
    if (!isAdmin) {
        if (currentSelectedLiveShiftId) {
            displayedIncidents = displayedIncidents.filter(
                (inc) => inc.shift_id === currentSelectedLiveShiftId,
            );
        } else {
            displayedIncidents = [];
        }
    }

    if (!displayedIncidents || !displayedIncidents.length) {
        const emptyMsg = isAdmin
            ? "Chưa có sự cố điểm danh nào được ghi nhận trên toàn hệ thống."
            : `Chưa có dữ liệu đi trễ hoặc vắng mặt nào trong ca ${esc(currentSelectedLiveShiftId || "này")}.`;
        if (container)
            container.innerHTML = `<div class="empty-note">${emptyMsg}</div>`;
        if (tbody)
            tbody.innerHTML = `<tr><td colspan="9" class="table-empty">${emptyMsg}</td></tr>`;
        if (kpiLate) kpiLate.textContent = "0";
        if (kpiAbsent) kpiAbsent.textContent = "0";
        if (kpiReplaced) kpiReplaced.textContent = "0";
        return;
    }

    let lateCount = 0;
    let absentCount = 0;
    let replacedCount = 0;

    // Render cards list (if present)
    let html = "";
    displayedIncidents.forEach((inc) => {
        if (inc.status_type === "Đi trễ") lateCount++;
        if (
            inc.status_type === "Vắng đột xuất" ||
            inc.status_type === "Vắng không phép" ||
            inc.status_type === "Vắng mặt" ||
            inc.status_type === "Xin nghỉ trước" ||
            (inc.status_type && inc.status_type.includes("Vắng"))
        )
            absentCount++;
        if (
            inc.replacement_member &&
            inc.replacement_member !== "Không thay thế" &&
            inc.replacement_member !== "none" &&
            inc.replacement_member !== "no_replacement"
        )
            replacedCount++;

        html += `
            <div class="incident-card">
                <div class="incident-card-top">
                    <span>${esc(inc.shift_id)} (${esc(inc.day)} ${esc(inc.slot)})</span>
                    <span class="mk-warn">${esc(inc.status_type)}</span>
                </div>
                <div><strong>Người vắng/trễ:</strong> ${esc(inc.absent_member)} &bull; <strong>Thay thế:</strong> <span class="mk-ok">${esc(inc.replacement_member)}</span></div>
                <div class="incident-card-meta">Địa điểm: ${esc(inc.location || "Phòng Thanh Niên")} &bull; Ghi chú: ${esc(inc.note || "Không có")} &bull; Thời gian: ${esc(inc.timestamp)}</div>
            </div>
        `;
    });
    if (container) container.innerHTML = html;

    // Render Late Arrival & Absence Table (9 columns)
    if (tbody) {
        let tableRows = "";
        displayedIncidents.forEach((inc, idx) => {
            let badgeClass = "badge-secondary";
            let statusLabel = inc.status_type || "Ghi nhận";

            if (inc.status_type === "Đi trễ") {
                badgeClass = "badge-warning";
                statusLabel = "⏰ Đi trễ (-3đ)";
            } else if (inc.status_type === "Mất tập trung") {
                badgeClass = "badge-warning";
                statusLabel = "📱 Mất tập trung (-5đ)";
            } else if (inc.status_type === "Bỏ quầy") {
                badgeClass = "badge-danger";
                statusLabel = "🚶 Bỏ quầy (-5đ)";
            } else if (inc.status_type === "Vắng không phép" || inc.status_type === "Vắng đột xuất" || inc.status_type === "Vắng mặt") {
                badgeClass = "badge-danger";
                statusLabel = "🚨 Vắng không phép (-10đ)";
            } else if (inc.status_type === "Xin nghỉ trước") {
                badgeClass = "badge-info";
                statusLabel = "📝 Xin nghỉ trước";
            } else if (inc.status_type === "Có mặt") {
                badgeClass = "badge-success";
                statusLabel = "✅ Có mặt đúng giờ";
            } else if (inc.status_type && inc.status_type.includes("Đã gọi dự phòng")) {
                badgeClass = "badge-success";
                statusLabel = "📞 Đã gọi dự phòng";
            } else if (inc.status_type && inc.status_type.includes("Không gọi được")) {
                badgeClass = "badge-danger";
                statusLabel = "⚠️ Không gọi được DP (Chờ Admin)";
            }

            const repName = (inc.replacement_member && inc.replacement_member !== "none" && inc.replacement_member !== "no_replacement")
                ? inc.replacement_member
                : "Không thay thế";

            let repBadge = "";
            if (repName !== "Không thay thế") {
                repBadge = `<strong style="color: var(--patina-lt);"><i class="fa-solid fa-user-shield" style="margin-right: 4px;"></i>${esc(repName)}</strong>`;
            } else if (inc.status_type && inc.status_type.includes("Không gọi được")) {
                repBadge = `<span style="color: #F87171; font-size: 11.5px; font-weight: 600;"><i class="fa-solid fa-clock"></i> Chờ Admin gán</span>`;
            } else {
                repBadge = `<span style="color: var(--ink-dim); font-size: 11.5px;">Không thay thế</span>`;
            }

            const actionBtn = isAdmin
                ? `<div style="display: inline-flex; gap: 4px; align-items: center;">
                    <button type="button" class="btn-action-sm btn-action-edit" onclick="openAdminAssignReplacementModal('${esc(inc.id || '')}', '${esc(inc.timestamp || '')}', '${esc(inc.shift_id || '')}', '${esc(inc.absent_member || '')}', '${esc(inc.replacement_member || '')}', '${esc(inc.status_type || '')}', '${esc(inc.note || '')}')" title="Gán / Đổi người thay thế cho ca này" style="padding: 4px 8px; font-size: 11px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.3); cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">
                        <i class="fa-solid fa-user-pen"></i> Đổi người
                    </button>
                    <button type="button" class="btn-action-sm btn-danger-red" onclick="deleteSingleIncident('${esc(inc.id || '')}', '${esc(inc.timestamp || '')}', '${esc(inc.shift_id || '')}', '${esc(inc.absent_member || '')}')" title="Xóa lịch sử ghi nhận ca này" style="padding: 4px 8px; font-size: 11px; border-radius: 4px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
                </div>`
                : "";

            tableRows += `
                <tr>
                    <td class="cell-center mk-num">${idx + 1}</td>
                    <td class="cell-center mk-num" style="font-size: 11.5px; white-space: nowrap;">${esc(inc.timestamp || "")}</td>
                    <td>
                        <span class="shift-id-tag">${esc(inc.shift_id)}</span>
                        <span style="margin-left: 5px; font-weight: 600; color: var(--ink-hi);">${esc(inc.day || "")} ${esc(inc.slot || "")}</span>
                    </td>
                    <td><span style="color: var(--goldleaf); font-weight: 500;">${esc(inc.location || "Phòng Thanh Niên")}</span></td>
                    <td><strong style="color: var(--cinnabar-lt); font-size: 13px;">${esc(inc.absent_member)}</strong></td>
                    <td class="cell-center"><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td>${repBadge}</td>
                    <td style="color: var(--ink-dim); font-size: 12px; max-width: 200px;">${esc(inc.note || "-")}</td>
                    <td class="cell-center admin-only-cell">${actionBtn}</td>
                </tr>
            `;
        });
        tbody.innerHTML = tableRows;
    }

    if (kpiLate) kpiLate.textContent = String(lateCount);
    if (kpiAbsent) kpiAbsent.textContent = String(absentCount);
    if (kpiReplaced) kpiReplaced.textContent = String(replacedCount);
}

// Single incident deletion
window.deleteSingleIncident = function (id, timestamp, shiftId, absentMember) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để xóa lịch sử ghi nhận!");
        return;
    }

    openConfirmModal({
        title: "Xác Nhận Xóa Bản Ghi Lịch Sử",
        message: `Bạn có chắc chắn muốn xóa bản ghi điểm danh / sự cố của "${absentMember || 'thành viên'}" tại Ca ${shiftId || ''}?`,
        confirmBtnText: "Xóa Bản Ghi",
        onConfirm: async () => {
            try {
                const res = await authFetch("/api/contingency/delete-incident", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: id || undefined,
                        timestamp: timestamp || undefined,
                        shift_id: shiftId || undefined,
                        absent_member: absentMember || undefined,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    showToast("✓ Đã xóa bản ghi lịch sử thành công!", "success");
                    await loadIncidentLogs();
                    await loadCurrentSchedule();
                } else {
                    alert("Lỗi khi xóa: " + (data.message || "Không thể xóa bản ghi"));
                }
            } catch (e) {
                console.error("Lỗi xóa bản ghi sự cố:", e);
                alert("Lỗi kết nối khi xóa bản ghi: " + e.message);
            }
        },
    });
};

// Export incident logs to CSV/Excel
function exportIncidentLogsExcel() {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để xuất file Excel ca vắng & dự phòng!");
        return;
    }

    const incidents = globalIncidentLogs || [];
    if (!incidents.length) {
        showToast("Chưa có dữ liệu ghi nhận ca vắng & dự phòng để xuất!", "warning");
        return;
    }

    let csvContent = "\uFEFFSTT,Thời Gian Ghi Nhận,Mã Ca Trực,Thứ,Khung Giờ,Địa Điểm,Người Vắng / Đi Trễ,Trạng Thái & Sai Phạm,Nhân Sự Thay Thế,Ghi Chú\n";
    incidents.forEach((inc, idx) => {
        const row = [
            idx + 1,
            `"${(inc.timestamp || "").replace(/"/g, '""')}"`,
            `"${(inc.shift_id || "").replace(/"/g, '""')}"`,
            `"${(inc.day || "").replace(/"/g, '""')}"`,
            `"${(inc.slot || "").replace(/"/g, '""')}"`,
            `"${(inc.location || "Phòng Thanh Niên").replace(/"/g, '""')}"`,
            `"${(inc.absent_member || "").replace(/"/g, '""')}"`,
            `"${(inc.status_type || "").replace(/"/g, '""')}"`,
            `"${(inc.replacement_member || "Không thay thế").replace(/"/g, '""')}"`,
            `"${(inc.note || "").replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Bao_Cao_Ca_Vang_Va_Du_Phong_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Đã xuất file báo cáo ca vắng & dự phòng Excel (CSV) thành công!", "success");
}


// Data Upload & Google Sheet Sync
async function handleSyncGoogleSheet() {
    const url = document.getElementById("inputGoogleSheetUrl")?.value.trim();
    const msg = document.getElementById("uploadStatusMsg");
    if (!url) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng nhập link Google Sheet!";
        }
        return;
    }

    if (msg) {
        msg.className = "swap-msg";
        msg.style.display = "block";
        msg.textContent = "Đang đồng bộ dữ liệu từ Google Sheets...";
    }

    try {
        const res = await authFetch("/api/upload-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ google_sheet_url: url }),
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            setTimeout(() => {
                document
                    .getElementById("uploadDataModal")
                    .classList.remove("active");
                loadCurrentSchedule();
            }, 1500);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối Google Sheets: " + e.message;
        }
    }
}

async function handleUploadFile() {
    const fileInput = document.getElementById("inputFileUpload");
    const msg = document.getElementById("uploadStatusMsg");
    if (!fileInput.files.length) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn file Excel hoặc CSV!";
        }
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    if (msg) {
        msg.className = "swap-msg";
        msg.style.display = "block";
        msg.textContent = "Đang tải lên và xử lý dữ liệu...";
    }

    try {
        const res = await authFetch("/api/upload-data", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            setTimeout(() => {
                document
                    .getElementById("uploadDataModal")
                    .classList.remove("active");
                loadCurrentSchedule();
            }, 1500);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi tải lên: " + e.message;
        }
    }
}

// Preview Modal & Google Sheets Copy
async function openPreviewModal() {
    const modal = document.getElementById("previewModal");
    modal.classList.add("active");

    try {
        const res = await fetch("/api/preview");
        const data = await res.json();
        if (data.success) {
            globalPreviewData = data.preview;
            renderPreviewSheet("tong_ca_truc");
        }
    } catch (e) {
        console.error("Error loading preview:", e);
    }
}

let currentPreviewSheetKey = "tong_ca_truc";
function renderPreviewSheet(sheetKey) {
    currentPreviewSheetKey = sheetKey;
    const container = document.getElementById("previewTableWrap");
    if (!container || !globalPreviewData || !globalPreviewData[sheetKey])
        return;

    const sheet = globalPreviewData[sheetKey];
    let html = `
        <table class="data-table" id="currentPreviewTable">
            <thead>
                <tr>${sheet.headers.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${sheet.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function copyCurrentPreviewTable() {
    if (!globalPreviewData || !globalPreviewData[currentPreviewSheetKey])
        return;
    const sheet = globalPreviewData[currentPreviewSheetKey];
    const btn = document.getElementById("btnCopyForGSheets");

    let tsv = sheet.headers.join("\t") + "\n";
    sheet.rows.forEach((r) => {
        tsv += r.join("\t") + "\n";
    });

    navigator.clipboard
        .writeText(tsv)
        .then(() => {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML =
                    '<i class="fa-solid fa-check"></i> Đã sao chép vào Clipboard!';
                btn.classList.add("btn-success-green");
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.classList.remove("btn-success-green");
                }, 2500);
            }
        })
        .catch((err) => {
            console.error("Không thể sao chép:", err);
        });
}

// Load Protocols & Task 2 Data
let protocolsData = null;
async function loadProtocols() {
    try {
        const res = await fetch("/api/protocols");
        const data = await res.json();
        if (data.success) {
            protocolsData = data.protocols;
            renderProtocolSection("sec-1");
        }
    } catch (e) {
        console.error("Error loading protocols:", e);
    }
}

function renderProtocolSection(secKey) {
    const body = document.getElementById("protocolBody");
    if (!body || !protocolsData) return;

    let html = "";
    if (secKey === "sec-1") {
        const m1 = protocolsData.muc_1;
        html += `<div class="protocol-section"><h3>${m1.title}</h3>`;
        m1.steps.forEach((s) => {
            html += `
                <div class="protocol-card">
                    <h4>${s.name}</h4>
                    <p>${s.desc}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-2") {
        const m2 = protocolsData.muc_2;
        html += `<div class="protocol-section"><h3>${m2.title}</h3>`;
        m2.principles.forEach((p, idx) => {
            html += `
                <div class="protocol-card">
                    <h4>Nguyên tắc ${idx + 1}</h4>
                    <p>${p}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-3") {
        const m3 = protocolsData.muc_3;
        html += `<div class="protocol-section"><h3>${m3.title}</h3>`;
        m3.cases.forEach((c) => {
            html += `
                <div class="protocol-card">
                    <h4>Trạng thái: ${c.status}</h4>
                    <p><strong>Định nghĩa:</strong> ${c.definition}</p>
                    <p><strong>Quy trình xử lý:</strong> ${c.protocol}</p>
                    ${c.steps ? `<ul class="protocol-steps">${c.steps.map((st) => `<li>${st}</li>`).join("")}</ul>` : ""}
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-4") {
        const m4 = protocolsData.muc_4;
        html += `<div class="protocol-section"><h3>${m4.title}</h3>`;
        m4.guidelines.forEach((g, idx) => {
            html += `
                <div class="protocol-card">
                    <h4>Quy định ${idx + 1}</h4>
                    <p>${g}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-5") {
        const m5 = protocolsData.muc_5;
        html += `<div class="protocol-section"><h3>${m5.title}</h3>`;
        html += `
            <div class="table-responsive">
                <table class="risk-table">
                    <thead>
                        <tr>
                            <th>Mã</th>
                            <th>Hạng Mục</th>
                            <th>Rủi Ro Nhận Diện</th>
                            <th>Xác Suất</th>
                            <th>Mức Độ</th>
                            <th>Biện Pháp Phòng Ngừa</th>
                            <th>Phương Án Ứng Phó Khẩn Cấp</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        m5.risks.forEach((r) => {
            html += `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td><span class="shift-id-tag">${r.category}</span></td>
                    <td>${r.risk_event}</td>
                    <td><span class="mk-warn">${r.probability}</span></td>
                    <td><span class="mk-bad">${r.impact}</span></td>
                    <td>${r.prevention}</td>
                    <td>${r.mitigation}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    body.innerHTML = html;
}

// ---------------------------------------------------------------------------
// QUẢN LÝ KHO HÀNG & DOANH THU F&B
// ---------------------------------------------------------------------------

function formatVND(num) {
    const val = Number(num) || 0;
    return val.toLocaleString("vi-VN") + " ₫";
}

async function loadInventoryData() {
    try {
        const res = await fetch("/api/inventory");
        const data = await res.json();
        if (data.success) {
            globalInventoryData = data;
            renderInventoryKPIs(data.kpis);
            renderInventoryTable(data.products || []);
            renderSalesLogsTable(data.sales_logs || []);
            populateSaleProductOptions(data.products || []);
            renderLivePOSProductGrid();
            if (currentSelectedLiveShiftId) {
                renderLiveShiftSalesTable(currentSelectedLiveShiftId);
                loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
            }
            renderAllShiftOrdersTab();
            loadOnlineOrders();
        }
    } catch (e) {
        console.error("Error loading inventory data:", e);
    }
}

function renderInventoryKPIs(kpis) {
    if (!kpis) return;
    const revEl = document.getElementById("invKpiRevenue");
    const stockEl = document.getElementById("invKpiTotalStock");
    const soldEl = document.getElementById("invKpiTotalSold");
    const valEl = document.getElementById("invKpiStockValue");

    if (revEl) revEl.textContent = formatVND(kpis.total_revenue);
    if (stockEl)
        stockEl.textContent = `${(kpis.total_stock || 0).toLocaleString("vi-VN")} SP`;
    if (soldEl)
        soldEl.textContent = `${(kpis.total_sold || 0).toLocaleString("vi-VN")} SP`;
    if (valEl) valEl.textContent = formatVND(kpis.total_stock_value);
}

function renderInventoryTable(products) {
    const tbody = document.getElementById("inventoryTableBody");
    if (!tbody) return;

    if (!products.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Kho hàng đang trống. Nhấn "+ Thêm Sản Phẩm" để tạo mới sản phẩm.</td></tr>`;
        return;
    }

    let html = "";
    products.forEach((p) => {
        const currentStock =
            p.current_stock !== undefined
                ? p.current_stock
                : p.initial_stock - p.sold_count;
        let badgeClass = "high";
        if (currentStock <= 0) {
            badgeClass = "empty";
        } else if (currentStock < 20) {
            badgeClass = "low";
        }

        const rev = (p.sold_count || 0) * (p.price || 0);

        html += `
            <tr>
                <td class="cell-center"><strong>${esc(p.id)}</strong></td>
                <td>
                    <strong>${esc(p.name)}</strong>
                    ${p.note ? `<div class="mer-meta">${esc(p.note)}</div>` : ""}
                </td>
                <td class="cell-center"><span class="shift-id-tag">${esc(p.unit)}</span></td>
                <td class="cell-center mk-num" style="font-weight: 600;">${formatVND(p.price)}</td>
                <td class="cell-center mk-num">${p.initial_stock}</td>
                <td class="cell-center mk-lead"><b>${p.sold_count}</b></td>
                <td class="cell-center">
                    <span class="stock-badge ${badgeClass}">${currentStock} ${esc(p.unit)}</span>
                </td>
                <td class="cell-center mk-num" style="color: var(--goldleaf); font-weight: 600;">
                    ${formatVND(rev)}
                </td>
                <td class="cell-center">
                    <div style="display: inline-flex; gap: 6px;">
                        <button type="button" class="btn-action-sm btn-action-sell" onclick="openQuickSaleModal('${esc(p.id)}')" title="Bán nhanh">
                            <i class="fa-solid fa-cart-plus"></i> Bán
                        </button>
                        ${
                            currentUserRole === "admin"
                                ? `
                            <button type="button" class="btn-action-sm btn-action-edit" onclick="openEditProductModal('${esc(p.id)}')" title="Sửa">
                                <i class="fa-solid fa-pen"></i> Sửa
                            </button>
                            <button type="button" class="btn-action-sm btn-action-delete" onclick="deleteProductItem('${esc(p.id)}')" title="Xóa">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>
                        `
                                : ""
                        }
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderSalesLogsTable(logs) {
    const tbody = document.getElementById("salesLogsTableBody");
    if (!tbody) return;

    if (!logs.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Chưa có giao dịch bán hàng nào được ghi nhận.</td></tr>`;
        return;
    }

    let html = "";
    logs.forEach((l) => {
        const unitPrice = l.unit_price !== undefined ? l.unit_price : l.price;
        const isRefunded = l.refunded === true;
        const refundBadge = isRefunded
            ? `<span class="status-badge badge-danger" style="background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); margin-left: 6px; font-size: 10px; padding: 1px 4px;">Đã hủy</span>`
            : "";
        const rowStyle = isRefunded
            ? 'style="opacity: 0.6; text-decoration: line-through;"'
            : "";
        const actionBtn = isRefunded
            ? `<span style="color: var(--ink-dim); font-size: 12px;"><i class="fa-solid fa-ban"></i> Đã hủy</span>`
            : `
            <button type="button" class="btn-action-sm btn-action-delete" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 3px 8px;" onclick="refundTransaction('${l.id}')" title="Hủy đơn hàng">
                <i class="fa-solid fa-rotate-left"></i> Hủy
            </button>
        `;

        html += `
            <tr ${rowStyle}>
                <td class="cell-center"><strong>${esc(l.id)}</strong>${refundBadge}</td>
                <td class="cell-center mk-num">${esc(l.timestamp || "")}</td>
                <td><strong>${esc(l.product_name)}</strong> <small>(${esc(l.product_id)})</small></td>
                <td class="cell-center mk-lead"><b>${l.quantity}</b> ${esc(l.unit || "SP")}</td>
                <td class="cell-center mk-num">${formatVND(unitPrice)}</td>
                <td class="cell-center mk-num" style="color: ${isRefunded ? "var(--ink-dim)" : "var(--goldleaf)"}; font-weight: 600;">${formatVND(l.total_amount)}</td>
                <td class="cell-center"><span class="shift-id-tag">${esc(l.channel || "Phòng Thanh Niên")}</span></td>
                <td>${esc(l.seller || "Ban Quản Trị")}</td>
                <td><small>${esc(l.note || "")}</small></td>
                <td class="cell-center">${actionBtn}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function populateSaleProductOptions(products) {
    const sel = document.getElementById("saleSelectProduct");
    if (!sel) return;

    let opts = '<option value="">-- Chọn sản phẩm --</option>';
    (products || []).forEach((p) => {
        const cur =
            p.current_stock !== undefined
                ? p.current_stock
                : p.initial_stock - p.sold_count;
        opts += `<option value="${p.id}" data-price="${p.price}" data-unit="${p.unit}" data-stock="${cur}">${p.name} (${p.id}) - ${formatVND(p.price)} [Còn: ${cur} ${p.unit}]</option>`;
    });
    sel.innerHTML = opts;
}

function openProductModalForAdd() {
    const modal = document.getElementById("productModal");
    if (!modal) return;

    document.getElementById("productModalTitle").innerHTML =
        `<i class="fa-solid fa-box-open"></i> Thêm Sản Phẩm Mới Vào Kho`;
    document.getElementById("inputProdOriginalId").value = "";
    document.getElementById("inputProdId").value = "";
    document.getElementById("inputProdId").disabled = false;
    document.getElementById("inputProdName").value = "";
    document.getElementById("inputProdUnit").value = "Ly";
    document.getElementById("inputProdPrice").value = "20000";
    document.getElementById("inputProdInitial").value = "100";
    document.getElementById("inputProdSold").value = "0";
    document.getElementById("inputProdNote").value = "";

    const msg = document.getElementById("productModalMsg");
    if (msg) msg.textContent = "";

    modal.classList.add("active");
}

window.openEditProductModal = function (productId) {
    if (!globalInventoryData || !globalInventoryData.products) return;
    const p = globalInventoryData.products.find(
        (item) => item.id === productId,
    );
    if (!p) return;

    const modal = document.getElementById("productModal");
    if (!modal) return;

    document.getElementById("productModalTitle").innerHTML =
        `<i class="fa-solid fa-pen-to-square"></i> Cập Nhật Sản Phẩm ${p.id}`;
    document.getElementById("inputProdOriginalId").value = p.id;
    document.getElementById("inputProdId").value = p.id;
    document.getElementById("inputProdId").disabled = true;
    document.getElementById("inputProdName").value = p.name || "";
    document.getElementById("inputProdUnit").value = p.unit || "Ly";
    document.getElementById("inputProdPrice").value = p.price || 0;
    document.getElementById("inputProdInitial").value = p.initial_stock || 0;
    document.getElementById("inputProdSold").value = p.sold_count || 0;
    document.getElementById("inputProdNote").value = p.note || "";

    const msg = document.getElementById("productModalMsg");
    if (msg) msg.textContent = "";

    modal.classList.add("active");
};

async function handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("inputProdId").value.trim();
    const name = document.getElementById("inputProdName").value.trim();
    const unit = document.getElementById("inputProdUnit").value;
    const price =
        parseInt(document.getElementById("inputProdPrice").value) || 0;
    const initial_stock =
        parseInt(document.getElementById("inputProdInitial").value) || 0;
    const sold_count =
        parseInt(document.getElementById("inputProdSold").value) || 0;
    const note = document.getElementById("inputProdNote").value.trim();
    const msg = document.getElementById("productModalMsg");

    if (!name) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng nhập tên sản phẩm!";
        }
        return;
    }

    try {
        const res = await authFetch("/api/inventory/product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id,
                name,
                unit,
                price,
                initial_stock,
                sold_count,
                note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById("productModal")?.classList.remove("active");
            loadInventoryData();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi lưu sản phẩm";
            }
        }
    } catch (err) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối: " + err.message;
        }
    }
}

window.deleteProductItem = function (productId) {
    openConfirmModal({
        title: "Xác Nhận Xóa Sản Phẩm",
        message: `Bạn có chắc chắn muốn xóa sản phẩm mã "${productId}" khỏi danh mục kho hàng?`,
        confirmBtnText: "Xóa Sản Phẩm",
        onConfirm: async () => {
            try {
                const res = await authFetch("/api/inventory/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: productId }),
                });
                const data = await res.json();
                if (data.success) {
                    loadInventoryData();
                } else {
                    console.error("Không thể xóa sản phẩm:", data.message);
                }
            } catch (err) {
                console.error("Lỗi xóa sản phẩm:", err);
            }
        },
    });
};

window.openQuickSaleModal = function (productId = "") {
    const modal = document.getElementById("recordSaleModal");
    if (!modal) return;

    const sel = document.getElementById("saleSelectProduct");
    if (sel && productId) {
        sel.value = productId;
    }
    const qtyInp = document.getElementById("saleInputQty");
    if (qtyInp) qtyInp.value = 1;

    const sellerInp = document.getElementById("saleInputSeller");
    if (sellerInp && !sellerInp.value) {
        sellerInp.value = "Ban Quản Trị";
    }

    const noteInp = document.getElementById("saleInputNote");
    if (noteInp) noteInp.value = "";

    const msg = document.getElementById("saleModalMsg");
    if (msg) msg.textContent = "";

    updateSaleCalcTotal();
    modal.classList.add("active");
};

function updateSaleCalcTotal() {
    const sel = document.getElementById("saleSelectProduct");
    const qtyInp = document.getElementById("saleInputQty");
    const totalOut = document.getElementById("saleCalcTotal");
    const hint = document.getElementById("saleProductStockHint");

    if (!sel || !qtyInp || !totalOut) return;

    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) {
        totalOut.textContent = "0 ₫";
        if (hint) hint.textContent = "";
        return;
    }

    const price = parseInt(opt.getAttribute("data-price")) || 0;
    const stock = parseInt(opt.getAttribute("data-stock")) || 0;
    const unit = opt.getAttribute("data-unit") || "SP";
    const qty = parseInt(qtyInp.value) || 0;

    const total = price * qty;
    totalOut.textContent = formatVND(total);

    if (hint) {
        if (stock < qty) {
            hint.innerHTML = `<span style="color: var(--cinnabar-lt);">⚠️ Cảnh báo: Tồn kho chỉ còn ${stock} ${unit}, không đủ đáp ứng ${qty} ${unit}!</span>`;
        } else {
            hint.textContent = `Tồn kho hiện có: ${stock} ${unit}`;
        }
    }
}

async function handleSaveSale(e) {
    e.preventDefault();
    const sel = document.getElementById("saleSelectProduct");
    const prodId = sel ? sel.value : "";
    const qty = parseInt(document.getElementById("saleInputQty")?.value) || 1;
    const channel =
        document.getElementById("saleSelectChannel")?.value ||
        "Phòng Thanh Niên";
    const seller =
        document.getElementById("saleInputSeller")?.value || "Ban Quản Trị";
    const note = document.getElementById("saleInputNote")?.value || "";
    const msg = document.getElementById("saleModalMsg");

    if (!prodId) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn sản phẩm cần bán!";
        }
        return;
    }

    try {
        const res = await fetch("/api/inventory/sell", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: prodId,
                quantity: qty,
                channel: channel,
                seller: seller,
                note: note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            document
                .getElementById("recordSaleModal")
                ?.classList.remove("active");
            loadInventoryData();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi ghi nhận bán hàng";
            }
        }
    } catch (err) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối: " + err.message;
        }
    }
}

async function handleResetInventory() {
    try {
        const res = await fetch("/api/inventory/reset", { method: "POST" });
        const data = await res.json();
        if (data.success) {
            loadInventoryData();
        }
    } catch (e) {
        console.error("Error resetting inventory:", e);
    }
}

// ---------------------------------------------------------------------------
// CA-LIVE & THU NGÂN POS MODULE
// ---------------------------------------------------------------------------
let liveCart = {}; // { product_id: { product, quantity } }
let currentSelectedLiveShiftId = null;

function startLiveClock() {
    const clockEl = document.getElementById("liveRealTimeClock");
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        const dateStr = now.toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const timeStr = now.toLocaleTimeString("vi-VN");
        clockEl.textContent = `${dateStr} - ${timeStr}`;
    };
    update();
    setInterval(update, 1000);
}

function formatShiftTimeValue(shift) {
    const start = shift?.start_time || shift?.shift_start_time || "";
    const end = shift?.end_time || shift?.shift_end_time || "";
    const slot = shift?.slot || "";

    if (start && end) {
        return `${start} - ${end}`;
    }
    if (slot) {
        return slot;
    }
    return "Ca trực";
}

function formatShiftSummaryLabel(shift) {
    const day = shift?.day || "";
    const time = formatShiftTimeValue(shift);
    const loc =
        shift?.location ||
        (shift?.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
    const leader = shift?.shift_leader
        ? ` • Trưởng ca: ${shift.shift_leader}`
        : "";
    return `${day} • ${time} • ${loc}${leader}`;
}

function getShiftTimeDistance(shift) {
    const dayMap = {
        "Thứ 2": 1,
        "Thứ 3": 2,
        "Thứ 4": 3,
        "Thứ 5": 4,
        "Thứ 6": 5,
        "Thứ 7": 6,
        "Chủ Nhật": 0,
    };
    const now = new Date();
    const currentDayIdx = now.getDay();
    const shiftDayIdx = dayMap[shift.day] !== undefined ? dayMap[shift.day] : 1;

    let dayDiff = Math.abs(currentDayIdx - shiftDayIdx);
    if (dayDiff > 3) dayDiff = 7 - dayDiff;

    let startHour = 8;
    if (shift.slot) {
        const match = shift.slot.match(/^(\d+)h/);
        if (match) startHour = parseInt(match[1], 10);
    } else if (shift.start_time) {
        const match = shift.start_time.match(/^(\d+):/);
        if (match) startHour = parseInt(match[1], 10);
    }
    const currentHour = now.getHours();
    const hourDiff = Math.abs(currentHour - startHour);

    return dayDiff * 100 + hourDiff;
}

function populateLiveShiftDropdown(filterKeyword = "") {
    const select = document.getElementById("liveShiftSelect");
    const posSelect = document.getElementById("livePOSShiftSelect");
    if (!globalScheduleData || !globalScheduleData.assigned_shifts)
        return;

    const allShifts = [...globalScheduleData.assigned_shifts];
    allShifts.sort((a, b) => getShiftTimeDistance(a) - getShiftTimeDistance(b));

    const kw = (filterKeyword || "").toLowerCase().trim();
    let shifts = allShifts;
    if (kw) {
        shifts = allShifts.filter((s) => {
            const timeLabel = formatShiftTimeValue(s).toLowerCase();
            const shiftIdMatch = (s.shift_id || "").toLowerCase().includes(kw);
            const dayMatch = (s.day || "").toLowerCase().includes(kw);
            const slotMatch = (s.slot || "").toLowerCase().includes(kw);
            const locMatch = (
                s.location ||
                (s.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên")
            )
                .toLowerCase()
                .includes(kw);
            const leaderMatch = (s.shift_leader || "")
                .toLowerCase()
                .includes(kw);
            const memberMatch = (s.assigned_members || []).some((m) =>
                m && (m.name || "").toLowerCase().includes(kw),
            );
            return (
                shiftIdMatch ||
                dayMatch ||
                slotMatch ||
                locMatch ||
                leaderMatch ||
                memberMatch ||
                timeLabel.includes(kw)
            );
        });
    }

    let html = "";
    if (shifts.length === 0) {
        html = `<option value="">-- Không tìm thấy ca trực nào phù hợp --</option>`;
    } else {
        shifts.forEach((s) => {
            const isClosest = s.shift_id === allShifts[0]?.shift_id;
            const badge = isClosest ? "🔴 [Đang trực]" : "🗓️";
            const loc =
                s.location ||
                (s.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
            const leader = s.shift_leader ? ` • Trưởng ca: ${s.shift_leader}` : "";
            const timeLabel = formatShiftTimeValue(s);
            const isSelected = s.shift_id === currentSelectedLiveShiftId;
            const chinhCount = (s.assigned_members || []).filter((m) => m && m.role === "Chính").length;
            const totalAssigned = s.assigned_count || (s.assigned_members || []).length;
            html += `<option value="${s.shift_id}" ${isSelected ? "selected" : ""}>
                ${badge} Ca ${s.shift_id} • ${s.day} • ${timeLabel} • ${loc} [${chinhCount}/${totalAssigned} TV]${leader}
            </option>`;
        });
    }

    if (select) {
        select.innerHTML = html;
        if (shifts.length > 0) {
            const targetShiftId = shifts.some((s) => s.shift_id === currentSelectedLiveShiftId)
                ? currentSelectedLiveShiftId
                : shifts[0].shift_id;
            select.value = targetShiftId;
            currentSelectedLiveShiftId = targetShiftId;
            loadLiveShiftDetailsAndCandidates(targetShiftId);
        }
    }

    if (posSelect && !kw) {
        let posHtml = "";
        allShifts.forEach((s, idx) => {
            const isClosest = idx === 0;
            const badge = isClosest ? "🔴" : "🗓️";
            const loc =
                s.location ||
                (s.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
            const leader = s.shift_leader ? ` • Trưởng ca: ${s.shift_leader}` : "";
            const timeLabel = formatShiftTimeValue(s);
            const chinhCount = (s.assigned_members || []).filter((m) => m && m.role === "Chính").length;
            const totalAssigned = s.assigned_count || (s.assigned_members || []).length;
            posHtml += `<option value="${s.shift_id}" ${isClosest ? "selected" : ""}>
                ${badge} Ca ${s.shift_id} • ${s.day} • ${timeLabel} • ${loc} [${chinhCount}/${totalAssigned} TV]${leader}
            </option>`;
        });
        posSelect.innerHTML = posHtml;
    }
}

window.handleContingencyShiftSearch = function (keyword) {
    populateLiveShiftDropdown(keyword);
};


// Global state for live attendance screen
let localAttendanceState = {}; // Key: member_id, Value: { status: string|null, replacementId: string|null, isModified: boolean }
let currentShiftCandidates = []; // Suggested backup candidates

async function loadLiveShiftDetailsAndCandidates(shiftId) {
    currentSelectedLiveShiftId = shiftId;

    const select = document.getElementById("liveShiftSelect");
    if (select && select.value !== shiftId) select.value = shiftId;
    const posSelect = document.getElementById("livePOSShiftSelect");
    if (posSelect && posSelect.value !== shiftId) posSelect.value = shiftId;

    // 1. Fetch suggestions/candidates for this shift
    try {
        const res = await fetch(
            `/api/contingency/suggest?shift_id=${shiftId}`,
        ).then((r) => r.json());
        if (res.success) {
            currentShiftCandidates = res.candidates || [];
        } else {
            currentShiftCandidates = [];
        }
    } catch (e) {
        console.error("Error fetching shift candidates:", e);
        currentShiftCandidates = [];
    }

    // 2. Initialize localAttendanceState from current incident logs
    localAttendanceState = {};
    if (globalScheduleData && globalScheduleData.assigned_shifts) {
        const shift = globalScheduleData.assigned_shifts.find(
            (s) => s.shift_id === shiftId,
        );
        if (shift) {
            const incidents = globalIncidentLogs || [];
            (shift.assigned_members || []).forEach((m) => {
                if (!m) return;
                const mName = m.name || m.member_id || "";
                const lastLog = incidents.find(
                    (l) =>
                        l &&
                        l.shift_id === shiftId &&
                        ((l.absent_member && l.absent_member === mName) ||
                            (l.absent_member_id && l.absent_member_id === m.member_id)),
                );

                const isUnreach = lastLog && (
                    lastLog.status_type === "Vắng mặt (Không gọi được dự phòng)" ||
                    (lastLog.status_type && lastLog.status_type.includes("Không gọi được"))
                );

                // Check if this member is acting as replacement for someone in this shift
                const repLog = incidents.find(
                    (l) =>
                        l &&
                        l.shift_id === shiftId &&
                        ((l.replacement_member && l.replacement_member === mName) ||
                            (l.replacement_member_id && l.replacement_member_id === m.member_id)),
                );

                localAttendanceState[m.member_id] = {
                    status: lastLog ? lastLog.status_type : (repLog ? "Có mặt" : null),
                    replacementId: lastLog
                        ? lastLog.replacement_member_id || ""
                        : "",
                    unreachable: !!isUnreach,
                    isBackupActivated: !!repLog,
                    replacedAbsentMemberId: repLog ? repLog.absent_member_id : "",
                    replacedAbsentMemberName: repLog ? repLog.absent_member : "",
                    isModified: false,
                };
            });
        }
    }

    // 3. Render shift details and incident logs (filtered for staff)
    renderLiveShiftDetails(shiftId);
    loadLiveShiftOnlineOrders(shiftId);
    if (globalIncidentLogs) {
        renderIncidentLogs(globalIncidentLogs);
    }
}

function getMemberReputationScore(memberId, memberName) {
    let rep = 100;
    const logs = globalIncidentLogs || [];
    logs.forEach((l) => {
        if (
            (l.absent_member_id && l.absent_member_id === memberId) ||
            (l.absent_member && l.absent_member === memberName) ||
            (l.member && l.member === memberName)
        ) {
            const st = l.status_type;
            if (st === "Đi trễ") rep -= 3;
            else if (st === "Mất tập trung") rep -= 5;
            else if (st === "Bỏ quầy") rep -= 5;
            else if (
                st === "Vắng không phép" ||
                st === "Vắng đột xuất" ||
                st === "Vắng mặt"
            )
                rep -= 10;
        }
    });
    return Math.max(0, rep);
}

function renderLiveShiftDetails(shiftId) {
    if (!globalScheduleData || !globalScheduleData.assigned_shifts) return;
    const shift = globalScheduleData.assigned_shifts.find(
        (s) => s.shift_id === shiftId,
    );
    if (!shift) return;

    const isAdmin = currentUserRole === "admin";

    currentSelectedLiveShiftId = shiftId;

    let allMembersInShift = [...(shift.assigned_members || [])].filter(Boolean);

    // Ensure the Shift Leader is present in the members list
    if (shift.shift_leader && shift.shift_leader !== "Chưa chỉ định") {
        const leaderName = shift.shift_leader;
        const leaderExists = allMembersInShift.some(
            (m) => m && (m.name === leaderName || m.member_id === leaderName)
        );
        if (!leaderExists) {
            const gMem = (globalMembers || []).find(
                (m) => m && (m.name === leaderName || m.member_id === leaderName)
            );
            if (gMem) {
                allMembersInShift.unshift({
                    member_id: gMem.member_id,
                    name: gMem.name,
                    phone: gMem.phone || "",
                    department: gMem.department || "Ban Quản Lý",
                    role: "Chính",
                    position_role: "⭐ Trưởng ca / Điều phối",
                });
            } else {
                allMembersInShift.unshift({
                    member_id: `leader_${shift.shift_id}`,
                    name: leaderName,
                    phone: "",
                    department: "Trưởng ca",
                    role: "Chính",
                    position_role: "⭐ Trưởng ca / Điều phối",
                });
            }
        }
    }

    const subEl = document.getElementById("liveShiftInfoSub");
    if (subEl) {
        const loc =
            shift.location ||
            (shift.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
        const timeLabel = formatShiftTimeValue(shift);
        const leaderStr = shift.shift_leader
            ? ` • Trưởng Ca: <strong style="color: #FBBF24;"><i class="fa-solid fa-crown"></i> ${esc(shift.shift_leader)}</strong>`
            : ` • Trưởng Ca: <span style="color: var(--ink-dim); font-style: italic;">Chưa chỉ định</span>`;
        subEl.innerHTML = `Đang chọn ca: <strong style="color:var(--goldleaf);">${esc(shift.shift_id)}</strong> • ${esc(shift.day)} • ${esc(timeLabel)} • Địa điểm: <strong>${esc(loc)}</strong>${leaderStr}`;
    }

    const memberListEl = document.getElementById("liveShiftMemberList");
    if (memberListEl) {
        let memHtml = "";

        allMembersInShift.forEach((m) => {
            if (!m) return;
            const mName = m.name || m.member_id || "N/A";
            const isLeader = shift.shift_leader === mName;
            const isDp = m.role !== "Chính";
            const task =
                m.position_role ||
                (isDp ? "⚡ Dự bị tiếp ứng" : "🛵 Phục vụ / Bán hàng");

            // Get status and replacement from local state
            const localState = localAttendanceState[m.member_id] || {
                status: null,
                replacementId: "",
                unreachable: false,
                isBackupActivated: false,
                replacedAbsentMemberId: "",
                replacedAbsentMemberName: "",
                isModified: false,
            };
            const isBackupActivated = isDp && (localState.isBackupActivated || (localState.replacedAbsentMemberId && localState.replacedAbsentMemberId !== ""));
            const isUnreachable = isDp && (localState.unreachable === true || localState.status === "Không gọi được dự phòng");
            const currentStatus = localState.status;
            const memberRep = getMemberReputationScore(m.member_id, mName);

            let cardBg = "rgba(255,255,255,0.03)";
            let cardBorder = "1px solid rgba(255,255,255,0.08)";
            let cardLeftBorder = "4px solid rgba(255,255,255,0.2)";
            let statusBadge =
                '<span class="tag" style="background:rgba(255,255,255,0.06); color:var(--ink-dim); border:1px solid rgba(255,255,255,0.1); padding:4px 9px;"><i class="fa-regular fa-circle"></i> Chưa điểm danh</span>';

            if (isUnreachable) {
                cardBg = "rgba(239,68,68,0.08)";
                cardBorder = "1px solid rgba(239,68,68,0.25)";
                cardLeftBorder = "4px solid #EF4444";
                statusBadge =
                    '<span class="tag" style="background:rgba(239,68,68,0.22); color:#FCA5A5; border:1px solid #DC2626; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-phone-slash"></i> Không gọi được (Chờ lưu)</span>';
            } else if (isBackupActivated) {
                if (currentStatus === "Có mặt" || !currentStatus) {
                    cardBg = "rgba(16,185,129,0.08)";
                    cardBorder = "1px solid rgba(16,185,129,0.25)";
                    cardLeftBorder = "4px solid #10B981";
                    statusBadge =
                        '<span class="tag" style="background:rgba(16,185,129,0.22); color:#34D399; border:1px solid #059669; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Đang tiếp ứng: Có mặt</span>';
                } else if (currentStatus === "Đi trễ") {
                    cardBg = "rgba(245,158,11,0.08)";
                    cardBorder = "1px solid rgba(245,158,11,0.25)";
                    cardLeftBorder = "4px solid #F59E0B";
                    statusBadge =
                        '<span class="tag" style="background:rgba(245,158,11,0.22); color:#FBBF24; border:1px solid #D97706; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> Tiếp ứng: Đi trễ (-3đ)</span>';
                } else if (currentStatus === "Mất tập trung") {
                    cardBg = "rgba(234,88,12,0.08)";
                    cardBorder = "1px solid rgba(234,88,12,0.25)";
                    cardLeftBorder = "4px solid #EA580C";
                    statusBadge =
                        '<span class="tag" style="background:rgba(234,88,12,0.22); color:#FB923C; border:1px solid #EA580C; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-mobile-screen"></i> Tiếp ứng: Mất tập trung (-5đ)</span>';
                } else if (currentStatus === "Bỏ quầy") {
                    cardBg = "rgba(225,29,72,0.08)";
                    cardBorder = "1px solid rgba(225,29,72,0.25)";
                    cardLeftBorder = "4px solid #E11D48";
                    statusBadge =
                        '<span class="tag" style="background:rgba(225,29,72,0.22); color:#FDA4AF; border:1px solid #E11D48; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-person-walking-arrow-right"></i> Tiếp ứng: Bỏ quầy (-5đ)</span>';
                } else if (
                    currentStatus === "Vắng không phép" ||
                    currentStatus === "Vắng đột xuất" ||
                    currentStatus === "Vắng mặt"
                ) {
                    cardBg = "rgba(239,68,68,0.08)";
                    cardBorder = "1px solid rgba(239,68,68,0.25)";
                    cardLeftBorder = "4px solid #EF4444";
                    statusBadge =
                        '<span class="tag" style="background:rgba(239,68,68,0.22); color:#FCA5A5; border:1px solid #DC2626; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Tiếp ứng: Vắng (-10đ)</span>';
                } else if (currentStatus === "Xin nghỉ trước") {
                    cardBg = "rgba(59,130,246,0.08)";
                    cardBorder = "1px solid rgba(59,130,246,0.25)";
                    cardLeftBorder = "4px solid #3B82F6";
                    statusBadge =
                        '<span class="tag" style="background:rgba(59,130,246,0.22); color:#93C5FD; border:1px solid #2563EB; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-clipboard-check"></i> Tiếp ứng: Xin nghỉ trước</span>';
                }
            } else {
                if (currentStatus === "Có mặt") {
                    cardBg = "rgba(16,185,129,0.08)";
                    cardBorder = "1px solid rgba(16,185,129,0.25)";
                    cardLeftBorder = "4px solid #10B981";
                    statusBadge =
                        '<span class="tag" style="background:rgba(16,185,129,0.22); color:#34D399; border:1px solid #059669; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Có mặt đúng giờ</span>';
                } else if (currentStatus === "Đi trễ") {
                    cardBg = "rgba(245,158,11,0.08)";
                    cardBorder = "1px solid rgba(245,158,11,0.25)";
                    cardLeftBorder = "4px solid #F59E0B";
                    statusBadge =
                        '<span class="tag" style="background:rgba(245,158,11,0.22); color:#FBBF24; border:1px solid #D97706; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> Đi trễ (-3đ)</span>';
                } else if (currentStatus === "Mất tập trung") {
                    cardBg = "rgba(234,88,12,0.08)";
                    cardBorder = "1px solid rgba(234,88,12,0.25)";
                    cardLeftBorder = "4px solid #EA580C";
                    statusBadge =
                        '<span class="tag" style="background:rgba(234,88,12,0.22); color:#FB923C; border:1px solid #EA580C; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-mobile-screen"></i> Mất tập trung (-5đ)</span>';
                } else if (currentStatus === "Bỏ quầy") {
                    cardBg = "rgba(225,29,72,0.08)";
                    cardBorder = "1px solid rgba(225,29,72,0.25)";
                    cardLeftBorder = "4px solid #E11D48";
                    statusBadge =
                        '<span class="tag" style="background:rgba(225,29,72,0.22); color:#FDA4AF; border:1px solid #E11D48; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-person-walking-arrow-right"></i> Bỏ quầy (-5đ)</span>';
                } else if (
                    currentStatus === "Vắng không phép" ||
                    currentStatus === "Vắng đột xuất" ||
                    currentStatus === "Vắng mặt"
                ) {
                    cardBg = "rgba(239,68,68,0.08)";
                    cardBorder = "1px solid rgba(239,68,68,0.25)";
                    cardLeftBorder = "4px solid #EF4444";
                    statusBadge =
                        '<span class="tag" style="background:rgba(239,68,68,0.22); color:#FCA5A5; border:1px solid #DC2626; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Vắng không phép (-10đ)</span>';
                } else if (currentStatus === "Xin nghỉ trước") {
                    cardBg = "rgba(59,130,246,0.08)";
                    cardBorder = "1px solid rgba(59,130,246,0.25)";
                    cardLeftBorder = "4px solid #3B82F6";
                    statusBadge =
                        '<span class="tag" style="background:rgba(59,130,246,0.22); color:#93C5FD; border:1px solid #2563EB; padding:4px 9px; font-weight:700;"><i class="fa-solid fa-clipboard-check"></i> Xin nghỉ trước</span>';
                }
            }

            // Build replacement dropdown HTML if marked as absent
            let replacementHtml = "";
            const isAbsent =
                currentStatus === "Vắng không phép" ||
                currentStatus === "Vắng đột xuất" ||
                currentStatus === "Xin nghỉ trước" ||
                currentStatus === "Vắng mặt";

            if (isAbsent) {
                if (isAdmin) {
                    let optionsHtml = `<option value="">-- Chọn nhân sự thay thế --</option>`;
                    optionsHtml += `<option value="no_replacement" ${localState.replacementId === "no_replacement" || !localState.replacementId ? "selected" : ""}>Không cần thay thế / Chờ tự ứng phó</option>`;

                    (currentShiftCandidates || []).forEach((cand) => {
                        const selectedAttr =
                            localState.replacementId === cand.member_id
                                ? "selected"
                                : "";
                        optionsHtml += `<option value="${esc(cand.member_id)}" ${selectedAttr}>${esc(cand.name)} [${esc(cand.priority_label)}] - ${esc(cand.phone)}</option>`;
                    });

                    replacementHtml = `
                        <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px dashed rgba(239,68,68,0.3);">
                            <label style="font-size: 12px; font-weight: 600; color: #FCA5A5;"><i class="fa-solid fa-people-arrows"></i> Chỉ Định Nhân Sự Thay Thế (Admin):</label>
                            <select class="custom-select" style="font-size: 13px; font-weight: 500; height: 36px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-card-alt); color: var(--ink-hi);" onchange="setLocalReplacement('${esc(m.member_id)}', this.value)">
                                ${optionsHtml}
                            </select>
                        </div>
                    `;
                } else {
                    const hasBackupRep = localState.replacementId && localState.replacementId !== "no_replacement";
                    let repName = "";
                    if (hasBackupRep) {
                        const repM = shift.assigned_members?.find(sm => sm.member_id === localState.replacementId) ||
                                     currentShiftCandidates?.find(c => c.member_id === localState.replacementId);
                        if (repM) repName = repM.name;
                    }

                    replacementHtml = `
                        <div style="margin-top: 8px; background: rgba(239,68,68,0.08); border: 1px dashed rgba(239,68,68,0.3); border-radius: 6px; padding: 8px 12px; font-size: 11.5px; color: #FCA5A5;">
                            ${hasBackupRep 
                                ? `<i class="fa-solid fa-user-shield" style="color: #34D399;"></i> Đã bố trí nhân sự dự phòng <strong>${esc(repName || localState.replacementId)}</strong> tiếp ứng.`
                                : `<i class="fa-solid fa-circle-info"></i> Đã ghi nhận vắng mặt. Bạn có thể bấm nút <strong>"Gọi dự phòng"</strong> ở danh sách nhân sự dự phòng bên dưới để kích hoạt thay thế cho thành viên này.`
                            }
                        </div>
                    `;
                }
            }

            const isViolationSelected =
                currentStatus === "Đi trễ" ||
                currentStatus === "Mất tập trung" ||
                currentStatus === "Bỏ quầy";

            // Action controls: Có mặt, Vắng mặt, Đi trễ, List sổ ra sai phạm khác, Đặt lại
            let buttonsHtml = "";
            if (!isDp || isBackupActivated) {
                buttonsHtml = `
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); align-items: center;">
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Có mặt')" style="background: ${currentStatus === "Có mặt" ? "#059669" : "rgba(16,185,129,0.15)"}; color: ${currentStatus === "Có mặt" ? "#FFF" : "#34D399"}; border: 1px solid #059669; padding: 6px 14px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Điểm danh có mặt đúng giờ (Không trừ điểm uy tín)">
                            <i class="fa-solid fa-circle-check"></i> Có mặt
                        </button>
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Vắng không phép')" style="background: ${isAbsent ? "#DC2626" : "rgba(239,68,68,0.15)"}; color: ${isAbsent ? "#FFF" : "#FCA5A5"}; border: 1px solid #DC2626; padding: 6px 14px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Ghi nhận vắng không phép (-10 điểm uy tín)">
                            <i class="fa-solid fa-triangle-exclamation"></i> Vắng mặt
                        </button>
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Đi trễ')" style="background: ${currentStatus === "Đi trễ" ? "#D97706" : "rgba(245,158,11,0.15)"}; color: ${currentStatus === "Đi trễ" ? "#FFF" : "#FBBF24"}; border: 1px solid #D97706; padding: 6px 14px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Ghi nhận đi trễ (-3 điểm uy tín)">
                            <i class="fa-solid fa-clock-rotate-left"></i> Đi trễ
                        </button>
                        <div style="position: relative; display: inline-flex; align-items: center;">
                            <select class="custom-select" onchange="setLocalAttendanceStatus('${esc(m.member_id)}', this.value)" style="height: 32px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; border: 1px solid ${isViolationSelected && currentStatus !== "Đi trễ" ? "#F59E0B" : "rgba(255,255,255,0.15)"}; background: ${isViolationSelected && currentStatus !== "Đi trễ" ? "rgba(245,158,11,0.18)" : "var(--bg-card-alt)"}; color: ${isViolationSelected && currentStatus !== "Đi trễ" ? "#FBBF24" : "var(--ink-light)"}; cursor: pointer;">
                                <option value="" ${!isViolationSelected || currentStatus === "Đi trễ" ? "selected" : ""}>⚠️ Sai phạm khác ▾</option>
                                <option value="Mất tập trung" ${currentStatus === "Mất tập trung" ? "selected" : ""}>📱 Mất tập trung (-5đ)</option>
                                <option value="Bỏ quầy" ${currentStatus === "Bỏ quầy" ? "selected" : ""}>🚶 Bỏ quầy (-5đ)</option>
                                <option value="Xin nghỉ trước" ${currentStatus === "Xin nghỉ trước" ? "selected" : ""}>📝 Xin nghỉ trước (>24h)</option>
                            </select>
                        </div>
                        ${
                            currentStatus
                                ? `
                            <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', null)" style="background: rgba(255,255,255,0.06); color: var(--ink-dim); border: 1px solid var(--border-color); padding: 5px 10px; font-size: 11px; border-radius: 6px; cursor: pointer;" title="Đặt lại trạng thái chưa điểm danh">
                                <i class="fa-solid fa-rotate-left"></i> Đặt lại
                            </button>
                        `
                                : ""
                        }
                        ${
                            isBackupActivated
                                ? `
                            <button type="button" class="btn-action-sm" onclick="cancelBackupActivation('${esc(m.member_id)}')" style="background: rgba(239,68,68,0.12); color: #FCA5A5; border: 1px solid rgba(239,68,68,0.3); padding: 5px 10px; font-size: 11px; border-radius: 6px; cursor: pointer; margin-left: auto;" title="Hủy kích hoạt tiếp ứng của nhân sự này">
                                <i class="fa-solid fa-xmark"></i> Hủy tiếp ứng
                            </button>
                        `
                                : ""
                        }
                    </div>
                `;
            } else {
                // Standby backup member
                buttonsHtml = `
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); align-items: center; justify-content: space-between;">
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                            <button type="button" class="btn-action-sm" onclick="openCallBackupModal('${esc(m.member_id)}', '${esc(m.name)}', '${esc(m.phone)}', '${esc(m.department)}')" style="background: rgba(16, 185, 129, 0.18); color: #34D399; border: 1px solid #059669; padding: 6px 14px; font-weight: 700; font-size: 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;" title="Gọi và kích hoạt nhân sự dự phòng này để thay cho người vắng trong ca">
                                <i class="fa-solid fa-phone-volume"></i> Gọi dự phòng
                            </button>
                            <button type="button" class="btn-action-sm" onclick="toggleLocalUnreachableBackup('${esc(m.member_id)}')" style="background: ${isUnreachable ? '#DC2626' : 'rgba(239, 68, 68, 0.12)'}; color: ${isUnreachable ? '#FFFFFF' : '#FCA5A5'}; border: 1px solid ${isUnreachable ? '#B91C1C' : '#DC2626'}; padding: 6px 14px; font-weight: ${isUnreachable ? '700' : '600'}; font-size: 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; ${isUnreachable ? 'box-shadow: 0 0 10px rgba(220, 38, 38, 0.4);' : ''}" title="${isUnreachable ? 'Bấm lại để hủy đánh dấu không gọi được' : 'Bấm để đánh dấu không gọi được nhân sự này, nhấn nút Lưu điểm danh để cập nhật hệ thống'}">
                                <i class="fa-solid fa-phone-slash"></i> ${isUnreachable ? 'Không gọi được (Đã chọn)' : 'Không gọi được?'}
                            </button>
                        </div>
                        ${
                            isAdmin
                                ? `
                            <button type="button" class="btn-action-sm admin-only-elem" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', '${currentStatus === "Có mặt" ? "" : "Có mặt"}')" style="background: ${currentStatus === "Có mặt" ? "#059669" : "rgba(255,255,255,0.06)"}; color: ${currentStatus === "Có mặt" ? "#FFF" : "var(--ink-dim)"}; border: 1px solid var(--border-color); padding: 5px 10px; font-size: 11px; border-radius: 6px; cursor: pointer;">
                                <i class="fa-solid fa-check"></i> ${currentStatus === "Có mặt" ? "Đã có mặt" : "Điểm danh trực"}
                            </button>
                        `
                                : ""
                        }
                    </div>
                `;
            }

            const repColor =
                memberRep >= 90
                    ? "#34D399"
                    : memberRep >= 75
                      ? "#FBBF24"
                      : "#FCA5A5";
            const repBg =
                memberRep >= 90
                    ? "rgba(16,185,129,0.15)"
                    : memberRep >= 75
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(239,68,68,0.15)";
            const repBorder =
                memberRep >= 90
                    ? "rgba(16,185,129,0.3)"
                    : memberRep >= 75
                      ? "rgba(245,158,11,0.3)"
                      : "rgba(239,68,68,0.3)";

            const tagBg = isLeader 
                ? "rgba(217,119,6,0.3)" 
                : isBackupActivated 
                    ? "rgba(16,185,129,0.3)" 
                    : isDp 
                        ? "rgba(109,40,217,0.3)" 
                        : "rgba(255,255,255,0.1)";
            const tagColor = isLeader 
                ? "#FBBF24" 
                : isBackupActivated 
                    ? "#34D399" 
                    : isDp 
                        ? "#C084FC" 
                        : "var(--ink-light)";
            const tagBorder = isLeader 
                ? "#D97706" 
                : isBackupActivated 
                    ? "#059669" 
                    : isDp 
                        ? "#7C3AED" 
                        : "var(--border-color)";
            const tagLabel = isLeader 
                ? "Trưởng ca" 
                : isBackupActivated 
                    ? `⚡ Tiếp ứng: ${esc(localState.replacedAbsentMemberName || 'Người vắng')}` 
                    : isDp 
                        ? "Dự phòng" 
                        : esc(m.department);

            memHtml += `
                <div style="background: ${cardBg}; border: ${cardBorder}; border-left: ${cardLeftBorder}; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; transition: all 0.2s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <strong style="font-size: 15px; color: var(--ink-hi); font-weight: 700;">${isLeader ? "⭐ " : ""}${esc(m.name)}</strong>
                                <span class="tag" style="background: ${tagBg}; color: ${tagColor}; border: 1px solid ${tagBorder};">
                                    ${tagLabel}
                                </span>
                                <span class="tag" style="background: ${repBg}; color: ${repColor}; border: 1px solid ${repBorder}; font-weight: 700; font-size: 11.5px; padding: 2px 7px;" title="Điểm uy tín tích lũy của thành viên (Ban đầu: 100đ)">
                                    <i class="fa-solid fa-shield-heart"></i> Uy tín: ${memberRep}/100đ
                                </span>
                            </div>
                            <div style="font-size: 12px; color: var(--ink-dim); margin-top: 4px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span><i class="fa-solid fa-phone" style="color: var(--goldleaf);"></i> ${esc(m.phone)}</span>
                                <span>&bull; Nhiệm vụ: <strong style="color: var(--goldleaf); font-weight: 600;">${esc(task)}</strong></span>
                            </div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>
                    ${replacementHtml}
                    ${buttonsHtml}
                </div>
            `;
        });

        memberListEl.innerHTML =
            memHtml ||
            '<div class="table-empty">Không có nhân sự trong ca này.</div>';
    }

    // Hiển thị thông báo cảnh báo khẩn nếu ca có nhân sự dự phòng không liên lạc được
    const alertNoticeEl = document.getElementById("liveShiftAlertNotice");
    const shiftIncidents = (globalIncidentLogs || []).filter((inc) => inc.shift_id === shiftId);
    const hasUnreachableInLogs = shiftIncidents.some(
        (inc) =>
            inc.status_type &&
            inc.status_type.includes("Không gọi được") &&
            (!inc.replacement_member ||
                inc.replacement_member === "Không thay thế" ||
                inc.replacement_member === "none" ||
                inc.replacement_member === "no_replacement"),
    );
    const hasUnreachableInLocal = (shift.assigned_members || []).some((m) => {
        if (!m || !m.member_id) return false;
        const ls = localAttendanceState[m.member_id];
        return ls && (ls.unreachable || ls.status === "Không gọi được dự phòng");
    });

    if (alertNoticeEl) {
        if (hasUnreachableInLogs || hasUnreachableInLocal) {
            alertNoticeEl.style.display = "block";
            alertNoticeEl.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #EF4444; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-triangle-exclamation" style="color: #EF4444; font-size: 16px;"></i>
                        <div style="font-size: 12.5px; color: var(--ink-hi);">
                            <strong style="color: #F87171;">Cảnh báo ca trực:</strong> Có sự cố không liên lạc được nhân sự dự phòng. Đã gửi cảnh báo khẩn cấp đến Quản Trị Viên để điều phối thay thế!
                        </div>
                    </div>
                    <button type="button" class="btn-action-sm" onclick="viewShiftHistoryFromAlert()" style="background: rgba(239, 68, 68, 0.25); color: #FCA5A5; border: 1px solid #EF4444; padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-clock-rotate-left"></i> Xem lịch sử ca
                    </button>
                </div>
            `;
        } else {
            alertNoticeEl.style.display = "none";
            alertNoticeEl.innerHTML = "";
        }
    }

    // Hiển thị danh sách Lịch Sử Sự Cố & Thay Thế của ca trực đang chọn
    const histSection = document.getElementById("liveShiftHistorySection");
    const histList = document.getElementById("liveShiftHistoryList");
    const histCountBadge = document.getElementById("liveShiftHistoryCountBadge");

    if (histSection && histList) {
        if (shiftIncidents.length > 0) {
            histSection.style.display = "block";
            if (histCountBadge) {
                histCountBadge.textContent = `${shiftIncidents.length} ghi nhận`;
            }
            let histHtml = "";
            shiftIncidents.forEach((inc) => {
                const isUnreach = inc.status_type && inc.status_type.includes("Không gọi được");
                const borderCol = isUnreach ? "#EF4444" : "rgba(255,255,255,0.12)";
                const bgCol = isUnreach ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)";
                const iconTag = isUnreach
                    ? '<i class="fa-solid fa-phone-slash" style="color:#EF4444; margin-right:4px;"></i>'
                    : '<i class="fa-solid fa-circle-exclamation" style="color:var(--goldleaf); margin-right:4px;"></i>';
                const hasRep = inc.replacement_member && inc.replacement_member !== "Không thay thế" && inc.replacement_member !== "none" && inc.replacement_member !== "no_replacement" && inc.replacement_member !== "";
                const repBadge = hasRep
                    ? ` • Người thay thế: <strong style="color:var(--patina-lt);"><i class="fa-solid fa-user-shield"></i> ${esc(inc.replacement_member)}</strong>`
                    : (isUnreach ? ` • <span style="color:#F87171; font-weight:600;"><i class="fa-solid fa-clock"></i> Chờ Admin gán người</span>` : "");

                histHtml += `
                    <div style="background: ${bgCol}; border: 1px solid ${borderCol}; border-left: 3px solid ${borderCol}; border-radius: 6px; padding: 8px 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div>
                            ${iconTag}
                            <span class="mk-num" style="color:var(--ink-dim); font-size:11.5px; margin-right:6px;">${esc(inc.timestamp || "")}</span>
                            <strong style="color:var(--ink-hi);">${esc(inc.absent_member || "Nhân sự")}</strong>:
                            <span style="color:var(--cinnabar-lt); font-weight:600;"> ${esc(inc.status_type || "")}</span>
                            ${repBadge}
                            <span style="color:var(--ink-dim); font-size:11px; margin-left:6px;">(${esc(inc.note || "-")})</span>
                        </div>
                    </div>
                `;
            });
            histList.innerHTML = histHtml;
        } else {
            histSection.style.display = "none";
            histList.innerHTML = "";
        }
    }

    const sellerSel = document.getElementById("livePOSSelectSeller");
    if (sellerSel) {
        let sellerOpts = "";
        allMembersInShift.forEach((m) => {
            if (!m) return;
            const mName = m.name || m.member_id;
            const isLeader = shift.shift_leader === mName;
            sellerOpts += `<option value="${esc(mName)}" ${isLeader ? "selected" : ""}>${isLeader ? "⭐ " : ""}${esc(mName)} (${esc(m.department || "")})</option>`;
        });
        sellerSel.innerHTML =
            sellerOpts || '<option value="Ban Quản Trị">Ban Quản Trị</option>';
    }

    renderLivePOSProductGrid();
    renderLiveShiftSalesTable(shiftId);
    renderShiftAuditTable(shiftId);
}

window.setLocalAttendanceStatus = function (memberId, status) {
    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            unreachable: false,
            isBackupActivated: false,
            replacedAbsentMemberId: "",
            replacedAbsentMemberName: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].status = status || null;
    localAttendanceState[memberId].isModified = true;

    // Clear replacement if status is not absent
    const isAbsent =
        status === "Vắng không phép" ||
        status === "Vắng đột xuất" ||
        status === "Xin nghỉ trước" ||
        status === "Vắng mặt";

    if (!isAbsent) {
        localAttendanceState[memberId].replacementId = "";
    } else {
        if (!localAttendanceState[memberId].replacementId) {
            localAttendanceState[memberId].replacementId = "no_replacement";
        }
    }
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.toggleLocalUnreachableBackup = function (memberId) {
    const shift = (globalScheduleData?.assigned_shifts || []).find(
        (s) => s.shift_id === currentSelectedLiveShiftId,
    );
    const m = shift?.assigned_members?.find((mem) => mem.member_id === memberId);
    const mName = m ? m.name : memberId;

    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            unreachable: false,
            isBackupActivated: false,
            replacedAbsentMemberId: "",
            replacedAbsentMemberName: "",
            isModified: false,
        };
    }

    const isCurrentlyUnreach = localAttendanceState[memberId].unreachable || localAttendanceState[memberId].status === "Không gọi được dự phòng";

    if (isCurrentlyUnreach) {
        localAttendanceState[memberId].unreachable = false;
        localAttendanceState[memberId].status = null;
        localAttendanceState[memberId].isModified = true;
        renderLiveShiftDetails(currentSelectedLiveShiftId);
        showToast(`Đã hủy trạng thái không gọi được của ${mName}`, "info");
    } else {
        // Open modal to select absent member needing replacement & confirm report to admin
        openUnreachableBackupModal(memberId, mName);
    }
};

window.cancelBackupActivation = function (memberId) {
    if (localAttendanceState[memberId]) {
        const repAbsentId = localAttendanceState[memberId].replacedAbsentMemberId;
        if (repAbsentId && localAttendanceState[repAbsentId]) {
            if (localAttendanceState[repAbsentId].replacementId === memberId) {
                localAttendanceState[repAbsentId].replacementId = "no_replacement";
            }
        }
        localAttendanceState[memberId].isBackupActivated = false;
        localAttendanceState[memberId].replacedAbsentMemberId = "";
        localAttendanceState[memberId].replacedAbsentMemberName = "";
        localAttendanceState[memberId].status = null;
        localAttendanceState[memberId].isModified = true;
    }
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.setLocalReplacement = async function (memberId, replacementId) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để chỉ định nhân sự thay thế ca trực!");
        return;
    }

    const shift = (globalScheduleData?.assigned_shifts || []).find(
        (s) => s.shift_id === currentSelectedLiveShiftId,
    );
    const m = shift?.assigned_members?.find((mem) => mem.member_id === memberId);
    const mName = m ? m.name : memberId;

    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            unreachable: false,
            isBackupActivated: false,
            replacedAbsentMemberId: "",
            replacedAbsentMemberName: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].replacementId = replacementId;
    localAttendanceState[memberId].isModified = true;
    renderLiveShiftDetails(currentSelectedLiveShiftId);

    // Persist immediately to server so staff accounts get real-time sync
    try {
        const payload = {
            shift_id: currentSelectedLiveShiftId,
            absent_member_id: memberId,
            absent_member: mName,
            replacement_member_id: replacementId === "no_replacement" ? "" : replacementId,
            note: `Admin điều phối người thay thế trực tiếp từ ca trực`,
        };

        const res = await authFetch("/api/contingency/update-replacement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (res.success) {
            showToast("✓ Đã cập nhật người thay thế lên hệ thống! Tài khoản nhân viên sẽ tự động đồng bộ.", "success");
            await loadIncidentLogs();
            await loadCurrentSchedule();
            renderLiveShiftDetails(currentSelectedLiveShiftId);
            if (typeof checkServerUpdates === "function") {
                checkServerUpdates();
            }
        }
    } catch (err) {
        console.error("Lỗi cập nhật người thay thế:", err);
    }
};

window.revealBackupAttendance = function (memberId) {
    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            unreachable: false,
            isBackupActivated: false,
            replacedAbsentMemberId: "",
            replacedAbsentMemberName: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].status = "Có mặt";
    localAttendanceState[memberId].isModified = true;
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.submitLiveAttendanceBatch = async function () {
    if (!currentSelectedLiveShiftId) return;

    const keys = Object.keys(localAttendanceState);
    const modifiedKeys = keys.filter((k) => localAttendanceState[k].isModified);

    if (modifiedKeys.length === 0) {
        alert("Không có thay đổi điểm danh nào để lưu.");
        return;
    }

    const shift = globalScheduleData?.assigned_shifts?.find(
        (s) => s.shift_id === currentSelectedLiveShiftId,
    );

    let summaryText = "Xác nhận cập nhật điểm danh ca trực:\n";
    modifiedKeys.forEach((k) => {
        const mState = localAttendanceState[k];
        if (!mState) return;
        const member = shift?.assigned_members?.find(
            (sm) => sm && sm.member_id === k,
        );
        const mName = member?.name || k;

        if (mState.unreachable || mState.status === "Không gọi được dự phòng") {
            summaryText += `- Dự phòng ${mName}: 🔴 Không gọi được dự phòng (Chờ Admin điều phối)\n`;
        } else if (mState.isBackupActivated) {
            summaryText += `- Dự phòng ${mName} (Tiếp ứng cho ${mState.replacedAbsentMemberName || 'người vắng'}): ${mState.status || "Có mặt"}\n`;
        } else {
            let repName = "Không thay thế";
            if (mState.replacementId && mState.replacementId !== "no_replacement") {
                const repObj =
                    (currentShiftCandidates || []).find(
                        (c) => c && c.member_id === mState.replacementId,
                    ) ||
                    shift?.assigned_members?.find(
                        (sm) => sm && sm.member_id === mState.replacementId,
                    ) ||
                    (globalScheduleData?.member_stats || []).find(
                        (ms) => ms && ms.member_id === mState.replacementId,
                    );
                if (repObj && repObj.name) repName = repObj.name;
            }

            summaryText += `- ${mName}: ${mState.status || "Chưa điểm danh"} (Thay thế: ${repName})\n`;
        }
    });

    openConfirmModal({
        title: "Xác Nhận Lưu Điểm Danh & Backup",
        message: summaryText,
        confirmBtnText: "Lưu Hệ Thống",
        onConfirm: async () => {
            try {
                const btn = document.getElementById("btnConfirmLiveAttendance");
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...`;
                }

                // Submit sequentially to prevent any race conditions in server-side persist
                for (const k of modifiedKeys) {
                    const mState = localAttendanceState[k];
                    if (!mState) continue;
                    const member = shift?.assigned_members?.find((sm) => sm && sm.member_id === k);
                    const mName = member?.name || k;

                    let payload;
                    if (mState.unreachable || mState.status === "Không gọi được dự phòng") {
                        payload = {
                            shift_id: currentSelectedLiveShiftId,
                            absent_member_id: k,
                            replacement_member_id: "",
                            status_type: "Vắng mặt (Không gọi được dự phòng)",
                            note: `Không liên lạc được nhân sự dự phòng ${mName}, chờ Admin điều phối`,
                        };
                    } else if (mState.isBackupActivated) {
                        payload = {
                            shift_id: currentSelectedLiveShiftId,
                            absent_member_id: mState.replacedAbsentMemberId || k,
                            replacement_member_id: k,
                            status_type: mState.status || "Có mặt",
                            note: `Dự phòng tiếp ứng ca trực (Thay cho ${mState.replacedAbsentMemberName || 'thành viên vắng'}): ${mState.status || "Có mặt"}`,
                        };
                    } else {
                        payload = {
                            shift_id: currentSelectedLiveShiftId,
                            absent_member_id: k,
                            status_type: mState.status || "Có mặt",
                            note: `Điểm danh ca-live: ${mState.status || "Có mặt"}`,
                        };

                        if (
                            mState.replacementId &&
                            mState.replacementId !== "no_replacement"
                        ) {
                            payload.replacement_member_id = mState.replacementId;
                        }
                    }

                    const res = await authFetch("/api/contingency/log-incident", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    }).then((r) => r.json());

                    if (!res.success) {
                        console.error(
                            "Lỗi khi ghi nhận thành viên",
                            k,
                            res.message,
                        );
                    }
                }

                await loadIncidentLogs();
                await loadCurrentSchedule(); // Reloads and invokes populateUI -> triggers populateLiveShiftDropdown -> loadLiveShiftDetailsAndCandidates

                // Sau khi đã nhấn "lưu điểm danh" thì đặt lại trạng thái form
                localAttendanceState = {};
                renderLiveShiftDetails(currentSelectedLiveShiftId);

                showToast("✓ Đã lưu điểm danh thành công! Đã đặt lại trạng thái form.", "success");
            } catch (e) {
                console.error("Lỗi kết nối điểm danh:", e);
                alert(
                    "Có lỗi xảy ra trong quá trình ghi nhận điểm danh: " +
                        e.message,
                );
            } finally {
                const btn = document.getElementById("btnConfirmLiveAttendance");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Lưu Điểm Danh`;
                }
            }
        },
    });
};

window.resetLiveAttendanceState = function () {
    localAttendanceState = {};
    if (currentSelectedLiveShiftId) {
        renderLiveShiftDetails(currentSelectedLiveShiftId);
    }
    showToast("✓ Đã đặt lại các thay đổi điểm danh chưa lưu!", "info");
};

/* ==========================================================================
   BACKUP STAFF ACTIONS & ADMIN REPLACEMENT DISPATCH MODALS
   ========================================================================== */

let currentBackupTarget = null;
let currentUnreachableTarget = null;
let currentAdminAssignTarget = null;
let adminAssignAllCandidates = [];

// 1. Modal: Gọi Nhân Sự Dự Phòng Trong Ca
window.openCallBackupModal = function (backupMemberId, backupName, backupPhone, backupDept) {
    currentBackupTarget = {
        member_id: backupMemberId,
        name: backupName,
        phone: backupPhone,
        department: backupDept,
    };

    const modal = document.getElementById("callBackupModal");
    const nameEl = document.getElementById("callBackupName");
    const infoEl = document.getElementById("callBackupInfo");
    const selectEl = document.getElementById("callBackupAbsentSelect");
    const noteEl = document.getElementById("callBackupNoteInput");

    if (nameEl) nameEl.textContent = backupName;
    if (infoEl) infoEl.textContent = `SĐT: ${backupPhone || "Chưa có"} • Phòng ban: ${backupDept || "Chưa phân ban"}`;
    if (noteEl) noteEl.value = `Đã liên hệ ${backupName} nhận ca tiếp ứng`;

    // Populate absent members from current shift
    if (selectEl) {
        const shift = globalScheduleData?.assigned_shifts?.find(
            (s) => s.shift_id === currentSelectedLiveShiftId,
        );
        let opts = `<option value="">-- Chọn thành viên vắng mặt trong ca --</option>`;

        if (shift && shift.assigned_members) {
            shift.assigned_members.forEach((m) => {
                if (!m || m.member_id === backupMemberId) return; // Do not replace self
                const mName = m.name || m.member_id;
                const mState = localAttendanceState[m.member_id];
                const isMarkedAbsent = mState && (
                    mState.status === "Vắng không phép" ||
                    mState.status === "Vắng đột xuất" ||
                    mState.status === "Xin nghỉ trước" ||
                    mState.status === "Vắng mặt"
                );
                const roleTag = m.role === "Chính" ? " (Chính)" : " (Dự phòng)";
                const absentTag = isMarkedAbsent ? " 🔴 [ĐÃ BÁO VẮNG]" : "";
                opts += `<option value="${esc(m.member_id)}" ${isMarkedAbsent ? "selected" : ""}>${esc(mName)}${roleTag}${absentTag}</option>`;
            });
        }
        selectEl.innerHTML = opts;
    }

    if (modal) modal.style.display = "flex";
};

window.closeCallBackupModal = function () {
    const modal = document.getElementById("callBackupModal");
    if (modal) modal.style.display = "none";
    currentBackupTarget = null;
};

// Confirm Gọi Dự Phòng -> chuyển qua xét lỗi vi phạm và cập nhật localAttendanceState
document.addEventListener("DOMContentLoaded", () => {
    const btnCall = document.getElementById("btnConfirmCallBackup");
    if (btnCall) {
        btnCall.addEventListener("click", () => {
            if (!currentBackupTarget || !currentSelectedLiveShiftId) return;

            const selectEl = document.getElementById("callBackupAbsentSelect");
            const noteEl = document.getElementById("callBackupNoteInput");
            const absentMemberId = selectEl ? selectEl.value : "";
            const note = noteEl ? noteEl.value.trim() : "";

            if (!absentMemberId) {
                alert("Vui lòng chọn thành viên vắng mặt trong ca cần thay thế!");
                return;
            }

            const backupTarget = { ...currentBackupTarget };
            const backupName = backupTarget.name || backupTarget.member_id;

            const shift = globalScheduleData?.assigned_shifts?.find(
                (s) => s.shift_id === currentSelectedLiveShiftId,
            );
            const absentMember = shift?.assigned_members?.find(
                (m) => m && m.member_id === absentMemberId,
            );
            const absentName = absentMember ? (absentMember.name || absentMemberId) : absentMemberId;

            // 1. Mark backup target as activated & present in local state
            if (!localAttendanceState[backupTarget.member_id]) {
                localAttendanceState[backupTarget.member_id] = {
                    status: null,
                    replacementId: "",
                    unreachable: false,
                    isBackupActivated: false,
                    replacedAbsentMemberId: "",
                    replacedAbsentMemberName: "",
                    isModified: false,
                };
            }
            localAttendanceState[backupTarget.member_id].isBackupActivated = true;
            localAttendanceState[backupTarget.member_id].unreachable = false;
            localAttendanceState[backupTarget.member_id].status = "Có mặt";
            localAttendanceState[backupTarget.member_id].replacedAbsentMemberId = absentMemberId;
            localAttendanceState[backupTarget.member_id].replacedAbsentMemberName = absentName;
            localAttendanceState[backupTarget.member_id].isModified = true;

            // 2. Mark absent member as absent with replacement = backupTarget.member_id
            if (!localAttendanceState[absentMemberId]) {
                localAttendanceState[absentMemberId] = {
                    status: null,
                    replacementId: "",
                    unreachable: false,
                    isBackupActivated: false,
                    replacedAbsentMemberId: "",
                    replacedAbsentMemberName: "",
                    isModified: false,
                };
            }
            localAttendanceState[absentMemberId].status = localAttendanceState[absentMemberId].status || "Vắng không phép";
            localAttendanceState[absentMemberId].replacementId = backupTarget.member_id;
            localAttendanceState[absentMemberId].isModified = true;

            closeCallBackupModal();
            showToast(`✓ Đã kích hoạt dự phòng cho ${backupName} (thay thế ${absentName})! Bây giờ bạn có thể điểm danh hoặc xét lỗi vi phạm cho nhân sự này.`, "success");
            renderLiveShiftDetails(currentSelectedLiveShiftId);
        });
    }

    const btnConfirmUnreachable = document.getElementById("btnConfirmUnreachableBackup");
    if (btnConfirmUnreachable) {
        btnConfirmUnreachable.addEventListener("click", async () => {
            if (!currentUnreachableTarget || !currentSelectedLiveShiftId) return;

            const selectEl = document.getElementById("unreachableBackupAbsentSelect");
            const absentMemberId = selectEl ? selectEl.value : "";

            if (!absentMemberId) {
                alert("Vui lòng chọn thành viên đang vắng mặt cần người thay thế!");
                return;
            }

            const absentMember = (globalMembers || []).find((m) => m && m.member_id === absentMemberId) ||
                globalScheduleData?.assigned_shifts?.find((s) => s && s.shift_id === currentSelectedLiveShiftId)?.assigned_members?.find((m) => m && m.member_id === absentMemberId);
            const absentName = absentMember ? (absentMember.name || absentMemberId) : absentMemberId;
            const targetBackup = { ...currentUnreachableTarget };
            const backupName = targetBackup.name || targetBackup.member_id;

            // Set unreachable state in localAttendanceState
            if (!localAttendanceState[targetBackup.member_id]) {
                localAttendanceState[targetBackup.member_id] = {
                    status: null,
                    replacementId: "",
                    unreachable: false,
                    isBackupActivated: false,
                    replacedAbsentMemberId: "",
                    replacedAbsentMemberName: "",
                    isModified: false,
                };
            }
            localAttendanceState[targetBackup.member_id].unreachable = true;
            localAttendanceState[targetBackup.member_id].status = "Không gọi được dự phòng";
            localAttendanceState[targetBackup.member_id].isBackupActivated = false;
            localAttendanceState[targetBackup.member_id].isModified = true;

            // Ensure absent member is marked absent
            if (!localAttendanceState[absentMemberId]) {
                localAttendanceState[absentMemberId] = {
                    status: null,
                    replacementId: "",
                    unreachable: false,
                    isBackupActivated: false,
                    replacedAbsentMemberId: "",
                    replacedAbsentMemberName: "",
                    isModified: false,
                };
            }
            localAttendanceState[absentMemberId].status = localAttendanceState[absentMemberId].status || "Vắng không phép";
            localAttendanceState[absentMemberId].replacementId = "no_replacement";
            localAttendanceState[absentMemberId].isModified = true;

            const noteVal = document.getElementById("unreachableBackupNoteInput")?.value || "";

            const originalBtnHtml = btnConfirmUnreachable.innerHTML;
            btnConfirmUnreachable.disabled = true;
            btnConfirmUnreachable.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang ghi nhận & báo Admin...';

            try {
                const res = await fetch("/api/contingency/report-unreachable", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        shift_id: currentSelectedLiveShiftId,
                        backup_member_id: targetBackup.member_id,
                        absent_member_id: absentMemberId,
                        note: noteVal || `Trưởng ca báo cáo không liên lạc được dự phòng ${backupName}, chờ Admin điều phối thay thế`,
                    }),
                }).then((r) => r.json());

                closeUnreachableBackupModal();

                if (res.success) {
                    await loadIncidentLogs();
                    await loadCurrentSchedule();
                    renderLiveShiftDetails(currentSelectedLiveShiftId);

                    // HIỆN THÔNG BÁO TRÊN MÀN HÌNH
                    openUnreachableReportAlertModal(
                        currentSelectedLiveShiftId,
                        backupName,
                        absentName,
                    );

                    showToast("🔴 Đã ghi nhận không gọi được dự phòng vào lịch sử ca và gửi cảnh báo đến Quản Trị Viên!", "warning");
                } else {
                    renderLiveShiftDetails(currentSelectedLiveShiftId);
                    showToast("🔴 Đã đánh dấu không gọi được cục bộ. Vui lòng bấm 'Lưu Điểm Danh' để đồng bộ.", "info");
                }
            } catch (err) {
                console.error("Lỗi gửi báo cáo không gọi được:", err);
                closeUnreachableBackupModal();
                renderLiveShiftDetails(currentSelectedLiveShiftId);
                showToast("🔴 Đã đánh dấu không gọi được cục bộ.", "info");
            } finally {
                btnConfirmUnreachable.disabled = false;
                btnConfirmUnreachable.innerHTML = originalBtnHtml;
            }
        });
    }
});

// 2. Modal: Không Gọi Được Dự Phòng
window.openUnreachableBackupModal = function (backupMemberId, backupName) {
    currentUnreachableTarget = {
        member_id: backupMemberId,
        name: backupName,
    };

    const modal = document.getElementById("unreachableBackupModal");
    const nameEl = document.getElementById("unreachableBackupName");
    const selectEl = document.getElementById("unreachableBackupAbsentSelect");
    const noteEl = document.getElementById("unreachableBackupNoteInput");

    if (nameEl) nameEl.textContent = backupName;
    if (noteEl) noteEl.value = `Không liên lạc được nhân sự dự phòng ${backupName} trong ca, chờ Admin điều phối`;

    if (selectEl) {
        const shift = globalScheduleData?.assigned_shifts?.find(
            (s) => s.shift_id === currentSelectedLiveShiftId,
        );
        let opts = `<option value="">-- Chọn thành viên đang vắng mặt --</option>`;

        if (shift && shift.assigned_members) {
            let firstEligibleId = "";
            let hasSelected = false;

            shift.assigned_members.forEach((m) => {
                if (!m || m.member_id === backupMemberId) return;
                const mName = m.name || m.member_id;
                const mState = localAttendanceState[m.member_id];
                const isMarkedAbsent = mState && (
                    mState.status === "Vắng không phép" ||
                    mState.status === "Vắng đột xuất" ||
                    mState.status === "Xin nghỉ trước" ||
                    mState.status === "Vắng mặt"
                );
                if (!firstEligibleId && m.role === "Chính") firstEligibleId = m.member_id;
                const isSelected = isMarkedAbsent;
                if (isSelected) hasSelected = true;
                const roleTag = m.role === "Chính" ? " (Chính)" : " (Dự phòng)";
                const absentTag = isMarkedAbsent ? " 🔴 [ĐÃ BÁO VẮNG]" : "";
                opts += `<option value="${esc(m.member_id)}" ${isSelected ? "selected" : ""}>${esc(mName)}${roleTag}${absentTag}</option>`;
            });

            // If no one was explicitly marked absent yet, auto-select first eligible member
            if (!hasSelected && firstEligibleId) {
                opts = opts.replace(`value="${esc(firstEligibleId)}"`, `value="${esc(firstEligibleId)}" selected`);
            }
        }
        selectEl.innerHTML = opts;
    }

    if (modal) modal.style.display = "flex";
};

window.closeUnreachableBackupModal = function () {
    const modal = document.getElementById("unreachableBackupModal");
    if (modal) modal.style.display = "none";
    currentUnreachableTarget = null;
};

// Modal thông báo trên màn hình xác nhận đã ghi nhận sự cố và báo Admin
window.openUnreachableReportAlertModal = function (shiftId, backupName, absentName) {
    const modal = document.getElementById("unreachableReportAlertModal");
    if (!modal) return;
    const shiftBadge = document.getElementById("unreachableAlertShiftBadge");
    const backupNameEl = document.getElementById("unreachableAlertBackupName");
    const absentNameEl = document.getElementById("unreachableAlertAbsentName");

    const shift = globalScheduleData?.assigned_shifts?.find((s) => s.shift_id === shiftId);
    const shiftInfo = shift ? ` (${shift.day} • ${formatShiftTimeValue(shift)})` : "";

    if (shiftBadge) shiftBadge.textContent = `Ca: ${shiftId}${shiftInfo}`;
    if (backupNameEl) backupNameEl.textContent = backupName || "Nhân sự dự phòng";
    if (absentNameEl) absentNameEl.textContent = absentName || "Thành viên vắng";

    modal.style.display = "flex";
};

window.closeUnreachableReportAlertModal = function () {
    const modal = document.getElementById("unreachableReportAlertModal");
    if (modal) modal.style.display = "none";
};

window.viewShiftHistoryFromAlert = function () {
    closeUnreachableReportAlertModal();
    const tableEl = document.getElementById("lateAbsenceTable");
    if (tableEl) {
        tableEl.scrollIntoView({ behavior: "smooth", block: "center" });
        const firstRow = document.querySelector("#lateAbsenceTableBody tr:first-child");
        if (firstRow) {
            firstRow.style.transition = "all 0.4s ease";
            firstRow.style.backgroundColor = "rgba(239, 68, 68, 0.25)";
            setTimeout(() => {
                firstRow.style.backgroundColor = "";
            }, 3000);
        }
    }
};

// 3. Modal: Quản Trị Viên Gán / Đổi Nhân Sự Thay Thế (Admin Only)
window.openAdminAssignReplacementModal = async function (incidentId, timestamp, shiftId, absentMember, currentRep, statusType, note) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để điều phối nhân sự thay thế!");
        return;
    }

    currentAdminAssignTarget = {
        incident_id: incidentId,
        timestamp: timestamp,
        shift_id: shiftId,
        absent_member: absentMember,
        replacement_member: currentRep,
        status_type: statusType,
        note: note,
    };

    const modal = document.getElementById("adminAssignReplacementModal");
    const infoBadge = document.getElementById("adminAssignShiftInfoBadge");
    const searchInput = document.getElementById("adminAssignSearchInput");
    const noteInput = document.getElementById("adminAssignNoteInput");
    const countEl = document.getElementById("adminAssignCandidateCount");
    const listEl = document.getElementById("adminAssignCandidateList");

    if (searchInput) searchInput.value = "";
    if (noteInput) noteInput.value = note || "";

    if (infoBadge) {
        const hasRep = currentRep && currentRep !== "Không thay thế" && currentRep !== "none" && currentRep !== "no_replacement";
        infoBadge.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <span class="shift-id-tag" style="font-size: 13px;">${esc(shiftId)}</span>
                    <strong style="margin-left: 8px; font-size: 14px; color: var(--ink-hi);">Người vắng: <span style="color: #EF4444;">${esc(absentMember)}</span></strong>
                    <span style="font-size: 12px; color: var(--ink-dim); margin-left: 6px;">(${esc(statusType || "Vắng mặt")})</span>
                </div>
                <div>
                    <span style="font-size: 12px; color: var(--ink-dim);">Người thay hiện tại:</span>
                    <strong style="font-size: 13px; color: ${hasRep ? '#34D399' : '#FCA5A5'}; margin-left: 4px;">
                        ${hasRep ? `<i class="fa-solid fa-user-shield"></i> ${esc(currentRep)}` : 'Chưa có người thay'}
                    </strong>
                </div>
            </div>
        `;
    }

    if (listEl) {
        listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--ink-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách đề xuất ưu tiên...</div>`;
    }

    if (modal) modal.style.display = "flex";

    // Fetch candidate suggestions from API
    try {
        const res = await authFetch(`/api/contingency/suggest?shift_id=${encodeURIComponent(shiftId)}`);
        const data = await res.json();
        adminAssignAllCandidates = data.candidates || [];
        renderAdminAssignCandidates(adminAssignAllCandidates, currentRep);
    } catch (e) {
        console.error("Lỗi tải danh sách ứng viên thay thế:", e);
        if (listEl) listEl.innerHTML = `<div style="color: #EF4444; padding: 12px; text-align: center;">Không thể tải danh sách ứng viên: ${e.message}</div>`;
    }
};

window.closeAdminAssignReplacementModal = function () {
    const modal = document.getElementById("adminAssignReplacementModal");
    if (modal) modal.style.display = "none";
    currentAdminAssignTarget = null;
    adminAssignAllCandidates = [];
};

window.handleAdminAssignSearch = function (kw) {
    const currentRep = currentAdminAssignTarget?.replacement_member;
    renderAdminAssignCandidates(adminAssignAllCandidates, currentRep, kw);
};

window.renderAdminAssignCandidates = function (candidates, currentRep, filterKw = "") {
    const listEl = document.getElementById("adminAssignCandidateList");
    const countEl = document.getElementById("adminAssignCandidateCount");
    if (!listEl) return;

    let filtered = (candidates || []).slice();
    const query = (filterKw || "").trim().toLowerCase();

    if (query) {
        filtered = filtered.filter((c) => {
            const name = (c.name || "").toLowerCase();
            const phone = (c.phone || "").toLowerCase();
            const dept = (c.department || "").toLowerCase();
            const job = (c.job_title || "").toLowerCase();
            const prio = (c.priority_label || "").toLowerCase();
            return name.includes(query) || phone.includes(query) || dept.includes(query) || job.includes(query) || prio.includes(query);
        });
    }

    if (countEl) {
        countEl.textContent = `Hiển thị ${filtered.length} / ${candidates.length} nhân sự`;
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--ink-dim); font-size: 13px;">Không tìm thấy nhân sự phù hợp với từ khóa "${esc(filterKw)}".</div>`;
        return;
    }

    // Categorize according to requested 4 priority tiers:
    // 1. Ứng biến có thời gian rảnh trùng giờ (standby_free)
    // 2. Nhân sự có thời gian rảnh trùng giờ (member_free)
    // 3. Ứng biến còn lại (standby_other)
    // 4. Nhân sự còn lại (other_members)

    const group1 = filtered.filter((c) => c.category === "standby_free" || c.priority === 1);
    const group2 = filtered.filter((c) => c.category === "member_free" || c.priority === 2);
    const group3 = filtered.filter((c) => c.category === "standby_other" || c.priority === 3);
    const group4 = filtered.filter((c) => c.category === "other_members" || c.priority === 4 || (!c.category && c.priority > 3));

    const renderCard = (c) => {
        const isCurrentRep = (c.name === currentRep || c.member_id === currentRep);
        let badgeColor = "#9CA3AF";
        let badgeBg = "rgba(255,255,255,0.06)";
        let badgeBorder = "rgba(255,255,255,0.15)";
        let icon = "fa-user";

        if (c.category === "standby_free" || c.priority === 1) {
            badgeColor = "#34D399";
            badgeBg = "rgba(16,185,129,0.15)";
            badgeBorder = "#059669";
            icon = "fa-star";
        } else if (c.category === "member_free" || c.priority === 2) {
            badgeColor = "#60A5FA";
            badgeBg = "rgba(59,130,246,0.15)";
            badgeBorder = "#2563EB";
            icon = "fa-clock";
        } else if (c.category === "standby_other" || c.priority === 3) {
            badgeColor = "#C084FC";
            badgeBg = "rgba(139,92,246,0.15)";
            badgeBorder = "#7C3AED";
            icon = "fa-shield-halved";
        }

        return `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; border: 1px solid ${isCurrentRep ? '#10B981' : 'var(--rule)'}; background: ${isCurrentRep ? 'rgba(16,185,129,0.08)' : 'var(--lacquer-3)'}; cursor: pointer; transition: all 0.15s ease;" class="admin-rep-candidate-item">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <input type="radio" name="adminRepCandidateRadio" value="${esc(c.member_id)}" ${isCurrentRep ? 'checked' : ''} style="accent-color: #10B981; transform: scale(1.15);" />
                    <div style="min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <strong style="font-size: 13.5px; color: var(--ink-hi);">${esc(c.name)}</strong>
                            ${c.is_standby_pool ? `<span class="tag" style="background: rgba(245,158,11,0.2); color: #FBBF24; border: 1px solid #D97706; font-size: 10.5px; padding: 1px 6px;"><i class="fa-solid fa-bolt"></i> Ứng biến</span>` : ''}
                            <span class="tag" style="background: rgba(255,255,255,0.08); color: var(--ink-light); font-size: 10.5px; padding: 1px 6px;">${esc(c.department || "Chưa phân ban")}</span>
                        </div>
                        <div style="font-size: 11.5px; color: var(--ink-dim); margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span><i class="fa-solid fa-phone" style="color: var(--goldleaf);"></i> ${esc(c.phone || "Không có SĐT")}</span>
                            ${c.job_title ? `<span>&bull; ${esc(c.job_title)}</span>` : ''}
                            ${c.shift_count !== undefined ? `<span>&bull; Đã trực: <strong>${c.shift_count} ca</strong></span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="text-align: right; flex-shrink: 0; margin-left: 10px;">
                    <span class="tag" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-weight: 700; font-size: 11px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fa-solid ${icon}"></i> ${esc(c.priority_label || "Đề xuất")}
                    </span>
                </div>
            </label>
        `;
    };

    let html = "";

    if (group1.length > 0) {
        html += `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 700; color: #34D399; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-star" style="color: #F59E0B;"></i> 1. Đội Ứng Biến - Có Lịch Rảnh Trùng Giờ (${group1.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${group1.map(renderCard).join("")}
                </div>
            </div>
        `;
    }

    if (group2.length > 0) {
        html += `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 700; color: #60A5FA; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-clock" style="color: #60A5FA;"></i> 2. Nhân Sự Thường - Có Lịch Rảnh Trùng Giờ (${group2.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${group2.map(renderCard).join("")}
                </div>
            </div>
        `;
    }

    if (group3.length > 0) {
        html += `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 700; color: #C084FC; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-shield-halved" style="color: #C084FC;"></i> 3. Đội Ứng Biến Còn Lại (${group3.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${group3.map(renderCard).join("")}
                </div>
            </div>
        `;
    }

    if (group4.length > 0) {
        html += `
            <div style="margin-bottom: 8px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--ink-dim); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-users" style="color: var(--ink-dim);"></i> 4. Toàn Bộ Nhân Sự Còn Lại (${group4.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${group4.map(renderCard).join("")}
                </div>
            </div>
        `;
    }

    listEl.innerHTML = html;
};

// Admin Submit Assignment
window.submitAdminAssignReplacement = async function () {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để gán nhân sự thay thế!");
        return;
    }
    if (!currentAdminAssignTarget) return;

    const checkedRadio = document.querySelector('input[name="adminRepCandidateRadio"]:checked');
    if (!checkedRadio) {
        alert("Vui lòng chọn một nhân sự thay thế từ danh sách hoặc bấm 'Hủy Người Thay' nếu không cần người tiếp ứng!");
        return;
    }

    const repMemberId = checkedRadio.value;
    const noteInput = document.getElementById("adminAssignNoteInput");
    const note = noteInput ? noteInput.value.trim() : "";
    const btn = document.getElementById("btnConfirmAdminAssign");

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gán...`;
        }

        const payload = {
            incident_id: currentAdminAssignTarget.incident_id || undefined,
            timestamp: currentAdminAssignTarget.timestamp || undefined,
            shift_id: currentAdminAssignTarget.shift_id || undefined,
            absent_member: currentAdminAssignTarget.absent_member || undefined,
            replacement_member_id: repMemberId,
            note: note || `Admin điều phối người thay thế: ${repMemberId}`,
        };

        const res = await authFetch("/api/contingency/update-replacement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (res.success) {
            showToast("✓ Đã cập nhật nhân sự thay thế thành công!", "success");
            closeAdminAssignReplacementModal();
            await loadIncidentLogs();
            await loadCurrentSchedule();
        } else {
            alert("Lỗi cập nhật: " + (res.message || "Không thể gán nhân sự thay thế"));
        }
    } catch (e) {
        console.error("Lỗi cập nhật nhân sự thay thế:", e);
        alert("Lỗi kết nối: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Xác Nhận Gán Người Thay Thế`;
        }
    }
};

window.setAdminAssignReplacementNone = async function () {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để hủy nhân sự thay thế!");
        return;
    }
    if (!currentAdminAssignTarget) return;

    openConfirmModal({
        title: "Xác Nhận Hủy Người Thay Thế",
        message: `Bạn có chắc muốn hủy người thay thế cho "${currentAdminAssignTarget.absent_member}" tại Ca ${currentAdminAssignTarget.shift_id}?`,
        confirmBtnText: "Hủy Người Thay",
        onConfirm: async () => {
            try {
                const payload = {
                    incident_id: currentAdminAssignTarget.incident_id || undefined,
                    timestamp: currentAdminAssignTarget.timestamp || undefined,
                    shift_id: currentAdminAssignTarget.shift_id || undefined,
                    absent_member: currentAdminAssignTarget.absent_member || undefined,
                    replacement_member_id: "",
                    note: "Admin hủy người thay thế",
                };

                const res = await authFetch("/api/contingency/update-replacement", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }).then((r) => r.json());

                if (res.success) {
                    showToast("✓ Đã hủy người thay thế cho ca trực này!", "success");
                    closeAdminAssignReplacementModal();
                    await loadIncidentLogs();
                    await loadCurrentSchedule();
                } else {
                    alert("Lỗi: " + (res.message || "Không thể hủy người thay thế"));
                }
            } catch (e) {
                console.error("Lỗi hủy người thay:", e);
                alert("Lỗi kết nối: " + e.message);
            }
        },
    });
};

/* ==========================================================================
   ADMIN SHIFT MEMBER MANAGEMENT (THÊM NGƯỜI VÀO CA)
   ========================================================================== */

window.openAddMemberToShiftModal = function () {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để thêm người vào ca!");
        return;
    }

    if (!currentSelectedLiveShiftId || !globalScheduleData) {
        showToast("Vui lòng chọn ca trực trước khi thêm người vào ca!", "warning");
        return;
    }

    const shift = (globalScheduleData.assigned_shifts || []).find(
        (s) => s.shift_id === currentSelectedLiveShiftId,
    );
    if (!shift) {
        showToast("Không tìm thấy dữ liệu ca trực đang chọn!", "error");
        return;
    }

    const modal = document.getElementById("addMemberToShiftModal");
    const infoBadge = document.getElementById("addMemberShiftInfoBadge");
    const searchInp = document.getElementById("addMemberSearchInput");
    const posInp = document.getElementById("addMemberPositionInput");
    const leaderChk = document.getElementById("addMemberAsLeaderCheckbox");

    if (searchInp) searchInp.value = "";
    if (posInp) posInp.value = "Bán hàng F&B";
    if (leaderChk) leaderChk.checked = false;

    // Default role: Chính
    const defaultRadio = document.querySelector('input[name="addMemberRoleRadio"][value="Chính"]');
    if (defaultRadio) defaultRadio.checked = true;

    if (infoBadge) {
        const timeLabel = formatShiftTimeValue(shift);
        const loc = shift.location || (shift.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
        const leader = shift.shift_leader || "Chưa chỉ định";
        infoBadge.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <span class="shift-id-tag" style="font-size: 13px; font-weight: 700;">${esc(shift.shift_id)}</span>
                    <strong style="margin-left: 8px; color: var(--ink-hi);">${esc(shift.day)} • ${esc(timeLabel)}</strong>
                    <span style="color: var(--ink-dim); margin-left: 6px;">[${esc(loc)}]</span>
                </div>
                <div style="font-size: 12px; color: var(--ink-light);">
                    Hiện có: <strong style="color: #60A5FA;">${shift.assigned_count || 0}/${shift.required_count || 0}</strong> nhân sự
                    • Trưởng ca: <strong style="color: #FBBF24;">${esc(leader)}</strong>
                </div>
            </div>
        `;
    }

    populateAddMemberDropdown("");

    if (modal) modal.style.display = "flex";
};

window.closeAddMemberToShiftModal = function () {
    const modal = document.getElementById("addMemberToShiftModal");
    if (modal) modal.style.display = "none";
};

window.filterAddMemberDropdown = function (query) {
    populateAddMemberDropdown(query);
};

function populateAddMemberDropdown(query) {
    const selectEl = document.getElementById("addMemberSelect");
    if (!selectEl) return;

    const q = (query || "").toLowerCase().trim();
    const shift = (globalScheduleData?.assigned_shifts || []).find(
        (s) => s.shift_id === currentSelectedLiveShiftId,
    );
    const assignedIds = new Set((shift?.assigned_members || []).map((m) => m.member_id));

    let html = `<option value="">-- Chọn nhân sự từ danh sách --</option>`;

    const members = (globalMembers || []).filter((m) => {
        if (!q) return true;
        return (
            (m.name || "").toLowerCase().includes(q) ||
            (m.phone || "").toLowerCase().includes(q) ||
            (m.department || "").toLowerCase().includes(q) ||
            (m.member_id || "").toLowerCase().includes(q)
        );
    });

    if (members.length === 0) {
        html += `<option value="" disabled>Không tìm thấy nhân sự nào khớp bộ lọc</option>`;
    } else {
        // Sort so unassigned in this shift appear first
        const sorted = [...members].sort((a, b) => {
            const aIn = assignedIds.has(a.member_id) ? 1 : 0;
            const bIn = assignedIds.has(b.member_id) ? 1 : 0;
            if (aIn !== bIn) return aIn - bIn;
            return (a.name || "").localeCompare(b.name || "");
        });

        sorted.forEach((m) => {
            const isAssigned = assignedIds.has(m.member_id);
            const statusLabel = isAssigned ? " [ĐÃ CÓ TRONG CA]" : "";
            const dept = m.department ? ` - ${m.department}` : "";
            const phone = m.phone ? ` (${m.phone})` : "";
            html += `<option value="${esc(m.member_id)}" ${isAssigned ? 'style="color: var(--ink-dim);"' : ""}>${esc(m.name)}${phone}${dept}${statusLabel}</option>`;
        });
    }

    selectEl.innerHTML = html;
}

window.submitAddMemberToShift = async function () {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để thêm người vào ca!");
        return;
    }

    const selectEl = document.getElementById("addMemberSelect");
    const memberId = selectEl ? selectEl.value : "";
    if (!memberId) {
        alert("Vui lòng chọn một nhân sự từ danh sách để thêm vào ca!");
        return;
    }

    const roleRadio = document.querySelector('input[name="addMemberRoleRadio"]:checked');
    const role = roleRadio ? roleRadio.value : "Chính";
    const posInput = document.getElementById("addMemberPositionInput");
    const position = posInput ? posInput.value.trim() : "";
    const leaderChk = document.getElementById("addMemberAsLeaderCheckbox");
    const setAsLeader = leaderChk ? leaderChk.checked : false;

    const btn = document.getElementById("btnConfirmAddMemberToShift");

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang thêm...`;
        }

        const payload = {
            shift_id: currentSelectedLiveShiftId,
            member_id: memberId,
            role: role,
            position_role: position || (role === "Chính" ? "Bán hàng F&B" : "⚡ Dự bị tiếp ứng"),
            set_as_leader: setAsLeader,
        };

        const res = await authFetch("/api/shift/add-member", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }).then((r) => r.json());

        if (res.success) {
            showToast("✓ " + (res.message || "Đã thêm nhân sự vào ca thành công!"), "success");
            closeAddMemberToShiftModal();
            await loadCurrentSchedule();
            renderLiveShiftDetails(currentSelectedLiveShiftId);
            renderDutyBoard();
            renderMemberTable();
        } else {
            alert("Lỗi thêm nhân sự: " + (res.message || "Thao tác không thành công"));
        }
    } catch (e) {
        console.error("Lỗi thêm nhân sự vào ca:", e);
        alert("Lỗi kết nối: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Xác Nhận Thêm Vào Ca`;
        }
    }
};

/* ==========================================================================
   REAL-TIME NOTIFICATION & CONTINGENCY DISPATCH SYSTEM
   ========================================================================== */

let lastKnownScheduleVersion = 1;
let realtimeSyncInterval = null;
const activeUrgentToastIds = new Set();

function startRealtimeSync() {
    if (realtimeSyncInterval) clearInterval(realtimeSyncInterval);
    // Poll every 2.5 seconds for instant response
    realtimeSyncInterval = setInterval(checkServerUpdates, 2500);
}

async function checkServerUpdates() {
    try {
        const res = await fetch(`/api/notifications?role=${currentUserRole}&since_version=${lastKnownScheduleVersion}`).then((r) => r.json());
        if (!res || !res.success) return;

        // Auto sync schedule updates to staff & admin views
        if (res.has_new_version) {
            const oldVersion = lastKnownScheduleVersion;
            lastKnownScheduleVersion = res.schedule_version;

            // Notify staff members when admin makes contingency updates
            if (oldVersion > 1 && currentUserRole !== "admin") {
                showToast("ℹ️ Quản trị viên vừa cập nhật ca trực / nhân sự thay thế!", "info");
            }

            await loadIncidentLogs();
            await loadCurrentSchedule();
            if (currentSelectedLiveShiftId) {
                renderLiveShiftDetails(currentSelectedLiveShiftId);
            }
        }

        // Manage urgent notifications for Admin
        if (currentUserRole === "admin" && res.notifications) {
            const urgentUnresolved = res.notifications.filter(
                (n) => n.type === "UNREACHABLE_BACKUP" && !n.resolved
            );

            // Trigger urgent toast alerts for new unreachable backup events
            urgentUnresolved.forEach((notif) => {
                showUrgentAdminToast(notif);
            });

            // Clean up any resolved toasts
            const currentIds = new Set(urgentUnresolved.map((n) => n.id));
            activeUrgentToastIds.forEach((id) => {
                if (!currentIds.has(id)) {
                    dismissUrgentToast(id);
                }
            });

            // Update top urgent dispatch banner in Contingency tab
            updateUrgentDispatchAlertBanner(urgentUnresolved);
        } else {
            const banner = document.getElementById("urgentDispatchAlertBanner");
            if (banner) banner.style.display = "none";
        }
    } catch (err) {
        // Silently tolerate transient connection loss
    }
}

function showUrgentAdminToast(notif) {
    if (!notif || !notif.id) return;
    if (activeUrgentToastIds.has(notif.id)) return;
    activeUrgentToastIds.add(notif.id);

    let container = document.getElementById("urgentToastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "urgentToastContainer";
        container.style.cssText = "position: fixed; top: 72px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 12px; pointer-events: none;";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.id = `urgent_toast_${notif.id}`;
    toast.style.cssText = `
        background: linear-gradient(135deg, #1e131d 0%, #3b111a 100%);
        border: 2px solid #EF4444;
        box-shadow: 0 10px 25px rgba(239, 68, 68, 0.45), 0 0 15px rgba(220, 38, 38, 0.3);
        border-radius: 10px;
        padding: 14px 18px;
        color: #FFFFFF;
        max-width: 420px;
        pointer-events: auto;
        animation: fadeIn 0.3s ease-out;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    const absentStr = notif.absent_member_name || "thành viên vắng";
    const backupStr = notif.backup_member_name || "dự phòng";

    toast.innerHTML = `
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🚨</span>
                <strong style="color: #F87171; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.5px;">CẦN ĐIỀU PHỐI GẤP (TRƯỞNG CA BÁO CÁO)</strong>
            </div>
            <button type="button" onclick="dismissUrgentToast('${esc(notif.id)}')" style="background: none; border: none; color: #9CA3AF; cursor: pointer; font-size: 16px; padding: 2px 6px;" title="Đóng thông báo">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div style="font-size: 13px; line-height: 1.45; color: #F3F4F6;">
            <strong>Ca ${esc(notif.shift_id)}:</strong> Trưởng ca báo cáo <strong style="color: #FCA5A5;">không gọi được</strong> dự phòng <span style="text-decoration: underline; color: #FCA5A5;">${esc(backupStr)}</span> để thay thế cho <strong>${esc(absentStr)}</strong>.
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
            <button type="button" class="btn-primary" onclick="openUrgentDispatchForShift('${esc(notif.shift_id)}', '${esc(absentStr)}', '${esc(notif.absent_member_id || '')}', '${esc(notif.id)}')" style="background: #DC2626; border-color: #B91C1C; font-size: 12.5px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-people-arrows"></i> Chỉ Định Thay Thế Ngay
            </button>
        </div>
    `;

    container.appendChild(toast);
}

window.dismissUrgentToast = function (notifId) {
    activeUrgentToastIds.delete(notifId);
    const el = document.getElementById(`urgent_toast_${notifId}`);
    if (el) {
        el.style.opacity = "0";
        el.style.transform = "translateY(-10px)";
        el.style.transition = "all 0.25s ease";
        setTimeout(() => el.remove(), 250);
    }
};

window.openUrgentDispatchForShift = function (shiftId, absentMemberName, absentMemberId, notifId) {
    if (notifId) dismissUrgentToast(notifId);

    // Switch to contingency tab
    const tabBtn = document.querySelector('.nav-item[data-tab="tab-contingency"]');
    if (tabBtn) tabBtn.click();

    // Select the shift in liveShiftSelect
    const select = document.getElementById("liveShiftSelect");
    if (select && shiftId) {
        select.value = shiftId;
        select.dispatchEvent(new Event("change"));
    }

    // Open Admin Replacement Modal directly
    setTimeout(() => {
        openAdminAssignReplacementModal(
            null,
            null,
            shiftId,
            absentMemberName || "Thành viên vắng",
            null,
            "Không gọi được dự phòng",
            "Admin điều phối khẩn cấp sau báo cáo của trưởng ca"
        );
    }, 200);
};

function updateUrgentDispatchAlertBanner(urgentList) {
    const banner = document.getElementById("urgentDispatchAlertBanner");
    if (!banner) return;

    if (!urgentList || urgentList.length === 0) {
        banner.style.display = "none";
        banner.innerHTML = "";
        return;
    }

    const itemsHtml = urgentList
        .map(
            (n) => `
        <div style="background: rgba(220, 38, 38, 0.2); border: 1px solid #DC2626; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #EF4444; font-size: 18px;"></i>
                <div>
                    <strong style="color: #FEE2E2; font-size: 13.5px;">Ca ${esc(n.shift_id)}:</strong>
                    <span style="color: #FCA5A5; font-size: 13px; margin-left: 4px;">Trưởng ca báo cáo không gọi được dự phòng <strong>${esc(n.backup_member_name || "dự phòng")}</strong> cho <strong>${esc(n.absent_member_name || "thành viên vắng")}</strong>.</span>
                </div>
            </div>
            <button class="btn-primary" onclick="openUrgentDispatchForShift('${esc(n.shift_id)}', '${esc(n.absent_member_name || '')}', '${esc(n.absent_member_id || '')}', '${esc(n.id)}')" style="background: #DC2626; border-color: #B91C1C; height: 34px; padding: 0 14px; font-size: 12px; font-weight: 700; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                <i class="fa-solid fa-people-arrows"></i> Chỉ Định Thay Thế Ngay
            </button>
        </div>
    `
        )
        .join("");

    banner.innerHTML = `
        <div class="glass-card" style="border: 1.5px solid #EF4444; background: rgba(30, 10, 15, 0.9); box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3); padding: 14px 18px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                <span style="font-size: 18px;">🚨</span>
                <strong style="color: #F87171; font-size: 14px; text-transform: uppercase;">Yêu Cầu Điều Phối Nhân Sự Thay Thế Khẩn Cấp (${urgentList.length})</strong>
            </div>
            ${itemsHtml}
        </div>
    `;
    banner.style.display = "block";
}

function renderLivePOSProductGrid() {
    const grid = document.getElementById("livePOSProductGrid");
    const quickSel = document.getElementById("livePOSQuickSelect");
    if (!grid) return;
    const products = globalInventoryData?.products || [];

    // Populate quick select dropdown
    if (quickSel) {
        let opts = '<option value="">-- Chọn nhanh sản phẩm từ kho --</option>';
        products.forEach((p) => {
            const stock =
                p.current_stock !== undefined
                    ? p.current_stock
                    : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
            const isOutOfStock = stock <= 0;
            opts += `<option value="${p.id}" ${isOutOfStock ? "disabled" : ""}>${esc(p.name)} - ${formatVND(p.price)} (Tồn: ${stock} ${p.unit})</option>`;
        });
        quickSel.innerHTML = opts;
    }

    if (!products.length) {
        grid.innerHTML =
            '<div style="grid-column: 1/-1; color: var(--ink-dim); font-size: 13px; padding: 12px; text-align: center;">Kho sản phẩm chưa có dữ liệu. Hãy thêm sản phẩm ở tab Kho Hàng.</div>';
        return;
    }

    let html = "";
    products.forEach((p) => {
        const stock =
            p.current_stock !== undefined
                ? p.current_stock
                : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
        const isOutOfStock = stock <= 0;
        html += `
            <div style="background: var(--lacquer-3); border: 1px solid var(--rule); border-radius: 8px; padding: 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);">
                <div>
                    <strong style="font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-hi);" title="${esc(p.name)}">${esc(p.name)}</strong>
                    <span style="font-size: 13px; color: var(--goldleaf); font-weight: 700; display: block; margin: 4px 0;">${formatVND(p.price)}</span>
                    <span style="font-size: 11px; color: ${isOutOfStock ? "#F87171" : "#16A34A"}; display: block; margin-bottom: 8px; font-weight: 500;">Tồn: ${stock} ${p.unit}</span>
                </div>
                <button type="button" class="btn-action-sm btn-action-edit" onclick="addToLiveCart('${p.id}')" ${isOutOfStock ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ""} style="width: 100%; font-size: 12px; padding: 5px 0; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: var(--lacquer-4); color: var(--ink-hi); border: 1px solid var(--rule);">
                    <i class="fa-solid fa-plus"></i> ${isOutOfStock ? "Hết hàng" : "Thêm vào giỏ"}
                </button>
            </div>
        `;
    });
    grid.innerHTML = html;
}

window.addToLiveCart = function (prodId) {
    if (!prodId) return;
    const products = globalInventoryData?.products || [];
    const p = products.find((item) => item.id === prodId);
    if (!p) return;

    const stock =
        p.current_stock !== undefined
            ? p.current_stock
            : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
    if (stock <= 0) {
        alert(`Sản phẩm '${p.name}' đã hết hàng trong kho!`);
        return;
    }

    if (!liveCart[prodId]) {
        liveCart[prodId] = { product: p, quantity: 1 };
    } else {
        if (liveCart[prodId].quantity < stock) {
            liveCart[prodId].quantity += 1;
        } else {
            alert(
                `Đã đạt giới hạn tồn kho tối đa (${stock} ${p.unit}) của sản phẩm ${p.name}`,
            );
        }
    }
    renderLiveCart();
};

window.updateLiveCartQty = function (prodId, delta) {
    if (!liveCart[prodId]) return;
    const p = liveCart[prodId].product;
    const stock =
        p.current_stock !== undefined
            ? p.current_stock
            : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
    const newQty = liveCart[prodId].quantity + delta;

    if (delta > 0 && newQty > stock) {
        alert(
            `Không thể tăng quá số lượng tồn kho hiện có (${stock} ${p.unit})!`,
        );
        return;
    }

    liveCart[prodId].quantity = newQty;
    if (liveCart[prodId].quantity <= 0) {
        delete liveCart[prodId];
    }
    renderLiveCart();
};

function renderLiveCart() {
    const tbody = document.getElementById("liveCartTbody");
    const totalEl = document.getElementById("liveCartTotal");
    const totalItemsEl = document.getElementById("liveCartTotalItems");
    if (!tbody) return;

    const keys = Object.keys(liveCart);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--ink-dim); padding: 12px;">Giỏ hàng trống. Chọn sản phẩm ở trên để thêm.</td></tr>`;
        if (totalEl) totalEl.textContent = "0 ₫";
        if (totalItemsEl) totalItemsEl.textContent = "(0 món)";
        return;
    }

    let grandTotal = 0;
    let totalQty = 0;
    let html = "";
    keys.forEach((id) => {
        const item = liveCart[id];
        const lineTotal = item.product.price * item.quantity;
        grandTotal += lineTotal;
        totalQty += item.quantity;

        html += `
            <tr>
                <td style="padding: 6px 4px; color: var(--ink-hi); font-weight: 500;">${esc(item.product.name)}</td>
                <td style="padding: 6px 4px; text-align: center;">
                    <button class="btn-action-sm" onclick="updateLiveCartQty('${id}', -1)" style="padding: 0 5px;">-</button>
                    <span style="margin: 0 4px; font-weight: 700; color: var(--ink-hi);">${item.quantity}</span>
                    <button class="btn-action-sm" onclick="updateLiveCartQty('${id}', 1)" style="padding: 0 5px;">+</button>
                </td>
                <td style="padding: 6px 4px; text-align: right; color: var(--ink-dim);">${formatVND(item.product.price)}</td>
                <td style="padding: 6px 4px; text-align: right; color: var(--goldleaf); font-weight: 600;">${formatVND(lineTotal)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (totalEl) totalEl.textContent = formatVND(grandTotal);
    if (totalItemsEl) totalItemsEl.textContent = `(${totalQty} món)`;
}


function renderLiveShiftSalesTable(shiftId) {
    const tbody = document.getElementById("liveShiftSalesTableBody");
    const summaryEl = document.getElementById("liveShiftRevSummary");
    if (!tbody) return;

    const allSales = globalInventoryData?.sales_logs || [];
    const shiftSales = allSales.filter((l) =>
        (l.channel || "").includes(shiftId),
    );

    const totalRev = shiftSales.reduce(
        (acc, l) => acc + (l.refunded ? 0 : l.total_amount || 0),
        0,
    );
    if (summaryEl)
        summaryEl.textContent = `${formatVND(totalRev)} ca ${shiftId}`;

    if (shiftSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Chưa có giao dịch bán hàng nào trong ca ${shiftId}.</td></tr>`;
        return;
    }

    let html = "";
    shiftSales.forEach((l) => {
        const isRefunded = l.refunded === true;
        const rowStyle = isRefunded
            ? 'style="opacity: 0.5; text-decoration: line-through;"'
            : "";
        const refundStatus = isRefunded
            ? `<div style="color: #ef4444; font-size: 10px; font-weight: 600; margin-top:2px;"><i class="fa-solid fa-ban"></i> Đã hủy</div>`
            : "";
        const actionBtn = isRefunded
            ? `<span style="color: var(--ink-dim); font-size: 11px;"><i class="fa-solid fa-ban"></i> Đã hủy</span>`
            : `
            <button type="button" class="btn-action-sm btn-action-delete" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 3px 8px; font-size: 11px;" onclick="refundTransaction('${l.id}')" title="Hủy giao dịch">
                <i class="fa-solid fa-rotate-left"></i> Hủy
            </button>
        `;

        const custName = l.customer_name || "";
        const custPhone = l.customer_phone || "";
        const payMethod = l.payment_method || "Tiền mặt";

        const payBadge = payMethod === "Chuyển khoản"
            ? `<span class="tag-payment-transfer"><i class="fa-solid fa-credit-card"></i> CK</span>`
            : `<span class="tag-payment-cash"><i class="fa-solid fa-money-bill-wave"></i> Tiền mặt</span>`;

        const custInfo = (custName || custPhone)
            ? `<div><strong>${esc(custName || "Vãng lai")}</strong>${custPhone ? `<div style="font-size:11px; color:var(--ink-dim);">${esc(custPhone)}</div>` : ''}<div style="margin-top:2px;">${payBadge}</div></div>`
            : `<div><span style="color:var(--ink-dim); font-size:12px;">Vãng lai</span><div style="margin-top:2px;">${payBadge}</div></div>`;

        html += `
            <tr ${rowStyle}>
                <td class="cell-center mk-num"><strong>${l.id}</strong>${refundStatus}</td>
                <td class="cell-center mk-num">${l.timestamp}</td>
                <td><strong>${l.product_name}</strong></td>
                <td class="cell-center mk-num"><b>${l.quantity}</b> ${l.unit || "món"}</td>
                <td class="cell-right mk-num">${formatVND(l.unit_price)}</td>
                <td class="cell-right mk-num" style="color:${isRefunded ? "var(--ink-dim)" : "var(--goldleaf)"}; font-weight:700;">${formatVND(l.total_amount)}</td>
                <td>${custInfo}</td>
                <td><span class="mk-lead">${l.seller}</span></td>
                <td style="color:var(--ink-dim); font-size:12px;">${l.note || "-"}</td>
                <td class="cell-center">${actionBtn}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderShiftAuditTable(shiftId) {
    const tbody = document.getElementById("shiftAuditTableBody");
    const auditorSelect = document.getElementById("auditSelectAuditor");
    if (!tbody) return;

    if (auditorSelect && globalMembers && globalMembers.length > 0) {
        let optHtml = `<option value="Bộ phận kiểm hàng">-- Chọn người kiểm hàng --</option>`;
        globalMembers.forEach(m => {
            optHtml += `<option value="${esc(m.name)}">${esc(m.name)} (${esc(m.department)})</option>`;
        });
        auditorSelect.innerHTML = optHtml;
    }

    const products = globalInventoryData?.products || [];
    const allSales = globalInventoryData?.sales_logs || [];

    const currentShiftSales = allSales.filter(l => !l.refunded && (l.channel || "").includes(shiftId));
    const shiftSalesMap = {};
    currentShiftSales.forEach(l => {
        shiftSalesMap[l.product_id] = (shiftSalesMap[l.product_id] || 0) + (l.quantity || 0);
    });

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Kho hàng đang trống. Chưa có dữ liệu sản phẩm để kiểm kê.</td></tr>`;
        return;
    }

    let html = "";
    products.forEach((p, idx) => {
        const soldInShift = shiftSalesMap[p.id] || 0;
        const initialStock = p.initial_stock || 0;
        const totalSoldAll = p.sold_count || 0;
        const expectedStock = Math.max(0, initialStock - totalSoldAll);

        html += `
            <tr>
                <td class="cell-center mk-num">${idx + 1}</td>
                <td class="mk-num"><strong>${p.id}</strong></td>
                <td><strong>${esc(p.name)}</strong></td>
                <td class="cell-center">${p.unit || "món"}</td>
                <td class="cell-right mk-num">${initialStock}</td>
                <td class="cell-right mk-num" style="color: var(--goldleaf); font-weight:700;">${soldInShift}</td>
                <td class="cell-right mk-num" style="font-weight:700; color:var(--ink-hi);">${expectedStock}</td>
                <td class="cell-center" style="background: rgba(217, 119, 6, 0.05);">
                    <input type="number" min="0" 
                           class="audit-actual-input custom-input" 
                           id="auditActual_${p.id}"
                           data-pid="${p.id}"
                           data-expected="${expectedStock}"
                           value="${expectedStock}" 
                           oninput="onAuditQtyChange('${p.id}', ${expectedStock})"
                           style="width: 80px; text-align: center; font-weight: 700; font-size: 13px; padding: 4px 6px; border-color: var(--goldleaf);" />
                </td>
                <td class="cell-center" id="auditDiffCol_${p.id}">
                    <span class="badge-audit-ok"><i class="fa-solid fa-circle-check"></i> Khớp (0)</span>
                </td>
                <td>
                    <input type="text" class="audit-note-input custom-input" id="auditNote_${p.id}" data-pid="${p.id}" placeholder="Ghi chú nếu thiếu/thừa..." style="font-size: 12px; padding: 4px 6px; width: 100%;" />
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.onAuditQtyChange = function(pid, expected) {
    const input = document.getElementById(`auditActual_${pid}`);
    const diffCol = document.getElementById(`auditDiffCol_${pid}`);
    if (!input || !diffCol) return;

    const valStr = input.value;
    const actual = valStr === "" ? 0 : parseInt(valStr, 10);
    const diff = actual - expected;

    if (diff === 0) {
        diffCol.innerHTML = `<span class="badge-audit-ok"><i class="fa-solid fa-circle-check"></i> Khớp (0)</span>`;
    } else if (diff < 0) {
        diffCol.innerHTML = `<span class="badge-audit-loss"><i class="fa-solid fa-circle-exclamation"></i> Thiếu ${diff}</span>`;
    } else {
        diffCol.innerHTML = `<span class="badge-audit-surplus"><i class="fa-solid fa-circle-info"></i> Thừa +${diff}</span>`;
    }
};

async function handleSaveShiftAudit() {
    const msg = document.getElementById("shiftAuditMsg");
    const auditorSelect = document.getElementById("auditSelectAuditor");
    const auditor = auditorSelect?.value || "Người kiểm hàng ca";
    const shiftId = currentSelectedLiveShiftId || "Live";

    const products = globalInventoryData?.products || [];
    if (products.length === 0) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Không có sản phẩm nào để lưu báo cáo kiểm kê!";
        }
        return;
    }

    const items = [];
    products.forEach(p => {
        const inputActual = document.getElementById(`auditActual_${p.id}`);
        const inputNote = document.getElementById(`auditNote_${p.id}`);
        const expected = parseInt(inputActual?.getAttribute("data-expected") || "0", 10);
        const actualStr = inputActual?.value;
        const actual = actualStr === "" || actualStr === undefined ? expected : parseInt(actualStr, 10);
        const diff = actual - expected;
        const note = inputNote?.value.trim() || "";

        items.push({
            product_id: p.id,
            product_name: p.name,
            unit: p.unit || "món",
            expected_stock: expected,
            actual_stock: actual,
            diff: diff,
            note: note
        });
    });

    if (msg) {
        msg.className = "swap-msg";
        msg.textContent = "Đang lưu báo cáo đối chiếu kiểm kê ca trực...";
    }

    try {
        const res = await fetch("/api/inventory/audit-shift", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: shiftId,
                auditor: auditor,
                items: items,
                summary_note: `Báo cáo kiểm kê ca ${shiftId}`
            })
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = `✓ ${data.message}`;
            }
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = "Lỗi lưu kiểm kê: " + data.message;
            }
        }
    } catch (err) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối: " + err.message;
        }
    }
}

// ---------------------------------------------------------------------------
// QUẢN LÝ ĐƠN HÀNG ONLINE ĐẶT TRƯỚC (EXCEL IMPORT & LIVE SHIFT POS)
// ---------------------------------------------------------------------------

let globalOnlineOrders = [];

async function loadOnlineOrders() {
    try {
        const res = await fetch("/api/online-orders").then((r) => r.json());
        if (res.success) {
            globalOnlineOrders = res.online_orders || [];
            renderOnlineOrdersTable(globalOnlineOrders);
            updateOnlineOrdersKPIs(globalOnlineOrders);
        }
    } catch (e) {
        console.error("Lỗi tải danh sách đơn hàng online:", e);
    }
}

function updateOnlineOrdersKPIs(orders) {
    const totalEl = document.getElementById("kpiTotalOnlineOrders");
    const unpaidEl = document.getElementById("kpiUnpaidOnlineOrders");
    const paidEl = document.getElementById("kpiPaidOnlineOrders");
    const revEl = document.getElementById("kpiTotalOnlineRevenue");

    const totalCount = orders.length;
    const unpaidCount = orders.filter((o) => o.payment_status === "Chưa thanh toán").length;
    const paidCount = orders.filter((o) => o.payment_status === "Đã thanh toán").length;
    const totalRevenue = orders
        .filter((o) => o.payment_status === "Đã thanh toán")
        .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    if (totalEl) totalEl.textContent = `${totalCount} đơn`;
    if (unpaidEl) unpaidEl.textContent = `${unpaidCount} đơn`;
    if (paidEl) paidEl.textContent = `${paidCount} đơn`;
    if (revEl) revEl.textContent = formatVND(totalRevenue);
}

function renderOnlineOrdersTable(orders) {
    const tbody = document.getElementById("onlineOrdersTableBody");
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--ink-dim); padding: 2rem;">
                    <i class="fa-solid fa-box-open" style="font-size: 24px; margin-bottom: 8px; display: block; color: var(--ink-dim);"></i>
                    Chưa có đơn hàng online nào. Nhấn <strong>"Nhập Đơn Online Excel"</strong> để nạp danh sách từ file Excel.
                </td>
            </tr>
        `;
        return;
    }

    let html = "";
    orders.forEach((ord, idx) => {
        const itemsDetail = (ord.items || [])
            .map(
                (it) =>
                    `<span style="display: inline-block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 4px; font-size: 11.5px; margin: 1px 2px;">
                        ${escapeHtml(it.product_name)} <strong>x${it.quantity}</strong> (${formatVND(it.total_price)})
                    </span>`,
            )
            .join(" ");

        const isPaid = ord.payment_status === "Đã thanh toán";

        html += `
            <tr id="row_ord_${ord.id}">
                <td style="text-align: center; font-weight: 600; color: var(--ink-dim);">${idx + 1}</td>
                <td>
                    <strong style="color: var(--ink-hi); font-size: 13px;">${escapeHtml(ord.customer_name)}</strong>
                    <div style="font-size: 11.5px; color: #38bdf8; font-weight: 600;">Lớp: ${escapeHtml(ord.class_name)}</div>
                </td>
                <td>
                    <div style="font-size: 12.5px; font-weight: 600;">🗓️ ${escapeHtml(ord.pickup_date)}</div>
                    <div style="font-size: 11.5px; color: var(--ink-dim);">⏰ ${escapeHtml(ord.pickup_time_slot)}</div>
                </td>
                <td>
                    <span class="tag" style="background: rgba(147, 51, 234, 0.15); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.3); font-size: 11.5px;">
                        📌 Ca ${escapeHtml(ord.shift_id)}: ${escapeHtml(ord.shift_label || "Chưa phân ca")}
                    </span>
                </td>
                <td style="max-width: 250px;">
                    ${itemsDetail || '<em style="color:var(--ink-dim);">Chưa có sản phẩm</em>'}
                </td>
                <td style="text-align: right; font-weight: 700; color: var(--goldleaf); font-size: 13.5px;">
                    ${formatVND(ord.total_amount)}
                </td>
                <td style="text-align: center;">
                    <select class="custom-select-sm" 
                        style="font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: ${isPaid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${isPaid ? '#34d399' : '#fca5a5'}; border: 1px solid ${isPaid ? '#10b981' : '#ef4444'};"
                        onchange="handleOnlineOrderStatusChange('${ord.id}', this.value)"
                    >
                        <option value="Chưa thanh toán" ${!isPaid ? 'selected' : ''}>🔴 Chưa thanh toán</option>
                        <option value="Đã thanh toán" ${isPaid ? 'selected' : ''}>🟢 Đã thanh toán</option>
                    </select>
                </td>
                <td style="text-align: center;">
                    <button class="btn-action-sm btn-action-delete admin-only-elem" 
                        title="Xóa đơn này" 
                        onclick="handleDeleteOnlineOrder('${ord.id}')"
                    >
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function handleOnlineOrderStatusChange(orderId, newStatus) {
    try {
        const res = await fetch("/api/online-orders/update-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, payment_status: newStatus }),
        }).then((r) => r.json());

        if (res.success) {
            showToast(res.message, "success");
            loadInventoryData();
            loadOnlineOrders();
            if (currentSelectedLiveShiftId) {
                loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
            }
        } else {
            alert("Lỗi cập nhật trạng thái đơn: " + res.message);
            loadOnlineOrders();
        }
    } catch (e) {
        console.error("Lỗi cập nhật trạng thái đơn hàng:", e);
        alert("Lỗi kết nối server: " + e.message);
    }
}

async function handleDeleteOnlineOrder(orderId) {
    if (!confirm("Bạn có chắc chắn muốn xóa đơn hàng online này?")) return;
    try {
        const res = await fetch("/api/online-orders/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId }),
        }).then((r) => r.json());

        if (res.success) {
            showToast(res.message, "success");
            loadOnlineOrders();
            if (currentSelectedLiveShiftId) {
                loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
            }
        } else {
            alert("Lỗi xóa đơn hàng: " + res.message);
        }
    } catch (e) {
        console.error("Lỗi xóa đơn hàng online:", e);
        alert("Lỗi kết nối server: " + e.message);
    }
}

async function loadLiveShiftOnlineOrders(shiftId) {
    const tbody = document.getElementById("liveShiftOnlineOrdersTableBody");
    const badge = document.getElementById("liveShiftOnlineOrderCountBadge");
    if (!tbody) return;

    if (!shiftId) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--ink-dim); padding: 1.5rem;">
                    Vui lòng chọn ca trực để xem danh sách đơn hàng online tương ứng
                </td>
            </tr>
        `;
        if (badge) badge.textContent = "0 đơn hàng";
        return;
    }

    try {
        const res = await fetch(`/api/online-orders?shift_id=${shiftId}`).then((r) => r.json());
        if (res.success) {
            const orders = res.online_orders || [];
            if (badge) badge.textContent = `${orders.length} đơn hàng`;

            if (orders.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: var(--ink-dim); padding: 1.5rem;">
                            <i class="fa-solid fa-box-open" style="margin-right: 6px;"></i> Không có đơn hàng online nào đăng ký lấy trong ca trực này (${escapeHtml(shiftId)})
                        </td>
                    </tr>
                `;
                return;
            }

            let html = "";
            orders.forEach((ord, idx) => {
                const itemsDetail = (ord.items || [])
                    .map(
                        (it) =>
                            `<span style="display: inline-block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 4px; font-size: 11.5px; margin: 1px 2px;">
                                ${escapeHtml(it.product_name)} <strong>x${it.quantity}</strong> (${formatVND(it.total_price)})
                            </span>`,
                    )
                    .join(" ");

                const isPaid = ord.payment_status === "Đã thanh toán";

                html += `
                    <tr>
                        <td style="text-align: center; font-weight: 600; color: var(--ink-dim);">${idx + 1}</td>
                        <td>
                            <strong style="color: var(--ink-hi); font-size: 13px;">${escapeHtml(ord.customer_name)}</strong>
                            <div style="font-size: 11.5px; color: #38bdf8; font-weight: 600;">Lớp: ${escapeHtml(ord.class_name)}</div>
                        </td>
                        <td>
                            <div style="font-size: 12px; font-weight: 600;">🗓️ ${escapeHtml(ord.pickup_date)}</div>
                            <div style="font-size: 11.5px; color: var(--ink-dim);">⏰ ${escapeHtml(ord.pickup_time_slot)}</div>
                        </td>
                        <td>
                            ${itemsDetail || '<em style="color:var(--ink-dim);">Chưa có chi tiết</em>'}
                        </td>
                        <td style="text-align: right; font-weight: 700; color: var(--goldleaf); font-size: 13.5px;">
                            ${formatVND(ord.total_amount)}
                        </td>
                        <td style="text-align: center;">
                            <select class="custom-select-sm" 
                                style="font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: ${isPaid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${isPaid ? '#34d399' : '#fca5a5'}; border: 1px solid ${isPaid ? '#10b981' : '#ef4444'};"
                                onchange="handleOnlineOrderStatusChange('${ord.id}', this.value)"
                            >
                                <option value="Chưa thanh toán" ${!isPaid ? 'selected' : ''}>🔴 Chưa thanh toán</option>
                                <option value="Đã thanh toán" ${isPaid ? 'selected' : ''}>🟢 Đã thanh toán</option>
                            </select>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }
    } catch (e) {
        console.error("Lỗi tải đơn hàng online ca live:", e);
    }
}

function initOnlineOrdersExcelHandlers() {
    const btnOpenManual = document.getElementById("btnOpenAddOnlineOrderModal");
    const btnCloseManual = document.getElementById("btnCloseAddOnlineOrderModal");
    const btnCancelManual = document.getElementById("btnCancelAddOnlineOrderModal");
    const btnAddManualRow = document.getElementById("btnAddManualItemRow");
    const formManual = document.getElementById("addOnlineOrderForm");

    if (btnOpenManual) btnOpenManual.addEventListener("click", openAddOnlineOrderModal);
    if (btnCloseManual) btnCloseManual.addEventListener("click", closeAddOnlineOrderModal);
    if (btnCancelManual) btnCancelManual.addEventListener("click", closeAddOnlineOrderModal);
    if (btnAddManualRow) btnAddManualRow.addEventListener("click", createManualItemRow);
    if (formManual) formManual.addEventListener("submit", handleSaveManualOnlineOrder);

    const btnUpload = document.getElementById("btnUploadOnlineOrdersExcel");
    const fileInput = document.getElementById("inputOnlineOrdersExcelFile");
    const btnRefresh = document.getElementById("btnRefreshOnlineOrders");
    const btnClearAll = document.getElementById("btnClearAllOnlineOrders");

    if (btnUpload && fileInput) {
        btnUpload.addEventListener("click", () => {
            fileInput.value = "";
            fileInput.click();
        });

        fileInput.addEventListener("change", async (e) => {
            if (!e.target.files || e.target.files.length === 0) return;
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append("file", file);

            try {
                showToast("Đang xử lý tải lên file Excel đơn hàng online...", "info");
                const res = await fetch("/api/online-orders/upload-excel", {
                    method: "POST",
                    body: formData,
                }).then((r) => r.json());

                if (res.success) {
                    showToast(`✓ ${res.message}`, "success");
                    loadOnlineOrders();
                    loadInventoryData();
                    if (currentSelectedLiveShiftId) {
                        loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
                    }
                } else {
                    alert("Lỗi nhập đơn hàng từ Excel: " + res.message);
                }
            } catch (err) {
                console.error("Lỗi nạp file đơn online:", err);
                alert("Lỗi tải file: " + err.message);
            }
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            loadOnlineOrders();
            showToast("Đã làm mới danh sách đơn online!", "info");
        });
    }

    if (btnClearAll) {
        btnClearAll.addEventListener("click", async () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal("Bạn cần quyền Quản trị viên (Admin) để xóa toàn bộ đơn online!");
                return;
            }
            if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách đơn hàng online đặt trước? Hành động này không thể hoàn tác!")) return;
            try {
                const res = await fetch("/api/online-orders/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clear_all: true }),
                }).then((r) => r.json());

                if (res.success) {
                    showToast("✓ " + res.message, "success");
                    loadOnlineOrders();
                    if (currentSelectedLiveShiftId) {
                        loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
                    }
                } else {
                    alert("Lỗi xóa đơn hàng: " + res.message);
                }
            } catch (err) {
                console.error("Lỗi xóa tất cả đơn online:", err);
                alert("Lỗi kết nối server: " + err.message);
            }
        });
    }
}

function createManualItemRow() {
    const container = document.getElementById("manualItemsContainer");
    if (!container) return;

    const rowId = `item_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const products = (globalInventoryData && globalInventoryData.products) ? globalInventoryData.products : [];

    let optionsHtml = '<option value="">-- Chọn sản phẩm --</option>';
    products.forEach((p) => {
        optionsHtml += `<option value="${escapeHtml(p.id)}" data-price="${p.price}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)} - ${formatVND(p.price)}</option>`;
    });

    const div = document.createElement("div");
    div.id = rowId;
    div.className = "manual-item-row";
    div.style.cssText = "display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 6px; border-radius: 6px;";
    div.innerHTML = `
        <select class="custom-select select-manual-product" style="flex: 2; font-size: 12.5px;" required>
            ${optionsHtml}
        </select>
        <input type="number" class="custom-input input-manual-qty" value="1" min="1" style="width: 70px; font-size: 12.5px;" placeholder="SL" required />
        <button type="button" class="btn-action-sm btn-action-delete" title="Xóa dòng này" onclick="document.getElementById('${rowId}').remove()">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(div);
}

function openAddOnlineOrderModal() {
    const modal = document.getElementById("addOnlineOrderModal");
    if (!modal) return;

    const form = document.getElementById("addOnlineOrderForm");
    if (form) form.reset();

    const dateInp = document.getElementById("inputManualPickupDate");
    if (dateInp) {
        const today = new Date().toISOString().slice(0, 10);
        dateInp.value = today;
    }

    const container = document.getElementById("manualItemsContainer");
    if (container) {
        container.innerHTML = "";
        createManualItemRow();
    }

    const msg = document.getElementById("addOnlineOrderModalMsg");
    if (msg) msg.textContent = "";

    modal.classList.add("active");
    modal.style.display = "flex";
}

function closeAddOnlineOrderModal() {
    const modal = document.getElementById("addOnlineOrderModal");
    if (!modal) return;
    modal.classList.remove("active");
    modal.style.display = "none";
}

async function handleSaveManualOnlineOrder(e) {
    e.preventDefault();
    const customerName = document.getElementById("inputManualCustomerName")?.value.trim();
    const className = document.getElementById("inputManualClassName")?.value.trim() || "K.XĐ";
    const pickupDate = document.getElementById("inputManualPickupDate")?.value;
    const pickupSlot = document.getElementById("inputManualPickupSlot")?.value;
    const paymentStatus = document.getElementById("inputManualPaymentStatus")?.value || "Chưa thanh toán";
    const msgEl = document.getElementById("addOnlineOrderModalMsg");

    const rows = document.querySelectorAll(".manual-item-row");
    const items = [];

    rows.forEach((r) => {
        const prodSelect = r.querySelector(".select-manual-product");
        const qtyInp = r.querySelector(".input-manual-qty");
        if (prodSelect && prodSelect.value) {
            const selectedOpt = prodSelect.options[prodSelect.selectedIndex];
            const prodName = selectedOpt.getAttribute("data-name") || selectedOpt.textContent;
            const price = Number(selectedOpt.getAttribute("data-price")) || 0;
            const qty = Number(qtyInp ? qtyInp.value : 1) || 1;

            items.push({
                product_id: prodSelect.value,
                product_name: prodName,
                quantity: qty,
                unit_price: price,
            });
        }
    });

    if (!customerName || !pickupDate || !pickupSlot) {
        if (msgEl) msgEl.textContent = "Vui lòng điền đầy đủ tên khách hàng, ngày lấy và khung giờ!";
        return;
    }

    if (items.length === 0) {
        if (msgEl) msgEl.textContent = "Vui lòng chọn ít nhất 1 sản phẩm cho đơn hàng!";
        return;
    }

    try {
        const res = await fetch("/api/online-orders/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                customer_name: customerName,
                class_name: className,
                pickup_date: pickupDate,
                pickup_time_slot: pickupSlot,
                items: items,
                payment_status: paymentStatus,
            }),
        }).then((r) => r.json());

        if (res.success) {
            showToast("✓ " + res.message, "success");
            closeAddOnlineOrderModal();
            loadOnlineOrders();
            loadInventoryData();
            if (currentSelectedLiveShiftId) {
                loadLiveShiftOnlineOrders(currentSelectedLiveShiftId);
            }
        } else {
            if (msgEl) msgEl.textContent = "Lỗi: " + res.message;
        }
    } catch (err) {
        console.error("Lỗi thêm đơn online thủ công:", err);
        if (msgEl) msgEl.textContent = "Lỗi kết nối: " + err.message;
    }
}

let currentInvUploadFile = null;

function initInventoryExcelUpload() {
    const btnOpen = document.getElementById("btnUploadInventoryExcel");
    const modal = document.getElementById("uploadInventoryExcelModal");
    const btnClose = document.getElementById("btnCloseUploadInvModal");
    const btnCancel = document.getElementById("btnCancelUploadInvModal");
    const dropzone = document.getElementById("invExcelDropzone");
    const fileInput = document.getElementById("modalInvExcelFileInput");
    const btnRemoveFile = document.getElementById("btnRemoveInvExcelFile");
    const btnConfirm = document.getElementById("btnConfirmUploadInvExcel");

    const openModal = () => {
        if (currentUserRole !== "admin") {
            openAdminLoginModal(
                "Bạn cần đăng nhập quyền Quản trị viên để nạp sản phẩm từ Excel!",
            );
            return;
        }
        resetInvExcelModalState();
        if (modal) modal.classList.add("active");
    };

    const closeModal = () => {
        if (modal) modal.classList.remove("active");
        resetInvExcelModalState();
    };

    if (btnOpen) btnOpen.addEventListener("click", openModal);
    if (btnClose) btnClose.addEventListener("click", closeModal);
    if (btnCancel) btnCancel.addEventListener("click", closeModal);

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());

        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "#10b981";
            dropzone.style.background = "rgba(16, 185, 129, 0.1)";
        });

        dropzone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "rgba(255, 255, 255, 0.2)";
            dropzone.style.background = "rgba(0, 0, 0, 0.15)";
        });

        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "rgba(255, 255, 255, 0.2)";
            dropzone.style.background = "rgba(0, 0, 0, 0.15)";
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleInvExcelFileSelected(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleInvExcelFileSelected(e.target.files[0]);
            }
        });
    }

    if (btnRemoveFile) {
        btnRemoveFile.addEventListener("click", () => {
            resetInvExcelModalState();
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener("click", handleConfirmUploadInventoryExcel);
    }
}

function resetInvExcelModalState() {
    currentInvUploadFile = null;
    const fileInput = document.getElementById("modalInvExcelFileInput");
    if (fileInput) fileInput.value = "";

    const badge = document.getElementById("invExcelFileSelectedBadge");
    if (badge) badge.style.display = "none";

    const preview = document.getElementById("invExcelPreviewContainer");
    if (preview) preview.style.display = "none";

    const tbody = document.getElementById("invPreviewTableBody");
    if (tbody) tbody.innerHTML = "";

    const msg = document.getElementById("invExcelUploadMsg");
    if (msg) {
        msg.style.display = "none";
        msg.className = "swap-msg";
        msg.textContent = "";
    }

    const btnConfirm = document.getElementById("btnConfirmUploadInvExcel");
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Xác Nhận Nạp Vào Kho';
    }
}

async function handleInvExcelFileSelected(file) {
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
        alert("Vui lòng chọn file có định dạng Excel (.xlsx, .xls) hoặc .csv!");
        return;
    }

    currentInvUploadFile = file;

    // Show badge
    const badge = document.getElementById("invExcelFileSelectedBadge");
    const nameEl = document.getElementById("invExcelFileName");
    const sizeEl = document.getElementById("invExcelFileSize");
    if (badge && nameEl && sizeEl) {
        nameEl.textContent = file.name;
        const kb = (file.size / 1024).toFixed(1);
        sizeEl.textContent = `(${kb} KB)`;
        badge.style.display = "flex";
    }

    // Call preview API
    const msg = document.getElementById("invExcelUploadMsg");
    if (msg) {
        msg.style.display = "block";
        msg.className = "swap-msg";
        msg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đọc và phân tích cấu trúc file Excel...';
    }

    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await authFetch("/api/inventory/preview-excel", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();

        if (data.success && Array.isArray(data.items) && data.items.length > 0) {
            renderInvExcelPreview(data.items);
            if (msg) {
                msg.style.display = "none";
            }
            const btnConfirm = document.getElementById("btnConfirmUploadInvExcel");
            if (btnConfirm) btnConfirm.disabled = false;
        } else {
            if (msg) {
                msg.style.display = "block";
                msg.className = "swap-msg error";
                msg.textContent = "Không tìm thấy dữ liệu: " + (data.message || "File không đúng cấu trúc!");
            }
            const btnConfirm = document.getElementById("btnConfirmUploadInvExcel");
            if (btnConfirm) btnConfirm.disabled = true;
        }
    } catch (err) {
        if (msg) {
            msg.style.display = "block";
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi phân tích file: " + err.message;
        }
    }
}

function renderInvExcelPreview(items) {
    const previewContainer = document.getElementById("invExcelPreviewContainer");
    const countEl = document.getElementById("invPreviewCount");
    const summaryEl = document.getElementById("invPreviewSummary");
    const tbody = document.getElementById("invPreviewTableBody");

    if (!previewContainer || !tbody) return;

    let totalStock = 0;
    let totalVal = 0;

    let html = "";
    items.forEach((item, idx) => {
        const stt = item.stt || idx + 1;
        const name = item.name || "";
        const unit = item.unit || "Phần";
        const price = Number(item.price) || 0;
        const stock = Number(item.initial_stock) || 0;

        totalStock += stock;
        totalVal += stock * price;

        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 6px 10px; color: var(--ink-dim);">${stt}</td>
                <td style="padding: 6px 10px; font-weight: 600;">${esc(name)}</td>
                <td style="padding: 6px 10px;"><span class="badge" style="background: rgba(255,255,255,0.08); font-size: 11px; padding: 2px 6px;">${esc(unit)}</span></td>
                <td style="padding: 6px 10px; text-align: right; color: var(--goldleaf); font-weight: 600;">${formatVND(price)}</td>
                <td style="padding: 6px 10px; text-align: right; font-weight: 600;">${stock.toLocaleString("vi-VN")}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (countEl) countEl.textContent = items.length;
    if (summaryEl) {
        summaryEl.textContent = `Tổng: ${totalStock.toLocaleString("vi-VN")} SP nhập • Ước tính: ${formatVND(totalVal)}`;
    }
    previewContainer.style.display = "block";
}

async function handleConfirmUploadInventoryExcel() {
    if (!currentInvUploadFile) {
        alert("Vui lòng chọn file Excel trước!");
        return;
    }

    const btnConfirm = document.getElementById("btnConfirmUploadInvExcel");
    const msg = document.getElementById("invExcelUploadMsg");
    const mode = document.querySelector('input[name="invImportMode"]:checked')?.value || "merge";

    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nạp vào kho...';
    }
    if (msg) {
        msg.style.display = "block";
        msg.className = "swap-msg";
        msg.textContent = "Đang xử lý nạp danh mục sản phẩm vào hệ thống...";
    }

    try {
        const formData = new FormData();
        formData.append("file", currentInvUploadFile);
        formData.append("mode", mode);

        const res = await authFetch("/api/inventory/upload-excel", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();

        if (data.success) {
            alert(" " + data.message);
            const modal = document.getElementById("uploadInventoryExcelModal");
            if (modal) modal.classList.remove("active");
            resetInvExcelModalState();

            // Refresh all related views
            loadInventoryData();
            loadLiveShiftPosData();
            renderAllShiftOrdersTab();
        } else {
            if (msg) {
                msg.style.display = "block";
                msg.className = "swap-msg error";
                msg.textContent = "Lỗi: " + data.message;
            }
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Xác Nhận Nạp Vào Kho';
            }
        }
    } catch (err) {
        if (msg) {
            msg.style.display = "block";
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối máy chủ: " + err.message;
        }
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Xác Nhận Nạp Vào Kho';
        }
    }
}

async function refundTransaction(txId) {
    if (
        !confirm(
            `Bạn có chắc chắn muốn HỦY & HOÀN TÁC giao dịch ${txId} này?\nSố lượng sản phẩm tương ứng sẽ được hoàn lại vào kho hàng.`,
        )
    ) {
        return;
    }

    try {
        const res = await fetch("/api/inventory/refund", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ transaction_id: txId }),
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadInventoryData();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (e) {
        alert("Lỗi khi hủy giao dịch: " + e.message);
    }
}

// Edit member modal logic
function openEditMemberModal(memberId) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal(
            "Bạn cần đăng nhập quyền Quản trị viên để chỉnh sửa thông tin hoặc lịch rảnh thành viên!",
        );
        return;
    }
    const member = globalMembers.find((m) => m.member_id === memberId);
    if (!member) {
        alert("Không tìm thấy thông tin thành viên " + memberId);
        return;
    }

    document.getElementById("editMemberId").value = member.member_id;
    document.getElementById("editMemberName").value = member.name || "";
    document.getElementById("editMemberDept").value = member.department || "";
    document.getElementById("editMemberJob").value = member.job || "";
    document.getElementById("editMemberPhone").value = member.phone || "";
    document.getElementById("editMemberStandby").checked = !!member.is_standby;

    const days = [
        "Thứ 2",
        "Thứ 3",
        "Thứ 4",
        "Thứ 5",
        "Thứ 6",
        "Thứ 7",
        "Chủ Nhật",
    ];
    const slots = [
        "07h00 - 09h30",
        "09h35 - 12h00",
        "12h05 - 14h00",
        "14h05 - 16h05",
        "16h10 - 18h00",
    ];

    const tbody = document.getElementById("editMemberScheduleBody");
    let html = "";

    days.forEach((day) => {
        html += `<tr>`;
        html += `<td style="font-weight: 600; padding: 8px;">${day}</td>`;
        slots.forEach((slot) => {
            const key = `${day}|${slot}`;
            const isFree =
                member.availability && member.availability[key] === true;
            const isCommit =
                member.committed_slots && member.committed_slots[key] === true;

            html += `
                <td style="text-align: center; padding: 8px; vertical-align: middle;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center;">
                        <label style="font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; margin: 0;">
                            <input type="checkbox" class="chk-avail" data-day="${day}" data-slot="${slot}" ${isFree ? "checked" : ""} onchange="onAvailChange(this)" />
                            Rảnh
                        </label>
                        <label style="font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; color: var(--goldleaf); margin: 0;">
                            <input type="checkbox" class="chk-commit" data-day="${day}" data-slot="${slot}" ${isCommit ? "checked" : ""} onchange="onCommitChange(this)" />
                            C.Kết
                        </label>
                    </div>
                </td>
            `;
        });
        html += `</tr>`;
    });

    tbody.innerHTML = html;
    document.getElementById("editMemberModal").classList.add("active");
}

function onAvailChange(el) {
    if (!el.checked) {
        // If unchecking available, also uncheck committed
        const td = el.closest("td");
        const commitChk = td.querySelector(".chk-commit");
        if (commitChk) commitChk.checked = false;
    }
}

function onCommitChange(el) {
    if (el.checked) {
        // If checking committed, also check available
        const td = el.closest("td");
        const availChk = td.querySelector(".chk-avail");
        if (availChk) availChk.checked = true;
    }
}

function closeMemberModal() {
    document.getElementById("editMemberModal").classList.remove("active");
}

// Bind modal close buttons & shift audit
document.addEventListener("DOMContentLoaded", () => {
    const btnClose = document.getElementById("btnCloseMemberModal");
    const btnCancel = document.getElementById("btnCancelMemberModal");
    const btnSave = document.getElementById("btnSaveMemberModal");

    if (btnClose) btnClose.addEventListener("click", closeMemberModal);
    if (btnCancel) btnCancel.addEventListener("click", closeMemberModal);
    if (btnSave) btnSave.addEventListener("click", saveMemberData);

    const btnCheckout = document.getElementById("btnCheckoutLivePOS");
    if (btnCheckout) btnCheckout.addEventListener("click", handleCheckoutLivePOS);

    const btnAudit = document.getElementById("btnSaveShiftAudit");
    if (btnAudit) btnAudit.addEventListener("click", handleSaveShiftAudit);
});

async function saveMemberData() {
    const memberId = document.getElementById("editMemberId").value;
    const name = document.getElementById("editMemberName").value.trim();
    const department = document.getElementById("editMemberDept").value.trim();
    const job = document.getElementById("editMemberJob").value.trim();
    const phone = document.getElementById("editMemberPhone").value.trim();
    const is_standby = document.getElementById("editMemberStandby").checked;

    if (!name || !department) {
        alert("Vui lòng điền đầy đủ Họ tên và Ban.");
        return;
    }

    const availability = {};
    const committed_slots = {};

    document.querySelectorAll(".chk-avail").forEach((el) => {
        const day = el.getAttribute("data-day");
        const slot = el.getAttribute("data-slot");
        availability[`${day}|${slot}`] = el.checked;
    });

    document.querySelectorAll(".chk-commit").forEach((el) => {
        const day = el.getAttribute("data-day");
        const slot = el.getAttribute("data-slot");
        committed_slots[`${day}|${slot}`] = el.checked;
    });

    const btnSave = document.getElementById("btnSaveMemberModal");
    const originalText = btnSave.textContent;
    btnSave.textContent = "Đang lưu...";
    btnSave.disabled = true;

    try {
        const res = await authFetch("/api/members/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                member_id: memberId,
                name,
                department,
                job,
                phone,
                is_standby,
                availability,
                committed_slots,
            }),
        });

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            closeMemberModal();

            // Reload members list & refresh schedule/UI
            const resMembers = await fetch("/api/members").then((r) =>
                r.json(),
            );
            if (resMembers.success) {
                globalMembers = resMembers.members;
            }

            // Reload schedule to update KPI & members stats
            const resSched = await fetch("/api/schedule/current").then((r) =>
                r.json(),
            );
            if (resSched.success) {
                globalScheduleData = resSched.result;
            }

            populateUI();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi khi lưu thông tin thành viên: " + err.message);
    } finally {
        btnSave.textContent = originalText;
        btnSave.disabled = false;
    }
}

// ==========================================
// 12. KPI FUNCTIONS
// ==========================================
let globalKpiAttendance = [];

async function loadKpiData() {
    const tableBody = document.getElementById("kpiAttendanceTableBody");
    const leaderboardBody = document.getElementById("kpiLeaderboardTableBody");

    try {
        const [kpiRes, incRes] = await Promise.all([
            fetch("/api/kpi/attendance").then((r) => r.json()),
            fetch("/api/contingency/incidents").then((r) => r.json()).catch(() => ({ success: false }))
        ]);
        if (kpiRes.success) {
            globalKpiAttendance = kpiRes.attendance || [];
            if (incRes && incRes.success) {
                globalIncidentLogs = incRes.incidents || [];
            }
            renderKpiAll();
        } else {
            if (tableBody)
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--cinnabar);">Lỗi: ${kpiRes.message}</td></tr>`;
        }
    } catch (err) {
        console.error("Lỗi tải dữ liệu KPI:", err);
        if (tableBody)
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--cinnabar);">Không kết nối được server để tải KPI</td></tr>`;
    }
}

function renderKpiAll() {
    renderKpiStats();
    renderKpiAttendance();
    renderKpiLeaderboard();
}

function renderKpiStats() {
    const totalCount = globalKpiAttendance.length;
    const onTimeCount = globalKpiAttendance.filter(
        (l) => l.status === "Đúng giờ",
    ).length;
    const lateCount = globalKpiAttendance.filter(
        (l) => l.status === "Đi trễ",
    ).length;
    const absentCount = globalKpiAttendance.filter(
        (l) => l.status === "Nghỉ không phép",
    ).length;

    const onTimeRate =
        totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 100;

    // Calculate Average Response Time for calling backup staff
    const backupLogs = (globalIncidentLogs || []).filter(
        (inc) =>
            (inc.replacement_member &&
             inc.replacement_member !== "Không thay thế" &&
             inc.replacement_member !== "none" &&
             inc.replacement_member !== "no_replacement") ||
            inc.replacement_member_id ||
            (inc.note && inc.note.includes("Dự phòng")) ||
            (inc.response_time !== undefined && inc.response_time !== null)
    );

    let avgResponseTimeText = "0 phút";
    if (backupLogs.length > 0) {
        let totalMins = 0;
        let validCount = 0;
        backupLogs.forEach((inc) => {
            let mins =
                inc.response_time !== undefined && inc.response_time !== null
                    ? Number(inc.response_time)
                    : inc.late_minutes && Number(inc.late_minutes) > 0
                    ? Number(inc.late_minutes)
                    : 10;
            if (isNaN(mins) || mins <= 0) mins = 10;
            totalMins += mins;
            validCount++;
        });
        if (validCount > 0) {
            const avg = Math.round((totalMins / validCount) * 10) / 10;
            avgResponseTimeText = `${avg} phút`;
        }
    }

    const totalEl = document.getElementById("kpiStatTotal");
    const rateEl = document.getElementById("kpiStatOnTimeRate");
    const lateEl = document.getElementById("kpiStatLate");
    const absentEl = document.getElementById("kpiStatAbsent");
    const avgResponseEl = document.getElementById("kpiStatAvgResponseTime");

    if (totalEl) totalEl.textContent = String(totalCount);
    if (rateEl) rateEl.textContent = onTimeRate + "%";
    if (lateEl) lateEl.textContent = String(lateCount);
    if (absentEl) absentEl.textContent = String(absentCount);
    if (avgResponseEl) avgResponseEl.textContent = avgResponseTimeText;
}

function renderKpiAttendance() {
    const tbody = document.getElementById("kpiAttendanceTableBody");
    if (!tbody) return;

    const searchInp = document.getElementById("kpiShiftSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    const filtered = globalKpiAttendance.filter((log) => {
        if (!query) return true;
        return (
            (log.name || "").toLowerCase().includes(query) ||
            (log.day || "").toLowerCase().includes(query) ||
            (log.slot || "").toLowerCase().includes(query) ||
            (log.type || "").toLowerCase().includes(query) ||
            (log.role || "").toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--ink-dim); padding: 2rem;">Không tìm thấy ca trực nào khớp bộ lọc.</td></tr>`;
        return;
    }

    const disabledAttr = currentUserRole === "admin" ? "" : "disabled";

    let html = "";
    filtered.forEach((log) => {
        const typeTag =
            log.type === "Ngoại"
                ? `<span class="badge" style="background: rgba(14, 116, 144, 0.1); color: var(--blue-accent); font-weight: 600; padding: 2px 6px; border-radius: 4px;">Ca Ngoài</span>`
                : `<span class="badge" style="background: rgba(13, 148, 136, 0.1); color: #0d9488; font-weight: 600; padding: 2px 6px; border-radius: 4px;">Phòng</span>`;

        const roleTag =
            log.role === "Chính"
                ? `<span class="text-xs" style="color: var(--blue-accent); font-weight: 500;"><i class="fa-solid fa-star"></i> Trực Chính</span>`
                : `<span class="text-xs" style="color: var(--ink-dim); font-weight: 400;"><i class="fa-solid fa-circle-user"></i> Dự Phòng</span>`;

        // Setup dropdown dynamic coloring
        let selectClass = "select-green";
        if (log.status === "Đi trễ") selectClass = "select-orange";
        else if (log.status === "Nghỉ có phép") selectClass = "select-blue";
        else if (log.status === "Nghỉ không phép") selectClass = "select-red";
        else if (log.status === "Ứng biến standby")
            selectClass = "select-purple";

        html += `
            <tr style="transition: background-color 0.2s;">
                <td style="font-weight: 600; color: var(--ink-main);">${log.day}</td>
                <td><code style="background: var(--bg-card-alt); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; color: var(--goldleaf); font-weight: 500;">${log.slot}</code></td>
                <td>${typeTag}</td>
                <td style="font-weight: 500; color: var(--ink-main);">${log.name}</td>
                <td>${roleTag}</td>
                <td>
                    <select class="custom-select ${selectClass}" ${disabledAttr}
                            style="padding: 6px 12px; font-size: 13px; border-radius: 6px; font-weight: 600; border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s; outline: none; width: 100%;" 
                            onchange="updateKpiStatus('${log.shift_id}', '${log.member_id}', this.value, this)">
                        <option value="Đúng giờ" ${log.status === "Đúng giờ" ? "selected" : ""}>Đúng giờ (+10)</option>
                        <option value="Đi trễ" ${log.status === "Đi trễ" ? "selected" : ""}>Đi trễ (+5)</option>
                        <option value="Nghỉ có phép" ${log.status === "Nghỉ có phép" ? "selected" : ""}>Nghỉ có phép (+3)</option>
                        <option value="Nghỉ không phép" ${log.status === "Nghỉ không phép" ? "selected" : ""}>Nghỉ không phép (-15)</option>
                        <option value="Ứng biến standby" ${log.status === "Ứng biến standby" ? "selected" : ""}>Ứng cứu Standby (+15)</option>
                    </select>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function updateKpiStatus(shiftId, memberId, newStatus, selectElement) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal("Bạn cần đăng nhập quyền Quản trị viên để chỉnh sửa KPI điểm danh ca trực!");
        if (selectElement) {
            selectElement.disabled = true;
        }
        return;
    }

    if (selectElement) {
        selectElement.style.opacity = "0.5";
        selectElement.disabled = true;
    }

    try {
        const res = await authFetch("/api/kpi/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: shiftId,
                member_id: memberId,
                status: newStatus,
            }),
        }).then((r) => r.json());

        if (res.success) {
            // Update local memory
            const log = globalKpiAttendance.find(
                (l) => l.shift_id === shiftId && l.member_id === memberId,
            );
            if (log) {
                log.status = newStatus;
            }

            // Recalculate stats and leaderboard
            renderKpiStats();
            renderKpiLeaderboard();

            // Highlight the select control with the correct class
            if (selectElement) {
                selectElement.className = "custom-select";
                let selectClass = "select-green";
                if (newStatus === "Đi trễ") selectClass = "select-orange";
                else if (newStatus === "Nghỉ có phép")
                    selectClass = "select-blue";
                else if (newStatus === "Nghỉ không phép")
                    selectClass = "select-red";
                else if (newStatus === "Ứng biến standby")
                    selectClass = "select-purple";
                selectElement.classList.add(selectClass);
            }
        } else {
            alert("Lỗi khi lưu trạng thái: " + res.message);
        }
    } catch (err) {
        console.error("Lỗi kết nối điểm danh:", err);
    } finally {
        if (selectElement) {
            selectElement.style.opacity = "1";
            selectElement.disabled = false;
        }
    }
}

function renderKpiLeaderboard() {
    const tbody = document.getElementById("kpiLeaderboardTableBody");
    if (!tbody || !globalScheduleData) return;

    const searchInp = document.getElementById("kpiMemberSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    // Group attendance logs by member_id
    const memberLogs = {};
    globalKpiAttendance.forEach((log) => {
        if (!memberLogs[log.member_id]) {
            memberLogs[log.member_id] = [];
        }
        memberLogs[log.member_id].push(log);
    });

    // Build array of member performance
    const leaderboard = [];
    const allMembers = globalScheduleData.member_stats || [];

    allMembers.forEach((m) => {
        const mId = m.member_id;
        const logs = memberLogs[mId] || [];

        let onTime = 0;
        let late = 0;
        let excused = 0;
        let unexcused = 0;
        let standby = 0;

        logs.forEach((l) => {
            if (l.status === "Đúng giờ") onTime++;
            else if (l.status === "Đi trễ") late++;
            else if (l.status === "Nghỉ có phép") excused++;
            else if (l.status === "Nghỉ không phép") unexcused++;
            else if (l.status === "Ứng biến standby") standby++;
        });

        // Total scheduled ca
        const totalShifts = logs.filter(
            (l) => l.status !== "Ứng biến standby",
        ).length;

        // Compute score percentage
        let score = 100;
        const expectedPoints = totalShifts * 10;
        if (expectedPoints > 0 || standby > 0) {
            const earnedPoints =
                onTime * 10 +
                late * 5 +
                excused * 3 -
                unexcused * 15 +
                standby * 15;
            const expected = expectedPoints > 0 ? expectedPoints : 10;
            score = Math.max(
                0,
                Math.min(150, Math.round((earnedPoints / expected) * 100)),
            );
        }

        leaderboard.push({
            member_id: mId,
            name: m.name,
            department: m.department || "Ban Chuyên Môn",
            total_shifts: totalShifts,
            on_time: onTime,
            late: late,
            excused: excused,
            unexcused: unexcused,
            standby: standby,
            score: score,
        });
    });

    // Filter leaderboard
    const filtered = leaderboard.filter((item) => {
        if (!query) return true;
        return (
            (item.name || "").toLowerCase().includes(query) ||
            (item.department || "").toLowerCase().includes(query) ||
            (item.member_id || "").toLowerCase().includes(query)
        );
    });

    // Sort descending by score, then name
    filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--ink-dim); padding: 2rem;">Không tìm thấy thành viên nào khớp bộ lọc.</td></tr>`;
        return;
    }

    let html = "";
    filtered.forEach((item, index) => {
        const rank = index + 1;
        let rankBadge = `<span style="font-weight:700; color: var(--ink-dim);">${rank}</span>`;
        if (rank === 1)
            rankBadge = `🏆 <span style="font-weight:800; color: #d97706;">1</span>`;
        else if (rank === 2)
            rankBadge = `🥈 <span style="font-weight:800; color: #4b5563;">2</span>`;
        else if (rank === 3)
            rankBadge = `🥉 <span style="font-weight:800; color: #b45309;">3</span>`;

        // Define rating badge
        let ratingBadge = "";
        if (item.score >= 100) {
            ratingBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-medal"></i> Xuất Sắc</span>`;
        } else if (item.score >= 80) {
            ratingBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #059669; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-circle-check"></i> Đạt Chuẩn</span>`;
        } else if (item.score >= 50) {
            ratingBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; font-weight:600; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-circle-minus"></i> Khá / TB</span>`;
        } else {
            ratingBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-triangle-exclamation"></i> Cảnh Báo</span>`;
        }

        const detailsText = `Đúng giờ: ${item.on_time} | Trễ: ${item.late} | Phép: ${item.excused} | Không phép: ${item.unexcused} | Ứng cứu: ${item.standby}`;

        // Score color and progress bar width
        let barColor = "#10b981";
        if (item.score < 50) barColor = "#ef4444";
        else if (item.score < 80) barColor = "#f59e0b";
        else if (item.score >= 100) barColor = "#8b5cf6";

        const scorePercent = Math.min(100, item.score);

        html += `
            <tr>
                <td style="text-align: center; width: 60px;">${rankBadge}</td>
                <td><code style="font-size: 0.85rem; color: var(--ink-dim);">${item.member_id}</code></td>
                <td style="font-weight: 600; color: var(--ink-main);">${item.name}</td>
                <td><span style="font-size:13px; font-weight:500; color: var(--ink-dim);">${item.department}</span></td>
                <td><b style="color: var(--ink-main);">${item.total_shifts}</b> ca</td>
                <td>
                    <span style="font-size: 11px; color: var(--ink-dim); display: block;" title="${detailsText}">
                        <span style="color:#10b981; font-weight:600;">${item.on_time}đg</span> • 
                        <span style="color:#f59e0b; font-weight:600;">${item.late}t</span> • 
                        <span style="color:#ef4444; font-weight:600;">${item.unexcused}kp</span> • 
                        <span style="color:#8b5cf6; font-weight:600;">+${item.standby}ứ</span>
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; width: 40px; color: ${barColor}; text-align: right;">${item.score}%</span>
                        <div style="flex-grow: 1; background: var(--bg-card-alt); border-radius: 4px; height: 6px; overflow: hidden; width: 80px; border: 1px solid var(--border-color);">
                            <div style="background: ${barColor}; width: ${scorePercent}%; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                </td>
                <td>${ratingBadge}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function exportKpiReportCSV() {
    if (!globalScheduleData) return;

    const memberLogs = {};
    globalKpiAttendance.forEach((log) => {
        if (!memberLogs[log.member_id]) memberLogs[log.member_id] = [];
        memberLogs[log.member_id].push(log);
    });

    const allMembers = globalScheduleData.member_stats || [];
    const rows = [
        ["BÁO CÁO HIỆU SUẤT KPI CHUYÊN CẦN THÀNH VIÊN - BAN NHÂN SỰ"],
        ["Ngày xuất", new Date().toLocaleString("vi-VN")],
        [],
        [
            "Hạng",
            "Mã Thành Viên",
            "Thành Viên",
            "Ban Chuyên Môn",
            "Tổng Ca Phân Công",
            "Số Ca Đúng Giờ",
            "Số Ca Đi Trễ",
            "Nghỉ Có Phép",
            "Vắng Không Phép",
            "Số Ca Ứng Cứu Standby",
            "Điểm Số KPI (%)",
            "Xếp Loại Hiệu Suất",
        ],
    ];

    const leaderboard = [];
    allMembers.forEach((m) => {
        const mId = m.member_id;
        const logs = memberLogs[mId] || [];

        let onTime = 0,
            late = 0,
            excused = 0,
            unexcused = 0,
            standby = 0;
        logs.forEach((l) => {
            if (l.status === "Đúng giờ") onTime++;
            else if (l.status === "Đi trễ") late++;
            else if (l.status === "Nghỉ có phép") excused++;
            else if (l.status === "Nghỉ không phép") unexcused++;
            else if (l.status === "Ứng biến standby") standby++;
        });

        const totalShifts = logs.filter(
            (l) => l.status !== "Ứng biến standby",
        ).length;
        let score = 100;
        const expectedPoints = totalShifts * 10;
        if (expectedPoints > 0 || standby > 0) {
            const earnedPoints =
                onTime * 10 +
                late * 5 +
                excused * 3 -
                unexcused * 15 +
                standby * 15;
            const expected = expectedPoints > 0 ? expectedPoints : 10;
            score = Math.max(
                0,
                Math.min(150, Math.round((earnedPoints / expected) * 100)),
            );
        }

        leaderboard.push({
            member_id: mId,
            name: m.name,
            department: m.department || "",
            total_shifts: totalShifts,
            on_time: onTime,
            late: late,
            excused: excused,
            unexcused: unexcused,
            standby: standby,
            score: score,
        });
    });

    leaderboard.sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );

    leaderboard.forEach((item, index) => {
        let rating = "Xuất sắc";
        if (item.score < 50) rating = "Cảnh báo vi phạm";
        else if (item.score < 80) rating = "Khá / Trung bình";
        else if (item.score < 100) rating = "Đạt chuẩn";

        rows.push([
            index + 1,
            item.member_id,
            item.name,
            item.department,
            item.total_shifts,
            item.on_time,
            item.late,
            item.excused,
            item.unexcused,
            item.standby,
            item.score + "%",
            rating,
        ]);
    });

    const csvContent =
        "\uFEFF" +
        rows
            .map((e) =>
                e
                    .map((val) => `"${String(val).replace(/"/g, '""')}"`)
                    .join(","),
            )
            .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
        "download",
        `Bao_Cao_KPI_Chuyen_Can_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderAllShiftOrdersTab() {
    const tbody = document.getElementById("allShiftOrdersTableBody");
    if (!tbody) return;

    const allSales = globalInventoryData?.sales_logs || [];
    const shifts = globalScheduleData?.assigned_shifts || [];

    // Group all sales logs by Order ID (id)
    const orderMap = new Map();
    allSales.forEach(item => {
        const orderId = item.id || "TX_UNKNOWN";
        if (!orderMap.has(orderId)) {
            orderMap.set(orderId, {
                id: orderId,
                timestamp: item.timestamp || "",
                channel: item.channel || "Phòng Thanh Niên",
                seller: item.seller || "Thu ngân",
                customer_name: item.customer_name || "",
                customer_phone: item.customer_phone || "",
                payment_method: item.payment_method || "Tiền mặt",
                note: item.note || "",
                refunded: item.refunded === true,
                items: [],
                totalAmount: 0,
                totalQuantity: 0
            });
        }
        const grp = orderMap.get(orderId);
        grp.items.push(item);
        grp.totalAmount += (item.total_amount || 0);
        grp.totalQuantity += (item.quantity || 0);
        if (item.refunded) grp.refunded = true;
    });

    const allOrderGroups = Array.from(orderMap.values());

    // Populate shift filter dropdown
    const filterShiftEl = document.getElementById("ordersFilterShift");
    if (filterShiftEl) {
        const currentVal = filterShiftEl.value || "ALL";
        const shiftSet = new Set();
        shifts.forEach(s => shiftSet.add(`Ca ${s.shift_id}`));
        allOrderGroups.forEach(g => {
            if (g.channel) shiftSet.add(g.channel);
        });
        const shiftList = Array.from(shiftSet).sort();

        let optHtml = `<option value="ALL">-- Tất cả các ca (${allOrderGroups.length} đơn) --</option>`;
        shiftList.forEach(ch => {
            const count = allOrderGroups.filter(g => g.channel === ch).length;
            optHtml += `<option value="${esc(ch)}">${esc(ch)} (${count} đơn)</option>`;
        });
        filterShiftEl.innerHTML = optHtml;
        if (Array.from(filterShiftEl.options).some(o => o.value === currentVal)) {
            filterShiftEl.value = currentVal;
        }
    }

    // Get current filter states
    const selectedShift = filterShiftEl?.value || "ALL";
    const selectedTime = document.getElementById("ordersFilterTime")?.value || "ALL";
    const selectedPay = document.getElementById("ordersFilterPayment")?.value || "ALL";
    const selectedStatus = document.getElementById("ordersFilterStatus")?.value || "ALL";
    const searchKeyword = (document.getElementById("ordersSearchInput")?.value || "").toLowerCase().trim();

    // Date calculations for time filter
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
    
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 7);

    // Filter order groups
    const filteredOrders = allOrderGroups.filter(grp => {
        if (selectedShift !== "ALL" && grp.channel !== selectedShift) return false;

        if (selectedTime !== "ALL" && grp.timestamp) {
            const timePart = grp.timestamp.split(" ")[0] || "";
            if (selectedTime === "TODAY" && !timePart.startsWith(todayStr)) return false;
            if (selectedTime === "YESTERDAY" && !timePart.startsWith(yestStr)) return false;
            if (selectedTime === "LAST7DAYS") {
                const logDate = new Date(timePart);
                if (isNaN(logDate.getTime()) || logDate < d7) return false;
            }
        }

        if (selectedPay !== "ALL") {
            const pay = grp.payment_method || "Tiền mặt";
            if (pay !== selectedPay) return false;
        }

        if (selectedStatus === "VALID" && grp.refunded) return false;
        if (selectedStatus === "REFUNDED" && !grp.refunded) return false;

        if (searchKeyword) {
            const matchId = (grp.id || "").toLowerCase().includes(searchKeyword);
            const matchCustName = (grp.customer_name || "").toLowerCase().includes(searchKeyword);
            const matchCustPhone = (grp.customer_phone || "").toLowerCase().includes(searchKeyword);
            const matchSeller = (grp.seller || "").toLowerCase().includes(searchKeyword);
            const matchNote = (grp.note || "").toLowerCase().includes(searchKeyword);
            const matchChannel = (grp.channel || "").toLowerCase().includes(searchKeyword);
            const matchItems = grp.items.some(item => 
                (item.product_name || "").toLowerCase().includes(searchKeyword) ||
                (item.product_id || "").toLowerCase().includes(searchKeyword)
            );

            if (!matchId && !matchCustName && !matchCustPhone && !matchSeller && !matchNote && !matchChannel && !matchItems) {
                return false;
            }
        }

        return true;
    });

    // Calculate metrics based on order groups
    const validOrders = filteredOrders.filter(g => !g.refunded);
    const refundedOrders = filteredOrders.filter(g => g.refunded);

    const totalRev = validOrders.reduce((acc, g) => acc + g.totalAmount, 0);
    const cashOrders = validOrders.filter(g => (g.payment_method || "Tiền mặt") === "Tiền mặt");
    const cashRev = cashOrders.reduce((acc, g) => acc + g.totalAmount, 0);
    const transferOrders = validOrders.filter(g => g.payment_method === "Chuyển khoản");
    const transferRev = transferOrders.reduce((acc, g) => acc + g.totalAmount, 0);
    const refundedVal = refundedOrders.reduce((acc, g) => acc + g.totalAmount, 0);

    const totalValidItemsQty = validOrders.reduce((acc, g) => acc + g.totalQuantity, 0);
    const aov = validOrders.length > 0 ? Math.round(totalRev / validOrders.length) : 0;

    const countEl = document.getElementById("ordersTabTotalCount");
    const subCountEl = document.getElementById("ordersTabSubCount");
    const revEl = document.getElementById("ordersTabTotalRev");
    const aovSubEl = document.getElementById("ordersTabAovSub");
    const cashRevEl = document.getElementById("ordersTabCashRev");
    const cashSubEl = document.getElementById("ordersTabCashSub");
    const transRevEl = document.getElementById("ordersTabTransferRev");
    const transSubEl = document.getElementById("ordersTabTransferSub");
    const refCountEl = document.getElementById("ordersTabRefundedCount");
    const refValEl = document.getElementById("ordersTabRefundedVal");

    if (countEl) countEl.textContent = filteredOrders.length;
    if (subCountEl) subCountEl.textContent = `${validOrders.length} đơn (${totalValidItemsQty} SP)`;
    if (revEl) revEl.textContent = formatVND(totalRev);
    if (aovSubEl) aovSubEl.textContent = `Trung bình: ${formatVND(aov)}/đơn`;
    if (cashRevEl) cashRevEl.textContent = formatVND(cashRev);
    if (cashSubEl) cashSubEl.textContent = `${cashOrders.length} đơn tiền mặt`;
    if (transRevEl) transRevEl.textContent = formatVND(transferRev);
    if (transSubEl) transSubEl.textContent = `${transferOrders.length} đơn chuyển khoản`;
    if (refCountEl) refCountEl.textContent = refundedOrders.length;
    if (refValEl) refValEl.textContent = formatVND(refundedVal);

    // Update Analytics Section (Top Selling + Payment Ratios)
    const validSalesItems = validOrders.flatMap(g => g.items);
    const allFilteredItems = filteredOrders.flatMap(g => g.items);
    renderOrdersAnalytics(validSalesItems, allFilteredItems);

    if (filteredOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Không tìm thấy đơn hàng nào phù hợp với bộ lọc.</td></tr>`;
        return;
    }

    let html = "";
    filteredOrders.forEach(grp => {
        const isRefunded = grp.refunded === true;
        const rowStyle = isRefunded
            ? 'style="background: rgba(239, 68, 68, 0.05); opacity: 0.8;"'
            : "";
        const refundStatus = isRefunded
            ? `<div style="font-size:10.5px; color:#ef4444; font-weight:700; margin-top:2px;"><i class="fa-solid fa-ban"></i> Đã hủy</div>`
            : `<div style="font-size:10.5px; color:#10b981; font-weight:600; margin-top:2px;"><i class="fa-solid fa-circle-check"></i> Đã duyệt</div>`;

        const actionBtn = isRefunded
            ? `<span style="color: #ef4444; font-size:11px; font-weight:600;"><i class="fa-solid fa-ban"></i> Đã hoàn</span>`
            : `
            <div style="display:flex; gap:4px; justify-content:center;">
                <button type="button" class="btn-action-sm btn-action-secondary" style="padding: 3px 6px; font-size: 11px;" onclick="viewOrderReceipt('${grp.id}')" title="Xem chi tiết & in hóa đơn">
                    <i class="fa-solid fa-receipt"></i> Xem
                </button>
                <button type="button" class="btn-action-sm btn-action-delete" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 3px 6px; font-size: 11px;" onclick="refundTransaction('${grp.id}')" title="Hủy đơn hàng &amp; hoàn kho">
                    <i class="fa-solid fa-rotate-left"></i> Hủy
                </button>
            </div>
        `;

        const custName = grp.customer_name || "";
        const custPhone = grp.customer_phone || "";
        const payMethod = grp.payment_method || "Tiền mặt";

        const payBadge = payMethod === "Chuyển khoản"
            ? `<span class="tag-payment-transfer"><i class="fa-solid fa-credit-card"></i> CK</span>`
            : `<span class="tag-payment-cash"><i class="fa-solid fa-money-bill-wave"></i> Tiền mặt</span>`;

        const custInfo = (custName || custPhone)
            ? `<div><strong>${esc(custName || "Vãng lai")}</strong>${custPhone ? `<div style="font-size:11px; color:var(--ink-dim);">${esc(custPhone)}</div>` : ''}<div style="margin-top:2px;">${payBadge}</div></div>`
            : `<div><span style="color:var(--ink-dim); font-size:12px;">Vãng lai</span><div style="margin-top:2px;">${payBadge}</div></div>`;

        // Build list of grouped items inside the order
        let itemsListHtml = `<div style="display: flex; flex-direction: column; gap: 4px;">`;
        grp.items.forEach((item, idx) => {
            const itemPrice = item.unit_price !== undefined ? item.unit_price : item.price;
            itemsListHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 2px 0; ${idx > 0 ? 'border-top: 1px dashed var(--rule);' : ''}">
                    <div style="overflow: hidden; text-overflow: ellipsis;">
                        <strong style="color: var(--ink-hi);">${esc(item.product_name)}</strong>
                        <span style="font-size: 11px; color: var(--ink-dim);">(${esc(item.product_id)})</span>
                    </div>
                    <div style="text-align: right; white-space: nowrap; margin-left: 8px;">
                        <span style="background: rgba(202, 138, 4, 0.12); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px; color: var(--goldleaf);">x${item.quantity}</span>
                        <span style="font-size: 11px; color: var(--ink-dim); margin-left: 4px;">@ ${formatVND(itemPrice)}</span>
                        <strong style="font-size: 11.5px; color: var(--ink-hi); margin-left: 6px;">${formatVND(item.total_amount)}</strong>
                    </div>
                </div>
            `;
        });
        itemsListHtml += `</div>`;

        html += `
            <tr ${rowStyle}>
                <td class="cell-center mk-num">
                    <strong style="font-size: 13px; color: var(--goldleaf);">${esc(grp.id)}</strong>
                    ${refundStatus}
                </td>
                <td class="cell-center" style="font-size: 11.5px; color: var(--ink-dim);">${esc(grp.timestamp)}</td>
                <td><span class="shift-id-tag" style="font-size:11.5px;">${esc(grp.channel || "N/A")}</span></td>
                <td>${itemsListHtml}</td>
                <td class="cell-center">
                    <b style="font-size: 13px;">${grp.totalQuantity}</b>
                    <div style="font-size: 10px; color: var(--ink-dim);">(${grp.items.length} SP)</div>
                </td>
                <td class="cell-right mk-num" style="color:${isRefunded ? "var(--ink-dim)" : "var(--goldleaf)"}; font-weight:800; font-size: 13.5px; ${isRefunded ? 'text-decoration:line-through;' : ''}">
                    ${formatVND(grp.totalAmount)}
                </td>
                <td>${custInfo}</td>
                <td><span class="mk-lead">${esc(grp.seller || "Thu ngân")}</span></td>
                <td style="color:var(--ink-dim); font-size:12px;">${esc(grp.note || "-")}</td>
                <td class="cell-center">${actionBtn}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderOrdersAnalytics(validSales, allFilteredSales) {
    const topBody = document.getElementById("ordersTopSellingBody");
    const cashPctEl = document.getElementById("ratioCashPct");
    const transPctEl = document.getElementById("ratioTransferPct");
    const cashBar = document.getElementById("ratioCashBar");
    const transBar = document.getElementById("ratioTransferBar");
    const totalUnitsEl = document.getElementById("totalUnitsSold");
    const activeShiftsEl = document.getElementById("activeShiftsCount");

    // Top selling products map
    const prodMap = {};
    let totalQty = 0;
    const shiftSet = new Set();

    validSales.forEach(l => {
        totalQty += (l.quantity || 0);
        if (l.channel) shiftSet.add(l.channel);

        const key = l.product_name || l.product_id || "Khác";
        if (!prodMap[key]) {
            prodMap[key] = { name: key, qty: 0, revenue: 0 };
        }
        prodMap[key].qty += (l.quantity || 0);
        prodMap[key].revenue += (l.total_amount || 0);
    });

    if (totalUnitsEl) totalUnitsEl.textContent = `${totalQty} món`;
    if (activeShiftsEl) activeShiftsEl.textContent = `${shiftSet.size} ca`;

    // Render top 5 selling items
    if (topBody) {
        const sortedProds = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
        if (sortedProds.length === 0) {
            topBody.innerHTML = `<tr><td colspan="3" class="table-empty">Chưa có dữ liệu sản phẩm</td></tr>`;
        } else {
            let html = "";
            sortedProds.forEach((p, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
                html += `
                    <tr>
                        <td><strong>${medal} ${esc(p.name)}</strong></td>
                        <td class="cell-center mk-num"><b>${p.qty}</b></td>
                        <td class="cell-right mk-num" style="color:var(--goldleaf); font-weight:700;">${formatVND(p.revenue)}</td>
                    </tr>
                `;
            });
            topBody.innerHTML = html;
        }
    }

    // Payment method ratios
    const cashCount = validSales.filter(l => (l.payment_method || "Tiền mặt") === "Tiền mặt").length;
    const transCount = validSales.filter(l => l.payment_method === "Chuyển khoản").length;
    const totalValid = validSales.length;

    const cashPct = totalValid > 0 ? Math.round((cashCount / totalValid) * 100) : 0;
    const transPct = totalValid > 0 ? (100 - cashPct) : 0;

    if (cashPctEl) cashPctEl.textContent = `${cashPct}%`;
    if (transPctEl) transPctEl.textContent = `${transPct}%`;
    if (cashBar) cashBar.style.width = `${cashPct}%`;
    if (transBar) transBar.style.width = `${transPct}%`;
}

// Receipt detail modal
window.viewOrderReceipt = function(txId) {
    const allSales = globalInventoryData?.sales_logs || [];
    const orderItems = allSales.filter(l => l.id === txId);
    if (orderItems.length === 0) {
        showToast("Không tìm thấy thông tin đơn hàng này!", "error");
        return;
    }

    const firstTx = orderItems[0];
    const modal = document.getElementById("orderReceiptModal");
    const body = document.getElementById("orderReceiptModalBody");
    const refundBtn = document.getElementById("btnReceiptRefundOrder");

    const isRefunded = orderItems.some(item => item.refunded === true);

    if (refundBtn) {
        if (isRefunded) {
            refundBtn.style.display = "none";
        } else {
            refundBtn.style.display = "inline-flex";
            refundBtn.onclick = async () => {
                document.getElementById("orderReceiptModal")?.classList.remove("active");
                await refundTransaction(txId);
            };
        }
    }

    const statusText = isRefunded ? "🔴 ĐÃ HỦY / HOÀN TIỀN" : "✅ THÀNH CÔNG";
    const statusColor = isRefunded ? "#ef4444" : "#10b981";

    const totalOrderAmount = orderItems.reduce((acc, item) => acc + (item.total_amount || 0), 0);

    let itemsRowsHtml = "";
    orderItems.forEach(item => {
        const uPrice = item.unit_price !== undefined ? item.unit_price : item.price;
        itemsRowsHtml += `
            <tr>
                <td style="padding: 6px 0;">
                    <strong>${esc(item.product_name)}</strong><br/>
                    <span style="font-size:10.5px; color:var(--ink-dim);">Mã SP: ${esc(item.product_id)}</span>
                </td>
                <td style="text-align: center; font-weight: 700;">${item.quantity}</td>
                <td style="text-align: right;">${formatVND(uPrice)}</td>
                <td style="text-align: right; font-weight: 700; color: var(--goldleaf);">${formatVND(item.total_amount)}</td>
            </tr>
        `;
    });

    body.innerHTML = `
        <div style="text-align: center; border-bottom: 1px dashed var(--rule); padding-bottom: 12px; margin-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 800; color: var(--goldleaf);">DỰ ÁN GÂY QUỸ F&amp;B THPT CHUYÊN HÙNG VƯƠNG</div>
            <div style="font-size: 12px; color: var(--ink-dim);">HÓA ĐƠN BÁN HÀNG REALTIME POS</div>
            <div style="font-size: 13px; font-weight: 700; margin-top: 6px; color: ${statusColor};">${statusText}</div>
        </div>
        <div style="font-size: 12px; line-height: 1.6; color: var(--ink-hi);">
            <div style="display: flex; justify-content: space-between;">
                <span>Mã đơn hàng:</span>
                <strong style="color: var(--goldleaf); font-size: 13px;">${esc(firstTx.id)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Thời gian:</span>
                <span>${esc(firstTx.timestamp)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Ca trực:</span>
                <span class="shift-id-tag">${esc(firstTx.channel || "N/A")}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Thu ngân / Người bán:</span>
                <strong>${esc(firstTx.seller || "N/A")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Khách hàng:</span>
                <span>${esc(firstTx.customer_name || "Vãng lai")} ${firstTx.customer_phone ? `(${esc(firstTx.customer_phone)})` : ''}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>Hình thức thanh toán:</span>
                <strong>${esc(firstTx.payment_method || "Tiền mặt")}</strong>
            </div>
        </div>

        <div style="margin-top: 14px; border-top: 1px dashed var(--rule); border-bottom: 1px dashed var(--rule); padding: 10px 0;">
            <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px; color: var(--goldleaf);">DANH SÁCH SẢN PHẨM TRONG ĐƠN (${orderItems.length} MÓN):</div>
            <table style="width: 100%; font-size: 12px;">
                <thead>
                    <tr style="color: var(--ink-dim); border-bottom: 1px solid var(--rule);">
                        <th style="text-align: left; padding: 4px 0;">Sản phẩm</th>
                        <th style="text-align: center; width: 40px;">SL</th>
                        <th style="text-align: right; width: 80px;">Đơn giá</th>
                        <th style="text-align: right; width: 90px;">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRowsHtml}
                </tbody>
            </table>
        </div>

        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
            <strong style="color: var(--ink-hi);">TỔNG CỘNG THANH TOÁN:</strong>
            <strong style="font-size: 18px; color: var(--goldleaf);">${formatVND(totalOrderAmount)}</strong>
        </div>

        ${firstTx.note ? `<div style="margin-top: 8px; font-size: 11.5px; color: var(--ink-dim); background: var(--lacquer-2); padding: 6px 10px; border-radius: 4px;"><strong>Ghi chú:</strong> ${esc(firstTx.note)}</div>` : ''}
    `;

    document.getElementById("orderReceiptModal")?.classList.add("active");
};

// Export all shift orders to Excel CSV
function exportOrdersToExcel() {
    const allSales = globalInventoryData?.sales_logs || [];
    if (allSales.length === 0) {
        showToast("Chưa có dữ liệu đơn hàng để xuất!", "warning");
        return;
    }

    let csvContent = "\uFEFFMã Đơn,Thời Gian,Ca Trực,Tên Sản Phẩm,Mã SP,Số Lượng,Đơn Vị,Đơn Giá,Thành Tiền,Hình Thức Thanh Toán,Tên Khách Hàng,SĐT Khách Hàng,Thu Ngân,Ghi Chú,Trạng Thái\n";

    allSales.forEach(l => {
        const row = [
            `"${(l.id || "").replace(/"/g, '""')}"`,
            `"${(l.timestamp || "").replace(/"/g, '""')}"`,
            `"${(l.channel || "").replace(/"/g, '""')}"`,
            `"${(l.product_name || "").replace(/"/g, '""')}"`,
            `"${(l.product_id || "").replace(/"/g, '""')}"`,
            l.quantity || 0,
            `"${(l.unit || "").replace(/"/g, '""')}"`,
            l.unit_price || 0,
            l.total_amount || 0,
            `"${(l.payment_method || "Tiền mặt").replace(/"/g, '""')}"`,
            `"${(l.customer_name || "").replace(/"/g, '""')}"`,
            `"${(l.customer_phone || "").replace(/"/g, '""')}"`,
            `"${(l.seller || "").replace(/"/g, '""')}"`,
            `"${(l.note || "").replace(/"/g, '""')}"`,
            l.refunded ? "Đã Hủy" : "Thành Công"
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Bao_Cao_Chi_Tiet_Don_Hang_Cac_Ca_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Đã xuất file báo cáo đơn hàng Excel (CSV) thành công!", "success");
}

document.addEventListener("DOMContentLoaded", () => {
    const filterShift = document.getElementById("ordersFilterShift");
    const filterTime = document.getElementById("ordersFilterTime");
    const filterPay = document.getElementById("ordersFilterPayment");
    const filterStatus = document.getElementById("ordersFilterStatus");
    const searchInp = document.getElementById("ordersSearchInput");
    const btnRefresh = document.getElementById("btnRefreshOrdersTab");
    const btnExport = document.getElementById("btnExportOrdersExcel");
    const btnToggleAnalytics = document.getElementById("btnToggleOrdersAnalytics");
    const analyticsCard = document.getElementById("ordersAnalyticsCard");
    const btnCloseReceipt = document.getElementById("btnCloseReceiptModal");
    const btnCloseReceiptFooter = document.getElementById("btnCloseReceiptModalFooter");
    const btnPrintReceipt = document.getElementById("btnPrintReceiptBtn");

    if (filterShift) filterShift.addEventListener("change", renderAllShiftOrdersTab);
    if (filterTime) filterTime.addEventListener("change", renderAllShiftOrdersTab);
    if (filterPay) filterPay.addEventListener("change", renderAllShiftOrdersTab);
    if (filterStatus) filterStatus.addEventListener("change", renderAllShiftOrdersTab);
    if (searchInp) searchInp.addEventListener("input", renderAllShiftOrdersTab);
    
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            loadInventoryData();
            renderAllShiftOrdersTab();
        });
    }

    if (btnExport) {
        btnExport.addEventListener("click", exportOrdersToExcel);
    }

    if (btnToggleAnalytics && analyticsCard) {
        btnToggleAnalytics.addEventListener("click", () => {
            const isHidden = analyticsCard.style.display === "none";
            analyticsCard.style.display = isHidden ? "block" : "none";
            const lbl = document.getElementById("lblToggleAnalytics");
            if (lbl) lbl.textContent = isHidden ? "Ẩn Phân Tích" : "Top Món Bán Chạy";
        });
    }

    if (btnCloseReceipt) btnCloseReceipt.addEventListener("click", () => document.getElementById("orderReceiptModal")?.classList.remove("active"));
    if (btnCloseReceiptFooter) btnCloseReceiptFooter.addEventListener("click", () => document.getElementById("orderReceiptModal")?.classList.remove("active"));
    if (btnPrintReceipt) {
        btnPrintReceipt.addEventListener("click", () => {
            window.print();
        });
    }
});

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

async function seedMockData() {
    if (!confirm("Tạo dữ liệu mẫu sẽ thêm doanh thu giả lập và các lỗi vi phạm để kiểm thử bảng xếp hạng. Bạn có chắc chắn muốn thực hiện?")) return;
    try {
        const res = await fetch("/api/competition/seed", { method: "POST" });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            const currentWeek = document.getElementById('compWeekSelect')?.value || 'TỔNG KẾT';
            loadCompetitionStats(currentWeek);
        }
    } catch (e) {
        console.error("Lỗi khi tạo dữ liệu mẫu:", e);
        alert("Có lỗi xảy ra khi tạo dữ liệu mẫu");
    }
}
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
