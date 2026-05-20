// Sweet&Fit - Advanced Financial Dashboard Logic (Excel Replacer)
// Concept: Minimalism, Dual Currency (Bs/$), Cashflow, Accounts Receivable (Cobranzas)

// --- CONFIG & INITIAL DATA ---
const CONFIG = {
    API_BCV: 'https://ve.dolarapi.com/v1/dolares/oficial',
    APP_STORAGE_KEY: 'sweet_bite_data_v2',
    SUPABASE_URL: 'https://sllhkwbvyqwjwcpyedon.supabase.co', // URL de tu proyecto Supabase (ej: 'https://xxxx.supabase.co')
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGhrd2J2eXF3andjcHllZG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjY2MzMsImV4cCI6MjA5NDg0MjYzM30.kspc119MY38O8ARFqaAZHpt0FtGGw8ACpAz_BV_S6UQ', // Tu Anon Key de Supabase
    DEFAULTS: {
        rate: 37.50, // Default rate
        products: [
            { id: 1, name: 'Torta Brownie Keto', price: 30.00, cost: 18.15, emoji: '🍫', unit: 'Bandeja' },
            { id: 2, name: 'Torta TORRE Keto', price: 35.00, cost: 20.17, emoji: '🏆', unit: 'Bandeja' },
            { id: 3, name: 'Brownie Detal', price: 3.00, cost: 1.67, emoji: '🎯', unit: 'Unidad' },
            { id: 4, name: 'Brownie Comercial', price: 2.50, cost: 1.67, emoji: '💼', unit: 'Unidad' }
        ],
        // Sample baseline ingredients for reference
        ingredients: [
            { name: 'Huevos (4 und)', cost: 1.20 },
            { name: 'Monkfruit (50g)', cost: 1.65 },
            { name: 'Chocolate Barra (120g)', cost: 4.32 },
            { name: 'Harina Almendra (120g)', cost: 3.53 },
            { name: 'Chispas Chocolate (40g)', cost: 1.68 }
        ]
    }
};

let state = {
    rate: CONFIG.DEFAULTS.rate,
    sales: [],
    expenses: [], // Replaces production/fixedCosts with custom expenses
    products: [...CONFIG.DEFAULTS.products],
    activePage: 'dashboard',
    activePeriod: 'month',
    tutorialSeen: false
};

// --- SUPABASE CLIENT INITIALIZATION ---
let supabase = null;
if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY && window.supabase) {
    try {
        supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    } catch (e) {
        console.error('Error al inicializar Supabase:', e);
    }
}

// --- CORE FUNCTIONS ---

async function init() {
    loadState();
    
    // Configurar valor inicial del input de filtro en el DOM
    const filterInput = document.getElementById('global-month-filter');
    if (filterInput) {
        filterInput.value = state.filterMonth || '';
        
        // Actualizar apariencia del botón YTD
        const btnYtd = document.getElementById('btn-ytd');
        if (btnYtd) {
            if (state.filterMonth) {
                btnYtd.classList.remove('btn-primary');
                btnYtd.classList.add('btn-secondary');
            } else {
                btnYtd.classList.remove('btn-secondary');
                btnYtd.classList.add('btn-primary');
            }
        }
    }
    
    fetchRate();
    setupEventListeners();
    renderAll();
    initChart();
    
    // Si Supabase está activo, intentar sincronizar con la nube inmediatamente
    if (supabase) {
        await syncWithCloud();
    }
    
    // Auto-sincronizar en segundo plano cuando la pestaña vuelve a estar activa (ej. al abrir el cel)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && supabase) {
            syncWithCloud();
        }
    });
    
    if (!state.tutorialSeen) {
        setTimeout(startTutorial, 1500);
    }
}

function loadState() {
    const saved = localStorage.getItem(CONFIG.APP_STORAGE_KEY);
    if (saved) {
        state = { ...state, ...JSON.parse(saved) };
    } else {
        // First load: seed some initial sample data so the dashboard doesn't look empty
        loadTestData(true);
    }
    
    // Asegurar que state.rate sea un número válido
    if (!state.rate || isNaN(state.rate) || typeof state.rate !== 'number') {
        state.rate = CONFIG.DEFAULTS.rate || 37.50;
    }
    
    // Asegurar que filterMonth esté inicializado (por defecto: mes actual)
    if (state.filterMonth === undefined) {
        state.filterMonth = new Date().toISOString().substring(0, 7);
    }
    
    updateSyncStatusUI(supabase ? 'synced' : 'local');
}

