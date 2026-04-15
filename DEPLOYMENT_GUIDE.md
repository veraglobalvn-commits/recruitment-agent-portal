# Deployment Guide: Async Document Generation System

## Prerequisites
- Access to Supabase SQL Editor
- Access to n8n instance
- Production environment access (Vercel)

---

## Step 1: Run Database Migration

### 1.1 Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor (left sidebar)
4. Click "New Query"

### 1.2 Run Migration Script
Copy and paste the following SQL:

```sql
-- Migration: Translation, Recruitment Request, and Contract Request tracking tables
-- 2026-04-15

-- ── translation_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translation_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'order')),
  entity_id TEXT NOT NULL,
  fields_to_translate JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  translated_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── recruitment_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recruitment_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  pdf_url TEXT,
  docs_edit_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── contract_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id_ld),
  contract_type TEXT NOT NULL CHECK (contract_type IN ('basic', 'advanced')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  pdf_url TEXT,
  docs_edit_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ── Indexes for better query performance ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_translation_requests_entity ON translation_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_translation_requests_status ON translation_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_order ON recruitment_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_agent ON recruitment_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_status ON recruitment_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_requests_order ON contract_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_contract_requests_candidate ON contract_requests(candidate_id);
CREATE INDEX IF NOT EXISTS idx_contract_requests_status ON contract_requests(status, created_at DESC);

-- ── Notify PostgREST to reload schema ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
```

### 1.3 Verify Migration
Run this query to verify tables were created:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('translation_requests', 'recruitment_requests', 'contract_requests')
ORDER BY table_name, ordinal_position;
```

Expected output: 3 tables with all columns listed.

---

## Step 2: Import N8N Workflows

### 2.1 Access n8n
1. Go to your n8n instance URL
2. Login with your credentials

### 2.2 Import Workflows
For each workflow file:

1. Click "Import from File" (or drag & drop)
2. Select the JSON file:
   - `n8n/Translate Entity.json`
   - `n8n/Create Recruitment Request.json`
   - `n8n/Create Contract.json`
3. Click "Import"

### 2.3 Configure Webhook URLs
After importing, each workflow will have a webhook URL. Copy these URLs:

1. Open each workflow
2. Click on the "Webhook" node
3. Copy the webhook URL (format: `https://your-n8n-instance.com/webhook/xxx`)

You'll need these for environment variables:
- `N8N_TRANSLATE_URL`
- `N8N_YCTD_URL`
- `N8N_CONTRACT_URL`

---

## Step 3: Configure N8N Credentials

### 3.1 Supabase Service Role Credential
1. In n8n, go to Credentials (left sidebar)
2. Click "Add Credential"
3. Search for "Supabase"
4. Fill in:
   - **Name**: Supabase Service Role
   - **Base URL**: Your Supabase project URL (e.g., `https://your-project.supabase.co`)
   - **API Key**: Your Supabase Service Role Key (from `.env` or Supabase dashboard)
5. Click "Save"

### 3.2 Kimi API Credential
1. Click "Add Credential"
2. Search for "Header Auth"
3. Fill in:
   - **Name**: Kimi API Key
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer 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`
4. Click "Save"

### 3.3 Google Drive OAuth Credential
This should already exist (credential ID: `pQ6qTSMZRoiqUMQV`).

If not:
1. Click "Add Credential"
2. Search for "Google Drive OAuth2 API"
3. Follow OAuth flow to authorize
4. Click "Save"

### 3.4 Google Docs OAuth Credential
This should already exist (credential ID: `E7ejRYB8dtcGQH00`).

If not:
1. Click "Add Credential"
2. Search for "Google Docs OAuth2 API"
3. Follow OAuth flow to authorize
4. Click "Save"

### 3.5 Update Workflow Credentials
For each workflow:

1. Open the workflow
2. Click on each node that needs credentials
3. Select the appropriate credential from the dropdown
4. Save the workflow

**Credential mapping:**
- All Supabase nodes → "Supabase Service Role"
- "Call Kimi API" node → "Kimi API Key"
- "Copy Google Docs Template" node → "Google Drive OAuth2 API"
- "Fill Data to Docs" node → "Google Docs OAuth2Api"
- "Export PDF" node → "Google Drive OAuth2Api"

---

## Step 4: Configure N8N Environment Variables

### 4.1 Access n8n Settings
1. In n8n, go to Settings (gear icon)
2. Click "Environment Variables"

### 4.2 Add Variables
Add the following environment variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Docs Template URLs
NEXT_PUBLIC_YCTD_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_YCTD_TEMPLATE_ID/edit
NEXT_PUBLIC_CONTRACT_BASIC_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_BASIC_CONTRACT_TEMPLATE_ID/edit
NEXT_PUBLIC_CONTRACT_ADVANCED_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_ADVANCED_CONTRACT_TEMPLATE_ID/edit
```

**Note:** Replace `YOUR_*_TEMPLATE_ID` with actual Google Docs document IDs.

### 4.3 Get Google Docs Template IDs
1. Open each Google Docs template
2. Copy the ID from the URL (between `/d/` and `/edit`)
3. Example: `https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit` → ID is `1AbCdEfGhIjKlMnOpQrStUvWxYz`

---

## Step 5: Update Production Environment Variables

### 5.1 Access Vercel
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to Settings → Environment Variables

### 5.2 Add New Variables
Add the following variables:

