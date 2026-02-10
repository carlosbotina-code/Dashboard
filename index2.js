// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. VARIABLES DE ESTADO
// ==========================================
let allRecords = [];
let currentPage = 0;
const PAGE_SIZE = 500;
let charts = {};

// ==========================================
// 3. GESTIÓN DE SESIÓN
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

    const { error } = await supabaseClient.auth.signInWithPassword({ 
        email: emailInput.value, 
        password: passInput.value 
    });
    if (error) alert(error.message);
    else checkSession();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

// ==========================================
// 4. CARGA DE DATOS (DATA FETCHING)
// ==========================================
async function loadData() {
    const loadingMsg = document.getElementById('loadingMessage');
    const errorMsg = document.getElementById('errorMessage');
    
    if(loadingMsg) loadingMsg.style.display = 'block';
    if(errorMsg) errorMsg.textContent = "";

    try {
        let query = supabaseClient
            .from('Applications')
            .select(`
                application_id,
                created_at,
                application_status,
                compensation,
                contract_start_date,  
                Candidates!candidate_id ( candidate_name ),
                Job_Openings!job_opening_id ( 
                    assigned_recruiter, 
                    job_purpose, 
                    client_name 
                )
            `)
            .not('compensation', 'is', null)
            .neq('compensation', 0);

        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await query
            .range(from, to)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allRecords = data ? data.map(item => {
            const candidate = Array.isArray(item.Candidates) ? (item.Candidates[0] || {}) : (item.Candidates || {});
            const job = Array.isArray(item.Job_Openings) ? (item.Job_Openings[0] || {}) : (item.Job_Openings || {});

            return {
                id: item.application_id,
                status: item.application_status || 'New',
                compensation: item.compensation || '-',
                Candidate_Name: candidate.candidate_name || 'Unknown Candidate',
                Client_name: job.client_name || 'N/A',
                Assigned_Recruiter: job.assigned_recruiter || 'Unassigned',
                Job_porpuse: job.job_purpose === 'External' ? 'Rec' : (job.job_purpose || 'No Title'),                    
                start_date: item.contract_start_date || null 
            };
        }) : [];

        populateFilters(allRecords);
        applyLocalFilters(); 

    } catch (err) {
        console.error("Critical Error:", err);
        if(errorMsg) errorMsg.textContent = "Error: " + err.message;
    } finally {
        if(loadingMsg) loadingMsg.style.display = 'none';
        if(document.getElementById('tableContainer')) 
            document.getElementById('tableContainer').style.display = 'block';
    }
}

// ==========================================
// 5. GESTIÓN DE FILTROS E INTERFAZ
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
    const recruiterVal = document.getElementById('recruiterFilter')?.value || '';
    const clientVal = document.getElementById('clientFilter')?.value || '';
    const purposeVal = document.getElementById('purposeFilter')?.value || '';
    const dateVal = document.getElementById('dateFilter')?.value || '';

    const filtered = allRecords.filter(item => {
        const matchRecruiter = !recruiterVal || item.Assigned_Recruiter === recruiterVal;
        const matchClient = !clientVal || item.Client_name === clientVal;
        const matchPurpose = !purposeVal || item.Job_porpuse === purposeVal;
        
        let matchDate = true;
        if (item.start_date && dateVal) {
            const d = new Date(item.start_date + 'T12:00:00'); 
            const now = new Date();
            if (dateVal === 'overdue') matchDate = d < now;
            else if (dateVal === 'this_month') {
                matchDate = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }
        } else if (dateVal) matchDate = false;

        return matchRecruiter && matchClient && matchPurpose && matchDate;
    });

    updateKPIs(filtered); 
    renderTable(filtered);           
    renderFinancialTable(filtered);  
    renderPerformanceCharts(filtered);
}

