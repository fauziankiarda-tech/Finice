// @ts-nocheck
const $ = id => document.getElementById(id);

const THEME_KEY = "finice_theme";

// Kategori bawaan mengikuti jenis transaksi
const DEFAULT_CATEGORIES = {
    income: ["Salary", "Allowance", "Bonus", "Business", "Other"],
    expense: ["Food", "Transport", "Shopping", "Bills", "Education", "Health", "Other"]
};

// Pilihan cepat untuk dompet / e-wallet
const WALLET_PRESETS = [
    "Cash / Tunai", "GoPay", "OVO", "DANA", "ShopeePay", "LinkAja",
    "Jago", "SeaBank", "BCA", "BRI", "BNI", "Mandiri"
];

const CUSTOM_VALUE = "__custom";
const NEW_WALLET_VALUE = "__new_wallet";

let transactions = [];
let wallets = [];
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
    const initial = wallets.reduce((sum, w) => sum + w.initial_balance, 0);
    return { income, expense, balance: initial + income - expense };
}

function walletBalance(wallet) {
    return transactions
        .filter(t => t.wallet_id === wallet.id)
        .reduce(
            (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
            wallet.initial_balance
        );
}

function walletName(id) {
    const wallet = wallets.find(w => w.id === id);
    return wallet ? wallet.name : "";
}

function refreshAll() {
    updateDashboard();
    updateStatistics();
    renderActivity();
}

// ===== BACKEND (SUPABASE) =====

async function loadWallets() {
    const { data, error } = await db
        .from("wallets")
        .select("id, name, initial_balance")
        .order("created_at", { ascending: true });

    if (error) {
        alert("Gagal memuat dompet: " + error.message +
            "\n\nPastikan file supabase-wallets.sql sudah dijalankan di Supabase.");
        wallets = [];
        return;
    }

    wallets = (data || []).map(w => ({
        ...w,
        initial_balance: Number(w.initial_balance)
    }));
}

async function loadTransactions() {
    const { data, error } = await db
        .from("transactions")
        .select("id, type, amount, category, description, date, wallet_id")
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

// ===== PILIHAN KATEGORI (MENGIKUTI JENIS TRANSAKSI) =====

function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function buildCategoryOptions(type, selected = "") {
    const select = $("category");
    select.replaceChildren();

    const defaults = DEFAULT_CATEGORIES[type] || [];
    const used = [...new Set(
        transactions.filter(t => t.type === type).map(t => t.category)
    )].filter(c => !defaults.includes(c));

    // Kategori buatan sendiri yang pernah dipakai muncul lagi sebagai pilihan
    const all = [...defaults, ...used];
    if (selected && !all.includes(selected)) all.push(selected);

    all.forEach(name => addOption(select, name, name));
    addOption(select, CUSTOM_VALUE, "✎ Custom (tulis sendiri)...");

    select.value = selected && all.includes(selected) ? selected : all[0];
    toggleCustomCategory();
}

function toggleCustomCategory() {
    const custom = $("category").value === CUSTOM_VALUE;
    $("customCategory").classList.toggle("hidden-field", !custom);
    if (custom) $("customCategory").focus();
}

$("type").addEventListener("change", () => buildCategoryOptions($("type").value));
$("category").addEventListener("change", toggleCustomCategory);

// ===== PILIHAN DOMPET DI FORM TRANSAKSI =====

function buildWalletOptions(selected = "") {
    const select = $("walletSelect");
    select.replaceChildren();

    addOption(select, "", "— Tanpa dompet —");
    wallets.forEach(w => addOption(select, w.id, `${w.name} (${rupiah(walletBalance(w))})`));
    addOption(select, NEW_WALLET_VALUE, "+ Tambah dompet baru...");

    select.value = selected && wallets.some(w => w.id === selected)
        ? selected
        : (wallets[0] ? wallets[0].id : "");
}

$("walletSelect").addEventListener("change", () => {
    if ($("walletSelect").value === NEW_WALLET_VALUE) {
        $("walletSelect").value = "";
        openWalletModal();
    }
});

// ===== MODAL TRANSAKSI =====

function openModal(id = null) {
    $("transactionForm").reset();
    $("editId").value = "";
    $("customCategory").value = "";
    $("modalTitle").textContent = "Add Transaction";

    if (id !== null) {
        const item = transactions.find(t => t.id === id);
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
        buildCategoryOptions($("type").value);
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

// ===== SIMPAN DAN EDIT TRANSAKSI =====

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
            alert("Tulis nama kategori sendiri.");
            return;
        }
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        alert("Masukkan nominal yang valid.");
        return;
    }
    if (!date) {
        alert("Silakan pilih tanggal.");
        return;
    }

    const payload = { type, amount, category, description, date, wallet_id: walletId };
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

// ===== DOMPET & E-WALLET =====

function buildWalletPresetOptions(selected = "") {
    const select = $("walletPreset");
    select.replaceChildren();

    WALLET_PRESETS.forEach(name => addOption(select, name, name));
    addOption(select, CUSTOM_VALUE, "✎ Custom (tulis sendiri)...");

    if (selected && !WALLET_PRESETS.includes(selected)) {
        select.value = CUSTOM_VALUE;
        $("walletCustomName").value = selected;
    } else {
        select.value = selected || WALLET_PRESETS[1];
        $("walletCustomName").value = "";
    }
    toggleCustomWallet();
}

function toggleCustomWallet() {
    const custom = $("walletPreset").value === CUSTOM_VALUE;
    $("walletCustomName").classList.toggle("hidden-field", !custom);
}

$("walletPreset").addEventListener("change", () => {
    toggleCustomWallet();
    if ($("walletPreset").value === CUSTOM_VALUE) $("walletCustomName").focus();
});

function openWalletModal(id = null) {
    $("walletForm").reset();
    $("walletEditId").value = "";
    $("walletModalTitle").textContent = "Tambah Dompet";

    if (id !== null) {
        const wallet = wallets.find(w => w.id === id);
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

$("walletForm").addEventListener("submit", async event => {
    event.preventDefault();

    const idValue = $("walletEditId").value;
    const balance = Number($("walletBalance").value);

    let name = $("walletPreset").value;
    if (name === CUSTOM_VALUE) name = $("walletCustomName").value.trim();

    if (!name) {
        alert("Tulis nama dompet.");
        return;
    }
    if (!Number.isSafeInteger(balance) || balance < 0) {
        alert("Masukkan saldo yang valid (0 atau lebih).");
        return;
    }

    const payload = { name, initial_balance: balance };
    const submitBtn = event.target.querySelector(".submit-button");
    submitBtn.disabled = true;

    try {
        const result = idValue
            ? await db.from("wallets").update(payload).eq("id", idValue).select().single()
            : await db.from("wallets").insert(payload).select().single();

        if (result.error) {
            alert("Gagal menyimpan dompet: " + result.error.message);
            return;
        }

        const saved = {
            ...result.data,
            initial_balance: Number(result.data.initial_balance)
        };

        if (idValue) {
            const index = wallets.findIndex(w => w.id === idValue);
            if (index !== -1) wallets[index] = saved;
        } else {
            wallets.push(saved);
        }

        // Jika dompet dibuat dari form transaksi, langsung pilih dompet itu
        const transactionOpen = $("transactionModal").classList.contains("show");
        refreshAll();
        if (transactionOpen) buildWalletOptions(saved.id);
        closeWalletModal();
    } finally {
        submitBtn.disabled = false;
    }
});

async function deleteWallet(id) {
    const wallet = wallets.find(w => w.id === id);
    if (!wallet) return;

    const ok = confirm(
        `Hapus dompet "${wallet.name}"?\n\nTransaksinya tetap ada, tetapi tidak lagi terhubung ke dompet ini.`
    );
    if (!ok) return;

    const { error } = await db.from("wallets").delete().eq("id", id);
    if (error) {
        alert("Gagal menghapus dompet: " + error.message);
        return;
    }

    wallets = wallets.filter(w => w.id !== id);
    transactions.forEach(t => {
        if (t.wallet_id === id) t.wallet_id = null;
    });
    refreshAll();
}

function renderWallets() {
    const list = $("walletList");
    list.replaceChildren();

    if (wallets.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Belum ada dompet. Tambahkan saldo e-wallet atau rekeningmu.";
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
        const count = transactions.filter(t => t.wallet_id === wallet.id).length;
        subtitle.textContent = `${count} transaksi`;
        details.append(title, subtitle);
        info.append(icon, details);

        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "9px";

        const balance = walletBalance(wallet);
        const amount = document.createElement("span");
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
    const wName = walletName(item.wallet_id);
    subtitle.textContent = [item.category, wName, item.date].filter(Boolean).join(" • ");

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

    renderWallets();
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
        `${t.description} ${t.category} ${walletName(t.wallet_id)} ${t.date}`
            .toLowerCase()
            .includes(search)
    );

    filtered.sort(sortByDateDesc);

    const totals = getTotals();
    $("transactionCount").textContent = transactions.length;
    $("activityBalance").textContent = rupiah(totals.balance);
    $("activityResult").textContent = filtered.length + " items";

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
       
