# Functional Specification

## Property Stewards - Version 1.5

## Project Overview

### Project Objective

The Property Stewards project is an end-to-end property inspection management system. It encompasses the entire inspection workflow — from scheduling property inspectors and managing customer inspection requests, to capturing inspection data and generating professional inspection reports. The process concludes when the administrator marks the inspection work order as complete.

### Objective and Purpose of Functional Specification

The objective of this document is to define the project scope, workflow, and data structure of the Property Stewards system. It serves as a comprehensive technical and process guideline to ensure alignment between all stakeholders. Upon mutual agreement, this document will act as the reference framework for system implementation and validation.

• Project Sponsor: Property Stewards PTE LTD
• Project Implementor: Breezlab PTE LTD

### In Scope Tasks

1. **Back Office System**
   Implementation of a back office system for administrators to manage customers and assign inspection work orders to inspectors upon customer confirmation. This system will be developed using Next.js, a React-based framework, with shadcn/ui components and Tailwind CSS for a modern, accessible, and performant web application.

2. **Inspector Interface via WhatsApp**
   WhatsApp will serve as the primary user interface for property inspectors to receive and manage assigned tasks. Incoming messages will be processed using Wassenger for WhatsApp integration, and AI-driven natural language processing via OpenAI will guide inspectors through their tasks by providing contextual responses and next-step instructions.

3. **Inspection Task Management and Report Generation**
   Core functionalities will include the assignment of inspectors, collection of inspection data (including text, images, and videos), and automated generation of professional inspection reports based on the submitted content.

### Constraints

1. **WhatsApp as Primary Communication Channel**
   WhatsApp has been designated as the main communication platform for inspectors. As such, all inspectors must possess a smartphone (iOS or Android) capable of running WhatsApp reliably. Additionally, inspectors are expected to have basic proficiency in using WhatsApp for messaging and media sharing.

### Dependencies

1. **Wassenger (WhatsApp Integration)**
   WhatsApp communication relies on the third-party service provider Wassenger. The reliability and performance of inspector communication channels are subject to the stability and availability of Wassenger's services.

2. **OpenAI (Natural Language Processing)**
   OpenAI is used as the core NLP engine for interpreting and responding to WhatsApp messages. The accuracy, response quality, and availability of automated interactions are dependent on OpenAI's service performance.

3. **Next.js (Back Office Platform)**
   The back office system is built using Next.js, a React framework. This provides full control over the application architecture, deployment options, and eliminates dependency on third-party low-code platform availability.

4. **DigitalOcean**
   All primary data storage and databases are hosted on DigitalOcean infrastructure. The overall system reliability and data availability depend on the performance and uptime of DigitalOcean services.

---

## Business Process

### Customers Management

The Customer section manages individuals or entities who have confirmed a property inspection contract.

• **Direct Customer Entry:**
Customers are created directly when contracts are confirmed.

• **Returning Customers:**
Returning customers use their existing customer record for future engagements.

• **Data Management:**
Customer information, including addresses and contact details, can be viewed and edited by administrators through the back office system.

### Inspectors Management

Inspectors are property inspection personnel engaged by Property Stewards, either on a part-time or full-time basis, as defined by their employment terms.

• **Inspector Profile:**
Each inspector profile must include essential details such as the inspector's name and a working phone number registered with WhatsApp, which is used as the primary communication channel.

• **Admin Access:**
Administrators have the ability to create and update inspector records through the back office system.

• **Deletion Policy:**
For data consistency and historical tracking, inspectors who have previously been assigned to any job cannot be permanently deleted. Instead, their records can be marked as "deleted" or "inactive" to prevent further use while retaining historical data.

### Contracts Management

Each confirmed inspection job represents a contract between the customer and Property Stewards. A single customer may hold multiple contracts over time.

#### Contract Lifecycle

Contract statuses must be manually updated by the administrator to reflect the progression of each job. The lifecycle includes the following stages:

• **Draft:**
The contract has been created but not yet confirmed by the customer. No scheduling or invoicing occurs at this stage.

• **Confirmed:**
The customer has agreed to proceed. A sales invoice is typically issued at this stage, but the job has not yet been scheduled.

• **Scheduled:**
The inspection has been scheduled and assigned to an inspector. This status is set after the first invoice payment is received.

• **Completed:**
The inspection work under the contract has been completed. A final invoice should be issued at this stage.

• **Closed:**
All work is completed and full payment (including the final invoice) has been received.

