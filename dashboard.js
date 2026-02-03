// 1. CONFIGURACIÓN E INICIALIZACIÓN
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
const PAGE_SIZE = 50; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let globalApplications = []; 
let filteredApplications = []; 
let currentPage = 0;

// 2. GESTIÓN DE SESIÓN
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authContainer = document.getElementById('authContainer');
    const dashboardContent = document.getElementById('dashboardContent');

    if (session) {
        if(authContainer) authContainer.style.display = 'none';
        if(dashboardContent) dashboardContent.style.display = 'block';
        loadAllData(); 
    } else {
        if(authContainer) authContainer.style.display = 'flex';
        if(dashboardContent) dashboardContent.style.display = 'none';
    }
}

// 3. AUTENTICACIÓN
async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errorMsg = document.getElementById('authError');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        errorMsg.textContent = "Error: " + error.message;
    } else {
        errorMsg.textContent = "";
        checkSession();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
}

function safeGet(obj, ...path) {
    return path.reduce((xs, x) => (xs && xs[x] !== undefined) ? xs[x] : null, obj);
}

// 4. CARGA DE DATOS MAESTRA
async function loadAllData() {
    const loadingMsg = document.getElementById('loadingMessage');
    const errorMsg = document.getElementById('errorMessage');
    
    if (loadingMsg) loadingMsg.style.display = 'block';
    if (loadingMsg) loadingMsg.innerHTML = '<div class="spinner"></div><p>Cargando todos los registros...</p>';
    if (errorMsg) errorMsg.textContent = "";

    try {
        let allRecords = [];
        let from = 0;
        const step = 1000; 
        let moreAvailable = true;

        while (moreAvailable) {
            if (loadingMsg) loadingMsg.innerHTML = `<div class="spinner"></div><p>Cargando registros ${from}...</p>`;

            const { data, error } = await supabaseClient
                .from('Applications')
                .select(`
                    application_id,
                    application_status,
                    email,
                    created_at,
                    compensation,
                    date_hired,
                    Candidates (
                        candidate_name,
                        email,
                        phone,
                        owner,
                        linkedin_url
                    ),
                    Job_Openings (
                        contract_title,
                        client_name,
                        assigned_recruiter,
                        job_opening_status
                    )
                `)
                .order('created_at', { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allRecords = allRecords.concat(data);
                from += step;
                if (data.length < step) moreAvailable = false;
            } else {
                moreAvailable = false;
            }
        }

        globalApplications = allRecords;
        filteredApplications = [...globalApplications];

        console.log(`✅ Carga completa: ${globalApplications.length} registros.`);

        populateDynamicFilters(globalApplications);
        applyFilters(); 

    } catch (err) {
        console.error('Error cargando datos:', err);
        if (errorMsg) errorMsg.innerHTML = `<strong>Error:</strong> ${err.message}`;
    } finally {
        if (loadingMsg) loadingMsg.style.display = 'none';
    }
}

// --- CÁLCULO DE KPIs ---
function calculateKPIs(data) {
    const total = data.length;

    const hired = data.filter(app => {
        const status = (app.application_status || '').toLowerCase();
        return status === 'hired' || 
               status === 'placed' || 
               status === 'offer accepted' || 
               app.date_hired !== null;
    }).length;

    const rejectedOrWithdrawn = data.filter(app => {
        const status = (app.application_status || '').toLowerCase();
        return status.includes('rejected') || 
               status.includes('declined') || 
               status.includes('withdrawn') || 
               status.includes('junk');
    }).length;

    const active = total - (hired + rejectedOrWithdrawn);

    const conversion = total > 0 ? ((hired / total) * 100).toFixed(1) : 0;

    if(document.getElementById('totalApps')) document.getElementById('totalApps').textContent = total.toLocaleString();
    if(document.getElementById('activePipeline')) document.getElementById('activePipeline').textContent = active.toLocaleString();
    if(document.getElementById('hiredCount')) document.getElementById('hiredCount').textContent = hired.toLocaleString();    
    if(document.getElementById('conversionRate')) document.getElementById('conversionRate').textContent = conversion + '%';
    
    if (globalApplications.length > 0 && document.getElementById('lastSync')) {
        const lastDate = new Date(globalApplications[0].created_at).toLocaleDateString();
        document.getElementById('lastSync').textContent = lastDate;
    }
}

// --- FILTROS Y BÚSQUEDA ---
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || "";
    const statusVal = document.getElementById('statusFilter')?.value || "";
    const clientVal = document.getElementById('clientFilter')?.value || "";
    const recruiterVal = document.getElementById('stageFilter')?.value || ""; 

    filteredApplications = globalApplications.filter(app => {
        const candName = (safeGet(app, 'Candidates', 'candidate_name') || '').toLowerCase();
        const jobTitle = (safeGet(app, 'Job_Openings', 'contract_title') || '').toLowerCase();
        const clientName = safeGet(app, 'Job_Openings', 'client_name') || '';
        const recruiterName = safeGet(app, 'Job_Openings', 'assigned_recruiter') || '';
        const status = app.application_status || '';
        const email = (app.email || safeGet(app, 'Candidates', 'email') || '').toLowerCase();

        const matchesSearch = !searchTerm || 
            candName.includes(searchTerm) || 
            jobTitle.includes(searchTerm) ||
            email.includes(searchTerm) ||
            clientName.toLowerCase().includes(searchTerm);

        const matchesClient = !clientVal || clientName === clientVal;
        const matchesStatus = !statusVal || status === statusVal;
        const matchesRecruiter = !recruiterVal || recruiterName === recruiterVal;

        return matchesSearch && matchesClient && matchesStatus && matchesRecruiter;
    });

    calculateKPIs(filteredApplications);
    
    currentPage = 0;
    updatePaginationControls();
    renderCurrentPage();
}