// ==========================================
// 6. RENDERIZADO TABLAS
// ==========================================
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        let cleanComp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
        let feePercent = (item.Job_porpuse === 'Staff Aug') ? 0.10 : 0.15;
        let revenue = Math.max((cleanComp * 12) * feePercent, 3500);

        row.innerHTML = `
            <td><button class="view-btn" onclick="openDetail('${item.id}')">View</button></td>
            <td><strong>${item.Candidate_Name}</strong></td>
            <td>${item.Job_porpuse}</td>
            <td>${item.Client_name}</td>
            <td>${item.compensation}</td> 
            <td>${item.Assigned_Recruiter}</td>
            <td>${item.start_date || '-'}</td>
            <td style="text-align: center;">${(feePercent*100).toFixed(0)}%</td>
            <td style="font-weight: bold; color: #2e7d32;">$${revenue.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

// ==========================================
// 7. FINANCIAL ANALYSIS (FILTRADO SOLO 2025)
// ==========================================
// ==========================================
// 7. FINANCIAL ANALYSIS (INCLUYENDO A DAVID)
// ==========================================
function renderFinancialTable(data) {
    const tbody = document.getElementById('financialBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const summary = {};
    const start2025 = new Date('2025-01-01T00:00:00');
    const end2025 = new Date('2025-12-31T23:59:59');

    data.forEach(item => {
        if (!item.start_date) return;
        const itemDate = new Date(item.start_date + 'T12:00:00');
        if (itemDate < start2025 || itemDate > end2025) return;

        const recruiter = item.Assigned_Recruiter || 'Unassigned';
        
        
        if (recruiter.includes("Luis")) return; 

        let cleanComp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g, "")) || 0;
        let revenue = 0;
        if (cleanComp > 0) {
            const fee = (item.Job_porpuse === 'Staff Aug') ? 0.10 : 0.15;
            revenue = Math.max((cleanComp * 12) * fee, 3500);
        }

        if (!summary[recruiter]) summary[recruiter] = { name: recruiter, totalCommission: 0 };
        summary[recruiter].totalCommission += revenue;
    });

    Object.values(summary).forEach(rec => {
        let fixedComp = 0, recruitingPct = 0.08, entryDate, exitDate;

        // --- CONFIGURACIÓN DE PARÁMETROS POR RECLUTADOR ---
        if (rec.name.includes("David")) {
            fixedComp = 3000; // Según la imagen que subiste
            entryDate = new Date(2025, 10, 27); // 1 de Enero 2025
            exitDate = new Date(2025, 12, 31); // 31 de Diciembre 2025
        } else if (rec.name.includes("Teresa")) {
            fixedComp = 1200;
            entryDate = new Date(2025, 8, 15); exitDate = new Date(2025, 11, 31);
        } else if (rec.name.includes("Paulo")) {
            fixedComp = 500;
            entryDate = new Date(2025, 8, 1); exitDate = new Date(2025, 11, 31);
        } else {
            fixedComp = 0; entryDate = new Date(2025, 0, 1); exitDate = new Date(2025, 11, 31);
        }

        // Cálculo de meses activos para el costo base
        const monthsBetween = Math.round((Math.ceil(Math.abs(exitDate - entryDate) / (86400000)) / 30) * 2) / 2;
        
        // Costo base = (Sueldo Fijo + Costo Operativo Estimado de 2000) * meses
        const costWall = (fixedComp * monthsBetween) + (2000 * monthsBetween);
        
        // Profit final para el reclutador (Comisión)
        const finalProfit = (rec.totalCommission - costWall) * recruitingPct;

        const fmt = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${rec.name}</td>
            <td>${fmt(fixedComp)}</td>
            <td style="text-align:center;">8%</td>
            <td>${fmt(fixedComp/30)}</td>
            <td style="text-align:center;">${monthsBetween}</td>
            <td style="color: #d32f2f;">${fmt(costWall)}</td>
            <td>${entryDate.toLocaleDateString()}</td>
            <td>${exitDate.toLocaleDateString()}</td>
            <td style="text-align: right;">${fmt(rec.totalCommission)}</td>
            <td style="font-weight: bold; color: ${finalProfit >= 0 ? '#2e7d32' : '#c62828'};">
                ${fmt(finalProfit)}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==========================================
// 8. KPIs Y GRÁFICOS (REVISIÓN DE IDs)
// ==========================================
function updateKPIs(data) {
    let totalRev = 0, revStaff = 0, revRec = 0, revGuard = 0;
    const clients = new Set(), recruiters = new Set();

    data.forEach(item => {
        let comp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
        let fee = (item.Job_porpuse === 'Staff Aug' ? 0.1 : 0.15);
        let revenue = Math.max((comp * 12) * fee, 3500);

        if(comp > 0) {
            totalRev += revenue;
            if(item.Job_porpuse === 'Staff Aug') revStaff += revenue;
            else if(item.Job_porpuse === 'Rec') revRec += revenue;
            else if(item.Job_porpuse === 'Guard') revGuard += revenue;
        }
        if(item.Client_name) clients.add(item.Client_name);
        if(item.Assigned_Recruiter) recruiters.add(item.Assigned_Recruiter);
    });

    const setT = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };

    setT('totalRevenue', `$${totalRev.toLocaleString()}`);
    setT('totalPlacements', data.length);
    setT('uniqueClients', clients.size);
    setT('activeRecruiters', recruiters.size);
    setT('revenueStaff', `$${revStaff.toLocaleString()}`);
    setT('revenueRec', `$${revRec.toLocaleString()}`);
    setT('revenueGuard', `$${revGuard.toLocaleString()}`);
}

function renderPerformanceCharts(data) {
    const types = { 'Staff Aug': 0, 'Rec': 0, 'Guard': 0 };
    const recruitersCount = {}, monthlyData = {};

    data.forEach(item => {
        if(types[item.Job_porpuse] !== undefined) types[item.Job_porpuse]++;
        const rec = item.Assigned_Recruiter || 'Unassigned';
        recruitersCount[rec] = (recruitersCount[rec] || 0) + 1;

        if (item.start_date) {
            const date = new Date(item.start_date + 'T12:00:00');
            const monthLabel = date.toLocaleString('en-us', { month: 'short', year: '2-digit' });
            monthlyData[monthLabel] = (monthlyData[monthLabel] || 0) + 1;
        }
    });

    // Función auxiliar para renderizar gráficos de forma segura
    const render = (id, type, labels, datasetLabel, datasetData, colors) => {
        const canvas = document.getElementById(id);
        if(!canvas) return;
        if(charts[id]) charts[id].destroy();
        charts[id] = new Chart(canvas, {
            type: type,
            data: {
                labels: labels,
                datasets: [{ 
                    label: datasetLabel, 
                    data: datasetData, 
                    backgroundColor: colors,
                    borderColor: type === 'line' ? '#1976d2' : 'transparent'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    };

    render('typeChart', 'pie', Object.keys(types), 'Type', Object.values(types), ['#1976d2', '#7b1fa2', '#f57c00']);
    render('recruiterChart', 'bar', Object.keys(recruitersCount), 'Placements', Object.values(recruitersCount), '#1976d2');
    render('monthlyChart', 'line', Object.keys(monthlyData), 'Placements', Object.values(monthlyData), '#1976d2');
}

// ==========================================
// 9. EVENTOS E INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    ['recruiterFilter', 'clientFilter', 'dateFilter', 'purposeFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyLocalFilters);
    });
    checkSession();
});