
// FINICE - SMART FINANCE

const $ = id => document.getElementById(id);

const THEME_KEY = "finice_theme";
const CUSTOM_VALUE = "__custom";

const DEFAULT_CATEGORIES = {
    income: ["Gaji", "Uang Saku", "Bonus", "Bisnis", "Lainnya"],
    expense: [
        "Makanan", "Transportasi", "Belanja", "Tagihan",
        "Pendidikan", "Kesehatan", "Hiburan", "Lainnya"
    ]
};

let transactions = [];
let currentUser = null;
let currentFilter = "all";

let financeChart = null;
let statisticsChart = null;
let categoryChart = null;

const rupiah = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
}).format(Number(value) || 0);

function localDate() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function showError(message) {
    alert(message);
}

function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function showEmpty(container, message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    container.appendChild(empty);
}

// ==============================
// AUTENTIKASI
// ==============================

async function checkLogin() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        showError("Gagal memeriksa akun: " + error.message);
        return false;
    }

    currentUser = data.session?.user || null;

    if (!currentUser) {
        alert("Silakan masuk ke akun FINICE terlebih dahulu.");
        location.href = "login.html";
        return false;
    }

    return true;
}

async function logout() {
    const confirmed = confirm("Yakin ingin keluar dari akun FINICE?");

    if (!confirmed) return;

    const { error } = await db.auth.signOut();

    if (error) {
        showError("Gagal keluar: " + error.message);
        return;
    }

    location.href = "login.html";
}

// ==============================
// DATA SUPABASE
// ==============================

async function loadTransactions() {
    if (!currentUser) return;

    const { data, error } = await db
        .from("transactions")
        .select("id, user_id, type, amount, category, description, date")
        .eq("user_id", currentUser.id)
        .order("date", { ascending: false });

    if (error) {
        console.error("Gagal memuat transaksi:", error);
        showError("Gagal memuat transaksi: " + error.message);
        transactions = [];
        return;
    }

    transactions = (data || []).map(item => ({
        ...item,
        amount: Number(item.amount),
        description: item.description || ""
    }));
}

// ==============================
// PERHITUNGAN
// ==============================

function getTotals() {
    const income = transactions
        .filter(item => item.type === "income")
        .reduce((sum, item) => sum + item.amount, 0);

    const expense = transactions
        .filter(item => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0);

    return {
        income,
        expense,
        balance: income - expense
    };
}

// ==============================
// NAVIGASI
// ==============================

function navigateTo(page) {
    document.querySelectorAll(".app-page").forEach(section => {
        section.classList.remove("active");
    });

    const target = $(page + "Page");

    if (!target) return;

    target.classList.add("active");

    document.querySelectorAll(".nav-item[data-page]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    if (page === "home") updateDashboard();
    if (page === "activity") renderActivity();
    if (page === "statistics") updateStatistics();
    if (page === "profile") loadProfile();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.page);
    });
});

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
        navigateTo(button.dataset.go);
    });
});

$("headerProfile").addEventListener("click", () => {
    navigateTo("profile");
});

// ==============================
// TEMA
// ==============================

function isDarkTheme() {
    return localStorage.getItem(THEME_KEY) === "dark";
}

function applyTheme() {
    const dark = isDarkTheme();

    document.body.classList.toggle("dark-mode", dark);
    document.body.classList.toggle("dark", dark);

    $("themeToggle").textContent = dark ? "☀" : "☾";
    $("profileTheme").textContent = dark ? "AKTIF" : "MATI";

    updateCharts();
}

function toggleTheme() {
    localStorage.setItem(
        THEME_KEY,
        isDarkTheme() ? "light" : "dark"
    );

    applyTheme();
}

$("themeToggle").addEventListener("click", toggleTheme);
$("profileTheme").addEventListener("click", toggleTheme);

// ==============================
// PROFIL
// ==============================

function loadProfile() {
    if (!currentUser) return;

    const email = currentUser.email || "";

    const name =
        currentUser.user_metadata?.full_name ||
        currentUser.user_metadata?.name ||
        email.split("@")[0] ||
        "Pengguna FINICE";

    const initial = name.charAt(0).toUpperCase();

    $("profileName").textContent = name;
    $("profileEmail").textContent = email;
    $("profileAvatar").textContent = initial;
    $("headerProfile").textContent = initial;

    $("userName").value = name;
    $("userEmail").value = email;

    $("profileTheme").textContent = isDarkTheme() ? "AKTIF" : "MATI";
}

