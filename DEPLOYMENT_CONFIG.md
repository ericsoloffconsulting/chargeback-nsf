# Chargeback NSF Portal - Deployment Configuration

SCRIPT_ID=4028
DEPLOY_ID=1
SCRIPT_FILE=chargeback-nsf-portal.js

## Deployment Instructions

**Deploy this script to NetSuite (automatically handles authentication):**
```bash
cd "/Users/ericsoloff/Library/CloudStorage/GoogleDrive-ericsoloffconsulting@gmail.com/My Drive/SuiteScripts"
npx playwright test tests/auto-deploy.spec.js
```

This will:
- Deploy the script to NetSuite
- Automatically detect if authentication is needed
- Prompt for 2FA if session expired
- Retry deployment after successful authentication
- Verify the Suitelet loads without errors
- Capture console logs and execution logs

**Advanced Options:**

Manual deployment (faster if already authenticated):
```bash
npx playwright test tests/deploy-script.spec.js --headed
```

Run with trace recording (for debugging):
```bash
npx playwright test tests/deploy-script.spec.js --headed --trace on
npx playwright show-trace test-results/*/trace.zip
```

Manual authentication only:
```bash
npx playwright test tests/netsuite-auth-setup.spec.js --headed
```
