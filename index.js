// Zoho Recruit to Supabase Integration
// This script fetches Applications from Zoho Recruit and syncs them to Supabase

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  zoho: {
    apiDomain: 'https://recruit.zoho.com', // or recruit.zoho.eu, recruit.zoho.com.au, etc.
    accessToken: '1000.21eea9c73f270fc94e5bf6f829c1a417.fad895b010af04436038bc7a80e25af6', // Get this from OAuth flow
    module: 'Candidates' // Applications are under Candidates module in Zoho Recruit
  },
  supabase: {
    url: 'https://lmgpsbkbfeetdcgjxlbd.supabase.co',
    key: 'sb_publishable_cWlfcyK-hFgRqKyId7V32A_fp72fDNt',
    table: 'applications' // Your Supabase table name
  }
};

// Initialize Supabase client
const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.key);

// Fetch applications from Zoho Recruit
async function fetchZohoApplications(page = 1, perPage = 200) {
  try {
    const response = await axios.get(
    `${CONFIG.zoho.apiDomain}/recruit/v2/${CONFIG.zoho.module}`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${CONFIG.zoho.accessToken}`
      },
      params: {
        page: page,
        per_page: perPage
       
      }
    }
);

    return response.data;
  } catch (error) {
    console.error('Error fetching from Zoho:', error.response?.data || error.message);
    throw error;
  }
}

// Transform Zoho data to match Supabase schema
function transformApplication(zohoApp) {
  return {
    zoho_id: zohoApp.id,
    candidate_name: zohoApp.Candidate_Name?.name || zohoApp.Full_Name || "N/A",
    email: zohoApp.Email,
    phone: zohoApp.Phone || zohoApp.Mobile,
    current_job_title: zohoApp.Current_Job_Title,
    current_employer: zohoApp.Current_Employer,
    experience_years: zohoApp.Experience_in_Years,
    skill_set: zohoApp.Skill_Set,
    highest_qualification: zohoApp.Highest_Qualification_Held,
    current_salary: zohoApp.Current_Salary,
    expected_salary: zohoApp.Expected_Salary,
    notice_period: zohoApp.Notice_Period,
    source: zohoApp.Source || zohoApp.Candidate_Source,
    status: zohoApp.Candidate_Status,
    owner: zohoApp.Owner?.name || zohoApp.Candidate_Owner?.name,
    created_time: zohoApp.Created_Time,
    modified_time: zohoApp.Modified_Time,
    
    // CORRECCIÓN DE NUEVOS CAMPOS:
    is_active: zohoApp.Is_Active === true || zohoApp.Is_Active === 'true',
    application_stage: zohoApp.Application_Stage,
    application_status: zohoApp.Application_Status,
    last_activity_time: zohoApp.Last_Activity_Time,
    
    // EXTRACCIÓN DE LOOKUPS (Módulos relacionados)
    recruiter_name: zohoApp.Assigned_Recruiter?.name || 'No Recruiter assigned',
    client_name: zohoApp.Client_Name?.name || 'No client assigned'
  };
}

// Insert or update applications in Supabase
async function syncToSupabase(applications) {
  try {
    const transformedData = applications.map(transformApplication);
    
    const { data, error } = await supabase
      .from(CONFIG.supabase.table)
      .upsert(transformedData, {
        onConflict: 'zoho_id', // Use zoho_id as unique identifier
        ignoreDuplicates: false // Update existing records
      });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log(`Successfully synced ${transformedData.length} applications`);
    return data;
  } catch (error) {
    console.error('Error syncing to Supabase:', error.message);
    throw error;
  }
}

// Main sync function
async function syncApplications() {
  console.log('Starting Zoho Recruit to Supabase sync...');
  
  try {
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      console.log(`Fetching page ${page}...`);
      
      const response = await fetchZohoApplications(page);
      
      if (response.data && response.data.length > 0) {
        await syncToSupabase(response.data);
        totalSynced += response.data.length;
        
        // Check if there are more pages
        hasMore = response.info?.more_records || false;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`Sync completed! Total applications synced: ${totalSynced}`);
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

// Run the sync
syncApplications();

// Optional: Set up scheduled sync (uncomment to use with node-cron)
/*
const cron = require('node-cron');

// Run sync every hour
cron.schedule('0 * * * *', () => {
  console.log('Running scheduled sync...');
  syncApplications();
});

console.log('Scheduled sync activated. Running every hour...');
*/