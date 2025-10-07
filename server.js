const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
// serve uploads properly already added
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// EJS setup
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');


// Middleware
app.use(express.urlencoded({ extended: true }));

app.use(express.json());
app.use(session({
    secret: '$535$',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 }
}));


// PostgreSQL pool
const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
});

//handling the upload things
['uploads/profile_pics', 'uploads/service_docs', 'uploads/payments'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// multer storage: route by fieldname (reliable)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // route by form field name
    if (file.fieldname === 'profile_pic') cb(null, path.join('uploads', 'profile_pics'));
    else if (file.fieldname === 'document' || file.fieldname === 'service_doc') cb(null, path.join('uploads', 'service_docs'));
    else if (file.fieldname === 'proof_file') cb(null, path.join('uploads', 'payments'));
    else cb(null, 'uploads'); // fallback
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, file.fieldname + '-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });


// Home (main route, needs a proper page, build it later) dont forget 
app.get('/', (req, res) => {
    res.render('home');
});
//accessing the aviable services 
app.get('/services', async (req, res) => {
    try {
        const services = await pool.query(`
            SELECT s.id, s.name AS service_name, s.description, d.name AS department_name
            FROM services s
            JOIN departments d ON s.department_id = d.id
            ORDER BY d.name, s.name
        `);

        res.render('services', { services: services.rows });
    } catch (err) {
        console.error("Error fetching services:", err);
        res.status(500).send("Error loading services page");
    }
});

// ======== Registeration section ========
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    const { name, email, password, national_id, dob, contact } = req.body;
    const role = 'citizen';  // fixed, our admin will register officer and another admin
    const department_id = null; // default
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        // ✅ Email format validation (basic but solid)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('register', { error: 'Please enter a valid email address.' });
        }

        // ✅ Duplicate check
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.render('register', { error: 'Email already exists. Please use another.' });
        }

        // ✅ Insert new citizen
        await pool.query(
            `INSERT INTO users (name, email, password, role, national_id, dob, contact, department_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, email, hashedPassword, role, national_id, dob, contact, department_id]
        );

        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Error registering user. Please try again.' });
    }
});



// ======== LOGIN section========
app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.send('No user found');

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.send('Wrong password');

        // Save session
        req.session.userId = user.id;
        req.session.role = user.role;

        // Redirect to role-specific dashboard
        if (user.role === 'citizen') return res.redirect('/citizen_dashboard');
        if (user.role === 'officer') return res.redirect('/officer_dashboard');
        if (user.role === 'admin') return res.redirect('/admin_dashboard');

    } catch (err) {
        console.error(err);
        res.status(500).send('Login error');
    }
});

// ======== LOGOUT ========
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Error logging out');
        res.redirect('/login'); // redirect to login page
    });
});

// ======== SESSION CHECK ========
app.get('/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('session_expired and loged out');
        
    }
    res.send({
        userId: req.session.userId,
        role: req.session.role
    });
});

// ======== ROLE MIDDLEWARE ========
function requireRole(role) {
    return (req, res, next) => {
        if (!req.session.userId) {
            return res.render('session_expired');
        }
        if (req.session.role !== role) {
            return res.render('access_denied');
        }
        next();
    };
}
// Service apply route
app.get('/service/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login'); 
    }
    const serviceId = req.params.id;
    res.redirect(`/dashboard/apply/${serviceId}`);
});

// Upload profile picture for all users
app.post('/upload_profile', upload.single('profile_pic'), async (req, res) => {
  if (!req.session.userId) return res.status(401).send("Not logged in");
  if (!req.file) return res.status(400).send("No file uploaded");

  const filePath = `/uploads/profile_pics/${req.file.filename}`; // matches static path

  try {
    await pool.query("UPDATE users SET profile_pic = $1 WHERE id = $2", [filePath, req.session.userId]);

    // redirect to dashboard appropriate for role
    const role = req.session.role;
    if (role === 'citizen') return res.redirect('/citizen_dashboard');
    if (role === 'officer') return res.redirect('/officer_dashboard');
    if (role === 'admin') return res.redirect('/admin_dashboard');
    return res.redirect('/');
  } catch (err) {
    console.error("Error saving profile picture:", err);
    res.status(500).send("Upload failed");
  }
});



///////////////////////////////////Citizens dashoard routes //////////////////////////////
app.get('/citizen_dashboard', requireRole('citizen'), async (req, res) => {
    try {
        // fetch citizen info
        const citizenResult = await pool.query(
             'SELECT id, name, email, national_id, dob, contact, profile_pic FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (citizenResult.rows.length === 0) {
            return res.status(404).send("Citizen not found");
        }
        const citizen = citizenResult.rows[0];

        // fetch citizen requests
        const result = await pool.query(
            `SELECT sr.id, s.name AS service_name, sr.status, sr.description AS details, sr.created_at
             FROM service_requests sr
             JOIN services s ON sr.service_id = s.id
             WHERE sr.citizen_id = $1 ORDER BY sr.created_at DESC`,
            [req.session.userId]
        );

        // pass both citizen info and requests to EJS
        res.render('citizen_dashboard', { citizen, requests: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading dashboard");
    }
});
//citizens request form
app.get('/citizen/apply', requireRole('citizen'), async (req, res) => {
    try {
        const services = (await pool.query('SELECT id, name FROM services ORDER BY name')).rows;
        res.render('request_form', { services });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading form");
    }
});
//save that request
app.post('/citizen/apply', requireRole('citizen'), upload.single('document'), async(req,res)=>{
    const {service_id, description} = req.body;
    const file = req.file; //its file information uploaded
    //const filePath = req.file ? req.file.filename : null;

    try{//insert request
        const result = await pool.query(
            `INSERT INTO service_requests(citizen_id, service_id, description, status, created_at)
             VALUES ($1, $2, $3, 'awaiting_payment', NOW()) RETURNING id`,
            [req.session.userId, service_id, description]
        );
        const requestId = result.rows[0].id;

        
        if(file){
            await pool.query(
                'INSERT INTO documents(request_id, file_path, file_type, uploaded_at) VALUES ($1,$2,$3, NOW())',
               // [requestId, `/uploads/${file.filename}`, file.mimetype]
                [requestId, `/uploads/service_docs/${file.filename}`, file.mimetype]

            );
        }
        res.redirect('/citizen_dashboard');
    }catch(err){
        console.error(err);
        res.status(500).send('Error submiting request');
    }
});
app.get('/citizen/pay/:id', requireRole('citizen'), (req, res) => {
    res.render('citizen_payment', { requestId: req.params.id });
});
// Upload proof of payment
app.post('/citizen/pay/:id', requireRole('citizen'), upload.single('proof_file'), async (req, res) => {
    const requestId = req.params.id;
    const filePath = '/uploads/payments/' + req.file.filename;

    await pool.query(
    `INSERT INTO payments (request_id, amount, status, proof_file, paid_at)
     VALUES ($1, 100, 'pending', $2, NOW())`,
    [requestId, filePath]
);

    await pool.query(
    `UPDATE service_requests SET status = 'under_review' WHERE id = $1`,
    [requestId]
);


    res.redirect('/citizen_dashboard');
});

//citizen see her status
app.get('/my_requests', requireRole('citizen'), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM service_requests WHERE citizen_id = $1',
            [req.session.userId]
        );
        res.render('my_requests', { requests: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading requests');
    }
});



///////////////////////////////////officer dashoard routes //////////////////////////////
app.get('/officer_dashboard', requireRole('officer'), async (req, res) => {
    const userId = req.session.userId;
    try {
       const result = await pool.query(
            `SELECT u.name, u.email, u.national_id, u.dob, u.contact, u.profile_pic, 
                    d.name AS department_name, s.name AS service_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            LEFT JOIN services s ON u.service_id = s.id
            WHERE u.id = $1`,
            [userId]
            );
        const officer = result.rows[0];
        res.render('officer_dashboard', { officer });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading officer dashboard");
    }
});
// officer.js (routes/controller)
app.get('/requests/:id', async (req, res) => {
    const requestId = req.params.id;

    try {
        //const request = await db.query("SELECT * FROM requests WHERE id = $1",[requestId]);
        const request = await pool.query("SELECT * FROM service_requests WHERE id = $1", [requestId]);

        const documents = await db.query("SELECT * FROM documents WHERE request_id = $1",[requestId]);

        const payment = await db.query("SELECT * FROM payments WHERE request_id = $1",[requestId]);

        res.render("officer_request_view", {
            request: request.rows[0],
            documents: documents.rows,   //  pass docs
            payment: payment.rows[0]     //  pass payment
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});
//see the detials of each request 
app.get('/officer/requests/:id/view', requireRole('officer'), async (req, res) => {
  const { id } = req.params;
  const officerId = req.session.userId;

  try {
    const officer = await pool.query("SELECT department_id, service_id FROM users WHERE id=$1", [officerId]);
    if (officer.rows.length === 0) {
      return res.status(400).send("Officer not found");
    }
    
    const { department_id: officerDept, service_id: officerService } = officer.rows[0];

    const result = await pool.query(
  `SELECT r.id,
          r.description,
          r.status,
          r.created_at,
          u.name AS citizen_name,
          u.email AS citizen_email,
          u.contact AS citizen_contact,
          u.national_id,
          s.name AS service_name,
          COALESCE(json_agg(DISTINCT d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS documents,
          p.proof_file,
          p.status AS payment_status,
          p.amount
   FROM service_requests r
   JOIN users u ON r.citizen_id = u.id
   JOIN services s ON r.service_id = s.id
   LEFT JOIN documents d ON r.id = d.request_id
   LEFT JOIN payments p ON r.id = p.request_id
   WHERE r.id = $1 AND s.department_id = $2 AND s.id = $3
   GROUP BY r.id, u.name, u.email, u.contact, u.national_id, s.name, p.proof_file, p.status, p.amount`,
  [id, officerDept, officerService]
);


    if (result.rows.length === 0) {
      return res.status(404).send("Request not found or not in your department");
    }

    const row = result.rows[0];
    //console.log("Documents from DB:", row.documents); delete it later
    res.render("officer_request_view", {
    request: {
        id: row.id,
        description: row.description,
        status: row.status,
        created_at: row.created_at,
        citizen_name: row.citizen_name,
        citizen_email: row.citizen_email,
        citizen_contact: row.citizen_contact,
        national_id: row.national_id,
        service_name: row.service_name
    },
    documents: Array.isArray(row.documents) ? row.documents : JSON.parse(row.documents || '[]'),
    payment: {
        proof_file: row.proof_file,
        status: row.payment_status,
        amount: row.amount
    }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading request details");
  }
});

// Officer update request (approve/reject)
app.post('/officer_requests/:id/:action', requireRole('officer'), async (req, res) => {
    const { id, action } = req.params;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    try {
        await pool.query(
            'UPDATE service_requests SET status = $1 WHERE id = $2',
            [newStatus, id]
        );
        res.redirect('/officer/requests/' + newStatus);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating request');
    }
});
// Officer view requests by status
app.get('/officer/requests/:status', requireRole('officer'), async (req, res) => {
    try {
        const officerId = req.session.userId;
        const officer = await pool.query("SELECT department_id, service_id FROM users WHERE id=$1", [officerId]);
        
        if (officer.rows.length === 0) return res.status(400).send('Officer not found');
        const { department_id: deptId, service_id: serviceId } = officer.rows[0];

       //const deptId = officer.rows[0].department_id;

        // Map officer-friendly status to DB status
        let dbStatus;
        if (req.params.status === 'pending') dbStatus = 'under_review';
        else if (req.params.status === 'approved') dbStatus = 'approved';
        else if (req.params.status === 'rejected') dbStatus = 'rejected';
        else return res.status(400).send('Invalid status');

       const result = await pool.query(
            `SELECT r.id, r.description, r.status, u.name AS citizen_name, s.name AS service_name
            FROM service_requests r
            JOIN users u ON r.citizen_id = u.id
            JOIN services s ON r.service_id = s.id
            WHERE r.status = $1 AND s.department_id = $2 AND s.id = $3`,
            [dbStatus, deptId, serviceId]
        );


        res.render('officer_requests', { requests: result.rows, status: req.params.status });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading requests');
    }
});
// Officer approves a request
app.post('/officer/requests/:id/approve', requireRole('officer'), async (req, res) => {
    try {
        const requestId = req.params.id;
        await pool.query(
            "UPDATE service_requests SET status = 'approved' WHERE id = $1",
            [requestId]
        );
        res.redirect('/officer/requests/pending'); // back to pending list
    } catch (err) {
        console.error(err);
        res.status(500).send('Error approving request');
    }
});
// Officer rejects a request
app.post('/officer/requests/:id/reject', requireRole('officer'), async (req, res) => {
    try {
        const requestId = req.params.id;
        await pool.query(
            "UPDATE service_requests SET status = 'rejected' WHERE id = $1",
            [requestId]
        );
        res.redirect('/officer/requests/pending'); // back to pending list
    } catch (err) {
        console.error(err);
        res.status(500).send('Error rejecting request');
    }
});




///////////////////////////////////Admin dashboard routes //////////////////////////////
app.get('/admin_dashboard', requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, profile_pic FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Admin not found");
    }

    const admin = result.rows[0];
    res.render("admin_dashboard", { admin });
  } catch (err) {
    console.error("Error loading admin dashboard:", err);
    res.status(500).send("Error loading admin dashboard");
  }
});
// Manage Users
app.get("/admin/users", requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users ORDER BY id ASC");
        res.render("admin_users", { users: result.rows });
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).send("Error fetching users");
    }
});
// Manage Services
app.get("/admin/services", requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM services ORDER BY id ASC");
        res.render("admin_services", { services: result.rows });
    } catch (err) {
        console.error("Error fetching services:", err);
        res.status(500).send("Error fetching services");
    }
});
// Manage Departments
app.get("/admin/departments", requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM departments ORDER BY id ASC");
        res.render("admin_departments", { departments: result.rows });
    } catch (err) {
        console.error("Error fetching departments:", err);
        res.status(500).send("Error fetching departments");
    }
});
//View reports
app.get("/admin/reports", requireRole('admin'), async (req, res) => {
    try {
        // Summary queries
        const summaryQuery = `
            SELECT 
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM departments) AS total_departments,
                (SELECT COUNT(*) FROM services) AS total_services,
                (SELECT COUNT(*) FROM service_requests) AS total_requests,
                (SELECT COUNT(*) FROM service_requests WHERE status='approved') AS approved_requests,
                (SELECT COUNT(*) FROM service_requests WHERE status='rejected') AS rejected_requests,
                (SELECT COUNT(*) FROM service_requests WHERE status='awaiting_payment') AS awaiting_payment,
                (SELECT COUNT(*) FROM payments) AS total_payments
        `;
        const summary = (await pool.query(summaryQuery)).rows[0];

        // Detailed activity log
        const detailsQuery = `
            SELECT 
                u.name AS user_name, 
                s.name AS service_name, 
                d.name AS department_name, 
                sr.status,
                sr.created_at
            FROM service_requests sr
            JOIN users u ON sr.citizen_id = u.id
            JOIN services s ON sr.service_id = s.id
            JOIN departments d ON s.department_id = d.id
            ORDER BY sr.created_at DESC
        `;
        const details = (await pool.query(detailsQuery)).rows;

        res.render("admin_reports", { summary, details });
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).send("Error fetching reports");
    }
});


// ------------------------------------- ADMIN: USERS ---------------------------------------------------------

app.get("/admin/users/add", requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM departments ORDER BY name ASC");
    res.render("admin_add_user", { departments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading add user form");
  }
});
// Fetch services for a specific department (AJAX)
app.get("/admin/getServices/:departmentId", requireRole('admin'), async (req, res) => {
  const { departmentId } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, name FROM services WHERE department_id = $1 ORDER BY name ASC",
      [departmentId]
    );
    res.json(result.rows); // return JSON array
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});
app.post("/admin/users/add", requireRole('admin'), async (req, res) => {
  const { name, email, password, role, national_id, dob, contact, department_id, service_id } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === "officer") {
      await pool.query(
        `INSERT INTO users 
         (name, email, password, role, national_id, dob, contact, department_id, service_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [name, email, hashedPassword, role, national_id, dob, contact, department_id, service_id]
      );
    } else {
      await pool.query(
        `INSERT INTO users 
         (name, email, password, role, national_id, dob, contact) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [name, email, hashedPassword, role, national_id, dob, contact]
      );
    }

    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error adding user:", err);
    res.status(500).send("Error adding user");
  }
});
//geting and edit one users information
app.get('/admin/users/edit/:id', requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
        const departments = (await pool.query('SELECT * FROM departments ORDER BY name ASC')).rows;

        if (!user) {
            return res.status(404).send("User not found");
        }

        res.render('admin_edit_user', { user, departments });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading edit form");
    }
}); 
app.post('/admin/users/edit/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, email, role, national_id, dob, contact, department_id } = req.body;

    try {
        await pool.query(
            `UPDATE users 
             SET name=$1, email=$2, role=$3, national_id=$4, dob=$5, contact=$6, department_id=$7 
             WHERE id=$8`,
            [
                name,
                email,
                role,
                national_id || null,
                dob || null,
                contact || null,
                department_id || null,
                id
            ]
        );

        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating user");
    }
});
app.get('/admin/users/delete/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.redirect('/admin/users');
});


// -- --------------------------ADMIN: SERVICES dding new service by admin--------------------------------------------

app.get('/admin/services/add', requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM departments ORDER BY name');
    res.render('admin_add_service', { departments: result.rows });  // send departments to EJS
  } catch (err) {
    console.error(err);
    res.send('Error loading departments');
  }
});
app.post('/admin/services/add', requireRole('admin'), async (req, res) => {
    const { name, description, department_id } = req.body;
    await pool.query(
        'INSERT INTO services (name, description, department_id) VALUES ($1, $2, $3)',
        [name, description, department_id]
    );
    res.redirect('/admin/services');
});
//editing the existing service by admin
app.get('/admin/services/edit/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const service = (await pool.query('SELECT * FROM services WHERE id=$1', [id])).rows[0];
    res.render('admin_edit_service', { service });
});
app.post('/admin/services/edit/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, description, department_id } = req.body;
    await pool.query(
        'UPDATE services SET name=$1, description=$2, department_id=$3 WHERE id=$4',
        [name, description, department_id, id]
    );
    res.redirect('/admin/services');
});
//deleting a serive by admin
app.get('/admin/services/delete/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM services WHERE id=$1', [id]);
    res.redirect('/admin/services');
});



// ---------------- ADMIN adds department, edit and delete it -----------------------------------------
app.get('/admin/departments/add', requireRole('admin'), (req, res) => {
    res.render('admin_add_department');  // form ejs
});
//admin adds new department
app.post('/admin/departments/add', requireRole('admin'), async (req, res) => {
    const { name, description } = req.body;
    await pool.query(
        'INSERT INTO departments (name, description) VALUES ($1, $2)',
        [name, description]
    );
    res.redirect('/admin/departments');
});
//admin edits a departments detals 
app.get('/admin/departments/edit/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const department = (await pool.query('SELECT * FROM departments WHERE id=$1', [id])).rows[0];
    res.render('admin_edit_department', { department });
});

app.post('/admin/departments/edit/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    await pool.query(
        'UPDATE departments SET name=$1, description=$2 WHERE id=$3',
        [name, description, id]
    );
    res.redirect('/admin/departments');
});
//admin deleting one service 
app.get('/admin/departments/delete/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM departments WHERE id=$1', [id]);
    res.redirect('/admin/departments');
});



// ======== SERVER START ========
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    //console.log(req.session);
});