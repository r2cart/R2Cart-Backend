# R2Cart API

Base URL: `/api/v1`. Protected routes require `Authorization: Bearer <access-token>`.

- Auth: `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- Catalogue: `GET /categories`, `GET /products`, `GET /products/:id`, `GET /search`, `GET /banners`
- Customer: `/users/me`, `/addresses`, `/favorites`, `/cart`, `/coupons/validate`, `/checkout`, `/orders`, `/support`
- Admin auth: `POST /admin/auth/login`
- Admin: `/admin/dashboard`, `/admin/products`, `/admin/categories`, `/admin/orders`, `/admin/customers`, `/admin/inventory`, `/admin/coupons`, `/admin/banners`, `/admin/delivery`, `/admin/support`, `/admin/settings`

All responses use `{ success, message, data, meta }`. Validation and application errors use `{ success:false, message, errors }`.
