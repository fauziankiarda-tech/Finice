// @ts-nocheck
const $ = id => document.getElementById(id);

const THEME_KEY = "finice_theme";

let transactions = [];
let currentUser = null;

let financeChart = null;
let statisticsChart = null;
let categoryChart = null;
let currentFilter = "all";

const rupiah = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
}).format(value);

function localDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getTotals() {
    const income = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
}

function refreshAll() {
    updateDashboard();
    updateStatistics();
    renderActivity();
}

// ===== BACKEND (SUPABASE) =====

async function loadTransactions() {
    const { data, error } = await db
        .from("transactions")
        .select("id, type, amount, category, description, date")
        .order("date", { ascending: false });

    if (error) {
        alert("Gagal memuat data: " + error.message);
        return;
    }

    transactions = (data || []).map(t => ({
        ...t,
        amount: Number(t.amount),
        description: t.description || ""
    }));
}

async function logout() {
    await db.auth.signOut();
    location.replace("login.html");
}

// ===== NAVIGASI HALAMAN =====

function navigateTo(page) {
    document.querySelectorAll(".app-page").forEach(section => {
        section.classList.remove("active");
    });

    const target = $(page + "Page");
    if (!target) return;
    target.classList.add("active");

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    if (page === "activity") renderActivity();
    if (page === "statistics") updateStatistics();
    if (page === "profile") loadProfile();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.go));
});

$("headerProfile").addEventListener("click", () => navigateTo("profile"));

// ===== MODAL TRANSAKSI =====

function openModal(id = null) {
    $("transactionForm").reset();
    $("editId").value = "";
    $("modalTitle").textContent = "Add Transaction";

    if (id !== null) {
        const item = transactions.find(t => t.id === id);
        if (!item) return;

        $("editId").value = item.id;
        $("type").value = item.type;
        $("amount").value = item.amount;
        $("category").value = item.category;
        $("description").value = item.description || "";
        $("date").value = item.date;
        $("modalTitle").textContent = "Edit Transaction";
    } else {
        $("date").value = localDate();
    }

    $("transactionModal").classList.add("show");
}

function closeModal() {
    $("transactionModal").classList.remove("show");
}

$("addTransaction").addEventListener("click", () => openModal());
$("navAdd").addEventListener("click", () => openModal());
$("activityAdd").addEventListener("click", () => openModal());
$("closeModal").addEventListener("click", closeModal);

$("transactionModal").addEventListener("click", event => {
    if (event.target === $("transactionModal")) closeModal();
});

// ===== SIMPAN DAN EDIT TRANSAKSI =====

$("transactionForm").addEventListener("submit", async event => {
    event.preventDefault();

    const idValue = $("editId").value;
    const amount = Number($("amount").value);
    const type = $("type").value;
    const category = $("category").value;
    const description = $("description").value.trim();
    const date = $("date").value;

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        alert("Masukkan nominal yang valid.");
        return;
    }
    if (!date) {
        alert("Silakan pilih tanggal.");
        return;
    }

    const payload = { type, amount, category, description, date };
    const submitBtn = event.target.querySelector(".submit-button");
    submitBtn.disabled = true;

    try {
        let result;
        if (idValue) {
            result = await db.from("transactions")
                .update(payload)
                .eq("id", idValue)
                .select()
                .single();
        } else {
            result = await db.from("transactions")
                .insert(payload)
                .select()
                .single();
        }

        if (result.error) {
            alert("Gagal menyimpan: " + result.error.message);
            return;
        }

        const saved = {
            ...result.data,
            amount: Number(result.data.amount),
            description: result.data.description || ""
        };

        if (idValue) {
            const index = transactions.findIndex(t => t.id === idValue);
            if (index !== -1) transactions[index] = saved;
        } else {
            transactions.push(saved);
        }

        refreshAll();
        closeModal();
    } finally {
        submitBtn.disabled = false;
    }
});

// ===== HAPUS TRANSAKSI =====