async function saveState() {
    localStorage.setItem(CONFIG.APP_STORAGE_KEY, JSON.stringify(state));
    
    if (supabase) {
        updateSyncStatusUI('syncing');
        try {
            // Guardar solo datos de negocio en la nube para no alterar las vistas locales de otros dispositivos
            const syncPayload = {
                rate: state.rate,
                sales: state.sales,
                expenses: state.expenses,
                products: state.products
            };
            
            const { error } = await supabase
                .from('sweet_fit_state')
                .upsert({ 
                    id: 'main_state', 
                    data: syncPayload, 
                    updated_at: new Date().toISOString() 
                });
            
            if (error) throw error;
            updateSyncStatusUI('synced');
        } catch (e) {
            console.error('Error al guardar en Supabase:', e);
            updateSyncStatusUI('error');
        }
    } else {
        updateSyncStatusUI('local');
    }
}

async function syncWithCloud() {
    if (!supabase) return;
    
    updateSyncStatusUI('syncing');
    try {
        const { data, error } = await supabase
            .from('sweet_fit_state')
            .select('data')
            .eq('id', 'main_state')
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" (first run)
            throw error;
        }
        
        if (data && data.data) {
            // Comparamos únicamente la data de negocio
            const currentBusiness = {
                rate: state.rate,
                sales: state.sales,
                expenses: state.expenses,
                products: state.products
            };
            
            const cloudBusinessStr = JSON.stringify(data.data);
            const currentBusinessStr = JSON.stringify(currentBusiness);
            
            if (cloudBusinessStr !== currentBusinessStr) {
                state.rate = data.data.rate || state.rate;
                state.sales = data.data.sales || [];
                state.expenses = data.data.expenses || [];
                state.products = data.data.products || state.products;
                
                localStorage.setItem(CONFIG.APP_STORAGE_KEY, JSON.stringify(state));
                renderAll();
                if (typeof updateChart === 'function') updateChart();
                showToast('🔄 Datos sincronizados con la nube', 'success');
            }
        }
        updateSyncStatusUI('synced');
    } catch (e) {
        console.error('Error al sincronizar con Supabase:', e);
        updateSyncStatusUI('error');
    }
}

function updateSyncStatusUI(status) {
    const dot = document.getElementById('sync-dot');
    const label = document.getElementById('sync-label');
    const rate = document.getElementById('sync-rate');
    
    if (!dot || !label || !rate) return;
    
    if (status === 'local') {
        dot.style.background = 'rgba(255,255,255,0.4)';
        dot.style.animation = 'none';
        label.textContent = 'Modo Local';
        rate.textContent = '📶';
        rate.style.color = 'rgba(255,255,255,0.4)';
    } else if (status === 'syncing') {
        dot.style.background = '#f2c94c'; // Yellow
        dot.style.animation = 'pulse 1s infinite';
        label.textContent = 'Sincronizando...';
        rate.textContent = '🔄';
        rate.style.color = '#f2c94c';
    } else if (status === 'synced') {
        dot.style.background = '#2BBDAA'; // Muted Green
        dot.style.animation = 'pulse 3s infinite';
        label.textContent = 'Nube Activa';
        rate.textContent = '☁️';
        rate.style.color = '#2BBDAA';
    } else if (status === 'error') {
        dot.style.background = '#eb5757'; // Red
        dot.style.animation = 'none';
        label.textContent = 'Error de Sinc.';
        rate.textContent = '⚠️';
        rate.style.color = '#eb5757';
    }
}

async function fetchRate() {
    try {
        const res = await fetch(CONFIG.API_BCV);
        const data = await res.json();
        if (data && data.promedio) {
            state.rate = data.promedio;
            updateRateUI();
            showToast('Tasa BCV oficial: ' + state.rate.toFixed(2) + ' Bs/$', 'info');
        }
    } catch (e) {
        console.error('Error fetching BCV rate', e);
        showToast('Error al conectar con BCV. Usando tasa manual.', 'warning');
    }
    updateRateUI();
}

function updateRateUI() {
    const validRate = (state.rate && typeof state.rate === 'number' && !isNaN(state.rate)) ? state.rate : (CONFIG.DEFAULTS.rate || 37.50);
    const rateString = validRate.toFixed(2);
    
    const els = ['bcv-rate-sidebar', 'bcv-rate-top'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = rateString + ' Bs';
    });
    const rateInput = document.getElementById('sale-rate');
    if (rateInput) rateInput.value = rateString;
}

// --- UI RENDERING ---

function renderAll() {
    renderDashboard();
    renderSales();
    renderExpenses();
    renderCobranzas();
    renderSettings();
}

