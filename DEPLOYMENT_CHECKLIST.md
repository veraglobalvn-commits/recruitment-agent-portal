# Deployment Checklist

Use this checklist to track your deployment progress.

## Database Migration

- [ ] Open Supabase SQL Editor
- [ ] Run migration script from `DEPLOYMENT_GUIDE.md`
- [ ] Verify tables were created (run verification query)
- [ ] Check indexes were created
- [ ] Confirm `NOTIFY pgrst, 'reload schema'` executed

## N8N Workflows

- [ ] Access n8n instance
- [ ] Import `n8n/Translate Entity.json`
- [ ] Import `n8n/Create Recruitment Request.json`
- [ ] Import `n8n/Create Contract.json`
- [ ] Copy webhook URLs from each workflow
- [ ] Save webhook URLs for environment variables

## N8N Credentials

- [ ] Create "Supabase Service Role" credential
- [ ] Create "Kimi API Key" credential
- [ ] Verify "Google Drive OAuth2Api" credential exists
- [ ] Verify "Google Docs OAuth2Api" credential exists
- [ ] Update all workflow nodes with correct credentials

## N8N Environment Variables

- [ ] Access n8n Settings → Environment Variables
- [ ] Add `SUPABASE_URL`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Add `NEXT_PUBLIC_YCTD_TEMPLATE_URL`
- [ ] Add `NEXT_PUBLIC_CONTRACT_BASIC_TEMPLATE_URL`
- [ ] Add `NEXT_PUBLIC_CONTRACT_ADVANCED_TEMPLATE_URL`
- [ ] Get Google Docs template IDs
- [ ] Replace placeholder IDs with actual IDs

## Production Environment Variables (Vercel)

- [ ] Access Vercel project settings
- [ ] Add `N8N_TRANSLATE_URL`
- [ ] Add `N8N_YCTD_URL`
- [ ] Add `N8N_CONTRACT_URL`
- [ ] Add `NEXT_PUBLIC_YCTD_TEMPLATE_URL`
- [ ] Add `NEXT_PUBLIC_CONTRACT_BASIC_TEMPLATE_URL`
- [ ] Add `NEXT_PUBLIC_CONTRACT_ADVANCED_TEMPLATE_URL`
- [ ] Add `KIMI_API_KEY`
- [ ] Redeploy application

## Testing

### Translation Feature
- [ ] Go to Admin → Companies → Select company
- [ ] Click "🌐 Dịch" button
- [ ] Verify loading state shows
- [ ] Wait for completion (10-20s)
- [ ] Verify English fields are populated
- [ ] Check browser console for errors
- [ ] Check `translation_requests` table in Supabase

### YCTD Generation
- [ ] Go to Admin → Orders → Select order
- [ ] Ensure English fields are filled
- [ ] Click "📋 Tạo YCTD" for an agent
- [ ] Verify loading state shows
- [ ] Wait for completion (20-30s)
- [ ] Verify YCTD link appears
- [ ] Click PDF link - verify it opens
- [ ] Click Google Docs edit link - verify it opens
- [ ] Check browser console for errors
- [ ] Check `recruitment_requests` table in Supabase

### Contract Generation
- [ ] Go to Admin → Orders → Select order
- [ ] Ensure all required fields are filled
- [ ] Select "HĐ Cơ bản" contract type
- [ ] Click "Tạo Hợp đồng"
- [ ] Verify loading state shows
- [ ] Wait for completion (20-30s)
- [ ] Verify contract link appears
- [ ] Click PDF link - verify it opens
- [ ] Click Google Docs edit link - verify it opens
- [ ] Check browser console for errors
- [ ] Check `contract_requests` table in Supabase

### Advanced Contract
- [ ] Select "HĐ Nâng cao" contract type
- [ ] Click "Tạo Hợp đồng"
- [ ] Verify loading state shows
- [ ] Wait for completion (20-30s)
- [ ] Verify contract link appears
- [ ] Click PDF link - verify it opens
- [ ] Click Google Docs edit link - verify it opens
- [ ] Check browser console for errors
- [ ] Check `contract_requests` table in Supabase

## Database Verification

- [ ] Run translation requests query
- [ ] Run recruitment requests query
- [ ] Run contract requests query
- [ ] Verify all records have `status = 'completed'`
- [ ] Verify all records have `pdf_url` populated
- [ ] Verify all records have `docs_edit_url` populated

## Monitoring

- [ ] Check n8n executions for errors
- [ ] Check for stuck requests (processing > 5 min)
- [ ] Check failure rates (last 7 days)
- [ ] Review n8n execution logs
- [ ] Review browser console logs
- [ ] Review Supabase logs

## Documentation

- [ ] Update team documentation
- [ ] Share deployment guide with team
- [ ] Schedule training session if needed
- [ ] Document any customizations made

## Post-Deployment

- [ ] Monitor system for 1-2 weeks
- [ ] Collect user feedback
- [ ] Track performance metrics
- [ ] Identify optimization opportunities
- [ ] Plan future enhancements

---

## Notes

Use this section to note any issues or customizations during deployment:

```
Date: ___________
Issue: _________________________________________________
Solution: _______________________________________________
```

```
Date: ___________
Issue: _________________________________________________
Solution: _______________________________________________
```

```
Date: ___________
Issue: _________________________________________________
Solution: _______________________________________________
```

---

## Quick Reference

### Important URLs
- Supabase Dashboard: https://supabase.com/dashboard
- N8N Instance: https://your-n8n-instance.com
- Vercel Dashboard: https://vercel.com/dashboard

### Important Queries
```sql
-- Check stuck requests
SELECT * FROM translation_requests
WHERE status = 'processing'
AND created_at < NOW() - INTERVAL '5 minutes';

-- Check failure rates
SELECT status, COUNT(*)
FROM translation_requests
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

### Environment Variables Summary
```bash
# N8N Webhooks
N8N_TRANSLATE_URL=
N8N_YCTD_URL=
N8N_CONTRACT_URL=

# Google Docs Templates
NEXT_PUBLIC_YCTD_TEMPLATE_URL=
NEXT_PUBLIC_CONTRACT_BASIC_TEMPLATE_URL=
NEXT_PUBLIC_CONTRACT_ADVANCED_TEMPLATE_URL=

# Kimi API
KIMI_API_KEY=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
```