$("profileForm").addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("userName").value.trim();

    if (!name) {
        showError("Nama tidak boleh kosong.");
        return;
    }

    const button = event.target.querySelector("button");

    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        const { data, error } = await db.auth.updateUser({
            data: {
                full_name: name
            }
        });

        if (error) throw error;

        currentUser = data.user;
        loadProfile();

        alert("Profil berhasil diperbarui.");

    } catch (error) {
        console.error(error);
        showError("Gagal menyimpan profil: " + error.message);

    } finally {
        button.disabled = false;
        button.textContent = "Simpan Profil";
    }
});

// ==============================
// KATEGORI
// ==============================

function buildCategoryOptions(type, selected = "") {
    const select = $("category");
    select.replaceChildren();

    const defaults = DEFAULT_CATEGORIES[type] || [];

    const used = [
        ...new Set(
            transactions
                .filter(item => item.type === type)
                .map(item => item.category)
        )
    ].filter(category => !defaults.includes(category));

    const categories = [...defaults, ...used];

    if (selected && !categories.includes(selected)) {
        categories.push(selected);
    }

    categories.forEach(name => {
        addOption(select, name, name);
    });

    addOption(select, CUSTOM_VALUE, "Kategori sendiri");

    select.value = selected && categories.includes(selected)
        ? selected
        : categories[0];

    toggleCustomCategory();
}

function toggleCustomCategory() {
    const isCustom = $("category").value === CUSTOM_VALUE;

    $("customCategory").classList.toggle(
        "hidden-field",
        !isCustom
    );

    if (isCustom) {
        $("customCategory").focus();
    }
}

$("type").addEventListener("change", () => {
    buildCategoryOptions($("type").value);
});

$("category").addEventListener("change", toggleCustomCategory);

// ==============================
// MODAL TRANSAKSI
// ==============================

function openModal(id = null) {
    $("transactionForm").reset();

    $("editId").value = "";
    $("customCategory").value = "";

    $("modalTitle").textContent = "Tambah Transaksi";

    if (id !== null) {
        const item = transactions.find(
            transaction => String(transaction.id) === String(id)
        );

        if (!item) return;

        $("editId").value = item.id;
        $("type").value = item.type;

        buildCategoryOptions(item.type, item.category);

        $("amount").value = item.amount;
        $("description").value = item.description || "";
        $("date").value = item.date;

        $("modalTitle").textContent = "Edit Transaksi";

    } else {
        $("type").value = "income";
        buildCategoryOptions("income");
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
    if (event.target === $("transactionModal")) {
        closeModal();
    }
});

// ==============================
// SIMPAN TRANSAKSI
// ==============================

$("transactionForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        showError("Sesi akun tidak ditemukan. Silakan login kembali.");
        return;
    }

    const idValue = $("editId").value;
    const type = $("type").value;
    const amount = Number($("amount").value);
    const description = $("description").value.trim();
    const date = $("date").value;

    let category = $("category").value;

    if (category === CUSTOM_VALUE) {
        category = $("customCategory").value.trim();

        if (!category) {
            showError("Masukkan nama kategori.");
            return;
        }
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        showError("Masukkan nominal yang valid.");
        return;
    }

    if (!date) {
        showError("Pilih tanggal transaksi.");
        return;
    }

    if (!category) {
        showError("Pilih kategori transaksi.");
        return;
    }

    const payload = {
        user_id: currentUser.id,
        type,
        amount,
        category,
        description,
        date
    };

    const button = $("transactionForm").querySelector(".submit-button");

    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        let error;

        if (idValue) {
            // EDIT TRANSAKSI

            const result = await db
                .from("transactions")
                .update({
                    type,
                    amount,
                    category,
                    description,
                    date
                })
                .eq("id", idValue)
                .eq("user_id", currentUser.id);

            error = result.error;

        } else {
            // TAMBAH TRANSAKSI

            const result = await db
                .from("transactions")
                .insert([payload]);

            error = result.error;
        }

        if (error) {
            throw error;
        }

        await loadTransactions();

        refreshAll();
        closeModal();

        alert(idValue
            ? "Transaksi berhasil diperbarui."
            : "Transaksi berhasil ditambahkan."
        );

    } catch (error) {
        console.error("Gagal menyimpan transaksi:", error);

        showError(
            "Gagal menyimpan transaksi.\n\n" +
            "Pesan: " + (error.message || "Kesalahan tidak diketahui")
        );

    } finally {
        button.disabled = false;
        button.textContent = "Simpan Transaksi";
    }
});

// ==============================
// HAPUS TRANSAKSI
// ==============================

async function deleteTransaction(id) {
    if (!currentUser) {
        showError("Silakan login kembali.");
        return;
    }

    const confirmed = confirm("Yakin ingin menghapus transaksi ini?");

    if (!confirmed) return;

    const { error } = await db
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id);

    if (error) {
        console.error(error);
        showError("Gagal menghapus transaksi: " + error.message);
        return;
    }

    await loadTransactions();
    refreshAll();

    alert("Transaksi berhasil dihapus.");
}

