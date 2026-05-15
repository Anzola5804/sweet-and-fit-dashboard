// Sweet&Fit - Financial Dashboard Logic
// Concept: Minimalism, Dual Currency (Bs/$), Real-time BCV Tasa

// --- CONFIG & INITIAL DATA ---
const CONFIG = {
    API_BCV: 'https://ve.dolarapi.com/v1/dolares/oficial',
    APP_STORAGE_KEY: 'sweet_bite_data',
    DEFAULTS: {
        rate: 37.0, // Fallback rate
        products: [
            { id: 1, name: 'Torta Brownie Keto', price: 30.00, cost: 18.15, emoji: '🍫', unit: 'Bandeja' },
            { id: 2, name: 'Torta TORRE Keto', price: 35.00, cost: 20.17, emoji: '🏆', unit: 'Bandeja' },
            { id: 3, name: 'Brownie Individual', price: 2.50, cost: 1.69, emoji: '🎯', unit: 'Unidad' }
        ],
        ingredients: [
            { name: 'Huevos (4 und)', cost: 1.20 },
            { name: 'Monkfruit (50g)', cost: 1.65 },
            { name: 'Chocolate Barra (120g)', cost: 4.32 },
            { name: 'Harina Almendra (120g)', cost: 3.53 },
            { name: 'Chispas Chocolate (40g)', cost: 1.68 },
            { name: 'Vainilla (15ml)', cost: 0.12 },
            { name: 'Cacao (5g)', cost: 0.11 },
            { name: 'Polvo Hornear (9g)', cost: 0.90 },
            { name: 'Aceite Coco (3ml)', cost: 0.03 }
        ],
        fixedCosts: [
            { id: Date.now(), desc: 'Marketing/Redes', amount: 15.00 }
        ]
    }
};

let state = {
    rate: CONFIG.DEFAULTS.rate,
    sales: [],
    production: [],
    inventory: 0, // In units (brownies)
    fixedCosts: [...CONFIG.DEFAULTS.fixedCosts],
    products: [...CONFIG.DEFAULTS.products],
    ingredients: [...CONFIG.DEFAULTS.ingredients],
    activePage: 'dashboard',
    activePeriod: 'month',
    tutorialSeen: false
};

// --- CORE FUNCTIONS ---

function init() {
    loadState();
    fetchRate();
    setupEventListeners();
    renderAll();
    initChart();
    
    if (!state.tutorialSeen) {
        setTimeout(startTutorial, 1500);
    }
}

function loadState() {
    const saved = localStorage.getItem(CONFIG.APP_STORAGE_KEY);
    if (saved) {
        state = { ...state, ...JSON.parse(saved) };
    }
}

function saveState() {
    localStorage.setItem(CONFIG.APP_STORAGE_KEY, JSON.stringify(state));
}

async function fetchRate() {
    try {
        const res = await fetch(CONFIG.API_BCV);
        const data = await res.json();
        if (data && data.promedio) {
            state.rate = data.promedio;
            updateRateUI();
            showToast('Tasa BCV actualizada: ' + state.rate.toFixed(2) + ' Bs/$', 'info');
        }
    } catch (e) {
        console.error('Error fetching BCV rate', e);
        showToast('Error al conectar con BCV. Usando tasa manual.', 'warning');
    }
    updateRateUI();
}

function updateRateUI() {
    const els = ['bcv-rate-sidebar', 'bcv-rate-top'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = state.rate.toFixed(2) + ' Bs';
    });
    const rateInput = document.getElementById('sale-rate');
    if (rateInput) rateInput.value = state.rate.toFixed(2);
}

// --- UI RENDERING ---

function renderAll() {
    renderDashboard();
    renderSales();
    renderInventory();
    renderCosts();
    renderSettings();
}

