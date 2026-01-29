// 1. CONFIGURACIÓN E INICIALIZACIÓN
const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
let currentPage = 0;
const PAGE_SIZE = 1000;

// 1. CONFIGURACIÓN Y ESTADO GLOBAL
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let allApplications = [];

// 2. GESTIÓN DE INTERFAZ Y SESIÓN
    async function checkSession() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const authContainer = document.getElementById('authContainer');
        const dashboardContent = document.getElementById('dashboardContent');

        if (session) {
            authContainer.style.display = 'none';
            dashboardContent.style.display = 'block';
            loadApplications(); 
        } else {
            authContainer.style.display = 'flex';
            dashboardContent.style.display = 'none';
        }
    }

    // 3. FUNCIONES DE AUTENTICACIÓN
    async function handleLogin() {
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const errorMsg = document.getElementById('authError');

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            errorMsg.textContent = "Acceso denegado: " + error.message;
        } else {
            errorMsg.textContent = "";
        }
    }

    async function handleLogout() {
        await supabaseClient.auth.signOut();
    }
    
    // 4. CARGA Y VISUALIZACIÓN DE DATOS
async function loadApplications() {
    const loadingMsg = document.getElementById('loadingMessage');
    const errorMsg = document.getElementById('errorMessage');
    const searchTerm = document.getElementById('searchInput')?.value.trim() || "";
    
    if (loadingMsg) loadingMsg.style.display = 'block';
    if (errorMsg) errorMsg.textContent = "";

    try {
        /* =========================
           1. KPIs GLOBALES (CORREGIDOS)
           Usamos Promise.all para evitar bloqueos y asegurar los conteos
        ========================== */
        const [resTotal, resNew, resQualified, resLinkedIn] = await Promise.all([
            supabaseClient.from('Candidates').select('*', { count: 'exact', head: true }),
            supabaseClient.from('Candidates').select('*', { count: 'exact', head: true }).eq('status', 'New'),
            supabaseClient.from('Candidates').select('*', { count: 'exact', head: true }).eq('status', 'Qualified'),
            supabaseClient.from('Candidates').select('*', { count: 'exact', head: true }).ilike('linkedin_url', '%linkedin%')
        ]);

        // Verificación de errores en consola para diagnóstico
        if (resNew.error) console.error("Error en conteo 'New':", resNew.error.message);
        if (resQualified.error) console.error("Error en conteo 'Qualified':", resQualified.error.message);

        const totalGlobal = resTotal.count || 0;
        const totalNew = resNew.count || 0;
        const totalQualified = resQualified.count || 0;
        const totalWithLinkedIn = resLinkedIn.count || 0;

        /* =========================
           2. CÁLCULO DE EXPERIENCIA
        ========================== */
        const { data: expData } = await supabaseClient.from('Candidates').select('experience_years');
        const globalAvgExp = expData?.length
            ? (expData.reduce((s, r) => s + (parseFloat(r.experience_years) || 0), 0) / expData.length).toFixed(1)
            : "0";

        /* =========================
           3. BUSCADOR GLOBAL VS PAGINACIÓN
           Si hay término de búsqueda, consulta TODA la base de datos
        ========================== */
        let query = supabaseClient.from('Candidates').select('*');

        const clientVal = document.getElementById('clientFilter')?.value;
        if (clientVal) {
            query = query.eq('client_name', clientVal);
        }

        if (searchTerm !== "") {
            query = query.or(`candidate_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }

        if (searchTerm !== "") {
            // Búsqueda en servidor usando OR e ILIKE para buscar en todos los registros
            query = query.or(`candidate_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
        } else {
            // Paginación normal cuando no hay búsqueda
            const from = currentPage * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            query = query.order('created_time', { ascending: false }).range(from, to);
        }

        const { data: pageData, error } = await query;
        if (error) throw error;

        allApplications = pageData || [];

        // NUEVO: Llenar los desplegables de los filtros con los datos obtenidos
        populateDynamicFilters(allApplications); 

        // NUEVO: Si ya hay un filtro seleccionado, aplicar el filtrado antes de mostrar
        applyFilters();

        /* =========================
           4. ACTUALIZACIÓN DE INTERFAZ (UI)
        ========================== */
        document.getElementById('totalApps').textContent = totalGlobal.toLocaleString();
        document.getElementById('newApps').textContent = totalNew.toLocaleString();
        document.getElementById('qualifiedApps').textContent = totalQualified.toLocaleString();
        document.getElementById('avgExperience').textContent = globalAvgExp;

        const linkedinRate = totalGlobal > 0 ? Math.round((totalWithLinkedIn / totalGlobal) * 100) : 0;
        document.getElementById('linkedinRate').textContent = `${linkedinRate}%`;

        // Sincronización de UI: Última fecha de registro
        const { data: lastSyncRow } = await supabaseClient
            .from('Candidates')
            .select('last_sync_time, created_time')
            .order('created_time', { ascending: false })
            .limit(1);
        if (lastSyncRow) updateLastSyncUI(lastSyncRow);

        // Mostrar los datos en la tabla y actualizar controles de página
        displayApplications(allApplications);
        updatePaginationControls(searchTerm ? allApplications.length : totalGlobal);

    } catch (err) {
        console.error('Critical error:', err);
        if (errorMsg) errorMsg.textContent = "Error al conectar con Supabase: " + err.message;
    } finally {
        if (loadingMsg) loadingMsg.style.display = 'none';
    }
}
    // --- ACTUALIZACIÓN DE ESTADÍSTICAS Y KPIs ---
    function displayApplications(applications) {
    const tbody = document.getElementById('applicationsBody');
    const tableContainer = document.getElementById('tableContainer');
    const loadingMessage = document.getElementById('loadingMessage');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No records found</td></tr>';
    } else {
        applications.forEach((app, index) => {
            const row = document.createElement('tr');
            
            // Lógica para formatear el link de LinkedIn en la tabla (opcional)
            const linkedInIcon = app.linkedin_url && app.linkedin_url !== "N/A" 
                ? `<a href="${app.linkedin_url.startsWith('http') ? app.linkedin_url : 'https://' + app.linkedin_url}" target="_blank">🔗 Profile</a>` 
                : "-";

            row.innerHTML = `
                <td>
                    <button class="view-btn" onclick="openDetailsByIndex(${index})">View</button>
                </td>
                <td><strong>${app.candidate_name || "-"}</strong></td>
                <td>${app.client_name || "-"}</td>
                <td><span class="status-badge">${app.status || app.application_status || "New"}</span></td>
                <td>${app.last_activity_time ? new Date(app.last_activity_time).toLocaleDateString() : 'N/A'}</td>
                <td>${app.email || "-"}</td>
                <td>${app.phone || "-"}</td>
                <td>${app.created_time ? new Date(app.created_time).toLocaleDateString() : 'N/A'}</td>
                <td>${linkedInIcon}</td>
                <td>${app.experience_years || "0"} Years</td>
            `;
            tbody.appendChild(row);
        });
    }

    if (loadingMessage) loadingMessage.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    
    }

    // --- GESTIÓN DE DETALLES (MODAL) ---
    function openDetailsByIndex(index) {
        const app = allApplications[index]; 
        if (app) {
            viewDetails(app);
        }
    }

    function viewDetails(app) {
        document.getElementById('detailName').textContent = app.candidate_name || 'Candidate Details';
        const grid = document.getElementById('detailGrid');
        
        // 1. Lógica de LinkedIn (Corregida)
        const hasLinkedIn = app.linkedin_url && app.linkedin_url !== "N/A" && app.linkedin_url.trim() !== "";
        const linkedinLink = hasLinkedIn 
            ? `<a href="${app.linkedin_url.startsWith('http') ? app.linkedin_url : 'https://' + app.linkedin_url}" 
                target="_blank" style="color: #0077b5; font-weight: bold;">Ver Perfil LinkedIn</a>` 
            : '<span style="color: #666;">No disponible</span>';

        // 2. Formateo de Dinero para Revenue
        const formatMoney = (amount) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
        };

        // 3. Renderizado del Grid (Información de los 3 módulos)
        grid.innerHTML = `
            <div class="detail-item"><label>Full Name</label><p>${app.candidate_name || 'N/A'}</p></div>       
            <div class="detail-item"><label>Client</label><p>${app.client_name || 'N/A'}</p></div>
            <div class="detail-item"><label>Email</label><p>${app.email || 'N/A'}</p></div>
            <div class="detail-item"><label>Phone</label><p>${app.phone || 'N/A'}</p></div>
            <div class="detail-item"><label>Experience</label><p>${app.experience_years || '0'} Years</p></div>                
            <div class="detail-item"><label>Status</label><p><span class="status-badge">${app.application_status || 'New'}</span></p></div>        
            <div class="detail-item"><label>LinkedIn</label><p>${linkedinLink}</p></div>       
        `;

        document.getElementById('detailView').style.display = 'flex';
    }

    function closeDetail() {
        document.getElementById('detailView').style.display = 'none';
    }

    // --- FILTROS DINÁMICOS ---
    function populateDynamicFilters(data) {
        const clients = [...new Set(data.map(app => app.client_name).filter(Boolean))];
        const stages = [...new Set(data.map(app => app.application_stage).filter(Boolean))];
        const recruiters = [...new Set(data.map(app => app.recruiter_name).filter(Boolean))];

        fillSelect('clientFilter', clients, 'All Clients');
        fillSelect('stageFilter', stages, 'All Stages');
        fillSelect('recruiterFilter', recruiters, 'All Recruiters');
    }

    function fillSelect(id, items, defaultText) {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value; // Mantener selección si existe
        select.innerHTML = `<option value="">${defaultText}</option>`;
        items.sort().forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            option.textContent = item;
            if (item === currentVal) option.selected = true;
            select.appendChild(option);
        });
    }

    function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || "";
    const statusVal = document.getElementById('statusFilter')?.value || "";
    const recruiterVal = document.getElementById('recruiterFilter')?.value || "";
    const clientVal = document.getElementById('clientFilter')?.value || "";
    const stageVal = document.getElementById('stageFilter')?.value || "";

    const filtered = allApplications.filter(app => {
        // Coincidencia de búsqueda
        const matchesSearch = !searchTerm || 
            (app.candidate_name?.toLowerCase().includes(searchTerm)) || 
            (app.email?.toLowerCase().includes(searchTerm)) ||
            (app.phone?.toLowerCase().includes(searchTerm));
            
        // Coincidencia de Cliente (Exacta)
        const matchesClient = !clientVal || app.client_name === clientVal;

        // Coincidencia de Status (Exacta)
        const matchesStatus = !statusVal || 
            (app.status === statusVal || app.application_status === statusVal);

        // Otros filtros
        const matchesRecruiter = !recruiterVal || app.recruiter_name === recruiterVal;
        const matchesStage = !stageVal || app.application_stage === stageVal;

        return matchesSearch && matchesStatus && matchesRecruiter && matchesClient && matchesStage;
    });

    // IMPORTANTE: Pasamos los datos filtrados a la tabla
    displayApplications(filtered);
    }

    // 5. EVENT LISTENERS
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadApplications();
        });

        ['statusFilter', 'recruiterFilter', 'clientFilter', 'stageFilter'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', applyFilters);
        });

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
                checkSession();
            }
        });
        
        checkSession();
    });

    // Auto-refresh cada 5 minutos
    setInterval(async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) loadApplications();
    }, 300000);

    function updatePaginationControls(totalCount) {
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        document.getElementById('pageIndicator').textContent = `Página ${currentPage + 1} de ${totalPages}`;
        
        // Deshabilitar botones si no hay más páginas
        document.getElementById('prevPage').disabled = (currentPage === 0);
        document.getElementById('nextPage').disabled = (currentPage >= totalPages - 1);
    }

    async function changePage(direction) {
        currentPage += direction;
        // Scroll hacia arriba para que el usuario vea el inicio de la nueva tabla
        window.scrollTo(0, 0); 
        await loadApplications();
    }

    function updateGlobalStats(total, hired) {
    // Asegúrate de que estos IDs existan en tu HTML
    const totalEl = document.getElementById('totalApps'); 
    const hiredEl = document.getElementById('hiredCount'); // Cambia este ID si usas otro en el HTML

    if (totalEl) totalEl.textContent = total.toLocaleString();
    if (hiredEl) hiredEl.textContent = (hired || 0).toLocaleString();

    // KPI Opcional: Ratio de éxito global
    const ratioEl = document.getElementById('conversionRate');
    if (ratioEl && total > 0) {
        const rate = ((hired / total) * 100).toFixed(1);
        ratioEl.textContent = `${rate}%`;
    }
    }

    function updateLastSyncUI(data) {
    const syncDates = data
        .map(app => new Date(app.last_sync_time || app.created_time))
        .filter(d => !isNaN(d.getTime()) && d.getFullYear() > 1970);

    const syncElem = document.getElementById('lastSync');
    if (syncElem && syncDates.length > 0) {
        const latestSync = new Date(Math.max(...syncDates));
        syncElem.innerHTML = `${latestSync.toLocaleDateString()} <br> <small>${latestSync.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>`;
    } else if (syncElem) {
        syncElem.textContent = "---";
    }
    }