// ==============================
// TAMPILKAN TRANSAKSI
// ==============================

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

    const dateText = item.date
        ? new Date(item.date + "T00:00:00").toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric"
        })
        : "";

    subtitle.textContent = `${item.category} • ${dateText}`;

    details.append(title, subtitle);
    info.append(icon, details);

    const right = document.createElement("div");
    right.className = "transaction-right";

    const amount = document.createElement("span");

    amount.className =
        "transaction-amount " +
        (item.type === "income" ? "income-text" : "expense-text");

    amount.textContent =
        (item.type === "income" ? "+ " : "- ") + rupiah(item.amount);

    right.appendChild(amount);

    if (showActions) {
        const actions = document.createElement("div");
        actions.className = "transaction-actions";

        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.type = "button";

        edit.addEventListener("click", () => openModal(item.id));

        const remove = document.createElement("button");
        remove.textContent = "Hapus";
        remove.type = "button";
        remove.className = "delete-btn";

        remove.addEventListener("click", () => deleteTransaction(item.id));

        actions.append(edit, remove);
        right.appendChild(actions);
    }

    row.append(info, right);

    return row;
}

// ==============================
// DASHBOARD
// ==============================

function updateDashboard() {
    const totals = getTotals();

    $("totalBalance").textContent = rupiah(totals.balance);
    $("totalIncome").textContent = rupiah(totals.income);
    $("totalExpense").textContent = rupiah(totals.expense);

    $("currentDate").textContent = new Date().toLocaleDateString(
        "id-ID",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );

    const list = $("transactionList");
    list.replaceChildren();

    const recent = [...transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    if (recent.length === 0) {
        showEmpty(list, "Belum ada transaksi. Tambahkan transaksi pertamamu.");
    } else {
        recent.forEach(item => {
            list.appendChild(createTransactionRow(item));
        });
    }

    updateFinanceChart();
}

// ==============================
// RIWAYAT TRANSAKSI
// ==============================

function renderActivity() {
    const totals = getTotals();

    $("transactionCount").textContent = transactions.length;
    $("activityBalance").textContent = rupiah(totals.balance);

    const search = $("searchTransaction").value.toLowerCase().trim();

    const filtered = transactions.filter(item => {
        const matchesFilter =
            currentFilter === "all" ||
            item.type === currentFilter;

        const text = [
            item.description,
            item.category,
            item.type,
            item.date
        ].join(" ").toLowerCase();

        return matchesFilter && text.includes(search);
    });

    $("activityResult").textContent = `${filtered.length} data`;

    const list = $("allTransactions");
    list.replaceChildren();

    if (filtered.length === 0) {
        showEmpty(list, "Transaksi tidak ditemukan.");
        return;
    }

    filtered.forEach(item => {
        list.appendChild(createTransactionRow(item, true));
    });
}

$("searchTransaction").addEventListener("input", renderActivity);

document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;

        document.querySelectorAll(".filter-btn").forEach(btn => {
            btn.classList.toggle("active", btn === button);
        });

        renderActivity();
    });
});

// ==============================
// GRAFIK
// ==============================

function chartTextColor() {
    return document.body.classList.contains("dark-mode")
        ? "#eeeeee"
        : "#555555";
}

function updateFinanceChart() {
    const canvas = $("financeChart");

    if (!canvas || typeof Chart === "undefined") return;

    const labels = [];
    const incomeData = [];
    const expenseData = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const dateString =
            date.getFullYear() + "-" +
            String(date.getMonth() + 1).padStart(2, "0") + "-" +
            String(date.getDate()).padStart(2, "0");

        labels.push(
            date.toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short"
            })
        );

        const daily = transactions.filter(item => item.date === dateString);

        incomeData.push(
            daily.filter(item => item.type === "income")
                .reduce((sum, item) => sum + item.amount, 0)
        );

        expenseData.push(
            daily.filter(item => item.type === "expense")
                .reduce((sum, item) => sum + item.amount, 0)
        );
    }

    if (financeChart) financeChart.destroy();

    financeChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Pemasukan",
                    data: incomeData,
                    borderColor: "#777777",
                    backgroundColor: "rgba(120,120,120,.12)",
                    tension: .4,
                    fill: true
                },
                {
                    label: "Pengeluaran",
                    data: expenseData,
                    borderColor: "#222222",
                    backgroundColor: "rgba(30,30,30,.08)",
                    tension: .4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: chartTextColor(),
                        usePointStyle: true
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: chartTextColor() },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: chartTextColor(),
                        callback: value => "Rp " + Number(value).toLocaleString("id-ID")
                    },
                    grid: { color: "rgba(130,130,130,.12)" }
                }
            }
        }
    });
}

