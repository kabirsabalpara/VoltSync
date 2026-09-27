# Master AI Prompt for VoltSync Project Analysis & Security Audit

> **Instructions for Use**: 
> 1. Open [Gemini](https://gemini.google.com) or [Google AI Studio](https://aistudio.google.com).
> 2. Upload your `voltsync_project.zip` file.
> 3. Copy and paste the entire prompt below into the chat.

---

```markdown
I have attached the complete source code archive of my project, "VoltSync" (an EV Charging Station Finder & Booking System). 

Please act as a Senior Full-Stack Software Engineer and Cybersecurity Specialist. Perform a rigorous, end-to-end evaluation of this entire codebase.

### Project Context:
- **Stack**: React 18 + Vite (Frontend), Node.js + Express (Backend), MongoDB + Mongoose (Database), Leaflet.js (Map), Vanilla CSS.
- **Core Modules**: Station discovery & filtering, Leaflet map view, 5-minute atomic slot reservation lock, simulated payment & booking pass, dual-role access (EV Driver vs. Station Operator), and station operator analytics.

---

### Areas to Audit:

#### 1. Completeness & Functional Flow Assessment
- Is the project functionally complete from an end-to-end user perspective (Search -> Slot Lock -> Payment -> Pass generation)?
- Are there missing flows, half-implemented routes, or dead UI controls?
- Are the database models (`Station`, `Booking`, `User`) sufficient, or are critical fields/indexes missing?
- How does the concurrency lock mechanism hold up against double bookings?

#### 2. Comprehensive Security & Vulnerability Audit
Please perform a deep dive into the backend and frontend security:
- **Authentication & Password Security**: How are passwords stored and compared? Is plain text or hashing used?
- **Session & Token Management**: How are tokens generated, verified, and stored? Are they cryptographically signed (e.g., standard JWT with secret), or are they pseudo-tokens? Is there authentication middleware protecting sensitive routes (`/api/stations` POST/PATCH, booking operations)?
- **Authorization & Role-Based Access Control (RBAC)**: Can a regular driver mutate station hardware statuses or alter prices? Can any user access or cancel another user's bookings?
- **Data Validation & Sanitization**: Is user input validated on the backend? Is the API vulnerable to NoSQL injection or prototype pollution?
- **CORS & Environment Variables**: Are secrets exposed in client-side code? Are CORS origins overly permissive?
- **Race Conditions**: Is the 5-minute lock mechanism truly atomic and resistant to concurrent multi-user spam?

#### 3. Code Quality, Anti-Patterns & Architecture Review
- What anti-patterns or code smells exist in the React components (e.g., memory leaks, redundant state, missing error boundaries, unhandled API rejections)?
- Is error handling on Express routes robust, or do unhandled exceptions risk crashing the server?
- Are MongoDB connections and queries optimized (e.g., proper indexes for geospatial `$near` queries)?

#### 4. Required Changes & Action Plan
Please categorize your findings into:
1. **Critical / High Severity Issues** (Must fix before showing to anyone / going live)
2. **Medium Severity Issues** (Architectural, code health, and maintainability improvements)
3. **Low Severity / Nice-to-Have Enhancements** (UI polish, additional features)

For every issue identified, provide:
- The exact file and function/line where the issue exists.
- Why it is a problem (security risk or functional bug).
- The exact replacement code snippet to fix it.

Please begin with a high-level summary score (out of 100) for both "Completeness" and "Security Readiness", followed by the detailed breakdown.
```
