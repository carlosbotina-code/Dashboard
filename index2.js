// 1. CONFIGURACIÓN
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 1. VARIABLES DE ESTADO
// ==========================================
let allRecords = [];
let currentPage = 0;
const PAGE_SIZE = 500;
let charts = {};

// ==========================================
// 2. GESTIÓN DE SESIÓN
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
    const emailInput = document.getElementById('authEmail');
    const passInput = document.getElementById('authPassword');
    
    if (!emailInput || !passInput) return;

    const email = emailInput.value;
    const password = passInput.value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkSession();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

// ==========================================
// 3. CARGA DE DATOS (DATA FETCHING)
// ==========================================
async function loadData() {
    const loadingMsg = document.getElementById('loadingMessage');
    const errorMsg = document.getElementById('errorMessage');
    
    if(loadingMsg) loadingMsg.style.display = 'block';
    if(errorMsg) errorMsg.textContent = "";

    try {
        console.log("1. Iniciando petición a Supabase...");

        let query = supabaseClient
            .from('Applications')
            .select(`
                application_id,
                created_at,
                application_status,
                compensation,
                contract_start_date,  
                Candidates!candidate_id ( 
                    candidate_name
                ),
                Job_Openings!job_opening_id ( 
                    assigned_recruiter, 
                    job_purpose, 
                    client_name 
                )
            `);            

        // FILTROS DE BASE DE DATOS
        query = query
            .not('compensation', 'is', null)
            .neq('compensation', 0); // Nota: Si 'compensation' es texto en DB, esto podría no filtrar el '0' numérico correctamente, pero el JS lo limpia luego.

        // PAGINACIÓN
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        query = query
            .range(from, to)
            .order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
            console.error("❌ Error de Supabase:", error);
            throw new Error(error.message);
        }

        if (!data || data.length === 0) {
            allRecords = [];
        } else {
            // MAPEO DE DATOS (FLATTENING)
            allRecords = data.map(item => {
                // Manejo seguro de arrays o objetos anidados
                const candidate = Array.isArray(item.Candidates) ? (item.Candidates[0] || {}) : (item.Candidates || {});
                const job = Array.isArray(item.Job_Openings) ? (item.Job_Openings[0] || {}) : (item.Job_Openings || {});

                return {
                    id: item.application_id,
                    status: item.application_status || 'New',
                    compensation: item.compensation || '-',
                    Candidate_Name: candidate.candidate_name || 'Unknown Candidate',
                    Client_name: job.client_name || 'N/A',
                    Assigned_Recruiter: job.assigned_recruiter || 'Unassigned',
                    // Normalización del Job Purpose (External -> Rec)
                    Job_porpuse: job.job_purpose === 'External' ? 'Rec' : (job.job_purpose || 'No Title'),                    
                    start_date: item.contract_start_date || null 
                };
            });
        }

        populateFilters(allRecords);
        // Aplicamos filtros locales que a su vez llaman a updateKPIs, renderTable y Charts
        applyLocalFilters(); 
        

    } catch (err) {
        console.error("Critical Error:", err);
        if(errorMsg) errorMsg.textContent = "Error: " + err.message;
    } finally {
        if(loadingMsg) loadingMsg.style.display = 'none';
        const tableContainer = document.getElementById('tableContainer');
        if(tableContainer) tableContainer.style.display = 'block';
    }
}

// ==========================================
// 4. GESTIÓN DE FILTROS
// ==========================================
function populateFilters(data) {
    const recruiters = [...new Set(data.map(item => item.Assigned_Recruiter).filter(Boolean))];
    const clients = [...new Set(data.map(item => item.Client_name).filter(Boolean))];
    const purposes = [...new Set(data.map(item => item.Job_porpuse).filter(Boolean))];

    fillSelect('recruiterFilter', recruiters, 'All Recruiters');
    fillSelect('clientFilter', clients, 'All Clients');
    fillSelect('purposeFilter', purposes, 'All Purposes');
}

function fillSelect(id, items, defaultText) {
    const select = document.getElementById(id);
    if (!select) return; 

    const currentVal = select.value;
    select.innerHTML = `<option value="">${defaultText}</option>`;
    
    items.sort().forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        if (item === currentVal) option.selected = true;
        select.appendChild(option);
    });
}

