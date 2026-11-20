// FINICE - Smart Finance
const $ = id => document.getElementById(id);

const THEME_KEY = "finice_theme";
const CUSTOM_VALUE = "__custom";
const NEW_WALLET_VALUE = "__new_wallet";

const DEFAULT_CATEGORIES = {
    income: ["Salary", "Allowance", "Bonus", "Business", "Other"],
    expense: ["Food", "Transport", "Shopping", "Bills", "Education", "Health", "Other"]
};

const WALLET_PRESETS = [
    "Cash / Tunai", "GoPay", "OVO", "DANA", "ShopeePay",
    "LinkAja", "Jago", "SeaBank", "BCA", "BRI", "BNI", "Mandiri"
];

let transactions = [];
let wallets = [];
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function escapeText(value) {
    return String(value ?? "");
}

function getTotals() {
    const income = transactions
        .filter(t => t.type === "income")
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = transactions
        .filter(t => t.type === "expense")
        .reduce((sum, t) => sum + Number(t.amount), 0);

    const initial = wallets.reduce(
        (sum, wallet) => sum + Number(wallet.initial_balance || 0), 0
    );

    return {
        income,
        expense,
        balance: initial + income - expense
    };
}

function walletBalance(wallet) {
    return transactions
        .filter(t => String(t.wallet_id) === String(wallet.id))
        .reduce(
            (sum, t) => sum + (
                t.type === "income"
                    ? Number(t.amount)
                    : -Number(t.amount)
            ),
            Number(wallet.initial_balance || 0)
        );
}

function walletName(id) {
    const wallet = wallets.find(w => String(w.id) === String(id));
    return wallet ? wallet.name : "";
}

function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function showError(message) {
    alert(message);
}

// ==============================
// SUPABASE DATA
// ==============================

async function loadWallets() {
    const { data, error } = await db
        .from("wallets")
        .select("id, name, initial_balance")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Wallet error:", error);
        showError("Gagal memuat dompet: " + error.message);
        wallets = [];
        return;
    }

    wallets = (data || []).map(wallet => ({
        ...wallet,
        initial_balance: Number(wallet.initial_balance || 0)
    }));
}

async function loadTransactions() {
    const { data, error } = await db
        .from("transactions")
        .select("id, type, amount, category, description, date, wallet_id")
        .order("date", { ascending: false });

    if (error) {
        console.error("Transaction error:", error);
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

async function checkLogin() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        console.error(error);
        return null;
    }

    currentUser = data.session?.user || null;
    return currentUser;
}

async function logout() {
    const confirmed = confirm("Yakin ingin keluar dari akun FINICE?");
    if (!confirmed) return;

    const { error } = await db.auth.signOut();

    if (error) {
        showError("Gagal logout: " + error.message);
        return;
    }

    location.href = "login.html";
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
        button.classList.toggle("active", button.dataset.page === page);
    });

    if (page === "home") updateDashboard();
    if (page === "activity") renderActivity();
    if (page === "statistics") updateStatistics();
    if (page === "profile") loadProfile();

    window.scrollTo({ top: 0, behavior: "smooth" });
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

$("headerProfile")?.addEventListener("click", () => navigateTo("profile"));

// ==============================
// KATEGORI TRANSAKSI
// ==============================

function buildCategoryOptions(type, selected = "") {
    const select = $("category");
    select.replaceChildren();

    const defaults = DEFAULT_CATEGORIES[type] || [];

    const used = [
        ...new Set(
            transactions
                .filter(t => t.type === type)
                .map(t => t.category)
        )
    ].filter(category => !defaults.includes(category));

    const all = [...defaults, ...used];

    if (selected && !all.includes(selected)) {
        all.push(selected);
    }

    all.forEach(name => addOption(select, name, name));
    addOption(select, CUSTOM_VALUE, "Custom - Tulis sendiri");

    select.value = selected && all.includes(selected)
        ? selected
        : (all[0] || CUSTOM_VALUE);

    toggleCustomCategory();
}

function toggleCustomCategory() {
    const isCustom = $("category").value === CUSTOM_VALUE;

    $("customCategory").classList.toggle("hidden-field", !isCustom);

    if (isCustom) {
        $("customCategory").focus();
    }
}

