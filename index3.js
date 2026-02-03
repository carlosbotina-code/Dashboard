// ==========================================
// 1. CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. STATE VARIABLES & CONSTANTS
// ==========================================
let allRecords = [];
let charts = {}; 

const quartersMap = {
    "January": "Q1", "February": "Q1", "March": "Q1",
    "April": "Q2", "May": "Q2", "June": "Q2",
    "July": "Q3", "August": "Q3", "September": "Q3",
    "October": "Q4", "November": "Q4", "December": "Q4"
};

const monthOrder = { 
    'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 
    'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 
};

// ==========================================
// 3. AUTH & SESSION MANAGEMENT
// ==========================================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authContainer = document.getElementById('authContainer');
    const dashboardContent = document.getElementById('dashboardContent');

    if (session) {
        if(authContainer) authContainer.style.display = 'none';
        if(dashboardContent) dashboardContent.style.display = 'block';
        loadData();
    } else {
        if(authContainer) authContainer.style.display = 'flex';
        if(dashboardContent) dashboardContent.style.display = 'none';
    }
}

async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errorMsg = document.getElementById('loginError');
    if (!email || !password) return;
    errorMsg.textContent = "Authenticating...";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) errorMsg.textContent = error.message;
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

// ==========================================
// 4. DATA FETCHING
// ==========================================
async function loadData() {
    const loadingMsg = document.getElementById('loadingMessage');
    if(loadingMsg) loadingMsg.style.display = 'inline';

    try {
        let query = supabaseClient.from('revenue_records').select('*');
        const { data, error } = await query;
        if (error) throw error;

        allRecords = (data || []).filter(item => {
            const isValid = item.customer_name && item.billing_month && item.amount !== null;
            const category = String(item.revenue_category || '');
            const type = String(item.revenue_type || '');
            const isExcluded = category.includes('Device Purchase Cost') || type.includes('Device Purchase Cost');
            return isValid && !isExcluded;
        });

        populateFilters(allRecords);
        applyFilters(); 

    } catch (err) {
        console.error("Error:", err);
        alert("Error loading data: " + err.message);
    } finally {
        if(loadingMsg) loadingMsg.style.display = 'none';
    }
}

// ==========================================
// 5. FILTERS (MEJORADO: MES + AÑO)
// ==========================================
function populateFilters(data) {
    // 1. Clientes
    const clients = [...new Set(data.map(item => item.customer_name))].sort().filter(Boolean);

    // 2. Periodos (Q1, Q2...)
    const periodsSet = new Set();
    data.forEach(item => {
        if(item.billing_year && item.billing_month) {
            const q = quartersMap[item.billing_month];
            if(q) periodsSet.add(`${item.billing_year} - ${q}`);
        }
    });
    const periods = [...periodsSet].sort().reverse(); 

    // 3. MEJORA: Meses con Año (ej: "January 2025")
    const monthSet = new Set();
    data.forEach(item => {
        if(item.billing_month && item.billing_year) {
            monthSet.add(`${item.billing_month} ${item.billing_year}`);
        }
    });
    
    // Ordenar cronológicamente (Año primero, luego mes)
    const sortedMonths = [...monthSet].sort((a, b) => {
        const [mA, yA] = a.split(' ');
        const [mB, yB] = b.split(' ');
        if (yA !== yB) return yA - yB;
        return monthOrder[mA] - monthOrder[mB];
    });

    fillSelect('periodFilter', periods, 'All Periods');
    fillSelect('monthFilter', sortedMonths, 'All Months'); // Ahora pasamos "Month Year"
    fillSelect('clientFilter', clients, 'All Clients');
}

function fillSelect(id, items, defaultText) {
    const select = document.getElementById(id);
    if(select.options.length > 1) return;
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; 
        opt.textContent = item; 
        select.appendChild(opt);
    });
}

