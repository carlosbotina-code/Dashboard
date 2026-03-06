// ==========================================
// 1. CONFIGURATION & UTILS
// ==========================================
const SUPABASE_URL = 'https://uwaaekdsnaqwhwxyathc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SsvlcOJypZySsqeXm2mQjg_uu0o1m0x';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allAssets = [];
let assetCharts = {};
let googleChartsReady = false;

// Inicialización de Google Charts
if (window.google && google.charts) {
    google.charts.load('current', { 'packages': ['geochart'] });
    google.charts.setOnLoadCallback(() => {
        googleChartsReady = true;
        if (allAssets.length > 0) renderAssetsCharts(allAssets);
    });
}

const countryFlags = {
    'colombia': '🇨🇴', 'costa rica': '🇨🇷', 'usa': '🇺🇸', 'united states': '🇺🇸',
    'mexico': '🇲🇽', 'brazil': '🇧🇷', 'united kingdom': '🇬🇧', 'uk': '🇬🇧',    
    'argentina': '🇦🇷',
    'denmark': '🇩🇰',
    'dinamarca': '🇩🇰',
    'guatemala': '🇬🇹',
    'uruguay': '🇺🇾'
};

// ==========================================
// 2. SESSION MANAGEMENT
// ==========================================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authContainer = document.getElementById('authContainer');
    const dashboardContent = document.getElementById('dashboardContent');

    if (session) {
        if (authContainer) authContainer.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        loadAssetsData();
    } else {
        if (authContainer) authContainer.style.display = 'flex';
        if (dashboardContent) dashboardContent.style.display = 'none';
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
        if (tbody) tbody.innerHTML = `<tr><td colspan="100%" style="color:red;">Error: ${err.message}</td></tr>`;
    }
}

function populateFilters(data) {
    const getUniques = (field) => [...new Set(data.map(item => item[field]).filter(Boolean))];
    
    fillSelect('typeFilter', getUniques('device_type'), 'All Devices');
    fillSelect('statusFilter', getUniques('device_status'), 'All Statuses');
    fillSelect('conditionFilter', getUniques('device_condition'), 'All Conditions');
    fillSelect('countryFilter', getUniques('country'), 'All Countries');
    fillSelect('manufacturerFilter', getUniques('purchased_from'), 'All Vendors');
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
    const condVal = document.getElementById('conditionFilter')?.value || '';
    const countryVal = document.getElementById('countryFilter')?.value || '';
    const vendorVal = document.getElementById('manufacturerFilter')?.value || '';

    const filtered = allAssets.filter(item => {
        const matchType = !typeVal || item.device_type === typeVal;
        const matchStatus = !statusVal || (item.device_status || item.status) === statusVal;
        const matchCond = !condVal || item.device_condition === condVal;
        const matchCountry = !countryVal || item.country === countryVal;
        const matchVendor = !vendorVal || item.purchased_from === vendorVal;
        const searchString = Object.values(item).join(' ').toLowerCase();
        const matchSearch = !searchVal || searchString.includes(searchVal);

        return matchType && matchStatus && matchCond && matchCountry && matchVendor && matchSearch;
    });

    window.currentFilteredData = filtered;
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
        if (status === 'active' || status === 'in service' || status === 'operativo') activeAssets++;
        const assigned = asset.assigned_to;
        if (!assigned || assigned === '-' || assigned.trim() === '' || assigned.toLowerCase() === 'unassigned') {
            unassignedAssets++;
        }
    });

    const setT = (id, val) => { if (document.getElementById(id)) document.getElementById(id).textContent = val; };
    setT('totalAssetValue', totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
    setT('totalAssets', data.length);
    setT('activeAssets', activeAssets);
    setT('unassignedAssets', unassignedAssets);
}

