# Coexcel Equipment Management System

A full-stack web application for a Customer Relationship Center (CRC) team handling Reliance customer care. It keeps equipment inventory, machine repairs and customer records in one system, with separate access for an Admin and for Employees.

**Live demo:** `https://<your-cloudfront-domain>`

## The problem

When a customer reports a broken machine, the CRC team has to check which equipment is in stock, log a repair order, order the parts it needs, and follow the repair until it is closed. This project puts that whole workflow in one place instead of spreadsheets and phone calls.

## Features

- **Equipment inventory**: add and track equipment with model, serial number, quantity and category.
- **Machine registry**: register machines with a location and status. Machines can be linked to a customer record.
- **Repair orders**: log an issue against a machine, attach the equipment the repair needs, and move it through *pending, in progress, completed*. The machine's status updates automatically when a repair is created or completed.
- **Customer records**: customer data supplied by Reliance, with search. Employees can add and edit; only the admin can delete.
- **Employee management (admin)**: create employee accounts, and activate or deactivate them. Deactivated employees can still sign in but are read-only.
- **Reports**: stock levels with a low-stock flag, repair status breakdown, repairs over time, and repairs per customer, with CSV export.

### Roles

| | Admin | Employee | Inactive employee |
|---|---|---|---|
| Equipment, machines, repair orders | Full access | Full access | View only |
| Customers | View, add, edit, delete | View, add, edit | View only |
| Employee management | Yes | No | No |
| Reports | Yes | Yes | Yes |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript. React 18 and Recharts (loaded from a CDN) for the reports page |
| Backend | Node.js 20, Express |
| Database | Supabase (PostgreSQL) |
| Auth and security | JWT (`jsonwebtoken`), `bcrypt`, `express-validator` |
| Hosting | AWS S3 (static frontend), AWS EC2 with PM2 (API), AWS CloudFront (HTTPS) |
| CI/CD | GitHub Actions |

## Architecture

```
Browser
   |  HTTPS
   v
Amazon CloudFront
   |-- /*      -> Amazon S3   (static frontend: HTML, CSS, JS)
   |-- /api/*  -> Amazon EC2  (Node.js + Express, run by PM2)
                      |
                      v
                 Supabase (PostgreSQL)
```

## Project structure

```
Coexcel/
├── .github/workflows/deploy.yml   # CI/CD pipeline
├── backend/
│   ├── server.js                  # Express API
│   ├── package.json
│   └── .env                       # local secrets (not committed)
└── public/
    ├── index.html                 # landing page
    ├── login.html
    ├── signup.html                # admin only: create employee accounts
    ├── dashboard.html             # equipment, machines, repair orders
    ├── customers.html
    ├── employees.html             # admin only
    └── reports.html
```

## Database

Six tables: `users`, `customers`, `equipment`, `machines`, `repair_orders` and `equipment_orders`.

- A customer has many machines (`machines.customer_id`).
- A machine has many repair orders.
- Repair orders and equipment are linked through `equipment_orders`, which records the quantity each repair needs.
- `created_by` on customers, equipment and repair orders points to the user who created the record.