function applyLocalFilters() {
    const recruiterEl = document.getElementById('recruiterFilter');
    const clientEl = document.getElementById('clientFilter');
    const purposeEl = document.getElementById('purposeFilter');
    const dateEl = document.getElementById('dateFilter');

    // Valores seguros
    const recruiterVal = recruiterEl ? recruiterEl.value : '';
    const clientVal = clientEl ? clientEl.value : '';
    const purposeVal = purposeEl ? purposeEl.value : '';
    const dateVal = dateEl ? dateEl.value : '';

    const filtered = allRecords.filter(item => {
        const matchRecruiter = !recruiterVal || item.Assigned_Recruiter === recruiterVal;
        const matchClient = !clientVal || item.Client_name === clientVal;
        const matchPurpose = !purposeVal || item.Job_porpuse === purposeVal;
        
        let matchDate = true;
        if (item.start_date && dateVal) {
            // Truco para evitar problemas de zona horaria al comparar solo fechas
            const d = new Date(item.start_date + 'T00:00:00'); 
            const now = new Date();
            
            if (dateVal === 'overdue') {
                matchDate = d < now;
            } else if (dateVal === 'this_month') {
                matchDate = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }
        } else if (dateVal) {
            // Si hay filtro de fecha pero el registro no tiene fecha
            matchDate = false; 
        }

        return matchRecruiter && matchClient && matchPurpose && matchDate;
    });

    // Actualizamos UI con la data filtrada
    updateKPIs(filtered); 
    renderTable(filtered);
    renderPerformanceCharts(filtered);
}

