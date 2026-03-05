// ==========================================
// 1. CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x'; 

// Usamos window.supabase y le damos un nombre distinto a nuestra variable
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variables Globales
let employeesData = [];
let charts = {};

// ==========================================
// 2. AUTENTICACIÓN
// ==========================================
async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        alert('Login failed: ' + error.message);
    } else {
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

// Verificar sesión al cargar
window.onload = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
        loadEmployeesData();
    }
};

// ==========================================
// 3. CARGA Y PROCESAMIENTO DE DATOS
// ==========================================
async function loadEmployeesData() {
    // Actualizamos el colspan a 9 para cubrir la nueva columna contadora
    document.getElementById('employeesTableBody').innerHTML = '<tr><td colspan="9">Loading data...</td></tr>';
    
    const { data, error } = await supabaseClient
        .from('employees')
        .select('*')
        .order('first_name', { ascending: true });

    if (error) {
        console.error("Error fetching employees:", error);
        alert("Failed to load data.");
        return;
    }

    employeesData = data || [];
    
    updateKPIs();
    populateFilters();
    renderCharts();
    renderTable(employeesData);
}

// ==========================================
// 4. KPIs Y FILTROS
// ==========================================
function updateKPIs() {
    const total = employeesData.length;
    const active = employeesData.filter(e => e.employment_status === 'Active').length;
    const inactive = employeesData.filter(e => e.employment_status !== 'Active' && e.employment_status !== null).length;
    
    const departments = new Set(employeesData.map(e => e.department).filter(Boolean)).size;

    document.getElementById('totalEmployees').innerText = total;
    document.getElementById('activeEmployees').innerText = active;
    document.getElementById('inactiveEmployees').innerText = inactive;
    document.getElementById('totalDepartments').innerText = departments;
}

function populateFilters() {
    const populateSelect = (id, field) => {
        const select = document.getElementById(id);
        const uniqueValues = [...new Set(employeesData.map(item => item[field]).filter(Boolean))].sort();
        select.innerHTML = `<option value="">All ${field.replace('_', ' ')}s</option>`;
        uniqueValues.forEach(val => {
            select.innerHTML += `<option value="${val}">${val}</option>`;
        });
    };

    populateSelect('departmentFilter', 'department');
    populateSelect('statusFilter', 'employment_status');
    populateSelect('typeFilter', 'employee_type');

    ['searchInput', 'departmentFilter', 'statusFilter', 'typeFilter'].forEach(id => {
        document.getElementById(id).addEventListener('input', applyFilters);
    });
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const deptFilter = document.getElementById('departmentFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;

    const filteredData = employeesData.filter(emp => {
        const matchesSearch = 
            (emp.first_name || '').toLowerCase().includes(searchTerm) ||
            (emp.last_name || '').toLowerCase().includes(searchTerm) ||
            (emp.email || '').toLowerCase().includes(searchTerm) ||
            (emp.designation || '').toLowerCase().includes(searchTerm);
            
        const matchesDept = deptFilter ? emp.department === deptFilter : true;
        const matchesStatus = statusFilter ? emp.employment_status === statusFilter : true;
        const matchesType = typeFilter ? emp.employee_type === typeFilter : true;

        return matchesSearch && matchesDept && matchesStatus && matchesType;
    });

    renderTable(filteredData);
}

// ==========================================
// 5. RENDERIZADO DE TABLA Y GRÁFICOS
// ==========================================
function renderTable(data) {
    const tbody = document.getElementById('employeesTableBody');
    tbody.innerHTML = '';

    if(data.length === 0) {
        // Actualizamos el colspan a 9 aquí también
        tbody.innerHTML = '<tr><td colspan="9">No employees found matching the criteria.</td></tr>';
        return;
    }

    // Usamos el index para crear el contador
    data.forEach((emp, index) => {
        let statusColor = emp.employment_status === 'Active' ? 'color: #2e7d32; font-weight: bold;' : 'color: #d32f2f;';

        const row = `<tr>
            <td style="color: #666; font-size: 12px; font-weight: bold;">${index + 1}</td>
            <td>${emp.employee_id || '-'}</td>
            <td><strong>${emp.first_name || ''} ${emp.last_name || ''}</strong></td>
            <td>${emp.email || '-'}</td>
            <td>${emp.department || '-'}</td>
            <td>${emp.designation || '-'}</td>
            <td>${emp.employee_type || '-'}</td>
            <td style="${statusColor}">${emp.employment_status || '-'}</td>
            <td>${emp.country || '-'}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function renderCharts() {
    Object.values(charts).forEach(chart => chart.destroy());

    // 1. Status Chart (Doughnut)
    const statusCounts = employeesData.reduce((acc, curr) => {
        const status = curr.employment_status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    charts.status = new Chart(document.getElementById('empStatusChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#2e7d32', '#d32f2f', '#f57c00', '#9966FF', '#C9CBCF']
            }]
        }
    });

    // 2. Department Chart (Bar)
    const deptCounts = employeesData.reduce((acc, curr) => {
        const dept = curr.department || 'Unassigned';
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
    }, {});

    charts.department = new Chart(document.getElementById('empDepartmentChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(deptCounts),
            datasets: [{
                label: 'Number of Employees',
                data: Object.values(deptCounts),
                backgroundColor: '#1976d2'
            }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });

    // 3. Employee Type (Bar Horizontal)
    const typeCounts = employeesData.reduce((acc, curr) => {
        const type = curr.employee_type || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    charts.type = new Chart(document.getElementById('empTypeChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(typeCounts),
            datasets: [{
                label: 'Headcount by Contract Type',
                data: Object.values(typeCounts),
                backgroundColor: '#f57c00'
            }]
        },
        options: { indexAxis: 'y', scales: { x: { beginAtZero: true } } }
    });
}

// ==========================================
// 6. EXPORTAR A CSV
// ==========================================
function exportToCSV() {
    if (employeesData.length === 0) return alert('No data to export');
    
    // El CSV no necesita la columna contador, por lo que lo dejamos igual
    const headers = ['Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Designation', 'Status', 'Type', 'Country'];
    const csvRows = [headers.join(',')];
    
    employeesData.forEach(emp => {
        const row = [
            emp.employee_id,
            `"${emp.first_name || ''}"`,
            `"${emp.last_name || ''}"`,
            emp.email,
            `"${emp.department || ''}"`,
            `"${emp.designation || ''}"`,
            emp.employment_status,
            emp.employee_type,
            emp.country
        ];
        csvRows.push(row.join(','));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'employees_report.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}