• **Cancelled:**
The contract has been voided due to customer cancellation prior to job execution.

#### Data Management

Administrators can create, update, and manage contract records and statuses through the back office system.

### Work Order Management

Each contract typically includes one work order for the property inspection job. However, multiple work orders may be associated with a single contract under certain conditions, such as:

• The inspection cannot be completed in one session and requires a follow-up visit.
• The scheduled inspection is disrupted due to unforeseen circumstances.
• Additional visits are needed to address incomplete or outstanding tasks.

#### Work Order Assignment and Tracking

• Each work order can be assigned to a different inspector.
• Work order status is automatically updated based on WhatsApp activity and inspector responses.

**Work Order Statuses:**

• **Scheduled:** The work order is scheduled and assigned to an inspector. Color code will be Blue.
• **Started:** The inspector has initiated the inspection job. Color code will be Orange.
• **Cancelled:** The job is cancelled or postponed (e.g., due to rescheduling). Color code will be Red.
• **Completed:** The inspection work for that day is finished. Color code will be Green.

Rescheduling a work order will cancel the existing one and create a new work order with a status of Scheduled.

#### Administrative Control

• Administrators have the authority to override work order statuses when necessary.
• Final decisions to close a contract can be made by the admin, regardless of the current status of individual work orders.

### Checklist Management

The system supports the use of customizable checklists to standardize inspection requirements across different property types.

• **Predefined Checklists:**
Administrators can create and manage multiple predefined checklists tailored to various property types (e.g., residential, commercial, industrial). These checklists serve as templates to streamline setup during contract creation.

• **Checklist Selection:**
When a new contract is created, the administrator can select a relevant checklist template based on the property type associated with the contract.

• **Customization per Contract:**
While templates provide a starting point, administrators have full flexibility to modify checklist items to suit the specific needs of each contract or inspection scenario.

### Report Generation

Each contract culminates in the generation of a final inspection report for the customer. Reports are created based on data collected during the execution of one or more work orders.

#### Report Types

• **Standard Report**
A downloadable PDF document containing structured inspection findings. This report is sent to the customer via email or download link.

• **Enhanced Report**
A web-based report page that includes interactive content such as videos captured during the inspection, alongside text and images.

#### Report Workflow

• Once a work order is marked as Completed, an email notification is sent to the administrator indicating that the report is ready for generation.
• The system aggregates all inspection data (text, images, and videos) collected from the completed work order(s).
• Administrators have the ability to review and override any report content—including text descriptions, images, or videos—before finalizing the report.

### BI Dashboard

A Business Intelligence (BI) dashboard will be considered for future development to provide internal stakeholders with real-time operational insights and performance monitoring. Key metrics to be tracked include:

• Number of jobs per week/month
• Average inspection duration
• Job completion rate (%)
• Customer repeat rate (% and count)

These metrics will be derived from system-generated data and visualized using a future analytics layer. The system's architecture will support the necessary data models and extract-transform-load (ETL) processes to enable this feature.

This dashboard will serve as a key decision-support tool for business, operations, and management teams. Design and implementation of the BI layer will be scoped based on business priority and available resources in a future phase.

#### Report Template

All reports are generated based on predefined templates to ensure consistency in format and presentation.

---

## User Cases

### General Flows

[Detailed flow diagram showing Inspector (Using WhatsApp), Wassenger, Back Office / OpenAI, Admin, and OSOME interactions]

1. **Admin Flow (Starts at Start A)**
   a. Admin receives an incoming inspection request.
   b. Admin confirms the request with the customer.
   c. Admin confirms timing for inspection.
   d. OSOME issues the first invoice and records payment upon receipt.
   e. Admin schedules and assigns an inspector.
   f. System updates the database.

2. **Inspector Flow (Starts at Start B) via WhatsApp**
   a. Inspector receives a job reminder through WhatsApp.
   b. Inspector queries: "What's my job today?"
   c. WhatsApp router fetches today's jobs from the database.
   d. Inspector views job list and selects a job to start.
   e. Inspector begins the job operation, which includes:
   i. Job start/end/re-open
   ii. Room selection
   iii. Taking images/videos
   iv. Recording comments and other operations
   v. Others actions

3. Router continuously routes these actions back to update the system.

4. **Job Completion Flow**
   a. Upon update from inspector, the system:
   i. Stores data (text, images, videos)
   ii. Checks whether the job is completed
   b. If not completed, continue updating.
   c. If completed, notify admin via email.
   d. Job can be re-open again