// --- PAGINACIÓN ---
function updatePaginationControls() {
    const totalCount = filteredApplications.length;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    
    const ind = document.getElementById('pageIndicator');
    if(ind) ind.textContent = `Page ${currentPage + 1} of ${totalPages || 1}`;
    
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    
    if(prev) prev.disabled = (currentPage === 0);
    if(next) next.disabled = (currentPage >= totalPages - 1);
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredApplications.length / PAGE_SIZE);
    const newPage = currentPage + direction;

    if (newPage >= 0 && newPage < totalPages) {
        currentPage = newPage;
        renderCurrentPage();
        window.scrollTo(0, 0);
    }
}

function renderCurrentPage() {
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageData = filteredApplications.slice(start, end);
    displayApplicationsTable(pageData);
}

// --- TABLA ---
function displayApplicationsTable(apps) {
    const tbody = document.getElementById('applicationsBody');
    const tableContainer = document.getElementById('tableContainer');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (apps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">No matching records found</td></tr>';
    } else {
        apps.forEach((app) => {
            const row = document.createElement('tr');
            
            const candName = safeGet(app, 'Candidates', 'candidate_name') || "Unknown";
            const jobTitle = safeGet(app, 'Job_Openings', 'contract_title') || "No Title";
            const clientName = safeGet(app, 'Job_Openings', 'client_name') || "-";
            const recruiter = safeGet(app, 'Job_Openings', 'assigned_recruiter') || "-";
            const accManager = safeGet(app, 'Candidates', 'owner') || "-";
            const email = app.email || safeGet(app, 'Candidates', 'email') || "-";
            const status = app.application_status || "New";
            const createdDate = app.created_at ? new Date(app.created_at).toLocaleDateString() : '-';
            const comp = app.compensation ? '$' + parseFloat(app.compensation).toLocaleString() : '-';

            row.innerHTML = `
                <td><button class="view-btn">View</button></td>
                <td><strong>${candName}</strong><br><small style="color:#666">${jobTitle}</small></td>
                <td>${clientName}</td>
                <td><span class="status-badge">${status}</span></td>
                <td>${accManager}</td>
                <td>${recruiter}</td>
                <td>${email}</td>
                <td>${createdDate}</td>
                <td>${comp}</td>
            `;

            row.querySelector('.view-btn').addEventListener('click', () => viewDetails(app));
            tbody.appendChild(row);
        });
    }

    if (tableContainer) tableContainer.style.display = 'block';
}

