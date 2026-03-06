const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let employeesData = [];
let charts = {};

// --- AUTENTICACIÓN ---
async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert('Login failed: ' + error.message);
    else {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
        loadEmployeesData();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    document.getElementById('dashboardContent').style.display = 'none';
    document.getElementById('authContainer').style.display = 'flex';
}

window.onload = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
        loadEmployeesData();
    }
};

// --- CARGA DE DATOS ---
async function loadEmployeesData() {
    document.getElementById('employeesTableBody').innerHTML = '<tr><td colspan="9">Loading data...</td></tr>';
    const { data, error } = await supabaseClient.from('employees').select('*').order('first_name', { ascending: true });
    if (error) return console.error(error);

    employeesData = data || [];
    updateKPIs();
    populateFilters();
    renderCharts();
    renderTable(employeesData);
}

function updateKPIs() {
    document.getElementById('totalEmployees').innerText = employeesData.length;
    document.getElementById('activeEmployees').innerText = employeesData.filter(e => e.employment_status === 'Active').length;
    document.getElementById('inactiveEmployees').innerText = employeesData.filter(e => e.employment_status !== 'Active' && e.employment_status !== null).length;
    document.getElementById('totalDepartments').innerText = new Set(employeesData.map(e => e.department).filter(Boolean)).size;
}

function populateFilters() {
    const fields = { departmentFilter: 'department', statusFilter: 'employment_status', typeFilter: 'employee_type' };
    Object.keys(fields).forEach(id => {
        const select = document.getElementById(id);
        const unique = [...new Set(employeesData.map(item => item[fields[id]]).filter(Boolean))].sort();
        select.innerHTML = `<option value="">All ${fields[id].replace('_', ' ')}s</option>`;
        unique.forEach(val => select.innerHTML += `<option value="${val}">${val}</option>`);
    });
    ['searchInput', 'departmentFilter', 'statusFilter', 'typeFilter'].forEach(id => 
        document.getElementById(id).addEventListener('input', applyFilters)
    );
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const dept = document.getElementById('departmentFilter').value;
    const status = document.getElementById('statusFilter').value;
    const type = document.getElementById('typeFilter').value;

    const filtered = employeesData.filter(emp => {
        const matchesSearch = (emp.first_name + ' ' + emp.last_name + emp.email + emp.designation).toLowerCase().includes(search);
        return matchesSearch && (!dept || emp.department === dept) && (!status || emp.employment_status === status) && (!type || emp.employee_type === type);
    });
    renderTable(filtered);
}

function renderTable(data) {
    const tbody = document.getElementById('employeesTableBody');
    tbody.innerHTML = data.length ? '' : '<tr><td colspan="9">No results found.</td></tr>';
    data.forEach((emp, index) => {
        const sCol = emp.employment_status === 'Active' ? 'color: #2e7d32; font-weight: bold;' : 'color: #d32f2f;';
        tbody.innerHTML += `<tr>
            <td style="color: #666; font-weight: bold;">${index + 1}</td>
            <td>${emp.employee_id || '-'}</td>
            <td><strong>${emp.first_name || ''} ${emp.last_name || ''}</strong></td>
            <td>${emp.email || '-'}</td>
            <td>${emp.department || '-'}</td>
            <td>${emp.designation || '-'}</td>
            <td>${emp.employee_type || '-'}</td>
            <td style="${sCol}">${emp.employment_status || '-'}</td>
            <td>${emp.country || '-'}</td>
        </tr>`;
    });
}

// --- GRÁFICOS ---
function renderCharts() {
    Object.values(charts).forEach(c => c.destroy());

    // 1. Status Chart
    const statusCounts = employeesData.reduce((acc, curr) => {
        const s = curr.employment_status || 'Unknown';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    charts.status = new Chart(document.getElementById('empStatusChart'), {
        type: 'doughnut',
        data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#2e7d32', '#d32f2f', '#f57c00', '#9966FF'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // 2. Department Chart
    const deptCounts = employeesData.reduce((acc, curr) => {
        const d = curr.department || 'Unassigned';
        acc[d] = (acc[d] || 0) + 1;
        return acc;
    }, {});

    charts.dept = new Chart(document.getElementById('empDepartmentChart'), {
        type: 'bar',
        data: { labels: Object.keys(deptCounts), datasets: [{ label: 'Employees', data: Object.values(deptCounts), backgroundColor: '#1976d2' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 3. COMBINADO: Computer Requirement (GUA/INNO) + Status (Active/Inactive)
    // Inicializamos el objeto para procesar ambos datos a la vez
    const compStatusData = {
        'Needs Computer': { active: 0, inactive: 0 },
        'No Computer Needed': { active: 0, inactive: 0 }
    };

    employeesData.forEach(emp => {
        const id = (emp.employee_id || "").toUpperCase();
        const category = (id.startsWith('GUA') || id.startsWith('INNO')) ? 'Needs Computer' : 'No Computer Needed';
        const isActive = emp.employment_status === 'Active';
        
        if (isActive) compStatusData[category].active += 1;
        else compStatusData[category].inactive += 1;
    });

    charts.computer = new Chart(document.getElementById('computerRequirementChart'), {
        type: 'bar',
        data: { 
            labels: ['Needs Computer', 'No Computer Needed'], 
            datasets: [
                { 
                    label: 'Active', 
                    data: [compStatusData['Needs Computer'].active, compStatusData['No Computer Needed'].active], 
                    backgroundColor: '#2e7d32' // Verde éxito
                },
                { 
                    label: 'Inactive', 
                    data: [compStatusData['Needs Computer'].inactive, compStatusData['No Computer Needed'].inactive], 
                    backgroundColor: '#d32f2f' // Rojo peligro
                }
            ] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true }, // Apilado para comparar proporciones
                y: { stacked: true, beginAtZero: true } 
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function exportToCSV() {
    if (!employeesData.length) return alert('No data');
    const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Dept', 'Status'];
    const rows = [headers.join(','), ...employeesData.map(e => `${e.employee_id},${e.first_name},${e.last_name},${e.email},${e.department},${e.employment_status}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'report.csv'; a.click();
}