$("type").addEventListener("change", () => {
    buildCategoryOptions($("type").value);
});

$("category").addEventListener("change", toggleCustomCategory);

// ==============================
// PILIHAN DOMPET
// ==============================

function buildWalletOptions(selected = "") {
    const select = $("walletSelect");
    select.replaceChildren();

    addOption(select, "", "— Tanpa dompet —");

    wallets.forEach(wallet => {
        addOption(
            select,
            wallet.id,
            `${wallet.name} (${rupiah(walletBalance(wallet))})`
        );
    });

    addOption(select, NEW_WALLET_VALUE, "+ Tambah dompet baru");

    select.value = selected && wallets.some(
        wallet => String(wallet.id) === String(selected)
    )
        ? String(selected)
        : (wallets[0] ? String(wallets[0].id) : "");
}

$("walletSelect").addEventListener("change", () => {
    if ($("walletSelect").value === NEW_WALLET_VALUE) {
        $("walletSelect").value = "";
        openWalletModal();
    }
});

// ==============================
// MODAL TRANSAKSI
// ==============================

function openModal(id = null) {
    $("transactionForm").reset();
    $("editId").value = "";
    $("customCategory").value = "";
    $("modalTitle").textContent = "Add Transaction";

    if (id !== null) {
        const item = transactions.find(
            transaction => String(transaction.id) === String(id)
        );

        if (!item) return;

        $("editId").value = item.id;
        $("type").value = item.type;

        buildCategoryOptions(item.type, item.category);
        buildWalletOptions(item.wallet_id || "");

        $("amount").value = item.amount;
        $("description").value = item.description || "";
        $("date").value = item.date;

        $("modalTitle").textContent = "Edit Transaction";
    } else {
        $("type").value = "income";
        buildCategoryOptions("income");
        buildWalletOptions();
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

// ==============================
// SIMPAN TRANSAKSI
// ==============================

$("transactionForm").addEventListener("submit", async event => {
    event.preventDefault();

    const idValue = $("editId").value;
    const amount = Number($("amount").value);
    const type = $("type").value;
    const description = $("description").value.trim();
    const date = $("date").value;
    const walletId = $("walletSelect").value || null;

    let category = $("category").value;

    if (category === CUSTOM_VALUE) {
        category = $("customCategory").value.trim();

        if (!category) {
            showError("Tulis nama kategori terlebih dahulu.");
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

    const payload = {
        type,
        amount,
        category,
        description,
        date,
        wallet_id: walletId
    };

    const button = event.target.querySelector(".submit-button");
    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        let result;

        if (idValue) {
            result = await db
                .from("transactions")
                .update(payload)
                .eq("id", idValue)
                .select()
                .single();
        } else {
            result = await db
                .from("transactions")
                .insert(payload)
                .select()
                .single();
        }

        if (result.error) {
            showError("Gagal menyimpan transaksi: " + result.error.message);
            return;
        }

        const saved = {
            ...result.data,
            amount: Number(result.data.amount),
            description: result.data.description || ""
        };

        if (idValue) {
            const index = transactions.findIndex(
                item => String(item.id) === String(idValue)
            );

            if (index !== -1) transactions[index] = saved;
        } else {
            transactions.push(saved);
        }

        refreshAll();
        closeModal();

    } catch (error) {
        console.error(error);
        showError("Terjadi kesalahan saat menyimpan transaksi.");
    } finally {
        button.disabled = false;
        button.textContent = "Save Transaction";
    }
});

// ==============================
// HAPUS TRANSAKSI
// ==============================

async function deleteTransaction(id) {
    if (!confirm("Yakin ingin menghapus transaksi ini?")) return;

    const { error } = await db
        .from("transactions")
        .delete()
        .eq("id", id);

    if (error) {
        showError("Gagal menghapus transaksi: " + error.message);
        return;
    }

    transactions = transactions.filter(
        item => String(item.id) !== String(id)
    );

    refreshAll();
}

// ==============================
// MODAL DOMPET
// ==============================

function buildWalletPresetOptions(selected = "") {
    const select = $("walletPreset");
    select.replaceChildren();

    WALLET_PRESETS.forEach(name => addOption(select, name, name));
    addOption(select, CUSTOM_VALUE, "Custom - Tulis sendiri");

    if (selected && !WALLET_PRESETS.includes(selected)) {
        select.value = CUSTOM_VALUE;
        $("walletCustomName").value = selected;
    } else {
        select.value = selected || WALLET_PRESETS[0];
        $("walletCustomName").value = "";
    }

    toggleCustomWallet();
}

function toggleCustomWallet() {
    const isCustom = $("walletPreset").value === CUSTOM_VALUE;

    $("walletCustomName").classList.toggle("hidden-field", !isCustom);

    if (isCustom) $("walletCustomName").focus();
}

$("walletPreset").addEventListener("change", toggleCustomWallet);

function openWalletModal(id = null) {
    $("walletForm").reset();
    $("walletEditId").value = "";
    $("walletModalTitle").textContent = "Tambah Dompet";

    if (id !== null) {
        const wallet = wallets.find(
            item => String(item.id) === String(id)
        );

        if (!wallet) return;

        $("walletEditId").value = wallet.id;
        buildWalletPresetOptions(wallet.name);
        $("walletBalance").value = wallet.initial_balance;
        $("walletModalTitle").textContent = "Edit Dompet";
    } else {
        buildWalletPresetOptions();
        $("walletBalance").value = 0;
    }

    $("walletModal").classList.add("show");
}

function closeWalletModal() {
    $("walletModal").classList.remove("show");
}

$("addWallet").addEventListener("click", () => openWalletModal());
$("closeWalletModal").addEventListener("click", closeWalletModal);

$("walletModal").addEventListener("click", event => {
    if (event.target === $("walletModal")) closeWalletModal();
});

// ==============================
// SIMPAN DOMPET
// ==============================

$("walletForm").addEventListener("submit", async event => {
    event.preventDefault();

    const idValue = $("walletEditId").value;
    const balance = Number($("walletBalance").value);

    let name = $("walletPreset").value;

    if (name === CUSTOM_VALUE) {
        name = $("walletCustomName").value.trim();
    }

    if (!name) {
        showError("Masukkan nama dompet.");
        return;
    }

    if (!Number.isSafeInteger(balance) || balance < 0) {
        showError("Saldo harus berupa angka 0 atau lebih.");
        return;
    }

    const payload = {
        name,
        initial_balance: balance
    };

    const button = event.target.querySelector(".submit-button");
    button.disabled = true;
    button.textContent = "Menyimpan...";

    try {
        const result = idValue
            ? await db.from("wallets")
                .update(payload)
                .eq("id", idValue)
                .select()
                .single()
            : await db.from("wallets")
                .insert(payload)
                .select()
                .single();

        if (result.error) {
            showError("Gagal menyimpan dompet: " + result.error.message);
            return;
        }

        const saved = {
            ...result.data,
            initial_balance: Number(result.data.initial_balance)
        };

        if (idValue) {
            const index = wallets.findIndex(
                wallet => String(wallet.id) === String(idValue)
            );

            if (index !== -1) wallets[index] = saved;
        } else {
            wallets.push(saved);
        }

        const transactionOpen = $("transactionModal").classList.contains("show");

        refreshAll();

        if (transactionOpen) {
            buildWalletOptions(saved.id);
        }

        closeWalletModal();

    } catch (error) {
        console.error(error);
        showError("Terjadi kesalahan saat menyimpan dompet.");
    } finally {
        button.disabled = false;
        button.textContent = "Simpan Dompet";
    }
});

// ==============================
// HAPUS DOMPET
// ==============================

async function deleteWallet(id) {
    const wallet = wallets.find(
        item => String(item.id) === String(id)
    );

    if (!wallet) return;

    const confirmed = confirm(
        `Hapus dompet "${wallet.name}"?\nTransaksi yang terhubung akan tetap disimpan.`
    );

    if (!confirmed) return;

    // Lepaskan hubungan transaksi sebelum menghapus dompet.
    const { error: updateError } = await db
        .from("transactions")
        .update({ wallet_id: null })
        .eq("wallet_id", id);

    if (updateError) {
        showError("Gagal memperbarui transaksi: " + updateError.message);
        return;
    }

    const { error } = await db
        .from("wallets")
        .delete()
        .eq("id", id);

    if (error) {
        showError("Gagal menghapus dompet: " + error.message);
        return;
    }

    wallets = wallets.filter(
        item => String(item.id) !== String(id)
    );

    transactions.forEach(item => {
        if (String(item.wallet_id) === String(id)) {
            item.wallet_id = null;
        }
    });

    refreshAll();
}

// ==============================
// TAMPILKAN DOMPET
// ==============================

function renderWallets() {
    const list = $("walletList");
    list.replaceChildren();

    if (wallets.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Belum ada dompet. Tambahkan dompet pertamamu.";
        list.appendChild(empty);
        return;
    }

    wallets.forEach(wallet => {
        const row = document.createElement("div");
        row.className = "transaction-item";

        const info = document.createElement("div");
        info.className = "transaction-info";

        const icon = document.createElement("div");
        icon.className = "wallet-icon-sm";
        icon.textContent = wallet.name.charAt(0).toUpperCase();

        const details = document.createElement("div");

        const title = document.createElement("h4");
        title.textContent = wallet.name;

        const subtitle = document.createElement("p");
        const count = transactions.filter(
            t => String(t.wallet_id) === String(wallet.id)
        ).length;

        subtitle.textContent = `${count} transaksi`;

        details.append(title, subtitle);
        info.append(icon, details);

        const right = document.createElement("div");
        right.className = "wallet-right";

        const amount = document.createElement("span");
        const balance = walletBalance(wallet);

        amount.className = "wallet-balance" + (balance < 0 ? " minus" : "");
        amount.textContent = rupiah(balance);

        const actions = document.createElement("div");
        actions.className = "transaction-actions";

        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.addEventListener("click", () => openWalletModal(wallet.id));

        const remove = document.createElement("button");
        remove.textContent = "Delete";
        remove.className = "delete-btn";
        remove.addEventListener("click", () => deleteWallet(wallet.id));

        actions.append(edit, remove);
        right.append(amount, actions);
        row.append(info, right);
        list.appendChild(row);
    });
}

// ==============================
// BARIS TRANSAKSI
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
    const name = walletName(item.wallet_id);

    subtitle.textContent = [
        item.category,
        name,
        item.date
    ].filter(Boolean).join(" • ");

    details.append(title, subtitle);
    info.append(icon, details);

    const right = document.createElement("div");
    right.className = "transaction-right";

    const amount = document.createElement("span");
    amount.className = "transaction-amount";
    amount.textContent =
        (item.type === "income" ? "+ " : "- ") + rupiah(item.amount);

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

function sortByDateDesc(a, b) {
    return String(b.date).localeCompare(String(a.date));
}

// ==============================
// DASHBOARD
// ==============================

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

    sorted.slice(0, 5).forEach(item => {
        list.appendChild(createTransactionRow(item));
    });
}

function updateDashboard() {
    const totals = getTotals();

    $("totalBalance").textContent = rupiah(totals.balance);
    $("totalIncome").textContent = rupiah(totals.income);
    $("totalExpense").textContent = rupiah(totals.expense);

    $("currentDate").textContent = new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    renderWallets();
    renderRecentTransactions();
    updateFinanceChart();
}

// ==============================
// ACTIVITY
// ==============================

function renderActivity() {
    const list = $("allTransactions");
    list.replaceChildren();

    const search = $("searchTransaction").value.toLowerCase().trim();

    let filtered = [...transactions];

    if (currentFilter !== "all") {
        filtered = filtered.filter(t => t.type === currentFilter);
    }

    filtered = filtered.filter(t => {
        const text = [
            t.description,
            t.category,
            walletName(t.wallet_id),
            t.date
        ].join(" ").toLowerCase();

        return text.includes(search);
    });

    filtered.sort(sortByDateDesc);

    const totals = getTotals();

    $("transactionCount").textContent = transactions.length;
    $("activityBalance").textContent = rupiah(totals.balance);
    $("activityResult").textContent = `${filtered.length} items`;

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Tidak ada transaksi yang ditemukan.";
        list.appendChild(empty);
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

        document.querySelectorAll(".filter-btn").forEach(item => {
            item.classList.toggle("active", item === button);
        });

        renderActivity();
    });
});