function renderDashboard() {
    const period = state.activePeriod;
    const now = new Date();
    
    const filteredSales = state.sales.filter(s => {
        const sDate = new Date(s.date);
        if (period === 'today') return sDate.toDateString() === now.toDateString();
        if (period === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return sDate >= weekAgo;
        }
        if (period === 'month') return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
        return true;
    });

    // Totals
    const income = filteredSales.reduce((sum, s) => sum + (s.price * s.qty), 0);
    const variableCost = filteredSales.reduce((sum, s) => sum + (s.cost * s.qty), 0);
    
    // Fixed cost proportionally
    let fixedCost = state.fixedCosts.reduce((sum, c) => sum + c.amount, 0);
    if (period === 'today') fixedCost /= 30;
    if (period === 'week') fixedCost = (fixedCost / 30) * 7;

    const profit = income - variableCost - fixedCost;
    const margin = income > 0 ? (profit / income) * 100 : 0;

    // Update KPI UI
    document.getElementById('kpi-income').textContent = `$ ${income.toFixed(2)}`;
    document.getElementById('kpi-income-bs').textContent = `Bs ${(income * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    
    document.getElementById('kpi-cost-var').textContent = `$ ${variableCost.toFixed(2)}`;
    document.getElementById('kpi-cost-var-bs').textContent = `Bs ${(variableCost * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    
    document.getElementById('kpi-cost-fixed').textContent = `$ ${fixedCost.toFixed(2)}`;
    document.getElementById('kpi-cost-fixed-bs').textContent = `Bs ${(fixedCost * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    
    const profitEl = document.getElementById('kpi-profit');
    profitEl.textContent = `$ ${profit.toFixed(2)}`;
    profitEl.parentElement.style.borderColor = profit >= 0 ? 'var(--aqua)' : 'var(--danger)';
    document.getElementById('kpi-profit-bs').textContent = `Bs ${(profit * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;

    const stockEl = document.getElementById('kpi-stock');
    if (stockEl) stockEl.textContent = state.inventory;

    // Margin Card
    const marginCard = document.getElementById('margin-card');
    const marginPctEl = document.getElementById('margin-pct');
    const marginStatus = document.getElementById('margin-status');
    
    marginPctEl.textContent = `${margin.toFixed(1)}%`;
    
    if (income === 0) {
        marginCard.style.background = 'var(--choco-mid)';
        marginStatus.textContent = "Registra ventas para ver tu rendimiento";
    } else if (margin >= 0) {
        marginCard.style.background = 'var(--aqua)';
        if (margin > 30) marginStatus.textContent = "¡Excelente rendimiento! Tu negocio es muy rentable.";
        else if (margin > 15) marginStatus.textContent = "Buen margen, pero vigila tus costos variables.";
        else marginStatus.textContent = "Margen bajo. Considera revisar tus precios o reducir costos.";
    } else {
        marginCard.style.background = 'var(--danger)';
        marginStatus.textContent = "⚠️ Operando a pérdida. Revisa tus costos fijos y precios.";
    }

    updateChart();

    // Product breakdown
    state.products.forEach(p => {
        const pSales = filteredSales.filter(s => s.productId === p.id);
        const pQty = pSales.reduce((sum, s) => sum + s.qty, 0);
        const pRev = pSales.reduce((sum, s) => sum + (s.price * s.qty), 0);
        
        const qtyId = `stat-qty-${p.id}`;
        const revId = `stat-rev-${p.id}`;
        if (document.getElementById(qtyId)) document.getElementById(qtyId).textContent = pQty;
        if (document.getElementById(revId)) document.getElementById(revId).textContent = `$ ${pRev.toFixed(2)}`;
    });
}

function renderSales() {
    const list = document.getElementById('sales-list');
    const empty = document.getElementById('sales-empty');
    if (!list) return;

    if (state.sales.length === 0) {
        list.parentElement.parentElement.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    list.parentElement.parentElement.style.display = 'block';
    empty.style.display = 'none';

    list.innerHTML = state.sales.slice().reverse().map(s => {
        const p = state.products.find(prod => prod.id === s.productId);
        const dateStr = new Date(s.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
        return `
            <tr>
                <td>${dateStr}</td>
                <td style="font-weight: 500;">${p ? p.emoji + ' ' + p.name : 'Desc.'}</td>
                <td>${s.qty}</td>
                <td style="color: var(--aqua); font-weight: 600;">$ ${(s.price * s.qty).toFixed(2)}</td>
                <td style="font-size: 11px; color: var(--text-mid);">${s.rate.toFixed(2)} Bs</td>
                <td class="flex gap-12">
                    <button class="btn-icon" onclick="editSale(${s.id})"><span>✏️</span></button>
                    <button class="btn-icon" onclick="deleteSale(${s.id})"><span>🗑️</span></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderInventory() {
    const totalEl = document.getElementById('inv-total-display');
    const traysEl = document.getElementById('inv-trays-display');
    const unitsEl = document.getElementById('inv-units-display');
    const prodList = document.getElementById('prod-list');

    if (!totalEl) return;

    totalEl.textContent = state.inventory;
    traysEl.textContent = Math.floor(state.inventory / 9);
    unitsEl.textContent = state.inventory % 9;

    prodList.innerHTML = state.production.slice().reverse().map(p => {
        const units = p.qty * 9;
        return `
            <tr>
                <td>${new Date(p.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}</td>
                <td>🔥 Horneado</td>
                <td style="font-weight: 600;">+ ${units} unid.</td>
                <td style="color: var(--choco-mid);">$ ${(p.cost * p.qty).toFixed(2)}</td>
                <td class="flex gap-12">
                    <button class="btn-icon" onclick="editProduction(${p.id})"><span>✏️</span></button>
                    <button class="btn-icon" onclick="deleteProduction(${p.id})"><span>🗑️</span></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderCosts() {
    // Fixed Costs
    const fixedList = document.getElementById('fixed-costs-list');
    if (fixedList) {
        fixedList.innerHTML = state.fixedCosts.map(c => `
            <div class="cost-item">
                <div class="cost-info">
                    <span class="cost-name">${c.desc}</span>
                    <span class="cost-cycle">Mensual</span>
                </div>
                <div class="flex items-center gap-10">
                    <span class="cost-amount">$ ${c.amount.toFixed(2)}</span>
                    <button class="btn-icon" onclick="deleteCost(${c.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // Ingredients
    const ingList = document.getElementById('ingredients-list');
    if (ingList) {
        ingList.innerHTML = state.ingredients.map((i, idx) => `
            <div class="ing-card" style="display: flex; align-items: center; justify-content: space-between;">
                <div class="ing-name" style="flex: 1;">${i.name}</div>
                <div class="flex items-center gap-5">
                    <span style="font-size: 14px; font-weight: 700; color: var(--aqua);">$</span>
                    <input type="number" step="0.01" value="${i.cost.toFixed(2)}" 
                        onchange="updateIngredientCost(${idx}, this.value)"
                        class="ing-price-input">
                </div>
            </div>
        `).join('');
    }
}

function renderSettings() {
    const settingsPrices = document.getElementById('settings-prices');
    if (settingsPrices) {
        settingsPrices.innerHTML = state.products.map(p => `
            <div class="price-setting-card">
                <div class="flex items-center gap-10">
                    <span style="font-size: 20px;">${p.emoji}</span>
                    <div class="flex flex-col">
                        <span style="font-weight: 600; color: var(--choco);">${p.name}</span>
                        <span style="font-size: 11px; color: var(--text-mid);">Costo: $ ${p.cost.toFixed(2)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-5">
                    <span style="font-size: 14px; font-weight: 600; color: var(--aqua);">$</span>
                    <input type="number" step="0.01" value="${p.price}" onchange="updateProductPrice(${p.id}, this.value)" style="width: 70px; padding: 5px; border-radius: 6px; border: 1px solid #ddd;">
                </div>
            </div>
        `).join('');
    }
}

// --- ACTIONS ---

function showModal(id, isEdit = false) {
    console.log('Opening modal:', id);
    const el = document.getElementById(id);
    if (el) {
        if (!isEdit) {
            // Reset to "Create" mode
            if (id === 'sale-modal') {
                document.getElementById('edit-sale-id').value = '';
                document.getElementById('sale-modal-title').textContent = 'Registrar Venta';
                document.getElementById('sale-save-btn').textContent = 'Guardar Venta';
                document.getElementById('sale-qty').value = 1;
            }
            if (id === 'bake-modal') {
                document.getElementById('edit-bake-id').value = '';
                document.getElementById('bake-modal-title').textContent = 'Registrar Horneado';
                document.getElementById('bake-qty').value = 1;
            }
        }
        el.classList.add('show');
    }
    else console.error('Modal not found:', id);
}

function hideModal(id) {
    console.log('Closing modal:', id);
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

let selectedProductId = 1;
// Handle product selection in modal
document.querySelectorAll('.product-pick-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.product-pick-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedProductId = parseInt(card.dataset.pid);
    });
});

function saveSale() {
    const editId = document.getElementById('edit-sale-id').value;
    const qty = parseInt(document.getElementById('sale-qty').value);
    const rate = parseFloat(document.getElementById('sale-rate').value);
    const product = state.products.find(p => p.id === selectedProductId);

    if (!qty || qty <= 0) return showToast('Cantidad inválida', 'error');

    const unitsNeeded = selectedProductId === 3 ? qty : qty * 9;

    if (editId) {
        // Mode: Update
        const oldSale = state.sales.find(s => s.id == editId);
        const oldUnits = oldSale.productId === 3 ? oldSale.qty : oldSale.qty * 9;
        
        // Revert old units first
        state.inventory += oldUnits;
        
        // Check new stock
        if (state.inventory < unitsNeeded) {
            if (!confirm(`⚠️ Solo tienes ${state.inventory} brownies. ¿Vender de todos modos?`)) {
                state.inventory -= oldUnits; // restore to before edit attempt
                return;
            }
        }
        
        state.inventory -= unitsNeeded;
        if (state.inventory < 0) state.inventory = 0;

        oldSale.productId = selectedProductId;
        oldSale.qty = qty;
        oldSale.price = product.price;
        oldSale.cost = product.cost;
        oldSale.rate = rate || state.rate;
        
        showToast('Venta actualizada', 'success');
    } else {
        // Mode: Create
        if (state.inventory < unitsNeeded) {
            if (!confirm(`⚠️ Solo tienes ${state.inventory} brownies. ¿Vender de todos modos?`)) return;
        }

        const newSale = {
            id: Date.now(),
            productId: selectedProductId,
            qty: qty,
            price: product.price,
            cost: product.cost,
            rate: rate || state.rate,
            date: new Date().toISOString()
        };

        state.sales.push(newSale);
        state.inventory -= unitsNeeded;
        if (state.inventory < 0) state.inventory = 0;
        showToast('Venta registrada', 'success');
    }

    saveState();
    renderAll();
    updateChart();
    hideModal('sale-modal');
}

function editSale(id) {
    const sale = state.sales.find(s => s.id === id);
    if (!sale) return;

    document.getElementById('edit-sale-id').value = sale.id;
    document.getElementById('sale-modal-title').textContent = 'Editar Venta';
    document.getElementById('sale-save-btn').textContent = 'Actualizar Venta';
    
    document.getElementById('sale-qty').value = sale.qty;
    document.getElementById('sale-rate').value = sale.rate;
    
    // Select product in picker
    selectedProductId = sale.productId;
    document.querySelectorAll('.product-pick-card').forEach(c => {
        c.classList.toggle('selected', parseInt(c.dataset.pid) === selectedProductId);
    });

    showModal('sale-modal', true);
}

function saveBake() {
    const editId = document.getElementById('edit-bake-id').value;
    const qty = parseInt(document.getElementById('bake-qty').value);
    if (!qty || qty <= 0) return;

    if (editId) {
        const oldProd = state.production.find(p => p.id == editId);
        // Revert old stock
        state.inventory -= (oldProd.qty * 9);
        // Add new stock
        state.inventory += (qty * 9);
        if (state.inventory < 0) state.inventory = 0;
        
        oldProd.qty = qty;
        showToast('Horneado actualizado', 'success');
    } else {
        const currentBatchCost = state.ingredients.reduce((sum, ing) => sum + ing.cost, 0);
        state.production.push({
            id: Date.now(),
            qty: qty,
            cost: currentBatchCost, 
            date: new Date().toISOString()
        });
        state.inventory += (qty * 9);
        showToast(`🔥 ${qty} batch(es) horneados`, 'success');
    }

    saveState();
    renderAll();
    hideModal('bake-modal');
}

function editProduction(id) {
    const prod = state.production.find(p => p.id === id);
    if (!prod) return;

    document.getElementById('edit-bake-id').value = prod.id;
    document.getElementById('bake-modal-title').textContent = 'Editar Horneado';
    document.getElementById('bake-qty').value = prod.qty;

    showModal('bake-modal', true);
}

function updateIngredientCost(idx, newVal) {
    state.ingredients[idx].cost = parseFloat(newVal) || 0;
    saveState();
    renderDashboard(); // Update income/cost stats if affected
    showToast(`Costo de ${state.ingredients[idx].name} actualizado`, 'info');
}

function deleteSale(id) {
    console.log('Delete sale requested for ID:', id);
    if (window.confirm('¿Eliminar esta venta?')) {
        const sale = state.sales.find(s => s.id == id);
        if (sale) {
            const unitsToRestore = sale.productId === 3 ? sale.qty : sale.qty * 9;
            state.inventory += unitsToRestore;
            state.sales = state.sales.filter(s => s.id != id);
            saveState();
            renderAll();
            updateChart();
            showToast('Venta eliminada y stock restaurado', 'info');
        } else {
            console.error('Sale not found for ID:', id);
        }
    }
}

function deleteProduction(id) {
    console.log('Delete production requested for ID:', id);
    if (window.confirm('¿Eliminar este registro de horneado? Esto restará los brownies del stock.')) {
        const prod = state.production.find(p => p.id == id);
        if (prod) {
            const unitsToRemove = prod.qty * 9;
            state.inventory -= unitsToRemove;
            if (state.inventory < 0) state.inventory = 0;
            state.production = state.production.filter(p => p.id != id);
            saveState();
            renderAll();
            showToast('Horneado eliminado y stock actualizado', 'info');
        } else {
            console.error('Production not found for ID:', id);
        }
    }
}

function saveCost() {
    const desc = document.getElementById('cost-desc').value;
    const amount = parseFloat(document.getElementById('cost-amount').value);

    if (!desc || isNaN(amount)) return showToast('Completa los campos', 'error');

    state.fixedCosts.push({ id: Date.now(), desc, amount });
    saveState();
    renderAll();
    hideModal('cost-modal');
    showToast('Costo fijo añadido', 'success');
}

function deleteCost(id) {
    state.fixedCosts = state.fixedCosts.filter(c => c.id !== id);
    saveState();
    renderAll();
}

function updateProductPrice(id, newPrice) {
    const p = state.products.find(p => p.id === id);
    if (p) {
        p.price = parseFloat(newPrice);
        saveState();
        renderDashboard();
        showToast(`Precio de ${p.name} actualizado`, 'info');
    }
}

function resetAllData() {
    if (confirm('⚠️ ¿Estás segura de que quieres borrar TODO? Esta acción no se puede deshacer.')) {
        state.sales = [];
        state.fixedCosts = [...CONFIG.DEFAULTS.fixedCosts];
        saveState();
        window.location.reload();
    }
}

// --- NAVIGATION ---

function setupEventListeners() {
    // Desktop Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    // Mobile Nav
    document.querySelectorAll('.bot-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    // Period Tabs
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.activePeriod = tab.dataset.period;
            renderDashboard();
        });
    });

    // Cost Tabs
    document.querySelectorAll('.cost-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cost-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('cost-fixed-section').style.display = target === 'fixed' ? 'block' : 'none';
            document.getElementById('cost-ingredients-section').style.display = target === 'ingredients' ? 'block' : 'none';
        });
    });
}

function switchPage(page) {
    state.activePage = page;
    
    // UI update
    document.querySelectorAll('.nav-item, .bot-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    document.querySelectorAll('.page-content').forEach(el => {
        el.style.display = el.id === `page-${page}` ? 'block' : 'none';
    });

    const titles = { dashboard: 'Dashboard', sales: 'Ventas', inventory: 'Inventario', costs: 'Costos', settings: 'Ajustes' };
    document.getElementById('page-title').textContent = titles[page];
}

// --- CHART ---

let mainChart;
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Ingresos ($)',
                    borderColor: '#2BBDAA',
                    backgroundColor: 'rgba(43, 189, 170, 0.1)',
                    data: [],
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Costos ($)',
                    borderColor: '#7A3E10',
                    backgroundColor: 'transparent',
                    data: [],
                    borderDash: [5, 5],
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
    updateChart();
}

function updateChart() {
    if (!mainChart) return;

    const labels = [];
    const incomeData = [];
    const costData = [];
    const period = state.activePeriod;
    const now = new Date();

    const periodNames = { today: 'Hoy', week: 'Esta Semana', month: 'Últimos 30 días', year: 'Este Año', todo: 'Todo el Histórico' };
    document.getElementById('chart-title').textContent = `Ventas vs Costos (${periodNames[period]})`;

    if (period === 'today') {
        for (let i = 23; i >= 0; i -= 2) {
            const d = new Date(now);
            d.setHours(now.getHours() - i);
            labels.push(d.getHours() + ':00');
            const hourSales = state.sales.filter(s => {
                const sd = new Date(s.date);
                return sd.toDateString() === d.toDateString() && sd.getHours() === d.getHours();
            });
            incomeData.push(hourSales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(hourSales.reduce((sum, s) => sum + (s.cost * s.qty), 0));
        }
    } else if (period === 'week') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            labels.push(d.toLocaleDateString('es-VE', { weekday: 'short' }));
            const daySales = state.sales.filter(s => new Date(s.date).toDateString() === d.toDateString());
            incomeData.push(daySales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(daySales.reduce((sum, s) => sum + (s.cost * s.qty), 0));
        }
    } else if (period === 'month') {
        for (let i = 29; i >= 0; i -= 3) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            labels.push(d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }));
            const daySales = state.sales.filter(s => {
                const sd = new Date(s.date);
                return sd >= d && sd < new Date(d.getTime() + 3 * 24 * 60 * 60 * 1000);
            });
            incomeData.push(daySales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(daySales.reduce((sum, s) => sum + (s.cost * s.qty), 0));
        }
    } else {
        // Year or Todo - by month
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleDateString('es-VE', { month: 'short' }));
            const monthSales = state.sales.filter(s => {
                const sd = new Date(s.date);
                return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
            });
            incomeData.push(monthSales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(monthSales.reduce((sum, s) => sum + (s.cost * s.qty), 0));
        }
    }

    mainChart.data.labels = labels;
    mainChart.data.datasets[0].data = incomeData;
    mainChart.data.datasets[1].data = costData;
    mainChart.update();
}

// --- UTILS ---

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// --- TUTORIAL LOGIC ---

let currentTutorialStep = 0;
const tutorialSteps = [
    {
        title: "¡Bienvenida a Sweet&Fit!",
        text: "Esta app está diseñada para ayudarte a controlar las finanzas y el stock de tus brownies de forma simple y elegante.",
        icon: "✨"
    },
    {
        title: "Controla tu Margen",
        text: "En el Dashboard verás tus ingresos y costos reales. El círculo de margen te dirá si tu negocio está siendo rentable después de todos los gastos.",
        icon: "📊"
    },
    {
        title: "Registra tus Horneadas",
        text: "Cada vez que hornees una bandeja, ve a 'Inventario' y presiona 'Hornear Batch'. La app sumará 9 unidades al stock y registrará el costo de los ingredientes.",
        icon: "🥧"
    },
    {
        title: "Vende con un Clic",
        text: "Cuando te llamen para un pedido, usa 'Nueva Venta'. La app descontará los brownies del stock y calculará el monto en Bolívares según la tasa BCV del momento.",
        icon: "💰"
    },
    {
        title: "Ajusta tus Costos",
        text: "Si los ingredientes suben de precio, ve a 'Costos' y actualízalos. Así tus reportes de utilidad siempre serán precisos.",
        icon: "🏗️"
    },
    {
        title: "¡Todo listo!",
        text: "Los datos se guardan en este dispositivo. ¡Mucho éxito con tu negocio de Brownies Keto!",
        icon: "🚀"
    }
];

function startTutorial() {
    currentTutorialStep = 0;
    document.getElementById('tutorial-overlay').classList.add('show');
    renderTutorialStep();
}

function renderTutorialStep() {
    const step = tutorialSteps[currentTutorialStep];
    const content = document.getElementById('tutorial-content');
    const dots = document.getElementById('tutorial-dots');
    
    content.innerHTML = `
        <div class="tutorial-icon">${step.icon}</div>
        <div class="tutorial-step">Paso ${currentTutorialStep + 1} de ${tutorialSteps.length}</div>
        <h2>${step.title}</h2>
        <p>${step.text}</p>
    `;

    dots.innerHTML = tutorialSteps.map((_, i) => `
        <div class="tutorial-dot ${i === currentTutorialStep ? 'active' : ''}"></div>
    `).join('');

    document.getElementById('tut-prev').style.display = currentTutorialStep === 0 ? 'none' : 'block';
    document.getElementById('tut-next').style.display = currentTutorialStep === tutorialSteps.length - 1 ? 'none' : 'block';
    document.getElementById('tut-finish').style.display = currentTutorialStep === tutorialSteps.length - 1 ? 'block' : 'none';
}

function nextTutorialStep() {
    if (currentTutorialStep < tutorialSteps.length - 1) {
        currentTutorialStep++;
        renderTutorialStep();
    }
}

function prevTutorialStep() {
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        renderTutorialStep();
    }
}

function closeTutorial() {
    document.getElementById('tutorial-overlay').classList.remove('show');
    state.tutorialSeen = true;
    saveState();
}

// Run app
init();
