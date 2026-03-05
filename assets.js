// ==========================================
// 1. CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x'; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allAssets = [];
let assetCharts = {};

// ==========================================
// GOOGLE CHARTS INITIALIZATION
// ==========================================
let googleChartsReady = false;
if (window.google && google.charts) {
    google.charts.load('current', { 'packages':['geochart'] });
    google.charts.setOnLoadCallback(() => {
        googleChartsReady = true;
        if (allAssets.length > 0) renderAssetsCharts(allAssets); 
    });
}

// ==========================================
// 2. SESSION MANAGEMENT
// ==========================================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authContainer = document.getElementById('authContainer');
    const dashboardContent = document.getElementById('dashboardContent');

    if (session) {
        if(authContainer) authContainer.style.display = 'none';
        if(dashboardContent) dashboardContent.style.display = 'block';
        loadAssetsData(); 
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
    checkSession();
}

// ==========================================
// 3. DATA LOADING & FILTERING
// ==========================================
async function loadAssetsData() {
    try {
        const { data, error } = await supabaseClient.from('assets_management').select('*');
        if (error) throw error;
        allAssets = data || [];
        
        populateFilters(allAssets);
        applyLocalFilters(); 
    } catch (err) {
        console.error("Critical Error:", err);
        const tbody = document.getElementById('assetsTableBody');
        if(tbody) tbody.innerHTML = `<tr><td colspan="100%" style="color:red;">Error: ${err.message}</td></tr>`;
    }
}

function populateFilters(data) {
    const types = [...new Set(data.map(item => item.device_type).filter(Boolean))];
    const statuses = [...new Set(data.map(item => item.device_status || item.status).filter(Boolean))];
    const vendors = [...new Set(data.map(item => item.purchased_from).filter(Boolean))];

    fillSelect('typeFilter', types, 'All Devices');
    fillSelect('statusFilter', statuses, 'All Statuses');
    fillSelect('manufacturerFilter', vendors, 'All Vendors');
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
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const typeVal = document.getElementById('typeFilter')?.value || '';
    const statusVal = document.getElementById('statusFilter')?.value || '';
    const vendorVal = document.getElementById('manufacturerFilter')?.value || '';

    const filtered = allAssets.filter(item => {
        const matchType = !typeVal || item.device_type === typeVal;
        const matchStatus = !statusVal || (item.device_status || item.status) === statusVal;
        const matchVendor = !vendorVal || item.purchased_from === vendorVal;
        
        const searchString = Object.values(item).join(' ').toLowerCase();
        const matchSearch = !searchVal || searchString.includes(searchVal);

        return matchType && matchStatus && matchVendor && matchSearch;
    });

    updateAssetsKPIs(filtered);
    renderAssetsCharts(filtered);
    renderAssetsTable(filtered); 
}