5. **Report & Closure Flow**
   a. Admin amends the report if needed.
   b. Admin generates and sends report to customer.
   c. Admin marks job as ended.
   d. OSOME:
   i. Confirms the report is generated.
   ii. Manually creates and sends the final invoice to the customer.
   e. If final payment is received, the contract is closed.
   f. If payment is pending, admin follows up with the customer.

### WhatsApp Conversation with Operation

#### 1. Job Assignment and Selection Flow

**Inspector initiates conversation:**

> 💬 **Inspector:** Hi, show me my job today

> 🤖 **AI Agent:** Hi John, your jobs today as listed:
>
> 1. Mr. Tan, Blk 9, Jalan Bahagia, +65 988888888, Open, anytime
> 2. Ms. Rachel, Block 27, Woodlands Drive #04-05, +65 97465867, Open for 10am
> 3. Bala, 29, Jurong Height #02-09, +65 94657354, Completed
>
> Please select a destination to start off

_Note: Display jobs today, including completed_

> 💬 **Inspector:** I select destination 2

> 🤖 **AI Agent:** Please confirm the destination 2. Ms. Rachel, Block 27, Woodlands Drive #04-05, +65 97465867

> 💬 **Inspector:** Yes

> 🤖 **AI Agent:** Destination confirmed at 2. Ms. Rachel, Block 27, Woodlands Drive #04-05, +65 97465867 on 2025-06-27, 10am

_Note: Destination confirmed_

#### 2. Destination Change Flow

> 💬 **Inspector:** No, it should be Mr. Tan

_Note: Destination already confirmed, and now there is a change_

> 🤖 **AI Agent:** May I know if you want to change destination?

> 💬 **Inspector:** Yes

> 🤖 **AI Agent:** Cancel the destination?

> 💬 **Inspector:** Yes

> 🤖 **AI Agent:** Hi John, how can I help you today?

_Note: System reset_

#### 3. Task Execution Flow

**After selecting destination 1 (Mr. Tan):**

> 🤖 **AI Agent:** Please select a location to begin
>
> 1. Bedroom 1
> 2. Bedroom 2
> 3. Bathroom

> 💬 **Inspector:** Bedroom 1

> 🤖 **AI Agent:** You are now in Bedroom 1

> 💬 **Inspector:** ok

> 🤖 **AI Agent:** Please select a task to start in Bedroom 1
>
> 1. Check aircon
> 2. Check windows
> 3. Check door

> 💬 **Inspector:** Check windows

> 🤖 **AI Agent:** Confirm you start with check windows

#### 4. Data Collection and Documentation

**Inspector submits inspection data:**

> 📷 **Inspector:** [image 1]
> 🎥 **Inspector:** [Video 1]
> 💬 **Inspector:** Windows a bit leaking, not stable, need to change
> 💬 **Inspector:** Check windows is done

> 🤖 **AI Agent:** Please select a task to start in Bedroom 1
>
> 1. Check aircon
> 2. Check windows (Done)
> 3. Check door

#### 5. Task Modification Flow

> 💬 **Inspector:** Check windows again

> 🤖 **AI Agent:** Your comment on windows is "Windows a bit leaking, not stable, need to change"

_Note: Task already has previous comments_

> 💬 **Inspector:** Modify to Windows a big leaking, extremely not stable, change immediately

> 🤖 **AI Agent:** Comments updated

#### 6. Media Management

> 💬 **Inspector:** Show me the image

> 🤖 **AI Agent:** [image 1]

_Note: If having image, will show_

> 💬 **Inspector:** Delete this image

> 🤖 **AI Agent:** Image deleted

> 📷 **Inspector:** [image 1.1]
> 💬 **Inspector:** Add comment: use better brand

> 🤖 **AI Agent:** Comments updated

> 💬 **Inspector:** What is the comments now?

> 🤖 **AI Agent:** Windows a big leaking, extremely not stable, change immediately, use better brand

#### 7. Job Completion Scenarios

**Partial Completion:**

> 💬 **Inspector:** All job done

> 🤖 **AI Agent:** The Bathroom is not done

> 💬 **Inspector:** Check next week

> 🤖 **AI Agent:** Today work order on Mr. Tan is done

_Note: Job done, waiting for inspector input_

**Full Completion:**

> 🤖 **AI Agent:** Today all jobs are done

#### 8. Special Scenarios

**Job Cancellation:**

> 💬 **Inspector:** Cancel Mr. tan, he is not at home