// --- DETALLES ---
function viewDetails(app) {
    const candName = safeGet(app, 'Candidates', 'candidate_name') || 'N/A';
    document.getElementById('detailName').textContent = candName;
    const grid = document.getElementById('detailGrid');

    const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString() : 'Pending';
    
    const job = safeGet(app, 'Job_Openings', 'contract_title');
    const client = safeGet(app, 'Job_Openings', 'client_name');
    const accMan = safeGet(app, 'Candidates', 'owner');
    const rec = safeGet(app, 'Job_Openings', 'assigned_recruiter');
    const phone = safeGet(app, 'Candidates', 'phone');
    const linkedIn = safeGet(app, 'Candidates', 'linkedin_url');

    let linkedInHtml = linkedIn ? `<a href="${linkedIn}" target="_blank" style="color:#007bff; font-weight:bold;">View LinkedIn Profile</a>` : 'N/A';

    grid.innerHTML = `
        <div class="detail-item"><label>Candidate</label><p>${candName}</p></div>      
        <div class="detail-item"><label>Position</label><p>${job || 'N/A'}</p></div>
        <div class="detail-item"><label>Client</label><p><strong>${client || 'N/A'}</strong></p></div>
        <div class="detail-item"><label>Account Manager</label><p>${accMan || 'N/A'}</p></div>
        <div class="detail-item"><label>Recruiter</label><p>${rec || 'N/A'}</p></div>
        <div class="detail-item"><label>Status</label><p><span class="status-badge">${app.application_status || 'N/A'}</span></p></div>
        <div class="detail-item"><label>Email</label><p>${app.email || 'N/A'}</p></div>
        <div class="detail-item"><label>Phone</label><p>${phone || 'N/A'}</p></div>
        <div class="detail-item"><label>Date Hired</label><p>${formatDate(app.date_hired)}</p></div>
        <div class="detail-item"><label>Compensation</label><p>${app.compensation ? '$'+parseFloat(app.compensation).toLocaleString() : '-'}</p></div>
        <div class="detail-item"><label>LinkedIn</label><p>${linkedInHtml}</p></div>
    `;

    document.getElementById('detailView').style.display = 'flex';
}

// --- FILTROS DINÁMICOS ---
function populateDynamicFilters(data) {
    const statuses = [...new Set(data.map(a => a.application_status).filter(status => {
        if (!status) return false; 
        if (/^\d+$/.test(status)) return false; 
        return true; 
    }))].sort();
    
    const clients = [...new Set(data.map(a => safeGet(a, 'Job_Openings', 'client_name')).filter(Boolean))].sort();
    const recruiters = [...new Set(data.map(a => safeGet(a, 'Job_Openings', 'assigned_recruiter')).filter(Boolean))].sort();

    fillSelect('statusFilter', statuses, 'All Statuses');
    fillSelect('clientFilter', clients, 'All Clients');
    fillSelect('stageFilter', recruiters, 'All Recruiters'); 
}

function fillSelect(id, items, defaultText) {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        if (item === currentVal) option.selected = true;
        select.appendChild(option);
    });
}

// 5. EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    let timeout = null;
    document.getElementById('searchInput')?.addEventListener('keyup', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            applyFilters();
        }, 300);
    });

    ['statusFilter', 'clientFilter', 'stageFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
            checkSession();
        }
    });
    
    checkSession();
});

setInterval(async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) loadAllData();
}, 300000);