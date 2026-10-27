# DiabetesCare

A web application for diabetic patients to track their daily health routine, monitor blood glucose levels, and receive personalised recommendations.

## Features

- User authentication (Sign up / Sign in)
- Daily health logging — glucose, meals, activity, meditation, stress
- Personalised clinical recommendations based on glucose levels
- PDF health report download
- Built-in health assistant chatbot
- Bilingual support — English and Tamil

## Tech Stack

| Layer     | Technology                    |
|-----------|-------------------------------|
| Backend   | Node.js, Express.js v4        |
| Database  | MongoDB + Mongoose            |
| Auth      | bcryptjs, express-session     |
| Frontend  | EJS, CSS, Font Awesome        |
| PDF       | PDFKit                        |

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or above
- [MongoDB](https://www.mongodb.com/) running locally on port `27017`

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Deepika-cse-17/diabetes-management.git
cd diabetes-management
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start MongoDB

```bash
mongod
```

### 4. Start the server

```bash
node server.js
```

### 5. Open in browser

```
http://localhost:3000
```

## Project Structure

```
diabetes-management/
├── models/
│   ├── Routine.js        # Daily health log schema
│   └── User.js           # User account schema
├── public/
│   ├── style.css         # Main app styles
│   └── auth.css          # Login / Signup styles
├── views/
│   ├── login.ejs         # Sign in page
│   ├── signup.ejs        # Create account page
│   ├── index.ejs         # Daily log form
│   └── dashboard.ejs     # Analysis & recommendations
├── server.js             # Express app & all routes
└── package.json
```

## API Routes

| Method | Route           | Description                        |
|--------|-----------------|------------------------------------|
| GET    | `/login`        | Login page                         |
| POST   | `/login`        | Authenticate user                  |
| GET    | `/signup`       | Signup page                        |
| POST   | `/signup`       | Create new account                 |
| GET    | `/logout`       | Destroy session and redirect       |
| GET    | `/`             | Daily health log form (protected)  |
| POST   | `/submit`       | Save log and show recommendations  |
| GET    | `/records`      | View all records as JSON           |
| GET    | `/download-pdf` | Download PDF health report         |
| POST   | `/chatbot`      | Health assistant chatbot           |