function renderAssetsCharts(data) {
    const statusData = {};
    const typeVendorData = {};
    const timelineData = {};
    const countryDataMap = {}; // Cambiado nombre para evitar colisión

    data.forEach(asset => {
        const cost = parseFloat(asset.purchase_price) || 0;
        
        // Status Logic
        const status = asset.device_status || 'Unknown';
        if (!statusData[status]) statusData[status] = { count: 0, cost: 0 };
        statusData[status].count++;
        statusData[status].cost += cost;

        // Vendor Logic
        const type = asset.device_type || 'Unknown';
        const vendor = asset.purchased_from || 'Unknown';
        if (!typeVendorData[type]) typeVendorData[type] = {};
        typeVendorData[type][vendor] = (typeVendorData[type][vendor] || 0) + cost;

        // Country Logic for Map
        const country = asset.country || 'Unknown';
        if (!countryDataMap[country]) countryDataMap[country] = { count: 0, totalValue: 0 };
        countryDataMap[country].count++;
        countryDataMap[country].totalValue += cost;

        // Timeline Logic
        if (asset.purchase_date && asset.purchase_date !== '-') {
            try {
                const datePart = asset.purchase_date.split(' ')[0];
                const dateObj = new Date(datePart);
                if (!isNaN(dateObj)) {
                    const monthYear = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                    timelineData[monthYear] = (timelineData[monthYear] || 0) + 1;
                }
            } catch (e) {}
        }
    });

    const renderChartJS = (id, config) => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        if (assetCharts[id]) assetCharts[id].destroy();
        assetCharts[id] = new Chart(canvas, config);
    };

    // Chart 1: Status
    renderChartJS('assetStatusChart', {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusData),
            datasets: [{
                data: Object.values(statusData).map(v => v.count),
                backgroundColor: ['#2e7d32', '#f57c00', '#d32f2f', '#9e9e9e']
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const info = statusData[ctx.label];
                            return ` ${info.count} units | Cost: $${info.cost.toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });

    // Chart 2: Types by Vendor
    const allTypes = Object.keys(typeVendorData);
    const vendorDatasets = [...new Set(data.map(a => a.purchased_from).filter(Boolean))].map((vendor, i) => ({
        label: vendor,
        data: allTypes.map(type => typeVendorData[type][vendor] || 0),
        backgroundColor: `hsl(${i * 60}, 70%, 50%)`
    }));

    renderChartJS('assetTypeChart', {
        type: 'bar',
        data: { labels: allTypes, datasets: vendorDatasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: $${ctx.raw.toLocaleString()}`
                    }
                }
            }
        }
    });

    // Chart 3: Timeline
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
                label: 'Total Assets Accumulated',
                data: cumulativePurchases,
                borderColor: '#1976d2',
                backgroundColor: 'rgba(25, 118, 210, 0.2)',
                fill: true,
                tension: 0.3,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => [
                            `Accumulated: ${ctx.raw} units`,
                            `Purchased this month: ${monthlyPurchases[ctx.dataIndex]} units`
                        ]
                    }
                }
            }
        }
    });

    // Chart 4: GeoChart
    if (googleChartsReady && window.google && google.visualization) {
        const mapContainer = document.getElementById('assetCountryMap');
        if (mapContainer) {
            const mapDataArray = [['Country', 'Quantity', { role: 'tooltip', p: { html: true } }]];
            Object.keys(countryDataMap).forEach(country => {
                const count = countryDataMap[country].count;
                const totalVal = countryDataMap[country].totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                const tip = `<div style="padding:10px; font-family: Arial;"><b>${country}</b><br>Devices: ${count}<br>Value: ${totalVal}</div>`;
                mapDataArray.push([country, count, tip]);
            });

            const dataTable = google.visualization.arrayToDataTable(mapDataArray);
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

    // Columnas a excluir
    const excludedColumns = [
        'modified_time', 'updated_at', 'created_time', 'approval_status', 
        'added_time', 'proof_of_purchase_url', 'zoho_id', 'warehouse', 'id','drive_proof_of_purchase'
    ];

    const allKeys = Object.keys(data[0]);
    const columns = allKeys.filter(key => !excludedColumns.includes(key));

    // Mapeo de nombres amigables
    const columnAlias = {
        'device_model': 'device model',
        'assigned_to': 'assigned to',
        'possession_of': 'possession of',
        'country': 'country',
        'client_name': 'client name',
        'purchase_date': 'purchase date',
        'serial_number': 'serial number',
        'manufacturer': 'manufacturer',
        'purchased_from': 'purchased from',
        'device_condition': 'device condition'
    };

    // Renderizar Encabezado
    let thead = tableElement.querySelector('thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="padding: 12px; background-color: #f8f9fa; border-bottom: 2px solid #eee;">nº</th>
                <th style="padding: 12px; background-color: #f8f9fa; border-bottom: 2px solid #eee;">actions</th>
                ${columns.map(col => {
                    // Usa el alias o formatea el nombre original
                    const displayName = columnAlias[col] || col.replace(/_/g, ' ').toLowerCase();
                    return `
                        <th style="padding: 12px; border-bottom: 2px solid #eee; text-align: center;">
                            ${displayName}
                        </th>
                    `;
                }).join('')}
            </tr>
        `;
    }

    // Renderizar Filas
    data.forEach((asset, index) => {
        const row = document.createElement('tr');
        
        // Columna de Número e Iconos de Acción (Edit/Delete)
        let rowHTML = `
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; color: #666;">${index + 1}</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; white-space: nowrap;">
                <button onclick='openAssetModal(${JSON.stringify(asset)})' 
                        style="padding: 5px 8px; background: rgb(0, 118, 245); color: white; border-radius: 4px; margin-right: 5px; font-size: 12px; border: none; cursor: pointer;">
                    ✏️
                </button>
                <button onclick="deleteAsset('${asset.id}')" 
                        style="padding: 5px 8px; background: #d32f2f; color: white; border-radius: 4px; font-size: 12px; border: none; cursor: pointer;">
                    🗑️
                </button>
            </td>
        `;

        // Celdas de datos dinámicas
        rowHTML += columns.map(col => {
            let val = asset[col] ?? '-';
            let style = "padding: 12px; border-bottom: 1px solid #eee; white-space: nowrap; text-align: center;";

            if (col.includes('price') || col.includes('cost')) {
                val = `$${(parseFloat(val) || 0).toLocaleString()}`;
            }

            if (col === 'purchase_date' && val !== '-') {
                try { val = val.split(' ')[0]; } catch(e) {}
            }

            if (col === 'country' && val !== '-') {
                let cleanCountry = val.toLowerCase().replace(/^[a-z]{2}\s+/i, '').trim();
                const flag = countryFlags[cleanCountry] || '🏳️';
                val = `${flag} ${val}`;
            }

            if (col === 'device_condition') {
                const cond = val.toLowerCase();
                if (cond === 'new' || cond === 'icon') style += " color: #2e7d32; font-weight: bold;";
                else if (cond === 'used') style += " color: #f57c00; font-weight: bold;";
                else if (cond === 'damaged') style += " color: #d32f2f; font-weight: bold;";
            }

            return `<td style="${style}">${val}</td>`;
        }).join('');

        row.innerHTML = rowHTML;
        tbody.appendChild(row);
    });

    updateTopScroll(tableContainer, tableElement);
}

// Función auxiliar para el scroll superior
function updateTopScroll(container, table) {
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
        container.parentNode.insertBefore(topScroll, container);

        topScroll.addEventListener('scroll', () => container.scrollLeft = topScroll.scrollLeft);
        container.addEventListener('scroll', () => topScroll.scrollLeft = container.scrollLeft);
    }

    setTimeout(() => {
        const inner = document.getElementById('topScrollInner');
        if(inner) inner.style.width = table.scrollWidth + 'px';
    }, 200);
}

// ==========================================
// 6. EXPORT FUNCTION
// ==========================================
function exportToCSV() {
    const data = window.currentFilteredData || allAssets;
    if (!data.length) return;

    const excludedColumns = ['modified_time', 'updated_at', 'created_time', 'approval_status', 'added_time', 'proof_of_purchase_url', 'zoho_id', 'warehouse'];
    const columns = Object.keys(data[0]).filter(key => !excludedColumns.includes(key));

    let csvContent = "\uFEFF"; 
    csvContent += columns.map(col => `"${col.replace(/_/g, ' ').toLowerCase()}"`).join(",") + "\n";

    data.forEach(asset => {
        const row = columns.map(col => {
            let val = asset[col] ?? '-';
            if (col === 'purchase_date' && val !== '-') val = val.split(' ')[0];
            return `"${val.toString().replace(/"/g, '""')}"`;
        });
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `assets_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function generateLegacyId(serial) {
    const now = new Date();
    // Formato: AAAAMMDDHHMMSS (ej: 202603060530)
    const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0');

    // Limpiamos el serial de espacios y tomamos los últimos 4 caracteres
    const cleanSerial = (serial || "NOSERIAL").replace(/\s+/g, '').toUpperCase();
    
    // Resultado: SERIAL-TIMESTAMP (ej: ABC1234-202603060530)
    return `${cleanSerial}-${timestamp}`;
}

// --- MANEJO DEL MODAL ---
function openAssetModal(asset = null) {
    const modal = document.getElementById('assetModal');
    const form = document.getElementById('assetForm');
    modal.style.display = 'flex';
    
    if (asset) {
        document.getElementById('editAssetId').value = asset.id || '';
        // Cargamos device_model en el campo de Asset Name
        document.getElementById('form_asset_name').value = asset.device_model || '';
        // ... resto de los campos
    } else {
        form.reset();
        document.getElementById('editAssetId').value = '';
    }
}

function closeAssetModal() {
    document.getElementById('assetModal').style.display = 'none';
}

// --- GUARDAR (CREATE / UPDATE) ---
async function saveAsset(event) {
    event.preventDefault();
    const id = document.getElementById('editAssetId')?.value;
    const serial = document.getElementById('form_serial_number')?.value;

    const assetData = {
        // Generamos el ID aleatorio basado en Serial + Fecha
        zoho_id: generateLegacyId(serial), 
        
        device_model: document.getElementById('form_asset_name')?.value || '',
        serial_number: serial,
        device_type: document.getElementById('form_device_type')?.value || '',
        country: document.getElementById('form_country')?.value || '',
        purchase_price: document.getElementById('form_purchase_price')?.value || '0',
        purchase_date: document.getElementById('form_purchase_date')?.value || '',
        purchased_from: document.getElementById('form_purchased_from')?.value || '',
        device_status: document.getElementById('form_device_status')?.value || 'Active',
        device_condition: document.getElementById('form_device_condition')?.value || 'New',
        assigned_to: document.getElementById('form_assigned_to')?.value || '',
        possession_of: document.getElementById('form_possession_of')?.value || '',
        updated_at: new Date().toISOString()
    };

    try {
        let result;
        if (id && id.trim() !== "") {
            // Si editamos, no cambiamos el zoho_id original, solo el resto
            delete assetData.zoho_id; 
            result = await supabaseClient.from('assets_management').update(assetData).eq('id', id);
        } else {
            // Si es nuevo, enviamos el zoho_id generado
            result = await supabaseClient.from('assets_management').insert([assetData]);
        }

        if (result.error) throw result.error;
        
        alert('Asset saved successfully with ID: ' + assetData.zoho_id);
        closeAssetModal();
        loadAssetsData();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// --- ELIMINAR ---
async function deleteAsset(id) {
    if (!confirm('Are you sure you want to delete this asset? This action cannot be undone.')) return;

    try {
        const { error } = await supabaseClient.from('assets_management').delete().eq('id', id);
        if (error) throw error;
        
        alert('Asset deleted.');
        loadAssetsData();
    } catch (err) {
        alert('Error deleting: ' + err.message);
    }
}

// 7. EVENTS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // THIS LINE IS CRITICAL: Connects the Save button to the function
    document.getElementById('assetForm')?.addEventListener('submit', saveAsset);

    document.getElementById('searchInput')?.addEventListener('input', applyLocalFilters);
    ['typeFilter', 'statusFilter', 'conditionFilter', 'countryFilter', 'manufacturerFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyLocalFilters);
    });
    checkSession();
});