> 🤖 **AI Agent:** Work order cancelled for Mr. Tan, due to he is not at home

_Note: Admin need to create another work order_

**Job Re-schedule:**

> 💬 **Inspector:** Re-schedule job for mr. tan, he is not free

> 🤖 **AI Agent:** Work order will be re-scheduled for Mr. Tan, due to he is not free

#### 9. Customer Feedback (Auto-Triggered)

> 🤖 **AI Agent:** Dear Mr. Tan, congratulation on your inspection job completion. Could you rate from 1 to 5 as 1 being less satisfaction and 5 being most satisfaction. Feel free to enter some comments

> 👤 **Customer:** I will give 4 for the job. I have some comment on Inspector seems rushing of time, other than that, I am good.

_Note: Capture the rating and remarks_

> 🤖 **AI Agent:** Thank you for your business and valuable comments, hope to see you again

---

**Important Note:** The conversation messages from AI Agent can be different, as it is not following any template. The system uses natural language processing to understand and respond appropriately to inspector inputs.

---

## Data Structure

### Customer

| No  | Name              | Type      | Mandatory | Remarks                                         |
| --- | ----------------- | --------- | --------- | ----------------------------------------------- |
| 1   | ID                | Text      | ✓         |                                                 |
| 2   | Name              | Text      | ✓         |                                                 |
| 3   | Type              | Dropdown  | ✓         | Individual / Company                            |
| 4   | Person in Charge  | Text      | ✓         | If is individual, the value is the same as Name |
| 5   | Email             | Text      | ✓         |                                                 |
| 6   | Phone             | Text      | ✓         |                                                 |
| 7   | Is Member         | Boolean   | ✓         | Yes / No                                        |
| 8   | Member since      | Date/Time |           |                                                 |
| 9   | Member expired on | Date/Time |           |                                                 |
| 10  | Member Tier       | Text      |           | To be define: Bronze / Silver / Gold            |
| 11  | Billing Address   | Text      | ✓         | Address for Billing                             |
| 12  | Remarks           | Text      |           | By Admin, specific to this customer             |
| 13  | Created On        | Date/Time | ✓         |                                                 |
| 14  | Updated On        | Date/Time | ✓         |                                                 |
| 15  | Status            | Text      | ✓         | Active / In-Active                              |

### Customer Addresses

| No  | Name          | Type      | Mandatory | Remarks                                                                   |
| --- | ------------- | --------- | --------- | ------------------------------------------------------------------------- |
| 1   | ID            | Text      | ✓         |                                                                           |
| 2   | Customer ID   | Text      | ✓         |                                                                           |
| 3   | Address       | Text      | ✓         |                                                                           |
| 4   | Postal Code   | Text      | ✓         |                                                                           |
| 5   | Property Type | Dropdown  | ✓         | HDB / Condo / EC / Apartment / Landed<br>Depend on selected property type |
| 6   | Property Size | Dropdown  | ✓         | Selection refer to table: Property Size                                   |
| 7   | Remarks       | Text      |           | Remarks for specific address                                              |
| 8   | Created On    | Date/Time | ✓         |                                                                           |
| 9   | Updated On    | Date/Time |           |                                                                           |
| 10  | Status        | Text      | ✓         | Active / In-Active                                                        |

1 customer by default will have at least 1 address. The address is where the inspection job carried out.

### Inspector

| No  | Name           | Type       | Mandatory | Remarks                    |
| --- | -------------- | ---------- | --------- | -------------------------- |
| 1   | ID             | Text       | ✓         |                            |
| 2   | Name           | Text       | ✓         |                            |
| 3   | Mobile Phone   | Text       | ✓         |                            |
| 4   | Type           | Dropdown   | ✓         | Full Time / Part Time      |
| 5   | Specialization | Checkboxes |           | Multiple selection         |
| 6   | Remarks        | Text       |           | Remarks for this inspector |
| 7   | Created On     | Date/Time  | ✓         |                            |
| 8   | Updated On     | Date/Time  |           |                            |
| 9   | Status         | Text       | ✓         | Active / In-Active         |

### Checklist

| No  | Name          | Type      | Mandatory | Remarks                       |
| --- | ------------- | --------- | --------- | ----------------------------- |
| 1   | ID            | Text      | ✓         |                               |
| 2   | Name          | Text      | ✓         |                               |
| 3   | Property Type | Dropdown  | ✓         | Pre-defined property type     |
| 4   | Item          | List      | ✓         |                               |
| 4.1 | Name          | Text      | ✓         | Example: Bedroom, Bathroom... |
| 4.2 | Action        | Text      | ✓         | Action to be done             |
| 5   | Remarks       | Text      |           | Remarks for this checklist    |
| 6   | Created On    | Date/Time | ✓         |                               |
| 7   | Updated On    | Date/Time |           |                               |
| 8   | Status        | Text      | ✓         | Active / In-Active            |

