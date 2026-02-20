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

            // --- NUEVO CÓDIGO AQUÍ ---
            let recruiterName = job.assigned_recruiter || 'Unassigned';
            if (recruiterName.includes('David')) {
                recruiterName = 'David Rincon (Inactive)';
            }
            // -------------------------

            return {
                id: item.application_id,
                status: item.application_status || 'New',
                compensation: item.compensation || '-',
                Candidate_Name: candidate.candidate_name || 'Unknown Candidate',
                Client_name: job.client_name || 'N/A',
                Assigned_Recruiter: recruiterName, // <-- Usamos la variable modificada
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

        if (recruiter.includes("David") || recruiter.includes("Luis")) return;


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


        if (rec.name.includes("Teresa")) {

            fixedComp = 1200;

            entryDate = new Date(2025, 8, 15); exitDate = new Date(2025, 11, 31);

        } else if (rec.name.includes("Paulo")) {

            fixedComp = 500;

            entryDate = new Date(2025, 8, 1); exitDate = new Date(2025, 11, 31);

        } else {

            fixedComp = 0; entryDate = new Date(2025, 0, 1); exitDate = new Date(2025, 11, 31);

        }


        const monthsBetween = Math.round((Math.ceil(Math.abs(exitDate - entryDate) / (86400000)) / 30) * 2) / 2;

        const costWall = (fixedComp * monthsBetween) + (2000 * monthsBetween);

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

            <td style="text-align: center;">${fmt(rec.totalCommission)}</td>

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
    const recruitersCount = {};
    const monthlyStats = {}; // Cambiamos monthlyData por monthlyStats para guardar más detalles

    data.forEach(item => {
        // 1. Tipos de trabajo
        if(types[item.Job_porpuse] !== undefined) types[item.Job_porpuse]++;
        
        // 2. Reclutadores
        const rec = item.Assigned_Recruiter || 'Unassigned';
        recruitersCount[rec] = (recruitersCount[rec] || 0) + 1;

        // 3. Datos Mensuales (Placements + Revenue)
        if (item.start_date) {
            const date = new Date(item.start_date + 'T12:00:00');
            const monthLabel = date.toLocaleString('en-us', { month: 'short', year: '2-digit' });

            // Inicializamos el mes si no existe
            if (!monthlyStats[monthLabel]) {
                monthlyStats[monthLabel] = { placements: 0, revenue: 0 };
            }

            // Sumamos 1 placement
            monthlyStats[monthLabel].placements += 1;

            // Calculamos y sumamos el revenue
            let comp = parseFloat(String(item.compensation).replace(/[^0-9.-]+/g,"")) || 0;
            if (comp > 0) {
                let fee = (item.Job_porpuse === 'Staff Aug' ? 0.1 : 0.15);
                let revenue = Math.max((comp * 12) * fee, 3500);
                monthlyStats[monthLabel].revenue += revenue;
            }
        }
    });

    // ==========================================
    // Función auxiliar para gráficos simples (Pie y Bar)
    // ==========================================
    const render = (id, type, labels, datasetLabel, datasetData, colors) => {
        const canvas = document.getElementById(id);
        if(!canvas) return;
        if(charts[id]) charts[id].destroy();

        const options = { responsive: true, maintainAspectRatio: false };

        // Agregamos porcentajes si es el gráfico circular
        if (type === 'pie') {
            options.plugins = {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            let total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                            let value = context.parsed;
                            let percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                            return `${label}${value} (${percentage})`;
                        }
                    }
                }
            };
        }

        charts[id] = new Chart(canvas, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: datasetLabel,
                    data: datasetData,
                    backgroundColor: colors,
                    borderColor: type === 'line' ? '#1976d2' : 'transparent',
                    borderWidth: 1
                }]
            },
            options: options
        });
    };

    // Renderizamos los dos gráficos sencillos
    render('typeChart', 'pie', Object.keys(types), 'Type', Object.values(types), ['#1976d2', '#7b1fa2', '#f57c00']);
    render('recruiterChart', 'bar', Object.keys(recruitersCount), 'Placements', Object.values(recruitersCount), '#1976d2');

    // ==========================================
    // Lógica para el Gráfico Combinado Mensual
    // ==========================================
    const monthlyCanvas = document.getElementById('monthlyChart');
    if(monthlyCanvas) {
        if(charts['monthlyChart']) charts['monthlyChart'].destroy();

        const monthLabels = Object.keys(monthlyStats);
        const placementsData = monthLabels.map(m => monthlyStats[m].placements);
        const revenueData = monthLabels.map(m => monthlyStats[m].revenue);

        charts['monthlyChart'] = new Chart(monthlyCanvas, {
            type: 'bar', // Tipo base
            data: {
                labels: monthLabels,
                datasets: [
                    {
                        label: 'Revenue ($)',
                        data: revenueData,
                        type: 'line', // Forzamos a que este sea una línea
                        borderColor: '#2e7d32', // Verde
                        backgroundColor: '#2e7d32',
                        yAxisID: 'y-revenue', // Lo atamos al eje Y derecho
                        tension: 0.3, // Curva suave
                        borderWidth: 3
                    },
                    {
                        label: 'Placements',
                        data: placementsData,
                        type: 'bar', // Forzamos a que este sea barra
                        backgroundColor: '#1976d2', // Azul
                        yAxisID: 'y-placements' // Lo atamos al eje Y izquierdo
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    'y-placements': {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Nº of Placements', color: '#1976d2', font: { weight: 'bold' } },
                        ticks: { stepSize: 1 } // Para que muestre números enteros
                    },
                    'y-revenue': {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        title: { display: true, text: 'Revenue ($)', color: '#2e7d32', font: { weight: 'bold' } },
                        grid: { drawOnChartArea: false }, // Evita que se crucen las líneas de fondo de los dos ejes
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString(); // Formato de moneda
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                let value = context.parsed.y;
                                if (label.includes('Revenue')) {
                                    return label + ': $' + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
                                }
                                return label + ': ' + value;
                            }
                        }
                    }
                }
            }
        });
    }
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