```bash
# N8N Webhook URLs
N8N_TRANSLATE_URL=https://your-n8n-instance.com/webhook/translate-entity
N8N_YCTD_URL=https://your-n8n-instance.com/webhook/create-recruitment-request
N8N_CONTRACT_URL=https://your-n8n-instance.com/webhook/create-contract

# Google Docs Template URLs
NEXT_PUBLIC_YCTD_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_YCTD_TEMPLATE_ID/edit
NEXT_PUBLIC_CONTRACT_BASIC_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_BASIC_CONTRACT_TEMPLATE_ID/edit
NEXT_PUBLIC_CONTRACT_ADVANCED_TEMPLATE_URL=https://docs.google.com/document/d/YOUR_ADVANCED_CONTRACT_TEMPLATE_ID/edit

# Kimi API
KIMI_API_KEY=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
```

**Important:**
- Replace `your-n8n-instance.com` with your actual n8n URL
- Replace `YOUR_*_TEMPLATE_ID` with actual Google Docs IDs
- Keep `KIMI_API_KEY` as-is (provided key)

### 5.3 Redeploy
After adding variables:
1. Go to Deployments tab
2. Click "Redeploy" on the latest deployment
3. Wait for deployment to complete

---

## Step 6: Test the System

### 6.1 Test Translation
1. Go to Admin → Companies → Select a company
2. Click "🌐 Dịch" button
3. Verify:
   - Button shows loading state
   - After ~10-20 seconds, English fields are populated
   - No errors in console

### 6.2 Test YCTD Generation
1. Go to Admin → Orders → Select an order
2. Ensure English fields are filled (job_type_en, etc.)
3. Click "📋 Tạo YCTD" for an agent
4. Verify:
   - Button shows loading state
   - After ~20-30 seconds, YCTD link appears
   - PDF is accessible
   - Google Docs edit link works

### 6.3 Test Contract Generation
1. Go to Admin → Orders → Select an order
2. Ensure all required fields are filled
3. Select contract type (Basic or Advanced)
4. Click "Tạo Hợp đồng"
5. Verify:
   - Button shows loading state
   - After ~20-30 seconds, contract link appears
   - PDF is accessible
   - Google Docs edit link works

### 6.4 Check Database
Run these queries to verify data:

```sql
-- Check translation requests
SELECT * FROM translation_requests ORDER BY created_at DESC LIMIT 5;

-- Check recruitment requests
SELECT * FROM recruitment_requests ORDER BY created_at DESC LIMIT 5;

-- Check contract requests
SELECT * FROM contract_requests ORDER BY created_at DESC LIMIT 5;
```

Expected: All records should have `status = 'completed'` with `pdf_url` and `docs_edit_url` populated.

---

## Step 7: Monitor and Troubleshoot

### 7.1 Check N8N Executions
1. In n8n, go to "Executions" (left sidebar)
2. Filter by workflow name
3. Check for failed executions
4. Click on failed executions to see error details

### 7.2 Common Issues

**Issue: "Missing required fields" error**
- Solution: Ensure all required fields are filled in company/order records
- Check: `en_company_name`, `en_legal_rep`, `en_address`, `job_type_en`, etc.

**Issue: "N8N_TRANSLATE_URL not configured"**
- Solution: Add `N8N_TRANSLATE_URL` to Vercel environment variables
- Redeploy after adding

**Issue: "Could not find the 'X' column of 'Y' in the schema cache"**
- Solution: Run `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor

**Issue: "Google Docs template not found"**
- Solution: Verify template URLs are correct and templates are accessible
- Check Google Docs sharing permissions

**Issue: "Supabase upload failed"**
- Solution: Verify `agent-media` bucket exists and has proper permissions
- Check service role key is correct

### 7.3 Monitoring Queries

```sql
-- Check for stuck requests (processing > 5 minutes)
SELECT * FROM translation_requests
WHERE status = 'processing'
AND created_at < NOW() - INTERVAL '5 minutes';

SELECT * FROM recruitment_requests
WHERE status = 'processing'
AND created_at < NOW() - INTERVAL '5 minutes';

SELECT * FROM contract_requests
WHERE status = 'processing'
AND created_at < NOW() - INTERVAL '5 minutes';

-- Check failure rates
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM translation_requests
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;

SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM recruitment_requests
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;

SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM contract_requests
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

---

## Step 8: Cleanup (Optional)

### 8.1 Remove Old Sync Code
If you want to clean up old sync code (Lark integration), you can:
- Remove old n8n workflows that sync to Lark
- Remove Lark-related environment variables
- Update documentation

### 8.2 Archive Old Data
If you have old data in Lark, consider:
- Exporting Lark data to CSV
- Importing to Supabase
- Archiving Lark tables

---

## Rollback Plan

If something goes wrong:

### 1. Disable Features
Set environment variables to empty strings to disable:
```bash
N8N_TRANSLATE_URL=""
N8N_YCTD_URL=""
N8N_CONTRACT_URL=""
```

### 2. Revert Database
```sql
DROP TABLE IF EXISTS contract_requests;
DROP TABLE IF EXISTS recruitment_requests;
DROP TABLE IF EXISTS translation_requests;
NOTIFY pgrst, 'reload schema';
```

### 3. Revert Code
```bash
git revert <commit-hash>
git push
```

### 4. Redeploy
Redeploy previous version in Vercel.

---

## Support

If you encounter issues:
1. Check n8n execution logs
2. Check browser console for errors
3. Check Supabase logs
4. Review this guide for common issues

---

## Next Steps

After successful deployment:
1. Monitor system for 1-2 weeks
2. Collect user feedback
3. Optimize based on usage patterns
4. Consider adding:
   - Batch operations
   - Document templates per company
   - Email notifications
   - Document signing integration