// ==========================================
// 5. RENDERIZADO DE TABLA
// ==========================================
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">No records found</td></tr>';
        return;
    }

    data.forEach((item) => {
        const row = document.createElement('tr');
        
        // --- PROCESAMIENTO DE FECHA ---
        let formattedDateDisplay = '-';
        if (item.start_date) {
            // Aseguramos formato YYYY-MM-DD
            const parts = item.start_date.split('-'); 
            if(parts.length === 3) {
                const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                formattedDateDisplay = dateObj.toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                });
            }
        }

        let cleanComp = 0;
        if(item.compensation && item.compensation !== '-') {
             cleanComp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
        }

        let feePercent = (item.Job_porpuse === 'Staff Aug') ? 0.10 : 0.15;
        let feeLabel = (item.Job_porpuse === 'Staff Aug') ? "10%" : "15%";

        let revenueDisplay = '-';
        if (cleanComp > 0) {
            // 1. Calculamos el valor teórico
            let revenue = (cleanComp * 12) * feePercent;

            // 2. Aplicamos el mínimo de 3,500
            // Si el cálculo es menor a 3500, Math.max elegirá 3500.
            revenue = Math.max(revenue, 3500);

            // 3. Formateamos para mostrar
            revenueDisplay = revenue.toLocaleString('en-US', { 
                style: 'currency', 
                currency: 'USD', 
                minimumFractionDigits: 0, 
                maximumFractionDigits: 0 
            });
        }

        // --- HTML ---
        row.innerHTML = `
            <td><button class="view-btn" onclick="openDetail('${item.id}')">View</button></td>
            <td><strong>${item.Candidate_Name}</strong></td>
            <td>${item.Job_porpuse}</td>
            <td>${item.Client_name}</td>
            <td>${item.compensation}</td> 
            <td>${item.Assigned_Recruiter}</td>
            <td>${formattedDateDisplay}</td>
            <td style="text-align: center;">
                <span style="background-color: #f0f0f0; padding: 4px 8px; border-radius: 10px; font-size: 0.85em;">
                    ${feeLabel}
                </span>
            </td>
            <td style="font-weight: bold; color: #2e7d32;">
                ${revenueDisplay}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==========================================
// 6. CÁLCULO DE KPIs
// ==========================================
function updateKPIs(data) {
    let totalRevenue = 0;
    let revenueStaff = 0;
    let revenueRec = 0;
    let revenueGuard = 0;
    
    // Contamos solo los que tienen compensación válida
    const placementsWithComp = data.filter(item => {
        if(!item.compensation || item.compensation === '-') return false;
        const val = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,""));
        return val > 0;
    });

    const totalPlacements = placementsWithComp.length; // O usa data.length si prefieres contar todos
    
    // Simulación de métricas
    const totalOffers = totalPlacements + 3; 
    const conversionRate = totalOffers > 0 ? Math.round((totalPlacements / totalOffers) * 100) : 0;
    
    const totalInterviews = totalPlacements * 1.4;
    const efficiencyGain = totalInterviews > 0 ? Math.round((totalPlacements / totalInterviews) * 100) : 0;

    // Bucle principal de cálculo
    data.forEach(item => {
        let cleanComp = 0;
        if(item.compensation && item.compensation !== '-') {
             cleanComp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
        }

        if (cleanComp > 0) {
            const feePercent = (item.Job_porpuse === 'Staff Aug') ? 0.10 : 0.15;
            const revenue = (cleanComp * 12) * feePercent;
            
            totalRevenue += revenue;
            
            if (item.Job_porpuse === 'Staff Aug') {
                revenueStaff += revenue;
            } else if (item.Job_porpuse === 'Rec') {
                revenueRec += revenue;
            } else if (item.Job_porpuse === 'Guard') {
                revenueGuard += revenue;
            }
        }
    });

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const safeSetText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };

    // Actualización del DOM
    safeSetText('totalRevenue', formatter.format(totalRevenue));
    safeSetText('revenueStaff', formatter.format(revenueStaff));
    safeSetText('revenueRec', formatter.format(revenueRec));
    safeSetText('revenueGuard', formatter.format(revenueGuard));
    
    safeSetText('totalRecords', data.length);
    safeSetText('uniqueClients', new Set(data.map(i => i.Client_name)).size);
    safeSetText('activeRecruiters', new Set(data.map(i => i.Assigned_Recruiter)).size);
    safeSetText('totalPlacements', totalPlacements);
    safeSetText('conversionRate', `${conversionRate}%`);
    safeSetText('efficiencyGain', `${efficiencyGain}%`);

    // Top Recruiter / Client Logic (Opcional, si tienes los IDs en HTML)
    updateRankings(data, safeSetText);
}

function updateRankings(data, safeSetText) {
    const recruitersCount = {};
    const clientsCount = {};
    data.forEach(item => {
        const r = item.Assigned_Recruiter || 'Unassigned';
        const c = item.Client_name || 'N/A';
        recruitersCount[r] = (recruitersCount[r] || 0) + 1;
        clientsCount[c] = (clientsCount[c] || 0) + 1;
    });
    
    const topRec = Object.entries(recruitersCount).sort((a,b) => b[1]-a[1])[0];
    const topCli = Object.entries(clientsCount).sort((a,b) => b[1]-a[1])[0];

    safeSetText('topRecruiter', topRec ? topRec[0] : '-');
    safeSetText('topClient', topCli ? topCli[0] : '-');
}

// ==========================================
// 7. DETALLES Y PAGINACIÓN
// ==========================================
function openDetail(id) {
    const item = allRecords.find(r => r.id === id);
    if (!item) return; 

    let detailDate = '-';
    if (item.start_date) {
        const p = item.start_date.split('-');
        if(p.length === 3) {
            detailDate = new Date(p[0], p[1]-1, p[2]).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
        }
    }

    const titleEl = document.getElementById('detailTitle');
    const gridEl = document.getElementById('detailGrid');
    const viewEl = document.getElementById('detailView');

    if(titleEl) titleEl.textContent = item.Candidate_Name; 
    if(gridEl) {
        gridEl.innerHTML = `
            <div class="detail-item"><label>Candidate</label><p>${item.Candidate_Name}</p></div>
            <div class="detail-item"><label>Job Purpose</label><p>${item.Job_porpuse}</p></div>
            <div class="detail-item"><label>Client</label><p>${item.Client_name}</p></div>
            <div class="detail-item"><label>Recruiter</label><p>${item.Assigned_Recruiter}</p></div>
            <div class="detail-item"><label>Start Date</label><p>${detailDate}</p></div>
            <div class="detail-item"><label>Status</label><p>${item.status}</p></div>
        `;
    }
    if(viewEl) viewEl.style.display = 'flex';
}

function closeDetail() {
    const viewEl = document.getElementById('detailView');
    if(viewEl) viewEl.style.display = 'none';
}

async function changePage(dir) {
    currentPage += dir;
    if (currentPage < 0) currentPage = 0;
    
    const ind = document.getElementById('pageIndicator');
    if(ind) ind.textContent = `Page ${currentPage + 1}`;
    
    await loadData();
}

// ==========================================
// 8. GRÁFICOS (CHARTS)
// ==========================================
function renderPerformanceCharts(data) {
    // A. PREPARAR DATOS
    const typesCount = { 'Staff Aug': 0, 'Rec': 0, 'Guard': 0 };
    const recruitersCount = {};
    const monthlyPlacements = {}; 

    data.forEach(item => {
        // 1. Tipos
        if (typesCount[item.Job_porpuse] !== undefined) typesCount[item.Job_porpuse]++;
        
        // 2. Reclutadores
        const name = item.Assigned_Recruiter || 'Unassigned';
        recruitersCount[name] = (recruitersCount[name] || 0) + 1;

        // 3. Histórico Mensual
        if (item.start_date) {
            // "Hack" seguro para fechas: crear fecha con hora a medio día para evitar saltos de TZ
            const date = new Date(item.start_date + 'T12:00:00');
            const monthIndex = date.getMonth(); 
            const year = date.getFullYear();
            const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
            
            // Clave de ordenamiento: YYYY-MM
            const sortKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
            
            if (!monthlyPlacements[sortKey]) {
                monthlyPlacements[sortKey] = { label: label, count: 0, revenue: 0 };
            }
            
            monthlyPlacements[sortKey].count += 1;
            
            let cleanComp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
            const fee = (item.Job_porpuse === 'Staff Aug') ? 0.10 : 0.15;
            monthlyPlacements[sortKey].revenue += (cleanComp * 12) * fee;
        }
    });

    // Destruir gráficos anteriores
    Object.values(charts).forEach(chart => { if(chart) chart.destroy(); });

    // --- GRÁFICO 1: PIE (Tipos) ---
    const typeCanvas = document.getElementById('typeChart');
    if(typeCanvas) {
        charts.type = new Chart(typeCanvas, {
            type: 'pie',
            data: {
                labels: Object.keys(typesCount),
                datasets: [{
                    data: Object.values(typesCount),
                    backgroundColor: ['#1976d2', '#7b1fa2', '#f57c00']
                }]
            }
        });
    }

    // --- GRÁFICO 2: BARRAS (Reclutadores) ---
    const recCanvas = document.getElementById('recruiterChart');
    if(recCanvas) {
        charts.recruiter = new Chart(recCanvas, {
            type: 'bar',
            data: {
                labels: Object.keys(recruitersCount),
                datasets: [{
                    label: 'Placements',
                    data: Object.values(recruitersCount),
                    backgroundColor: '#1976d2'
                }]
            },
            options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

    // --- GRÁFICO 3: LÍNEA (Mensual Histórico) ---
    const monthlyCanvas = document.getElementById('monthlyChart');
    if(monthlyCanvas) {
        // Ordenamos cronológicamente
        const sortedKeys = Object.keys(monthlyPlacements).sort(); 
        const labels = sortedKeys.map(key => monthlyPlacements[key].label);
        const placementData = sortedKeys.map(key => monthlyPlacements[key].count);
        const revenueData = sortedKeys.map(key => monthlyPlacements[key].revenue);

        charts.monthly = new Chart(monthlyCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Placements',
                        data: placementData,
                        borderColor: '#1976d2',
                        backgroundColor: '#1976d2',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    {
                        label: 'Revenue ($)',
                        data: revenueData,
                        borderColor: '#7b1fa2',
                        backgroundColor: '#7b1fa2',
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { 
                        type: 'linear', display: true, position: 'left',
                        title: { display: true, text: 'Placements' },
                        beginAtZero: true
                    },
                    y1: { 
                        type: 'linear', display: true, position: 'right', 
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Revenue ($)' },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// ==========================================
// 9. LISTENERS (INICIALIZACIÓN)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Listeners de filtros
    ['recruiterFilter', 'clientFilter', 'dateFilter', 'purposeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', applyLocalFilters);
    });
    
    // Búsqueda
    const searchIn = document.getElementById('searchInput');
    if(searchIn) {
        searchIn.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') loadData();
        });
    }

    // Paginación
    const btnPrev = document.getElementById('prevPage');
    const btnNext = document.getElementById('nextPage');
    if(btnPrev) btnPrev.addEventListener('click', () => changePage(-1));
    if(btnNext) btnNext.addEventListener('click', () => changePage(1));

    // Supabase Auth Listener
    if(typeof supabaseClient !== 'undefined') {
        supabaseClient.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') checkSession();
        });
        checkSession();
    } else {
        console.error("⚠️ supabaseClient no está definido. Asegúrate de importar la librería de Supabase antes de este script.");
    }
});