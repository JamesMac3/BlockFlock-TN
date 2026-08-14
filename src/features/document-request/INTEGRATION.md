# Document-request generator integration

## Public input boundary

The frontend collects only:

- Jurisdiction and government entity
- A chapter-master-approved request goal
- An approved prefill option
- A defined records scope and optional date range
- Delivery method

The website must never request, receive, validate, persist, or send requester identity information. This includes names, organizations, email addresses, telephone numbers, street addresses, citizenship attestations, identification documents, payment authorization, request dates, and signatures. There is no public freeform or advanced template editor.

## Document completion boundary

The browser generator fills only approved non-personal request content. Official municipal AcroForm identity fields remain blank, present, and editable. Municipal forms are never flattened.

After downloading the generated document, the requester completes identity, any required ID proof, payment authorization, request date, and signature outside this website. Adobe Acrobat Reader can be used locally. Using Adobe's online tools uploads the document to Adobe and is subject to Adobe's own privacy practices.

The application must not create backend request drafts or add PII telemetry or analytics.