function applyFilters() {
    const periodVal = document.getElementById('periodFilter').value;
    const monthYearVal = document.getElementById('monthFilter').value; // Valor "January 2025"
    const clientVal = document.getElementById('clientFilter').value;

    const filtered = allRecords.filter(item => {
        // Filtro 1: Periodo
        let matchPeriod = true;
        if (periodVal) {
            const [selYear, selQ] = periodVal.split(' - ');
            const itemQ = quartersMap[item.billing_month];
            matchPeriod = (String(item.billing_year) === selYear) && (itemQ === selQ);
        }

        // Filtro 2: Mes + Año (Lógica Actualizada)
        let matchMonth = true;
        if (monthYearVal) {
            const currentItemKey = `${item.billing_month} ${item.billing_year}`;
            matchMonth = currentItemKey === monthYearVal;
        }
        
        // Filtro 3: Cliente
        const matchClient = !clientVal || item.customer_name === clientVal;

        return matchPeriod && matchMonth && matchClient;
    });

    updateDashboard(filtered);
}

// ==========================================
// 6. DASHBOARD UPDATE
// ==========================================
function updateDashboard(data) {
    // A. KPIs (Igual que antes)
    const totalRev = data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const uniqueClients = new Set(data.map(i => i.customer_name)).size;
    const clientCounts = {};
    data.forEach(i => { clientCounts[i.customer_name] = (clientCounts[i.customer_name] || 0) + parseFloat(i.amount) });
    const topClientName = Object.keys(clientCounts).sort((a,b) => clientCounts[b] - clientCounts[a])[0] || '-';

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRev);
    document.getElementById('totalRecords').textContent = data.length;
    document.getElementById('activeClients').textContent = uniqueClients;
    document.getElementById('topClient').textContent = topClientName;

    // B. KPIs por Línea
    const guardTotal = data.filter(i => (i.revenue_category || '').includes('Guard')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);
    const recTotal = data.filter(i => (i.revenue_category || '').includes('Recruiting')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);
    const staffTotal = data.filter(i => (i.revenue_category || '').includes('Staff') || (i.revenue_category || '').includes('ProServ')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);

    document.getElementById('guardRevenue').textContent = formatCurrency(guardTotal);
    document.getElementById('recRevenue').textContent = formatCurrency(recTotal);
    document.getElementById('staffRevenue').textContent = formatCurrency(staffTotal);

    // C. TABLA
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    data.sort((a, b) => {
        if (b.billing_year !== a.billing_year) return b.billing_year - a.billing_year;
        return monthOrder[b.billing_month] - monthOrder[a.billing_month];
    });
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No records found</td></tr>';
    } else {
        data.forEach(row => {
            const tr = `<tr>
                <td><strong>${row.customer_name}</strong></td>
                <td>${row.billing_month} ${row.billing_year}</td>
                <td>${row.revenue_category || '-'}</td>
                <td><span style="background:#eee; padding:2px 6px; border-radius:4px; font-size:0.8em">${row.revenue_type || '-'}</span></td>
                <td>${formatCurrency(row.amount)}</td>
            </tr>`;
            tbody.innerHTML += tr;
        });
    }

    renderCharts(data);
}

