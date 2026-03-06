const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let distributorsData = [];
let charts = {};

// --- AUTHENTICATION ---
async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkSession();
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    checkSession();
}

async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
        loadDistributorsData();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('dashboardContent').style.display = 'none';
    }
}

window.onload = checkSession;

// --- DATA HANDLING ---
async function loadDistributorsData() {
    const { data, error } = await supabaseClient
        .from('distributors')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.error("Fetch error:", error);
        return;
    }
    distributorsData = data || [];

    updateKPIs();
    populateFilters();
    renderTable(distributorsData);
    renderCharts();
}

function updateKPIs() {
    const total = distributorsData.length;
    const avgRev = distributorsData.reduce((acc, curr) => acc + (Number(curr.annual_revenue) || 0), 0) / (total || 1);
    const avgRate = distributorsData.reduce((acc, curr) => acc + (Number(curr.cs_rating) || 0), 0) / (total || 1);
    const locations = new Set(distributorsData.map(d => d.hq_location).filter(Boolean)).size;

    document.getElementById('totalDistributors').innerText = total;
    document.getElementById('avgRevenue').innerText = `$${avgRev.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    document.getElementById('avgRating').innerText = avgRate.toFixed(1);
    document.getElementById('totalLocations').innerText = locations;
}

function populateFilters() {
    const locFilter = document.getElementById('locationFilter');
    const locations = [...new Set(distributorsData.map(d => d.hq_location).filter(Boolean))].sort();
    locFilter.innerHTML = '<option value="">All Locations</option>';
    locations.forEach(loc => locFilter.innerHTML += `<option value="${loc}">${loc}</option>`);
    
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    locFilter.addEventListener('change', applyFilters);
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const loc = document.getElementById('locationFilter').value;

    const filtered = distributorsData.filter(d => {
        const content = (d.name || '') + (d.tax_id || '') + (d.exec_contact_name || '') + (d.display_name || '');
        const matchesSearch = content.toLowerCase().includes(search);
        const matchesLoc = !loc || d.hq_location === loc;
        return matchesSearch && matchesLoc;
    });
    renderTable(filtered);
}

function renderTable(data) {
    const tbody = document.getElementById('distributorsTableBody');
    tbody.innerHTML = data.length ? '' : '<tr><td colspan="8">No records found.</td></tr>';
    
    data.forEach(d => {
        const ratingColor = d.cs_rating >= 4 ? 'var(--success)' : (d.cs_rating >= 3 ? 'var(--warning)' : 'var(--danger)');
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.name || d.name}</strong></td>
                <td>${d.tax_id || '-'}</td>
                <td>${d.hq_location || '-'}</td>
                <td>${d.exec_contact_name || '-'}</td>
                <td>${d.exec_contact_phone || '-'}</td>
                <td style="font-weight:bold; color: ${ratingColor}">${d.cs_rating || 'N/A'}</td>
                <td>$${(Number(d.annual_revenue) || 0).toLocaleString()}</td>
                <td style="color: #666; font-size: 11px;">${new Date(d.created_at).toLocaleDateString()}</td>
            </tr>`;
    });
}

function renderCharts() {
    Object.values(charts).forEach(c => c.destroy());

    // 1. Revenue Chart (Top 5)
    const sortedByRev = [...distributorsData].sort((a, b) => b.annual_revenue - a.annual_revenue).slice(0, 5);
    charts.rev = new Chart(document.getElementById('revenueChart'), {
        type: 'bar',
        data: {
            labels: sortedByRev.map(d => d.name),
            datasets: [{
                label: 'Annual Revenue ($)',
                data: sortedByRev.map(d => d.annual_revenue),
                backgroundColor: '#6200ee'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Location Pie Chart
    const locMap = distributorsData.reduce((acc, curr) => {
        const loc = curr.hq_location || 'Unknown';
        acc[loc] = (acc[loc] || 0) + 1;
        return acc;
    }, {});

    charts.loc = new Chart(document.getElementById('locationChart'), {
        type: 'pie',
        data: {
            labels: Object.keys(locMap),
            datasets: [{
                data: Object.values(locMap),
                backgroundColor: ['#00c853', '#ffab00', '#d50000', '#2979ff', '#9c27b0']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function exportToCSV() {
    if (!distributorsData.length) return alert('No data to export');
    const headers = ['Name', 'Tax ID', 'Location', 'Revenue', 'Rating'];
    const rows = distributorsData.map(d => `"${d.name}","${d.tax_id}","${d.hq_location}",${d.annual_revenue},${d.cs_rating}`);
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'distributors_report.csv'; a.click();

}