### Contract

| No  | Name                 | Type      | Mandatory | Remarks                                      |
| --- | -------------------- | --------- | --------- | -------------------------------------------- |
| 1   | ID                   | Text      | ✓         |                                              |
| 2   | Customer ID          | Text      | ✓         |                                              |
| 3   | Address ID           | Text      | ✓         | The inspection job is based on which address |
| 4   | Value                | Currency  | ✓         | Value of the contract                        |
| 5   | First Payment On     | Date      | ✓         | Required first payment to start              |
| 6   | Final Payment On     | Date      |           |                                              |
| 7   | Based on checklist   | Dropdown  | ✓         |                                              |
| 8   | Scheduled start date | Date      | ✓         |                                              |
| 9   | Scheduled end date   | Date      | ✓         | Usually is the same                          |
| 10  | Actual start date    | Date      |           |                                              |
| 11  | Actual end date      | Date      |           |                                              |
| 12  | Remarks              | Text      |           | Remarks for this contract                    |
| 13  | Service Package      | Dropdown  |           | Pre-defined service packages                 |
| 14  | Customer Comments    | Text      |           |                                              |
| 15  | Customer Rating      | Integer   |           |                                              |
| 16  | Created On           | Date/Time | ✓         |                                              |
| 17  | Updated On           | Date/Time |           |                                              |
| 18  | Status               | Text      | ✓         | Refer to contract status                     |

### Contract Checklist

| No  | Name          | Type      | Mandatory | Remarks                       |
| --- | ------------- | --------- | --------- | ----------------------------- |
| 1   | ID            | Text      | ✓         |                               |
| 2   | Contract ID   | Text      | ✓         |                               |
| 3   | Item          | List      | ✓         |                               |
| 3.1 | Name          | Text      | ✓         | Example: Bedroom, Bathroom... |
| 3.2 | Remarks       | Text      | ✓         |                               |
| 3.3 | Photos        | Images    |           | Multiple images               |
| 3.4 | Videos        | Videos    |           | Multiple videos               |
| 3.5 | Entered on    | Date/Time |           |                               |
| 3.6 | Entered by    | Inspector |           |                               |
| 3.7 | Work Order ID | Text      |           |                               |
| 4   | Created On    | Date/Time | ✓         |                               |
| 5   | Updated On    | Date/Time |           |                               |
| 6   | Status        | Text      | ✓         | Active / In-Active            |

1 contract only have 1 checklist, and can be customized after import from checklist template. The checklist can be worked by multiple inspectors, as can be follow up work order.

### Work Order

| No  | Name                      | Type      | Mandatory | Remarks                            |
| --- | ------------------------- | --------- | --------- | ---------------------------------- |
| 1   | ID                        | Text      | ✓         |                                    |
| 2   | Contract ID               | Text      | ✓         |                                    |
| 3   | Inspector ID              | Text      | ✓         | Can be multiple inspectors         |
| 4   | Scheduled Start Date/Time | Date/Time | ✓         |                                    |
| 5   | Scheduled End Date/Time   | Date/Time | ✓         |                                    |
| 6   | Actual Start              | Date/Time |           |                                    |
| 7   | Actual End                | Date/Time |           |                                    |
| 8   | Updated On                | Date/Time |           |                                    |
| 9   | Signature                 | B64       |           | Sign off                           |
| 10  | Sign Off By               | Text      |           | Name of the personnel who sign off |
| 11  | Remarks                   | Text      |           |                                    |
| 12  | Status                    | Text      | ✓         | Refer to work order status         |

---

## Technical Requirements

| No. | Component                 | Proposed Solution/Software                |
| --- | ------------------------- | ----------------------------------------- |
| 1   | UI/UX Framework           | Next.js with React and TypeScript         |
| 2   | UI Component Library      | shadcn/ui with Tailwind CSS               |
| 3   | Database                  | PostgreSQL (Managed Database)             |
| 4   | NLP Processing            | Open AI                                   |
| 5   | Storage                   | DigitalOcean Spaces                       |
| 6   | Environment               | DigitalOcean Cloud                        |
| 7   | Firewall                  | DigitalOcean Cloud Firewalls              |
| 8   | Security measurement      | Follow corporate policy                   |