function renderDashboard() {
    const filter = state.filterMonth; // Formato "YYYY-MM" o "" para YTD (Todo)
    
    const filteredSales = state.sales.filter(s => {
        if (!filter) return true; // Mostrar todo si es YTD
        const sDate = new Date(s.date);
        const sYear = sDate.getFullYear();
        const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
        return `${sYear}-${sMonth}` === filter;
    });

    const filteredExpenses = state.expenses.filter(e => {
        if (!filter) return true; // Mostrar todo si es YTD
        const eDate = new Date(e.date);
        const eYear = eDate.getFullYear();
        const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
        return `${eYear}-${eMonth}` === filter;
    });

    // 1. Total Income (Value of all sales recorded)
    const totalSalesValue = filteredSales.reduce((sum, s) => sum + (s.price * s.qty), 0);
    
    // 2. Net Cash Flow: Real Money Collected minus Money Spent
    const moneyCollected = filteredSales.filter(s => s.status === 'CANCELADO').reduce((sum, s) => sum + (s.price * s.qty), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const netCashflow = moneyCollected - totalExpenses;

    // 3. Accounts Receivable (Deudas Pendientes)
    const unpaidSales = state.sales.filter(s => s.status === 'PENDIENTE');
    const totalAccountsReceivable = unpaidSales.reduce((sum, s) => sum + (s.price * s.qty), 0);

    // 4. Accounting Utility (Profit): Sales Value minus Cost of Goods Sold (Unit cost * Qty)
    const costOfGoodsSold = filteredSales.reduce((sum, s) => sum + (s.cost * s.qty), 0);
    const realProfit = totalSalesValue - costOfGoodsSold;
    const margin = totalSalesValue > 0 ? (realProfit / totalSalesValue) * 100 : 0;

    // Update KPI UI
    document.getElementById('kpi-income').textContent = `$ ${totalSalesValue.toFixed(2)}`;
    document.getElementById('kpi-income-bs').textContent = `Bs ${(totalSalesValue * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    
    document.getElementById('kpi-cost-var').textContent = `$ ${totalExpenses.toFixed(2)}`;
    document.getElementById('kpi-cost-var-bs').textContent = `Bs ${(totalExpenses * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;
    
    const profitEl = document.getElementById('kpi-profit');
    profitEl.textContent = `$ ${realProfit.toFixed(2)}`;
    profitEl.parentElement.style.borderColor = realProfit >= 0 ? 'var(--aqua)' : 'var(--danger)';
    document.getElementById('kpi-profit-bs').textContent = `Bs ${(realProfit * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;

    const stockEl = document.getElementById('kpi-stock');
    if (stockEl) stockEl.textContent = `$ ${totalAccountsReceivable.toFixed(2)}`;
    const stockBsEl = document.getElementById('kpi-stock-bs');
    if (stockBsEl) stockBsEl.textContent = `Bs ${(totalAccountsReceivable * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}`;

    // Margin Card
    const marginCard = document.getElementById('margin-card');
    const marginPctEl = document.getElementById('margin-pct');
    const marginStatus = document.getElementById('margin-status');
    
    marginPctEl.textContent = `${margin.toFixed(1)}%`;
    
    if (totalSalesValue === 0) {
        marginCard.style.background = 'var(--choco-mid)';
        marginStatus.textContent = "Registra ventas para ver tu rendimiento";
    } else if (margin >= 0) {
        marginCard.style.background = 'var(--aqua)';
        if (margin > 35) marginStatus.textContent = "¡Excelente rendimiento! Tu negocio es sumamente rentable.";
        else if (margin > 20) marginStatus.textContent = "Buen margen de ganancia. Mantén los costos bajo control.";
        else marginStatus.textContent = "Margen de ganancia aceptable, pero revisa tus costos variables.";
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

    const filter = state.filterMonth;
    const filteredSales = state.sales.filter(s => {
        if (!filter) return true; // Mostrar todo si es YTD
        const sDate = new Date(s.date);
        const sYear = sDate.getFullYear();
        const sMonth = String(sDate.getMonth() + 1).padStart(2, '0');
        return `${sYear}-${sMonth}` === filter;
    });

    if (filteredSales.length === 0) {
        list.parentElement.parentElement.style.display = 'none';
        empty.style.display = 'flex';
        const emptyMsg = empty.querySelector('p');
        if (emptyMsg) {
            emptyMsg.textContent = state.sales.length > 0 ? 'No hay ventas registradas en el mes seleccionado.' : 'Registra tu primera venta para comenzar el control.';
        }
        return;
    }

    list.parentElement.parentElement.style.display = 'block';
    empty.style.display = 'none';

    list.innerHTML = filteredSales.slice().reverse().map(s => {
        const p = state.products.find(prod => prod.id === s.productId);
        const dateStr = new Date(s.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
        const statusClass = s.status === 'CANCELADO' ? 'status-paid' : 'status-pending';
        const statusLabel = s.status === 'CANCELADO' ? 'PAGADO' : 'PENDIENTE';
        
        return `
            <tr>
                <td>${dateStr}</td>
                <td style="font-weight: 600;">${s.clientName || 'Cliente Genérico'}</td>
                <td style="font-size: 13px;">${p ? p.emoji + ' ' + p.name : 'Desc.'}</td>
                <td>${s.qty}</td>
                <td style="color: var(--aqua); font-weight: 700;">$ ${(s.price * s.qty).toFixed(2)}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td style="font-size: 11px; color: var(--text-mid); font-family: monospace;">${s.documentNumber || 'S/F'}</td>
                <td class="flex gap-12">
                    <button class="btn-icon" onclick="editSale(${s.id})"><span>✏️</span></button>
                    <button class="btn-icon" onclick="deleteSale(${s.id})"><span>🗑️</span></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderExpenses() {
    const prodList = document.getElementById('prod-list');
    if (!prodList) return;

    const filter = state.filterMonth;
    const filteredExpenses = state.expenses.filter(e => {
        if (!filter) return true; // Mostrar todo si es YTD
        const eDate = new Date(e.date);
        const eYear = eDate.getFullYear();
        const eMonth = String(eDate.getMonth() + 1).padStart(2, '0');
        return `${eYear}-${eMonth}` === filter;
    });

    if (filteredExpenses.length === 0) {
        prodList.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-light); padding: 30px;">
                    No hay gastos registrados en el mes seleccionado.
                </td>
            </tr>
        `;
        return;
    }

    prodList.innerHTML = filteredExpenses.slice().reverse().map(e => {
        const dateStr = new Date(e.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
        return `
            <tr>
                <td>${dateStr}</td>
                <td style="font-weight: 500;">🛒 ${e.description}</td>
                <td style="font-weight: 600; color: var(--danger);">$ ${e.amount.toFixed(2)}</td>
                <td style="color: var(--text-mid); font-size: 12px;">Bs ${(e.amount * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                <td class="flex gap-12">
                    <button class="btn-icon" onclick="editExpense(${e.id})"><span>✏️</span></button>
                    <button class="btn-icon" onclick="deleteExpense(${e.id})"><span>🗑️</span></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderCobranzas() {
    const grid = document.getElementById('cobranzas-grid');
    if (!grid) return;

    // Group pending sales by client name
    const pendingSales = state.sales.filter(s => s.status === 'PENDIENTE');
    const clients = {};
    
    pendingSales.forEach(s => {
        const client = s.clientName || 'Cliente Genérico';
        if (!clients[client]) {
            clients[client] = {
                totalDebt: 0,
                orders: []
            };
        }
        clients[client].totalDebt += (s.price * s.qty);
        clients[client].orders.push(s);
    });

    const clientKeys = Object.keys(clients);

    if (clientKeys.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: rgba(43, 189, 170, 0.05); border-radius: 12px; border: 1px dashed var(--aqua);">
                <span style="font-size: 32px;">🎉</span>
                <h3 style="margin-top: 10px; color: var(--choco);">¡Sin cuentas pendientes!</h3>
                <p style="color: var(--text-mid); font-size: 14px;">Todos los aliados y clientes están al día con sus pagos.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = clientKeys.map(client => {
        const c = clients[client];
        const ordersList = c.orders.map(o => {
            const p = state.products.find(prod => prod.id === o.productId);
            const dateStr = new Date(o.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
            return `<li>${dateStr} - ${o.qty}x ${p ? p.name : 'Desc'} ($ ${(o.price * o.qty).toFixed(2)})</li>`;
        }).join('');

        return `
            <div class="cobranzas-card">
                <div>
                    <div class="cobranzas-header">
                        <span class="cobranzas-client">${client}</span>
                        <span class="cobranzas-amount">$ ${c.totalDebt.toFixed(2)}</span>
                    </div>
                    <div class="cobranzas-bs">
                        Bs ${(c.totalDebt * state.rate).toLocaleString('es-VE', {minimumFractionDigits: 2})}
                    </div>
                    <ul class="cobranzas-orders">
                        ${ordersList}
                    </ul>
                </div>
                <button class="btn btn-primary btn-sm" onclick="liquidateClientDebt('${client.replace(/'/g, "\\'")}')">
                    💰 Registrar Pago Completo
                </button>
            </div>
        `;
    }).join('');
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
    const el = document.getElementById(id);
    if (el) {
        if (!isEdit) {
            // Reset to "Create" mode
            if (id === 'sale-modal') {
                document.getElementById('edit-sale-id').value = '';
                document.getElementById('sale-modal-title').textContent = 'Registrar Venta';
                document.getElementById('sale-save-btn').textContent = 'Guardar Venta';
                document.getElementById('sale-client').value = '';
                document.getElementById('sale-qty').value = 1;
                document.getElementById('sale-status').value = 'CANCELADO';
                document.getElementById('sale-doc').value = '';
            }
            if (id === 'bake-modal') {
                document.getElementById('edit-bake-id').value = '';
                document.getElementById('bake-modal-title').textContent = 'Registrar Gasto / Compra';
                document.getElementById('bake-name').value = '';
                document.getElementById('bake-qty').value = 0.00;
            }
        }
        el.classList.add('show');
    }
}

function hideModal(id) {
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
    const client = document.getElementById('sale-client').value.trim() || 'Cliente Genérico';
    const qty = parseInt(document.getElementById('sale-qty').value);
    const status = document.getElementById('sale-status').value;
    const doc = document.getElementById('sale-doc').value.trim() || 'S/F';
    const rate = parseFloat(document.getElementById('sale-rate').value);
    const product = state.products.find(p => p.id === selectedProductId);

    if (!qty || qty <= 0) return showToast('Cantidad inválida', 'error');

    if (editId) {
        // Mode: Update
        const oldSale = state.sales.find(s => s.id == editId);
        oldSale.productId = selectedProductId;
        oldSale.clientName = client.toUpperCase();
        oldSale.qty = qty;
        oldSale.price = product.price;
        oldSale.cost = product.cost;
        oldSale.status = status;
        oldSale.documentNumber = doc.toUpperCase();
        oldSale.rate = rate || state.rate;
        if (status === 'CANCELADO' && !oldSale.paymentDate) {
            oldSale.paymentDate = new Date().toISOString();
        }
        showToast('Venta actualizada', 'success');
    } else {
        // Mode: Create
        const newSale = {
            id: Date.now(),
            productId: selectedProductId,
            clientName: client.toUpperCase(),
            qty: qty,
            price: product.price,
            cost: product.cost,
            rate: rate || state.rate,
            status: status,
            documentNumber: doc.toUpperCase(),
            paymentDate: status === 'CANCELADO' ? new Date().toISOString() : '',
            transferNumber: '',
            date: new Date().toISOString()
        };

        state.sales.push(newSale);
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
    
    document.getElementById('sale-client').value = sale.clientName;
    document.getElementById('sale-qty').value = sale.qty;
    document.getElementById('sale-status').value = sale.status;
    document.getElementById('sale-doc').value = sale.documentNumber;
    document.getElementById('sale-rate').value = sale.rate;
    
    // Select product in picker
    selectedProductId = sale.productId;
    document.querySelectorAll('.product-pick-card').forEach(c => {
        c.classList.toggle('selected', parseInt(c.dataset.pid) === selectedProductId);
    });

    showModal('sale-modal', true);
}

function deleteSale(id) {
    if (window.confirm('¿Eliminar esta venta?')) {
        state.sales = state.sales.filter(s => s.id != id);
        saveState();
        renderAll();
        updateChart();
        showToast('Venta eliminada', 'info');
    }
}

function saveBake() {
    const editId = document.getElementById('edit-bake-id').value;
    const desc = document.getElementById('bake-name').value.trim() || 'Gasto General';
    const amount = parseFloat(document.getElementById('bake-qty').value);
    
    if (isNaN(amount) || amount <= 0) return showToast('Monto inválido', 'error');

    if (editId) {
        const oldExpense = state.expenses.find(e => e.id == editId);
        oldExpense.description = desc;
        oldExpense.amount = amount;
        showToast('Gasto actualizado', 'success');
    } else {
        state.expenses.push({
            id: Date.now(),
            description: desc,
            amount: amount, 
            date: new Date().toISOString()
        });
        showToast('🛒 Gasto registrado exitosamente', 'success');
    }

    saveState();
    renderAll();
    hideModal('bake-modal');
}

function editExpense(id) {
    const exp = state.expenses.find(e => e.id === id);
    if (!exp) return;

    document.getElementById('edit-bake-id').value = exp.id;
    document.getElementById('bake-modal-title').textContent = 'Editar Gasto';
    document.getElementById('bake-name').value = exp.description;
    document.getElementById('bake-qty').value = exp.amount;

    showModal('bake-modal', true);
}

function deleteExpense(id) {
    if (window.confirm('¿Eliminar este gasto?')) {
        state.expenses = state.expenses.filter(e => e.id != id);
        saveState();
        renderAll();
        showToast('Gasto eliminado', 'info');
    }
}

function liquidateClientDebt(client) {
    const ref = prompt(`Introduzca número de referencia bancaria o pago móvil para el pago de ${client}:`);
    if (ref === null) return; // Cancelled
    
    let count = 0;
    state.sales.forEach(s => {
        if (s.clientName === client && s.status === 'PENDIENTE') {
            s.status = 'CANCELADO';
            s.paymentDate = new Date().toISOString();
            s.transferNumber = ref;
            count++;
        }
    });

    if (count > 0) {
        saveState();
        renderAll();
        showToast(`¡Se registraron ${count} facturas de ${client} como CANCELADAS!`, 'success');
    }
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
        state.expenses = [];
        saveState();
        window.location.reload();
    }
}

// --- TEST DATA LOADER (Mayo 2026 / Abril 2026 - Conforme a tu Excel real) ---

function loadTestData(silent = false) {
    // 1. Clear current
    state.sales = [];
    state.expenses = [];
    state.rate = 37.50;

    // 2. Add April Sales
    const aprilSales = [
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 450', date: '2026-04-02T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 451', date: '2026-04-02T14:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 15, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 454', date: '2026-04-04T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 455', date: '2026-04-07T10:00:00Z' },
        { client: 'ONBIKE', pid: 4, qty: 24, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-08T11:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 456', date: '2026-04-11T12:00:00Z' },
        { client: 'ONBIKE', pid: 4, qty: 10, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-13T10:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 457', date: '2026-04-13T12:00:00Z' },
        { client: 'LA DONA', pid: 4, qty: 9, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 458', date: '2026-04-16T09:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 460', date: '2026-04-16T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 461', date: '2026-04-16T14:00:00Z' },
        { client: 'LIFE FITNESS', pid: 4, qty: 10, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 462', date: '2026-04-17T09:00:00Z' },
        { client: 'NAILS', pid: 4, qty: 16, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-17T11:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 16, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 463', date: '2026-04-18T12:00:00Z' },
        { client: 'NAILS', pid: 4, qty: 8, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-20T10:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 17, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 464', date: '2026-04-20T12:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 14, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 465', date: '2026-04-23T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 466', date: '2026-04-23T14:00:00Z' },
        { client: 'ONBIKE', pid: 4, qty: 10, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-23T15:00:00Z' },
        { client: 'NAILS', pid: 4, qty: 9, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-28T10:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 10, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 467', date: '2026-04-27T12:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 13, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 468', date: '2026-04-29T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 469', date: '2026-04-30T10:00:00Z' },
        { client: 'LIFE FITNESS', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 470', date: '2026-04-30T11:00:00Z' },
        { client: 'ONBIKE', pid: 4, qty: 10, price: 2.50, status: 'CANCELADO', doc: 'S/F', date: '2026-04-30T15:00:00Z' }
    ];

    // April Individual
    const aprilIndividualSales = [
        { client: 'HADIL MAKLAD', pid: 3, qty: 2, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-05T12:00:00Z' },
        { client: 'BUBA', pid: 3, qty: 5, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-07T12:00:00Z' },
        { client: 'VERONICA', pid: 3, qty: 4, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-10T12:00:00Z' },
        { client: 'JORDANIA', pid: 3, qty: 3, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-15T12:00:00Z' },
        { client: 'VERONICA', pid: 3, qty: 5, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-20T12:00:00Z' },
        { client: 'MARIAN', pid: 3, qty: 2, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-22T12:00:00Z' },
        { client: 'GUSTAVO', pid: 3, qty: 2, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-25T12:00:00Z' },
        { client: 'CARLOS ALVAREZ', pid: 3, qty: 3, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-04-28T12:00:00Z' }
    ];

    // 3. Add May Sales
    const maySales = [
        { client: 'NAILS', pid: 4, qty: 7, price: 2.50, status: 'PENDIENTE', doc: 'S/F', date: '2026-05-01T10:00:00Z' },
        { client: 'ON BIKE', pid: 4, qty: 9, price: 2.50, status: 'PENDIENTE', doc: 'S/F', date: '2026-05-01T12:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 471', date: '2026-05-02T12:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 472', date: '2026-05-05T12:00:00Z' },
        { client: 'LA DONA', pid: 4, qty: 9, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 473', date: '2026-05-06T09:00:00Z' },
        { client: 'LIFE FITNESS', pid: 4, qty: 9, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 474', date: '2026-05-06T11:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'CANCELADO', doc: 'FACTURA 475', date: '2026-05-08T12:00:00Z' },
        { client: 'LIFE FITNESS', pid: 4, qty: 6, price: 2.50, status: 'PENDIENTE', doc: 'S/F', date: '2026-05-07T11:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 18, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 476', date: '2026-05-11T12:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 10, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 477', date: '2026-05-14T12:00:00Z' },
        { client: 'CRASH', pid: 4, qty: 6, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 478', date: '2026-05-14T14:00:00Z' },
        { client: 'VESUVIO', pid: 4, qty: 12, price: 2.50, status: 'PENDIENTE', doc: 'FACTURA 479', date: '2026-05-15T12:00:00Z' },
        { client: 'LIFE FITNESS', pid: 4, qty: 8, price: 2.50, status: 'PENDIENTE', doc: 'S/F', date: '2026-05-18T10:00:00Z' }
    ];

    // May Individual
    const mayIndividualSales = [
        { client: 'OMAR ESPINOZA', pid: 3, qty: 20, price: 3.00, status: 'PENDIENTE', doc: 'S/F', date: '2026-05-15T12:00:00Z' },
        { client: 'CLIENTE X', pid: 3, qty: 7, price: 3.00, status: 'CANCELADO', doc: 'S/F', date: '2026-05-17T12:00:00Z' }
    ];

    // Combine Sales
    const allSales = [...aprilSales, ...aprilIndividualSales, ...maySales, ...mayIndividualSales];
    allSales.forEach((s, idx) => {
        const prod = state.products.find(p => p.id === s.pid);
        state.sales.push({
            id: idx + 1,
            productId: s.pid,
            clientName: s.client.toUpperCase(),
            qty: s.qty,
            price: s.price,
            cost: prod ? prod.cost : 1.67,
            rate: 37.50,
            status: s.status,
            documentNumber: s.doc,
            paymentDate: s.status === 'CANCELADO' ? s.date : '',
            transferNumber: s.status === 'CANCELADO' ? '12345678' : '',
            date: s.date
        });
    });

    // 4. Add Real Expenses from Excel
    const aprilExpenses = [
        { description: 'Harina de Almendra (Compra)', amount: 198.18, date: '2026-04-03T10:00:00Z' },
        { description: 'Compra Costco General', amount: 285.00, date: '2026-04-10T12:00:00Z' },
        { description: 'Etiquetas de Presentación', amount: 32.00, date: '2026-04-15T10:00:00Z' },
        { description: 'Polvo de Hornear', amount: 11.00, date: '2026-04-20T11:00:00Z' },
        { description: 'Inventario Wladiador', amount: 24.00, date: '2026-04-22T14:00:00Z' }
    ];

    const mayExpenses = [
        { description: 'Polvo de Hornear', amount: 12.00, date: '2026-05-02T11:00:00Z' },
        { description: 'Chocolates SUN (Materia Prima)', amount: 230.00, date: '2026-05-06T14:00:00Z' }
    ];

    const allExpenses = [...aprilExpenses, ...mayExpenses];
    allExpenses.forEach((e, idx) => {
        state.expenses.push({
            id: idx + 100,
            description: e.description,
            amount: e.amount,
            date: e.date
        });
    });

    saveState();
    if (!silent) {
        renderAll();
        updateChart();
        showToast('Datos reales de Abril y Mayo cargados con éxito.', 'success');
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
}

function switchPage(page) {
    state.activePage = page;
    
    // UI update
    document.querySelectorAll('.nav-item, .bot-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    document.querySelectorAll('.page-content').forEach(el => {
        if (el) {
            el.style.display = el.id === `page-${page}` ? 'block' : 'none';
        }
    });

    const titles = { dashboard: 'Dashboard', sales: 'Ventas', inventory: 'Gastos', cobranzas: 'Cobranzas', settings: 'Ajustes' };
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
        titleEl.textContent = titles[page] || page;
    }
    
    // Mostrar/Ocultar el filtro de calendario global
    const filterContainer = document.getElementById('global-filter-container');
    if (filterContainer) {
        const pagesWithFilter = ['dashboard', 'sales', 'inventory'];
        filterContainer.style.display = pagesWithFilter.includes(page) ? 'flex' : 'none';
    }
}

// --- GLOBAL FILTER HANDLERS ---

function handleMonthFilterChange(val) {
    state.filterMonth = val; // Formato "YYYY-MM" o vacío
    
    // Cambiar visualmente el botón de YTD si hay filtro o no
    const btnYtd = document.getElementById('btn-ytd');
    if (btnYtd) {
        if (state.filterMonth) {
            btnYtd.classList.remove('btn-primary');
            btnYtd.classList.add('btn-secondary');
        } else {
            btnYtd.classList.remove('btn-secondary');
            btnYtd.classList.add('btn-primary');
        }
    }
    
    // Re-renderizar todo
    renderAll();
    updateChart();
    
    // Guardar estado localmente (mantiene el filtro del mes seleccionado de forma persistente en esta sesión de dispositivo)
    saveState();
}

function selectYTD() {
    const input = document.getElementById('global-month-filter');
    if (input) input.value = '';
    handleMonthFilterChange('');
}

// --- CHART ---

let mainChart;
function initChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
        console.warn('ChartJS not loaded');
        const container = canvas.parentElement;
        if (container) {
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-mid);font-weight:600;font-size:14px;">📈 Gráficos no disponibles (Modo Offline)</div>';
        }
        return;
    }
    const ctx = canvas.getContext('2d');
    
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
                    label: 'Gastos ($)',
                    borderColor: '#eb5757',
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
    if (typeof Chart === 'undefined' || !mainChart) return;

    const labels = [];
    const incomeData = [];
    const costData = [];
    const filter = state.filterMonth;

    if (filter) {
        // Graficar día a día del mes seleccionado
        const [year, month] = filter.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
        document.getElementById('chart-title').textContent = `Ventas vs Costos (${monthName.toUpperCase()})`;

        const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            labels.push(day);
            
            const daySales = state.sales.filter(s => {
                const d = new Date(s.date);
                return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month) && d.getDate() === day;
            });
            const dayExpenses = state.expenses.filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month) && d.getDate() === day;
            });
            
            incomeData.push(daySales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(dayExpenses.reduce((sum, e) => sum + e.amount, 0));
        }
    } else {
        // Histórico YTD - Agrupar de manera dinámica mes a mes
        document.getElementById('chart-title').textContent = 'Ventas vs Costos (Histórico YTD)';

        const monthsSet = new Set();
        [...state.sales, ...state.expenses].forEach(item => {
            if (item.date) {
                monthsSet.add(item.date.substring(0, 7)); // "YYYY-MM"
            }
        });
        
        const sortedMonths = Array.from(monthsSet).sort();
        if (sortedMonths.length === 0) {
            sortedMonths.push(new Date().toISOString().substring(0, 7));
        }

        sortedMonths.forEach(ym => {
            const [year, month] = ym.split('-');
            const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
            const label = dateObj.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' });
            labels.push(label);

            const mSales = state.sales.filter(s => {
                const d = new Date(s.date);
                return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
            });
            const mExpenses = state.expenses.filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === parseInt(year) && (d.getMonth() + 1) === parseInt(month);
            });

            incomeData.push(mSales.reduce((sum, s) => sum + (s.price * s.qty), 0));
            costData.push(mExpenses.reduce((sum, e) => sum + e.amount, 0));
        });
    }

    mainChart.data.labels = labels;
    mainChart.data.datasets[0].data = incomeData;
    mainChart.data.datasets[1].data = costData;
    mainChart.update();
}

// --- UTILS ---

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
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
        title: "¡Bienvenida a Sweet&Fit v2!",
        text: "Hemos rediseñado tu app para alinearnos al 100% con tu forma de trabajo. Dile adiós a los archivos de Excel complicados.",
        icon: "✨"
    },
    {
        title: "Cuentas por Cobrar en Vivo",
        text: "En la pestaña 'Cobranzas' verás en un solo lugar qué aliados o clientes te deben dinero y cuánto. Podrás registrar sus pagos con una referencia bancaria al instante.",
        icon: "🔴"
    },
    {
        title: "Registra tus Ventas Fácilmente",
        text: "Usa 'Nueva Venta' para asentar pedidos comerciales o individuales. Marca el estatus como PENDIENTE o PAGADO directamente según el momento de la venta.",
        icon: "💰"
    },
    {
        title: "Sigue tus Gastos Reales",
        text: "En la pestaña 'Gastos' podrás registrar cada compra de materia prima o egresos fijos del negocio, sin necesidad de lidiar con stock virtual restrictivo.",
        icon: "💸"
    },
    {
        title: "Dashboard de Utilidad Real",
        text: "Aquí verás tus ganancias reales, egresos y cuentas pendientes en dólares y bolívares según la tasa BCV oficial del momento.",
        icon: "📊"
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
