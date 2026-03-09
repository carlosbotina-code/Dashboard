const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let distributorsData = [];

// --- AUTH ---
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

// --- DATA FLOW ---
async function loadDistributorsData() {
    const { data, error } = await supabaseClient
        .from('distributors')
        .select('*')
        .order('name', { ascending: true });

    if (error) return console.error(error);
    distributorsData = data || [];
    
    populateFilters();
    renderTable(distributorsData);
    updateKPIs(distributorsData); // Initial Load
}

// DYNAMIC KPI UPDATE
function updateKPIs(filteredData) {
    const total = filteredData.length;
    const avgRev = filteredData.reduce((acc, curr) => acc + (Number(curr.annual_revenue) || 0), 0) / (total || 1);
    const avgRate = filteredData.reduce((acc, curr) => acc + (Number(curr.cs_rating) || 0), 0) / (total || 1);

    document.getElementById('totalDistributors').innerText = total;
    document.getElementById('avgRevenue').innerText = `$${avgRev.toLocaleString(undefined, {maximumFractionDigits: 1})}M`;
    document.getElementById('avgRating').innerText = avgRate.toFixed(1);
}

function populateFilters() {
    const locFilter = document.getElementById('locationFilter');
    const locations = [...new Set(distributorsData.map(d => d.hq_location).filter(Boolean))].sort();
    locFilter.innerHTML = '<option value="">All Locations</option>';
    locations.forEach(loc => locFilter.innerHTML += `<option value="${loc}">${loc}</option>`);
    
    document.getElementById('searchInput').oninput = applyFilters;
    locFilter.onchange = applyFilters;
}

function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const loc = document.getElementById('locationFilter').value;

    const filtered = distributorsData.filter(d => {
        const content = `${d.name} ${d.tax_id} ${d.display_name} ${d.exec_contact_name}`.toLowerCase();
        return content.includes(search) && (!loc || d.hq_location === loc);
    });

    renderTable(filtered);
    updateKPIs(filtered); // Update KPIs dynamically
}

function renderTable(data) {
    const tbody = document.getElementById('distributorsTableBody');
    tbody.innerHTML = data.length ? '' : '<tr><td colspan="10">No records found.</td></tr>';
    
    data.forEach(d => {
        const ratingColor = d.cs_rating >= 4 ? 'var(--success)' : (d.cs_rating >= 2.5 ? 'var(--warning)' : 'var(--danger)');
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.display_name || d.name}</strong><br><small>${d.name}</small></td>
                <td>${d.hq_location || '-'}</td>
                <td><small>Tax: ${d.tax_id || '-'}<br>Res: ${d.reseller_id || '-'}</small></td>
                <td>${d.exec_contact_name || '-'}<br><small>${d.exec_contact_phone || ''}</small></td>
                <td>${d.sales_contact_name || '-'}<br><small>${d.sales_contact_phone || ''}</small></td>
                <td>${d.pricing_details || '-'}</td>
                <td>${d.avg_response_time || '-'}</td>
                <td style="font-weight:bold; color: ${ratingColor}">${d.cs_rating || '0'} ⭐</td>
                <td>$${(Number(d.annual_revenue) || 0).toFixed(1)}M</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button onclick='editDistributor(${JSON.stringify(d).replace(/'/g, "&apos;")})' class="btn-warning" style="padding:5px;">✎</button>
                        <button onclick="deleteDistributor('${d.id}')" class="btn-danger" style="padding:5px;">🗑️</button>
                    </div>
                </td>
            </tr>`;
    });
}

// --- CRUD ---
function openModal() {
    document.getElementById('distributorForm').reset();
    document.getElementById('dist_id').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Supplier';
    document.getElementById('distributorModal').style.display = 'block';
}

function closeModal() { document.getElementById('distributorModal').style.display = 'none'; }

function editDistributor(d) {
    openModal();
    document.getElementById('modalTitle').innerText = 'Edit Supplier';
    document.getElementById('dist_id').value = d.id;
    const fields = ['name', 'display_name', 'hq_location', 'tax_id', 'reseller_id', 'exec_contact_name', 
                    'exec_contact_phone', 'sales_contact_name', 'sales_contact_phone', 'pricing_details', 
                    'avg_response_time', 'cs_rating', 'annual_revenue', 'notes'];
    fields.forEach(f => document.getElementById(f).value = d[f] || '');
}

document.getElementById('distributorForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('dist_id').value;
    const formData = {};
    const inputs = e.target.querySelectorAll('input, textarea');
    inputs.forEach(i => { if(i.id && i.id !== 'dist_id') formData[i.id] = i.value || null; });

    let res = id ? await supabaseClient.from('distributors').update(formData).eq('id', id) 
                 : await supabaseClient.from('distributors').insert([formData]);

    if (res.error) alert(res.error.message);
    else { closeModal(); loadDistributorsData(); }
};

async function deleteDistributor(id) {
    if (confirm('Delete this record?')) {
        const { error } = await supabaseClient.from('distributors').delete().eq('id', id);
        if (error) alert(error.message);
        else loadDistributorsData();
    }
}

function exportToCSV() {
    const headers = ['Name', 'Location', 'Revenue', 'Rating'];
    const rows = distributorsData.map(d => `"${d.name}","${d.hq_location}",${d.annual_revenue},${d.cs_rating}`);
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'suppliers_report.csv';
    a.click();
}