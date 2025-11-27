/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/search', 'N/record', 'N/redirect', 'N/log', 'N/runtime', 'N/email', 'N/url', 'N/render', 'N/file', 'N/encode', 'N/https'],
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
     * @param {encode} encode
     * @param {https} https
     */

    function (serverWidget, search, record, redirect, log, runtime, email, url, render, file, encode, https) {
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
  * UPDATED: Added handlers for new actions
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

            // Handle create response record action
            if (request.parameters.action === 'createResponseRecord') {
                handleCreateResponseRecord(context);
                return;
            }

            // Handle mark dispute uploaded action
            if (request.parameters.action === 'markDisputeUploaded') {
                handleMarkDisputeUploaded(context);
                return;
            }

            // Handle load customer transactions for PDF generation
            if (request.parameters.action === 'loadCustomerTransactions') {
                handleLoadCustomerTransactions(context);
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
 * NEW: Handles AJAX request to load customer transactions for PDF generation
 * @param {Object} context
 */
        function handleLoadCustomerTransactions(context) {
            var request = context.request;
            var response = context.response;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Load Customer Transactions Request', {
                invoiceId: invoiceId
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load invoice to get customer
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var customerId = invoiceRecord.getValue('entity');

                log.debug('Customer Retrieved from Invoice', {
                    invoiceId: invoiceId,
                    customerId: customerId
                });

                // Search for transactions
                var transactions = searchCustomerTransactionsForPDF(customerId);

                response.write(JSON.stringify({
                    success: true,
                    transactions: transactions
                }));

            } catch (e) {
                log.error('Load Customer Transactions Error', {
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
  * NEW: Handles creating a Chargeback Response custom record
  * UPDATED: Set initial status to Pending Completion AND set Return Policy checkbox to true
  * @param {Object} context
  */
        function handleCreateResponseRecord(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;
            var tranId = request.parameters.tranId;

            log.debug('Create Response Record Request', {
                invoiceId: invoiceId,
                tranId: tranId
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load the invoice to get customer
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var customerId = invoiceRecord.getValue('entity');
                var customerName = invoiceRecord.getText('entity');

                log.debug('Invoice Details Loaded', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    customerId: customerId,
                    customerName: customerName
                });

                // Create the Chargeback Response custom record
                var responseRecord = record.create({
                    type: 'customrecord_chargeback_response',
                    isDynamic: false
                });

                // Set customer field
                responseRecord.setValue({
                    fieldId: 'custrecord_customer',
                    value: customerId
                });

                // Set transaction field (multiple select - pass as array)
                responseRecord.setValue({
                    fieldId: 'custrecord_transaction',
                    value: [invoiceId]
                });

                // Set initial status to Pending Completion
                responseRecord.setValue({
                    fieldId: 'custrecord_status',
                    value: '1' // Pending Completion
                });

                // NEW: Set Return Policy checkbox to true by default
                responseRecord.setValue({
                    fieldId: 'custrecord_bray_scarff_return_policy_doc',
                    value: true
                });

                var responseRecordId = responseRecord.save();

                log.audit('Chargeback Response Record Created', {
                    responseRecordId: responseRecordId,
                    invoiceId: invoiceId,
                    tranId: tranId,
                    customerId: customerId,
                    initialStatus: 'Pending Completion',
                    returnPolicyChecked: true
                });

                // Redirect back to the Suitelet
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        responseCreated: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId,
                        invoice: tranId,
                        customer: encodeURIComponent(customerName)
                    }
                });

            } catch (e) {
                log.error('Create Response Record Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Create Response Record Error: ' + e.toString())
                    }
                });
            }
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
  * NEW: Searches for customer transactions for PDF generation
  * UPDATED: Sort oldest to newest, include chargeback checkbox fields
  * UPDATED: Only show Sales Orders, Invoices, and Credit Memos
  * @param {string} customerId - Customer internal ID
  * @returns {Array} Array of transaction objects
  */
        function searchCustomerTransactionsForPDF(customerId) {
            if (!customerId) {
                return [];
            }

            log.debug('Searching Customer Transactions for PDF', {
                customerId: customerId,
                types: ['Sales Order', 'Invoice', 'Credit Memo'],
                limits: 'No date or count limits',
                sorting: 'Oldest to Newest'
            });

            var transactionSearch = search.create({
                type: search.Type.TRANSACTION,
                filters: [
                    ['entity', 'anyof', customerId],
                    'AND',
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['type', 'anyof', ['SalesOrd', 'CustInvc', 'CustCred']]
                ],
                columns: [
                    search.createColumn({ name: 'tranid', sort: search.Sort.ASC }), // CHANGED: Sort oldest to newest
                    search.createColumn({ name: 'trandate', sort: search.Sort.ASC }), // CHANGED: Also sort by date ascending
                    search.createColumn({ name: 'type' }),
                    search.createColumn({ name: 'amount' }),
                    search.createColumn({ name: 'status' }),
                    search.createColumn({ name: 'memo' }),
                    search.createColumn({ name: 'custbody_bas_cc_dispute' }), // NEW: Credit card dispute checkbox
                    search.createColumn({ name: 'custbody_bas_fraud' }) // NEW: Fraud checkbox
                ]
            });

            var results = [];

            transactionSearch.run().each(function (result) {
                var transType = result.getValue('type');
                var typeLabel = result.getText('type');

                // NEW: Get checkbox values
                var ccDisputeValue = result.getValue('custbody_bas_cc_dispute');
                var fraudValue = result.getValue('custbody_bas_fraud');

                // Convert to boolean
                var hasCCDispute = ccDisputeValue === 'T' || ccDisputeValue === true;
                var hasFraud = fraudValue === 'T' || fraudValue === true;

                results.push({
                    id: result.id,
                    tranid: result.getValue('tranid'),
                    date: result.getValue('trandate'),
                    type: transType,
                    typeLabel: typeLabel,
                    amount: result.getValue('amount'),
                    status: result.getText('status'),
                    memo: result.getValue('memo') || '',
                    hasCCDispute: hasCCDispute, // NEW
                    hasFraud: hasFraud // NEW
                });

                return true;
            });

            log.debug('Customer Transactions Found for PDF', {
                customerId: customerId,
                count: results.length,
                sampleTypes: results.slice(0, 3).map(function (r) {
                    return {
                        type: r.typeLabel,
                        tranid: r.tranid,
                        hasCCDispute: r.hasCCDispute,
                        hasFraud: r.hasFraud
                    };
                })
            });

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
   * UPDATED: Use proper file URL from NetSuite file object
   * UPDATED: Moved SOP Quick Link inside suitelet container
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

            // MOVED: SOP Quick Link inside container, at the top right
            html += '<div class="sop-link-container">';
            html += '<a href="https://8289753.app.netsuite.com/app/site/hosting/scriptlet.nl?script=3923&deploy=1#11" target="_blank" class="sop-quick-link">';
            html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;">';
            html += '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>';
            html += '<polyline points="14 2 14 8 20 8"></polyline>';
            html += '<line x1="16" y1="13" x2="8" y2="13"></line>';
            html += '<line x1="16" y1="17" x2="8" y2="17"></line>';
            html += '<polyline points="10 9 9 9 8 9"></polyline>';
            html += '</svg>';
            html += '<span>SOP Quick Link</span>';
            html += '</a>';
            html += '</div>';

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

            // UPDATED: Use proper file URL from NetSuite
            if (params.disputeFormSaved === 'true') {
                var responseRecordId = params.responseRecordId || '';
                var filesProcessed = parseInt(params.filesProcessed || '0', 10);
                var fileErrors = parseInt(params.fileErrors || '0', 10);
                var mergedPDFCreated = params.mergedPDFCreated === 'true';
                var mergedFileName = decodeURIComponent(params.mergedFileName || '');
                var mergedFileId = params.mergedFileId || '';

                html += '<div class="success-msg">';
                html += '<strong>Dispute Form Saved Successfully</strong><br>';
                html += 'Response Record: <a href="/app/common/custom/custrecordentry.nl?rectype=2666&id=' + responseRecordId + '" target="_blank">Response #' + responseRecordId + '</a><br>';
                html += 'All fields and checkboxes have been updated.';

                if (filesProcessed > 0) {
                    html += '<br><strong>' + filesProcessed + ' file(s) uploaded successfully</strong>';
                }

                if (mergedPDFCreated && mergedFileName && mergedFileId) {
                    // UPDATED: Load the file to get the proper URL with hash
                    try {
                        var mergedFile = file.load({ id: mergedFileId });
                        var fileUrl = mergedFile.url;

                        // Make sure the URL is absolute
                        if (fileUrl && fileUrl.indexOf('http') !== 0) {
                            fileUrl = 'https://' + runtime.accountId + '.app.netsuite.com' + fileUrl;
                        }

                        log.debug('Merged PDF URL Retrieved', {
                            fileId: mergedFileId,
                            fileName: mergedFileName,
                            fileUrl: fileUrl
                        });

                        html += '<br><strong>✓ Merged PDF Created:</strong> ';
                        html += '<a href="' + fileUrl + '" target="_blank" style="color: #0066cc; font-weight: bold;">' + escapeHtml(mergedFileName) + '</a>';

                        // Auto-download script using the proper URL
                        html += '<script>';
                        html += 'setTimeout(function() {';
                        html += '    var link = document.createElement("a");';
                        html += '    link.href = "' + fileUrl + '";';
                        html += '    link.download = "' + escapeHtml(mergedFileName) + '";';
                        html += '    link.target = "_blank";';
                        html += '    document.body.appendChild(link);';
                        html += '    link.click();';
                        html += '    document.body.removeChild(link);';
                        html += '}, 500);';
                        html += '</script>';
                    } catch (fileLoadError) {
                        log.error('Error Loading Merged File for URL', {
                            error: fileLoadError.toString(),
                            fileId: mergedFileId
                        });
                        // Fallback to simple display without link
                        html += '<br><strong>✓ Merged PDF Created:</strong> ' + escapeHtml(mergedFileName);
                    }
                }

                if (fileErrors > 0) {
                    html += '<br><span style="color: #dc3545;">⚠️ ' + fileErrors + ' file(s) failed to upload</span>';
                }

                html += '</div>';
            }

            // File removed success message
            if (params.fileRemoved === 'true') {
                html += '<div class="success-msg">';
                html += '<strong>File Removed Successfully</strong>';
                html += '</div>';
            }

            // UPDATED: Response record created success message - removed instruction to click button
            if (params.responseCreated === 'true') {
                var customer = decodeURIComponent(params.customer || 'Customer');
                var invoiceTranId = params.invoice || '';
                var responseRecordId = params.responseRecordId || '';
                html += '<div class="success-msg">';
                html += '<strong>Chargeback Response Record Created for ' + escapeHtml(customer) + '</strong><br>';
                html += 'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + params.invoiceId + '" target="_blank">' + escapeHtml(invoiceTranId) + '</a><br>';
                html += 'Response Record: <a href="/app/common/custom/custrecordentry.nl?rectype=2666&id=' + responseRecordId + '" target="_blank">Response #' + responseRecordId + '</a><br>';
                html += 'You can now fill in the submission checklist and attach required files.';
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
            html += buildDisputeSubmissionsTable(params);

            // Global chargeback tracking section
            html += '<div class="search-title" style="margin-top: 30px;">Open Chargeback & NSF Invoices - All Customers</div>';
            html += '<div class="search-count">All customers with open chargeback or NSF check invoices</div>';
            html += buildGlobalTrackingTable();

            html += '</div>';

            return html;
        }

        /**
 * NEW: Generates a simple hash for file download URL (NetSuite requires this)
 * @param {string} fileId - File internal ID
 * @returns {string} Hash value for download URL
 */
        function getFileDownloadHash(fileId) {
            // NetSuite's file download URL requires a hash parameter
            // This is a simplified version - the actual hash is generated by NetSuite
            // For direct file downloads, we can use the file.url property instead
            return fileId; // Placeholder - will use file.url in actual implementation
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
  * UPDATED: Get case number from response record instead of prompting user
  * @param {Object} context
  */
        function handleMarkDisputeUploaded(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;
            var tranId = request.parameters.tranId;
            var responseRecordId = request.parameters.responseRecordId;

            log.debug('Mark Dispute Uploaded Request', {
                invoiceId: invoiceId,
                tranId: tranId,
                responseRecordId: responseRecordId
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                if (!responseRecordId) {
                    throw new Error('Response Record ID is required');
                }

                // Load response record to get case number
                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                var disputeCaseNumber = responseRecord.getValue('custrecord_case_number') || '';

                log.debug('Response Record Loaded', {
                    responseRecordId: responseRecordId,
                    disputeCaseNumber: disputeCaseNumber
                });

                // Load invoice to get current memo and customer name
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var existingMemo = invoiceRecord.getValue('memo') || '';
                var customerName = invoiceRecord.getText('entity');

                // Build the new memo text with dispute case number if available
                var newMemoText;
                if (disputeCaseNumber && disputeCaseNumber.trim() !== '') {
                    newMemoText = 'Dispute Response Submitted - Case #' + disputeCaseNumber.trim();
                } else {
                    newMemoText = 'Dispute Response Submitted';
                }

                // Append to existing memo with hyphen separator if memo exists
                var updateMemo = existingMemo ? existingMemo + ' - ' + newMemoText : newMemoText;

                // Update both memo and checkbox using submitFields
                record.submitFields({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    values: {
                        memo: updateMemo,
                        custbody_chargeback_dispute_submitted: true
                    }
                });

                // Update response record status to Submitted
                record.submitFields({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    values: {
                        custrecord_status: '3' // Submitted
                    }
                });

                log.audit('Dispute Response Marked as Submitted', {
                    invoiceId: invoiceId,
                    tranId: tranId,
                    disputeCaseNumber: disputeCaseNumber || 'Not provided',
                    existingMemo: existingMemo,
                    newMemo: updateMemo,
                    checkboxSet: true,
                    responseRecordId: responseRecordId,
                    responseStatusUpdated: 'Submitted'
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
                        disputeCaseNumber: encodeURIComponent(disputeCaseNumber || 'Not provided')
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
  * UPDATED: Enable/disable Response Submitted button based on response record status
  * @param {Object} params - URL parameters
  * @returns {string} HTML table
  */
        function buildDisputeSubmissionsTable(params) {
            try {
                var invoices = searchChargebacksNeedingDisputeFiles();

                log.debug('Dispute Submissions Table - Invoices Found', {
                    count: invoices.length,
                    invoiceDetails: invoices.map(function (inv) {
                        return {
                            id: inv.id,
                            tranid: inv.tranid,
                            hasResponseRecord: !!inv.responseRecordId,
                            responseRecordId: inv.responseRecordId || 'NONE',
                            status: inv.status || 'NONE',
                            responseStatus: inv.responseStatus || 'NONE',
                            responseStatusId: inv.responseStatusId || 'NONE'
                        };
                    })
                });

                if (invoices.length === 0) {
                    return '<div class="search-count">No chargebacks pending dispute file attachments</div>';
                }

                var html = '<div class="search-count">Results: ' + invoices.length + '</div>';
                html += '<table class="search-table dispute-table">';
                html += '<thead><tr>';
                html += '<th>Customer</th>';
                html += '<th>Invoice #</th>';
                html += '<th>Date Created</th>';
                html += '<th>Amount</th>';
                html += '<th>Type</th>';
                html += '<th>Status</th>';
                html += '<th>Memo</th>';
                html += '<th>Response Record</th>';
                html += '<th>Action</th>';
                html += '</tr></thead><tbody>';

                for (var i = 0; i < invoices.length; i++) {
                    var inv = invoices[i];

                    log.debug('Processing Invoice for Display', {
                        index: i,
                        invoiceId: inv.id,
                        tranid: inv.tranid,
                        responseRecordId: inv.responseRecordId || 'NONE',
                        responseStatus: inv.responseStatus || 'NONE',
                        responseStatusId: inv.responseStatusId || 'NONE',
                        willBuildChecklistRow: !!inv.responseRecordId
                    });

                    // Main row
                    html += '<tr class="main-row">';
                    html += '<td>' + escapeHtml(inv.customer) + '</td>';
                    html += '<td><a href="/app/accounting/transactions/custinvc.nl?id=' + inv.id + '" target="_blank">' + escapeHtml(inv.tranid) + '</a></td>';
                    html += '<td>' + escapeHtml(inv.dateCreated) + '</td>';
                    html += '<td>$' + parseFloat(inv.amount).toFixed(2) + '</td>';
                    html += '<td>' + escapeHtml(inv.type) + '</td>';
                    html += '<td>' + escapeHtml(inv.status) + '</td>';
                    html += '<td style="font-size: 11px;">' + escapeHtml(inv.memo || '') + '</td>';

                    // Response Record column with status
                    html += '<td style="font-size: 11px;">';
                    if (inv.responseRecordId) {
                        html += '<a href="/app/common/custom/custrecordentry.nl?rectype=2666&id=' + inv.responseRecordId + '" target="_blank" style="color: #0066cc;">';
                        html += 'Response #' + inv.responseRecordId;
                        html += '</a>';
                        if (inv.responseStatus) {
                            html += '<br><span style="color: #666; font-size: 10px;">Status: ' + escapeHtml(inv.responseStatus) + '</span>';
                        }
                    } else {
                        html += '<span style="color: #999; font-style: italic;">No response record</span>';
                    }
                    html += '</td>';

                    // Action column - conditional button states based on response status
                    html += '<td class="action-cell">';

                    if (inv.responseRecordId) {
                        // Show Edit Checklist button
                        html += '<button type="button" class="action-btn payment-link-btn" onclick="toggleSubmissionChecklist(\'' + inv.id + '\', \'' + inv.responseRecordId + '\')">Edit Submission Checklist</button>';

                        // Enable Response Submitted button ONLY if status = "2" (Completed, Pending Submission)
                        var isCompleted = inv.responseStatusId === '2';
                        var disabledAttr = isCompleted ? '' : ' disabled';
                        var disabledTitle = isCompleted ? '' : ' title="Complete the submission checklist before marking as submitted"';

                        html += '<button type="button" class="action-btn writeoff-btn"' + disabledAttr + disabledTitle + ' onclick="markDisputeUploaded(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\', \'' + inv.responseRecordId + '\')">Response Submitted</button>';
                    } else {
                        // Show Create Response Record button, disable Response Submitted
                        html += '<button type="button" class="action-btn payment-link-btn" onclick="createResponseRecord(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Create Response Record</button>';
                        html += '<button type="button" class="action-btn writeoff-btn" disabled title="Create a response record first">Response Submitted</button>';
                    }

                    html += '</td>';
                    html += '</tr>';

                    // Submission Checklist row - DON'T auto-expand after save
                    if (inv.responseRecordId) {
                        log.debug('Calling buildSubmissionChecklistRow', {
                            invoiceId: inv.id,
                            responseRecordId: inv.responseRecordId
                        });

                        var checklistHtml = buildSubmissionChecklistRow(inv.id, inv.responseRecordId, params);

                        log.debug('buildSubmissionChecklistRow returned', {
                            invoiceId: inv.id,
                            responseRecordId: inv.responseRecordId,
                            htmlLength: checklistHtml ? checklistHtml.length : 0,
                            htmlEmpty: !checklistHtml || checklistHtml === ''
                        });

                        html += checklistHtml;
                    } else {
                        log.debug('Skipping checklist row - no response record', {
                            invoiceId: inv.id,
                            tranid: inv.tranid
                        });
                    }
                }

                html += '</tbody></table>';
                return html;
            } catch (e) {
                log.error('Dispute Submissions Table Error', 'Error: ' + e.toString() + ' | Stack: ' + e.stack);
                return '<div class="error-msg">Error loading dispute submissions data: ' + escapeHtml(e.toString()) + '</div>';
            }
        }

        /**
 * Merges all files attached to a response record into a single PDF using PDF.co API
 * 
 * Creates a combined PDF document from all files attached to a chargeback response record.
 * The function:
 * 1. Retrieves all attached files from the response record
 * 2. Makes files temporarily public for PDF.co to access
 * 3. Calls PDF.co /pdf/merge2 endpoint to merge files (auto-converts non-PDFs)
 * 4. Downloads the merged PDF and saves it to NetSuite File Cabinet
 * 5. Attaches the merged PDF back to the response record
 * 
 * Filename format: DISPUTE_SUBMISSION_[CustomerID]_[CustomerName].pdf
 * 
 * @param {string} responseRecordId - Internal ID of the chargeback response custom record
 * @param {string} invoiceTranId - Transaction ID of the related invoice (used for logging only)
 * @returns {Object} Result object with the following properties:
 * @returns {boolean} returns.success - Whether the merge operation succeeded
 * @returns {string} [returns.mergedFileId] - Internal ID of the created merged PDF file (if successful)
 * @returns {string} [returns.mergedFileName] - Name of the created merged PDF file (if successful)
 * @returns {number} [returns.originalFileCount] - Number of files that were merged (if successful)
 * @returns {string} [returns.error] - Error message (if unsuccessful)
 * @returns {string} [returns.message] - Informational message (e.g., "No files to merge")
 * 
 * @throws Does not throw - returns error object instead
 * 
 * @requires N/record - For loading response and customer records
 * @requires N/file - For file operations
 * @requires N/https - For PDF.co API calls
 * @requires N/runtime - For script parameters (API key)
 * @requires Script Parameter: custscript_pdfco_api_key - PDF.co API key
 * 
 * @example
 * var result = mergeAttachedFilesIntoPDF('12345', 'INV-2024-001');
 * if (result.success) {
 *     log.audit('PDF Merged', 'File ID: ' + result.mergedFileId);
 * } else {
 *     log.error('Merge Failed', result.error);
 * }
 */

        function mergeAttachedFilesIntoPDF(responseRecordId, invoiceTranId) {
            try {
                log.debug('Merging Attached Files into PDF using PDF.co', {
                    responseRecordId: responseRecordId,
                    invoiceTranId: invoiceTranId
                });

                // Get script parameter for PDF.co API key
                var script = runtime.getCurrentScript();
                var API_KEY = script.getParameter({
                    name: 'custscript_pdfco_api_key'
                });

                if (!API_KEY) {
                    log.error('Missing PDF.co API Key parameter');
                    return {
                        success: false,
                        error: 'PDF.co API Key parameter not configured'
                    };
                }

                // Get all attached files
                var attachedFiles = searchFilesAttachedToRecord(responseRecordId);

                if (attachedFiles.length === 0) {
                    log.debug('No files to merge');
                    return { success: false, message: 'No files to merge' };
                }

                log.debug('Files to merge', {
                    count: attachedFiles.length,
                    files: attachedFiles.map(function (f) { return f.name; })
                });

                // NEW: Load response record to get customer info
                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                var customerId = responseRecord.getValue('custrecord_customer');

                // Load customer record to get customer name
                var customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId,
                    isDynamic: false
                });

                var customerEntityId = customerRecord.getValue('entityid');
                var customerName = customerRecord.getValue('companyname') || customerRecord.getValue('altname') || customerEntityId;

                // Clean customer name for filename (remove special characters)
                var cleanCustomerName = customerName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

                log.debug('Customer Info Retrieved', {
                    customerId: customerId,
                    customerEntityId: customerEntityId,
                    customerName: customerName,
                    cleanCustomerName: cleanCustomerName
                });

                // Prepare file URLs for PDF.co API
                var fileUrls = [];
                for (var i = 0; i < attachedFiles.length; i++) {
                    var fileObj = file.load({
                        id: attachedFiles[i].id
                    });

                    // Make file public temporarily for PDF.co to access
                    fileObj.isOnline = true;
                    var publicFileId = fileObj.save();

                    // Reload to get public URL
                    var publicFile = file.load({
                        id: publicFileId
                    });

                    var publicUrl = publicFile.url;
                    if (publicUrl && publicUrl.indexOf('http') !== 0) {
                        publicUrl = 'https://system.netsuite.com' + publicUrl;
                    }

                    fileUrls.push(publicUrl);

                    log.debug('File made public for merging', {
                        fileId: attachedFiles[i].id,
                        fileName: fileObj.name,
                        publicUrl: publicUrl
                    });
                }

                // UPDATED: New filename format with customer ID and name
                var mergedFileName = 'DISPUTE_SUBMISSION_' + customerEntityId + '_' + cleanCustomerName + '.pdf';

                var jsonPayload = JSON.stringify({
                    url: fileUrls.join(','),
                    name: mergedFileName,
                    async: false
                });

                var response = https.post({
                    url: 'https://api.pdf.co/v1/pdf/merge2',
                    body: jsonPayload,
                    headers: {
                        'x-api-key': API_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                log.debug('PDF.co API Response', {
                    statusCode: response.code,
                    responseBody: response.body
                });

                if (response.code === 200) {
                    var data = JSON.parse(response.body);

                    if (data.error == false) {
                        log.debug('PDF merge successful', {
                            mergedPdfUrl: data.url,
                            originalFileCount: attachedFiles.length,
                            newFileName: mergedFileName
                        });

                        // Download merged PDF from PDF.co
                        var mergedPdfResponse = https.get({
                            url: data.url
                        });

                        if (mergedPdfResponse.code === 200) {
                            // Save merged PDF to NetSuite
                            var mergedFileObj = file.create({
                                name: mergedFileName,
                                fileType: file.Type.PDF,
                                contents: mergedPdfResponse.body,
                                folder: 2762649,
                                description: 'Merged dispute files for Response Record #' + responseRecordId + ' - Customer: ' + customerName
                            });

                            var mergedFileId = mergedFileObj.save();

                            log.debug('Merged PDF saved to NetSuite', {
                                fileId: mergedFileId,
                                fileName: mergedFileName
                            });

                            // Attach merged PDF to response record
                            record.attach({
                                record: { type: 'file', id: mergedFileId },
                                to: { type: 'customrecord_chargeback_response', id: responseRecordId }
                            });

                            log.audit('Merged PDF Attached to Response Record', {
                                mergedFileId: mergedFileId,
                                mergedFileName: mergedFileName,
                                responseRecordId: responseRecordId,
                                originalFileCount: attachedFiles.length,
                                customerId: customerId,
                                customerName: customerName
                            });

                            return {
                                success: true,
                                mergedFileId: mergedFileId,
                                mergedFileName: mergedFileName,
                                originalFileCount: attachedFiles.length
                            };
                        } else {
                            log.error('Failed to download merged PDF from PDF.co', {
                                statusCode: mergedPdfResponse.code,
                                url: data.url
                            });
                            return {
                                success: false,
                                error: 'Failed to download merged PDF: HTTP ' + mergedPdfResponse.code
                            };
                        }
                    } else {
                        log.error('PDF.co merge error', {
                            error: data.message
                        });
                        return {
                            success: false,
                            error: data.message
                        };
                    }
                } else {
                    log.error('PDF.co API request failed', {
                        statusCode: response.code,
                        responseBody: response.body
                    });
                    return {
                        success: false,
                        error: 'HTTP ' + response.code
                    };
                }

            } catch (e) {
                log.error('Error Merging Files into PDF', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId,
                    message: e.message
                });
                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        /**
         * Helper function to get MIME type for image embedding
         * @param {string} fileType - NetSuite file type constant
         * @returns {string} MIME type
         */
        function getImageMimeType(fileType) {
            if (fileType === file.Type.PNGIMAGE) return 'png';
            if (fileType === file.Type.JPGIMAGE) return 'jpeg';
            if (fileType === file.Type.GIFIMAGE) return 'gif';
            return 'png'; // default
        }

        /**
  * Helper function to escape XML special characters
  * @param {string} text - Text to escape
  * @returns {string} Escaped text
  */
        function escapeXml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        /**
  * Builds the submission checklist row for a dispute
  * UPDATED: Reorganized File Attachments section with consistent formatting
  * @param {string} invoiceId - Invoice internal ID
  * @param {string} responseRecordId - Response record internal ID
  * @param {Object} params - URL parameters
  * @returns {string} HTML table row
  */
        function buildSubmissionChecklistRow(invoiceId, responseRecordId, params) {
            log.debug('Building Submission Checklist Row - START', {
                invoiceId: invoiceId,
                responseRecordId: responseRecordId
            });

            try {
                // Load the response record to get current values
                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                var caseNumber = responseRecord.getValue('custrecord_case_number') || '';
                var coverLetter = responseRecord.getValue('custrecord_cover_letter') || '';

                // NEW: Get count of already attached files
                var attachedFiles = searchFilesAttachedToRecord(responseRecordId);
                var existingFileCount = attachedFiles.length;

                // Get checkbox states
                var r01eChecked = responseRecord.getValue('custrecord_dispute_notification_from_com');
                var netsuiteTransChecked = responseRecord.getValue('custrecord_all_relevant_netsuite_transac');
                var returnPolicyChecked = responseRecord.getValue('custrecord_bray_scarff_return_policy_doc');
                var deliveryPhotosChecked = responseRecord.getValue('custrecord_delivery_pictures_from_dispat');
                var correspondenceChecked = responseRecord.getValue('custrecord_correspondence_from_sales');

                var shouldExpand = (params.responseCreated === 'true') && params.responseRecordId === responseRecordId;
                var displayStyle = shouldExpand ? 'table-row' : 'none';

                var html = '<tr class="checklist-row" id="checklist-' + invoiceId + '" style="display: ' + displayStyle + ';">';
                html += '<td colspan="9" style="background-color: #f8f9fa; padding: 20px;">';
                html += '<div style="border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; background-color: white;">';

                // NEW: Add hidden input to store existing file count for JavaScript validation
                html += '<input type="hidden" id="existing-file-count-' + invoiceId + '" value="' + existingFileCount + '" />';

                html += '<div id="checklist-scroll-target-' + invoiceId + '"></div>';
                html += '<h3 style="margin-top: 0; color: #4CAF50; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">Dispute Submission Checklist</h3>';

                html += '<div id="checklist-form-' + invoiceId + '" style="display: grid; gap: 20px;">';

                // ============================================================================
                // SECTION 1: TEXT FIELDS (TOP)
                // ============================================================================
                html += '<div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; border: 1px solid #ddd;">';
                html += '<h4 style="margin-top: 0; color: #333;">Text Fields <span style="color: #dc3545;">*</span></h4>';

                html += '<div class="form-field">';
                html += '<label for="case-number-' + invoiceId + '" style="display: block; font-weight: bold; margin-bottom: 5px;">';
                html += '<span style="color: #dc3545;">* </span>Case # ';
                html += '<span style="color: #666; font-weight: normal; font-size: 11px; font-style: italic;">(Found in Commerce Control Center)</span>';
                html += '</label>';
                html += '<input type="text" id="case-number-' + invoiceId + '" value="' + escapeHtml(caseNumber) + '" required ';
                html += 'style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" />';
                html += '</div>';

                html += '<div class="form-field">';
                html += '<label for="cover-letter-' + invoiceId + '" style="display: block; font-weight: bold; margin-bottom: 5px;">';
                html += '<span style="color: #dc3545;">* </span>Description for Cover Letter ';
                html += '<span style="color: #666; font-weight: normal; font-size: 11px; font-style: italic;">(Describe the facts as to why this dispute should be reversed. Examples: Full refund was already issue. Customer agreed to a monetary settlement that was already issued. Customer still has the disputed item in their posession. Customer claims "fraud" but has the items delivered to their address.)</span>';
                html += '</label>';
                html += '<textarea id="cover-letter-' + invoiceId + '" rows="4" required ';
                html += 'style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit;">' + escapeHtml(coverLetter) + '</textarea>';
                html += '</div>';

                html += '</div>';

                // ============================================================================
                // SECTION 2: FILE ATTACHMENTS (MIDDLE) - REORGANIZED WITH CONSISTENT FORMATTING
                // ============================================================================
                html += '<div id="file-upload-section-' + invoiceId + '" style="background-color: #e7f3ff; padding: 15px; border-radius: 4px; border: 1px solid #2196F3;">';
                html += '<h4 style="margin-top: 0; color: #333;">File Attachments <span style="color: #dc3545;">*</span></h4>';

                // ===== SUBSECTION 1: Attach NetSuite Transaction PDFs =====
                html += '<div style="background-color: #fff; padding: 12px; border-radius: 4px; border: 1px solid #00a6deff; margin-bottom: 15px;">';
                html += '<h5 style="margin: 0 0 8px 0; color: #333; font-size: 13px; font-weight: bold;">Attach NetSuite Transaction PDFs</h5>';
                html += '<div style="margin-bottom: 10px; font-size: 12px; color: #666;">';
                html += 'Click "Load Transactions" to attach relevant NetSuite transaction PDFs.';
                html += '</div>';
                html += '<button type="button" class="action-btn" style="background-color: #00a6deff; margin-bottom: 10px;" ';
                html += 'onclick="loadCustomerTransactions(\'' + invoiceId + '\', \'' + responseRecordId + '\')">Load Transactions</button>';
                html += '<div id="transaction-list-' + invoiceId + '" style="display: none; margin-top: 10px; max-height: 250px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; background: #fafafa;"></div>';
                html += '</div>';

                // ===== SUBSECTION 2: Attach Manual Files =====
                html += '<div style="background-color: #fff; padding: 12px; border-radius: 4px; border: 1px solid #00a6deff; margin-bottom: 15px;">';
                html += '<h5 style="margin: 0 0 8px 0; color: #333; font-size: 13px; font-weight: bold;">Attach Manual Files</h5>';
                html += '<div style="margin-bottom: 10px; font-size: 12px; color: #666;">';
                html += 'Choose files, click "Add to Queue". Queue as many as needed. See the "Requirements Checklist" for required file attachments.';
                html += '</div>';

                html += '<div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">';
                html += '<input type="file" id="multi-file-input-' + invoiceId + '" multiple ';
                html += 'style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" ';
                html += 'accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />';
                html += '<button type="button" class="action-btn" style="background-color: #28a745; white-space: nowrap;" ';
                html += 'onclick="addFilesToQueue(\'' + invoiceId + '\')">Add to Queue</button>';
                html += '</div>';

                // File queue display area
                html += '<div id="file-queue-' + invoiceId + '" style="margin-bottom: 15px; display: none;">';
                html += '<h5 style="margin: 0 0 10px 0; color: #333; font-size: 13px; font-weight: bold;">Queued Files</h5>';
                html += '<ul id="file-queue-list-' + invoiceId + '" style="list-style: none; padding: 0; margin: 0; border: 1px solid #ddd; border-radius: 4px; background: white;"></ul>';
                html += '</div>';

                // Attached files list
                html += buildAttachedFilesList(responseRecordId, invoiceId);

                html += '</div>';

                // ===== SUBSECTION 3: Requirements Checklist =====
                html += '<div style="background-color: #fff; padding: 12px; border-radius: 4px; border: 1px solid #00a6deff;">';
                html += '<h5 style="margin: 0 0 8px 0; color: #333; font-size: 13px; font-weight: bold;">Requirements Checklist</h5>';

                // Required checkboxes
                html += buildCheckboxField(invoiceId, 'r01e-checkbox', 'Completed R01E or C01E', 'Part of downloaded PDF from Commerce Control Center. R01E for normal disputes, C01E for fraud.', r01eChecked, true);
                html += buildCheckboxField(invoiceId, 'netsuite-trans-checkbox', 'Relevant NetSuite Transactions', 'Include any transaction relevant to the dispute which may include the original Invoice, the original Sales Order, or both if helpful (one is required) plus any appropriate Credit Memo if a refund was issued.', netsuiteTransChecked, true);
                html += buildCheckboxField(invoiceId, 'return-policy-checkbox', 'Return Policy Document', 'Automatically attached to all disputes when "Save & Merge" is clicked.', returnPolicyChecked, true);

                // Optional checkboxes
                html += buildCheckboxField(invoiceId, 'delivery-photos-checkbox', 'Delivery Photos from DispatchTrack or Proof of Delivery', 'Any relevant proof of delivery.', deliveryPhotosChecked, false);
                html += buildCheckboxField(invoiceId, 'correspondence-checkbox', 'Correspondence from Sales', 'Include evidence that customer ID was verified, if available.', correspondenceChecked, false);

                html += '</div>';

                html += '</div>'; // End file-upload-section

                html += '</div>'; // End checklist-form

                // Action buttons at bottom
                html += '<div style="margin-top: 20px; display: flex; gap: 10px; justify-content: space-between; align-items: center; border-top: 1px solid #ddd; padding-top: 15px;">';

                html += '<div style="font-size: 11px; color: #666;">';
                html += '<span style="color: #dc3545;">*</span> = Required field';
                html += '</div>';

                html += '<div style="display: flex; gap: 10px;">';
                html += '<button type="button" class="action-btn" style="background-color: #28a745; font-size: 13px; padding: 8px 16px;" ';
                html += 'onclick="saveDisputeFormWithFiles(\'' + invoiceId + '\', \'' + responseRecordId + '\')">Save & Merge</button>';
                html += '<button type="button" class="action-btn" style="background-color: #6c757d;" ';
                html += 'onclick="toggleSubmissionChecklist(\'' + invoiceId + '\', \'' + responseRecordId + '\')">Close Checklist</button>';
                html += '</div>';

                html += '</div>';

                html += '</div>'; // End border div
                html += '</td>';
                html += '</tr>';

                return html;
            } catch (e) {
                log.error('Error Building Submission Checklist Row', {
                    error: e.toString(),
                    stack: e.stack
                });
                return '';
            }
        }

        /**
 * NEW: Builds a checkbox field for the requirements section
 * @param {string} invoiceId - Invoice ID
 * @param {string} fieldId - Field ID
 * @param {string} label - Field label
 * @param {string} note - Helper note
 * @param {boolean} isChecked - Current checkbox state
 * @param {boolean} isRequired - Whether field is required
 * @returns {string} HTML for checkbox field
 */
        function buildCheckboxField(invoiceId, fieldId, label, note, isChecked, isRequired) {
            var checkedAttr = (isChecked === true || isChecked === 'T') ? ' checked' : '';
            var requiredLabel = isRequired ? '<span style="color: #dc3545;">* </span>' : '';
            var requiredTag = isRequired ? '' : '<span style="color: #666; font-weight: normal; font-size: 11px;"> (Optional - Required If Available)</span>';

            var html = '<div class="form-field" style="margin-bottom: 12px;">';
            html += '<label style="display: flex; align-items: flex-start; cursor: pointer;">';
            html += '<input type="checkbox" id="' + fieldId + '-' + invoiceId + '" ';
            html += 'style="margin-right: 10px; margin-top: 3px; width: 18px; height: 18px; cursor: pointer;"' + checkedAttr + ' />';
            html += '<div style="flex: 1;">';
            html += '<span style="font-weight: bold;">' + requiredLabel + escapeHtml(label) + requiredTag + '</span><br>';
            html += '<span style="color: #666; font-size: 11px; font-style: italic;">' + escapeHtml(note) + '</span>';
            html += '</div>';
            html += '</label>';
            html += '</div>';

            return html;
        }

        /**
  * NEW: Builds the attached files list with remove capability
  * FIXED: Corrected filter syntax for file search
  * @param {string} responseRecordId - Response record internal ID
  * @param {string} invoiceId - Invoice ID for context
  * @returns {string} HTML for attached files list
  */
        function buildAttachedFilesList(responseRecordId, invoiceId) {
            try {
                var attachedFiles = searchFilesAttachedToRecord(responseRecordId);

                var html = '<div style="margin-top: 15px; border-top: 1px solid #ddd; padding-top: 15px;">';
                html += '<h5 style="margin: 0 0 10px 0; color: #333;">Previously Attached Files <span style="color: #dc3545;">*</span></h5>';

                if (attachedFiles.length === 0) {
                    html += '<p style="color: #999; font-style: italic; margin: 0;">No files attached yet (at least 1 file required)</p>';
                } else {
                    html += '<ul style="list-style: none; padding: 0; margin: 0;">';
                    for (var i = 0; i < attachedFiles.length; i++) {
                        var f = attachedFiles[i];
                        html += '<li style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">';
                        html += '<div>';
                        html += '<a href="' + f.url + '" target="_blank" style="color: #0066cc; text-decoration: none;">' + escapeHtml(f.name) + '</a>';
                        html += ' <span style="color: #666; font-size: 11px;">(' + formatFileSize(f.size) + ' - ' + f.created + ')</span>';
                        html += '</div>';
                        html += '<button type="button" class="action-btn" style="background-color: #dc3545; font-size: 11px; padding: 4px 8px;" ';
                        html += 'onclick="removeFile(\'' + f.id + '\', \'' + responseRecordId + '\', \'' + invoiceId + '\')">Remove</button>';
                        html += '</li>';
                    }
                    html += '</ul>';
                }

                html += '</div>';

                return html;
            } catch (e) {
                log.error('Error Building Attached Files List', e.toString());
                return '<div style="color: #dc3545;">Error loading attached files</div>';
            }
        }

        /**
  * NEW: Searches for files attached to a custom record
  * UPDATED: Filter out old merged documents and auto-generated files
  * @param {string} responseRecordId - Response record internal ID
  * @param {boolean} excludeGeneratedFiles - If true, exclude old DISPUTE_SUBMISSION, COVER_LETTER, and Return_Policy files
  * @returns {Array} Array of file objects
  */
        function searchFilesAttachedToRecord(responseRecordId, excludeGeneratedFiles) {
            try {
                log.debug('Searching Files Attached to Record', {
                    responseRecordId: responseRecordId,
                    excludeGeneratedFiles: excludeGeneratedFiles || false
                });

                // Search the custom record and join to attached files
                var fileSearch = search.create({
                    type: 'customrecord_chargeback_response',
                    filters: [
                        ['internalid', 'anyof', responseRecordId]
                    ],
                    columns: [
                        search.createColumn({ name: 'name', join: 'file', sort: search.Sort.ASC }),
                        search.createColumn({ name: 'documentsize', join: 'file' }),
                        search.createColumn({ name: 'created', join: 'file' }),
                        search.createColumn({ name: 'url', join: 'file' }),
                        search.createColumn({ name: 'internalid', join: 'file' })
                    ]
                });

                var files = [];

                fileSearch.run().each(function (result) {
                    var fileId = result.getValue({ name: 'internalid', join: 'file' });
                    var fileName = result.getValue({ name: 'name', join: 'file' });

                    // Only add if we got a file ID (some records may not have files)
                    if (fileId) {
                        // NEW: Skip auto-generated files if requested
                        if (excludeGeneratedFiles) {
                            var lowerFileName = fileName.toLowerCase();

                            // Check if this is a file we should exclude
                            var isDisputeSubmission = lowerFileName.indexOf('dispute_submission_') === 0;
                            var isCoverLetter = lowerFileName.indexOf('cover_letter_') === 0;
                            var isReturnPolicy = lowerFileName === 'return_policy.pdf';

                            if (isDisputeSubmission || isCoverLetter || isReturnPolicy) {
                                log.debug('Excluding Auto-Generated File', {
                                    fileId: fileId,
                                    fileName: fileName,
                                    reason: isDisputeSubmission ? 'Old merged document' :
                                        (isCoverLetter ? 'Old cover letter' : 'Return policy (will be re-attached)')
                                });
                                return true; // Skip this file, continue to next
                            }
                        }

                        files.push({
                            id: fileId,
                            name: fileName,
                            size: result.getValue({ name: 'documentsize', join: 'file' }),
                            created: result.getValue({ name: 'created', join: 'file' }),
                            url: result.getValue({ name: 'url', join: 'file' })
                        });

                        log.debug('File Found Attached to Record', {
                            fileId: fileId,
                            fileName: fileName,
                            responseRecordId: responseRecordId
                        });
                    }

                    return true;
                });

                log.debug('Files Attached to Record - Final Count', {
                    responseRecordId: responseRecordId,
                    excludeGeneratedFiles: excludeGeneratedFiles || false,
                    fileCount: files.length,
                    files: files.map(function (f) { return { id: f.id, name: f.name }; })
                });

                return files;

            } catch (e) {
                log.error('Error Searching Attached Files', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId
                });
                return [];
            }
        }

        /**
         * NEW: Formats file size for display
         * @param {number} bytes - File size in bytes
         * @returns {string} Formatted file size
         */
        function formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            var k = 1024;
            var sizes = ['B', 'KB', 'MB', 'GB'];
            var i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
        }

        /**
  * NEW: Creates a cover letter PDF for dispute submission
  * FIXED: Convert single \n to <br/>, double \n\n to paragraph breaks
  * @param {string} caseNumber - Dispute case number
  * @param {string} coverLetterText - User-provided description
  * @param {string} customerId - Customer internal ID
  * @param {string} customerEntityId - Customer entity ID
  * @param {string} customerName - Customer name
  * @param {string} responseRecordId - Response record ID for description
  * @returns {Object} Result object with file ID and name
  */
        function createCoverLetterPDF(caseNumber, coverLetterText, customerId, customerEntityId, customerName, responseRecordId) {
            try {
                log.debug('Creating Cover Letter PDF', {
                    caseNumber: caseNumber,
                    customerId: customerId,
                    customerName: customerName,
                    responseRecordId: responseRecordId,
                    coverLetterTextLength: coverLetterText ? coverLetterText.length : 0
                });

                // Get current user info
                var currentUser = runtime.getCurrentUser();
                var userId = currentUser.id;
                var userName = currentUser.name;

                try {
                    var userRecord = record.load({
                        type: record.Type.EMPLOYEE,
                        id: userId,
                        isDynamic: false
                    });

                    var displayName = userRecord.getValue('altname') || userRecord.getValue('entityid');

                    if (displayName) {
                        userName = displayName;
                    } else {
                        userName = currentUser.name.replace(/^\d+\s+/, '');
                    }

                    log.debug('User Name Retrieved', {
                        userId: userId,
                        originalName: currentUser.name,
                        displayName: userName
                    });

                } catch (userLoadError) {
                    log.error('Error loading user record - using parsed name', {
                        error: userLoadError.toString(),
                        originalName: currentUser.name
                    });
                    userName = currentUser.name.replace(/^\d+\s+/, '');
                }

                // Format today's date
                var today = new Date();
                var formattedDate = (today.getMonth() + 1) + '/' + today.getDate() + '/' + today.getFullYear();

                // Build the cover letter HTML with proper BFO structure
                var html = '<?xml version="1.0"?>\n';
                html += '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n';
                html += '<pdf>\n';
                html += '<head>\n';
                html += '<style type="text/css">\n';
                // UPDATED: Remove line-height, use margins and padding instead
                html += 'body { font-family: Arial, sans-serif; font-size: 11pt; margin: 40px; }\n';
                html += 'p { margin: 0 0 18px 0; padding: 0; }\n';  // 18px bottom margin for spacing
                html += '.subject { font-weight: bold; font-size: 12pt; margin-bottom: 18px; }\n';
                html += '.date { margin-bottom: 24px; }\n';
                html += '.salutation { margin-bottom: 18px; }\n';
                html += '.body-text { margin-bottom: 18px; text-align: justify; }\n';
                html += '.description-paragraph { margin: 0 0 18px 0; text-align: justify; }\n';  // Increased margin
                html += '.signature { margin-top: 36px; }\n';
                html += '</style>\n';
                html += '</head>\n';
                html += '<body>\n';

                // Subject line
                html += '<p class="subject">Subject: Chargeback Challenge - Case ' + escapeXml(caseNumber) + '</p>\n';

                // Date
                html += '<p class="date">Date: ' + formattedDate + '</p>\n';

                // Salutation
                html += '<p class="salutation">To Whom It May Concern,</p>\n';

                // Opening paragraph
                html += '<p class="body-text">';
                html += 'We are formally disputing the chargeback associated with case <b>' + escapeXml(caseNumber) + '</b>. ';
                html += 'We request that the chargeback be reversed based on the following facts:';
                html += '</p>\n';

                // UPDATED: User-provided description - use <br/><br/> for line breaks within paragraphs
                if (coverLetterText && coverLetterText.trim() !== '') {
                    var paragraphs = coverLetterText.trim().split(/\n\n+/);

                    for (var i = 0; i < paragraphs.length; i++) {
                        var para = paragraphs[i].trim();
                        if (para !== '') {
                            var escapedPara = escapeXml(para);
                            // CHANGED: Use <br/><br/> instead of single <br/> for more vertical space
                            var paraWithBreaks = escapedPara.replace(/\n/g, '<br/><br/>');
                            html += '<p class="description-paragraph">' + paraWithBreaks + '</p>\n';
                        }
                    }
                } else {
                    html += '<p class="description-paragraph">[No description provided]</p>\n';
                }

                // Closing paragraph
                html += '<p class="body-text">';
                html += 'Please let us know if any additional documentation is needed. We are happy to provide supporting records.';
                html += '</p>\n';

                html += '<p class="body-text">';
                html += 'Thank you for your attention to this matter.';
                html += '</p>\n';

                // Signature
                html += '<div class="signature">\n';
                html += '<p style="margin: 0 0 6px 0;">Sincerely,</p>\n';
                html += '<p style="margin: 0 0 6px 0;"><b>' + escapeXml(userName) + '</b></p>\n';
                html += '<p style="margin: 0 0 6px 0;">Accounting Department</p>\n';
                html += '<p style="margin: 0;">Bray &amp; Scarff</p>\n';
                html += '</div>\n';

                html += '</body>\n';
                html += '</pdf>';

                log.debug('Cover Letter HTML Generated', {
                    htmlLength: html.length,
                    hasCoverLetterText: !!(coverLetterText && coverLetterText.trim() !== ''),
                    userName: userName,
                    paragraphCount: coverLetterText ? coverLetterText.trim().split(/\n\n+/).length : 0
                });

                // Render the HTML to PDF
                var pdfFile = render.xmlToPdf({
                    xmlString: html
                });

                // Create filename
                var cleanCustomerName = customerName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
                var fileName = 'COVER_LETTER_' + customerEntityId + '_' + cleanCustomerName + '.pdf';

                // Save to File Cabinet
                var fileObj = file.create({
                    name: fileName,
                    fileType: file.Type.PDF,
                    contents: pdfFile.getContents(),
                    folder: 2762649,
                    description: 'Cover letter for Response Record #' + responseRecordId + ' - Case #' + caseNumber
                });

                var fileId = fileObj.save();

                log.audit('Cover Letter PDF Created', {
                    fileId: fileId,
                    fileName: fileName,
                    caseNumber: caseNumber,
                    responseRecordId: responseRecordId,
                    userName: userName
                });

                // Attach to response record
                record.attach({
                    record: { type: 'file', id: fileId },
                    to: { type: 'customrecord_chargeback_response', id: responseRecordId }
                });

                log.debug('Cover Letter Attached to Response Record', {
                    fileId: fileId,
                    responseRecordId: responseRecordId
                });

                return {
                    success: true,
                    fileId: fileId,
                    fileName: fileName
                };

            } catch (e) {
                log.error('Error Creating Cover Letter PDF', {
                    error: e.toString(),
                    stack: e.stack,
                    caseNumber: caseNumber
                });
                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        /**
* NEW: Attaches the Return Policy PDF to a response record
* @param {string} responseRecordId - Response record internal ID
* @returns {Object} Result object with file ID and name
*/
        function attachReturnPolicy(responseRecordId) {
            try {
                log.debug('Attaching Return Policy PDF', {
                    responseRecordId: responseRecordId
                });

                // The Return Policy PDF should be stored in the File Cabinet
                // File ID: 3044852 (based on your previous work)
                var returnPolicyFileId = '5021365';

                // Load the file to verify it exists
                var returnPolicyFile = file.load({
                    id: returnPolicyFileId
                });

                log.debug('Return Policy File Loaded', {
                    fileId: returnPolicyFileId,
                    fileName: returnPolicyFile.name
                });

                // Attach the file to the response record
                record.attach({
                    record: {
                        type: 'file',
                        id: returnPolicyFileId
                    },
                    to: {
                        type: 'customrecord_chargeback_response',
                        id: responseRecordId
                    }
                });

                log.audit('Return Policy Attached to Response Record', {
                    fileId: returnPolicyFileId,
                    fileName: returnPolicyFile.name,
                    responseRecordId: responseRecordId
                });

                return {
                    success: true,
                    fileId: returnPolicyFileId,
                    fileName: returnPolicyFile.name
                };

            } catch (e) {
                log.error('Error Attaching Return Policy', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId
                });

                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        /**
   * Handles saving the dispute form (checkboxes + text fields + files)
   * UPDATED: Pass cover letter and return policy file IDs to merge function
   * @param {Object} context
   */
        function handleSaveDisputeForm(context) {
            var request = context.request;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;
            var caseNumber = request.parameters.caseNumber;
            var coverLetter = request.parameters.coverLetter;

            var selectedTransactions = request.parameters.selectedTransactions || '';

            var r01eChecked = request.parameters.r01eChecked === 'true';
            var netsuiteTransChecked = request.parameters.netsuiteTransChecked === 'true';
            var returnPolicyChecked = request.parameters.returnPolicyChecked === 'true';
            var deliveryPhotosChecked = request.parameters.deliveryPhotosChecked === 'true';
            var correspondenceChecked = request.parameters.correspondenceChecked === 'true';

            log.debug('Save Dispute Form Request', {
                responseRecordId: responseRecordId,
                invoiceId: invoiceId,
                caseNumber: caseNumber,
                r01eChecked: r01eChecked,
                netsuiteTransChecked: netsuiteTransChecked,
                returnPolicyChecked: returnPolicyChecked,
                deliveryPhotosChecked: deliveryPhotosChecked,
                correspondenceChecked: correspondenceChecked,
                selectedTransactions: selectedTransactions,
                hasFiles: !!(request.files && Object.keys(request.files).length > 0),
                fileKeys: request.files ? Object.keys(request.files) : []
            });

            try {
                if (!responseRecordId) {
                    throw new Error('Response Record ID is required');
                }

                if (!caseNumber || caseNumber.trim() === '') {
                    throw new Error('Case Number is required');
                }

                if (!coverLetter || coverLetter.trim() === '') {
                    throw new Error('Description for Cover Letter is required');
                }

                if (!r01eChecked || !netsuiteTransChecked || !returnPolicyChecked) {
                    throw new Error('All required document checkboxes must be checked');
                }

                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                var customerId = responseRecord.getValue('custrecord_customer');

                var customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId,
                    isDynamic: false
                });

                var customerEntityId = customerRecord.getValue('entityid');
                var customerName = customerRecord.getValue('companyname') || customerRecord.getValue('altname') || customerEntityId;

                log.debug('Customer Info Retrieved for Cover Letter', {
                    customerId: customerId,
                    customerEntityId: customerEntityId,
                    customerName: customerName
                });

                // STEP 1 - Create cover letter PDF FIRST (ALWAYS create new one, even when re-saving)
                var coverLetterResult = createCoverLetterPDF(
                    caseNumber,
                    coverLetter,
                    customerId,
                    customerEntityId,
                    customerName,
                    responseRecordId
                );

                if (!coverLetterResult.success) {
                    throw new Error('Failed to create cover letter: ' + coverLetterResult.error);
                }

                log.audit('Cover Letter Created Successfully', {
                    fileId: coverLetterResult.fileId,
                    fileName: coverLetterResult.fileName
                });

                var filesProcessed = 0;
                var fileErrors = [];
                var pdfFilesGenerated = 0;

                // STEP 2 - Process manually uploaded files
                if (request.files && Object.keys(request.files).length > 0) {
                    var fileKeys = Object.keys(request.files);

                    log.debug('Processing Manual File Uploads', {
                        totalFileKeys: fileKeys.length,
                        keys: fileKeys
                    });

                    for (var i = 0; i < fileKeys.length; i++) {
                        var fileKey = fileKeys[i];
                        var uploadedFile = request.files[fileKey];

                        if (!uploadedFile || !uploadedFile.name) {
                            continue;
                        }

                        try {
                            var fileTypeInfo = getNetSuiteFileType(uploadedFile.type, uploadedFile.name);

                            if (!fileTypeInfo.isValid) {
                                throw new Error('Invalid file type for ' + uploadedFile.name);
                            }

                            var fileObj = file.create({
                                name: uploadedFile.name,
                                fileType: fileTypeInfo.fileType,
                                contents: uploadedFile.getContents(),
                                folder: 2762649,
                                description: 'Uploaded for Response Record #' + responseRecordId
                            });

                            var savedFileId = fileObj.save();

                            record.attach({
                                record: { type: 'file', id: savedFileId },
                                to: { type: 'customrecord_chargeback_response', id: responseRecordId }
                            });

                            filesProcessed++;

                        } catch (fileError) {
                            log.error('Error Processing Manual File', {
                                fileName: uploadedFile.name,
                                error: fileError.toString()
                            });
                            fileErrors.push({
                                fileName: uploadedFile.name,
                                error: fileError.toString()
                            });
                        }
                    }
                }

                // STEP 3 - Generate PDFs for selected transactions
                if (selectedTransactions && selectedTransactions.trim() !== '') {
                    var transactionIds = selectedTransactions.split(',');

                    log.debug('Generating Transaction PDFs', {
                        count: transactionIds.length,
                        ids: transactionIds
                    });

                    for (var t = 0; t < transactionIds.length; t++) {
                        var transId = transactionIds[t].trim();

                        if (!transId) continue;

                        try {
                            var transLookup = search.lookupFields({
                                type: search.Type.TRANSACTION,
                                id: transId,
                                columns: ['type', 'tranid']
                            });

                            var tranType = transLookup.type[0].value;
                            var tranIdText = transLookup.tranid;

                            log.debug('Generating PDF for Transaction', {
                                transactionId: transId,
                                type: tranType,
                                tranid: tranIdText
                            });

                            var typePrefix = 'TRANS';
                            if (tranType === 'SalesOrd') {
                                typePrefix = 'SO';
                            } else if (tranType === 'CustInvc') {
                                typePrefix = 'INV';
                            } else if (tranType === 'CustCred') {
                                typePrefix = 'CM';
                            }

                            var pdfFile = render.transaction({
                                entityId: parseInt(transId),
                                printMode: render.PrintMode.PDF
                            });

                            var pdfFileName = typePrefix + '-' + tranIdText + '.pdf';
                            var pdfFileObj = file.create({
                                name: pdfFileName,
                                fileType: file.Type.PDF,
                                contents: pdfFile.getContents(),
                                folder: 2762649,
                                description: 'Auto-generated for Response Record #' + responseRecordId
                            });

                            var pdfFileId = pdfFileObj.save();

                            record.attach({
                                record: { type: 'file', id: pdfFileId },
                                to: { type: 'customrecord_chargeback_response', id: responseRecordId }
                            });

                            log.debug('PDF Generated and Attached', {
                                fileName: pdfFileName,
                                fileId: pdfFileId,
                                transactionId: transId
                            });

                            pdfFilesGenerated++;

                        } catch (pdfError) {
                            log.error('Error Generating Transaction PDF', {
                                transactionId: transId,
                                error: pdfError.toString(),
                                stack: pdfError.stack
                            });

                            fileErrors.push({
                                fileName: 'Transaction PDF #' + transId,
                                error: pdfError.toString()
                            });
                        }
                    }
                }

                // STEP 4 - Attach Return Policy PDF (ALWAYS attach fresh copy, even when re-saving)
                var returnPolicyResult = attachReturnPolicy(responseRecordId);
                if (!returnPolicyResult.success) {
                    log.error('Failed to attach Return Policy', returnPolicyResult.error);
                } else {
                    log.audit('Return Policy Attached', {
                        fileId: returnPolicyResult.fileId,
                        fileName: returnPolicyResult.fileName
                    });
                }

                // Get file count EXCLUDING old auto-generated files (for validation)
                var attachedFiles = searchFilesAttachedToRecord(responseRecordId, true); // Pass true to exclude generated files

                log.debug('Total Files After Processing (Excluding Old Generated Files)', {
                    coverLetterCreated: coverLetterResult.success,
                    manualFilesProcessed: filesProcessed,
                    pdfFilesGenerated: pdfFilesGenerated,
                    returnPolicyAttached: returnPolicyResult.success,
                    totalAttached: attachedFiles.length,
                    errors: fileErrors.length
                });

                if (attachedFiles.length === 0) {
                    throw new Error('At least one file must be attached before saving the dispute form');
                }

                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });
                var invoiceTranId = invoiceRecord.getValue('tranid');

                // STEP 5 - Merge all attached files into single PDF
                // UPDATED: Pass the new cover letter and return policy file IDs
                var mergeResult = mergeAttachedFilesIntoPDF(
                    responseRecordId,
                    invoiceTranId,
                    coverLetterResult.fileId,  // NEW cover letter ID
                    returnPolicyResult.fileId   // NEW return policy ID
                );

                // STEP 6 - Update the response record
                record.submitFields({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    values: {
                        custrecord_case_number: caseNumber,
                        custrecord_cover_letter: coverLetter,
                        custrecord_dispute_notification_from_com: r01eChecked,
                        custrecord_all_relevant_netsuite_transac: netsuiteTransChecked,
                        custrecord_bray_scarff_return_policy_doc: returnPolicyChecked,
                        custrecord_delivery_pictures_from_dispat: deliveryPhotosChecked,
                        custrecord_correspondence_from_sales: correspondenceChecked,
                        custrecord_status: '2' // Completed, Pending Submission
                    }
                });

                log.audit('Dispute Form Saved with Cover Letter, Return Policy, and Merged PDF', {
                    responseRecordId: responseRecordId,
                    invoiceId: invoiceId,
                    caseNumber: caseNumber,
                    coverLetterCreated: coverLetterResult.fileName,
                    coverLetterFileId: coverLetterResult.fileId,
                    returnPolicyAttached: returnPolicyResult.success,
                    returnPolicyFileId: returnPolicyResult.fileId,
                    manualFilesProcessed: filesProcessed,
                    pdfFilesGenerated: pdfFilesGenerated,
                    totalFilesAttached: attachedFiles.length,
                    fileErrors: fileErrors.length,
                    mergedPDFCreated: mergeResult.success,
                    mergedFileName: mergeResult.mergedFileName || 'N/A',
                    mergedFileId: mergeResult.mergedFileId || 'N/A',
                    statusUpdated: 'Completed, Pending Submission'
                });

                // Redirect with merged file ID (buildPageHTML will load the proper URL)
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        disputeFormSaved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId,
                        filesProcessed: (filesProcessed + pdfFilesGenerated + 2).toString(), // +2 for cover letter and return policy
                        fileErrors: fileErrors.length.toString(),
                        mergedPDFCreated: mergeResult.success ? 'true' : 'false',
                        mergedFileName: mergeResult.mergedFileName || '',
                        mergedFileId: mergeResult.mergedFileId || '',
                        coverLetterCreated: 'true',
                        returnPolicyAttached: returnPolicyResult.success ? 'true' : 'false'
                    }
                });

            } catch (e) {
                log.error('Save Dispute Form Error', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Save Dispute Form Error: ' + e.toString()),
                        invoiceId: invoiceId,
                        responseRecordId: responseRecordId,
                        checklistSaved: 'true'
                    }
                });
            }
        }


        /**
 * Merges all files attached to a response record into a single PDF using PDF.co API
 * FIXED: Properly identify new cover letter and return policy files to include them
 * @param {string} responseRecordId - Internal ID of the chargeback response custom record
 * @param {string} invoiceTranId - Transaction ID of the related invoice (used for logging only)
 * @param {string} newCoverLetterId - Internal ID of the newly created cover letter (to keep it)
 * @param {string} newReturnPolicyId - Internal ID of the newly attached return policy (to keep it)
 * @returns {Object} Result object
 */
        function mergeAttachedFilesIntoPDF(responseRecordId, invoiceTranId, newCoverLetterId, newReturnPolicyId) {
            try {
                log.debug('Merging Attached Files into PDF using PDF.co', {
                    responseRecordId: responseRecordId,
                    invoiceTranId: invoiceTranId,
                    newCoverLetterId: newCoverLetterId,
                    newReturnPolicyId: newReturnPolicyId
                });

                // Get script parameter for PDF.co API key
                var script = runtime.getCurrentScript();
                var API_KEY = script.getParameter({
                    name: 'custscript_pdfco_api_key'
                });

                if (!API_KEY) {
                    log.error('Missing PDF.co API Key parameter');
                    return {
                        success: false,
                        error: 'PDF.co API Key parameter not configured'
                    };
                }

                // UPDATED: Get ALL attached files WITHOUT exclusions
                var attachedFiles = searchFilesAttachedToRecord(responseRecordId, false); // Pass false - get ALL files

                if (attachedFiles.length === 0) {
                    log.debug('No files to merge after excluding auto-generated files');
                    return { success: false, message: 'No files to merge' };
                }

                log.debug('All Attached Files Retrieved', {
                    totalCount: attachedFiles.length,
                    files: attachedFiles.map(function (f) {
                        return {
                            id: f.id,
                            name: f.name,
                            isNewCoverLetter: f.id === newCoverLetterId,
                            isNewReturnPolicy: f.id === newReturnPolicyId
                        };
                    })
                });

                // FIXED: Manually filter - exclude only OLD merged documents and OLD versions
                var filesToMerge = [];

                for (var i = 0; i < attachedFiles.length; i++) {
                    var f = attachedFiles[i];
                    var lowerFileName = f.name.toLowerCase();

                    // Skip ONLY old dispute submissions (not cover letters or return policies)
                    if (lowerFileName.indexOf('dispute_submission_') === 0) {
                        log.debug('Excluding Old Merged Document', {
                            fileId: f.id,
                            fileName: f.name
                        });
                        continue; // Skip this file
                    }

                    // FIXED: Skip old cover letters ONLY IF this is NOT the new one we just created
                    // Use == for comparison to handle string vs number
                    if (lowerFileName.indexOf('cover_letter_') === 0 && f.id != newCoverLetterId) {
                        log.debug('Excluding Old Cover Letter', {
                            fileId: f.id,
                            fileName: f.name,
                            newCoverLetterId: newCoverLetterId,
                            reason: 'Old version - new cover letter ID is ' + newCoverLetterId
                        });
                        continue; // Skip old cover letter
                    }

                    // FIXED: Skip old return policies ONLY IF this is NOT the new one we just attached
                    // Use == for comparison to handle string vs number
                    if (lowerFileName === 'return_policy.pdf' && f.id != newReturnPolicyId) {
                        log.debug('Excluding Old Return Policy', {
                            fileId: f.id,
                            fileName: f.name,
                            newReturnPolicyId: newReturnPolicyId,
                            reason: 'Old version - new return policy ID is ' + newReturnPolicyId
                        });
                        continue; // Skip old return policy
                    }

                    // Include this file
                    filesToMerge.push(f);

                    log.debug('Including File in Merge', {
                        fileId: f.id,
                        fileName: f.name,
                        isNewCoverLetter: f.id == newCoverLetterId,
                        isNewReturnPolicy: f.id == newReturnPolicyId
                    });
                }

                if (filesToMerge.length === 0) {
                    log.debug('No files remaining after filtering');
                    return { success: false, message: 'No files to merge after filtering' };
                }

                log.debug('Files After Filtering', {
                    originalCount: attachedFiles.length,
                    afterFilteringCount: filesToMerge.length,
                    excluded: attachedFiles.length - filesToMerge.length
                });

                // Load response record to get customer info
                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                var customerId = responseRecord.getValue('custrecord_customer');

                // Load customer record to get customer name
                var customerRecord = record.load({
                    type: record.Type.CUSTOMER,
                    id: customerId,
                    isDynamic: false
                });

                var customerEntityId = customerRecord.getValue('entityid');
                var customerName = customerRecord.getValue('companyname') || customerRecord.getValue('altname') || customerEntityId;

                // Clean customer name for filename (remove special characters)
                var cleanCustomerName = customerName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

                log.debug('Customer Info Retrieved', {
                    customerId: customerId,
                    customerEntityId: customerEntityId,
                    customerName: customerName,
                    cleanCustomerName: cleanCustomerName
                });

                // Sort files into ordered buckets
                var coverLetterFile = null;
                var otherFiles = [];
                var returnPolicyFile = null;

                for (var i = 0; i < filesToMerge.length; i++) {
                    var fileName = filesToMerge[i].name.toLowerCase();

                    // FIXED: Identify NEW cover letter by ID using == comparison
                    if (filesToMerge[i].id == newCoverLetterId) {
                        coverLetterFile = filesToMerge[i];
                        log.debug('Found NEW Cover Letter', {
                            fileId: filesToMerge[i].id,
                            fileName: filesToMerge[i].name
                        });
                    }
                    // FIXED: Identify NEW return policy by ID using == comparison
                    else if (filesToMerge[i].id == newReturnPolicyId) {
                        returnPolicyFile = filesToMerge[i];
                        log.debug('Found NEW Return Policy', {
                            fileId: filesToMerge[i].id,
                            fileName: filesToMerge[i].name
                        });
                    }
                    // Everything else goes in the middle
                    else {
                        otherFiles.push(filesToMerge[i]);
                    }
                }

                // Build ordered file array: Cover Letter, Other Files, Return Policy
                var orderedFiles = [];

                if (coverLetterFile) {
                    orderedFiles.push(coverLetterFile);
                } else {
                    log.error('NEW Cover Letter Missing', 'Expected to find cover letter with ID: ' + newCoverLetterId);
                }

                orderedFiles = orderedFiles.concat(otherFiles);

                if (returnPolicyFile) {
                    orderedFiles.push(returnPolicyFile);
                } else {
                    log.error('NEW Return Policy Missing', 'Expected to find return policy with ID: ' + newReturnPolicyId);
                }

                log.debug('Files Ordered for Merging', {
                    hasCoverLetter: !!coverLetterFile,
                    coverLetterId: coverLetterFile ? coverLetterFile.id : 'MISSING',
                    otherFilesCount: otherFiles.length,
                    hasReturnPolicy: !!returnPolicyFile,
                    returnPolicyId: returnPolicyFile ? returnPolicyFile.id : 'MISSING',
                    totalFiles: orderedFiles.length,
                    order: orderedFiles.map(function (f) { return f.name; })
                });

                // Prepare file URLs for PDF.co API in the correct order
                var fileUrls = [];
                for (var i = 0; i < orderedFiles.length; i++) {
                    var fileObj = file.load({
                        id: orderedFiles[i].id
                    });

                    // Make file public temporarily for PDF.co to access
                    fileObj.isOnline = true;
                    var publicFileId = fileObj.save();

                    // Reload to get public URL
                    var publicFile = file.load({
                        id: publicFileId
                    });

                    var publicUrl = publicFile.url;
                    if (publicUrl && publicUrl.indexOf('http') !== 0) {
                        publicUrl = 'https://system.netsuite.com' + publicUrl;
                    }

                    fileUrls.push(publicUrl);

                    log.debug('File made public for merging', {
                        position: i + 1,
                        fileId: orderedFiles[i].id,
                        fileName: fileObj.name,
                        publicUrl: publicUrl,
                        isCoverLetter: orderedFiles[i].id == newCoverLetterId,
                        isReturnPolicy: orderedFiles[i].id == newReturnPolicyId
                    });
                }

                // Merged filename with customer ID and name
                var mergedFileName = 'DISPUTE_SUBMISSION_' + customerEntityId + '_' + cleanCustomerName + '.pdf';

                var jsonPayload = JSON.stringify({
                    url: fileUrls.join(','),
                    name: mergedFileName,
                    async: false
                });

                var response = https.post({
                    url: 'https://api.pdf.co/v1/pdf/merge2',
                    body: jsonPayload,
                    headers: {
                        'x-api-key': API_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                log.debug('PDF.co API Response', {
                    statusCode: response.code,
                    responseBody: response.body
                });

                if (response.code === 200) {
                    var data = JSON.parse(response.body);

                    if (data.error == false) {
                        log.debug('PDF merge successful', {
                            mergedPdfUrl: data.url,
                            originalFileCount: filesToMerge.length,
                            newFileName: mergedFileName,
                            documentOrder: 'Cover Letter → Other Files → Return Policy',
                            includedNewCoverLetter: !!coverLetterFile,
                            includedNewReturnPolicy: !!returnPolicyFile
                        });

                        // Download merged PDF from PDF.co
                        var mergedPdfResponse = https.get({
                            url: data.url
                        });

                        if (mergedPdfResponse.code === 200) {
                            // Save merged PDF to NetSuite
                            var mergedFileObj = file.create({
                                name: mergedFileName,
                                fileType: file.Type.PDF,
                                contents: mergedPdfResponse.body,
                                folder: 2762649,
                                description: 'Merged dispute files for Response Record #' + responseRecordId + ' - Customer: ' + customerName
                            });

                            var mergedFileId = mergedFileObj.save();

                            log.debug('Merged PDF saved to NetSuite', {
                                fileId: mergedFileId,
                                fileName: mergedFileName
                            });

                            // Attach merged PDF to response record
                            record.attach({
                                record: { type: 'file', id: mergedFileId },
                                to: { type: 'customrecord_chargeback_response', id: responseRecordId }
                            });

                            log.audit('Merged PDF Attached to Response Record', {
                                mergedFileId: mergedFileId,
                                mergedFileName: mergedFileName,
                                responseRecordId: responseRecordId,
                                originalFileCount: filesToMerge.length,
                                customerId: customerId,
                                customerName: customerName,
                                documentOrder: 'Cover Letter first, Return Policy last',
                                verifiedNewCoverLetter: coverLetterFile ? 'Included - ID: ' + coverLetterFile.id : 'MISSING',
                                verifiedNewReturnPolicy: returnPolicyFile ? 'Included - ID: ' + returnPolicyFile.id : 'MISSING'
                            });

                            return {
                                success: true,
                                mergedFileId: mergedFileId,
                                mergedFileName: mergedFileName,
                                originalFileCount: filesToMerge.length
                            };
                        } else {
                            log.error('Failed to download merged PDF from PDF.co', {
                                statusCode: mergedPdfResponse.code,
                                url: data.url
                            });
                            return {
                                success: false,
                                error: 'Failed to download merged PDF: HTTP ' + mergedPdfResponse.code
                            };
                        }
                    } else {
                        log.error('PDF.co merge error', {
                            error: data.message
                        });
                        return {
                            success: false,
                            error: data.message
                        };
                    }
                } else {
                    log.error('PDF.co API request failed', {
                        statusCode: response.code,
                        responseBody: response.body
                    });
                    return {
                        success: false,
                        error: 'HTTP ' + response.code
                    };
                }

            } catch (e) {
                log.error('Error Merging Files into PDF', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId,
                    message: e.message
                });
                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        /**
 * NEW: Maps MIME type or file extension to NetSuite file type constant
 * @param {string} mimeType - MIME type from uploaded file
 * @param {string} fileName - File name for extension fallback
 * @returns {Object} Object with fileType and isValid properties
 */
        function getNetSuiteFileType(mimeType, fileName) {
            // Define allowed file types - used for both validation and mapping
            var allowedMimeTypes = {
                'application/pdf': file.Type.PDF,
                'image/png': file.Type.PNGIMAGE,
                'image/jpeg': file.Type.JPGIMAGE,
                'image/jpg': file.Type.JPGIMAGE,
                'image/gif': file.Type.GIFIMAGE,
                'application/msword': file.Type.WORD,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': file.Type.WORD,
                'application/vnd.ms-excel': file.Type.EXCEL,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': file.Type.EXCEL
            };

            var allowedExtensions = {
                'pdf': file.Type.PDF,
                'png': file.Type.PNGIMAGE,
                'jpg': file.Type.JPGIMAGE,
                'jpeg': file.Type.JPGIMAGE,
                'gif': file.Type.GIFIMAGE,
                'doc': file.Type.WORD,
                'docx': file.Type.WORD,
                'xls': file.Type.EXCEL,
                'xlsx': file.Type.EXCEL
            };

            // Try MIME type mapping first
            if (mimeType && allowedMimeTypes.hasOwnProperty(mimeType.toLowerCase())) {
                return {
                    fileType: allowedMimeTypes[mimeType.toLowerCase()],
                    isValid: true,
                    detectionMethod: 'MIME type',
                    mimeType: mimeType
                };
            }

            // Fallback to extension-based detection
            if (fileName) {
                var extension = fileName.toLowerCase().split('.').pop();

                if (allowedExtensions.hasOwnProperty(extension)) {
                    return {
                        fileType: allowedExtensions[extension],
                        isValid: true,
                        detectionMethod: 'file extension',
                        extension: extension
                    };
                }

                // File has extension but it's not allowed
                log.debug('Invalid file extension', {
                    fileName: fileName,
                    extension: extension,
                    allowedExtensions: Object.keys(allowedExtensions).join(', ')
                });

                return {
                    fileType: null,
                    isValid: false,
                    detectionMethod: 'file extension',
                    extension: extension,
                    reason: 'File extension not allowed'
                };
            }

            // No valid MIME type or extension found
            log.debug('Could not determine file type', {
                mimeType: mimeType || 'not provided',
                fileName: fileName || 'not provided'
            });

            return {
                fileType: null,
                isValid: false,
                detectionMethod: 'none',
                reason: 'Could not determine file type'
            };
        }

        /**
 * NEW: Handles uploading a single file (simplified version)
 * UPDATED: Validate file type and properly detect NetSuite file type constant
 * @param {Object} context
 */
        function handleUploadSingleFileNew(context) {
            var request = context.request;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Single File Upload Request (New)', {
                responseRecordId: responseRecordId,
                invoiceId: invoiceId,
                hasFiles: !!(request.files && Object.keys(request.files).length > 0)
            });

            try {
                if (!responseRecordId) {
                    throw new Error('Response Record ID is required');
                }

                // Get the uploaded file
                var uploadedFile = null;
                var fileKeys = Object.keys(request.files || {});

                for (var i = 0; i < fileKeys.length; i++) {
                    uploadedFile = request.files[fileKeys[i]];
                    if (uploadedFile && uploadedFile.name) {
                        break;
                    }
                }

                if (!uploadedFile || !uploadedFile.name) {
                    throw new Error('No file was uploaded');
                }

                log.debug('File Found', {
                    fileName: uploadedFile.name,
                    fileSize: uploadedFile.size,
                    mimeType: uploadedFile.type || 'not provided'
                });

                // Validate and determine file type
                var fileTypeInfo = getNetSuiteFileType(uploadedFile.type, uploadedFile.name);

                if (!fileTypeInfo.isValid) {
                    var allowedTypes = 'PDF, PNG, JPG, GIF, DOC, DOCX, XLS, XLSX';
                    var errorMsg = 'Invalid file type. Only ' + allowedTypes + ' files are allowed.\n\n';

                    if (fileTypeInfo.extension) {
                        errorMsg += 'File extension: .' + fileTypeInfo.extension;
                    } else if (fileTypeInfo.mimeType) {
                        errorMsg += 'MIME type: ' + fileTypeInfo.mimeType;
                    }

                    throw new Error(errorMsg);
                }

                log.debug('File Type Validated', {
                    fileName: uploadedFile.name,
                    detectionMethod: fileTypeInfo.detectionMethod,
                    netsuiteFileType: fileTypeInfo.fileType,
                    mimeType: uploadedFile.type,
                    extension: fileTypeInfo.extension || 'N/A'
                });

                // Create file in File Cabinet with validated file type
                var fileObj = file.create({
                    name: uploadedFile.name,
                    fileType: fileTypeInfo.fileType,
                    contents: uploadedFile.getContents(),
                    folder: 2762649,
                    description: 'Uploaded for Response Record #' + responseRecordId
                });

                var savedFileId = fileObj.save();

                log.debug('File Created in Cabinet', {
                    fileId: savedFileId,
                    fileName: uploadedFile.name,
                    fileType: fileTypeInfo.fileType
                });

                // Attach the file to the custom record
                record.attach({
                    record: {
                        type: 'file',
                        id: savedFileId
                    },
                    to: {
                        type: 'customrecord_chargeback_response',
                        id: responseRecordId
                    }
                });

                log.audit('Single File Upload Complete', {
                    responseRecordId: responseRecordId,
                    fileName: uploadedFile.name,
                    fileId: savedFileId,
                    fileType: fileTypeInfo.fileType,
                    detectedVia: fileTypeInfo.detectionMethod
                });

                // Redirect back with success - keep checklist expanded and scroll to it
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        checklistSaved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId,
                        singleFileUploaded: 'true',
                        fileName: encodeURIComponent(uploadedFile.name)
                    }
                });

            } catch (e) {
                log.error('Single File Upload Error', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('File Upload Error: ' + e.toString()),
                        invoiceId: invoiceId,
                        responseRecordId: responseRecordId,
                        checklistSaved: 'true' // Keep checklist expanded on error
                    }
                });
            }
        }

        /**
         * NEW: Handles removing a file attachment
         * @param {Object} context
         */
        function handleRemoveFile(context) {
            var request = context.request;
            var fileId = request.parameters.fileId;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;

            log.debug('Remove File Request', {
                fileId: fileId,
                responseRecordId: responseRecordId,
                invoiceId: invoiceId
            });

            try {
                if (!fileId || !responseRecordId) {
                    throw new Error('File ID and Response Record ID are required');
                }

                // Detach the file from the custom record
                record.detach({
                    record: {
                        type: 'file',
                        id: fileId
                    },
                    from: {
                        type: 'customrecord_chargeback_response',
                        id: responseRecordId
                    }
                });

                log.audit('File Detached', {
                    fileId: fileId,
                    responseRecordId: responseRecordId
                });

                // Redirect back with success
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        fileRemoved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId,
                        checklistSaved: 'true' // Keep checklist expanded
                    }
                });

            } catch (e) {
                log.error('Remove File Error', {
                    error: e.toString(),
                    stack: e.stack,
                    fileId: fileId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Remove File Error: ' + e.toString()),
                        invoiceId: invoiceId,
                        responseRecordId: responseRecordId,
                        checklistSaved: 'true'
                    }
                });
            }
        }


        /**
         * Builds a file attachment field for the submission checklist
         * UPDATED: Show upload success message when file uploaded
         * @param {string} invoiceId - Invoice ID for unique field IDs
         * @param {string} fieldSuffix - Unique suffix for field ID
         * @param {string} label - Field label
         * @param {string} note - Helper note
         * @param {Object} responseRecord - Loaded response record
         * @param {string} checkboxFieldId - NetSuite checkbox field ID
         * @param {Object} params - URL parameters for showing upload success
         * @returns {string} HTML for file attachment field
         */
        function buildFileAttachmentField(invoiceId, fieldSuffix, label, note, responseRecord, checkboxFieldId, params) {
            var html = '<div class="form-field">';
            html += '<label for="' + fieldSuffix + '-' + invoiceId + '" style="display: block; font-weight: bold; margin-bottom: 5px;">' + escapeHtml(label) + ': <span style="color: #999; font-weight: normal; font-style: italic;">(' + escapeHtml(note) + ')</span></label>';

            // Check if checkbox is already checked on the custom record
            var isChecked = responseRecord.getValue(checkboxFieldId);

            // Show success message if this field was just uploaded
            if (params.singleFileUploaded === 'true' && params.checkboxFieldId === checkboxFieldId) {
                var fileName = decodeURIComponent(params.fileName || 'file');
                html += '<div style="margin-bottom: 8px; padding: 8px; background-color: #d4edda; border: 1px solid #28a745; border-radius: 4px;">';
                html += '<span style="color: #155724;">✓ <strong>File Uploaded:</strong> ' + escapeHtml(fileName) + '</span>';
                html += '</div>';
            } else if (isChecked === true || isChecked === 'T') {
                html += '<div style="margin-bottom: 8px; padding: 8px; background-color: #d4edda; border: 1px solid #28a745; border-radius: 4px;">';
                html += '<span style="color: #155724;">✓ <strong>File(s) Previously Attached</strong></span>';
                html += '</div>';
            }

            // File input and upload button in a flex container
            html += '<div style="display: flex; gap: 10px; align-items: center;">';
            html += '<input type="file" id="' + fieldSuffix + '-' + invoiceId + '" data-checkbox-field="' + checkboxFieldId + '" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />';
            html += '<button type="button" class="action-btn" style="background-color: #28a745; white-space: nowrap;" onclick="uploadSingleFile(\'' + invoiceId + '\', \'' + fieldSuffix + '\', \'' + checkboxFieldId + '\', \'' + responseRecord.id + '\')">Upload File</button>';
            html += '</div>';

            html += '<div style="margin-top: 4px; font-size: 11px; color: #666; font-style: italic;">Files are saved immediately upon upload.</div>';

            html += '</div>';

            return html;
        }

        /**
   * NEW: Handles single file upload for submission checklist
   * UPDATED: Redirect back with expanded checklist and scroll position
   * @param {Object} context
   */
        function handleUploadSingleFile(context) {
            var request = context.request;
            var response = context.response;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;
            var checkboxFieldId = request.parameters.checkboxFieldId;

            log.debug('Single File Upload Request', {
                responseRecordId: responseRecordId,
                invoiceId: invoiceId,
                checkboxFieldId: checkboxFieldId,
                hasFiles: !!(request.files && Object.keys(request.files).length > 0)
            });

            try {
                if (!responseRecordId || !checkboxFieldId) {
                    throw new Error('Response Record ID and Checkbox Field ID are required');
                }

                // Get the uploaded file
                var uploadedFile = null;
                var fileKeys = Object.keys(request.files || {});

                for (var i = 0; i < fileKeys.length; i++) {
                    uploadedFile = request.files[fileKeys[i]];
                    if (uploadedFile && uploadedFile.name) {
                        break;
                    }
                }

                if (!uploadedFile || !uploadedFile.name) {
                    throw new Error('No file was uploaded');
                }

                log.debug('File Found', {
                    fileName: uploadedFile.name,
                    fileSize: uploadedFile.size
                });

                // Create file in File Cabinet
                var fileObj = file.create({
                    name: uploadedFile.name,
                    fileType: uploadedFile.type || file.Type.PDF,
                    contents: uploadedFile.getContents(),
                    folder: 2762649,
                    description: 'Uploaded for Response Record #' + responseRecordId + ' - ' + checkboxFieldId
                });

                var savedFileId = fileObj.save();

                log.debug('File Created in Cabinet', {
                    fileId: savedFileId,
                    fileName: uploadedFile.name
                });

                // Attach the file to the custom record
                record.attach({
                    record: {
                        type: 'file',
                        id: savedFileId
                    },
                    to: {
                        type: 'customrecord_chargeback_response',
                        id: responseRecordId
                    }
                });

                log.debug('File Attached to Response Record', {
                    fileId: savedFileId,
                    fileName: uploadedFile.name,
                    responseRecordId: responseRecordId
                });

                // Update the checkbox on the custom record
                record.submitFields({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    values: {
                        [checkboxFieldId]: true
                    }
                });

                log.audit('Single File Upload Complete', {
                    responseRecordId: responseRecordId,
                    checkboxFieldId: checkboxFieldId,
                    fileName: uploadedFile.name,
                    fileId: savedFileId
                });

                // Redirect back with success - keep checklist expanded
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        checklistSaved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId,
                        singleFileUploaded: 'true',
                        fileName: encodeURIComponent(uploadedFile.name),
                        checkboxFieldId: checkboxFieldId
                    }
                });

            } catch (e) {
                log.error('Single File Upload Error', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId,
                    checkboxFieldId: checkboxFieldId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('File Upload Error: ' + e.toString()),
                        invoiceId: invoiceId,
                        responseRecordId: responseRecordId,
                        checklistSaved: 'true' // Keep checklist expanded on error too
                    }
                });
            }
        }

        /**
  * Handles saving submission checklist data
  * FIXED: Properly handle multiple files from same input field
  * @param {Object} context
  */
        function handleSaveSubmissionChecklist(context) {
            var request = context.request;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;
            var caseNumber = request.parameters.caseNumber;
            var coverLetter = request.parameters.coverLetter;

            log.debug('Save Submission Checklist Request', {
                responseRecordId: responseRecordId,
                invoiceId: invoiceId,
                caseNumber: caseNumber,
                hasFiles: !!(request.files && Object.keys(request.files).length > 0),
                fileKeys: request.files ? Object.keys(request.files) : [],
                allFiles: request.files ? JSON.stringify(Object.keys(request.files).map(function (key) {
                    var f = request.files[key];
                    return {
                        key: key,
                        isArray: Array.isArray(f),
                        count: Array.isArray(f) ? f.length : 1,
                        hasName: f && f.name ? true : false
                    };
                })) : 'none'
            });

            try {
                if (!responseRecordId) {
                    throw new Error('Response Record ID is required');
                }

                // Track which checkboxes to update
                var checkboxUpdates = {};
                var filesProcessed = 0;

                // Process files - attach them to the custom record
                if (request.files) {
                    var fileKeys = Object.keys(request.files);
                    log.debug('Processing Files - START', {
                        totalKeys: fileKeys.length,
                        keys: fileKeys
                    });

                    for (var i = 0; i < fileKeys.length; i++) {
                        var checkboxFieldId = fileKeys[i];
                        var fileData = request.files[checkboxFieldId];

                        log.debug('Processing file key', {
                            key: checkboxFieldId,
                            isArray: Array.isArray(fileData),
                            type: typeof fileData,
                            hasFiles: fileData ? true : false
                        });

                        // Handle both single file and array of files
                        var filesToProcess = [];

                        if (Array.isArray(fileData)) {
                            // Multiple files uploaded for this field
                            filesToProcess = fileData;
                            log.debug('File data is array', {
                                checkboxFieldId: checkboxFieldId,
                                arrayLength: fileData.length
                            });
                        } else if (fileData && fileData.name) {
                            // Single file uploaded for this field
                            filesToProcess = [fileData];
                            log.debug('File data is single file', {
                                checkboxFieldId: checkboxFieldId,
                                fileName: fileData.name
                            });
                        } else {
                            log.debug('Skipping - no valid file data', {
                                checkboxFieldId: checkboxFieldId
                            });
                            continue;
                        }

                        log.debug('Files to process for field', {
                            checkboxFieldId: checkboxFieldId,
                            fileCount: filesToProcess.length,
                            fileNames: filesToProcess.map(function (f) { return f.name || 'UNNAMED'; }).join(', ')
                        });

                        // Process each file
                        for (var f = 0; f < filesToProcess.length; f++) {
                            var currentFile = filesToProcess[f];

                            if (!currentFile || !currentFile.name) {
                                log.debug('Skipping invalid file', {
                                    checkboxFieldId: checkboxFieldId,
                                    fileIndex: f,
                                    hasFile: !!currentFile,
                                    hasName: currentFile ? !!currentFile.name : false
                                });
                                continue;
                            }

                            log.debug('Processing File Upload', {
                                checkboxFieldId: checkboxFieldId,
                                fileName: currentFile.name,
                                fileSize: currentFile.size,
                                fileType: currentFile.type,
                                fileIndex: f + 1,
                                totalFiles: filesToProcess.length
                            });

                            try {
                                // Create file in File Cabinet
                                var fileObj = file.create({
                                    name: currentFile.name,
                                    fileType: currentFile.type || file.Type.PDF,
                                    contents: currentFile.getContents(),
                                    folder: 2762649,
                                    description: 'Uploaded for Response Record #' + responseRecordId + ' - ' + checkboxFieldId
                                });

                                var savedFileId = fileObj.save();

                                log.debug('File Created in Cabinet', {
                                    fileId: savedFileId,
                                    fileName: currentFile.name,
                                    checkboxFieldId: checkboxFieldId
                                });

                                // Attach the file to the custom record
                                record.attach({
                                    record: {
                                        type: 'file',
                                        id: savedFileId
                                    },
                                    to: {
                                        type: 'customrecord_chargeback_response',
                                        id: responseRecordId
                                    }
                                });

                                log.debug('File Attached to Response Record', {
                                    fileId: savedFileId,
                                    fileName: currentFile.name,
                                    responseRecordId: responseRecordId,
                                    checkboxFieldId: checkboxFieldId
                                });

                                // Mark this checkbox to be updated
                                checkboxUpdates[checkboxFieldId] = true;
                                filesProcessed++;

                            } catch (fileError) {
                                log.error('Error Processing File', {
                                    checkboxFieldId: checkboxFieldId,
                                    fileName: currentFile.name,
                                    fileIndex: f,
                                    error: fileError.toString(),
                                    stack: fileError.stack
                                });
                                // Continue processing other files even if one fails
                            }
                        }
                    }

                    log.debug('File Processing Complete', {
                        totalFilesProcessed: filesProcessed,
                        checkboxesToUpdate: Object.keys(checkboxUpdates).length
                    });
                }

                // Load the record, update it, then save it
                var responseRecord = record.load({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    isDynamic: false
                });

                // Set text fields
                if (caseNumber) {
                    responseRecord.setValue({
                        fieldId: 'custrecord_case_number',
                        value: caseNumber
                    });
                    log.debug('Set Case Number', caseNumber);
                }

                if (coverLetter) {
                    responseRecord.setValue({
                        fieldId: 'custrecord_cover_letter',
                        value: coverLetter
                    });
                    log.debug('Set Cover Letter', 'Length: ' + coverLetter.length);
                }

                // Set checkboxes for uploaded files
                for (var checkboxFieldId in checkboxUpdates) {
                    if (checkboxUpdates.hasOwnProperty(checkboxFieldId)) {
                        responseRecord.setValue({
                            fieldId: checkboxFieldId,
                            value: true
                        });
                        log.debug('Set Checkbox', {
                            fieldId: checkboxFieldId,
                            value: true
                        });
                    }
                }

                // Save the record
                responseRecord.save();

                log.audit('Submission Checklist Saved', {
                    responseRecordId: responseRecordId,
                    invoiceId: invoiceId,
                    caseNumber: caseNumber,
                    filesProcessed: filesProcessed,
                    checkboxesUpdated: Object.keys(checkboxUpdates).length,
                    checkboxFields: Object.keys(checkboxUpdates)
                });

                // Redirect back with success
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        checklistSaved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId
                    }
                });

            } catch (e) {
                log.error('Save Submission Checklist Error', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId,
                    invoiceId: invoiceId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Save Checklist Error: ' + e.toString())
                    }
                });
            }
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
  * UPDATED: Include response record status ID for button enable/disable logic
  * @returns {Array} Array of invoice objects with response record info
  */
        function searchChargebacksNeedingDisputeFiles() {
            log.debug('Searching Chargebacks Needing Dispute Files', 'Items: 304416 (CC Dispute), 304429 (Fraud)');

            // STEP 1: Search for invoices with the chargeback items (line level search)
            // NOTE: 304779 (Duplicate FreedomPay Refund) excluded - no dispute response needed
            var itemSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item', 'anyof', ['304416', '304429']]
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

            // STEP 2: Search at header level for these specific invoices
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
                    type: 'Credit Card Chargeback',
                    responseRecordId: null,
                    responseStatus: null,
                    responseStatusId: null // NEW: Track status ID
                };

                return true;
            });

            log.debug('Header search results', {
                totalInvoicesWithItems: invoiceIds.length,
                afterCheckboxFilter: Object.keys(invoiceData).length
            });

            if (Object.keys(invoiceData).length === 0) {
                return [];
            }

            var filteredInvoiceIds = Object.keys(invoiceData);

            // STEP 3: Search for response records linked to these invoices - GET STATUS ID
            var responseSearch = search.create({
                type: 'customrecord_chargeback_response',
                filters: [
                    ['custrecord_transaction', 'anyof', filteredInvoiceIds]
                ],
                columns: [
                    'internalid',
                    'custrecord_transaction',
                    search.createColumn({ name: 'custrecord_status', label: 'Status Text' }) // Gets both text and value
                ]
            });

            responseSearch.run().each(function (result) {
                var responseRecordId = result.id;
                var transactionIds = result.getValue('custrecord_transaction');
                var statusText = result.getText('custrecord_status');
                var statusId = result.getValue('custrecord_status'); // NEW: Get status ID value

                log.debug('Response Record Found', {
                    responseRecordId: responseRecordId,
                    transactionIdsRaw: transactionIds,
                    transactionIdsType: typeof transactionIds,
                    statusText: statusText,
                    statusId: statusId // NEW: Log status ID
                });

                var transactionArray = typeof transactionIds === 'string' ? transactionIds.split(',') : [transactionIds];

                log.debug('Transaction Array Created', {
                    responseRecordId: responseRecordId,
                    transactionArray: transactionArray,
                    arrayLength: transactionArray.length
                });

                for (var i = 0; i < transactionArray.length; i++) {
                    var transId = transactionArray[i].toString().trim();

                    log.debug('Linking Response to Invoice', {
                        responseRecordId: responseRecordId,
                        transactionId: transId,
                        invoiceExistsInData: !!invoiceData[transId],
                        statusText: statusText,
                        statusId: statusId
                    });

                    if (invoiceData[transId]) {
                        invoiceData[transId].responseRecordId = responseRecordId;
                        invoiceData[transId].responseStatus = statusText;
                        invoiceData[transId].responseStatusId = statusId; // NEW: Store status ID
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
                        responseRecordId: invoiceData[invoiceId].responseRecordId,
                        responseStatus: invoiceData[invoiceId].responseStatus,
                        responseStatusId: invoiceData[invoiceId].responseStatusId // NEW: Include in results
                    });
                }
            }

            log.debug('Final Results', {
                count: results.length,
                sampleWithStatus: results.length > 0 ? {
                    tranid: results[0].tranid,
                    responseRecordId: results[0].responseRecordId,
                    responseStatus: results[0].responseStatus,
                    responseStatusId: results[0].responseStatusId
                } : 'No results'
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
          * UPDATED: Display tranids instead of internal IDs
          * @param {Object} params - URL parameters
          * @returns {string} HTML content
          */
        function buildSuccessMessage(params) {
            var type = params.type || 'chargeback';
            var customer = decodeURIComponent(params.customer || 'Customer');
            var creditMemoId = params.cm || '';
            var creditMemoTranId = params.cmTranId || creditMemoId; // Fallback to ID if tranid not available
            var refundId = params.refund || '';
            var refundTranId = params.refundTranId || refundId; // Fallback to ID if tranid not available
            var newInvoiceId = params.invoice || '';
            var newInvoiceTranId = params.invoiceTranId || newInvoiceId; // Fallback to ID if tranid not available
            var jeId = params.jeId || '';
            var jeTranId = params.jeTranId || '';

            var typeText = type === 'nsf' ? 'NSF Check' : (type === 'fraud' ? 'Fraud Chargeback' : 'Dispute Chargeback');

            var html = '<div class="success-msg">';
            html += '<strong>' + typeText + ' Processed Successfully for ' + escapeHtml(customer) + '</strong><br>';
            html += 'Credit Memo: <a href="/app/accounting/transactions/custcred.nl?id=' + creditMemoId + '" target="_blank">' + escapeHtml(creditMemoTranId) + '</a><br>';
            html += 'Customer Refund: <a href="/app/accounting/transactions/custrfnd.nl?id=' + refundId + '" target="_blank">' + escapeHtml(refundTranId) + '</a><br>';
            html += 'New Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + newInvoiceId + '" target="_blank">' + escapeHtml(newInvoiceTranId) + '</a>';

            // Note: Fraud chargebacks no longer automatically create JE write-offs
            // Users must manually create the write-off using the "JE Write Off" button

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
                    var reverseButtonText = (inv.itemId === '304779') ? 'Reverse Duplicate Refund' : 'Reverse Chargeback';
                    html += '<tr>';
                    html += '<td class="action-cell">';
                    html += '<button type="button" class="action-btn payment-link-btn" onclick="sendPaymentLink(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">Send Payment Link</button>';
                    html += '<button type="button" class="action-btn manual-payment-btn" onclick="enterManualPayment(\'' + inv.id + '\')">Enter Manual Payment</button>';
                    html += '<button type="button" class="action-btn reverse-btn" onclick="reverseChargeback(\'' + inv.id + '\', \'' + escapeHtml(inv.tranid) + '\')">' + reverseButtonText + '</button>';
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
            log.debug('Searching Open Chargeback Invoices', 'Items: 304416 (CC Dispute), 304429 (Fraud), 304417 (NSF), 304779 (Dup FreedomPay)');

            var invoiceSearch = search.create({
                type: search.Type.INVOICE,
                filters: [
                    ['type', 'anyof', 'CustInvc'],
                    'AND',
                    ['status', 'anyof', 'CustInvc:A'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['item', 'anyof', ['304416', '304429', '304417', '304779']] // UPDATED: Added 304779
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
                    } else if (itemId === '304779') {
                        itemType = 'Duplicate FreedomPay Refund';
                    }

                    var createdBy = result.getText('createdby') || 'Unknown';

                    results.push({
                        id: invoiceId,
                        tranid: result.getValue('tranid'),
                        customer: result.getText('entity'),
                        dateCreated: result.getValue('datecreated'),
                        amount: result.getValue('amount'),
                        type: itemType,
                        itemId: itemId,
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
   * UPDATED: Added handlers for new actions
   */
        function handlePost(context) {
            var request = context.request;
            var params = request.parameters;
            var files = request.files;

            log.audit('POST Request Received', 'Parameters: ' + JSON.stringify(params) + ' | Files: ' + JSON.stringify(Object.keys(files || {})));

            try {
                // Handle single file upload (new simplified version)
                if (params.action === 'uploadSingleFileNew') {
                    handleUploadSingleFileNew(context);
                    return;
                }

                // Handle save dispute form
                if (params.action === 'saveDisputeForm') {
                    handleSaveDisputeForm(context);
                    return;
                }

                // Handle remove file
                if (params.action === 'removeFile') {
                    handleRemoveFile(context);
                    return;
                }

                // Handle deposit refund processing
                if (params.action === 'processDepositRefund') {
                    handleDepositRefund(context);
                    return;
                }

                // Handle duplicate refund processing
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
                        customer: encodeURIComponent(result.customerName),
                        cm: result.creditMemoId,
                        cmTranId: result.creditMemoTranId,
                        refund: result.refundId,
                        refundTranId: result.refundTranId,
                        invoice: result.newInvoiceId,
                        invoiceTranId: result.newInvoiceTranId,
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
         * NEW: Handles saving just the text fields (Case Number and Cover Letter)
         * @param {Object} context
         */
        function handleSaveTextFields(context) {
            var request = context.request;
            var responseRecordId = request.parameters.responseRecordId;
            var invoiceId = request.parameters.invoiceId;
            var caseNumber = request.parameters.caseNumber;
            var coverLetter = request.parameters.coverLetter;

            log.debug('Save Text Fields Request', {
                responseRecordId: responseRecordId,
                invoiceId: invoiceId,
                caseNumber: caseNumber
            });

            try {
                if (!responseRecordId) {
                    throw new Error('Response Record ID is required');
                }

                if (!caseNumber || caseNumber.trim() === '') {
                    throw new Error('Case Number is required');
                }

                // Update the response record
                record.submitFields({
                    type: 'customrecord_chargeback_response',
                    id: responseRecordId,
                    values: {
                        custrecord_case_number: caseNumber,
                        custrecord_cover_letter: coverLetter || ''
                    }
                });

                log.audit('Text Fields Saved', {
                    responseRecordId: responseRecordId,
                    caseNumber: caseNumber
                });

                // Redirect back with success
                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        textFieldsSaved: 'true',
                        responseRecordId: responseRecordId,
                        invoiceId: invoiceId
                    }
                });

            } catch (e) {
                log.error('Save Text Fields Error', {
                    error: e.toString(),
                    stack: e.stack,
                    responseRecordId: responseRecordId
                });

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: {
                        error: encodeURIComponent('Save Text Fields Error: ' + e.toString()),
                        invoiceId: invoiceId
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
 * UPDATED: Update Sales Order with appropriate checkbox based on type
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

            // NEW: Update Sales Order with appropriate checkbox if Sales Order exists
            if (salesOrderId) {
                try {
                    // Determine which checkbox to update based on type
                    var checkboxField;
                    if (type === 'nsf') {
                        checkboxField = 'custbody_bas_nsf_check';
                    } else if (type === 'fraud') {
                        checkboxField = 'custbody_bas_fraud';
                    } else { // chargeback (dispute)
                        checkboxField = 'custbody_bas_cc_dispute';
                    }

                    // Update the Sales Order checkbox
                    var updateValues = {};
                    updateValues[checkboxField] = true;

                    record.submitFields({
                        type: record.Type.SALES_ORDER,
                        id: salesOrderId,
                        values: updateValues
                    });

                    log.audit('Sales Order Updated with Checkbox', {
                        salesOrderId: salesOrderId,
                        checkboxField: checkboxField,
                        checkboxValue: true,
                        depositId: depositId,
                        refundType: type
                    });

                } catch (soUpdateError) {
                    log.error('Error Updating Sales Order Checkbox', {
                        error: soUpdateError.toString(),
                        stack: soUpdateError.stack,
                        salesOrderId: salesOrderId,
                        checkboxField: checkboxField,
                        depositId: depositId
                    });
                    // Don't throw error - the refund was created successfully
                }
            }

            return {
                refundId: refundId,
                refundTranId: customTranId,
                depositTranId: tranId,
                customerName: customerName,
                amount: amountToRefund
            };
        }

        /**
   * Processes chargeback or NSF check for an invoice
   * UPDATED: Get tranids for success message, update correct checkboxes on original invoice
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
                itemId = '304429'; // Fraud item
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

            // UPDATED: Get the credit memo tranid immediately after saving
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

            // UPDATED: The refund tranid is the custom one we set
            var refundTranId = customTranId;

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

            // UPDATED: Get the new invoice tranid immediately after saving
            var newInvoiceRecord = record.load({
                type: record.Type.INVOICE,
                id: newInvoiceId,
                isDynamic: false
            });
            var newInvoiceTranId = newInvoiceRecord.getValue('tranid');
            log.debug('New Invoice TranId', 'TranId: ' + newInvoiceTranId);

            // UPDATED: Step 4: Update ORIGINAL invoice with memo and appropriate checkbox (not new invoice)
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

                // UPDATED: Set the appropriate checkbox based on type on the ORIGINAL invoice
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

            // UPDATED: Return tranids instead of just IDs
            var resultData = {
                creditMemoId: creditMemoId,
                creditMemoTranId: creditMemoTranId,
                refundId: refundId,
                refundTranId: refundTranId,
                newInvoiceId: newInvoiceId,
                newInvoiceTranId: newInvoiceTranId,
                customerName: customerName
            };

            // NOTE: Fraud chargebacks no longer automatically create JE write-offs
            // Users must manually create JE write-offs for fraud chargebacks using the "JE Write Off" button
            // This matches the process for dispute chargebacks

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
  * UPDATED: Added styles for submission checklist
  * UPDATED: Repositioned SOP Quick Link within container
  * @returns {string} CSS content
  */
        function getStyles() {
            return '.uir-page-title-secondline { border: none !important; margin: 0 !important; padding: 0 !important; }' +
                '.uir-record-type { border: none !important; }' +
                '.bglt { border: none !important; }' +
                '.smalltextnolink { border: none !important; }' +
                '.chargeback-container { margin: 0; padding: 20px; border: none; background: transparent; position: relative; }' +
                // UPDATED: SOP Quick Link styles - absolute within container instead of fixed
                '.sop-link-container { position: absolute; top: 0; right: 0; z-index: 100; }' +
                '.sop-quick-link { display: inline-flex; align-items: center; padding: 10px 18px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; box-shadow: 0 4px 6px rgba(76, 175, 80, 0.3), 0 1px 3px rgba(0, 0, 0, 0.1); transition: all 0.3s ease; border: 2px solid rgba(255, 255, 255, 0.2); }' +
                '.sop-quick-link:hover { background: linear-gradient(135deg, #45a049 0%, #4CAF50 100%); transform: translateY(-2px); box-shadow: 0 6px 12px rgba(76, 175, 80, 0.4), 0 2px 4px rgba(0, 0, 0, 0.15); text-decoration: none; color: white; border-color: rgba(255, 255, 255, 0.3); }' +
                '.sop-quick-link:active { transform: translateY(0px); box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3), 0 1px 2px rgba(0, 0, 0, 0.1); }' +
                '.sop-quick-link svg { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2)); }' +
                'table.search-table { border-collapse: collapse; width: 100%; margin: 15px 0; border: 1px solid #ddd; background: white; }' +
                'table.search-table th, table.search-table td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }' +
                'table.search-table th { background-color: #f8f9fa; font-weight: bold; color: #333; font-size: 12px; }' +
                'table.search-table tr:nth-child(even) td { background-color: #f9f9f9; }' +
                'table.search-table tr:hover td { background-color: #e8f4f8; }' +
                'table.search-table tr.checklist-row { background-color: transparent !important; }' +
                'table.search-table tr.checklist-row:hover td { background-color: #f8f9fa !important; }' +
                '.form-field { margin-bottom: 15px; }' +
                '.form-field label { display: block; margin-bottom: 5px; font-weight: bold; }' +
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

        /**
 * Returns JavaScript for the page
 * UPDATED: Simplified confirmation message without box-drawing characters
 */
        function getJavaScript(scriptUrl) {
            return 'var currentUploadInvoiceId = null;' +
                'var currentUploadTranId = null;' +
                // PHASE 3: File queue storage - one queue per invoice
                'var fileQueues = {};' +
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
                // PHASE 3: Add files to queue
                'function addFilesToQueue(invoiceId) {' +
                '    var fileInput = document.getElementById("multi-file-input-" + invoiceId);' +
                '    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {' +
                '        alert("Please select at least one file to add to the queue");' +
                '        return;' +
                '    }' +
                '    if (!fileQueues[invoiceId]) {' +
                '        fileQueues[invoiceId] = [];' +
                '    }' +
                '    var addedCount = 0;' +
                '    for (var i = 0; i < fileInput.files.length; i++) {' +
                '        var file = fileInput.files[i];' +
                '        var isDuplicate = false;' +
                '        for (var j = 0; j < fileQueues[invoiceId].length; j++) {' +
                '            if (fileQueues[invoiceId][j].name === file.name && fileQueues[invoiceId][j].size === file.size) {' +
                '                isDuplicate = true;' +
                '                break;' +
                '            }' +
                '        }' +
                '        if (!isDuplicate) {' +
                '            fileQueues[invoiceId].push(file);' +
                '            addedCount++;' +
                '        }' +
                '    }' +
                '    fileInput.value = "";' +
                '    updateFileQueueDisplay(invoiceId);' +
                '    if (addedCount > 0) {' +
                '        var message = addedCount + " file(s) added to queue";' +
                '        if (addedCount < fileInput.files.length) {' +
                '            message += " (" + (fileInput.files.length - addedCount) + " duplicate(s) skipped)";' +
                '        }' +
                '        alert(message);' +
                '    } else {' +
                '        alert("No new files added - all selected files were already in the queue");' +
                '    }' +
                '}' +
                // PHASE 3: Update file queue display
                'function updateFileQueueDisplay(invoiceId) {' +
                '    var queueContainer = document.getElementById("file-queue-" + invoiceId);' +
                '    var queueList = document.getElementById("file-queue-list-" + invoiceId);' +
                '    if (!fileQueues[invoiceId] || fileQueues[invoiceId].length === 0) {' +
                '        queueContainer.style.display = "none";' +
                '        return;' +
                '    }' +
                '    queueContainer.style.display = "block";' +
                '    var html = "";' +
                '    for (var i = 0; i < fileQueues[invoiceId].length; i++) {' +
                '        var file = fileQueues[invoiceId][i];' +
                '        var fileSize = formatFileSize(file.size);' +
                '        html += "<li style=\\"padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;\\">";' +
                '        html += "<div>";' +
                '        html += "<span style=\\"font-weight: bold;\\">" + escapeHtmlClient(file.name) + "</span>";' +
                '        html += " <span style=\\"color: #666; font-size: 11px;\\">(" + fileSize + ")</span>";' +
                '        html += "</div>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn\\" style=\\"background-color: #dc3545; font-size: 11px; padding: 4px 8px;\\" ";' +
                '        html += "onclick=\\"removeFromQueue(\'" + invoiceId + "\', " + i + ")\\">Remove</button>";' +
                '        html += "</li>";' +
                '    }' +
                '    queueList.innerHTML = html;' +
                '}' +
                // PHASE 3: Remove file from queue
                'function removeFromQueue(invoiceId, index) {' +
                '    if (!fileQueues[invoiceId]) return;' +
                '    fileQueues[invoiceId].splice(index, 1);' +
                '    updateFileQueueDisplay(invoiceId);' +
                '}' +
                // PHASE 3: Format file size
                'function formatFileSize(bytes) {' +
                '    if (!bytes || bytes === 0) return "0 B";' +
                '    var k = 1024;' +
                '    var sizes = ["B", "KB", "MB", "GB"];' +
                '    var i = Math.floor(Math.log(bytes) / Math.log(k));' +
                '    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];' +
                '}' +
                // UPDATED: Simplified confirmation message without box-drawing characters and emojis
                'function saveDisputeFormWithFiles(invoiceId, responseRecordId) {' +
                '    var caseNumber = document.getElementById("case-number-" + invoiceId).value;' +
                '    var coverLetter = document.getElementById("cover-letter-" + invoiceId).value;' +
                '    var r01eChecked = document.getElementById("r01e-checkbox-" + invoiceId).checked;' +
                '    var netsuiteTransChecked = document.getElementById("netsuite-trans-checkbox-" + invoiceId).checked;' +
                '    var returnPolicyChecked = document.getElementById("return-policy-checkbox-" + invoiceId).checked;' +
                '    var deliveryPhotosChecked = document.getElementById("delivery-photos-checkbox-" + invoiceId).checked;' +
                '    var correspondenceChecked = document.getElementById("correspondence-checkbox-" + invoiceId).checked;' +
                '    if (!caseNumber || caseNumber.trim() === "") {' +
                '        alert("Case Number is required");' +
                '        return;' +
                '    }' +
                '    if (!coverLetter || coverLetter.trim() === "") {' +
                '        alert("Description for Cover Letter is required");' +
                '        return;' +
                '    }' +
                '    if (!r01eChecked || !netsuiteTransChecked || !returnPolicyChecked) {' +
                '        alert("All required document checkboxes must be checked:\\n\\n• Completed R01E or C01E\\n• Relevant NetSuite Transactions\\n• Return Policy Document");' +
                '        return;' +
                '    }' +
                '    var existingFileCountInput = document.getElementById("existing-file-count-" + invoiceId);' +
                '    var existingFileCount = existingFileCountInput ? parseInt(existingFileCountInput.value, 10) : 0;' +
                '    var queuedFileCount = fileQueues[invoiceId] ? fileQueues[invoiceId].length : 0;' +
                '    var selectedTransCount = selectedTransactionIds[invoiceId] ? selectedTransactionIds[invoiceId].length : 0;' +
                '    var totalFiles = queuedFileCount + selectedTransCount + existingFileCount;' +
                '    console.log("File count validation:", {' +
                '        existingFileCount: existingFileCount,' +
                '        queuedFileCount: queuedFileCount,' +
                '        selectedTransCount: selectedTransCount,' +
                '        totalFiles: totalFiles' +
                '    });' +
                '    if (totalFiles === 0) {' +
                '        alert("At least one file must be attached or in the queue before saving the dispute form.\\n\\nPlease add files to the queue or select transactions for PDF generation.");' +
                '        return;' +
                '    }' +
                // UPDATED: Simplified confirmation message
                '    var confirmMsg = "========================================\\n";' +
                '    confirmMsg += "SAVE & MERGE DISPUTE FORM CONFIRMATION\\n";' +
                '    confirmMsg += "========================================\\n\\n";' +
                '    confirmMsg += "The following documents will be included in your\\n";' +
                '    confirmMsg += "final merged \\"DISPUTE_SUBMISSION\\" PDF:\\n\\n";' +
                '    confirmMsg += "1. COVER LETTER (Auto-Generated)\\n";' +
                '    confirmMsg += "   - Based on your description text\\n";' +
                '    confirmMsg += "   - Includes Case #" + caseNumber + "\\n\\n";' +
                '    if (selectedTransCount > 0) {' +
                '        confirmMsg += "2. NETSUITE TRANSACTIONS (" + selectedTransCount + " PDF" + (selectedTransCount !== 1 ? "s" : "") + ")\\n";' +
                '        confirmMsg += "   - Auto-generated from selected transactions\\n\\n";' +
                '    }' +
                '    if (queuedFileCount > 0) {' +
                '        confirmMsg += "3. MANUALLY QUEUED FILES (" + queuedFileCount + " file" + (queuedFileCount !== 1 ? "s" : "") + ")\\n";' +
                '        confirmMsg += "   - R01E/C01E dispute notifications\\n";' +
                '        confirmMsg += "   - Delivery photos\\n";' +
                '        confirmMsg += "   - Correspondence documents\\n\\n";' +
                '    }' +
                '    if (existingFileCount > 0) {' +
                '        confirmMsg += "4. PREVIOUSLY ATTACHED FILES (" + existingFileCount + " file" + (existingFileCount !== 1 ? "s" : "") + ")\\n\\n";' +
                '    }' +
                '    confirmMsg += "5. RETURN POLICY (Auto-Attached - Last Page)\\n";' +
                '    confirmMsg += "   - Automatically included in every submission\\n\\n";' +
                '    if (!confirm(confirmMsg)) {' +
                '        return;' +
                '    }' +
                '    showLoading("Saving dispute form, uploading files, and generating transaction PDFs...");' +
                '    var form = document.createElement("form");' +
                '    form.method = "POST";' +
                '    form.action = "' + scriptUrl + '";' +
                '    form.enctype = "multipart/form-data";' +
                '    var actionInput = document.createElement("input");' +
                '    actionInput.type = "hidden";' +
                '    actionInput.name = "action";' +
                '    actionInput.value = "saveDisputeForm";' +
                '    form.appendChild(actionInput);' +
                '    var responseInput = document.createElement("input");' +
                '    responseInput.type = "hidden";' +
                '    responseInput.name = "responseRecordId";' +
                '    responseInput.value = responseRecordId;' +
                '    form.appendChild(responseInput);' +
                '    var invoiceInput = document.createElement("input");' +
                '    invoiceInput.type = "hidden";' +
                '    invoiceInput.name = "invoiceId";' +
                '    invoiceInput.value = invoiceId;' +
                '    form.appendChild(invoiceInput);' +
                '    var caseInput = document.createElement("input");' +
                '    caseInput.type = "hidden";' +
                '    caseInput.name = "caseNumber";' +
                '    caseInput.value = caseNumber;' +
                '    form.appendChild(caseInput);' +
                '    var coverInput = document.createElement("input");' +
                '    coverInput.type = "hidden";' +
                '    coverInput.name = "coverLetter";' +
                '    coverInput.value = coverLetter;' +
                '    form.appendChild(coverInput);' +
                '    var r01eInput = document.createElement("input");' +
                '    r01eInput.type = "hidden";' +
                '    r01eInput.name = "r01eChecked";' +
                '    r01eInput.value = r01eChecked;' +
                '    form.appendChild(r01eInput);' +
                '    var netsuiteInput = document.createElement("input");' +
                '    netsuiteInput.type = "hidden";' +
                '    netsuiteInput.name = "netsuiteTransChecked";' +
                '    netsuiteInput.value = netsuiteTransChecked;' +
                '    form.appendChild(netsuiteInput);' +
                '    var returnInput = document.createElement("input");' +
                '    returnInput.type = "hidden";' +
                '    returnInput.name = "returnPolicyChecked";' +
                '    returnInput.value = returnPolicyChecked;' +
                '    form.appendChild(returnInput);' +
                '    var deliveryInput = document.createElement("input");' +
                '    deliveryInput.type = "hidden";' +
                '    deliveryInput.name = "deliveryPhotosChecked";' +
                '    deliveryInput.value = deliveryPhotosChecked;' +
                '    form.appendChild(deliveryInput);' +
                '    var corrInput = document.createElement("input");' +
                '    corrInput.type = "hidden";' +
                '    corrInput.name = "correspondenceChecked";' +
                '    corrInput.value = correspondenceChecked;' +
                '    form.appendChild(corrInput);' +
                '    if (selectedTransactionIds[invoiceId] && selectedTransactionIds[invoiceId].length > 0) {' +
                '        var transIdsInput = document.createElement("input");' +
                '        transIdsInput.type = "hidden";' +
                '        transIdsInput.name = "selectedTransactions";' +
                '        transIdsInput.value = selectedTransactionIds[invoiceId].join(",");' +
                '        form.appendChild(transIdsInput);' +
                '    }' +
                '    if (fileQueues[invoiceId] && fileQueues[invoiceId].length > 0) {' +
                '        for (var i = 0; i < fileQueues[invoiceId].length; i++) {' +
                '            var fileInput = document.createElement("input");' +
                '            fileInput.type = "file";' +
                '            fileInput.name = "queuedFile_" + i;' +
                '            var dataTransfer = new DataTransfer();' +
                '            dataTransfer.items.add(fileQueues[invoiceId][i]);' +
                '            fileInput.files = dataTransfer.files;' +
                '            form.appendChild(fileInput);' +
                '        }' +
                '    }' +
                '    document.body.appendChild(form);' +
                '    form.submit();' +
                '}' +
                'function removeFile(fileId, responseRecordId, invoiceId) {' +
                '    if (!confirm("Remove this file from the response record?")) {' +
                '        return;' +
                '    }' +
                '    showLoading("Removing file...");' +
                '    var form = document.createElement("form");' +
                '    form.method = "POST";' +
                '    form.action = "' + scriptUrl + '";' +
                '    var actionInput = document.createElement("input");' +
                '    actionInput.type = "hidden";' +
                '    actionInput.name = "action";' +
                '    actionInput.value = "removeFile";' +
                '    form.appendChild(actionInput);' +
                '    var fileInput = document.createElement("input");' +
                '    fileInput.type = "hidden";' +
                '    fileInput.name = "fileId";' +
                '    fileInput.value = fileId;' +
                '    form.appendChild(fileInput);' +
                '    var responseInput = document.createElement("input");' +
                '    responseInput.type = "hidden";' +
                '    responseInput.name = "responseRecordId";' +
                '    responseInput.value = responseRecordId;' +
                '    form.appendChild(responseInput);' +
                '    var invoiceInput = document.createElement("input");' +
                '    invoiceInput.type = "hidden";' +
                '    invoiceInput.name = "invoiceId";' +
                '    invoiceInput.value = invoiceId;' +
                '    form.appendChild(invoiceInput);' +
                '    document.body.appendChild(form);' +
                '    form.submit();' +
                '}' +
                'var selectedTransactionIds = {};' +
                'function loadCustomerTransactions(invoiceId, responseRecordId) {' +
                '    var listDiv = document.getElementById("transaction-list-" + invoiceId);' +
                '    listDiv.innerHTML = "<div style=\\"padding: 10px; text-align: center;\\">Loading transactions...</div>";' +
                '    listDiv.style.display = "block";' +
                '    var url = "' + scriptUrl + '&action=loadCustomerTransactions&invoiceId=" + invoiceId;' +
                '    fetch(url)' +
                '        .then(function(response) { return response.json(); })' +
                '        .then(function(data) {' +
                '            if (!data.success) {' +
                '                listDiv.innerHTML = "<div style=\\"padding: 10px; color: #dc3545;\\">Error: " + escapeHtmlClient(data.error) + "</div>";' +
                '                return;' +
                '            }' +
                '            displayTransactionList(invoiceId, data.transactions);' +
                '        })' +
                '        .catch(function(error) {' +
                '            listDiv.innerHTML = "<div style=\\"padding: 10px; color: #dc3545;\\">Error loading transactions: " + error + "</div>";' +
                '        });' +
                '}' +
                // UPDATED: displayTransactionList with chargeback indicators
                'function displayTransactionList(invoiceId, transactions) {' +
                '    var listDiv = document.getElementById("transaction-list-" + invoiceId);' +
                '    if (!transactions || transactions.length === 0) {' +
                '        listDiv.innerHTML = "<div style=\\"padding: 10px; color: #666; font-style: italic;\\">No transactions found</div>";' +
                '        return;' +
                '    }' +
                '    if (!selectedTransactionIds[invoiceId]) {' +
                '        selectedTransactionIds[invoiceId] = [];' +
                '    }' +
                '    var html = "<div style=\\"padding: 8px; background-color: #f0f8ff; border-bottom: 1px solid #2196F3; font-weight: bold; font-size: 11px;\\">Select transactions to generate PDFs (" + transactions.length + " available - sorted oldest to newest)</div>";' +
                '    for (var i = 0; i < transactions.length; i++) {' +
                '        var trans = transactions[i];' +
                '        var isChecked = selectedTransactionIds[invoiceId].indexOf(trans.id) !== -1;' +
                '        ' +
                '        var chargebackLabel = "";' +
                '        var bgColor = "white";' +
                '        var borderColor = "#eee";' +
                '        ' +
                '        if (trans.hasCCDispute && trans.hasFraud) {' +
                '            chargebackLabel = " <span style=\\"color: #dc3545; font-weight: bold; font-size: 10px;\\">[DISPUTE + FRAUD]</span>";' +
                '            bgColor = "#fff5f5";' +
                '            borderColor = "#dc3545";' +
                '        } else if (trans.hasFraud) {' +
                '            chargebackLabel = " <span style=\\"color: #dc3545; font-weight: bold; font-size: 10px;\\">[FRAUD CHARGEBACK]</span>";' +
                '            bgColor = "#fff5f5";' +
                '            borderColor = "#dc3545";' +
                '        } else if (trans.hasCCDispute) {' +
                '            chargebackLabel = " <span style=\\"color: #f44336; font-weight: bold; font-size: 10px;\\">[DISPUTE CHARGEBACK]</span>";' +
                '            bgColor = "#fff9e6";' +
                '            borderColor = "#f44336";' +
                '        }' +
                '        ' +
                '        html += "<div style=\\"padding: 8px;" + borderColor + "; border-left: 3px solid " + borderColor + "; display: flex; align-items: center; background-color: " + bgColor + ";\\">";' +
                '        html += "<input type=\\"checkbox\\" id=\\"trans-" + invoiceId + "-" + trans.id + "\\" ";' +
                '        html += "onchange=\\"toggleTransactionSelection(\'" + invoiceId + "\', \'" + trans.id + "\', this.checked)\\" ";' +
                '        html += "style=\\"margin-right: 8px; width: 16px; height: 16px;\\"" + (isChecked ? " checked" : "") + " />";' +
                '        html += "<label for=\\"trans-" + invoiceId + "-" + trans.id + "\\" style=\\"flex: 1; cursor: pointer; font-size: 11px;\\">";' +
                '        html += "<strong>" + escapeHtmlClient(trans.typeLabel) + "</strong> ";' +
                '        html += "<a href=\\"/app/accounting/transactions/transaction.nl?id=" + trans.id + "\\" target=\\"_blank\\" ";' +
                '        html += "onclick=\\"event.stopPropagation();\\">" + escapeHtmlClient(trans.tranid) + "</a>";' +
                '        html += chargebackLabel;' +
                '        html += " | " + escapeHtmlClient(trans.date);' +
                '        html += " | $" + parseFloat(trans.amount).toFixed(2);' +
                '        html += " | " + escapeHtmlClient(trans.status);' +
                '        html += "</label>";' +
                '        html += "</div>";' +
                '    }' +
                '    html += "<div style=\\"padding: 8px; background-color: #f0f8ff; border-top: 1px solid #2196F3; font-size: 11px;\\">";' +
                '    html += "<span id=\\"selected-count-" + invoiceId + "\\">0 transactions selected</span>";' +
                '    html += "</div>";' +
                '    listDiv.innerHTML = html;' +
                '    updateSelectedTransactionCount(invoiceId);' +
                '}' +
                'function toggleTransactionSelection(invoiceId, transId, isChecked) {' +
                '    if (!selectedTransactionIds[invoiceId]) {' +
                '        selectedTransactionIds[invoiceId] = [];' +
                '    }' +
                '    var index = selectedTransactionIds[invoiceId].indexOf(transId);' +
                '    if (isChecked && index === -1) {' +
                '        selectedTransactionIds[invoiceId].push(transId);' +
                '    } else if (!isChecked && index !== -1) {' +
                '        selectedTransactionIds[invoiceId].splice(index, 1);' +
                '    }' +
                '    updateSelectedTransactionCount(invoiceId);' +
                '    updateNetSuiteTransCheckbox(invoiceId);' +
                '}' +
                'function updateSelectedTransactionCount(invoiceId) {' +
                '    var countSpan = document.getElementById("selected-count-" + invoiceId);' +
                '    if (countSpan && selectedTransactionIds[invoiceId]) {' +
                '        var count = selectedTransactionIds[invoiceId].length;' +
                '        countSpan.textContent = count + " transaction" + (count !== 1 ? "s" : "") + " selected";' +
                '        if (count > 0) {' +
                '            countSpan.style.fontWeight = "bold";' +
                '            countSpan.style.color = "#28a745";' +
                '        } else {' +
                '            countSpan.style.fontWeight = "normal";' +
                '            countSpan.style.color = "#333";' +
                '        }' +
                '    }' +
                '}' +
                'function updateNetSuiteTransCheckbox(invoiceId) {' +
                '    var checkbox = document.getElementById("netsuite-trans-checkbox-" + invoiceId);' +
                '    if (checkbox && selectedTransactionIds[invoiceId] && selectedTransactionIds[invoiceId].length > 0) {' +
                '        checkbox.checked = true;' +
                '    }' +
                '}' +
                'function toggleSubmissionChecklist(invoiceId, responseRecordId) {' +
                '    var checklistRow = document.getElementById("checklist-" + invoiceId);' +
                '    if (checklistRow) {' +
                '        if (checklistRow.style.display === "none") {' +
                '            checklistRow.style.display = "table-row";' +
                '            setTimeout(function() {' +
                '                var scrollTarget = document.getElementById("checklist-scroll-target-" + invoiceId);' +
                '                if (scrollTarget) {' +
                '                    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });' +
                '                } else {' +
                '                    checklistRow.scrollIntoView({ behavior: "smooth", block: "start" });' +
                '                }' +
                '            }, 100);' +
                '        } else {' +
                '            checklistRow.style.display = "none";' +
                '        }' +
                '    }' +
                '}' +
                // Scroll behavior on page load
                'document.addEventListener("DOMContentLoaded", function() {' +
                '    var urlParams = new URLSearchParams(window.location.search);' +
                '    var checklistSaved = urlParams.get("checklistSaved");' +
                '    var disputeFormSaved = urlParams.get("disputeFormSaved");' +
                '    var responseCreated = urlParams.get("responseCreated");' +
                '    var responseRecordId = urlParams.get("responseRecordId");' +
                '    var invoiceId = urlParams.get("invoiceId");' +
                '    if ((checklistSaved === "true" || disputeFormSaved === "true" || responseCreated === "true") && invoiceId && responseRecordId) {' +
                '        setTimeout(function() {' +
                '            var checklistRow = document.getElementById("checklist-" + invoiceId);' +
                '            if (checklistRow && checklistRow.style.display !== "none") {' +
                '                var scrollTarget = document.getElementById("checklist-scroll-target-" + invoiceId);' +
                '                if (scrollTarget) {' +
                '                    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });' +
                '                } else {' +
                '                    checklistRow.scrollIntoView({ behavior: "smooth", block: "start" });' +
                '                }' +
                '            }' +
                '        }, 500);' +
                '    }' +
                '});' +
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
                'function createResponseRecord(invoiceId, tranId) {' +
                '    if (!invoiceId) {' +
                '        alert("Invalid invoice ID");' +
                '        return;' +
                '    }' +
                '    showLoading("Creating response record...");' +
                '    window.location.href = "' + scriptUrl + '&action=createResponseRecord&invoiceId=" + invoiceId + "&tranId=" + encodeURIComponent(tranId);' +
                '}' +
                // UPDATED: Simplified - no prompt, just confirmation
                'function markDisputeUploaded(invoiceId, tranId, responseRecordId) {' +
                '    var confirmMsg = "Mark dispute response as submitted for invoice " + tranId + "?\\n\\n";' +
                '    confirmMsg += "This will:\\n";' +
                '    confirmMsg += "• Update the invoice memo\\n";' +
                '    confirmMsg += "• Check the \\"Chargeback Dispute Submitted\\" checkbox\\n";' +
                '    confirmMsg += "• Remove the invoice from the Dispute Submissions list\\n\\n";' +
                '    confirmMsg += "The dispute response has been submitted via the Commerce Control Center online portal.";' +
                '    if (!confirm(confirmMsg)) {' +
                '        return;' +
                '    }' +
                '    showLoading("Marking response as submitted...");' +
                '    window.location.href = "' + scriptUrl + '&action=markDisputeUploaded&invoiceId=" + invoiceId + "&tranId=" + encodeURIComponent(tranId) + "&responseRecordId=" + responseRecordId;' +
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
                '        html += "<button type=\\"button\\" class=\\"action-btn chargeback-btn" + disabledClass + "\\"" + disabledAttr + " onclick=\\"processAction(\'chargeback_" + inv.id + "\', \'" + inv.id + "\', \'chargeback\')\\\">Process Dispute Chargeback</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn fraud-btn" + disabledClass + "\\"" + disabledAttr + " onclick=\\"processAction(\'fraud_" + inv.id + "\', \'" + inv.id + "\', \'fraud\')\\\">Process Fraud Chargeback</button>";' +
                '        html += "<button type=\\"button\\" class=\\"action-btn nsf-btn\\" onclick=\\"processAction(\'nsf_" + inv.id + "\', \'" + inv.id + "\', \'nsf\')\\\">Process NSF Check</button>";' +
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