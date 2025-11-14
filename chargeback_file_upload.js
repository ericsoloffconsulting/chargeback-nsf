/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Chargeback Dispute File Upload Suitelet
 * Provides a proper NetSuite form for uploading dispute files to chargeback invoices
 */

define(['N/ui/serverWidget', 'N/record', 'N/redirect', 'N/log', 'N/file'],
    function (serverWidget, record, redirect, log, file) {

        /**
         * Handles GET and POST requests
         * @param {Object} context
         */
        function onRequest(context) {
            if (context.request.method === 'GET') {
                handleGet(context);
            } else {
                handlePost(context);
            }
        }

        /**
  * Handles GET requests - displays upload form
  * @param {Object} context
  */
        function handleGet(context) {
            var request = context.request;
            var invoiceId = request.parameters.invoiceId;
            var tranId = request.parameters.tranId;
            var returnScript = request.parameters.returnScript;
            var returnDeploy = request.parameters.returnDeploy;

            log.debug('File Upload GET Request', {
                invoiceId: invoiceId,
                tranId: tranId,
                returnScript: returnScript,
                returnDeploy: returnDeploy
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Load invoice to get customer name
                var invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: false
                });

                var customerName = invoiceRecord.getText('entity');

                // Create NetSuite form
                var form = serverWidget.createForm({
                    title: 'Upload Dispute File for Invoice ' + (tranId || invoiceId)
                });

                // Add instructions field
                var instructionsHtml = '<div style="background-color: #f0f0f0; padding: 15px; border-radius: 4px; margin-bottom: 20px;">' +
                    '<strong style="font-size: 14px; display: block; margin-bottom: 8px;">Upload Dispute Documentation</strong>' +
                    '<ul style="margin: 8px 0; line-height: 1.6; font-size: 13px;">' +
                    '<li>Customer: <strong>' + escapeHtml(customerName) + '</strong></li>' +
                    '<li>Invoice: <strong>' + escapeHtml(tranId || invoiceId) + '</strong></li>' +
                    '<li>Upload dispute documentation files for this chargeback invoice</li>' +
                    '<li>File will be attached to the invoice</li>' +
                    '<li>You can upload multiple files by using this form multiple times</li>' +
                    '</ul>' +
                    '</div>';

                var instructionsField = form.addField({
                    id: 'custpage_instructions',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Instructions'
                });
                instructionsField.defaultValue = instructionsHtml;

                // Add hidden fields to pass data through form submission
                var invoiceIdField = form.addField({
                    id: 'custpage_invoice_id',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Invoice ID'
                });
                invoiceIdField.defaultValue = invoiceId;
                invoiceIdField.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                var tranIdField = form.addField({
                    id: 'custpage_tran_id',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Invoice Number'
                });
                tranIdField.defaultValue = tranId || '';
                tranIdField.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                var returnScriptField = form.addField({
                    id: 'custpage_return_script',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Return Script'
                });
                returnScriptField.defaultValue = returnScript || '';
                returnScriptField.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                var returnDeployField = form.addField({
                    id: 'custpage_return_deploy',
                    type: serverWidget.FieldType.TEXT,
                    label: 'Return Deploy'
                });
                returnDeployField.defaultValue = returnDeploy || '';
                returnDeployField.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.HIDDEN
                });

                // Add file upload field
                var fileField = form.addField({
                    id: 'custpage_dispute_file',
                    type: serverWidget.FieldType.FILE,
                    label: 'Select File to Upload'
                });
                fileField.isMandatory = true;

                // Add submit and cancel buttons
                form.addSubmitButton({
                    label: 'Upload File'
                });

                form.addButton({
                    id: 'custpage_cancel',
                    label: 'Cancel',
                    functionName: 'cancelUpload()'
                });

                var cancelScript = '<script>' +
                    'function cancelUpload() {' +
                    '    var returnScript = document.querySelector("[name=custpage_return_script]").value;' +
                    '    var returnDeploy = document.querySelector("[name=custpage_return_deploy]").value;' +
                    '    if (returnScript && returnDeploy) {' +
                    '        window.location.href = "/app/site/hosting/scriptlet.nl?script=" + returnScript + "&deploy=" + returnDeploy;' +
                    '    } else {' +
                    '        history.back();' +
                    '    }' +
                    '}' +
                    '</script>';

                var scriptField = form.addField({
                    id: 'custpage_cancel_script',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Script'
                });
                scriptField.defaultValue = cancelScript;

                context.response.writePage(form);

            } catch (e) {
                log.error('File Upload Form Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                var errorForm = serverWidget.createForm({
                    title: 'Error'
                });

                var errorField = errorForm.addField({
                    id: 'custpage_error',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Error'
                });
                errorField.defaultValue = '<div style="color: red; padding: 20px;">Error loading form: ' + escapeHtml(e.message) + '</div>';

                context.response.writePage(errorForm);
            }
        }

        /**
         * Handles POST requests - processes file upload
         * @param {Object} context
         */
        function handlePost(context) {
            var request = context.request;
            var invoiceId = request.parameters.custpage_invoice_id;
            var tranId = request.parameters.custpage_tran_id;
            var returnScript = request.parameters.custpage_return_script;
            var returnDeploy = request.parameters.custpage_return_deploy;

            log.debug('File Upload POST Request', {
                invoiceId: invoiceId,
                tranId: tranId,
                returnScript: returnScript,
                returnDeploy: returnDeploy,
                hasFiles: !!(request.files && request.files.custpage_dispute_file)
            });

            try {
                if (!invoiceId) {
                    throw new Error('Invoice ID is required');
                }

                // Get the uploaded file
                var uploadedFile = request.files.custpage_dispute_file;

                if (!uploadedFile) {
                    throw new Error('No file was uploaded. Please select a file.');
                }

                log.debug('File Retrieved', {
                    fileName: uploadedFile.name,
                    fileType: uploadedFile.type,
                    size: uploadedFile.size
                });

                // Set folder and save
                uploadedFile.folder = 2762649; // Chargeback Dispute Uploads folder
                var fileId = uploadedFile.save();

                log.debug('File Saved to Cabinet', {
                    fileId: fileId,
                    fileName: uploadedFile.name,
                    folder: 2762649
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

                // Redirect back to main portal with success message
                if (returnScript && returnDeploy) {
                    redirect.toSuitelet({
                        scriptId: returnScript,
                        deploymentId: returnDeploy,
                        parameters: {
                            uploadSuccess: 'true',
                            fileName: encodeURIComponent(uploadedFile.name),
                            invoiceId: invoiceId,
                            invoice: tranId || invoiceId
                        }
                    });
                } else {
                    // Fallback - show success page
                    var successForm = serverWidget.createForm({
                        title: 'File Upload Successful'
                    });

                    var successHtml = '<div style="padding: 20px; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 6px;">' +
                        '<strong>File Uploaded Successfully</strong><br><br>' +
                        'File: ' + escapeHtml(uploadedFile.name) + '<br>' +
                        'Invoice: <a href="/app/accounting/transactions/custinvc.nl?id=' + invoiceId + '" target="_blank">' + escapeHtml(tranId || invoiceId) + '</a><br><br>' +
                        '<a href="javascript:window.close();">Close Window</a>' +
                        '</div>';

                    var successField = successForm.addField({
                        id: 'custpage_success',
                        type: serverWidget.FieldType.INLINEHTML,
                        label: 'Success'
                    });
                    successField.defaultValue = successHtml;

                    context.response.writePage(successForm);
                }

            } catch (e) {
                log.error('File Upload POST Error', {
                    error: e.toString(),
                    stack: e.stack,
                    invoiceId: invoiceId
                });

                // Redirect back with error
                if (returnScript && returnDeploy) {
                    redirect.toSuitelet({
                        scriptId: returnScript,
                        deploymentId: returnDeploy,
                        parameters: {
                            error: encodeURIComponent('File Upload Error: ' + e.toString())
                        }
                    });
                } else {
                    var errorForm = serverWidget.createForm({
                        title: 'Upload Error'
                    });

                    var errorField = errorForm.addField({
                        id: 'custpage_error',
                        type: serverWidget.FieldType.INLINEHTML,
                        label: 'Error'
                    });
                    errorField.defaultValue = '<div style="color: red; padding: 20px;">Error: ' + escapeHtml(e.message) + '</div>';

                    context.response.writePage(errorForm);
                }
            }
        }

        /**
         * Escapes HTML special characters
         * @param {string} text
         * @returns {string}
         */
        function escapeHtml(text) {
            if (!text) return '';
            return text.toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        return {
            onRequest: onRequest
        };
    });