<details>
<summary>Schema SQL (run in the Supabase SQL Editor)</summary>

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,                -- bcrypt hash
    role VARCHAR(20) NOT NULL DEFAULT 'employee',  -- admin, employee
    status VARCHAR(20) DEFAULT 'active',           -- active, inactive
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(100),
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    customer_code VARCHAR(50),
    notes TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE equipment (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    serial_number VARCHAR(100),
    quantity INT NOT NULL DEFAULT 0,
    category VARCHAR(50),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE machines (
    id BIGSERIAL PRIMARY KEY,
    machine_name VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    location VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'working',          -- working, needs_repair, under_repair, repaired
    customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE repair_orders (
    id BIGSERIAL PRIMARY KEY,
    machine_id BIGINT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    issue_description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',          -- pending, in_progress, completed
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE equipment_orders (
    id BIGSERIAL PRIMARY KEY,
    repair_order_id BIGINT NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
    equipment_id BIGINT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    quantity_needed INT NOT NULL,
    status VARCHAR(20) DEFAULT 'ordered',          -- ordered, received, used
    ordered_at TIMESTAMP DEFAULT NOW()
);
```

</details>

## API overview

Protected requests must send `Authorization: Bearer <token>`. The token is returned by the login endpoint.

| Area | Endpoints | Access |
|---|---|---|
| Auth | `POST /api/auth/login` | Public |
| Auth | `POST /api/auth/signup` | Admin |
| Users | `GET /api/users`, `PUT /api/users/:id`, `PUT /api/users/:id/status`, `DELETE /api/users/:id` | Admin |
| Equipment | `GET`, `POST /api/equipment`, `PUT`, `DELETE /api/equipment/:id` | Signed in; writes need an active account |
| Machines | `GET`, `POST /api/machines`, `PUT`, `DELETE /api/machines/:id` | Signed in; writes need an active account |
| Repairs | `GET`, `POST /api/repairs`, `GET`, `PUT /api/repairs/:id` | Signed in; writes need an active account |
| Customers | `GET`, `POST /api/customers`, `GET`, `PUT /api/customers/:id`, `GET /api/customers/:id/machines` | Signed in; writes need an active account |
| Customers | `DELETE /api/customers/:id` | Admin |
| Dashboard | `GET /api/stats` | Signed in |
| Reports | `GET /api/reports/equipment-stock`, `/repair-status`, `/repairs-over-time`, `/repairs-per-customer` | Signed in |

## Getting started

### Prerequisites

- Node.js 20 or newer
- Git
- A free [Supabase](https://supabase.com) project

### 1. Clone and install

```bash
git clone https://github.com/MehwishSayyed/Coexcel.git
cd Coexcel/backend
npm install
```

### 2. Create the database

Open the Supabase SQL Editor and run the schema from the Database section above.

### 3. Add environment variables

Create `backend/.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
JWT_SECRET=a-long-random-string
PORT=5000
```

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Create the first admin

Passwords are stored as bcrypt hashes, so generate one first (run this inside `backend/`):

```bash
node -e "require('bcrypt').hash('ChooseAStrongPassword', 10).then(console.log)"
```

Then insert the admin in the Supabase SQL Editor, pasting the hash:

```sql
INSERT INTO users (name, email, password, role, status)
VALUES ('Admin', 'admin@example.com', '<paste the hash here>', 'admin', 'active');
```

The admin can then create employee accounts from the app.

### 5. Run the app

```bash
npm run dev
```

Open `http://localhost:5000`. Run it from the `backend` folder: the Express server also serves the `public/` folder, so the frontend and API are available from one address.

Free Supabase projects pause after about a week of inactivity. If the API returns a 521 error, restore the project from the Supabase dashboard.

## Deployment (AWS)

### Frontend: S3

1. Create an S3 bucket and enable static website hosting with `index.html` as the index document.
2. Allow public reads with a bucket policy that grants `s3:GetObject` on `arn:aws:s3:::<your-bucket>/*`.
3. Upload the contents of `public/`. The CI/CD pipeline does this on every push.

### API: EC2

1. Launch an Ubuntu EC2 instance. In its security group, allow SSH (port 22) from your IP and TCP port 5000.
2. Install Node.js 20, Git and PM2.
3. Clone the repo and start the API:

```bash
git clone https://github.com/MehwishSayyed/Coexcel.git
cd Coexcel/backend
npm install
nano .env                                # add the same variables as local setup
pm2 start server.js --name Coexcel-ems
pm2 save
pm2 startup                              # run the command it prints, then pm2 save again
```

### HTTPS and routing: CloudFront

One distribution with two origins:

| Path | Origin | Settings |
|---|---|---|
| Default (`*`) | S3 website endpoint | Protocol HTTP only. Default root object `index.html` |
| `/api/*` | EC2 public DNS name, port 5000 | Protocol HTTP only. All HTTP methods. Cache policy `CachingDisabled`. Origin request policy `AllViewerExceptHostHeader`, which forwards the `Authorization` header |

The browser only talks to CloudFront over HTTPS, so the frontend calls the API with relative `/api` paths. This avoids mixed-content and CORS problems, and the same code works locally because Express serves both. After changing frontend files, create a CloudFront invalidation for `/*` so visitors get the new version.

### CI/CD: GitHub Actions

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Installs dependencies, syntax-checks `server.js` and verifies the required packages.
2. Syncs `public/` to the S3 bucket.
3. Connects to the EC2 instance over SSH, pulls the latest code, installs dependencies and restarts the PM2 process.

Repository secrets required:

| Secret | Purpose |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key for the S3 sync |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key for the S3 sync |
| `S3_BUCKET_NAME` | Target bucket for the frontend |
| `EC2_HOST` | Public address of the EC2 instance |
| `EC2_SSH_KEY` | Private key used for the SSH deploy |

Each team member works through their own IAM user, limited to the AWS service they own (S3, EC2, or CI/CD).

## Security

**Implemented**

- Passwords are hashed with bcrypt.
- JWT authentication with an 8-hour expiry. Protected routes reject requests without a valid token.
- Server-side role checks: admin-only routes, and write routes blocked for deactivated accounts.
- Input validation with `express-validator` on create and update routes.
- Database queries go through the Supabase client, which parameterizes them.
- Secrets live in `.env` and GitHub Secrets and are git-ignored.

**Roadmap**

- Rate limiting on the login endpoint
- Store the token in an httpOnly cookie instead of `localStorage`
- Audit trail (who changed or deleted what)
- Central error logging and monitoring
- Supabase Row Level Security
- Assign a machine to a customer from the UI (currently set in the database)
- Automated tests
- Custom domain with an ACM certificate

## Team

| Name | Responsibility |
|---|---|
| [Your name] | Full-stack development, database, EC2 deployment |
| [Friend 1 name] | Frontend hosting on S3 |
| [Friend 2 name] | CI/CD pipeline |

## Screenshots

<!-- Add screenshots here, for example: ![Dashboard](docs/dashboard.png) -->