async function deleteTransaction(id) {
    if (!confirm("Apakah kamu yakin ingin menghapus transaksi ini?")) return;

    const { error } = await db.from("transactions").delete().eq("id", id);
    if (error) {
        alert("Gagal menghapus: " + error.message);
        return;
    }

    transactions = transactions.filter(t => t.id !== id);
    refreshAll();
}

// ===== BARIS TRANSAKSI =====

function createTransactionRow(item, showActions = false) {
    const row = document.createElement("div");
    row.className = "transaction-item";

    const info = document.createElement("div");
    info.className = "transaction-info";

    const icon = document.createElement("div");
    icon.className = "transaction-icon";
    icon.textContent = item.type === "income" ? "↙" : "↗";

    const details = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = item.description || item.category;
    const subtitle = document.createElement("p");
    subtitle.textContent = `${item.category} • ${item.date}`;

    details.append(title, subtitle);
    info.append(icon, details);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "9px";

    const amount = document.createElement("span");
    amount.className = "transaction-amount";
    amount.textContent = (item.type === "income" ? "+ " : "- ") + rupiah(item.amount);
    right.appendChild(amount);

    if (showActions) {
        const actions = document.createElement("div");
        actions.className = "transaction-actions";

        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.addEventListener("click", () => openModal(item.id));

        const remove = document.createElement("button");
        remove.textContent = "Delete";
        remove.className = "delete-btn";
        remove.addEventListener("click", () => deleteTransaction(item.id));

        actions.append(edit, remove);
        right.appendChild(actions);
    }

    row.append(info, right);
    return row;
}

const sortByDateDesc = (a, b) =>
    b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id));

// ===== DASHBOARD =====

function renderRecentTransactions() {
    const list = $("transactionList");
    list.replaceChildren();

    const sorted = [...transactions].sort(sortByDateDesc);

    if (sorted.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Belum ada transaksi. Mulai catat keuanganmu!";
        list.appendChild(empty);
        return;
    }

    sorted.slice(0, 5).forEach(item => list.appendChild(createTransactionRow(item)));
}

function updateDashboard() {
    const totals = getTotals();
    $("totalBalance").textContent = rupiah(totals.balance);
    $("totalIncome").textContent = rupiah(totals.income);
    $("totalExpense").textContent = rupiah(totals.expense);

    renderRecentTransactions();
    updateFinanceChart();
}

// ===== ACTIVITY =====

function renderActivity() {
    const list = $("allTransactions");
    list.replaceChildren();

    const search = $("searchTransaction").value.toLowerCase().trim();
    let filtered = [...transactions];

    if (currentFilter !== "all") {
        filtered = filtered.filter(t => t.type === currentFilter);
    }

    filtered = filtered.filter(t =>
        `${t.description} ${t.category} ${t.date}`.toLowerCase().includes(search)
    );

    filtered.sort(sortByDateDesc);

    const totals = getTotals();
    $("transactionCount").textContent = transactions.length;
    $("activityBalance").textContent = rupiah(totals.balance);
    $("activityResult").textContent = filtered.length + " items";

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Transaksi tidak ditemukan.";
        list.appendChild(empty);
        return;
    }

    filtered.forEach(item => list.appendChild(createTransactionRow(item, true)));
}

$("searchTransaction").addEventListener("input", renderActivity);

document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
        renderActivity();
    });
});

// ===== DATA GRAFIK 7 HARI =====

function getWeeklyData() {
    const labels = [];
    const income = [];
    const expense = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");

        labels.push(date.toLocaleDateString("id-ID", { weekday: "short" }));

        income.push(transactions
            .filter(t => t.date === key && t.type === "income")
            .reduce((sum, t) => sum + t.amount, 0));

        expense.push(transactions
            .filter(t => t.date === key && t.type === "expense")
            .reduce((sum, t) => sum + t.amount, 0));
    }

    return { labels, income, expense };
}

function isDark() {
    return document.body.classList.contains("dark");
}