// ==============================
// GRAFIK
// ==============================

function chartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: document.body.classList.contains("dark-mode")
                        ? "#ffffff"
                        : "#333333",
                    usePointStyle: true
                }
            }
        },
        scales: {
            x: {
                ticks: { color: " #888888" },
                grid: { display: false }
            },
            y: {
                ticks: { color: "#888888" },
                grid: { color: "rgba(128,128,128,.12)" }
            }
        }
    };
}

function updateFinanceChart() {
    if (typeof Chart === "undefined") return;

    const canvas = $("financeChart");
    if (!canvas) return;

    const labels = [];
    const incomeData = [];
    const expenseData = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");

        labels.push(date.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short"
        }));

        incomeData.push(
            transactions
                .filter(t => t.date === key && t.type === "income")
                .reduce((sum, t) => sum + t.amount, 0)
        );

        expenseData.push(
            transactions
                .filter(t => t.date === key && t.type === "expense")
                .reduce((sum, t) => sum + t.amount, 0)
        );
    }

    if (financeChart) financeChart.destroy();

    financeChart = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Income",
                    data: incomeData,
                    borderColor: "#777777",
                    backgroundColor: "rgba(150,150,150,.12)",
                    tension: .35,
                    fill: true
                },
                {
                    label: "Expense",
                    data: expenseData,
                    borderColor: "#111111",
                    backgroundColor: "rgba(30,30,30,.08)",
                    tension: .35,
                    fill: true
                }
            ]
        },
        options: chartDefaults()
    });
}