function updateStatisticsChart() {
    const canvas = $("statisticsChart");

    if (!canvas || typeof Chart === "undefined") return;

    const totals = getTotals();

    if (statisticsChart) statisticsChart.destroy();

    statisticsChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["Pemasukan", "Pengeluaran"],
            datasets: [{
                data: [totals.income, totals.expense],
                backgroundColor: ["#999999", "#222222"],
                borderRadius: 9,
                maxBarThickness: 65
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: chartTextColor() },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: chartTextColor(),
                        callback: value => "Rp " + Number(value).toLocaleString("id-ID")
                    },
                    grid: { color: "rgba(130,130,130,.12)" }
                }
            }
        }
    });
}

function updateCategoryChart() {
    const canvas = $("categoryChart");

    if (!canvas || typeof Chart === "undefined") return;

    const expenses = transactions.filter(item => item.type === "expense");
    const grouped = {};

    expenses.forEach(item => {
        grouped[item.category] = (grouped[item.category] || 0) + item.amount;
    });

    const labels = Object.keys(grouped);
    const values = Object.values(grouped);

    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    const breakdown = $("categoryBreakdown");
    breakdown.replaceChildren();

    if (labels.length === 0) {
        breakdown.textContent = "Belum ada data pengeluaran.";
        return;
    }

    categoryChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "#222222", "#555555", "#888888", "#aaaaaa",
                    "#cccccc", "#444444", "#777777", "#dddddd"
                ],
                borderWidth: 2,
                borderColor: document.body.classList.contains("dark-mode")
                    ? "#1b1b1b"
                    : "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: chartTextColor(),
                        usePointStyle: true,
                        padding: 15
                    }
                }
            }
        }
    });

    labels.forEach((name, index) => {
        const row = document.createElement("div");
        row.className = "category-row";

        const title = document.createElement("span");
        title.textContent = name;

        const amount = document.createElement("strong");
        amount.textContent = rupiah(values[index]);

        row.append(title, amount);
        breakdown.appendChild(row);
    });
}

function updateCharts() {
    if (financeChart) updateFinanceChart();
    if (statisticsChart) updateStatisticsChart();
    if (categoryChart) updateCategoryChart();
}

// ==============================
// STATISTIK
// ==============================

function updateStatistics() {
    const totals = getTotals();

    $("statBalance").textContent = rupiah(totals.balance);
    $("statIncome").textContent = rupiah(totals.income);
    $("statExpense").textContent = rupiah(totals.expense);

    updateStatisticsChart();
    updateCategoryChart();

    const insight = $("financialInsight");

    if (transactions.length === 0) {
        insight.textContent =
            "Belum ada data transaksi. Tambahkan transaksi untuk melihat ringkasan keuangan.";
        return;
    }

    let message = "";

    if (totals.income > totals.expense) {
        message = "Pemasukanmu lebih besar daripada pengeluaran. Pertahankan pengelolaan keuangan yang baik.";
    } else if (totals.income < totals.expense) {
        message = "Pengeluaranmu lebih besar daripada pemasukan. Periksa kembali pengeluaran agar keuangan lebih teratur.";
    } else {
        message = "Jumlah pemasukan dan pengeluaranmu saat ini seimbang.";
    }

    insight.textContent =
        message +
        ` Total pemasukan ${rupiah(totals.income)} dan total pengeluaran ${rupiah(totals.expense)}.`;
}

// ==============================
// EKSPOR DATA
// ==============================

function exportData() {
    if (transactions.length === 0) {
        showError("Belum ada transaksi untuk diekspor.");
        return;
    }

    const data = {
        aplikasi: "FINICE Smart Finance",
        tanggalEkspor: new Date().toISOString(),
        transaksi: transactions
    };

    const file = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = "finice-transaksi.json";
    link.click();

    URL.revokeObjectURL(url);
}

$("exportData").addEventListener("click", exportData);
$("logoutButton").addEventListener("click", logout);

// ==============================
// PERBARUI TAMPILAN
// ==============================

function refreshAll() {
    updateDashboard();
    renderActivity();
    updateStatistics();
    loadProfile();
}

// ==============================
// MULAI APLIKASI
// ==============================

async function initApp() {
    try {
        if (typeof db === "undefined") {
            showError("Koneksi Supabase tidak ditemukan. Periksa config.js.");
            return;
        }

        applyTheme();

        const loggedIn = await checkLogin();

        if (!loggedIn) return;

        await loadTransactions();

        refreshAll();

        console.log("FINICE berhasil dijalankan.");

    } catch (error) {
        console.error("FINICE error:", error);

        showError(
            "Terjadi kesalahan saat menjalankan FINICE: " +
            (error.message || "Kesalahan tidak diketahui")
        );
    }
}

initApp();
