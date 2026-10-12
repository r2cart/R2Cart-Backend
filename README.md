# R2Cart Backend

## Cloudinary product images

In Cloudinary Console → Settings → API Keys, copy your Cloud name, API key and API secret into the backend `.env`:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Restart the backend after changing these values. Keep the secret out of the frontend and version control. No unsigned upload preset is required.

Admin Products → Add/Edit product → Choose from device accepts JPG, PNG and WebP up to 5 MB. Images upload through the authenticated admin endpoint directly to `R2Cart/Categories/<category-slug>` in Cloudinary Assets (dynamic folders). The selected category is checked against MySQL before uploading; for example, Snacks images go to `R2Cart/Categories/snacks`. Saving the product stores the returned HTTPS image URL in MySQL; customer cards use this URL. Existing assets are not moved, and changing a category without uploading a new image does not move its old asset. Image URL input is unchanged. Banner/logo uploads remain local. Deleting a product does not delete its Cloudinary asset, so historical order images remain available.

MySQL REST API for the R2Cart customer website and admin panel.

## Setup

1. Create MySQL database: `CREATE DATABASE grocify CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Copy `.env.example` to `.env` and set the MySQL password plus JWT secrets.
3. Run `npm install`.
4. Run `npm run db:generate`.
5. Run `npm run db:migrate -- --name init`.
6. Run `npm run db:seed`.
7. Run `npm run dev`.

API base URL: `http://localhost:5000/api/v1`. Health check: `GET /api/v1/health`.

Development OTP is returned by `POST /api/v1/auth/request-otp` only when `EXPOSE_DEV_OTP=true`. Seed admin: `admin@r2cart.in` / `admin123`.