function updateStatistics() {
    const totals = getTotals();

    $("statBalance").textContent = rupiah(totals.balance);
    $("statIncome").textContent = rupiah(totals.income);
    $("statExpense").textContent = rupiah(totals.expense);

    updateStatisticsChart();
    updateCategoryChart();
    updateFinancialInsight();
}

function updateStatisticsChart() {
    if (typeof Chart === "undefined") return;

    const canvas = $("statisticsChart");
    if (!canvas) return;

    if (statisticsChart) statisticsChart.destroy();

    const totals = getTotals();

    statisticsChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["Income", "Expense"],
            datasets: [{
                label: "Total",
                data: [totals.income, totals.expense],
                backgroundColor: ["#999999", "#222222"],
                borderRadius: 8
            }]
        },
        options: {
            ...chartDefaults(),
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function updateCategoryChart() {
    if (typeof Chart === "undefined") return;

    const canvas = $("categoryChart");
    const breakdown = $("categoryBreakdown");

    if (!canvas || !breakdown) return;

    const expenses = transactions.filter(t => t.type === "expense");
    const categories = {};

    expenses.forEach(item => {
        categories[item.category] =
            (categories[item.category] || 0) + item.amount;
    });

    const labels = Object.keys(categories);
    const values = Object.values(categories);

    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: labels.length ? labels : ["Belum ada data"],
            datasets: [{
                data: values.length ? values : [1],
                backgroundColor: [
                    "#222222", "#555555", "#888888",
                    "#aaaaaa", "#cccccc", "#eeeeee", "#777777"
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { usePointStyle: true }
                }
            }
        }
    });

    breakdown.replaceChildren();

    if (labels.length === 0) {
        breakdown.textContent = "Belum ada pengeluaran.";
        return;
    }

    labels
        .sort((a, b) => categories[b] - categories[a])
        .forEach(name => {
            const row = document.createElement("div");
            row.className = "category-row";

            const title = document.createElement("span");
            title.textContent = name;

            const amount = document.createElement("strong");
            amount.textContent = rupiah(categories[name]);

            row.append(title, amount);
            breakdown.appendChild(row);
        });
}

