# 🎬 Oscars Voting

Private Oscars voting system for groups of friends.

Create a room, generate invite links, vote once per person, and reveal results together.

---

## 🚀 Tech Stack

- **Next.js (App Router)**
- **Supabase (PostgreSQL)**
- **Tailwind CSS**
- TypeScript

---

## ✨ Features

- Create private voting groups
- Host admin panel with secure admin token
- Unique invite links per participant
- One vote per person
- Max members limit enforced at database level
- Admin token persistence via localStorage

---

## 🧠 Architecture

- PostgreSQL relational schema
- Strict constraints to enforce:
  - One ballot per invite
  - One vote per category
  - Max members per group
- Admin access via secure token (no authentication system)

---

## 🛠 Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open your browser at:

http://localhost:3000
