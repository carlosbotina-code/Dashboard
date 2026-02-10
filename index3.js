// 1. SUPABASE CONFIGURATION
        // ==========================================
        const SUPABASE_URL = 'https://lmgpsbkbfeetdcgjxlbd.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt';
        const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // ==========================================
        // 2. STATE VARIABLES & MAPPINGS
        // ==========================================
        let financialData = []; 
        let charts = {
            annual: null,
            opStacked: null,
            opMix: null,
            forecast: null,
            comparison: null // Nuevo chart para el modal
        }; 

        const quartersMap = {
            "January": "Q1", "February": "Q1", "March": "Q1",
            "April": "Q2", "May": "Q2", "June": "Q2",
            "July": "Q3", "August": "Q3", "September": "Q3",
            "October": "Q4", "November": "Q4", "December": "Q4"
        };

        const monthOrder = { 
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 
        };

        // ==========================================
        // 3. AUTH & SESSION MANAGEMENT
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
            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;
            const errorMsg = document.getElementById('loginError');
            if (!email || !password) return;
            errorMsg.textContent = "Authenticating...";
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) errorMsg.textContent = error.message;
            else checkSession();
        }

        async function handleLogout() {
            await supabaseClient.auth.signOut();
            window.location.reload();
        }

        // ==========================================
        // 4. DATA LOADING
        // ==========================================
        async function loadData() {
            const loadingMsg = document.getElementById('loadingMessage');
            if(loadingMsg) loadingMsg.style.display = 'inline';

            try {
                const { data, error } = await supabaseClient
                    .from('monthly_financial_summary')
                    .select('*');

                if (error) throw error;

                financialData = (data || []).map(row => {
                    const rec = parseFloat(row.recruiting) || 0;
                    const pro = parseFloat(row.proserv_services) || 0;
                    const staff = parseFloat(row.staff_aug) || 0;
                    const misc = parseFloat(row.misc) || 0;
                    const guard = parseFloat(row.guard) || 0; 

                    const combinedServices = pro + staff;
                    const revenue = rec + pro + staff + misc + guard;
                    const forecast = revenue * 1.2; 

                    return {
                        ...row,
                        val_recruiting: rec,
                        val_services_combined: combinedServices,
                        val_guard: guard,
                        val_misc: misc,
                        calculated_revenue: revenue,
                        val_forecast: forecast
                    };
                }).sort((a,b) => {
                    if (a.year !== b.year) return a.year - b.year;
                    return monthOrder[a.month] - monthOrder[b.month];
                });

                populateFilters(financialData);
                applyFilters(); 

            } catch (err) {
                console.error("Data Load Error:", err);
                alert("Error loading data. Check console for details.");
            } finally {
                if(loadingMsg) loadingMsg.style.display = 'none';
            }
        }

        // ==========================================
        // 5. FILTER LOGIC
        // ==========================================
        function populateFilters(data) {
            const periodsSet = new Set();
            const monthSet = new Set();

            data.forEach(item => {
                const q = quartersMap[item.month];
                if(q) periodsSet.add(`${item.year} - ${q}`);
                monthSet.add(`${item.month} ${item.year}`);
            });

            const periods = [...periodsSet].sort().reverse();
            const sortedMonths = [...monthSet].sort((a, b) => {
                const [mA, yA] = a.split(' '); const [mB, yB] = b.split(' ');
                if (yA !== yB) return yA - yB;
                return monthOrder[mA] - monthOrder[mB];
            });

            fillSelect('periodFilter', periods, 'All Quarters');
            fillSelect('monthFilter', sortedMonths, 'All Months');
        }

        function fillSelect(id, items, defaultText) {
            const select = document.getElementById(id);
            if(!select) return;
            select.innerHTML = `<option value="">${defaultText}</option>`;
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item; opt.textContent = item;
                select.appendChild(opt);
            });
        }

        function applyFilters() {
            const periodVal = document.getElementById('periodFilter').value;
            const monthYearVal = document.getElementById('monthFilter').value;

            const filtered = financialData.filter(item => {
                let matchPeriod = true;
                if (periodVal) {
                    const [selYear, selQ] = periodVal.split(' - ');
                    matchPeriod = (String(item.year) === selYear) && (quartersMap[item.month] === selQ);
                }
                let matchMonth = true;
                if (monthYearVal) {
                    matchMonth = `${item.month} ${item.year}` === monthYearVal;
                }
                return matchPeriod && matchMonth;
            });

            updateDashboard(filtered);
        }

        // ==========================================
        // 6. DASHBOARD UPDATES
        // ==========================================
        function updateDashboard(filteredData) {
            const totalRev = filteredData.reduce((sum, p) => sum + p.calculated_revenue, 0);
            const totalGross = filteredData.reduce((sum, p) => sum + (parseFloat(p.gross_profit)||0), 0);
            const totalNet = filteredData.reduce((sum, p) => sum + (parseFloat(p.net_income)||0), 0);

            document.getElementById('annualRevenue').textContent = formatCurrency(totalRev);
            document.getElementById('annualGross').textContent = formatCurrency(totalGross);
            document.getElementById('annualNet').textContent = formatCurrency(totalNet);

            const topMonthObj = [...filteredData].sort((a,b) => b.calculated_revenue - a.calculated_revenue)[0];
            const topMonthLabel = topMonthObj ? `${topMonthObj.month}` : '-';

            document.getElementById('opRevenue').textContent = formatCurrency(totalRev);
            document.getElementById('opTopClient').textContent = topMonthLabel;
            document.getElementById('opRecords').textContent = filteredData.length;

            renderTrendChart(filteredData);
            renderServiceBreakdownCharts(filteredData);
            renderForecastChart(filteredData);
            renderTable(filteredData);
        }

        // ==========================================
        // 7. CHART RENDERING
        // ==========================================
        function renderTrendChart(data) {
            if(charts.annual) charts.annual.destroy();
            const ctx = document.getElementById('profitabilityTrendChart').getContext('2d');
            
            charts.annual = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(p => `${p.month} ${p.year}`),
                    datasets: [
                        { 
                            label: 'Total Revenue', 
                            data: data.map(p => p.calculated_revenue), 
                            borderColor: '#2ecc71', backgroundColor: '#2ecc71', tension: 0.3 
                        },
                        { 
                            label: 'Gross Profit', 
                            data: data.map(p => p.gross_profit), 
                            borderColor: '#f39c12', backgroundColor: '#f39c12', tension: 0.3 
                        },
                        { 
                            label: 'Net Income', 
                            data: data.map(p => p.net_income), 
                            borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', tension: 0.3, fill: true 
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        function renderServiceBreakdownCharts(data) {
            if(charts.opStacked) charts.opStacked.destroy();
            if(charts.opMix) charts.opMix.destroy();

            const labels = data.map(p => `${p.month} ${p.year}`);
            const recruitingData = data.map(p => p.val_recruiting);
            const servicesData = data.map(p => p.val_services_combined); 
            const guardData = data.map(p => p.val_guard);
            const miscData = data.map(p => p.val_misc);

            const totalRecruiting = recruitingData.reduce((a,b)=>a+b,0);
            const totalServices = servicesData.reduce((a,b)=>a+b,0);
            const totalGuard = guardData.reduce((a,b)=>a+b,0);
            const totalMisc = miscData.reduce((a,b)=>a+b,0);

            const ctxBar = document.getElementById('operationalStackedChart').getContext('2d');
            charts.opStacked = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Recruiting', data: recruitingData, backgroundColor: '#3498db' },
                        { label: 'Services', data: servicesData, backgroundColor: '#9b59b6' },
                        { label: 'Guard', data: guardData, backgroundColor: '#1abc9c' },
                        { label: 'Misc', data: miscData, backgroundColor: '#95a5a6' }
                    ]
                },
                options: { 
                    responsive: true, 
                    scales: { x: { stacked: true }, y: { stacked: true } } 
                }
            });

            const ctxMix = document.getElementById('categoryMixChart').getContext('2d');
            charts.opMix = new Chart(ctxMix, {
                type: 'doughnut',
                data: {
                    labels: ['Recruiting', 'Services', 'Guard', 'Misc'],
                    datasets: [{
                        data: [totalRecruiting, totalServices, totalGuard, totalMisc],
                        backgroundColor: ['#3498db', '#9b59b6', '#1abc9c', '#95a5a6']
                    }]
                },
                options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
            });
        }

        function renderForecastChart(data) {
            if(charts.forecast) charts.forecast.destroy();
            const canvas = document.getElementById('forecastChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            charts.forecast = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.map(p => `${p.month} ${p.year}`),
                    datasets: [
                        {
                            label: 'Actual Revenue',
                            data: data.map(p => p.calculated_revenue),
                            backgroundColor: 'rgba(52, 152, 219, 0.7)',
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Target / Forecast',
                            data: data.map(p => p.val_forecast),
                            borderColor: '#2ecc71',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            tension: 0.3,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        function renderTable(data) {
            const tbody = document.getElementById('tableBody');
            tbody.innerHTML = '';
            data.forEach(row => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${row.month} ${row.year}</strong></td>
                        <td style="color:#1abc9c; font-weight:500;">${formatCurrency(row.val_guard)}</td>
                        <td style="color:#3498db">${formatCurrency(row.val_recruiting)}</td>
                        <td style="color:#9b59b6; font-weight:500;">${formatCurrency(row.val_services_combined)}</td>
                        <td style="color:#95a5a6">${formatCurrency(row.val_misc)}</td>
                        <td style="font-weight:bold; background:#f0f9ff">${formatCurrency(row.calculated_revenue)}</td>
                        <td style="color:#f39c12">${formatCurrency(row.gross_profit)}</td>
                        <td style="color:#e74c3c">${formatCurrency(row.net_income)}</td>
                    </tr>`;
            });
        }

        function formatCurrency(val) {
            if (val === undefined || val === null) return '$0';
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
        }

        // ==========================================
        // 9. LÓGICA DE COMPARACIÓN (MODAL)
        // ==========================================
        function openCompareModal() {
            document.getElementById('compareModal').style.display = 'flex';
            updateCompareOptions(); 
        }

        function closeCompareModal() {
            document.getElementById('compareModal').style.display = 'none';
        }

        window.onclick = function(event) {
            const modal = document.getElementById('compareModal');
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }

        function updateCompareOptions() {
            const type = document.getElementById('compareType').value;
            const selectA = document.getElementById('periodA');
            const selectB = document.getElementById('periodB');
            
            selectA.innerHTML = '';
            selectB.innerHTML = '';

            const optionsSet = new Set();

            financialData.forEach(row => {
                let label = '';
                if (type === 'year') {
                    label = `${row.year}`;
                } else if (type === 'quarter') {
                    const q = quartersMap[row.month];
                    label = `${row.year} - ${q}`;
                } else if (type === 'semester') {
                    const s = (monthOrder[row.month] <= 6) ? 'S1' : 'S2';
                    label = `${row.year} - ${s}`;
                }
                if(label) optionsSet.add(label);
            });

            const sortedOptions = Array.from(optionsSet).sort().reverse();
            
            sortedOptions.forEach(opt => {
                selectA.add(new Option(opt, opt));
                selectB.add(new Option(opt, opt));
            });

            if (sortedOptions.length > 1) {
                selectB.selectedIndex = 0; 
                selectA.selectedIndex = 1; 
            }
        }

        function executeComparison() {
            const type = document.getElementById('compareType').value;
            const valA = document.getElementById('periodA').value;
            const valB = document.getElementById('periodB').value;

            if (!valA || !valB) return;

            const dataA = filterDataByLabel(valA, type);
            const dataB = filterDataByLabel(valB, type);

            const metricsA = calculateMetrics(dataA);
            const metricsB = calculateMetrics(dataB);

            displayDiff('diffRevenue', 'pctRevenue', metricsA.revenue, metricsB.revenue);
            displayDiff('diffGross', 'pctGross', metricsA.gross, metricsB.gross);
            displayDiff('diffNet', 'pctNet', metricsA.net, metricsB.net);

            renderCompareChart(valA, metricsA, valB, metricsB);

            document.getElementById('compareResults').style.display = 'block';
        }

        function filterDataByLabel(label, type) {
            return financialData.filter(row => {
                let rowLabel = '';
                if (type === 'year') {
                    rowLabel = `${row.year}`;
                } else if (type === 'quarter') {
                    const q = quartersMap[row.month];
                    rowLabel = `${row.year} - ${q}`;
                } else if (type === 'semester') {
                    const s = (monthOrder[row.month] <= 6) ? 'S1' : 'S2';
                    rowLabel = `${row.year} - ${s}`;
                }
                return rowLabel === label;
            });
        }

        function calculateMetrics(data) {
            return {
                revenue: data.reduce((sum, r) => sum + r.calculated_revenue, 0),
                gross: data.reduce((sum, r) => sum + (parseFloat(r.gross_profit) || 0), 0),
                net: data.reduce((sum, r) => sum + (parseFloat(r.net_income) || 0), 0)
            };
        }

        function displayDiff(idVal, idPct, valA, valB) {
        const diff = valB - valA;
        let pct = 0;
        if (valA !== 0) pct = (diff / valA) * 100;

        const elVal = document.getElementById(idVal);
        const elPct = document.getElementById(idPct); // <-- Aquí estaba el error (decía idPkt)

        elVal.textContent = (diff >= 0 ? '+' : '') + formatCurrency(diff);
        elPct.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';

        if (diff >= 0) {
            elVal.className = 'text-green';
            elPct.className = 'text-green';
        } else {
            elVal.className = 'text-red';
            elPct.className = 'text-red';
        }
        }

        function renderCompareChart(labelA, metricsA, labelB, metricsB) {
            const ctx = document.getElementById('compareChart').getContext('2d');
            
            if (charts.comparison) charts.comparison.destroy();

            charts.comparison = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Total Revenue', 'Gross Profit', 'Net Income'],
                    datasets: [
                        {
                            label: labelA,
                            data: [metricsA.revenue, metricsA.gross, metricsA.net],
                            backgroundColor: 'rgba(149, 165, 166, 0.6)',
                            borderColor: 'rgba(149, 165, 166, 1)',
                            borderWidth: 1
                        },
                        {
                            label: labelB,
                            data: [metricsB.revenue, metricsB.gross, metricsB.net],
                            backgroundColor: 'rgba(52, 152, 219, 0.7)',
                            borderColor: 'rgba(52, 152, 219, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('periodFilter').addEventListener('change', applyFilters);
            document.getElementById('monthFilter').addEventListener('change', applyFilters);
            checkSession();
        });