function updateFinancialInsight() {
    const box = $("financialInsight");
    const totals = getTotals();

    if (transactions.length === 0) {
        box.textContent = "Belum ada data transaksi. Tambahkan transaksi untuk melihat ringkasan keuangan.";
        return;
    }

    const difference = totals.income - totals.expense;

    if (difference > 0) {
        box.textContent =
            `Pemasukanmu lebih besar daripada pengeluaran sebesar ${rupiah(difference)}. Pertahankan pengelolaan keuangan yang baik.`;
    } else if (difference < 0) {
        box.textContent =
            `Pengeluaranmu lebih besar daripada pemasukan sebesar ${rupiah(Math.abs(difference))}. Periksa kembali pengeluaranmu.`;
    } else {
        box.textContent =
            "Total pemasukan dan pengeluaranmu seimbang.";
    }
}

// ==============================
// PROFIL
// ==============================

function loadProfile() {
    const user = currentUser;

    if (!user) {
        $("profileName").textContent = "Finice User";
        $("profileEmail").textContent = "Pengguna FINICE";
        $("userName").value = "";
        $("userEmail").value = "";
        return;
    }

    const name = user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "Finice User";

    $("profileName").textContent = name;
    $("profileEmail").textContent = user.email || "";
    $("profileAvatar").textContent = name.charAt(0).toUpperCase();
    $("headerProfile").textContent = name.charAt(0).toUpperCase();

    $("userName").value = name === "Finice User" ? "" : name;
    $("userEmail").value = user.email || "";
}