function chartTextColor() {
    return isDark() ? "#eeeeee" : "#777777";
}

function updateFinanceChart() {
    if (typeof Chart === "undefined") return;

    const data = getWeeklyData();
    const textColor = chartTextColor();

    if (!financeChart) {
        financeChart = new Chart($("financeChart"), {
            type: "line",
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: "Income",
                        data: data.income,
                        borderColor: "#888888",
                        backgroundColor: "rgba(140,140,140,.12)",
                        fill: true,
                        tension: .4
                    },
                    {
                        label: "Expense",
                        data: data.expense,
                        borderColor: "#151515",
                        backgroundColor: "rgba(30,30,30,.05)",
                        fill: true,
                        tension: .4
                    }
                ]
            },
            options: chartOptions(textColor)
        });
    } else {
        financeChart.data.labels = data.labels;
        financeChart.data.datasets[0].data = data.income;
        financeChart.data.datasets[1].data = data.expense;
        financeChart.options = chartOptions(textColor);
        financeChart.update();
    }
}

function chartOptions(color) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom",
                labels: { color, usePointStyle: true, boxWidth: 7, font: { size: 10 } }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color, font: { size: 10 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: isDark() ? "#303030" : "#eeeeee" },
                ticks: {
                    color,
                    font: { size: 9 },
                    callback: value => {
                        if (value >= 1000000) return value / 1000000 + "jt";
                        if (value >= 1000) return value / 1000 + "rb";
                        return value;
                    }
                }
            }
        }
    };
}

// ===== STATISTICS =====

function updateStatistics() {
    const totals = getTotals();

    $("statBalance").textContent = rupiah(totals.balance);
    $("statIncome").textContent = rupiah(totals.income);
    $("statExpense").textContent = rupiah(totals.expense);

    updateStatisticsChart();
    updateCategoryChart();
    updateInsight();
}

function updateStatisticsChart() {
    if (typeof Chart === "undefined") return;

    const data = getWeeklyData();

    if (!statisticsChart) {
        statisticsChart = new Chart($("statisticsChart"), {
            type: "bar",
            data: {
                labels: data.labels,
                datasets: [
                    { label: "Income", data: data.income, backgroundColor: "#888888", borderRadius: 6 },
                    { label: "Expense", data: data.expense, backgroundColor: "#222222", borderRadius: 6 }
                ]
            },
            options: chartOptions(chartTextColor())
        });
    } else {
        statisticsChart.data.labels = data.labels;
        statisticsChart.data.datasets[0].data = data.income;
        statisticsChart.data.datasets[1].data = data.expense;
        statisticsChart.options = chartOptions(chartTextColor());
        statisticsChart.update();
    }
}

