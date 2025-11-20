/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log', 'N/runtime', 'N/email', 'N/url', 'N/render', 'N/file'],
    /**
     * @param {serverWidget} serverWidget
     * @param {search} search
     * @param {record} record
     * @param {redirect} redirect
     * @param {log} log
     * @param {runtime} runtime
     * @param {email} email
     * @param {url} url
     * @param {render} render
     * @param {file} file
     */
    function (serverWidget, search, record, redirect, log, runtime, email, url, render, file) {


        /**
         * Handles GET and POST requests to the Suitelet
         * @param {Object} context - NetSuite context object containing request/response
         */
        function onRequest(context) {
            if (context.request.method === 'GET') {
                handleGet(context);
            } else {
                handlePost(context);
            }
        }


        /**
   * Handles GET requests
   * @param {Object} context
   */
        function handleGet(context) {
            var request = context.request;
            var response = context.response;

            log.debug('GET Request', 'Parameters: ' + JSON.stringify(request.parameters));

            // Handle AJAX customer search
            if (request.parameters.action === 'searchCustomers') {
                handleCustomerSearch(context);
                return;
            }

            // Handle AJAX paid invoices request
            if (request.parameters.action === 'getPaidInvoices') {
                handlePaidInvoicesRequest(context);
                return;
            }

            // Handle get customer email request
            if (request.parameters.action === 'getCustomerEmail') {
                handleGetCustomerEmail(context);
                return;
            }

            // Handle send payment link action
            if (request.parameters.action === 'sendPaymentLink') {
                handleSendPaymentLink(context);
                return;
            }

            // Handle reverse chargeback action
            if (request.parameters.action === 'reverseChargeback') {
                handleReverseChargeback(context);
                return;
            }

            // Handle manual payment redirect
            if (request.parameters.action === 'manualPayment') {
                handleManualPaymentRedirect(context);
                return;
            }

            // Handle JE write-off action
            if (request.parameters.action === 'jeWriteOff') {
                handleJeWriteOff(context);
                return;
            }

            // Handle redirect to file upload page
            if (request.parameters.action === 'redirectToFileUpload') {
                handleRedirectToFileUpload(context);
                return;
            }

            // NEW: Handle mark dispute uploaded action
            if (request.parameters.action === 'markDisputeUploaded') {
                handleMarkDisputeUploaded(context);
                return;
            }

            // Create NetSuite form
            var form = serverWidget.createForm({
                title: 'Chargeback, NSF Check and Duplicate Refund Processing'
            });

            try {
                // Build the HTML content
                var htmlContent = buildPageHTML(context);

                // Add the HTML field to display the content
                var htmlField = form.addField({
                    id: 'custpage_content',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Content'
                });
                htmlField.defaultValue = htmlContent;

                // Add a refresh button
                form.addButton({
                    id: 'custpage_refresh',
                    label: 'Refresh',
                    functionName: 'refreshPage'
                });

            } catch (e) {
                log.error('Error in Chargeback/NSF Processing Suitelet', e.message + ' | Stack: ' + e.stack);
                var errorField = form.addField({
                    id: 'custpage_error',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Error'
                });
                errorField.defaultValue = '<div style="color: red;">Error loading page: ' + escapeHtml(e.message) + '</div>';
            }

            context.response.writePage(form);
        }

        /**
 * Redirects to the file upload Suitelet
 * @param {Object} context
 */
        function handleRedirectToFileUpload(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;
            var tranId = request.parameters.tranId;

            log.debug('Redirect to File Upload', {
                invoiceId: invoiceId,
                tranId: tranId
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Redirect to the file upload Suitelet
                // Assuming script ID is customscript_chargeback_file_upload and deployment is customdeploy1
                redirect.toSuitelet({
                    scriptId: 'customscript_chargeback_file_upload',
                    deploymentId: 'customdeploy1',
                    parameters: {
                        invoiceId: invoiceId,
                        tranId: tranId,
                        returnScript: runtime.getCurrentScript().id,
                        returnDeploy: runtime.getCurrentScript().deploymentId
                    }
                });

            } catch (e) {
                log.error('Redirect to File Upload Error', {
                    error: e.toString(),
                    stack: e.stack
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('File Upload Redirect Error: ' + e.toString())
                    }
                });
            }
        }


        /**
 * Handles manual payment redirect by creating payment URL with invoice parameters
 * @param {Object} context
 */
        function handleManualPaymentRedirect(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Manual Payment Redirect Request', 'Invoice ID: ' + invoiceId);

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice to get customer, subsidiary, and currency
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var customerId = invoiceRecord.getValue('entity');
                var subsidiary = invoiceRecord.getValue('subsidiary');
                var currency = invoiceRecord.getValue('currency');

                log.debug('Invoice Details Loaded', {
                    invoiceId: invoiceId,
                    customerId: customerId,
                    subsidiary: subsidiary,
                    currency: currency
                });

                // Build URL parameters matching NetSuite UI pattern
                var params = {
                    entity: customerId,
                    inv: invoiceId
                };

                // Add subsidiary if present
                if (subsidiary) {
                    params.subsidiary = subsidiary;
                }

                // Add currency if present
                if (currency) {
                    params.currency = currency;
                }

                // Create the payment form URL using the NetSuite UI pattern
                var paymentUrl = url.resolveRecord({
                    recordType: record.Type.CUSTOMER_PAYMENT,
                    params: params
                });

                log.debug('Payment URL Created', {
                    url: paymentUrl,
                    params: params
                });

                // Redirect to the payment form
                redirect.redirect({
                    url: paymentUrl
                });

            } catch (e) {
                log.error('Manual Payment Redirect Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                // Redirect back with error
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Manual Payment Error: ' + e.toString())
                    }
                });
            }
        }

        /**
  * Handles reversing a chargeback by creating a payment
  * @param {Object} context
  */
        function handleReverseChargeback(context) {
            var request = context.request;
            var response = context.response;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Reverse Chargeback Request', 'Invoice ID: ' + invoiceId);

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId
                });

                var customerId = invoiceRecord.getValue('entity');
                var customerName = invoiceRecord.getText('entity');
                var tranId = invoiceRecord.getValue('tranid');
                var amountDue = invoiceRecord.getValue('amountremainingapplied') || invoiceRecord.getValue('amountremaining');

                log.debug('Invoice Loaded', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    customerId: customerId,
                    customerName: customerName,
                    amountDue: amountDue
                });

                // Create customer payment
                var payment = record.transform({
                    fromType: record.Type.INVOICE,
                    fromId: invoiceId,
                    toType: record.Type.CUSTOMER_PAYMENT,
                    isDynamic: true
                });

                // Set payment method to ACCT'G (ID 15)
                payment.setValue({
                    fieldId: 'paymentmethod',
                    value: 15
                });

                // Set memo
                payment.setValue({
                    fieldId: 'memo',
                    value: 'CHARGEBACK REVERSAL'
                });

                // Set payment amount to the amount due
                payment.setValue({
                    fieldId: 'payment',
                    value: amountDue
                });

                log.debug('Payment Values Set', {
                    paymentMethod: 15,
                    amount: amountDue,
                    memo: 'CHARGEBACK REVERSAL'
                });

                // Apply to invoice - the transform should have already selected it
                // but we'll verify and set the amount
                var applyLineCount = payment.getLineCount({ sublistId: 'apply' });
                log.debug('Apply Lines', 'Count: ' + applyLineCount);

                for (var i = 0; i < applyLineCount; i++) {
                    var applyInvoiceId = payment.getSublistValue({
                        sublistId: 'apply',
                        fieldId: 'internalid',
                        line: i
                    });

                    if (applyInvoiceId == invoiceId) {
                        payment.selectLine({
                            sublistId: 'apply',
                            line: i
                        });
                        payment.setCurrentSublistValue({
                            sublistId: 'apply',
                            fieldId: 'apply',
                            value: true
                        });
                        payment.setCurrentSublistValue({
                            sublistId: 'apply',
                            fieldId: 'amount',
                            value: amountDue
                        });
                        payment.commitLine({ sublistId: 'apply' });
                        log.debug('Applied to Invoice', 'Line: ' + i + ' | Amount: ' + amountDue);
                        break;
                    }
                }

                var paymentId = payment.save();

                log.audit('Chargeback Reversed', {
                    paymentId: paymentId,
                    invoiceId: invoiceId,
                    tranId: tranId,
                    amount: amountDue
                });

                // Redirect back to suitelet with success parameters - include BOTH invoiceId and tranId
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        reverseSuccess: 'true',
                        customer: encodeURIComponent(customerName),
                        invoiceId: invoiceId,
                        invoice: tranId,
                        paymentId: paymentId,
                        amount: amountDue
                    }
                });

            } catch (e) {
                log.error('Reverse Chargeback Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                // Redirect back with error
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Reverse Chargeback Error: ' + e.toString())
                    }
                });
            }
        }

        /**
        * Handles getting customer email from invoice
        * @param {Object} context
        */
        function handleGetCustomerEmail(context) {
            var request = context.request;
            var response = context.response;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Get Customer Email Request', 'Invoice ID: ' + invoiceId);

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId
                });

                var customerId = invoiceRecord.getValue('entity');

                // Load customer to get email
                var customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId
                });

                var customerEmail = customerRecord.getValue('email') || '';

                log.debug('Customer Email Retrieved', {
                    customerId: customerId,
                    email: customerEmail
                });

                response.write(JSON.stringify({
                    success: true,
                    email: customerEmail
                }));

            } catch (e) {
                log.error('Get Customer Email Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });
                response.write(JSON.stringify({
                    success: false,
                    error: e.toString(),
                    email: ''
                }));
            }
        }

        /**
    * Handles sending payment link email
    * @param {Object} context
    */
        function handleSendPaymentLink(context) {
            var request = context.request;
            var response = context.response;
            var invoiceId = request.parameters.invoiceId;
            var overrideEmail = request.parameters.overrideEmail;
            var customerEmail = request.parameters.customerEmail;

            log.debug('Send Payment Link Request', 'Invoice ID: ' + invoiceId + ' | Override Email: ' + overrideEmail + ' | Customer Email: ' + customerEmail);

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId
                });

                var customerId = invoiceRecord.getValue('entity');
                var tranId = invoiceRecord.getValue('tranid');
                var paymentLink = invoiceRecord.getValue('custbody_b4cp_latest_pay_online_link');

                log.debug('Invoice Loaded', {
                    customerId: customerId,
                    tranId: tranId,
                    paymentLink: paymentLink
                });

                // Load customer to get email
                var customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId
                });

                var customerEmailFromRecord = customerRecord.getValue('email');

                // Determine if user changed the email
                var isOverride = overrideEmail && overrideEmail !== customerEmailFromRecord;

                // Use override email if provided and different from customer email, otherwise use customer email
                var recipientEmail = isOverride ? overrideEmail : customerEmailFromRecord;

                if (!recipientEmail) {
                    throw new Error('No email address available. Customer does not have an email address and no override was provided.');
                }

                // Get current user email for CC
                var currentUser = runtime.getCurrentUser();
                var currentUserEmail = currentUser.email;

                log.debug('Email Recipients', {
                    recipient: recipientEmail,
                    cc: currentUserEmail,
                    isOverride: isOverride,
                    customerEmail: customerEmailFromRecord
                });

                // Build email body with HTML formatting
                var emailBody = '<html><body style="font-family: Arial, sans-serif; line-height: 1.6;">';
                emailBody += '<p>Hello,</p>';
                emailBody += '<p>Please see attached invoice ' + tranId + ' from Bray and Scarff which is generated to re-accept payment on funds that were previously rejected by the bank.</p>';
                emailBody += '<h3 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 5px;">Convenient Online Payment</h3>';
                emailBody += '<p>You can pay your account balance online using the following secure link:</p>';

                if (paymentLink) {
                    emailBody += '<p><a href="' + paymentLink + '" style="color: #4CAF50; font-weight: bold; text-decoration: none;">ePay Payment Link</a></p>';
                } else {
                    emailBody += '<p style="color: #999;">[Payment link not available]</p>';
                }

                emailBody += '<h3 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; margin-top: 20px;">Phone Payment Option</h3>';
                emailBody += '<p>Call our Laurel location at <strong>(301) 470-3555</strong> to process a payment or with payment questions.</p>';
                emailBody += '<h3 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; margin-top: 20px;">Mail Check Payments To</h3>';
                emailBody += '<p style="margin-bottom: 5px;"><strong>Bray and Scarff Inc</strong><br>';
                emailBody += 'P.O. Box 748855<br>';
                emailBody += 'Atlanta, GA 30374</p>';
                emailBody += '<p style="margin-top: 30px;">We appreciate your business.</p>';
                emailBody += '<p style="color: #666;"><em>Bray and Scarff Accounting Department</em></p>';
                emailBody += '</body></html>';

                // Generate invoice PDF
                var invoicePdf = render.transaction({
                    entityId: parseInt(invoiceId),
                    printMode: render.PrintMode.PDF
                });

                // Create email configuration
                var emailConfig = {
                    author: 151135,
                    recipients: recipientEmail,
                    subject: 'Bray and Scarff Open Invoice - ' + tranId,
                    body: emailBody,
                    attachments: [invoicePdf]
                };

                // Add CC if current user email exists
                if (currentUserEmail) {
                    emailConfig.cc = [currentUserEmail];
                }

                // Attach to both customer record and invoice transaction when not overridden
                if (!isOverride) {
                    emailConfig.relatedRecords = {
                        entityId: customerId,           // Attaches to customer Messages tab
                        transactionId: invoiceId        // Attaches to invoice Messages tab
                    };
                }

                // Send email
                email.send(emailConfig);

                log.audit('Payment Link Email Sent', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    recipient: recipientEmail,
                    cc: currentUserEmail,
                    isOverride: isOverride,
                    attachedToCustomer: !isOverride,
                    attachedToInvoice: !isOverride
                });

                response.write(JSON.stringify({
                    success: true,
                    message: 'Payment link email sent successfully to ' + recipientEmail +
                        (currentUserEmail ? ' (copy sent to ' + currentUserEmail + ')' : '') +
                        (!isOverride ? ' and attached to customer record and invoice ' + tranId : '')
                }));

            } catch (e) {
                log.error('Send Payment Link Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });
                response.write(JSON.stringify({
                    success: false,
                    error: e.toString()
                }));
            }
        }

        /**
   * Handles AJAX request for paid invoices, unapplied deposits, AND customer refunds
   * @param {Object} context
   */
        function handlePaidInvoicesRequest(context) {
            var request = context.request;
            var response = context.response;
            var customerId = request.parameters.customerId;

            log.debug('Customer Transaction Request', 'Customer ID: ' + customerId);

            try {
                var invoices = searchPaidInvoices(customerId);
                var deposits = searchUnappliedDeposits(customerId);
                var refunds = searchCustomerRefunds(customerId); // NEW

                response.write(JSON.stringify({
                    invoices: invoices,
                    deposits: deposits,
                    refunds: refunds // NEW
                }));
            } catch (e) {
                log.error('Transaction Search Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);
                response.write(JSON.stringify({ error: e.toString() }));
            }
        }

        /**
 * NEW: Searches for customer refunds for a specific customer
 * @param {string} customerId - Customer internal ID
 * @returns {Array} Array of refund objects
 */
        function searchCustomerRefunds(customerId) {
            if (!customerId) {
                return [];
            }

            log.debug('Searching Customer Refunds', 'Customer ID: ' + customerId);

            var refundSearch = search.create({
                type: search.Type.CUSTOMER_REFUND,
                filters: [
                    ['entity', 'anyof', customerId],
                    'AND',
                    ['mainline', 'is', 'T']
                    // REMOVED: The type filter - it's redundant when using search.Type.CUSTOMER_REFUND
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'trandate' }),
                    search.createColumn({ name: 'total' }),
                    search.createColumn({ name: 'memo' }),
                    search.createColumn({ name: 'status' })
                ]
            });

            var results = [];
            var resultCount = 0;
            refundSearch.run().each(function (result) {
                resultCount++;
                log.debug('Refund Found', {
                    id: result.id,
                    tranid: result.getValue('tranid'),
                    customer: result.getText('entity'),
                    amount: result.getValue('total')
                });

                results.push({
                    id: result.id,
                    tranid: result.getValue('tranid'),
                    date: result.getValue('trandate'),
                    amount: result.getValue('total'),
                    memo: result.getValue('memo') || '',
                    status: result.getText('status')
                });

                return results.length < 1000; // Limit results
            });

            log.debug('Customer Refunds Search Complete', {
                customerId: customerId,
                totalFound: resultCount,
                resultsReturned: results.length
            });

            log.debug('Customer Refunds Found', 'Count: ' + results.length);
            return results;
        }

        /**
         * Handles AJAX customer search requests
         * @param {Object} context
         */
        function handleCustomerSearch(context) {
            var request = context.request;
            var response = context.response;
            var query = request.parameters.query || '';

            log.debug('Customer Search', 'Query: ' + query);

            try {
                var customers = searchCustomers(query);
                response.write(JSON.stringify(customers));
            } catch (e) {
                log.error('Customer Search Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);
                response.write(JSON.stringify({ error: e.toString() }));
            }
        }

        /**
         * Searches for customers matching the query
         * @param {string} query - Search query
         * @returns {Array} Array of customer objects
         */
        function searchCustomers(query) {
            if (!query || query.length < 2) {
                return [];
            }

            var customerSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['entityid', 'contains', query],
                    'OR',
                    ['altname', 'contains', query],
                    'OR',
                    ['companyname', 'contains', query]
                ],
                columns: [
                    'entityid',
                    'altname',
                    'companyname'
                ]
            });

            var results = [];
            customerSearch.run().each(function (result) {
                var entityId = result.getValue('entityid') || '';
                var altName = result.getValue('altname') || '';
                var companyName = result.getValue('companyname') || '';

                var displayName = entityId;
                if (companyName) {
                    displayName = entityId + ' ' + companyName;
                } else if (altName) {
                    displayName = entityId + ' ' + altName;
                }

                results.push({
                    id: result.id,
                    text: displayName
                });

                return results.length < 50;
            });

            log.debug('Customer Search Results', 'Found ' + results.length + ' customers for query: ' + query);
            return results;
        }

        /**
  * Searches for paid invoices for a specific customer
  * UPDATED to include chargeback checkbox values with enhanced logging
  * @param {string} customerId - Customer internal ID
  * @returns {Array} Array of invoice objects
  */
        function searchPaidInvoices(customerId) {
            if (!customerId) {
                return [];
            }

            log.debug('Searching Paid Invoices', 'Customer ID: ' + customerId);

            var invoiceSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['entity', 'anyof', customerId],
                    'AND',
                    ['status', 'anyof', 'CustInvc:B'], // Fully Paid status
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'trandate' }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'memo' }),
                    search.createColumn({ name: 'custbody_bas_cc_dispute' }), // Credit card dispute checkbox
                    search.createColumn({ name: 'custbody_bas_fraud' }) // Fraud checkbox
                ]
            });

            var results = [];
            invoiceSearch.run().each(function (result) {
                var disputeValue = result.getValue('custbody_bas_cc_dispute');
                var fraudValue = result.getValue('custbody_bas_fraud');

                log.debug('Invoice Checkbox Values', {
                    tranid: result.getValue('tranid'),
                    disputeRaw: disputeValue,
                    fraudRaw: fraudValue,
                    disputeType: typeof disputeValue,
                    fraudType: typeof fraudValue
                });

                results.push({
                    id: result.id,
                    tranid: result.getValue('tranid'),
                    date: result.getValue('trandate'),
                    amount: result.getValue('amount'),
                    memo: result.getValue('memo') || '',
                    hasDisputeChargeback: disputeValue === 'T' || disputeValue === true,
                    hasFraudChargeback: fraudValue === 'T' || fraudValue === true
                });

                return results.length < 1000; // Limit results
            });

            log.debug('Paid Invoices Found', {
                count: results.length,
                sampleResult: results.length > 0 ? {
                    tranid: results[0].tranid,
                    hasDispute: results[0].hasDisputeChargeback,
                    hasFraud: results[0].hasFraudChargeback
                } : 'No results'
            });

            return results;
        }

        /**
  * Searches for unapplied customer deposits for a specific customer
  * FIXED: Use amountunapplied field instead of amountremaining
  * @param {string} customerId - Customer internal ID
  * @returns {Array} Array of deposit objects with unapplied amounts
  */
        /**
  * Searches for unapplied customer deposits for a specific customer
  * Uses transaction join to find applying transactions and calculate unapplied amounts
  * @param {string} customerId - Customer internal ID
  * @returns {Array} Array of deposit objects with unapplied amounts
  */
        function searchUnappliedDeposits(customerId) {
            if (!customerId) {
                log.debug('searchUnappliedDeposits', 'No customer ID provided');
                return [];
            }

            log.debug('Searching Unapplied Deposits - START', 'Customer ID: ' + customerId);

            // First, get all customer deposits for this customer
            var depositSearch = search.create({
                type: search.Type.CUSTOMER_DEPOSIT,
                filters: [
                    ['entity', 'anyof', customerId],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'internalid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'trandate' }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'memo' }),
                    search.createColumn({ name: 'status' }),
                    search.createColumn({ name: 'salesorder' })
                ]
            });

            var deposits = {};

            depositSearch.run().each(function (res) {
                var depositId = res.id;
                var totalAmount = parseFloat(res.getValue('amount')) || 0;

                deposits[depositId] = {
                    id: depositId,
                    tranid: res.getValue('tranid'),
                    date: res.getValue('trandate'),
                    totalAmount: totalAmount,
                    appliedAmount: 0, // Will be calculated
                    salesOrder: res.getText('salesorder') || '',
                    salesOrderId: res.getValue('salesorder'),
                    memo: res.getValue('memo') || '',
                    status: res.getText('status')
                };

                return true;
            });

            log.debug('Customer Deposits Found', 'Count: ' + Object.keys(deposits).length);

            if (Object.keys(deposits).length === 0) {
                return [];
            }

            // Now search for applying transactions to these deposits
            var applyingSearch = search.create({
                type: search.Type.TRANSACTION,
                filters: [
                    ['appliedtotransaction.internalid', 'anyof', Object.keys(deposits)],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'internalid', join: 'appliedToTransaction' }),
                    search.createColumn({ name: 'amount' })
                ]
            });

            applyingSearch.run().each(function (res) {
                var depositId = res.getValue({ name: 'internalid', join: 'appliedToTransaction' });
                var appliedAmount = parseFloat(res.getValue('amount')) || 0;

                if (deposits[depositId]) {
                    deposits[depositId].appliedAmount += Math.abs(appliedAmount);
                }

                return true;
            });

            log.debug('Applied Amounts Calculated', 'Deposit count: ' + Object.keys(deposits).length);

            // Build results array with only deposits that have unapplied amounts
            var results = [];

            for (var depositId in deposits) {
                if (deposits.hasOwnProperty(depositId)) {
                    var dep = deposits[depositId];
                    var amountUnapplied = dep.totalAmount - dep.appliedAmount;

                    log.debug('Deposit Calculation', {
                        depositId: depositId,
                        tranid: dep.tranid,
                        totalAmount: dep.totalAmount,
                        appliedAmount: dep.appliedAmount,
                        amountUnapplied: amountUnapplied,
                        status: dep.status
                    });

                    // Only include deposits with unapplied amounts > $0.01
                    if (amountUnapplied > 0.01) {
                        results.push({
                            id: dep.id,
                            tranid: dep.tranid,
                            date: dep.date,
                            amountRemaining: amountUnapplied,
                            totalAmount: dep.totalAmount,
                            salesOrder: dep.salesOrder,
                            salesOrderId: dep.salesOrderId,
                            memo: dep.memo,
                            status: dep.status
                        });
                    }
                }
            }

            log.debug('Unapplied Deposits Found (Final)', {
                count: results.length,
                sampleResult: results.length > 0 ? {
                    tranid: results[0].tranid,
                    amountUnapplied: results[0].amountRemaining,
                    totalAmount: results[0].totalAmount,
                    status: results[0].status
                } : 'No results'
            });

            return results;
        }

        /**
  * Builds the main page HTML content
  * @param {Object} context - Request context
  * @returns {string} HTML content
  */
        function buildPageHTML(context) {
            var params = context.request.parameters;
            var scriptUrl = runtime.getCurrentScript().deploymentId ?
                '/app/site/hosting/scriptlet.nl?script=' + runtime.getCurrentScript().id +
                '&deploy=' + runtime.getCurrentScript().deploymentId : '';

            var html = '<style>' + getStyles() + '</style>';
            html += '<script>' + getJavaScript(scriptUrl) + '</script>';
            html += '<div id="loadingOverlay" class="loading-overlay">' +
                '<div class="loading-content">' +
                '<div class="loading-spinner"></div>' +
                '<div id="loadingText" class="loading-text">Processing...</div>' +
                '</div>' +
                '</div>';
            html += '<div class="chargeback-container">';

            // Success messages
            if (params.success === 'true') {
                html += buildSuccessMessage(params);
            }

            if (params.reverseSuccess === 'true') {
                html += buildReverseSuccessMessage(params);
            }

            if (params.writeOffSuccess === 'true') {
                html += buildWriteOffSuccessMessage(params);
            }

            if (params.uploadSuccess === 'true') {
                var fileName = decodeURIComponent(params.fileName || 'file');
                var invoiceTranId = params.invoice || '';
                html += '<div class="success-msg">';
                html += '<strong>File Uploaded Successfully</strong><br>';
                html += 'File: ' + escapeHtml(fileName) + '<br>';
                html += 'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + params.invoiceId + '" target="_blank">' + escapeHtml(invoiceTranId) + '</a>';
                html += '</div>';
            }

            if (params.disputeMarkedSuccess === 'true') {
                var customer = decodeURIComponent(params.customer || 'Customer');
                var invoiceTranId = params.invoice || '';
                var caseNumber = params.disputeCaseNumber ? decodeURIComponent(params.disputeCaseNumber) : '';
                html += '<div class="success-msg">';
                html += '<strong>Dispute Files Marked as Uploaded for ' + escapeHtml(customer) + '</strong><br>';
                html += 'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + params.invoiceId + '" target="_blank">' + escapeHtml(invoiceTranId) + '</a><br>';
                if (caseNumber) {
                    html += 'Dispute Case #: ' + escapeHtml(caseNumber) + '<br>';
                }
                html += 'This invoice will no longer appear in the Dispute Submissions list.';
                html += '</div>';
            }

            if (params.depositRefundSuccess === 'true') {
                html += buildDepositRefundSuccessMessage(params);
            }

            // NEW: Duplicate refund success message
            if (params.duplicateRefundSuccess === 'true') {
                html += buildDuplicateRefundSuccessMessage(params);
            }

            if (params.error) {
                html += '<div class="error-msg">' + escapeHtml(decodeURIComponent(params.error)) + '</div>';
            }

            // Customer search section
            html += '<div class="search-title">Search Customer Transactions</div>';
            html += '<div class="search-container">';
            html += '<input type="text" id="customerSearch" placeholder="Search by customer name or ID..." style="width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px;" />';
            html += '<input type="hidden" id="selectedCustomerId" />';
            html += '<div id="searchResults" class="search-results"></div>';
            html += '</div>';
            html += '<div id="invoiceResults"></div>';

            // Chargeback Dispute Submissions section
            html += '<div class="search-title" style="margin-top: 30px;">Chargeback Dispute Submissions</div>';
            html += '<div class="search-count">Credit card chargebacks and duplicate refunds pending dispute file attachments</div>';
            html += buildDisputeSubmissionsTable();

            // Global chargeback tracking section
            html += '<div class="search-title" style="margin-top: 30px;">Open Chargeback & NSF Invoices - All Customers</div>';
            html += '<div class="search-count">All customers with open chargeback or NSF check invoices</div>';
            html += buildGlobalTrackingTable();

            html += '</div>';

            return html;
        }

        /**
 * NEW: Builds success message for duplicate refund processing
 */
        function buildDuplicateRefundSuccessMessage(params) {
            var type = params.type || 'chargeback';
            var customer = decodeURIComponent(params.customer || 'Customer');
            var creditMemoId = params.creditMemoId || '';
            var creditMemoTranId = params.creditMemoTranId || creditMemoId; // NEW: Use tranid, fallback to ID
            var refundId = params.refundId || '';
            var refundTranId = params.refundTranId || refundId; // NEW: Use tranid, fallback to ID
            var newInvoiceId = params.newInvoiceId || '';
            var newInvoiceTranId = params.newInvoiceTranId || newInvoiceId; // NEW: Use tranid, fallback to ID
            var amount = params.amount || '0.00';

            var typeText = type === 'freedompay' ? 'Duplicate FreedomPay Refund' : 'Duplicate Chargeback Refund';

            var html = '<div class="success-msg">';
            html += '<strong>' + typeText + ' Processed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Credit Memo: <a href="/app/accounting/transactions/custcred.nl?id=' + creditMemoId + '" target="_blank">' + escapeHtml(creditMemoTranId) + '</a><br>';
            html += 'Customer Refund: <a href="/app/accounting/transactions/custrfnd.nl?id=' + refundId + '" target="_blank">' + escapeHtml(refundTranId) + '</a><br>';
            html += 'New Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + newInvoiceId + '" target="_blank">' + escapeHtml(newInvoiceTranId) + '</a><br>';
            html += 'Amount: $' + parseFloat(amount).toFixed(2);
            html += '</div>';

            return html;
        }

        function buildDepositRefundSuccessMessage(params) {
            var type = params.type || 'chargeback';
            var customer = decodeURIComponent(params.customer || 'Customer');
            var refundId = params.refundId || '';
            var refundTranId = params.refundTranId || refundId;  // UPDATED: Use tranid, fallback to ID
            var depositId = params.depositId || '';
            var depositTranId = params.depositTranId || depositId;  // UPDATED: Use tranid, fallback to ID
            var amount = params.amount || '0.00';

            var typeText = type === 'nsf' ? 'NSF Check' : (type === 'fraud' ? 'Fraud Chargeback' : 'Dispute Chargeback');

            var html = '<div class="success-msg">';
            html += '<strong>' + typeText + ' Deposit Refund Processed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Customer Refund: <a href="/app/accounting/transactions/custrfnd.nl?id=' + refundId + '" target="_blank">' + escapeHtml(refundTranId) + '</a><br>';  // UPDATED: Show tranid
            html += 'Original Deposit: <a href="/app/accounting/transactions/custdep.nl?id=' + depositId + '" target="_blank">' + escapeHtml(depositTranId) + '</a><br>';  // UPDATED: Show tranid
            html += 'Amount Refunded: $' + parseFloat(amount).toFixed(2);
            html += '</div>';

            return html;
        }

        /**
   * Handles marking dispute files as uploaded by updating invoice checkbox and memo
   * @param {Object} context
   */
        function handleMarkDisputeUploaded(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;
            var tranId = request.parameters.tranId;
            var disputeCaseNumber = request.parameters.disputeCaseNumber; // NEW: Get case number from URL

            log.debug('Mark Dispute Uploaded Request', {
                invoiceId: invoiceId,
                tranId: tranId,
                disputeCaseNumber: disputeCaseNumber
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // NEW: Validate that dispute case number was provided
                if (!disputeCaseNumber || disputeCaseNumber.trim() === '') {
                    throw new Error('Dispute Case Number is required');
                }

                // Load invoice to get current memo and customer name
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var existingMemo = invoiceRecord.getValue('memo') || '';
                var customerName = invoiceRecord.getText('entity');

                // Build the new memo text with dispute case number
                var newMemoText = 'Dispute Files Uploaded - Case #' + disputeCaseNumber.trim();

                // Append to existing memo with hyphen separator if memo exists
                var updateMemo = existingMemo ? existingMemo + ' - ' + newMemoText : newMemoText;

                // Update both memo and checkbox using submitFields for efficiency
                record.submitFields({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    values: {
                        memo: updateMemo,
                        custbody_chargeback_dispute_submitted: true // Set the checkbox
                    }
                });

                log.audit('Dispute Upload Marked Complete', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    disputeCaseNumber: disputeCaseNumber,
                    existingMemo: existingMemo,
                    newMemo: updateMemo,
                    checkboxSet: true
                });

                // Redirect back with success message
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        disputeMarkedSuccess: 'true',
                        customer: encodeURIComponent(customerName),
                        invoiceId: invoiceId,
                        invoice: tranId,
                        disputeCaseNumber: encodeURIComponent(disputeCaseNumber)
                    }
                });

            } catch (e) {
                log.error('Mark Dispute Uploaded Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Mark Dispute Uploaded Error: ' + e.toString())
                    }
                });
            }
        }

        /**
         * Builds the dispute submissions table for chargebacks missing dispute files
         * @returns {string} HTML table
         */
        function buildDisputeSubmissionsTable() {
            try {
                var invoices = searchChargebacksNeedingDisputeFiles();

                if (invoices.length === 0) {
                    return '<div class="search-count">No chargebacks pending dispute file attachments</div>';
                }

                var html = '<div class="search-count">Results: ' + invoices.length + '</div>';
                html += '<table class="search-table">';
                html += '<thead><tr>';
                html += '<th>Customer</th>';
                html += '<th>Invoice #</th>';
                html += '<th>Date Created</th>';
                html += '<th>Amount</th>';
                html += '<th>Type</th>';
                html += '<th>Status</th>';
                html += '<th>Memo</th>';
                html += '<th>Attachments</th>';
                html += '<th>Action</th>';
                html += '</tr></thead><tbody>';

                for (var i = 0; i < invoices.length; i++) {
                    var inv = invoices[i];
                    html += '<tr>';
                    html += '<td>' + escapeHtml(inv.customer) + '</td>';
                    html += '<td><a href="/app/accounting/transactions/custinvc.nl?id=' + inv.id + '" target="_blank">' + escapeHtml(inv.tranid) + '</a></td>';
                    html += '<td>' + escapeHtml(inv.dateCreated) + '</td>';
                    html += '<td>$' + parseFloat(inv.amount).toFixed(2) + '</td>';
                    html += '<td>' + escapeHtml(inv.type) + '</td>';
                    html += '<td>' + escapeHtml(inv.status) + '</td>';

                    // Memo column
                    html += '<td style="font-size: 11px;">' + escapeHtml(inv.memo || '') + '</td>';

                    // Attachments column - show file names with links
                    html += '<td style="font-size: 11px;">';
                    if (inv.attachments && inv.attachments.length > 0) {
                        for (var a = 0; a < inv.attachments.length; a++) {
                            var att = inv.attachments[a];
                            html += '<div style="margin-bottom: 4px;">';
                            html += '<a href="/core/media/media.nl?id=' + att.id + '" target="_blank" style="color: #0066cc;">';
                            html += escapeHtml(att.name);
                            html += '</a>';
                            html += '</div>';
                        }
                    } else {
                        html += '<span style="color: #999; font-style: italic;">No files attached</span>';
                    }
                    html += '</td>';

                    html += '<td class="action-cell">';
                    html += '<button type="button" class="action-btn payment-link-btn" onclick="uploadDisputeFile(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Upload Dispute File</button>';
                    html += '<button type="button" class="action-btn writeoff-btn" onclick="markDisputeUploaded(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Finished Uploading</button>';
                    html += '</td>';
                    html += '</tr>';
                }

                html += '</tbody></table>';
                return html;
            } catch (e) {
                log.error('Dispute Submissions Table Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);
                return '<div class="error-msg">Error loading dispute submissions data: ' + escapeHtml(e.toString()) + '</div>';
            }
        }

        /**
         * Searches for chargebacks (dispute and fraud) that need dispute file attachments
         * @returns {Array} Array of invoice objects with attachment info
         */
        function searchChargebacksNeedingDisputeFiles() {
            log.debug('Searching Chargebacks Needing Dispute Files', 'Items: 304416 (CC Dispute), 304429 (Fraud)');

            var invoiceSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['mainline', 'is', 'F'], // Search line level for items
                    'AND',
                    ['item', 'anyof', ['304416', '304429']], // Credit Card Chargeback and Fraud items
                    'AND',
                    ['custbody_chargeback_dispute_submitted', 'is', 'F'] // Only show invoices where checkbox is NOT checked
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'entity' }),
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'amount' }), // Line amount
                    search.createColumn({ name: 'formulacurrency', formula: '{amount}', label: 'Total Amount' }), // Header amount
                    search.createColumn({ name: 'status' }),
                    search.createColumn({ name: 'memo' }), // Header memo (for display only)
                    search.createColumn({ name: 'custbody_chargeback_dispute_submitted' }), // Checkbox status
                    search.createColumn({ name: 'internalid', join: 'file' }),
                    search.createColumn({ name: 'name', join: 'file' })
                ]
            });

            var results = [];
            var invoiceData = {}; // Store unique invoices
            var invoiceFiles = {}; // Store files per invoice

            invoiceSearch.run().each(function (result) {
                var invoiceId = result.id;

                // Collect invoice header data (only once per invoice)
                if (!invoiceData[invoiceId]) {
                    invoiceData[invoiceId] = {
                        id: invoiceId,
                        tranid: result.getValue('tranid'),
                        customer: result.getText('entity'),
                        dateCreated: result.getValue('datecreated'),
                        amount: result.getValue({ name: 'formulacurrency', formula: '{amount}' }),
                        status: result.getText('status'),
                        memo: result.getValue('memo') || '', // Memo for display
                        type: 'Credit Card Chargeback' // Will be refined if we find specific item
                    };
                }

                // Collect file attachments
                if (!invoiceFiles[invoiceId]) {
                    invoiceFiles[invoiceId] = [];
                }

                var fileId = result.getValue({ name: 'internalid', join: 'file' });
                var fileName = result.getValue({ name: 'name', join: 'file' }) || '';

                if (fileName && fileId) {
                    // Avoid duplicate files
                    var fileExists = false;
                    for (var f = 0; f < invoiceFiles[invoiceId].length; f++) {
                        if (invoiceFiles[invoiceId][f].id === fileId) {
                            fileExists = true;
                            break;
                        }
                    }
                    if (!fileExists) {
                        invoiceFiles[invoiceId].push({
                            id: fileId,
                            name: fileName
                        });
                    }
                }

                return true;
            });

            // Determine chargeback type for each invoice
            for (var invoiceId in invoiceData) {
                if (invoiceData.hasOwnProperty(invoiceId)) {
                    var itemType = getChargebackTypeFromInvoice(invoiceId);
                    invoiceData[invoiceId].type = itemType;

                    results.push({
                        id: invoiceData[invoiceId].id,
                        tranid: invoiceData[invoiceId].tranid,
                        customer: invoiceData[invoiceId].customer,
                        dateCreated: invoiceData[invoiceId].dateCreated,
                        amount: invoiceData[invoiceId].amount,
                        type: invoiceData[invoiceId].type,
                        status: invoiceData[invoiceId].status,
                        memo: invoiceData[invoiceData].memo,
                        attachments: invoiceFiles[invoiceId] || []
                    });
                }
            }

            log.debug('Chargebacks Needing Dispute Files Found', 'Count: ' + results.length);
            return results;
        }

        /**
 * Helper function to determine chargeback type from invoice items
 * UPDATED to include Duplicate FreedomPay item
 * @param {string} invoiceId - Invoice internal ID
 * @returns {string} Chargeback type
 */
        function getChargebackTypeFromInvoice(invoiceId) {
            try {
                var itemSearch = search.create({
                    type: search.Type.INVOICE,
                    filters: [
                        ['internalid', 'anyof', invoiceId],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['item', 'anyof', ['304416', '304429', '304779']] // UPDATED: Added 304779
                    ],
                    columns: ['item']
                });

                var chargebackType = 'Credit Card Chargeback';

                itemSearch.run().each(function (result) {
                    var itemId = result.getValue('item');
                    if (itemId === '304429') {
                        chargebackType = 'Fraud Chargeback';
                        return false;
                    } else if (itemId === '304779') {
                        chargebackType = 'Duplicate FreedomPay Refund';
                        return false;
                    } else if (itemId === '304416') {
                        chargebackType = 'Dispute Chargeback';
                    }
                    return true;
                });

                return chargebackType;

            } catch (e) {
                log.error('Error getting chargeback type', {
                    error: e.toString(),
                    invoiceId: invoiceId
                });
                return 'Unknown Chargeback';
            }
        }


        /**
  * Searches for chargebacks (dispute and fraud) that need dispute file attachments
  * UPDATED to include item 304779 (Duplicate FreedomPay Refund in Error)
  * @returns {Array} Array of invoice objects with attachment info
  */
        function searchChargebacksNeedingDisputeFiles() {
            log.debug('Searching Chargebacks Needing Dispute Files', 'Items: 304416 (CC Dispute), 304429 (Fraud), 304779 (Dup FreedomPay)');

            // STEP 1: Search for invoices with the chargeback items (line level search)
            var itemSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['mainline', 'is', 'F'], // Line level
                    'AND',
                    ['item', 'anyof', ['304416', '304429', '304779']] // UPDATED: Added 304779
                ],
                columns: [
                    'internalid'
                ]
            });

            // Collect unique invoice IDs
            var invoiceIds = [];
            var invoiceIdMap = {};

            itemSearch.run().each(function (result) {
                var invoiceId = result.id;
                if (!invoiceIdMap[invoiceId]) {
                    invoiceIds.push(invoiceId);
                    invoiceIdMap[invoiceId] = true;
                }
                return true;
            });

            log.debug('Found invoices with chargeback items', 'Count: ' + invoiceIds.length);

            if (invoiceIds.length === 0) {
                return [];
            }

            // STEP 2: Now search at header level for these specific invoices
            var headerSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['internalid', 'anyof', invoiceIds],
                    'AND',
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['custbody_chargeback_dispute_submitted', 'is', 'F']
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'entity' }),
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'status' }),
                    search.createColumn({ name: 'memo' }),
                    search.createColumn({ name: 'custbody_chargeback_dispute_submitted' })
                ]
            });

            var invoiceData = {};

            headerSearch.run().each(function (result) {
                var invoiceId = result.id;

                invoiceData[invoiceId] = {
                    id: invoiceId,
                    tranid: result.getValue('tranid'),
                    customer: result.getText('entity'),
                    dateCreated: result.getValue('datecreated'),
                    amount: result.getValue('amount'),
                    status: result.getText('status'),
                    memo: result.getValue('memo') || '',
                    checkboxValue: result.getValue('custbody_chargeback_dispute_submitted'),
                    type: 'Credit Card Chargeback'
                };

                return true;
            });

            log.debug('Header search results', {
                totalInvoicesWithItems: invoiceIds.length,
                afterCheckboxFilter: Object.keys(invoiceData).length
            });

            // STEP 3: Get file attachments
            if (Object.keys(invoiceData).length === 0) {
                return [];
            }

            var filteredInvoiceIds = Object.keys(invoiceData);

            var fileSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['internalid', 'anyof', filteredInvoiceIds],
                    'AND',
                    ['mainline', 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'internalid', join: 'file' }),
                    search.createColumn({ name: 'name', join: 'file' })
                ]
            });

            var invoiceFiles = {};

            fileSearch.run().each(function (result) {
                var invoiceId = result.id;

                if (!invoiceFiles[invoiceId]) {
                    invoiceFiles[invoiceId] = [];
                }

                var fileId = result.getValue({ name: 'internalid', join: 'file' });
                var fileName = result.getValue({ name: 'name', join: 'file' });

                if (fileId && fileName) {
                    var fileExists = false;
                    for (var f = 0; f < invoiceFiles[invoiceId].length; f++) {
                        if (invoiceFiles[invoiceId][f].id === fileId) {
                            fileExists = true;
                            break;
                        }
                    }
                    if (!fileExists) {
                        invoiceFiles[invoiceId].push({
                            id: fileId,
                            name: fileName
                        });
                    }
                }

                return true;
            });

            // STEP 4: Determine chargeback type and build results
            var results = [];

            for (var invoiceId in invoiceData) {
                if (invoiceData.hasOwnProperty(invoiceId)) {
                    var itemType = getChargebackTypeFromInvoice(invoiceId);

                    results.push({
                        id: invoiceData[invoiceId].id,
                        tranid: invoiceData[invoiceId].tranid,
                        customer: invoiceData[invoiceId].customer,
                        dateCreated: invoiceData[invoiceId].dateCreated,
                        amount: invoiceData[invoiceId].amount,
                        type: itemType,
                        status: invoiceData[invoiceId].status,
                        memo: invoiceData[invoiceId].memo,
                        checkboxValue: invoiceData[invoiceId].checkboxValue,
                        attachments: invoiceFiles[invoiceId] || []
                    });
                }
            }

            log.debug('Final Results', {
                count: results.length
            });

            return results;
        }

        /**
  * Builds success message HTML for JE write-off
  * @param {Object} params - URL parameters
  * @returns {string} HTML content
  */
        function buildWriteOffSuccessMessage(params) {
            var customer = decodeURIComponent(params.customer || 'Customer');
            var invoiceId = params.invoiceId || '';
            var invoiceTranId = params.invoice || '';
            var jeId = params.jeId || '';
            var jeTranId = params.jeTranId || '';
            var amount = params.amount || '0.00';

            var html = '<div class="success-msg">';
            html += '<strong>JE Write-Off Completed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + invoiceId + '" target="_blank">' + escapeHtml(invoiceTranId) + '</a><br>';
            html += 'Journal Entry: <a href="/app/accounting/transactions/journal.nl?id=' + jeId + '" target="_blank">' + escapeHtml(jeTranId) + '</a><br>';
            html += 'Amount Written Off: $' + parseFloat(amount).toFixed(2) + '<br>';
            html += 'Status: Journal Entry created and applied to invoice';
            html += '</div>';

            return html;
        }

        /**
         * Builds success message HTML for reverse chargeback
         * @param {Object} params - URL parameters
         * @returns {string} HTML content
         */
        function buildReverseSuccessMessage(params) {
            var customer = decodeURIComponent(params.customer || 'Customer');
            var invoiceId = params.invoiceId || '';
            var invoiceTranId = params.invoice || '';
            var paymentId = params.paymentId || '';
            var amount = params.amount || '0.00';

            var html = '<div class="success-msg">';
            html += '<strong>Chargeback Reversed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + invoiceId + '" target="_blank">' + escapeHtml(invoiceTranId) + '</a><br>';
            html += 'Payment: <a href="/app/accounting/transactions/custpymt.nl?id=' + paymentId + '" target="_blank">' + paymentId + '</a><br>';
            html += 'Amount: $' + parseFloat(amount).toFixed(2);
            html += '</div>';

            return html;
        }

        /**
  * Builds success message HTML for chargeback/NSF processing
  * @param {Object} params - URL parameters
  * @returns {string} HTML content
  */
        function buildSuccessMessage(params) {
            var type = params.type || 'chargeback';
            var customer = decodeURIComponent(params.customer || 'Customer');
            var creditMemoId = params.cm || '';
            var refundId = params.refund || '';
            var newInvoiceId = params.invoice || '';
            var jeId = params.jeId || '';
            var jeTranId = params.jeTranId || '';

            var typeText = type === 'nsf' ? 'NSF Check' : (type === 'fraud' ? 'Fraud Chargeback' : 'Dispute Chargeback');

            var html = '<div class="success-msg">';
            html += '<strong>' + typeText + ' Processed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Credit Memo: <a href="/app/accounting/transactions/custcred.nl?id=' + creditMemoId + '" target="_blank">' + creditMemoId + '</a><br>';
            html += 'Customer Refund: <a href="/app/accounting/transactions/custrfnd.nl?id=' + refundId + '" target="_blank">' + refundId + '</a><br>';
            html += 'New Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + newInvoiceId + '" target="_blank">' + newInvoiceId + '</a>';

            if (type === 'fraud' && jeId) {
                html += '<br>Journal Entry Write-Off: <a href="/app/accounting/transactions/journal.nl?id=' + jeId + '" target="_blank">' + escapeHtml(jeTranId) + '</a>';
            }

            html += '</div>';

            return html;
        }

        /**
* Builds the global tracking table
* @returns {string} HTML table
*/
        function buildGlobalTrackingTable() {
            try {
                var invoices = searchOpenChargebackInvoices();

                if (invoices.length === 0) {
                    return '<div class="search-count">No open chargeback or NSF check invoices found</div>';
                }

                var html = '<div class="search-count">Results: ' + invoices.length + '</div>';
                html += '<table class="search-table">';
                html += '<thead><tr>';
                html += '<th>Actions</th>';
                html += '<th>Customer</th>';
                html += '<th>Invoice #</th>';
                html += '<th>Date Created</th>';
                html += '<th>Amount</th>';
                html += '<th>Type</th>';
                html += '<th>Created By</th>';
                html += '</tr></thead><tbody>';

                for (var i = 0; i < invoices.length; i++) {
                    var inv = invoices[i];
                    html += '<tr>';
                    html += '<td class="action-cell">';
                    html += '<button type="button" class="action-btn payment-link-btn" onclick="sendPaymentLink(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Send Payment Link</button>';
                    html += '<button type="button" class="action-btn manual-payment-btn" onclick="enterManualPayment(\'' + inv.id + '\')">Enter Manual Payment</button>';
                    html += '<button type="button" class="action-btn reverse-btn" onclick="reverseChargeback(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Reverse Chargeback</button>';
                    html += '<button type="button" class="action-btn writeoff-btn" onclick="jeWriteOff(\'' + inv.id + '\')">JE Write Off</button>';
                    html += '</td>';
                    html += '<td>' + escapeHtml(inv.customer) + '</td>';
                    html += '<td><a href="/app/accounting/transactions/custinvc.nl?id=' + inv.id + '" target="_blank">' + escapeHtml(inv.tranid) + '</a></td>';
                    html += '<td>' + escapeHtml(inv.dateCreated) + '</td>';
                    html += '<td>$' + parseFloat(inv.amount).toFixed(2) + '</td>';
                    html += '<td>' + escapeHtml(inv.type) + '</td>';
                    html += '<td>' + escapeHtml(inv.createdBy) + '</td>';
                    html += '</tr>';
                }

                html += '</tbody></table>';
                return html;
            } catch (e) {
                log.error('Global Tracking Table Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);
                return '<div class="error-msg">Error loading tracking data: ' + escapeHtml(e.toString()) + '</div>';
            }
        }


        /**
 * Searches for open invoices with chargeback or NSF item codes
 * @returns {Array} Array of invoice objects
 */
        function searchOpenChargebackInvoices() {
            log.debug('Searching Open Chargeback Invoices', 'Items: 304416 (CC Dispute), 304429 (Fraud), 304417 (NSF)');

            var invoiceSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['status', 'anyof', 'CustInvc:A'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item', 'anyof', ['304416', '304429', '304417']] // CC Dispute, Fraud, and NSF items
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'entity' }),
                    search.createColumn({ name: 'datecreated', sort: search.Sort.DESC }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'item' }),
                    search.createColumn({ name: 'createdby' })
                ]
            });

            var results = [];
            var processedInvoices = {};

            invoiceSearch.run().each(function (result) {
                var invoiceId = result.id;

                if (!processedInvoices[invoiceId]) {
                    var itemId = result.getValue('item');
                    var itemType = 'Unknown';

                    if (itemId === '304416') {
                        itemType = 'Credit Card Dispute Chargeback';
                    } else if (itemId === '304429') {
                        itemType = 'Fraud Chargeback';
                    } else if (itemId === '304417') {
                        itemType = 'NSF Check';
                    }

                    var createdBy = result.getText('createdby') || 'Unknown';

                    results.push({
                        id: invoiceId,
                        tranid: result.getValue('tranid'),
                        customer: result.getText('entity'),
                        dateCreated: result.getValue('datecreated'),
                        amount: result.getValue('amount'),
                        type: itemType,
                        createdBy: createdBy
                    });

                    processedInvoices[invoiceId] = true;
                }

                return true;
            });

            log.debug('Open Chargeback Invoices Found', 'Count: ' + results.length);
            return results;
        }
        /**
         * Handles POST requests
         */
        function handlePost(context) {
            var request = context.request;
            var params = request.parameters;
            var files = request.files;

            log.audit('POST Request Received', 'Parameters: ' + JSON.stringify(params) + ' | Files: ' + JSON.stringify(Object.keys(files || {})));

            try {
                // Check if this is a file upload
                var isFileUpload = params.custpage_invoice_id && params.custpage_dispute_file;

                if (isFileUpload) {
                    handleFileUploadForm(context);
                    return;
                }

                // Handle deposit refund processing
                if (params.action === 'processDepositRefund') {
                    handleDepositRefund(context);
                    return;
                }

                // NEW: Handle duplicate refund processing
                if (params.action === 'processDuplicateRefund') {
                    handleDuplicateRefund(context);
                    return;
                }

                // Handle chargeback/NSF processing
                var action = params.action;
                var invoiceId = params.invoiceId;
                var type = params.type;

                if (!action || !invoiceId || !type) {
                    throw new Error('Missing required parameters');
                }

                log.debug('Processing Action', 'Action: ' + action + ' | Invoice: ' + invoiceId + ' | Type: ' + type);

                var result = processChargebackOrNsf(invoiceId, type);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        success: 'true',
                        type: type,
                        customer: result.customerName,
                        cm: result.creditMemoId,
                        refund: result.refundId,
                        invoice: result.newInvoiceId,
                        jeId: result.jeId || '',
                        jeTranId: result.jeTranId || ''
                    }
                });

            } catch (e) {
                log.error('POST Processing Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent(e.toString())
                    }
                });
            }
        }

        /**
 * NEW: Handles duplicate refund processing - creates CM, Refund, and Invoice from scratch
 * @param {Object} context
 */
        function handleDuplicateRefund(context) {
            var request = context.request;
            var refundId = request.parameters.refundId;
            var type = request.parameters.type; // 'freedompay' or 'chargeback'

            log.audit('Duplicate Refund Request', {
                refundId: refundId,
                type: type
            });

            try {
                if (!refundId || !type) {
                    throw new Error('Refund ID and type are required');
                }

                var result = processDuplicateRefund(refundId, type);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        duplicateRefundSuccess: 'true',
                        type: type,
                        customer: encodeURIComponent(result.customerName),
                        creditMemoId: result.creditMemoId,
                        creditMemoTranId: result.creditMemoTranId, // NEW
                        refundId: result.refundId,
                        refundTranId: result.refundTranId, // NEW
                        newInvoiceId: result.newInvoiceId,
                        newInvoiceTranId: result.newInvoiceTranId, // NEW
                        amount: result.amount
                    }
                });

            } catch (e) {
                log.error('Duplicate Refund Error', {
                    error: e.toString(),
                    stack: e.stack,
                    refundId: refundId,
                    type: type
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Duplicate Refund Error: ' + e.toString())
                    }
                });
            }
        }

        /**
  * NEW: Processes duplicate refund - creates CM, Refund, and Invoice from scratch
  * @param {string} originalRefundId - Original Customer Refund internal ID
  * @param {string} type - 'freedompay' or 'chargeback'
  * @returns {Object} Result with created record details
  */
        function processDuplicateRefund(originalRefundId, type) {
            log.audit('Processing Duplicate Refund', {
                originalRefundId: originalRefundId,
                type: type
            });

            // Load the original refund to get details
            var originalRefund = record.load({
                type: record.Type.CUSTOMER_REFUND,
                id: originalRefundId,
                isDynamic: false
            });

            var customerId = originalRefund.getValue('customer');
            var customerName = originalRefund.getText('customer');
            var originalTranId = originalRefund.getValue('tranid');
            var refundAmount = originalRefund.getValue('total');
            var subsidiary = originalRefund.getValue('subsidiary');
            var classField = originalRefund.getValue('class');

            // Use placeholder values since refunds don't have location/department
            var location = 108; // Retail G&A
            var department = 107; // Retail G&A

            log.debug('Original Refund Loaded', {
                refundId: originalRefundId,
                tranId: originalTranId,
                customerId: customerId,
                customerName: customerName,
                amount: refundAmount,
                location: location,
                department: department
            });

            // Determine item ID and memo text based on type
            var itemId;
            var memoText;
            var refundPrefix;

            if (type === 'freedompay') {
                itemId = '304779'; // Duplicate FreedomPay Refund in Error
                memoText = 'Duplicate FreedomPay Refund in Error';
                refundPrefix = 'DUP_FREEDOMPAY';
            } else { // chargeback
                itemId = '304416'; // Credit Card Dispute Chargeback
                memoText = 'Duplicate Chargeback Refund';
                refundPrefix = 'DUP_CHARGEBACK';
            }

            // STEP 1: Create Credit Memo from scratch
            var creditMemo = record.create({
                type: record.Type.CREDIT_MEMO,
                isDynamic: true
            });

            creditMemo.setValue('entity', customerId);
            creditMemo.setValue('trandate', new Date());
            creditMemo.setValue('tobeemailed', false);

            if (subsidiary) {
                creditMemo.setValue('subsidiary', subsidiary);
            }

            // Set location at header level
            creditMemo.setValue('location', location);

            // Set department at header level
            creditMemo.setValue('department', department);

            creditMemo.setValue('memo', memoText + ' - Original Refund: ' + originalTranId);

            // Add line item
            creditMemo.selectNewLine({ sublistId: 'item' });
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: itemId
            });
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: refundAmount
            });

            // Set location on line
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'location',
                value: location
            });

            // Set department on line
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'department',
                value: department
            });

            if (classField) {
                creditMemo.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'class',
                    value: classField
                });
            }

            creditMemo.commitLine({ sublistId: 'item' });

            var creditMemoId = creditMemo.save();
            log.audit('Credit Memo Created', 'ID: ' + creditMemoId + ' | Amount: ' + refundAmount);

            // NEW: Get the credit memo tranid
            var creditMemoRecord = record.load({
                type: record.Type.CREDIT_MEMO,
                id: creditMemoId,
                isDynamic: false
            });
            var creditMemoTranId = creditMemoRecord.getValue('tranid');

            // STEP 2: Create Customer Refund
            var customerRefund = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true
            });

            customerRefund.setValue('customer', customerId);
            customerRefund.setValue('paymentmethod', '15'); // ACCT'G
            customerRefund.setValue('memo', memoText + ' - Original Refund: ' + originalTranId);

            var customTranId = refundPrefix + '_' + originalTranId;
            customerRefund.setValue('tranid', customTranId);

            // Set the refunded transaction
            try {
                customerRefund.setValue({
                    fieldId: 'custbody_bas_refunded_transaction',
                    value: creditMemoId
                });
            } catch (e) {
                log.error('Error Setting Refunded Transaction', 'Error: ' + e.message);
            }

            customerRefund.setValue('total', refundAmount);

            // Find and apply the credit memo
            var applyLineCount = customerRefund.getLineCount({ sublistId: 'apply' });
            var creditApplied = false;

            for (var j = 0; j < applyLineCount; j++) {
                var applyInternalId = customerRefund.getSublistValue({
                    sublistId: 'apply',
                    fieldId: 'internalid',
                    line: j
                });

                if (applyInternalId == creditMemoId) {
                    customerRefund.selectLine({
                        sublistId: 'apply',
                        line: j
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'apply',
                        value: true
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'amount',
                        value: refundAmount
                    });
                    customerRefund.commitLine({ sublistId: 'apply' });
                    creditApplied = true;
                    log.debug('Applied to Credit Memo', 'Line: ' + j + ' | Amount: ' + refundAmount);
                    break;
                }
            }

            if (!creditApplied) {
                throw new Error('Could not find credit memo in refund apply list');
            }

            var refundId = customerRefund.save();
            log.audit('Customer Refund Created', 'ID: ' + refundId + ' | Amount: ' + refundAmount);

            // NEW: The custom tranid we set is what we want to return
            var refundTranId = customTranId; // We already have this from earlier

            // STEP 3: Create new invoice
            var newInvoice = record.create({
                type: record.Type.INVOICE,
                isDynamic: true
            });

            newInvoice.setValue('entity', customerId);
            newInvoice.setValue('trandate', new Date());
            newInvoice.setValue('tobeemailed', false);
            newInvoice.setValue('custbody_b4cp_gen_pay_online_link', true);

            if (subsidiary) {
                newInvoice.setValue('subsidiary', subsidiary);
            }

            // Set location at header level
            newInvoice.setValue('location', location);

            // Set department at header level
            newInvoice.setValue('department', department);

            newInvoice.setValue('memo', memoText + ' - Original Refund: ' + originalTranId);

            // Add line item
            newInvoice.selectNewLine({ sublistId: 'item' });
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: itemId
            });
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: refundAmount
            });

            // Set location on line
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'location',
                value: location
            });

            // Set department on line
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'department',
                value: department
            });

            if (classField) {
                newInvoice.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'class',
                    value: classField
                });
            }

            newInvoice.commitLine({ sublistId: 'item' });

            var newInvoiceId = newInvoice.save();
            log.audit('New Invoice Created', 'ID: ' + newInvoiceId + ' | Amount: ' + refundAmount);

            // NEW: Get the new invoice tranid
            var newInvoiceRecord = record.load({
                type: record.Type.INVOICE,
                id: newInvoiceId,
                isDynamic: false
            });
            var newInvoiceTranId = newInvoiceRecord.getValue('tranid');

            return {
                creditMemoId: creditMemoId,
                creditMemoTranId: creditMemoTranId, // NEW
                refundId: refundId,
                refundTranId: refundTranId, // NEW
                newInvoiceId: newInvoiceId,
                newInvoiceTranId: newInvoiceTranId, // NEW
                customerName: customerName,
                amount: refundAmount
            };
        }

        /**
  * Handles deposit refund processing - creates customer refund from deposit
  * @param {Object} context
  */
        function handleDepositRefund(context) {
            var request = context.request;
            var depositId = request.parameters.depositId;
            var type = request.parameters.type;

            log.audit('Deposit Refund Request', {
                depositId: depositId,
                type: type
            });

            try {
                if (!depositId || !type) {
                    throw new Error('Deposit ID and type are required');
                }

                var result = processDepositRefund(depositId, type);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        depositRefundSuccess: 'true',
                        type: type,
                        customer: encodeURIComponent(result.customerName),
                        refundId: result.refundId,
                        refundTranId: result.refundTranId,  // NEW: Add tranid
                        depositId: depositId,
                        depositTranId: result.depositTranId,  // NEW: Add tranid
                        amount: result.amount
                    }
                });

            } catch (e) {
                log.error('Deposit Refund Error', {
                    error: e.toString(),
                    stack: e.stack,
                    depositId: depositId,
                    type: type
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Deposit Refund Error: ' + e.toString())
                    }
                });
            }
        }

        /**
         * Processes deposit refund - creates customer refund applying to deposit
         * @param {string} depositId - Customer Deposit internal ID
         * @param {string} type - 'chargeback', 'fraud', or 'nsf'
         * @returns {Object} Result with refund details
         */
        function processDepositRefund(depositId, type) {
            log.audit('Processing Deposit Refund', {
                depositId: depositId,
                type: type
            });

            // Load the deposit
            var depositRecord = record.load({
                type: record.Type.CUSTOMER_DEPOSIT,
                id: depositId,
                isDynamic: false
            });

            var customerId = depositRecord.getValue('customer');
            var customerName = depositRecord.getText('customer');
            var tranId = depositRecord.getValue('tranid');
            var amountToRefund = depositRecord.getValue('undepositedfunds') || depositRecord.getValue('payment');
            var salesOrderId = depositRecord.getValue('salesorder');

            log.debug('Deposit Loaded', {
                depositId: depositId,
                tranId: tranId,
                customerId: customerId,
                customerName: customerName,
                amountToRefund: amountToRefund,
                salesOrderId: salesOrderId
            });

            // Create customer refund
            var customerRefund = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true
            });

            customerRefund.setValue('customer', customerId);
            customerRefund.setValue('paymentmethod', 15);

            var memoText = type === 'nsf' ? 'NSF Check Deposit Refund' :
                (type === 'fraud' ? 'Fraud Chargeback Deposit Refund' : 'Dispute Chargeback Deposit Refund');

            customerRefund.setValue('memo', memoText);

            var refundPrefix = type === 'nsf' ? 'NSF_CHECK_DEP' :
                (type === 'fraud' ? 'FRAUD_CC_DEP' : 'CHARGEBACK_CC_DEP');
            var customTranId = refundPrefix + '_' + tranId;

            customerRefund.setValue('tranid', customTranId);

            if (salesOrderId) {
                try {
                    customerRefund.setValue({
                        fieldId: 'custbody_bas_refunded_transaction',
                        value: salesOrderId
                    });
                    log.debug('Set Refunded Transaction Field', 'Sales Order ID: ' + salesOrderId);
                } catch (e) {
                    log.error('Error Setting Refunded Transaction', 'Error: ' + e.message);
                }
            } else {
                log.audit('No Sales Order on Deposit', 'Deposit ID: ' + depositId + ' has no linked Sales Order - custbody_bas_refunded_transaction not set');
            }

            customerRefund.setValue('total', amountToRefund);

            log.debug('Customer Refund Header Set', {
                customer: customerId,
                amount: amountToRefund,
                tranId: customTranId,
                refundedTransaction: salesOrderId || 'None'
            });

            // Find and apply the deposit
            var depositLineCount = customerRefund.getLineCount({ sublistId: 'deposit' });
            var depositApplied = false;

            for (var i = 0; i < depositLineCount; i++) {
                var depositDocId = customerRefund.getSublistValue({
                    sublistId: 'deposit',
                    fieldId: 'doc',
                    line: i
                });

                if (depositDocId == depositId) {
                    customerRefund.selectLine({
                        sublistId: 'deposit',
                        line: i
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'deposit',
                        fieldId: 'apply',
                        value: true
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'deposit',
                        fieldId: 'amount',
                        value: amountToRefund
                    });
                    customerRefund.commitLine({ sublistId: 'deposit' });
                    depositApplied = true;
                    log.debug('Applied to Deposit', {
                        line: i,
                        amount: amountToRefund
                    });
                    break;
                }
            }

            if (!depositApplied) {
                throw new Error('Could not find deposit in refund apply list');
            }

            var refundId = customerRefund.save();

            log.audit('Deposit Refund Created', {
                refundId: refundId,
                refundTranId: customTranId,
                depositId: depositId,
                depositTranId: tranId,
                amount: amountToRefund,
                linkedSalesOrder: salesOrderId || 'None'
            });

            return {
                refundId: refundId,
                refundTranId: customTranId,  // NEW: Return tranid
                depositTranId: tranId,       // NEW: Return deposit tranid
                customerName: customerName,
                amount: amountToRefund
            };
        }

        /**
         * Handles file upload via form submission (not AJAX)
         * @param {Object} context
         */
        function handleFileUploadForm(context) {
            var request = context.request;
            var response = context.response;
            var invoiceId = request.parameters.custpage_invoice_id;
            var fileDescription = request.parameters.custpage_file_description || '';

            log.debug('Form File Upload Request', {
                invoiceId: invoiceId,
                description: fileDescription,
                allParams: Object.keys(request.parameters),
                allFiles: Object.keys(request.files || {})
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Get the file from request.files
                var uploadedFile = null;
                var fileKeys = Object.keys(request.files || {});

                log.debug('Available file keys', JSON.stringify(fileKeys));

                // Try to find the file in request.files
                for (var i = 0; i < fileKeys.length; i++) {
                    var key = fileKeys[i];
                    if (key.indexOf('custpage_dispute_file') !== -1 || key.indexOf('dispute') !== -1) {
                        uploadedFile = request.files[key];
                        log.debug('Found file with key', key);
                        break;
                    }
                }

                // If still not found, try the exact field name
                if (!uploadedFile && request.files.custpage_dispute_file) {
                    uploadedFile = request.files.custpage_dispute_file;
                }

                if (!uploadedFile) {
                    throw new Error('No file was uploaded. Please select a file and try again. Available keys: ' + fileKeys.join(', '));
                }

                // Load invoice to get details
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var tranId = invoiceRecord.getValue('tranid');
                var customerName = invoiceRecord.getText('entity');

                // Create file record
                var fileObj = file.create({
                    name: uploadedFile.name,
                    fileType: uploadedFile.type,
                    contents: uploadedFile.getContents(),
                    folder: 2762649 // Chargeback Dispute Uploads folder
                });

                // Set description if provided
                if (fileDescription) {
                    fileObj.description = fileDescription;
                }

                // Save the file
                var fileId = fileObj.save();

                log.debug('File Created', {
                    fileId: fileId,
                    fileName: uploadedFile.name
                });

                // Attach file to invoice transaction
                record.attach({
                    record: {
                        type: 'file',
                        id: fileId
                    },
                    to: {
                        type: record.Type.INVOICE,
                        id: invoiceId
                    }
                });

                log.audit('File Attached to Invoice', {
                    fileId: fileId,
                    fileName: uploadedFile.name,
                    invoiceId: invoiceId,
                    tranId: tranId
                });

                // Redirect back with success message
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        uploadSuccess: 'true',
                        fileName: encodeURIComponent(uploadedFile.name),
                        invoiceId: invoiceId,
                        invoice: tranId
                    }
                });

            } catch (e) {
                log.error('Form File Upload Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                // Redirect back with error
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('File Upload Error: ' + e.toString())
                    }
                });
            }
        }

        /**
  * Processes chargeback or NSF check for an invoice
  * @param {string} invoiceId - Internal ID of the original invoice
  * @param {string} type - 'chargeback', 'fraud', or 'nsf'
  * @returns {Object} Object containing created record IDs and customer name
  */
        function processChargebackOrNsf(invoiceId, type) {
            log.audit('Process Start', 'Invoice ID: ' + invoiceId + ' | Type: ' + type);

            var itemId;
            var memoText;
            var checkboxField;

            if (type === 'nsf') {
                itemId = '304417'; // NSF Check item
                memoText = 'NSF Check';
                checkboxField = 'custbody_bas_nsf_check';
            } else if (type === 'fraud') {
                itemId = '304429'; // Fraud item (CORRECTED)
                memoText = 'Fraud Chargeback';
                checkboxField = 'custbody_bas_fraud';
            } else { // chargeback (dispute)
                itemId = '304416'; // Credit Card Dispute Chargeback item
                memoText = 'Credit Card Chargeback';
                checkboxField = 'custbody_bas_cc_dispute';
            }

            var originalInvoice = record.load({
                type: record.Type.INVOICE,
                id: invoiceId
            });

            var customerId = originalInvoice.getValue('entity');
            var customerName = originalInvoice.getText('entity');
            var originalAmount = originalInvoice.getValue('total');
            var department = originalInvoice.getValue('department');
            var subsidiary = originalInvoice.getValue('subsidiary');
            var classField = originalInvoice.getValue('class');
            var originalTranId = originalInvoice.getValue('tranid');

            log.debug('Original Invoice Loaded', 'Customer: ' + customerName + ' | Amount: ' + originalAmount + ' | Department: ' + department + ' | Class: ' + classField);

            // Lookup fulfilling location from department record
            var location = null;
            if (department) {
                location = lookupFulfillingLocation(department);
                log.debug('Location Lookup Complete', 'Department: ' + department + ' | Location: ' + location);
            }

            // Step 1: Create Credit Memo
            var creditMemo = record.transform({
                fromType: record.Type.INVOICE,
                fromId: invoiceId,
                toType: record.Type.CREDIT_MEMO,
                isDynamic: true
            });

            log.debug('Credit Memo Transformed', 'From Invoice: ' + invoiceId);

            // Prevent auto-emailing
            creditMemo.setValue('tobeemailed', false);
            log.debug('Set Credit Memo To Be Emailed', 'Value: false');

            // Set location at header level (REQUIRED for Credit Memo)
            if (location) {
                creditMemo.setValue('location', location);
                log.debug('Set Credit Memo Header Location', 'Location: ' + location);
            }

            // Set department at header level
            if (department) {
                creditMemo.setValue('department', department);
                log.debug('Set Credit Memo Header Department', 'Department: ' + department);
            }

            var lineCount = creditMemo.getLineCount({ sublistId: 'item' });
            log.debug('Credit Memo Line Count', 'Lines to remove: ' + lineCount);

            for (var i = lineCount - 1; i >= 0; i--) {
                creditMemo.removeLine({
                    sublistId: 'item',
                    line: i
                });
            }

            creditMemo.selectNewLine({ sublistId: 'item' });
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: itemId
            });
            creditMemo.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: originalAmount
            });

            // Set location on line if available
            if (location) {
                creditMemo.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    value: location
                });
                log.debug('Set Credit Memo Line Location', 'Location: ' + location);
            }

            // Set department on line if available
            if (department) {
                creditMemo.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'department',
                    value: department
                });
                log.debug('Set Credit Memo Line Department', 'Department: ' + department);
            }

            // Set class on line if available
            if (classField) {
                creditMemo.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'class',
                    value: classField
                });
                log.debug('Set Credit Memo Line Class', 'Class: ' + classField);
            }

            creditMemo.commitLine({ sublistId: 'item' });
            creditMemo.setValue('memo', memoText);

            var creditMemoId = creditMemo.save();
            log.audit('Credit Memo Created', 'ID: ' + creditMemoId + ' | Amount: ' + originalAmount);

            // Get the credit memo tranid
            var creditMemoRecord = record.load({
                type: record.Type.CREDIT_MEMO,
                id: creditMemoId,
                isDynamic: false
            });
            var creditMemoTranId = creditMemoRecord.getValue('tranid');
            log.debug('Credit Memo TranId', 'TranId: ' + creditMemoTranId);

            // Step 2: Create Customer Refund
            var customerRefund = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true
            });

            customerRefund.setValue('customer', customerId);
            customerRefund.setValue('paymentmethod', '15');
            customerRefund.setValue('memo', memoText);

            // Set custom transaction number based on type and original invoice number
            var refundPrefix = type === 'nsf' ? 'NSF_CHECK' : (type === 'fraud' ? 'FRAUD_CC' : 'CHARGEBACK_CC');
            var customTranId = refundPrefix + '_' + originalTranId;

            customerRefund.setValue('tranid', customTranId);
            log.debug('Set Customer Refund TranId', 'Custom ID: ' + customTranId);

            // Set the refunded transaction
            try {
                customerRefund.setValue({
                    fieldId: 'custbody_bas_refunded_transaction',
                    value: creditMemoId
                });
                log.debug('Set Refunded Transaction Field', 'Credit Memo ID: ' + creditMemoId);
            } catch (e) {
                log.error('Error Setting Refunded Transaction', 'Field may have different ID. Error: ' + e.message);
                try {
                    customerRefund.setValue('createdfrom', creditMemoId);
                    log.debug('Set Created From Field', 'Credit Memo ID: ' + creditMemoId);
                } catch (e2) {
                    log.error('Error Setting Created From', e2.message);
                }
            }

            customerRefund.setValue('total', originalAmount);

            log.debug('Customer Refund Header Values Set', 'Customer: ' + customerId + ' | Amount: ' + originalAmount + ' | TranId: ' + customTranId);

            var applyLineCount = customerRefund.getLineCount({ sublistId: 'apply' });
            log.debug('Apply Lines Available', 'Count: ' + applyLineCount);

            for (var j = 0; j < applyLineCount; j++) {
                var applyInternalId = customerRefund.getSublistValue({
                    sublistId: 'apply',
                    fieldId: 'internalid',
                    line: j
                });

                log.debug('Apply Line ' + j, 'Internal ID: ' + applyInternalId);

                if (applyInternalId == creditMemoId) {
                    customerRefund.selectLine({
                        sublistId: 'apply',
                        line: j
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'apply',
                        value: true
                    });
                    customerRefund.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'amount',
                        value: originalAmount
                    });
                    customerRefund.commitLine({ sublistId: 'apply' });
                    log.debug('Applied to Credit Memo', 'Line: ' + j + ' | Amount: ' + originalAmount);
                    break;
                }
            }

            var refundId = customerRefund.save();
            log.audit('Customer Refund Created', 'ID: ' + refundId + ' | Amount: ' + originalAmount);

            // Step 3: Create new invoice
            var newInvoice = record.copy({
                type: record.Type.INVOICE,
                id: invoiceId,
                isDynamic: true
            });

            log.debug('New Invoice Copied', 'From Invoice: ' + invoiceId);

            newInvoice.setValue('trandate', new Date());

            // Prevent auto-emailing
            newInvoice.setValue('tobeemailed', false);
            log.debug('Set New Invoice To Be Emailed', 'Value: false');

            // Set Generate Payment Link checkbox to true
            newInvoice.setValue('custbody_b4cp_gen_pay_online_link', true);
            log.debug('Set Generate Payment Link', 'Value: true');

            // Set location at header level if available
            if (location) {
                newInvoice.setValue('location', location);
                log.debug('Set New Invoice Header Location', 'Location: ' + location);
            }

            // Set department at header level if available
            if (department) {
                newInvoice.setValue('department', department);
                log.debug('Set New Invoice Header Department', 'Department: ' + department);
            }

            var newInvLineCount = newInvoice.getLineCount({ sublistId: 'item' });
            log.debug('New Invoice Line Count', 'Lines to remove: ' + newInvLineCount);

            for (var k = newInvLineCount - 1; k >= 0; k--) {
                newInvoice.removeLine({
                    sublistId: 'item',
                    line: k
                });
            }

            newInvoice.selectNewLine({ sublistId: 'item' });
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: itemId
            });
            newInvoice.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: originalAmount
            });

            // Set location on new invoice line
            if (location) {
                newInvoice.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    value: location
                });
                log.debug('Set New Invoice Line Location', 'Location: ' + location);
            }

            // Set department if available
            if (department) {
                newInvoice.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'department',
                    value: department
                });
                log.debug('Set New Invoice Line Department', 'Department: ' + department);
            }

            // Set class if available
            if (classField) {
                newInvoice.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'class',
                    value: classField
                });
                log.debug('Set New Invoice Line Class', 'Class: ' + classField);
            }

            newInvoice.commitLine({ sublistId: 'item' });

            newInvoice.setValue('memo', memoText + ' - Original Invoice: ' + originalTranId);

            var newInvoiceId = newInvoice.save();
            log.audit('New Invoice Created', 'ID: ' + newInvoiceId + ' | Amount: ' + originalAmount);

            // Get the new invoice tranid
            var newInvoiceRecord = record.load({
                type: record.Type.INVOICE,
                id: newInvoiceId,
                isDynamic: false
            });
            var newInvoiceTranId = newInvoiceRecord.getValue('tranid');
            log.debug('New Invoice TranId', 'TranId: ' + newInvoiceTranId);

            // Step 4: Update original invoice with memo and checkbox
            try {
                var memoPrefix = type === 'nsf' ? 'NSF CHECK, SEE' : (type === 'fraud' ? 'FRAUD CHARGEBACK, SEE' : 'CHARGEBACK, SEE');

                // Load the original invoice to get existing memo
                var originalInvoiceForUpdate = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var existingMemo = originalInvoiceForUpdate.getValue('memo') || '';

                // Build the new memo text
                var newMemoText = memoPrefix + ' ' + newInvoiceTranId + ' AND ' + creditMemoTranId;

                // Append to existing memo with hyphen separator if memo exists
                var updateMemo = existingMemo ? existingMemo + ' - ' + newMemoText : newMemoText;

                var updateValues = {
                    memo: updateMemo
                };
                updateValues[checkboxField] = true;

                record.submitFields({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    values: updateValues
                });

                log.audit('Original Invoice Updated', {
                    invoiceId: invoiceId,
                    existingMemo: existingMemo,
                    newMemo: updateMemo,
                    checkboxField: checkboxField,
                    checkboxValue: true
                });

            } catch (updateError) {
                log.error('Error Updating Original Invoice', {
                    error: updateError.toString(),
                    stack: updateError.stack,
                    invoiceId: invoiceId
                });
                // Don't throw error - the main process completed successfully
            }

            var resultData = {
                creditMemoId: creditMemoId,
                refundId: refundId,
                newInvoiceId: newInvoiceId,
                customerName: customerName
            };

            // Step 5: For fraud chargebacks, automatically create JE write-off
            if (type === 'fraud') {
                try {
                    log.debug('Fraud Chargeback - Creating JE Write-Off', 'Invoice ID: ' + newInvoiceId);

                    var amountDue = originalAmount; // Use original amount since new invoice was just created

                    if (!department) {
                        throw new Error('Invoice must have a department to create write-off journal entry');
                    }

                    // Create Journal Entry
                    var journalEntry = record.create({
                        type: record.Type.JOURNAL_ENTRY,
                        isDynamic: true
                    });

                    // Set header fields
                    journalEntry.setValue({
                        fieldId: 'trandate',
                        value: new Date()
                    });

                    if (subsidiary) {
                        journalEntry.setValue({
                            fieldId: 'subsidiary',
                            value: subsidiary
                        });
                    }

                    var jeMemoText = 'Fraud Chargeback Write-Off - Automated Journal Entry - See ' + newInvoiceTranId;
                    journalEntry.setValue({
                        fieldId: 'memo',
                        value: jeMemoText
                    });

                    log.debug('JE Header Set', {
                        subsidiary: subsidiary,
                        memo: jeMemoText
                    });

                    // Line 1: Credit to Accounts Receivable (Account 119) with Customer
                    journalEntry.selectNewLine({ sublistId: 'line' });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'account',
                        value: 119 // AR Account
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'credit',
                        value: amountDue
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'entity',
                        value: customerId
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'memo',
                        value: jeMemoText
                    });

                    journalEntry.commitLine({ sublistId: 'line' });

                    log.debug('JE Line 1 Added', {
                        account: 119,
                        credit: amountDue,
                        entity: customerId
                    });

                    // Line 2: Debit to COGS (Account 353) with Department
                    journalEntry.selectNewLine({ sublistId: 'line' });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'account',
                        value: 353 // COGS Account
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'debit',
                        value: amountDue
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'department',
                        value: department
                    });

                    journalEntry.setCurrentSublistValue({
                        sublistId: 'line',
                        fieldId: 'memo',
                        value: jeMemoText
                    });

                    journalEntry.commitLine({ sublistId: 'line' });

                    log.debug('JE Line 2 Added', {
                        account: 353,
                        debit: amountDue,
                        department: department
                    });

                    // Save the Journal Entry
                    var jeId = journalEntry.save();

                    log.audit('Journal Entry Created for Fraud', {
                        jeId: jeId,
                        newInvoiceId: newInvoiceId,
                        amount: amountDue
                    });

                    // Get the JE tranid
                    var jeRecord = record.load({
                        type: record.Type.JOURNAL_ENTRY,
                        id: jeId,
                        isDynamic: false
                    });
                    var jeTranId = jeRecord.getValue('tranid');

                    log.debug('JE Details', {
                        jeId: jeId,
                        jeTranId: jeTranId
                    });

                    // Apply the JE to the new invoice
                    var applicationResult = applyJournalEntryToInvoice(newInvoiceId, jeId, amountDue, customerId);

                    if (!applicationResult.success) {
                        log.error('JE Application Warning', 'Journal Entry created but failed to apply to invoice: ' + applicationResult.error);
                    } else {
                        log.audit('JE Write-Off Complete for Fraud', {
                            jeId: jeId,
                            jeTranId: jeTranId,
                            newInvoiceId: newInvoiceId,
                            amount: amountDue,
                            applied: applicationResult.success,
                            paymentDeleted: applicationResult.paymentDeleted
                        });
                    }

                    // Add JE info to result data
                    resultData.jeId = jeId;
                    resultData.jeTranId = jeTranId;

                } catch (jeError) {
                    log.error('Error Creating JE for Fraud Chargeback', {
                        error: jeError.toString(),
                        stack: jeError.stack,
                        newInvoiceId: newInvoiceId
                    });
                    // Don't throw - the main chargeback process completed successfully
                }
            }

            return resultData;
        }

        /**
         * Looks up the fulfilling location from a department record
         * @param {number} departmentId - The department (selling location) internal ID
         * @returns {number} The fulfilling location internal ID
         */
        function lookupFulfillingLocation(departmentId) {
            try {
                log.debug('Looking up Fulfilling Location', 'Department ID: ' + departmentId);

                var departmentRecord = record.load({
                    type: record.Type.DEPARTMENT,
                    id: departmentId,
                    isDynamic: false
                });

                var fulfillingLocationId = departmentRecord.getValue({
                    fieldId: 'custrecord_bas_fulfilling_location'
                });

                if (fulfillingLocationId) {
                    log.debug('Fulfilling Location Found', {
                        departmentId: departmentId,
                        fulfillingLocationId: fulfillingLocationId
                    });
                    return parseInt(fulfillingLocationId, 10);
                } else {
                    log.error('No Fulfilling Location Found', 'Department ID: ' + departmentId + ' - No custrecord_bas_fulfilling_location value');
                    throw new Error('Fulfilling Location not configured for Department ID: ' + departmentId);
                }

            } catch (e) {
                log.error('Error Looking Up Fulfilling Location', {
                    error: e.message,
                    stack: e.stack,
                    departmentId: departmentId
                });
                throw new Error('Unable to determine Fulfilling Location for Department ID: ' + departmentId + ' - ' + e.message);
            }
        }

        /**
         * Escapes HTML special characters
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        function escapeHtml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\//g, '&#x2F;');
        }

        /**
   * Returns CSS styles for the page
   * UPDATED with darker disabled button styles and removed text
   * @returns {string} CSS content
   */
        function getStyles() {
            return '.uir-page-title-secondline { border: none !important; margin: 0 !important; padding: 0 !important; }' +
                '.uir-record-type { border: none !important; }' +
                '.bglt { border: none !important; }' +
                '.smalltextnolink { border: none !important; }' +
                '.chargeback-container { margin: 0; padding: 0; border: none; background: transparent; }' +
                'table.search-table { border-collapse: collapse; width: 100%; margin: 15px 0; border: 1px solid #ddd; background: white; }' +
                'table.search-table th, table.search-table td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }' +
                'table.search-table th { background-color: #f8f9fa; font-weight: bold; color: #333; font-size: 12px; }' +
                'table.search-table tr:nth-child(even) td { background-color: #f9f9f9; }' +
                'table.search-table tr:hover td { background-color: #e8f4f8; }' +
                '.search-title { font-size: 16px; font-weight: bold; margin: 25px 0 8px 0; color: #333; padding: 8px 0; border-bottom: 2px solid #4CAF50; }' +
                '.search-count { font-style: italic; color: #666; margin: 5px 0 10px 0; font-size: 12px; }' +
                '.action-btn { color: white; padding: 6px 12px; border: none; cursor: pointer; border-radius: 4px; font-size: 11px; text-decoration: none; display: inline-block; transition: background-color 0.3s; margin-right: 5px; margin-bottom: 4px; }' +
                '.action-btn:hover { text-decoration: none; }' +
                '.action-btn:disabled { background-color: #666666 !important; cursor: not-allowed; opacity: 1; }' +
                '.action-btn.chargeback-btn { background-color: #f44336; }' +
                '.action-btn.chargeback-btn:hover:not(:disabled) { background-color: #da190b; }' +
                '.action-btn.fraud-btn { background-color: #dc3545; }' +
                '.action-btn.fraud-btn:hover:not(:disabled) { background-color: #c82333; }' +
                '.action-btn.nsf-btn { background-color: #ff9800; }' +
                '.action-btn.nsf-btn:hover { background-color: #e68900; }' +
                '.action-btn.payment-link-btn { background-color: #17a2b8; }' +
                '.action-btn.payment-link-btn:hover { background-color: #138496; }' +
                '.action-btn.manual-payment-btn { background-color: #28a745; }' +
                '.action-btn.manual-payment-btn:hover { background-color: #218838; }' +
                '.action-btn.reverse-btn { background-color: #007bff; }' +
                '.action-btn.reverse-btn:hover { background-color: #0056b3; }' +
                '.action-btn.writeoff-btn { background-color: #6f42c1; }' +
                '.action-btn.writeoff-btn:hover { background-color: #5a32a3; }' +
                '.action-cell { text-align: center; white-space: nowrap; padding: 4px; }' +
                '.success-msg { background-color: #d4edda; color: #155724; padding: 12px; border: 1px solid #c3e6cb; border-radius: 6px; margin: 15px 0; font-size: 13px; }' +
                '.success-msg a { color: #0c5460; font-weight: bold; }' +
                '.error-msg { background-color: #f8d7da; color: #721c24; padding: 12px; border: 1px solid #f5c6cb; border-radius: 6px; margin: 15px 0; font-size: 13px; }' +
                '.loading-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 9999; justify-content: center; align-items: center; }' +
                '.loading-overlay.active { display: flex; }' +
                '.loading-content { background-color: white; padding: 30px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }' +
                '.loading-spinner { border: 4px solid #f3f3f3; border-top: 4px solid #4CAF50; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }' +
                '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }' +
                '.loading-text { font-size: 14px; color: #333; font-weight: bold; }' +
                '.hidden-data { display: none; }' +
                '.search-container { position: relative; margin-bottom: 20px; }' +
                '.search-results { position: absolute; width: 100%; background: white; border: 1px solid #ddd; border-top: none; max-height: 300px; overflow-y: auto; z-index: 1000; display: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }' +
                '.search-result-item { padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; }' +
                '.search-result-item:hover { background-color: #f0f0f0; }' +
                '.upload-message { margin-top: 15px; padding: 10px; border-radius: 4px; display: none; }' +
                '.upload-message.success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; display: block; }' +
                '.upload-message.error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; display: block; }';
        }

        function getJavaScript(scriptUrl) {
            return 'var currentUploadInvoiceId = null;' +
                'var currentUploadTranId = null;' +
                'function refreshPage() { window.location.reload(); }' +
                'function showLoading(message) {' +
                '    var overlay = document.getElementById("loadingOverlay");' +
                '    var text = document.getElementById("loadingText");' +
                '    if (overlay && text) {' +
                '        text.textContent = message || "Processing...";' +
                '        overlay.className = "loading-overlay active";' +
                '    }' +
                '}' +
                'function hideLoading() {' +
                '    var overlay = document.getElementById("loadingOverlay");' +
                '    if (overlay) {' +
                '        overlay.className = "loading-overlay";' +
                '    }' +
                '}' +
                'function uploadDisputeFile(invoiceId, tranId) {' +
                '    if (!invoiceId) {' +
                '        alert("Invalid invoice ID");' +
                '        return;' +
                '    }' +
                '    showLoading("Opening file upload page...");' +
                '    window.location.href = "' + scriptUrl + '&action=redirectToFileUpload&invoiceId=" + invoiceId + "&tranId=" + encodeURIComponent(tranId);' +
                '}' +
                'function sendPaymentLink(invoiceId, tranId) {' +
                '    showLoading("Loading customer email...");' +
                '    var customerEmailUrl = "' + scriptUrl + '&action=getCustomerEmail&invoiceId=" + invoiceId;' +
                '    fetch(customerEmailUrl)' +
                '        .then(function(response) { return response.json(); })' +
                '        .then(function(emailData) {' +
                '            hideLoading();' +
                '            var customerEmail = emailData.email || "";' +
                '            if (!customerEmail) {' +
                '                alert("Customer does not have an email address on file. Please enter an email address.");' +
                '            }' +
                '            var enteredEmail = prompt("Enter email address to send payment link to:", customerEmail);' +
                '            if (enteredEmail === null) {' +
                '                return;' +
                '            }' +
                '            if (!enteredEmail || enteredEmail.trim() === "") {' +
                '                alert("Email address is required");' +
                '                return;' +
                '            }' +
                '            var displayEmail = enteredEmail.trim();' +
                '            var isChanged = displayEmail !== customerEmail;' +
                '            var confirmMsg = "Send payment link email for invoice " + tranId + " to " + displayEmail + "?";' +
                '            if (isChanged && customerEmail) {' +
                '                confirmMsg += "\\n\\nNote: Email will be sent to a different address than the customer record (" + customerEmail + ") and will not be attached to the customer record.";' +
                '            } else if (!isChanged) {' +
                '                confirmMsg += "\\n\\nEmail will be attached to the customer record.";' +
                '            }' +
                '            if (!confirm(confirmMsg)) {' +
                '                return;' +
                '            }' +
                '            showLoading("Sending payment link email...");' +
                '            var url = "' + scriptUrl + '&action=sendPaymentLink&invoiceId=" + invoiceId + "&overrideEmail=" + encodeURIComponent(displayEmail) + "&customerEmail=" + encodeURIComponent(customerEmail);' +
                '            fetch(url)' +
                '                .then(function(response) { return response.json(); })' +
                '                .then(function(data) {' +
                '                    hideLoading();' +
                '                    if (data.success) {' +
                '                        alert(data.message);' +
                '                    } else {' +
                '                        alert("Error sending email: " + data.error);' +
                '                    }' +
                '                })' +
                '                .catch(function(error) {' +
                '                    hideLoading();' +
                '                    alert("Error: " + error);' +
                '                });' +
                '        })' +
                '        .catch(function(error) {' +
                '            hideLoading();' +
                '            alert("Error loading customer email: " + error);' +
                '        });' +
                '}' +
                'function enterManualPayment(invoiceId) {' +
                '    if (!invoiceId) {' +
                '        alert("Invalid invoice ID");' +
                '        return;' +
                '    }' +
                '    showLoading("Opening payment form...");' +
                '    window.location.href = "' + scriptUrl + '&action=manualPayment&invoiceId=" + invoiceId;' +
                '}' +
                'function reverseChargeback(invoiceId, tranId) {' +
                '    if (!confirm("Are you sure you want to reverse the chargeback for invoice " + tranId + "?\\n\\nThis will create a payment record to pay off the invoice.")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Processing chargeback reversal...");' +
                '    window.location.href = "' + scriptUrl + '&action=reverseChargeback&invoiceId=" + invoiceId;' +
                '}' +
                'function jeWriteOff(invoiceId) {' +
                '    if (!invoiceId) {' +
                '        alert("Invalid invoice ID");' +
                '        return;' +
                '    }' +
                '    if (!confirm("Are you sure you want to write off this invoice?\\n\\nThis will create a journal entry to write off the balance to COGS.")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Creating journal entry write-off...");' +
                '    window.location.href = "' + scriptUrl + '&action=jeWriteOff&invoiceId=" + invoiceId;' +
                '}' +
                'var searchTimeout;' +
                'var selectedCustomerId = null;' +
                'var allCustomers = [];' +
                'document.addEventListener("DOMContentLoaded", function() {' +
                '    var customerSearch = document.getElementById("customerSearch");' +
                '    if (customerSearch) {' +
                '        customerSearch.addEventListener("input", function() {' +
                '            clearTimeout(searchTimeout);' +
                '            var query = this.value;' +
                '            if (query.length < 2) {' +
                '                document.getElementById("searchResults").style.display = "none";' +
                '                return;' +
                '            }' +
                '            searchTimeout = setTimeout(function() {' +
                '                searchCustomers(query);' +
                '            }, 300);' +
                '        });' +
                '    }' +
                '    document.addEventListener("click", function(e) {' +
                '        var searchResults = document.getElementById("searchResults");' +
                '        var customerSearch = document.getElementById("customerSearch");' +
                '        if (searchResults && customerSearch && e.target.id !== "customerSearch" && !searchResults.contains(e.target)) {' +
                '            searchResults.style.display = "none";' +
                '        }' +
                '    });' +
                '});' +
                'function searchCustomers(query) {' +
                '    var url = "' + scriptUrl + '&action=searchCustomers&query=" + encodeURIComponent(query);' +
                '    fetch(url)' +
                '        .then(function(response) { return response.json(); })' +
                '        .then(function(data) {' +
                '            allCustomers = data;' +
                '            displaySearchResults(data);' +
                '        })' +
                '        .catch(function(error) {' +
                '            console.error("Search error:", error);' +
                '        });' +
                '}' +
                'function displaySearchResults(customers) {' +
                '    var resultsDiv = document.getElementById("searchResults");' +
                '    if (!resultsDiv) return;' +
                '    if (customers.error) {' +
                '        resultsDiv.innerHTML = "<div class=\\"search-result-item\\">Error: " + escapeHtmlClient(customers.error) + "</div>";' +
                '        resultsDiv.style.display = "block";' +
                '        return;' +
                '    }' +
                '    if (customers.length === 0) {' +
                '        resultsDiv.innerHTML = "<div class=\\"search-result-item\\">No customers found</div>";' +
                '        resultsDiv.style.display = "block";' +
                '        return;' +
                '    }' +
                '    var html = "";' +
                '    for (var i = 0; i < customers.length; i++) {' +
                '        html += "<div class=\\"search-result-item\\" data-customer-index=\\"" + i + "\\">" + escapeHtmlClient(customers[i].text) + "</div>";' +
                '    }' +
                '    resultsDiv.innerHTML = html;' +
                '    resultsDiv.style.display = "block";' +
                '    attachCustomerClickHandlers();' +
                '}' +
                'function attachCustomerClickHandlers() {' +
                '    var items = document.querySelectorAll(".search-result-item[data-customer-index]");' +
                '    for (var i = 0; i < items.length; i++) {' +
                '        items[i].addEventListener("click", function() {' +
                '            var index = parseInt(this.getAttribute("data-customer-index"));' +
                '            if (allCustomers[index]) {' +
                '                selectCustomer(allCustomers[index].id, allCustomers[index].text);' +
                '            }' +
                '        });' +
                '    }' +
                '}' +
                'function escapeHtmlClient(text) {' +
                '    var div = document.createElement("div");' +
                '    div.textContent = text;' +
                '    return div.innerHTML;' +
                '}' +
                'function selectCustomer(id, text) {' +
                '    console.log("Customer selected:", id, text);' +
                '    document.getElementById("customerSearch").value = text;' +
                '    document.getElementById("selectedCustomerId").value = id;' +
                '    document.getElementById("searchResults").style.display = "none";' +
                '    selectedCustomerId = id;' +
                '    loadPaidInvoices(id);' +
                '}' +
                'function loadPaidInvoices(customerId) {' +
                '    console.log("Loading transactions for customer:", customerId);' +
                '    document.getElementById("invoiceResults").innerHTML = "<div class=\\"search-count\\">Loading transactions...</div>";' +
                '    var url = "' + scriptUrl + '&action=getPaidInvoices&customerId=" + customerId;' +
                '    fetch(url)' +
                '        .then(function(response) { return response.json(); })' +
                '        .then(function(data) {' +
                '            console.log("Transactions loaded:", data);' +
                '            displayInvoices(data);' +
                '        })' +
                '        .catch(function(error) {' +
                '            console.error("Transaction load error:", error);' +
                '            document.getElementById("invoiceResults").innerHTML = "<div class=\\"error-msg\\">Error loading transactions: " + error + "</div>";' +
                '        });' +
                '}' +
                'function displayInvoices(data) {' +
                '    if (data.error) {' +
                '        document.getElementById("invoiceResults").innerHTML = "<div class=\\"error-msg\\">Error: " + escapeHtmlClient(data.error) + "</div>";' +
                '        return;' +
                '    }' +
                '    var invoices = data.invoices || [];' +
                '    var deposits = data.deposits || [];' +
                '    var refunds = data.refunds || [];' +
                '    var html = "";' +
                '    var hasInvoices = invoices.length > 0;' +
                '    var hasDeposits = deposits.length > 0;' +
                '    var hasRefunds = refunds.length > 0;' +
                '    if (!hasInvoices && !hasDeposits && !hasRefunds) {' +
                '        document.getElementById("invoiceResults").innerHTML = "<div class=\\"search-count\\">No paid invoices, unapplied deposits, or customer refunds found for this customer</div>";' +
                '        return;' +
                '    }' +
                '    if (hasInvoices && hasDeposits) {' +
                '        html += "<div class=\\"search-title\\" style=\\"margin-top: 15px; color: #dc3545;\\">⚠️ MIXED SCENARIO DETECTED</div>";' +
                '        html += "<div class=\\"search-count\\" style=\\"background-color: #fff3cd; padding: 12px; border: 1px solid #ffc107; border-radius: 4px; margin-bottom: 15px;\\">";' +
                '        html += "<strong style=\\"display: block; margin-bottom: 8px;\\">This customer has BOTH paid invoices and unapplied deposits.</strong>";' +
                '        html += "<div style=\\"margin-bottom: 8px;\\">If your chargeback/NSF amount spans both:</div>";' +
                '        html += "<ol style=\\"margin: 8px 0; padding-left: 20px;\\">";' +
                '        html += "<li style=\\"margin-bottom: 6px;\\"><strong>Process the invoiced portion</strong> using the invoice chargeback/NSF process below<br>";' +
                '        html += "<em style=\\"font-size: 11px; color: #666;\\">(Creates Credit Memo → Customer Refund → New Invoice)</em></li>";' +
                '        html += "<li style=\\"margin-bottom: 6px;\\"><strong>Process the deposit portion</strong> using the deposit refund process below<br>";' +
                '        html += "<em style=\\"font-size: 11px; color: #666;\\">(Creates Customer Refund from unapplied deposit)</em></li>";' +
                '        html += "<li style=\\"margin-bottom: 6px;\\"><strong>Both refunds will hit Undeposited Funds</strong><br>";' +
                '        html += "<em style=\\"font-size: 11px; color: #666;\\">(Accounting will combine via Make Deposit to match bank records)</em></li>";' +
                '        html += "</ol>";' +
                '        html += "<div style=\\"background-color: #e7f3ff; padding: 8px; border-left: 3px solid #2196F3; margin-top: 10px; font-size: 11px;\\">";' +
                '        html += "<strong>Why process separately?</strong> NetSuite cannot partially link deposits to sales orders. ";' +
                '        html += "Processing separately ensures accurate A/R reporting and accurate Sales Order balance due, while still allowing ";' +
                '        html += "Accounting to combine the refunds for bank reconciliation.";' +
                '        html += "</div>";' +
                '        html += "</div>";' +
                '    }' +
                '    if (hasInvoices) {' +
                '        html += "<div class=\\"search-title\\" style=\\"margin-top: 15px;\\">Paid Invoices</div>";' +
                '        html += "<div class=\\"search-count\\">Results: " + invoices.length + "</div>";' +
                '        html += buildInvoicesTable(invoices);' +
                '    }' +
                '    if (hasDeposits) {' +
                '        html += "<div class=\\"search-title\\" style=\\"margin-top: 25px;\\">Unapplied Customer Deposits</div>";' +
                '        html += "<div class=\\"search-count\\">Results: " + deposits.length + "</div>";' +
                '        html += buildDepositsTable(deposits);' +
                '    }' +
                '    if (hasRefunds) {' +
                '        html += "<div class=\\"search-title\\" style=\\"margin-top: 25px;\\">Customer Refunds - Duplicate Refund Creation</div>";' +
                '        html += "<div class=\\"search-count\\">Results: " + refunds.length + "</div>";' +
                '        html += buildRefundsTable(refunds);' +
                '    }' +
                '    document.getElementById("invoiceResults").innerHTML = html;' +
                '}' +
                'function buildInvoicesTable(invoices) {' +
                '    var html = "<table class=\\"search-table\\">";' +
                '    html += "<thead><tr><th>Action</th><th>Invoice #</th><th>Date</th><th>Amount</th><th>Memo</th></tr></thead><tbody>";' +
                '    for (var i = 0; i < invoices.length; i++) {' +
                '        var inv = invoices[i];' +
                '        html += "<tr>";' +
                '        html += "<td class=\\"action-cell\\">";' +
                '        var hasDispute = inv.hasDisputeChargeback || false;' +
                '        var hasFraud = inv.hasFraudChargeback || false;' +
                '        var disabledClass = (hasDispute || hasFraud) ? " disabled" : "";' +
                '        var disabledAttr = (hasDispute || hasFraud) ? " disabled" : "";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn chargeback-btn" + disabledClass + "\\"" + disabledAttr + " onclick=\\"processAction(\'chargeback_\' + inv.id, \'" + inv.id + "\', \'chargeback\')\\\">Process Dispute Chargeback</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn fraud-btn" + disabledClass + "\\"" + disabledAttr + " onclick=\\"processAction(\'fraud_\' + inv.id, \'" + inv.id + "\', \'fraud\')\\\">Process Fraud Chargeback</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn nsf-btn\\" onclick=\\"processAction(\'nsf_\' + inv.id, \'" + inv.id + "\', \'nsf\')\\\">Process NSF Check</button>";' +
                '        html += "</td>";' +
                '        html += "<td><a href=\\"/app/accounting/transactions/custinvc.nl?id=" + inv.id + "\\" target=\\"_blank\\">" + escapeHtmlClient(inv.tranid) + "</a></td>";' +
                '        html += "<td>" + escapeHtmlClient(inv.date) + "</td>";' +
                '        html += "<td style=\\"font-weight: bold;\\">$" + parseFloat(inv.amount).toFixed(2) + "</td>";' +
                '        html += "<td>" + escapeHtmlClient(inv.memo) + "</td>";' +
                '        html += "</tr>";' +
                '    }' +
                '    html += "</tbody></table>";' +
                '    return html;' +
                '}' +
                'function buildDepositsTable(deposits) {' +
                '    var html = "<table class=\\"search-table\\">";' +
                '    html += "<thead><tr><th>Action</th><th>Deposit #</th><th>Date</th><th>Unapplied Amount</th><th>Sales Order</th><th>Memo</th></tr></thead><tbody>";' +
                '    for (var i = 0; i < deposits.length; i++) {' +
                '        var dep = deposits[i];' +
                '        html += "<tr>";' +
                '        html += "<td class=\\"action-cell\\">";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn chargeback-btn\\" onclick=\\"submitDepositRefund(\'" + dep.id + "\', \'chargeback\')\\\">Create Dispute CD Refund</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn fraud-btn\\" onclick=\\"submitDepositRefund(\'" + dep.id + "\', \'fraud\')\\\">Create Fraud CD Refund</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn nsf-btn\\" onclick=\\"submitDepositRefund(\'" + dep.id + "\', \'nsf\')\\\">Create NSF CD Refund</button>";' +
                '        html += "</td>";' +
                '        html += "<td><a href=\\"/app/accounting/transactions/custdep.nl?id=" + dep.id + "\\" target=\\"_blank\\">" + escapeHtmlClient(dep.tranid) + "</a></td>";' +
                '        html += "<td>" + escapeHtmlClient(dep.date) + "</td>";' +
                '        html += "<td style=\\"font-weight: bold;\\">$" + parseFloat(dep.amountRemaining).toFixed(2) + "</td>";' +
                '        html += "<td>";' +
                '        if (dep.salesOrder && dep.salesOrderId) {' +
                '            html += "<a href=\\"/app/accounting/transactions/salesord.nl?id=" + dep.salesOrderId + "\\" target=\\"_blank\\">" + escapeHtmlClient(dep.salesOrder) + "</a>";' +
                '        } else {' +
                '            html += "<em style=\\"color: #999;\\">No SO</em>";' +
                '        }' +
                '        html += "</td>";' +
                '        html += "<td>" + escapeHtmlClient(dep.memo) + "</td>";' +
                '        html += "</tr>";' +
                '    }' +
                '    html += "</tbody></table>";' +
                '    return html;' +
                '}' +
                'function buildRefundsTable(refunds) {' +
                '    var html = "<table class=\\"search-table\\">";' +
                '    html += "<thead><tr><th>Action</th><th>Refund #</th><th>Date</th><th>Amount</th><th>Status</th><th>Memo</th></tr></thead><tbody>";' +
                '    for (var i = 0; i < refunds.length; i++) {' +
                '        var ref = refunds[i];' +
                '        html += "<tr>";' +
                '        html += "<td class=\\"action-cell\\">";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn chargeback-btn\\" onclick=\\"submitDuplicateRefund(\'" + ref.id + "\', \'freedompay\')\\\">Process Duplicate FreedomPay Refund</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn fraud-btn\\" onclick=\\"submitDuplicateRefund(\'" + ref.id + "\', \'chargeback\')\\\">Process Duplicate Chargeback Refund</button>";' +
                '        html += "</td>";' +
                '        html += "<td><a href=\\"/app/accounting/transactions/custrfnd.nl?id=" + ref.id + "\\" target=\\"_blank\\">" + escapeHtmlClient(ref.tranid) + "</a></td>";' +
                '        html += "<td>" + escapeHtmlClient(ref.date) + "</td>";' +
                '        html += "<td style=\\"font-weight: bold;\\">$" + parseFloat(ref.amount).toFixed(2) + "</td>";' +
                '        html += "<td>" + escapeHtmlClient(ref.status) + "</td>";' +
                '        html += "<td>" + escapeHtmlClient(ref.memo) + "</td>";' +
                '        html += "</tr>";' +
                '    }' +
                '    html += "</tbody></table>";' +
                '    return html;' +
                '}' +
                'function submitDepositRefund(depositId, type) {' +
                '    var typeText = type === "nsf" ? "NSF Check" : (type === "fraud" ? "Fraud Chargeback" : "Dispute Chargeback");' +
                '    if (!confirm("Process " + typeText + " for this deposit?\\n\\nThis will create a customer refund from the unapplied deposit amount.")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Processing deposit refund...");' +
                '    var form = document.createElement("form");' +
                '    form.method = "POST";' +
                '    form.action = "' + scriptUrl + '";' +
                '    var actionInput = document.createElement("input");' +
                '    actionInput.type = "hidden";' +
                '    actionInput.name = "action";' +
                '    actionInput.value = "processDepositRefund";' +
                '    form.appendChild(actionInput);' +
                '    var depositInput = document.createElement("input");' +
                '    depositInput.type = "hidden";' +
                '    depositInput.name = "depositId";' +
                '    depositInput.value = depositId;' +
                '    form.appendChild(depositInput);' +
                '    var typeInput = document.createElement("input");' +
                '    typeInput.type = "hidden";' +
                '    typeInput.name = "type";' +
                '    typeInput.value = type;' +
                '    form.appendChild(typeInput);' +
                '    document.body.appendChild(form);' +
                '    form.submit();' +
                '}' +
                'function submitDuplicateRefund(refundId, type) {' +
                '    var typeText = type === "freedompay" ? "Duplicate FreedomPay Refund in Error" : "Duplicate Chargeback Refund";' +
                '    var confirmMsg = "⚠️ IMPORTANT WARNING ⚠️\\n\\n";' +
                '    confirmMsg += "This process should ONLY be used when:\\n";' +
                '    confirmMsg += "• There is NO appropriate invoice to refund\\n";' +
                '    confirmMsg += "• There is NO unapplied customer deposit to refund\\n";' +
                '    confirmMsg += "• A refund was already processed correctly AND\\n";' +
                '    confirmMsg += "• That same refund was then processed AGAIN in error\\n\\n";' +
                '    confirmMsg += "This creates records to track a duplicate refund that has no backing transaction.\\n\\n";' +
                '    confirmMsg += "Do you understand and wish to proceed with creating a " + typeText + "?";' +
                '    if (!confirm(confirmMsg)) {' +
                '        return;' +
                '    }' +
                '    showLoading("Processing duplicate refund...");' +
                '    var form = document.createElement("form");' +
                '    form.method = "POST";' +
                '    form.action = "' + scriptUrl + '";' +
                '    var actionInput = document.createElement("input");' +
                '    actionInput.type = "hidden";' +
                '    actionInput.name = "action";' +
                '    actionInput.value = "processDuplicateRefund";' +
                '    form.appendChild(actionInput);' +
                '    var refundInput = document.createElement("input");' +
                '    refundInput.type = "hidden";' +
                '    refundInput.name = "refundId";' +
                '    refundInput.value = refundId;' +
                '    form.appendChild(refundInput);' +
                '    var typeInput = document.createElement("input");' +
                '    typeInput.type = "hidden";' +
                '    typeInput.name = "type";' +
                '    typeInput.value = type;' +
                '    form.appendChild(typeInput);' +
                '    document.body.appendChild(form);' +
                '    form.submit();' +
                '}' +
                'function markDisputeUploaded(invoiceId, tranId) {' +
                '    var caseNumber = prompt("Enter Dispute Case Number (required):", "");' +
                '    if (caseNumber === null) {' +
                '        return;' +
                '    }' +
                '    caseNumber = caseNumber.trim();' +
                '    if (caseNumber === "") {' +
                '        alert("Dispute Case Number is required. Please try again.");' +
                '        return;' +
                '    }' +
                '    if (!confirm("Mark dispute files as uploaded for invoice " + tranId + "?\\n\\nDispute Case #: " + caseNumber + "\\n\\nThis will remove the invoice from the Dispute Submissions list.")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Marking dispute files as uploaded...");' +
                '    window.location.href = "' + scriptUrl + '&action=markDisputeUploaded&invoiceId=" + invoiceId + "&tranId=" + encodeURIComponent(tranId) + "&disputeCaseNumber=" + encodeURIComponent(caseNumber);' +
                '}' +
                'function processAction(dataId, invoiceId, type) {' +
                '    var typeText = type === "nsf" ? "NSF Check" : (type === "fraud" ? "Fraud Chargeback" : "Dispute Chargeback");' +
                '    if (!confirm("Are you sure you want to process this " + typeText + "?")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Processing " + typeText + "...");' +
                '    var form = document.createElement("form");' +
                '    form.method = "POST";' +
                '    form.action = "' + scriptUrl + '";' +
                '    var actionInput = document.createElement("input");' +
                '    actionInput.type = "hidden";' +
                '    actionInput.name = "action";' +
                '    actionInput.value = "process";' +
                '    form.appendChild(actionInput);' +
                '    var invoiceInput = document.createElement("input");' +
                '    invoiceInput.type = "hidden";' +
                '    invoiceInput.name = "invoiceId";' +
                '    invoiceInput.value = invoiceId;' +
                '    form.appendChild(invoiceInput);' +
                '    var typeInput = document.createElement("input");' +
                '    typeInput.type = "hidden";' +
                '    typeInput.name = "type";' +
                '    typeInput.value = type;' +
                '    form.appendChild(typeInput);' +
                '    document.body.appendChild(form);' +
                '    form.submit();' +
                '}';
        }


        /**
         * Handles JE write-off by creating journal entry and applying it to invoice
         * @param {Object} context
         */
        function handleJeWriteOff(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;

            log.debug('JE Write-Off Request', 'Invoice ID: ' + invoiceId);

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice to get necessary details
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var customerId = invoiceRecord.getValue('entity');
                var customerName = invoiceRecord.getText('entity');
                var tranId = invoiceRecord.getValue('tranid');
                var amountDue = invoiceRecord.getValue('amountremaining');
                var department = invoiceRecord.getValue('department');
                var subsidiary = invoiceRecord.getValue('subsidiary');

                log.debug('Invoice Details Loaded', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    customerId: customerId,
                    customerName: customerName,
                    amountDue: amountDue,
                    department: department,
                    subsidiary: subsidiary
                });

                if (!amountDue || amountDue <= 0) {
                    throw new Error('Invoice has no amount due to write off');
                }

                if (!department) {
                    throw new Error('Invoice must have a department to create write-off journal entry');
                }

                // Create Journal Entry
                var journalEntry = record.create({
                    type: record.Type.JOURNAL_ENTRY,
                    isDynamic: true
                });

                // Set header fields
                journalEntry.setValue({
                    fieldId: 'trandate',
                    value: new Date()
                });

                if (subsidiary) {
                    journalEntry.setValue({
                        fieldId: 'subsidiary',
                        value: subsidiary
                    });
                }

                var memoText = 'Lost Dispute - Automated Journal Entry - See ' + tranId;
                journalEntry.setValue({
                    fieldId: 'memo',
                    value: memoText
                });

                log.debug('JE Header Set', {
                    subsidiary: subsidiary,
                    memo: memoText
                });

                // Line 1: Credit to Accounts Receivable (Account 119) with Customer
                journalEntry.selectNewLine({ sublistId: 'line' });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'account',
                    value: 119 // AR Account
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'credit',
                    value: amountDue
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'entity',
                    value: customerId
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'memo',
                    value: memoText
                });

                journalEntry.commitLine({ sublistId: 'line' });

                log.debug('JE Line 1 Added', {
                    account: 119,
                    credit: amountDue,
                    entity: customerId
                });

                // Line 2: Debit to COGS (Account 353) with Department
                journalEntry.selectNewLine({ sublistId: 'line' });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'account',
                    value: 353 // COGS Account
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'debit',
                    value: amountDue
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'department',
                    value: department
                });

                journalEntry.setCurrentSublistValue({
                    sublistId: 'line',
                    fieldId: 'memo',
                    value: memoText
                });

                journalEntry.commitLine({ sublistId: 'line' });

                log.debug('JE Line 2 Added', {
                    account: 353,
                    debit: amountDue,
                    department: department
                });

                // Save the Journal Entry
                var jeId = journalEntry.save();

                log.audit('Journal Entry Created', {
                    jeId: jeId,
                    invoiceId: invoiceId,
                    amount: amountDue
                });

                // Get the JE tranid
                var jeRecord = record.load({
                    type: record.Type.JOURNAL_ENTRY,
                    id: jeId,
                    isDynamic: false
                });
                var jeTranId = jeRecord.getValue('tranid');

                log.debug('JE Details', {
                    jeId: jeId,
                    jeTranId: jeTranId
                });

                // Now apply the JE to the invoice using customer payment
                var applicationResult = applyJournalEntryToInvoice(invoiceId, jeId, amountDue, customerId);

                if (!applicationResult.success) {
                    throw new Error('Journal Entry created but failed to apply to invoice: ' + applicationResult.error);
                }

                log.audit('JE Write-Off Complete', {
                    jeId: jeId,
                    jeTranId: jeTranId,
                    invoiceId: invoiceId,
                    tranId: tranId,
                    amount: amountDue,
                    applied: applicationResult.success,
                    paymentDeleted: applicationResult.paymentDeleted
                });

                // Redirect back with success - include BOTH invoiceId and tranId
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        writeOffSuccess: 'true',
                        customer: encodeURIComponent(customerName),
                        invoiceId: invoiceId,
                        invoice: tranId,
                        jeId: jeId,
                        jeTranId: jeTranId,
                        amount: amountDue
                    }
                });

            } catch (e) {
                log.error('JE Write-Off Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                // Redirect back with error
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('JE Write-Off Error: ' + e.toString())
                    }
                });
            }
        }

        /**
         * Applies a journal entry to an invoice using customer payment (based on working scheduled script)
         * @param {string} invoiceId - Invoice internal ID
         * @param {string} jeId - Journal Entry internal ID
         * @param {number} amount - Amount to apply
         * @param {string} customerId - Customer internal ID
         * @returns {Object} Result object with success flag
         */
        function applyJournalEntryToInvoice(invoiceId, jeId, amount, customerId) {
            try {
                log.debug('Applying JE to Invoice', {
                    invoiceId: invoiceId,
                    jeId: jeId,
                    amount: amount,
                    customerId: customerId
                });

                // Transform the invoice into a customer payment
                var customerPayment = record.transform({
                    fromType: record.Type.INVOICE,
                    fromId: invoiceId,
                    toType: record.Type.CUSTOMER_PAYMENT,
                    isDynamic: false
                });

                // Set basic payment fields
                customerPayment.setValue({
                    fieldId: 'trandate',
                    value: new Date()
                });

                customerPayment.setValue({
                    fieldId: 'paymentmethod',
                    value: 15 // ACCT'G payment method
                });

                customerPayment.setValue({
                    fieldId: 'memo',
                    value: 'Auto-applied from JE write-off - TEMP RECORD TO BE DELETED'
                });

                customerPayment.setValue({
                    fieldId: 'payment',
                    value: amount
                });

                log.debug('Payment header values set');

                // STEP 1: Clear all auto-selected apply lines
                var applyLineCount = customerPayment.getLineCount({ sublistId: 'apply' });

                for (var i = 0; i < applyLineCount; i++) {
                    var isApplied = customerPayment.getSublistValue({
                        sublistId: 'apply',
                        fieldId: 'apply',
                        line: i
                    });

                    if (isApplied) {
                        customerPayment.setSublistValue({
                            sublistId: 'apply',
                            fieldId: 'apply',
                            line: i,
                            value: false
                        });

                        customerPayment.setSublistValue({
                            sublistId: 'apply',
                            fieldId: 'amount',
                            line: i,
                            value: 0
                        });
                    }
                }

                log.debug('Cleared auto-selected apply lines');

                // STEP 2: Select the credit (JE) transaction
                var creditLineCount = customerPayment.getLineCount({ sublistId: 'credit' });
                var creditLineUpdated = false;

                log.debug('Credit line count', creditLineCount);

                for (var c = 0; c < creditLineCount; c++) {
                    var creditDocId = customerPayment.getSublistValue({
                        sublistId: 'credit',
                        fieldId: 'doc',
                        line: c
                    });

                    if (creditDocId == jeId) {
                        customerPayment.setSublistValue({
                            sublistId: 'credit',
                            fieldId: 'apply',
                            line: c,
                            value: true
                        });

                        customerPayment.setSublistValue({
                            sublistId: 'credit',
                            fieldId: 'amount',
                            line: c,
                            value: amount
                        });

                        creditLineUpdated = true;
                        log.debug('Selected credit transaction', {
                            line: c,
                            jeId: jeId,
                            amount: amount
                        });
                        break;
                    }
                }

                if (!creditLineUpdated) {
                    throw new Error('Could not find JE in credit lines');
                }

                // STEP 3: Select the invoice to apply to
                applyLineCount = customerPayment.getLineCount({ sublistId: 'apply' });
                var invoiceLineUpdated = false;

                for (var j = 0; j < applyLineCount; j++) {
                    var docId = customerPayment.getSublistValue({
                        sublistId: 'apply',
                        fieldId: 'doc',
                        line: j
                    });

                    if (docId == invoiceId) {
                        customerPayment.setSublistValue({
                            sublistId: 'apply',
                            fieldId: 'apply',
                            line: j,
                            value: true
                        });

                        customerPayment.setSublistValue({
                            sublistId: 'apply',
                            fieldId: 'amount',
                            line: j,
                            value: amount
                        });

                        invoiceLineUpdated = true;
                        log.debug('Selected invoice for application', {
                            line: j,
                            invoiceId: invoiceId,
                            amount: amount
                        });
                        break;
                    }
                }

                if (!invoiceLineUpdated) {
                    throw new Error('Could not find invoice in apply lines');
                }

                // STEP 4: Save the payment to apply the credit
                var paymentId = customerPayment.save();

                log.debug('Customer payment saved', {
                    paymentId: paymentId,
                    appliedAmount: amount
                });

                // STEP 5: Delete the temporary payment record
                try {
                    record.delete({
                        type: record.Type.CUSTOMER_PAYMENT,
                        id: paymentId
                    });

                    log.debug('Temporary payment deleted', {
                        paymentId: paymentId
                    });

                    return {
                        success: true,
                        paymentDeleted: true,
                        deletedPaymentId: paymentId
                    };

                } catch (deleteError) {
                    log.error('Error deleting temporary payment', {
                        error: deleteError.toString(),
                        paymentId: paymentId
                    });

                    return {
                        success: true,
                        paymentDeleted: false,
                        paymentId: paymentId,
                        deleteError: deleteError.toString()
                    };
                }

            } catch (e) {
                log.error('Error applying JE to invoice', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId,
                    jeId: jeId
                });

                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        return {
            onRequest: onRequest
        };
    });