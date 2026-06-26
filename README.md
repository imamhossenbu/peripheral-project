# Peripheral Management & Inventory System Backend

A modern, scalable, and feature-rich backend built with **NestJS**, **Prisma ORM**, and **PostgreSQL** to manage IT peripheral inventory, track device lifecycles with automated audit logs, distribute notifications, and provide administrative analytics.

---

## 🛠️ Tech Stack & Architecture

- **Core Framework**: NestJS (v11+)
- **Database ORM**: Prisma ORM with PostgreSQL Adapter
- **Authentication**: JWT (Passport) + Custom Role-Based Guards (`ADMIN`, `STAFF`, `STUDENT`)
- **Media Uploads**: Cloudinary Integration
- **Mailing**: Nodemailer (Resend API)
- **Testing**: Jest & Supertest E2E Test Suite

---

## 🌟 Key Features

1. **Authentication & Profile Management**
   - User registration and activation flow.
   - JWT-based login with dynamic session validation.
   - Security flows: Password reset, change password, profile details updates, and profile image uploads via Cloudinary.
2. **Role-Based Access Control (RBAC)**
   - Custom `@Roles(...)` decorator paired with a global `RolesGuard`.
   - Granular authorization permissions for `ADMIN`, `STAFF`, and `STUDENT` roles across all modules.

3. **User Management (Admin Only)**
   - List, query, filter, paginate, update roles, and manage users.

4. **Hierarchical Category Structure**
   - Parent-child nested categories to build a clean asset taxonomy tree.

5. **Device & Asset Tracking**
   - Track peripheral details (serial number, price, status, warranty expiry, customized JSON specifications).
   - Lifecycle states: `AVAILABLE`, `IN_MAINTENANCE`, `DEPLOYED`, `RETIRED`.

6. **Automated Audit Logging**
   - `InventoryLog` automatically audits asset updates, status changes, creations, and deletions. Allows manual logs with administrator remarks.

7. **Notification System**
   - Dispatch alerts to target users or broadcast to all.
   - Users can retrieve their personal alerts and mark notifications as read.

8. **Admin Analytical Dashboard**
   - High-level metrics: Total inventory asset value, asset counts by status, user distribution by roles, total category tree size, and recent logs.

---

## 🚀 Getting Started

### 📋 Prerequisites

- Node.js (v20+ / v22+ recommended)
- PostgreSQL Database instance

### ⚙️ Installation

1. Clone the project and install the dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory and configure the environment variables:

   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
   JWT_SECRET="your_jwt_secret_key"

   # Cloudinary config (optional for file uploads)
   CLOUDINARY_CLOUD_NAME="your_cloud_name"
   CLOUDINARY_API_KEY="your_api_key"
   CLOUDINARY_API_SECRET="your_api_secret"

   # Mail Service API
   RESEND_API_KEY="re_..."
   EMAIL_FROM="noreply@yourdomain.com"
   ```

3. Run Prisma migrations to set up the database schema:
   ```bash
   npx prisma migrate dev
   ```

---

## 🏃 Running the Application

```bash
# Compile and build the project
npm run build

# Start production server
npm run start

# Start in development mode
npm run dev
```

---

## 🧪 Running Tests

To verify the integration and route logic, run the E2E test suite:

```bash
# Run all E2E route tests
npm run test:e2e
```

The test suite contains **27 tests** covering authorization constraints, validation, role restrictions, and mock database flows for all 7 modules.

---

## 📍 API Routes Reference

### Auth Module (`/auth`)

- `POST /auth/register` - Register a new account
- `POST /auth/login` - Authenticate user and receive JWT token
- `GET /auth/verify?token=...` - Confirm email token verification
- `PATCH /auth/profile` - Update profile settings (Cloudinary image upload supported)
- `POST /auth/forgot-password` - Request a password reset link
- `POST /auth/reset-password?token=...` - Reset password using token
- `POST /auth/change-password` - Update password while logged in

### Users Module (`/users`)

- `GET /users/me` - Get current logged-in user profile
- `GET /users` - Get paginated list of all users (_Admin only_)
- `GET /users/:id` - Get specific user details (_Admin only_)
- `POST /users` - Create verified users (_Admin only_)
- `PATCH /users/:id` - Modify user details/roles (_Admin only_)
- `DELETE /users/:id` - Delete user account (_Admin only_)

### Categories Module (`/categories`)

- `GET /categories` - List categories (includes nested tree view option)
- `GET /categories/:id` - Get individual category details
- `POST /categories` - Create a new category (_Admin/STAFF only_)
- `PATCH /categories/:id` - Update category details (_Admin/STAFF only_)
- `DELETE /categories/:id` - Delete a category (_Admin/STAFF only_)

### Devices Module (`/devices`)

- `GET /devices` - Query, filter, and paginate assets
- `GET /devices/:id` - Retrieve individual device details
- `POST /devices` - Register a new device (_Admin/STAFF only_)
- `PATCH /devices/:id` - Update device details/status (_Admin/STAFF only_)
- `DELETE /devices/:id` - Remove device (_Admin/STAFF only_)

### Inventory Logs Module (`/inventory-logs`)

- `GET /inventory-logs` - Query & paginate audit logs (_Admin/STAFF only_)
- `POST /inventory-logs` - Manually record an asset audit log (_Admin/STAFF only_)

### Notifications Module (`/notifications`)

- `GET /notifications` - Retrieve personal alerts
- `PATCH /notifications/read-all` - Mark all notifications as read
- `PATCH /notifications/:id/read` - Mark single notification as read
- `POST /notifications` - Send targeted/broadcast notification alerts (_Admin only_)

### Admin Module (`/admin`)

- `GET /admin/dashboard` - Retrieve analytical dashboard statistics (_Admin only_)