// ==========================================
// 4. KPIs & CHARTS
// ==========================================
function updateAssetsKPIs(data) {
    let totalValue = 0, activeAssets = 0, unassignedAssets = 0;

    data.forEach(asset => {
        totalValue += parseFloat(asset.purchase_price) || 0; 
        const status = (asset.device_status || asset.status || '').toLowerCase();
        if (status === 'active' || status === 'in service') activeAssets++;
        
        const assigned = asset.assigned_to;
        if (!assigned || assigned === '-' || assigned.trim() === '' || assigned.toLowerCase() === 'unassigned') {
            unassignedAssets++;
        }
    });

    const setT = (id, val) => { if(document.getElementById(id)) document.getElementById(id).textContent = val; };
    setT('totalAssetValue', totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
    setT('totalAssets', data.length);
    setT('activeAssets', activeAssets);
    setT('unassignedAssets', unassignedAssets); 
}

function renderAssetsCharts(data) {
    const statusCounts = {};
    const countryData = {}; 
    const typeVendorData = {}; 
    const timelineData = {}; 

    const countryDictionary = {
        'usa': 'United States', 'eeuu': 'United States', 'ee.uu.': 'United States',
        'us': 'United States', 'brasil': 'Brazil', 'mexico': 'Mexico', 'méxico': 'Mexico', 'uk': 'United Kingdom'
    };

    data.forEach(asset => {
        const status = asset.device_status || 'Unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        const type = asset.device_type || 'Unknown';
        const vendor = asset.purchased_from || 'Unknown';
        if (!typeVendorData[type]) typeVendorData[type] = {};
        typeVendorData[type][vendor] = (typeVendorData[type][vendor] || 0) + 1;

        let rawCountry = (asset.country || 'Unknown').trim();
        let mapCountry = countryDictionary[rawCountry.toLowerCase()] || rawCountry;
        const price = parseFloat(asset.purchase_price) || 0;

        if (mapCountry && mapCountry !== '-' && mapCountry !== 'Unknown') {
            if (!countryData[mapCountry]) countryData[mapCountry] = { count: 0, totalValue: 0 };
            countryData[mapCountry].count += 1;
            countryData[mapCountry].totalValue += price;
        }

        if (asset.purchase_date && asset.purchase_date !== '-') {
            try {
                const dateObj = new Date(asset.purchase_date.split('T')[0]);
                if (!isNaN(dateObj)) {
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const monthYear = `${year}-${month}`; 
                    timelineData[monthYear] = (timelineData[monthYear] || 0) + 1;
                }
            } catch(e) {}
        }
    });

    const renderChartJS = (id, config) => {
        const canvas = document.getElementById(id);
        if(!canvas) return;
        if(assetCharts[id]) assetCharts[id].destroy(); 
        assetCharts[id] = new Chart(canvas, config);
    };

    renderChartJS('assetStatusChart', {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#2e7d32', '#f57c00', '#d32f2f', '#9e9e9e'], borderWidth: 1 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    const allTypes = Object.keys(typeVendorData);
    const allVendors = new Set();
    allTypes.forEach(t => Object.keys(typeVendorData[t]).forEach(v => allVendors.add(v)));
    const vendorColors = ['#1976d2', '#d32f2f', '#388e3c', '#fbc02d', '#7b1fa2', '#0097a7', '#e64a19', '#607d8b'];
    const vendorDatasets = Array.from(allVendors).map((vendor, index) => ({
        label: vendor,
        data: allTypes.map(type => typeVendorData[type][vendor] || 0),
        backgroundColor: vendorColors[index % vendorColors.length]
    }));

    renderChartJS('assetTypeChart', {
        type: 'bar',
        data: { labels: allTypes, datasets: vendorDatasets },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }
    });

    const sortedMonths = Object.keys(timelineData).sort();
    let cumulative = 0;
    const monthlyPurchases = [];
    const cumulativePurchases = sortedMonths.map(month => {
        const monthTotal = timelineData[month];
        monthlyPurchases.push(monthTotal);
        cumulative += monthTotal;
        return cumulative;
    });

    renderChartJS('assetTimelineChart', {
        type: 'line',
        data: {
            labels: sortedMonths,
            datasets: [{
                label: 'Total Accumulated',
                data: cumulativePurchases,
                borderColor: '#1976d2',
                backgroundColor: 'rgba(25, 118, 210, 0.2)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: (ctx) => [`Accumulated: ${ctx.raw}`, `Monthly: ${monthlyPurchases[ctx.dataIndex]}`] }}}
        }
    });

    if (googleChartsReady) {
        const mapContainer = document.getElementById('assetCountryMap');
        if (mapContainer) {
            const mapData = [['Country', 'Quantity', { role: 'tooltip', p: { html: true } }]];
            Object.keys(countryData).forEach(country => {
                const count = countryData[country].count;
                const val = countryData[country].totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                const tip = `<div style="padding:10px;"><b>${country}</b><br>Devices: ${count}<br>Value: ${val}</div>`;
                mapData.push([country, count, tip]);
            });
            const dataTable = google.visualization.arrayToDataTable(mapData);
            const chart = new google.visualization.GeoChart(mapContainer);
            chart.draw(dataTable, { 
                displayMode: 'regions', 
                colorAxis: { colors: ['#bbdefb', '#0d47a1'] },
                tooltip: { isHtml: true }
            });
        }
    }
}

// ==========================================
// 5. MAIN TABLE
// ==========================================
function renderAssetsTable(data) {
    const tbody = document.getElementById('assetsTableBody');
    const tableContainer = document.querySelector('.table-container');
    const tableElement = tableContainer?.querySelector('table');
    if (!tbody || !tableElement) return;

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%">No assets found matching filters.</td></tr>';
        return;
    }

    const excludedColumns = [
        'modified_time', 'updated_at', 'created_time', 'approval_status', 
        'added_time', 'proof_of_purchase_url', 'zoho_id', 'warehouse'
    ];

    const columnLabels = {
        'asset_name': 'Asset Name',
        'device_type': 'Category',
        'device_status': 'Status',
        'status': 'Status',
        'assigned_to': 'Assigned To',
        'purchase_price': 'Cost',
        'purchase_date': 'Purchase Date',
        'purchased_from': 'Vendor',
        'serial_number': 'Serial Number',
        'manufacturer': 'Brand',
        'country': 'Country',
        'model': 'Model',
        'proof_of_purchase': 'Invoice'
    };

    const allKeys = Object.keys(data[0]);
    const columns = allKeys.filter(key => !excludedColumns.includes(key));

    let thead = tableElement.querySelector('thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="padding: 12px; background-color: #f8f9fa; border-bottom: 2px solid #eee;">Nº</th>
                ${columns.map(col => {
                    const label = columnLabels[col] || col.replace(/_/g, ' ').toUpperCase();
                    return `<th style="padding: 12px; text-transform: capitalize; border-bottom: 2px solid #eee;">${label}</th>`;
                }).join('')}
            </tr>
        `;
    }

    data.forEach((asset, index) => {
        const row = document.createElement('tr');
        let rowHTML = `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">${index + 1}</td>`;

        rowHTML += columns.map(col => {
            let val = asset[col] ?? '-';
            let style = "padding: 12px; border-bottom: 1px solid #eee; white-space: nowrap;";

            if (col.includes('price') || col.includes('cost')) {
                const num = parseFloat(val) || 0;
                val = `$${num.toLocaleString()}`;
            }

            if (col === 'purchase_date' && val !== '-') {
                try { val = val.split('T')[0]; } catch(e) {}
            }

            if (col === 'proof_of_purchase') {
                const url = asset['proof_of_purchase_url'];
                if (url && url !== '-') {
                    val = `<a href="${url.trim()}" target="_blank" style="color: #1976d2; font-weight: bold; text-decoration: none;">📄 View PDF</a>`;
                }
            }

            if (col === 'device_status' || col === 'status') {
                const s = val.toString().toLowerCase();
                if (s.includes('active') || s.includes('service') || s.includes('operativo')) style += " color: #2e7d32; font-weight: 600;";
                if (s.includes('disposed') || s.includes('claim') || s.includes('baja')) style += " color: #d32f2f; font-weight: 600;";
            }

            return `<td style="${style}">${val}</td>`;
        }).join('');
        
        row.innerHTML = rowHTML;
        tbody.appendChild(row);
    });

    // --- DOUBLE SCROLL LOGIC ---
    let topScroll = document.getElementById('topScrollWrapper');
    if (!topScroll) {
        topScroll = document.createElement('div');
        topScroll.id = 'topScrollWrapper';
        topScroll.style.overflowX = 'auto';
        topScroll.style.marginBottom = '5px';
        
        const innerScroll = document.createElement('div');
        innerScroll.id = 'topScrollInner';
        innerScroll.style.height = '1px';
        
        topScroll.appendChild(innerScroll);
        tableContainer.parentNode.insertBefore(topScroll, tableContainer);

        topScroll.addEventListener('scroll', () => tableContainer.scrollLeft = topScroll.scrollLeft);
        tableContainer.addEventListener('scroll', () => topScroll.scrollLeft = tableContainer.scrollLeft);
    }

    setTimeout(() => {
        const inner = document.getElementById('topScrollInner');
        if(inner) inner.style.width = tableElement.scrollWidth + 'px';
    }, 150);
}

// ==========================================
// 6. EVENTS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput')?.addEventListener('input', applyLocalFilters);
    ['typeFilter', 'statusFilter', 'manufacturerFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyLocalFilters);
    });
    checkSession();
});