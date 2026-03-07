# Backend (Render)

Node/Express API for Your Bags Kampala.

## Environment Variables

Required:

- `MONGO_URI` = MongoDB connection string

Recommended:

- `FRONTEND_ORIGIN` = your Vercel URL(s), comma-separated if multiple
  - Example: `https://your-bags-frontend.vercel.app`
- `PORT` = `3000` (Render sets this automatically)

## Local Run

```bash
npm install
npm start
```

Health check:

- `GET /api/health`

## Deploy to Render

1. Push this folder to its own repo (`your-bags-backend`).
2. Create Render Web Service from that repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars above.

## Important storage note

Uploaded files are saved to `backend/images`. On most Render plans, local disk is ephemeral.
For durable images in production, use persistent disk or cloud storage (Cloudinary/S3).
