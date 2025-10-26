# 🌐 E-Government Citizen Services Portal

*Capstone Project*

## 📖 Project Overview

The **E-Government Citizen Services Portal** is a role-based system designed to bring government services online. Instead of visiting physical offices, citizens can apply for services, upload documents, and make payments digitally. Officers process those requests, while admins oversee the entire system with full reporting and management tools.

This project is built using **Node.js, Express, PostgreSQL, and EJS** with a clean, simple frontend.

---

## 👥 User Roles & Features

### 🧑‍💼 Admin

* Add/manage **officers** and **citizens** directly from the admin dashboard.
* Create and manage **departments** and **services** dynamically.
* Assign officers to specific services.
* View and manage all users in the system.
* Generate **reports and analytics** across departments and services.

### 🏛️ Officer

* Assigned to **one service** under a department (e.g., Birth Certificate in Interior Affairs).
* Officers can only view and process requests for **their own service**.
* View submitted requests, documents, and payment details.
* Approve or reject applications with notes.

### 👨‍👩‍👧 Citizen

* Register/login or be added by admin.
* Update personal profile (National ID, DOB, contact info, etc.).
* Apply for services under different departments.
* Upload required documents (PDF, JPG).
* Make payments (simulated).
* Track request status: `Submitted → Under Review → Approved / Rejected`.
* Receive notifications when status changes.

---

## 🔄 System Workflow

1. **Citizen** submits a request for a service and uploads documents.
2. **Officer** assigned to that service reviews the request, checks documents & payment, then approves or rejects.
3. **Admin** manages all users, departments, and services, and can see full system reports (requests per service, approvals/rejections, fees collected).

---

## 🗄️ Database Structure (Conceptual)

* **users** → citizens, officers, admins (with roles).
* **departments** → Interior Affairs, Commerce, Housing, etc.
* **services** → linked to departments (e.g., Passport Renewal, Business License).
* **requests** → citizen applications with status tracking.
* **documents** → uploaded files linked to requests.
* **payments** → payment records for services.
* **notifications** → updates sent to users.

---

## 🖥️ Tech Stack

* **Backend** → Node.js, Express.js
* **Frontend** → EJS templates, Bootstrap/Tailwind CSS
* **Database** → PostgreSQL
* **Authentication** → express-session, bcrypt
* **File Uploads** → Multer
* **Deployment** → PostgreSQL DB + Node.js server

---

## 📂 Project Features Summary

✅ Dynamic department & service creation by admin
✅ Officers limited to **their assigned services**
✅ Document upload & payment tracking
✅ Citizen-friendly dashboard for applying & tracking requests
✅ Officer dashboard for reviewing/approving requests
✅ Admin dashboard for managing everything & viewing reports

---

## ⚙️ Setup Instructions

1. **Clone the repository**

```bash
git clone https://github.com/your-username/e-gov-portal.git
cd e-gov-portal
```

2. **Install dependencies**

```bash
npm install
```

3. **Setup database**

* Create a PostgreSQL database (e.g., `egov_portal`).
* Import schema (tables: users, departments, services, requests, documents, payments, notifications).
* Configure `.env` with DB credentials.

4. **Run server**

```bash
npm start
```

5. **Access app**

```
http://localhost:3000
```

---

## 📊 Reports & Analytics

* Requests per department & service.
* Approved vs rejected counts.
* Total revenue from service fees.
* Officer activity tracking.

---

## 🚀 Future Improvements

* Real payment gateway (Stripe/PayPal).
* SMS/Email notification system.
* REST APIs for mobile apps.
* Multi-language support.
* Advanced chart-based analytics.

---

✨ This system makes governance **faster, more transparent, and citizen-friendly** by digitizing government workflows.

---

