# 🎬 Oscars Voting

Aplicación web para crear votaciones privadas de los premios Oscar entre grupos de amigos.

Permite crear una sala, definir categorías, compartir links de votación individuales y revelar resultados una vez que la mayoría haya votado.

---

## 🚀 Demo

Producción: https://oscars-voting.vercel.app/

---

## ✨ Funcionalidades principales

- Creación de salas privadas con código único
- Panel de host con control total sobre la votación
- Generación automática de links individuales por participante (sin necesidad de login)
- Configuración flexible de categorías (Big 5, Acting Only, Technical Awards, etc.)
- Bloqueo automático del setup cuando comienza la votación
- Un voto por persona (anti doble voto)
- Reveal protegido: solo se puede revelar cuando al menos la mitad de los miembros votaron
- Visualización de resultados con detección de ganadores
- Dashboard “My Groups” (persistencia local por dispositivo)
- Compartir invitaciones y resultados vía Web Share API o clipboard
- Catálogo oficial de categorías y nominados reales

---

## 🏗️ Stack Tecnológico

- Next.js (App Router)
- TypeScript
- TailwindCSS
- Supabase (PostgreSQL + Auth simple por tokens)
- Vercel (deploy)

---

## 🧠 Decisiones técnicas relevantes

### 🔐 Seguridad básica por tokens
- Cada sala tiene un `admin token` (host)
- Cada invitación tiene un `guest token`
- El backend valida permisos en cada endpoint
- El reveal está protegido por regla de mayoría en servidor

### 🧩 Separación de responsabilidades
- API Routes en `/app/api`
- UI desacoplada de la lógica de validación
- Cálculo de reglas críticas (como `canReveal`) en backend

### ⚙️ Regla de mayoría para revelar resultados
El reveal solo es posible cuando:
voted >= ceil(members / 2)
La validación se realiza tanto en el endpoint `/status` como en `/reveal`.

---

## 📁 Estructura simplificada
- `app/`
- `api/`
- - `api/groups/[code]`: endpoints REST para manejo de salas
- `host/`: gestión de grupos actuales
- - `host/[code]`: Panel del administrador
- - `host/new`: Panel de creación de grupos
- `g/[code]`: Página de votación para invitados
- `r/[code]`: Página de visualización de resultados
- `lib/`

---

## 🧑‍💻 Autor

**Valentín Yedro**
- LinkedIn: https://www.linkedin.com/in/valentin-yedro/
- GitHub: https://github.com/valentinyedro

Proyecto personal orientado a diseño de producto, validación de reglas de negocio en servidor y arquitectura fullstack con Next.js.
