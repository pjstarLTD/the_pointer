# The Pointer

The public website and editorial dashboard are served from one Node.js/Express app and use MongoDB Atlas for content storage.

## Setup

1. In MongoDB Atlas, create a cluster and a database user with read/write access.
2. In **Network Access**, add your current IP address to the access list.
3. Choose **Connect → Drivers**, copy the Node.js connection string, and replace its username, password and database name as needed.
4. From the project directory, create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Edit `.env` and set `MONGODB_URI` to the Atlas connection string. Set a unique `JWT_SECRET`, the admin email/password, and keep `CLIENT_ORIGIN=http://localhost:3000` for local use. Generate a suitable JWT secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
6. Install dependencies and start the application:

   ```powershell
   npm install
   npm start
   ```

7. Open `http://localhost:3000` for the public website or `http://localhost:3000/admin.html` for the dashboard. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

The server seeds the required categories, sample episodes, and default settings when their collections are empty. Put any supplied local image assets in `public/images/`. Thumbnail image uploads use an unsigned Cloudinary preset configured under **Settings**; without it, paste a thumbnail URL.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Long, unique secret used to sign 8-hour admin tokens |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password (plain secret or bcrypt hash) |
| `PORT` | HTTP port; defaults to `3000` |
| `CLIENT_ORIGIN` | Allowed browser origin; local default is `http://localhost:3000` |

## API

Public endpoints are `GET /api/episodes`, `GET /api/categories`, `GET /api/settings`, `POST /api/contact`, and `POST /api/newsletter`. Admin endpoints under `/api/admin` require a JWT returned by `POST /api/auth/login` and include episode, category, settings, message, and subscriber management.

The API validates all submitted video URLs as HTTP(S) links. Pasted iframe markup is accepted only after extracting and validating its HTTP(S) `src`. The shared browser helper is `public/js/media.js`.