// ==========================================
// 7. RENDER CHARTS (MEJORADO: STACKED BARS)
// ==========================================
function renderCharts(data) {
    // 1. Preparar Datos para Gráfico Apilado (Mes x Categoría)
    const monthlyStacked = {}; // { "January 2025": { Guard: 100, Recruiting: 50... } }
    const categoryCounts = {}; // Para el Doughnut

    data.forEach(item => {
        const key = `${item.billing_month} ${item.billing_year}`;
        const amount = parseFloat(item.amount) || 0;
        
        // Identificar Categoría Simplificada
        let cat = 'Other';
        const rawCat = (item.revenue_category || '').toLowerCase();
        if(rawCat.includes('guard')) cat = 'Guard';
        else if(rawCat.includes('recruiting')) cat = 'Recruiting';
        else if(rawCat.includes('staff') || rawCat.includes('proserv')) cat = 'Staffing';

        // Llenar datos apilados
        if (!monthlyStacked[key]) monthlyStacked[key] = { Guard: 0, Recruiting: 0, Staffing: 0, Other: 0 };
        monthlyStacked[key][cat] += amount;

        // Llenar datos de dona global
        const displayCat = item.revenue_category || 'Uncategorized';
        categoryCounts[displayCat] = (categoryCounts[displayCat] || 0) + amount;
    });

    // Ordenar Meses Cronológicamente
    const sortedKeys = Object.keys(monthlyStacked).sort((a, b) => {
        const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
        if (yA !== yB) return yA - yB;
        return monthOrder[mA] - monthOrder[mB];
    });

    // Arrays para Chart.js
    const guardData = sortedKeys.map(k => monthlyStacked[k].Guard);
    const recData = sortedKeys.map(k => monthlyStacked[k].Recruiting);
    const staffData = sortedKeys.map(k => monthlyStacked[k].Staffing);
    const otherData = sortedKeys.map(k => monthlyStacked[k].Other);
    
    // Calcular totales por mes para la regresión
    const monthlyTotals = sortedKeys.map(k => 
        monthlyStacked[k].Guard + monthlyStacked[k].Recruiting + monthlyStacked[k].Staffing + monthlyStacked[k].Other
    );

    // Limpiar gráficos
    ['trend', 'category', 'forecast'].forEach(k => { if(charts[k]) charts[k].destroy(); });

    // --- CHART 1: MONTHLY PERFORMANCE (STACKED BAR) ---
    // Muestra: Guard vs Recruiting vs Staffing por mes
    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
            labels: sortedKeys,
            datasets: [
                { label: 'Guard', data: guardData, backgroundColor: '#f1c40f' },
                { label: 'Recruiting', data: recData, backgroundColor: '#3498db' },
                { label: 'Staffing', data: staffData, backgroundColor: '#9b59b6' },
                { label: 'Other', data: otherData, backgroundColor: '#95a5a6' }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.raw);
                        }
                    }
                }
            }
        }
    });

    // --- CHART 2: REVENUE MIX (DOUGHNUT) ---
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    charts.category = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                data: Object.values(categoryCounts),
                backgroundColor: ['#f1c40f', '#2ecc71', '#9b59b6', '#e74c3c', '#34495e']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: 10} } } } }
    });

    // --- CHART 3: FORECAST (LINEAR REGRESSION) ---
    // Mantenemos la lógica pero usando los totales mensuales calculados
    if (sortedKeys.length > 1) {
        const forecastData = calculateLinearRegression(monthlyTotals);
        const nextLabel = "Projected Next"; 
        const ctxForecast = document.getElementById('forecastChart').getContext('2d');
        charts.forecast = new Chart(ctxForecast, {
            type: 'line',
            data: {
                labels: [...sortedKeys, nextLabel],
                datasets: [
                    {
                        label: 'Total Revenue History',
                        data: [...monthlyTotals, null],
                        borderColor: '#2c3e50',
                        backgroundColor: '#2c3e50',
                        tension: 0.3
                    },
                    {
                        label: 'Trend Forecast',
                        data: forecastData,
                        borderColor: '#e74c3c',
                        borderDash: [5, 5],
                        pointRadius: 0,
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: { responsive: true, interaction: { mode: 'index', intersect: false } }
        });
    }
}

// --- UTILITIES ---
function calculateLinearRegression(yValues) {
    const xValues = yValues.map((_, i) => i);
    const n = yValues.length;
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const result = [];
    for (let i = 0; i <= n; i++) result.push(slope * i + intercept);
    return result;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
}

// ==========================================
// 8. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('periodFilter').addEventListener('change', applyFilters);
    document.getElementById('monthFilter').addEventListener('change', applyFilters);
    document.getElementById('clientFilter').addEventListener('change', applyFilters);

    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            checkSession();
        });
        checkSession();
    }
});