$("profileForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
        showError("Silakan login terlebih dahulu.");
        return;
    }

    const name = $("userName").value.trim();

    if (!name) {
        showError("Nama tidak boleh kosong.");
        return;
    }

    const { data, error } = await db.auth.updateUser({
        data: { full_name: name }
    });

    if (error) {
        showError("Gagal menyimpan profil: " + error.message);
        return;
    }

    currentUser = data.user;
    loadProfile();
    showError("Profil berhasil diperbarui.");
});

// ==============================
// MODE GELAP
// ==============================

function applyTheme(theme) {
    const isDark = theme === "dark";

    document.body.classList.toggle("dark-mode", isDark);

    $("themeToggle").textContent = isDark ? "☀" : "☾";
    $("profileTheme").textContent = isDark ? "ON" : "OFF";

    localStorage.setItem(THEME_KEY, theme);

    if (financeChart || statisticsChart || categoryChart) {
        updateDashboard();
        updateStatistics();
    }
}

function toggleTheme() {
    const isDark = document.body.classList.contains("dark-mode");
    applyTheme(isDark ? "light" : "dark");
}

$("themeToggle").addEventListener("click", toggleTheme);
$("profileTheme").addEventListener("click", toggleTheme);

// ==============================
// EXPORT DATA
// ==============================

$("exportData").addEventListener("click", () => {
    const data = {
        application: "FINICE Smart Finance",
        exported_at: new Date().toISOString(),
        wallets,
        transactions
    };

    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `finice-backup-${localDate()}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});

// ==============================
// TOMBOL LOGOUT
// ==============================

function createLogoutButton() {
    const section = $("profilePage");
    if (!section || $("logoutButton")) return;

    const button = document.createElement("button");
    button.id = "logoutButton";
    button.type = "button";
    button.className = "secondary-button full-button";
    button.textContent = "Log Out";
    button.addEventListener("click", logout);

    section.appendChild(button);
}

// ==============================
// REFRESH DATA
// ==============================

function refreshAll() {
    updateDashboard();
    updateStatistics();
    renderActivity();
}

// ==============================
// INISIALISASI APLIKASI
// ==============================

async function initializeApp() {
    try {
        if (!window.supabase || typeof db === "undefined") {
            throw new Error("Supabase belum berhasil dimuat. Periksa config.js.");
        }

        applyTheme(localStorage.getItem(THEME_KEY) || "light");

        currentUser = await checkLogin();

        await loadWallets();
        await loadTransactions();

        refreshAll();
        loadProfile();
        createLogoutButton();

        buildCategoryOptions("income");
        buildWalletOptions();

    } catch (error) {
        console.error("FINICE initialization error:", error);
        showError(
            "FINICE gagal dimuat: " + error.message +
            "\nPeriksa koneksi internet dan konfigurasi Supabase."
        );
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);