### UI/UX Framework

Next.js being selected as the main UI/UX framework for this project. It is the main components for
• UI/UX which allow users/admin to access and manipulate the data.
• Workflow for all BPM (Business Process Management) operations
• User directory for the admin back office
• Dashboard for statistic report

For Inspector:
• Carried out the business processes

For Admin/Developers:
• Component-based architecture using React for building reusable UI components.
• Type-safe development with TypeScript for better code maintainability.
• Server-side rendering (SSR) and API routes for optimal performance.
• Built-in authentication and authorization systems.
• Manage users access

Operation will be captured as audit log for future reference.

### UI Component Library

shadcn/ui has been selected as the UI component library for this project:

• **Modern Component System:** Provides a comprehensive set of accessible, customizable React components built on Radix UI primitives
• **Tailwind CSS Integration:** Seamlessly integrates with Tailwind CSS for consistent styling and theming
• **Copy-and-Paste Components:** Components are copied directly into the project, giving full control over customization
• **Accessibility First:** All components follow WAI-ARIA guidelines and best practices
• **TypeScript Support:** Full TypeScript support with proper type definitions
• **Dark Mode Support:** Built-in support for light and dark themes

Key components utilized:
• Form components (Input, Select, Checkbox, Radio, etc.) for data entry
• Data Display components (Table, Card, Badge) for presenting information
• Navigation components (Tabs, Breadcrumb, Sidebar) for app navigation
• Feedback components (Alert, Toast, Dialog) for user notifications
• Layout components (Container, Grid, Flex) for responsive design

### Database

Relational database: PostgreSQL will be used. Served as main database for contract / checklist / work orders, as well as application records and system setting.

Database will not be visible to users, only admins / developers.

### Storage

Storage space selected will be DigitalOcean Spaces,

• The main purpose of the storage space is to store uploaded images / videos from inspector.
• PDF generated will be stored at DigitalOcean Spaces.

### NLP Processing

• NLP processing will be handled by OpenAI, which is able to interpret the incoming message, and process it with pre-defined next step.
• NLP processing will be able to handle multiple languages.
• It will apply to incoming processing of WhatsApp.

---

## Risk Mitigation

### 1. Wassenger (WhatsApp Integration)

• **Risk:** Service outage, message delivery failures, or unplanned API changes from Wassenger / WhatsApp.

• **Mitigation:**
o Daily logs and error tracking for WhatsApp message flow. This process is done automatically.
o 2 number running in parallel. Main number connected to Wassenger, 2nd number connected to WhatsApp Business API
o When Wassenger not responding, inspector to contact admin. Admin to confirm if the Wassenger is down, or WhatsApp is down
o Inspector able to send to 2nd number to continue the job
o If whatsapp is down, report + photos will have to be complied manually.

### 2. OpenAI (NLP Processor)

• **Risk:** API downtime, quota limits, or unpredictable response quality.

• **Mitigation:**
o Monitor API usage with rate limit alerts and quota tracking.
o Implement default fallback replies for inspectors in case of processing failure.
▪ The inspector will notify the admin
▪ Admin will test the NLP response from the Next.js admin panel to confirm
▪ If NLP is down, report and photos will have to be complied manually
▪ Once the NLP OpenAI resume, the inspector will be able to continue from where the progress left from last action
▪ In case of prolonged outage, admin will generate inspection instructions using the back-office job data and pre-formatted checklists, which can be downloaded or printed for manual distribution.

### 3. DigitalOcean (Storage & Database)

• **Risk:** Data loss, service outages, or regional failures.

• **Mitigation:**
o Automated daily backups for databases and media storage (Spaces, Managed Databases).
o DigitalOcean Spaces is guaranteed availability by DigitalOcean, unless explicitly deleted by user. It is always available.
o Database will be backup automatically every midnight 1am, and first day of every month
o Multi-region deployment for high availability. However this is expensive option.

### 4. Next.js (Back Office Platform)

• **Risk:** Application deployment or hosting infrastructure issues affecting admin operations.

• **Mitigation:**
o Full source code control and version management through Git.
o Multiple deployment options (Vercel, DigitalOcean, self-hosted).
o In the event of hosting issues, the application can be quickly redeployed to alternative infrastructure.
o Inspector jobs will continue via WhatsApp even if the admin interface is temporarily unavailable.
o Containerization with Docker for consistent deployment across environments.
