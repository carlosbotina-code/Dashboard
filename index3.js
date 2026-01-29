// ==========================================
// 1. CONFIGURACIÓN SUPABASE
// ==========================================
// ¡PEGA AQUÍ TUS CREDENCIALES REALES!
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// ==========================================
// 2. STATE VARIABLES & CONSTANTS
// ==========================================
let allRecords = [];
let charts = {}; 

// Mapas para la lógica de Trimestres
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
// 4. DATA FETCHING (CON LIMPIEZA Y EXCLUSIÓN)
// ==========================================
async function loadData() {
    const loadingMsg = document.getElementById('loadingMessage');
    if(loadingMsg) loadingMsg.style.display = 'inline';

    try {
        let query = supabaseClient.from('revenue_records').select('*');
        const { data, error } = await query;

        if (error) throw error;

        // FILTRO DE LIMPIEZA
        allRecords = (data || []).filter(item => {
            // 1. Validar integridad básica
            const isValid = item.customer_name && item.billing_month && item.amount !== null;
            
            // 2. EXCLUSIÓN: "Device Purchase Cost"
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
// 5. FILTERS (FUSIONADO AÑO + TRIMESTRE)
// ==========================================
function populateFilters(data) {
    const months = [...new Set(data.map(item => item.billing_month))].filter(Boolean);
    const clients = [...new Set(data.map(item => item.customer_name))].sort().filter(Boolean);

    // Lógica Periodo (2025 - Q4)
    const periodsSet = new Set();
    data.forEach(item => {
        if(item.billing_year && item.billing_month) {
            const q = quartersMap[item.billing_month];
            if(q) periodsSet.add(`${item.billing_year} - ${q}`);
        }
    });

    // Ordenar Periodos (Más recientes primero)
    const periods = [...periodsSet].sort().reverse(); 

    // Ordenar Meses lógicamente
    months.sort((a, b) => monthOrder[a] - monthOrder[b]);

    fillSelect('periodFilter', periods, 'All Periods');
    fillSelect('monthFilter', months, 'All Months');
    fillSelect('clientFilter', clients, 'All Clients');
}

function fillSelect(id, items, defaultText) {
    const select = document.getElementById(id);
    // Evitar duplicados si ya se llenó
    if(select.options.length > 1) return;
    
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; 
        opt.textContent = item; 
        select.appendChild(opt);
    });
}

function applyFilters() {
    const periodVal = document.getElementById('periodFilter').value; // Ej: "2025 - Q4"
    const monthVal = document.getElementById('monthFilter').value;
    const clientVal = document.getElementById('clientFilter').value;

    const filtered = allRecords.filter(item => {
        // 1. Filtro Periodo
        let matchPeriod = true;
        if (periodVal) {
            const [selYear, selQ] = periodVal.split(' - ');
            const itemQ = quartersMap[item.billing_month];
            matchPeriod = (String(item.billing_year) === selYear) && (itemQ === selQ);
        }

        // 2. Filtro Mes
        const matchMonth = !monthVal || item.billing_month === monthVal;
        
        // 3. Filtro Cliente
        const matchClient = !clientVal || item.customer_name === clientVal;

        return matchPeriod && matchMonth && matchClient;
    });

    updateDashboard(filtered);
}

// ==========================================
// 6. DASHBOARD UPDATE (KPIs + TABLA + GRÁFICOS)
// ==========================================
function updateDashboard(data) {
    // --- A. KPIs GENERALES ---
    const totalRev = data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const uniqueClients = new Set(data.map(i => i.customer_name)).size;
    
    const clientCounts = {};
    data.forEach(i => { clientCounts[i.customer_name] = (clientCounts[i.customer_name] || 0) + parseFloat(i.amount) });
    const topClientName = Object.keys(clientCounts).sort((a,b) => clientCounts[b] - clientCounts[a])[0] || '-';

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRev);
    document.getElementById('totalRecords').textContent = data.length;
    document.getElementById('activeClients').textContent = uniqueClients;
    document.getElementById('topClient').textContent = topClientName;

    // --- B. KPIs POR LÍNEA DE NEGOCIO ---
    const guardTotal = data.filter(i => (i.revenue_category || '').includes('Guard')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);
    const recTotal = data.filter(i => (i.revenue_category || '').includes('Recruiting')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);
    const staffTotal = data.filter(i => (i.revenue_category || '').includes('Staff') || (i.revenue_category || '').includes('ProServ')).reduce((sum, i) => sum + (parseFloat(i.amount)||0), 0);

    document.getElementById('guardRevenue').textContent = formatCurrency(guardTotal);
    document.getElementById('recRevenue').textContent = formatCurrency(recTotal);
    document.getElementById('staffRevenue').textContent = formatCurrency(staffTotal);

    // --- C. TABLA (ORDENADA DESCENDENTE) ---
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    // Ordenar: Año (Desc) -> Mes (Desc)
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

    // --- D. RENDERIZAR GRÁFICOS ---
    renderCharts(data);
}

function renderCharts(data) {
    // 1. Preparar Datos
    const monthlyData = {};
    const categoryCounts = {};

    data.forEach(item => {
        // Trend
        const key = `${item.billing_month} ${item.billing_year}`;
        monthlyData[key] = (monthlyData[key] || 0) + parseFloat(item.amount);

        // Mix
        const cat = item.revenue_category || 'Uncategorized';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + parseFloat(item.amount);
    });

    // Ordenar Cronológicamente para el gráfico
    const sortedKeys = Object.keys(monthlyData).sort((a, b) => {
        const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
        if (yA !== yB) return yA - yB;
        return monthOrder[mA] - monthOrder[mB];
    });
    const monthlyValues = sortedKeys.map(k => monthlyData[k]);

    // Limpiar gráficos previos
    ['trend', 'category', 'forecast'].forEach(k => { if(charts[k]) charts[k].destroy(); });

    // --- CHART 1: MONTHLY TREND (BAR) ---
    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    charts.trend = new Chart(ctxTrend, {
        type: 'bar', 
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Monthly Revenue',
                data: monthlyValues,
                backgroundColor: '#3498db',
                borderRadius: 4
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
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
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // --- CHART 3: FORECAST (LINEAR REGRESSION) ---
    if (sortedKeys.length > 1) {
        const forecastData = calculateLinearRegression(monthlyValues);
        const nextLabel = "Projected Next"; 
        const ctxForecast = document.getElementById('forecastChart').getContext('2d');
        charts.forecast = new Chart(ctxForecast, {
            type: 'line',
            data: {
                labels: [...sortedKeys, nextLabel],
                datasets: [
                    {
                        label: 'Historical Data',
                        data: [...monthlyValues, null],
                        borderColor: '#3498db',
                        backgroundColor: '#3498db',
                        tension: 0.2
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

// Regresión Lineal Simple
function calculateLinearRegression(yValues) {
    const xValues = yValues.map((_, i) => i);
    const n = yValues.length;
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    
    // y = mx + b
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const result = [];
    // Generamos puntos hasta n (el futuro próximo)
    for (let i = 0; i <= n; i++) {
        result.push(slope * i + intercept);
    }
    return result;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
}

// ==========================================
// 7. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Listeners de filtros
    document.getElementById('periodFilter').addEventListener('change', applyFilters);
    document.getElementById('monthFilter').addEventListener('change', applyFilters);
    document.getElementById('clientFilter').addEventListener('change', applyFilters);

    // Auth Listener
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            checkSession();
        });
        checkSession();
    }
});