function updateCategoryChart() {
    if (typeof Chart === "undefined") return;

    const categories = {};
    transactions.filter(t => t.type === "expense").forEach(item => {
        categories[item.category] = (categories[item.category] || 0) + item.amount;
    });

    const labels = Object.keys(categories);
    const values = Object.values(categories);
    const colors = ["#171717", "#555555", "#888888", "#aaaaaa", "#cccccc", "#777777", "#dddddd"];

    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart($("categoryChart"), {
        type: "doughnut",
        data: {
            labels: labels.length ? labels : ["No Data"],
            datasets: [{
                data: values.length ? values : [1],
                backgroundColor: labels.length
                    ? labels.map((_, i) => colors[i % colors.length])
                    : ["#cccccc"],
                borderWidth: 2,
                borderColor: isDark() ? "#1b1b1b" : "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: { legend: { display: false } }
        }
    });

    const breakdown = $("categoryBreakdown");
    breakdown.replaceChildren();

    if (labels.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Belum ada data pengeluaran.";
        breakdown.appendChild(empty);
        return;
    }

    labels.forEach((label, index) => {
        const row = document.createElement("div");
        row.className = "category-row";

        const name = document.createElement("div");
        name.className = "category-name";

        const color = document.createElement("span");
        color.className = "category-color";
        color.style.background = colors[index % colors.length];

        const text = document.createElement("span");
        text.textContent = label;

        name.append(color, text);

        const amount = document.createElement("strong");
        amount.textContent = rupiah(values[index]);

        row.append(name, amount);
        breakdown.appendChild(row);
    });
}

function updateInsight() {
    const totals = getTotals();
    let message = "";

    if (transactions.length === 0) {
        message = "Belum ada data transaksi. Tambahkan transaksi untuk melihat analisis keuangan.";
    } else if (totals.balance > 0) {
        message = "Total pemasukanmu lebih besar daripada pengeluaran. Ini menunjukkan saldo bersih positif berdasarkan seluruh transaksi yang tercatat.";
    } else if (totals.balance < 0) {
        message = "Total pengeluaranmu lebih besar daripada pemasukan. Periksa kembali catatan keuanganmu.";
    } else {
        message = "Total pemasukan dan pengeluaranmu saat ini seimbang.";
    }

    $("financialInsight").textContent = message;
}

// ===== PROFILE (data dari akun Supabase) =====

function profileName() {
    const meta = currentUser?.user_metadata?.full_name;
    return meta || (currentUser?.email ? currentUser.email.split("@")[0] : "Finice User");
}

function loadProfile() {
    const name = profileName();
    const email = currentUser?.email || "";

    $("userName").value = name;
    $("userEmail").value = email;
    $("userEmail").readOnly = true;

    $("profileName").textContent = name;
    $("profileEmail").textContent = email || "Pengguna FINICE";
    $("profileAvatar").textContent = name.charAt(0).toUpperCase();
    $("headerProfile").textContent = name.charAt(0).toUpperCase();
}

$("profileForm").addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("userName").value.trim();
    if (!name) {
        alert("Silakan masukkan nama.");
        return;
    }

    const { data, error } = await db.auth.updateUser({ data: { full_name: name } });
    if (error) {
        alert("Gagal menyimpan profil: " + error.message);
        return;
    }

    currentUser = data.user;
    loadProfile();
    alert("Profil berhasil disimpan.");
});

// ===== TEMA =====

function updateTheme() {
    const dark = isDark();
    $("themeToggle").textContent = dark ? "☀" : "☾";
    $("profileTheme").textContent = dark ? "ON" : "OFF";

    updateFinanceChart();
    if (statisticsChart) updateStatisticsChart();
    if (categoryChart) updateCategoryChart();
}

function toggleTheme() {
    document.body.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, isDark() ? "dark" : "light");
    updateTheme();
}

$("themeToggle").addEventListener("click", toggleTheme);
$("profileTheme").addEventListener("click", toggleTheme);

// ===== EXPORT DATA =====

$("exportData").addEventListener("click", () => {
    const file = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "finice-transactions.json";
    link.click();
    URL.revokeObjectURL(url);
});

// Tombol logout + teks data dibuat lewat JS agar index.html tidak perlu banyak diubah
(function setupAccountSection() {
    const warning = document.querySelector(".data-warning");
    if (warning) {
        warning.textContent = "Data tersimpan aman di database online (Supabase) dan tersinkron di semua perangkat.";
    }

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "secondary-button full-button";
    logoutBtn.id = "logoutBtn";
    logoutBtn.textContent = "Log Out";
    logoutBtn.addEventListener("click", logout);
    $("exportData").after(logoutBtn);
})();

// ===== INISIALISASI =====

$("currentDate").textContent = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
});
$("date").value = localDate();

if (localStorage.getItem(THEME_KEY) === "dark") {
    document.body.classList.add("dark");
}

async function init() {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        location.replace("login.html");
        return;
    }

    currentUser = session.user;

    // Jika sesi berakhir / logout di tab lain, kembali ke login
    db.auth.onAuthStateChange((event, newSession) => {
        if (event === "SIGNED_OUT" || !newSession) location.replace("login.html");
    });

    loadProfile();
    updateTheme();
    await loadTransactions();
    refreshAll();
}

init();
